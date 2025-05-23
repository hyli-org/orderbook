use std::sync::Arc;

use anyhow::Result;
use axum::{
    extract::{Json, State},
    http::Method,
    response::IntoResponse,
    routing::get,
    Router,
};
use client_sdk::rest_client::NodeApiHttpClient;
use client_sdk::transaction_builder::TxExecutorHandler;
use hyle_modules::{
    bus::{BusClientSender, SharedMessageBus},
    module_bus_client, module_handle_messages,
    modules::{
        prover::AutoProverEvent,
        websocket::{WsInMessage, WsTopicMessage},
        BuildApiContextInner, Module,
    },
};
use orderbook::{Orderbook, OrderbookEvent};
use sdk::{
    Calldata, ContractName, Hashed, LaneId, MempoolStatusEvent, TransactionData, TxContext,
    ValidatorPublicKey,
};
use serde::{Deserialize, Serialize};
use tower_http::cors::{Any, CorsLayer};

pub struct OrderbookModule {
    bus: OrderbookModuleBusClient,
    orderbook_cn: ContractName,
    orderbook: Orderbook,
    validator_lane_id: ValidatorPublicKey,
}

pub struct OrderbookModuleCtx {
    pub api: Arc<BuildApiContextInner>,
    pub node_client: Arc<NodeApiHttpClient>,
    pub orderbook_cn: ContractName,
    pub validator_lane_id: ValidatorPublicKey,
}

/// Messages received from WebSocket clients that will be processed by the system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderbookWsInMessage();

module_bus_client! {
#[derive(Debug)]
pub struct OrderbookModuleBusClient {
    sender(WsTopicMessage<OrderbookEvent>),
    receiver(WsInMessage<OrderbookWsInMessage>),
    receiver(AutoProverEvent<Orderbook>),
    receiver(MempoolStatusEvent),
}
}

impl Module for OrderbookModule {
    type Context = Arc<OrderbookModuleCtx>;

    async fn build(bus: SharedMessageBus, ctx: Self::Context) -> Result<Self> {
        let state = RouterCtx {
            orderbook_cn: ctx.orderbook_cn.clone(),
        };

        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(vec![Method::GET, Method::POST])
            .allow_headers(Any);

        let api = Router::new()
            .route("/_health", get(health))
            .route("/api/config", get(get_config))
            .with_state(state)
            .layer(cors);

        if let Ok(mut guard) = ctx.api.router.lock() {
            if let Some(router) = guard.take() {
                guard.replace(router.merge(api));
            }
        }
        let bus = OrderbookModuleBusClient::new_from_bus(bus.new_handle()).await;

        let orderbook = Orderbook::default();

        Ok(OrderbookModule {
            bus,
            orderbook,
            orderbook_cn: ctx.orderbook_cn.clone(),
            validator_lane_id: ctx.validator_lane_id.clone(),
        })
    }

    async fn run(&mut self) -> Result<()> {
        module_handle_messages! {
            on_bus self.bus,
            // listen<WsInMessage<OrderbookWsInMessage>> msg => {
            //     self.handle_ws_message(msg).await?;
            // }
            listen<MempoolStatusEvent> event => {
                self.handle_mempool_status_event(event).await?;
            }
        };

        Ok(())
    }
}

impl OrderbookModule {
    async fn handle_mempool_status_event(&mut self, event: MempoolStatusEvent) -> Result<()> {
        match event {
            MempoolStatusEvent::WaitingDissemination { tx, .. } => {
                let tx_ctx = Some(TxContext {
                    lane_id: LaneId(self.validator_lane_id.clone()),
                    ..Default::default()
                });
                let initial_state = self.orderbook.clone();
                let mut events = vec![];
                if let TransactionData::Blob(blob_tx) = tx.transaction_data {
                    for (blob_index, blob) in blob_tx.blobs.iter().enumerate() {
                        // FIXME: we must do more checks to see if the tx will eventually settle

                        // Filter out blobs that are not for the orderbook contract
                        if blob.contract_name == self.orderbook_cn {
                            let calldata = Calldata {
                                identity: blob_tx.identity.clone(),
                                tx_hash: blob_tx.hashed(),
                                private_input: vec![],
                                blobs: blob_tx.blobs.clone().into(),
                                index: blob_index.into(),
                                tx_ctx: tx_ctx.clone(),
                                tx_blob_count: blob_tx.blobs.len(),
                            };
                            // Execute the blob
                            match self.orderbook.handle(&calldata) {
                                Err(e) => {
                                    // Transaction is invalid, we need to revert the state
                                    self.orderbook = initial_state;
                                    tracing::error!("Error while executing contract: {e}");
                                    return Ok(());
                                }
                                Ok(hyle_output) => {
                                    let evts: Vec<OrderbookEvent> =
                                        borsh::from_slice(&hyle_output.program_outputs)?;
                                    for event in evts {
                                        events.push(event);
                                    }
                                }
                            }
                        }
                    }
                }

                // Send events to all clients
                for event in events {
                    let event_clone = event.clone();
                    match &event {
                        OrderbookEvent::BalanceUpdated { user, .. } => {
                            self.bus.send(WsTopicMessage {
                                topic: user.0.clone(),
                                message: event_clone,
                            })?;
                        }
                        _ => {
                            self.bus.send(WsTopicMessage {
                                topic: "orderbook".to_string(),
                                message: event_clone,
                            })?;
                        }
                    }
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }
}

#[derive(Clone)]
struct RouterCtx {
    pub orderbook_cn: ContractName,
}

async fn health() -> impl IntoResponse {
    Json("OK")
}

#[derive(Serialize)]
struct ConfigResponse {
    contract_name: String,
}

// --------------------------------------------------------
//     Routes
// --------------------------------------------------------

async fn get_config(State(ctx): State<RouterCtx>) -> impl IntoResponse {
    Json(ConfigResponse {
        contract_name: ctx.orderbook_cn.0,
    })
}
