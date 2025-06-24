use anyhow::{Context, Result};
use axum::Router;
use clap::Parser;
use client_sdk::rest_client::{IndexerApiHttpClient, NodeApiClient, NodeApiHttpClient};
use contracts::ORDERBOOK_ELF;
use hyle_modules::{
    bus::{metrics::BusMetrics, SharedMessageBus},
    modules::{
        contract_state_indexer::{ContractStateIndexer, ContractStateIndexerCtx},
        da_listener::{DAListener, DAListenerConf},
        prover::{AutoProver, AutoProverCtx},
        rest::{RestApi, RestApiRunContext},
        websocket::WebSocketModule,
        BuildApiContextInner, ModulesHandler,
    },
    utils::logger::setup_tracing,
};
use orderbook::{Orderbook, OrderbookEvent};
use prometheus::Registry;
use sdk::{api::NodeInfo, info, ContractName, ZkContract};
use secp256k1::PublicKey;
use secp256k1::Secp256k1;
use secp256k1::SecretKey;
use server::conf::Conf;
use server::init;
use server::rollup_executor::{RollupExecutor, RollupExecutorCtx};
use server::{
    app::{OrderbookModule, OrderbookModuleCtx, OrderbookWsInMessage},
    rollup_executor::ContractBox,
};
use sp1_sdk::{Prover, ProverClient};
use std::env;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{Arc, Mutex},
};
use tracing::error;
use wallet::client::tx_executor_handler::Wallet;
use wallet::client::tx_executor_handler::WalletConstructor;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
pub struct Args {
    #[arg(long, default_value = "config.toml")]
    pub config_file: Vec<String>,

    #[arg(long, default_value = "orderbook")]
    pub orderbook_cn: String,

    #[arg(long, default_value = "wallet")]
    pub wallet_cn: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let config = Conf::new(args.config_file).context("reading config file")?;

    setup_tracing(
        &config.log_format,
        format!("{}(nopkey)", config.id.clone(),),
    )
    .context("setting up tracing")?;

    let config = Arc::new(config);

    info!("Starting orderbook with config: {:?}", &config);

    let node_client =
        Arc::new(NodeApiHttpClient::new(config.node_url.clone()).context("build node client")?);
    let indexer_client = Arc::new(
        IndexerApiHttpClient::new(config.indexer_url.clone()).context("build indexer client")?,
    );

    let local_client = ProverClient::builder().cpu().build();
    let (pk, _) = local_client.setup(ORDERBOOK_ELF);

    info!("Building Proving Key");
    let prover = client_sdk::helpers::sp1::SP1Prover::new(pk).await;

    let validator_lane_id = node_client
        .get_node_info()
        .await?
        .pubkey
        .map(sdk::LaneId)
        .ok_or_else(|| {
            error!("Validator lane id not found");
        })
        .ok();
    let Some(validator_lane_id) = validator_lane_id else {
        return Ok(());
    };

    let default_state = Orderbook::init(validator_lane_id.clone());

    let contracts = vec![init::ContractInit {
        name: args.orderbook_cn.clone().into(),
        program_id: prover.program_id().expect("getting program id").0,
        initial_state: default_state.commit(),
    }];

    match init::init_node(node_client.clone(), indexer_client.clone(), contracts).await {
        Ok(_) => {}
        Err(e) => {
            error!("Error initializing node: {:?}", e);
            return Ok(());
        }
    }
    let bus = SharedMessageBus::new(BusMetrics::global(config.id.clone()));

    std::fs::create_dir_all(&config.data_directory).context("creating data directory")?;

    let mut handler = ModulesHandler::new(&bus).await;

    let api_ctx = Arc::new(BuildApiContextInner {
        router: Mutex::new(Some(Router::new())),
        openapi: Default::default(),
    });

    let orderbook_ctx = Arc::new(OrderbookModuleCtx {
        api: api_ctx.clone(),
        orderbook_cn: args.orderbook_cn.clone().into(),
        default_state: default_state.clone(),
    });

    let secp = Secp256k1::new();
    let secret_key =
        hex::decode(env::var("INVITE_CODE_PKEY").unwrap_or(
            "0000000000000001000000000000000100000000000000010000000000000001".to_string(),
        ))
        .expect("INVITE_CODE_PKEY must be a hex string");
    let secret_key = SecretKey::from_slice(&secret_key).expect("32 bytes, within curve order");
    let public_key = PublicKey::from_secret_key(&secp, &secret_key);

    let hyli_password = env::var("HYLI_PASSWORD").unwrap_or("hylisecure".to_string());
    let wallet_constructor = WalletConstructor::new(hyli_password, public_key.serialize());
    let wallet = Wallet::new(&Some(wallet_constructor.clone())).expect("must succeed");

    handler
        .build_module::<OrderbookModule>(orderbook_ctx.clone())
        .await?;

    let initial_contracts = BTreeMap::from([
        (
            args.orderbook_cn.clone().into(),
            ContractBox::new(default_state.clone()),
        ),
        (args.wallet_cn.clone().into(), ContractBox::new(wallet)),
    ]);

    handler
        .build_module::<RollupExecutor>(RollupExecutorCtx {
            data_directory: config.data_directory.clone(),
            initial_contracts,
            validator_lane_id,
            watched_contracts: BTreeSet::from([args.orderbook_cn.clone().into()]),
            contract_deserializer: |state: Vec<u8>, contract_name: &ContractName| {
                match contract_name.0.as_str() {
                    "orderbook" => ContractBox::new(
                        borsh::from_slice::<Orderbook>(&state)
                            .expect("Deserializing orderbook state"),
                    ),
                    "wallet" => ContractBox::new(
                        borsh::from_slice::<Wallet>(&state).expect("Deserializing orderbook state"),
                    ),
                    _ => panic!("Unknown contract name: {}", contract_name.0),
                }
            },
        })
        .await?;

    handler
        .build_module::<WebSocketModule<OrderbookWsInMessage, OrderbookEvent>>(
            config.websocket.clone(),
        )
        .await?;

    handler
        .build_module::<ContractStateIndexer<Orderbook>>(ContractStateIndexerCtx {
            contract_name: args.orderbook_cn.clone().into(),
            data_directory: config.data_directory.clone(),
            api: api_ctx.clone(),
        })
        .await?;

    handler
        .build_module::<AutoProver<Orderbook>>(Arc::new(AutoProverCtx {
            data_directory: config.data_directory.clone(),
            prover: Arc::new(prover),
            contract_name: args.orderbook_cn.clone().into(),
            node: node_client.clone(),
            default_state,
            buffer_blocks: config.buffer_blocks,
            max_txs_per_proof: config.max_txs_per_proof,
            tx_working_window_size: config.tx_working_window_size,
            api: Some(api_ctx.clone()),
        }))
        .await?;

    // This module connects to the da_address and receives all the blocks²
    handler
        .build_module::<DAListener>(DAListenerConf {
            start_block: None,
            data_directory: config.data_directory.clone(),
            da_read_from: config.da_read_from.clone(),
        })
        .await?;

    // Should come last so the other modules have nested their own routes.
    #[allow(clippy::expect_used, reason = "Fail on misconfiguration")]
    let router = api_ctx
        .router
        .lock()
        .expect("Context router should be available.")
        .take()
        .expect("Context router should be available.");
    #[allow(clippy::expect_used, reason = "Fail on misconfiguration")]
    let openapi = api_ctx
        .openapi
        .lock()
        .expect("OpenAPI should be available")
        .clone();

    handler
        .build_module::<RestApi>(RestApiRunContext {
            port: config.rest_server_port,
            max_body_size: config.rest_server_max_body_size,
            registry: Registry::new(),
            router,
            openapi,
            info: NodeInfo {
                id: config.id.clone(),
                da_address: config.da_read_from.clone(),
                pubkey: None,
            },
        })
        .await?;

    #[cfg(unix)]
    {
        use tokio::signal::unix;
        let mut terminate = unix::signal(unix::SignalKind::interrupt())?;
        tokio::select! {
            Err(e) = handler.start_modules() => {
                error!("Error running modules: {:?}", e);
            }
            _ = tokio::signal::ctrl_c() => {
                info!("Ctrl-C received, shutting down");
            }
            _ = terminate.recv() =>  {
                info!("SIGTERM received, shutting down");
            }
        }
        _ = handler.shutdown_modules().await;
    }
    #[cfg(not(unix))]
    {
        tokio::select! {
            Err(e) = handler.start_modules() => {
                error!("Error running modules: {:?}", e);
            }
            _ = tokio::signal::ctrl_c() => {
                info!("Ctrl-C received, shutting down");
            }
        }
        _ = handler.shutdown_modules().await;
    }

    Ok(())
}
