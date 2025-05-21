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
use orderbook::{Orderbook, OrderbookAction};

use hyle_modules::{
    bus::{BusClientSender, SharedMessageBus},
    module_bus_client, module_handle_messages,
    modules::{
        prover::AutoProverEvent,
        websocket::{WsInMessage, WsTopicMessage},
        BuildApiContextInner, Module,
    },
};
use sdk::{Blob, ContractName, MempoolStatusEvent};
use serde::{Deserialize, Serialize};
use tower_http::cors::{Any, CorsLayer};

pub struct OrderbookModule {
    bus: OrderbookModuleBusClient,
}
pub struct OrderbookModuleCtx {
    pub api: Arc<BuildApiContextInner>,
    pub node_client: Arc<NodeApiHttpClient>,
    pub orderbook_cn: ContractName,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityBlobs([Blob; 2]);

/// Messages received from WebSocket clients that will be processed by the system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderbookWsInMessage((OrderbookAction, IdentityBlobs));

/// Messages sent to WebSocket clients from the system
#[derive(Debug, Clone, Serialize)]
pub enum OrderbookOutWsEvent {
    #[allow(dead_code)]
    OrderBookEvent {},
}

module_bus_client! {
#[derive(Debug)]
pub struct OrderbookModuleBusClient {
    sender(WsTopicMessage<OrderbookOutWsEvent>),
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

        Ok(OrderbookModule { bus })
    }

    async fn run(&mut self) -> Result<()> {
        module_handle_messages! {
            on_bus self.bus,
            listen<WsInMessage<OrderbookWsInMessage>> msg => {
                self.handle_ws_message(msg).await?;
            }
            listen<MempoolStatusEvent> event => {
                self.handle_mempool_status_event(event).await?;
            }
        };

        Ok(())
    }
}

impl OrderbookModule {
    async fn handle_ws_message(&mut self, msg: WsInMessage<OrderbookWsInMessage>) -> Result<()> {
        // Quand on recoit un msg:
        // 1) on vérifie qu'il est correct (signature + montant)
        // 2) on craft la blobtransaction
        // 3) on broadcast la blobtransaction
        Ok(())
    }

    async fn handle_mempool_status_event(&mut self, event: MempoolStatusEvent) -> Result<()> {
        match event {
            MempoolStatusEvent::WaitingDissemination { tx, .. } => {
                // TODO: On check si la transaction est bien pour le bon contract
                // TODO: On check si la transaction est valide (va s'executer + est provable)
                // TODO: envoyer les WsTopicMessage<OrderbookOutWsEvent> à chaque orderbook event
                self.bus.send(WsTopicMessage {
                    topic: "orderbook".to_string(),
                    message: OrderbookOutWsEvent::OrderBookEvent {},
                })?;
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
