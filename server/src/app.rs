use std::sync::Arc;

use anyhow::Result;
use axum::{
    extract::{Json, State},
    http::Method,
    response::IntoResponse,
    routing::get,
    Router,
};
use hyle_modules::{
    bus::{BusClientSender, SharedMessageBus},
    module_bus_client, module_handle_messages,
    modules::{
        websocket::{WsInMessage, WsTopicMessage},
        BuildApiContextInner, Module,
    },
};
use orderbook::{Orderbook, OrderbookEvent};
use sdk::{ContractName, Hashed};
use serde::{Deserialize, Serialize};
use tower_http::cors::{Any, CorsLayer};
use tracing::debug;

use crate::rollup_executor::RollupExecutorEvent;

pub struct OrderbookModule {
    bus: OrderbookModuleBusClient,
}

pub struct OrderbookModuleCtx {
    pub api: Arc<BuildApiContextInner>,
    pub orderbook_cn: ContractName,
}

/// Messages received from WebSocket clients that will be processed by the system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderbookWsInMessage();

module_bus_client! {
#[derive(Debug)]
pub struct OrderbookModuleBusClient {
    sender(WsTopicMessage<OrderbookEvent>),
    sender(WsTopicMessage<String>),
    receiver(WsInMessage<OrderbookWsInMessage>),
    receiver(RollupExecutorEvent<Orderbook>),
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

            listen<RollupExecutorEvent<Orderbook>> event => {
                self.handle_rollup_executor_event(event).await?;
            }

        };

        Ok(())
    }
}

impl OrderbookModule {
    async fn handle_rollup_executor_event(
        &mut self,
        event: RollupExecutorEvent<Orderbook>,
    ) -> Result<()> {
        match event {
            RollupExecutorEvent::TxExecutionSuccess(blob_tx, _, hyle_outputs) => {
                let mut events = vec![];
                for hyle_output in hyle_outputs {
                    if !hyle_output.success {
                        debug!(
                            "One of HyleOutput's of tx {} was not successful: {:?}",
                            blob_tx.hashed(),
                            String::from_utf8_lossy(&hyle_output.program_outputs)
                        );
                        self.bus.send(WsTopicMessage {
                            topic: blob_tx.identity.to_string(),
                            message: format!(
                                "Transaction failed: {}",
                                String::from_utf8_lossy(&hyle_output.program_outputs)
                            ),
                        })?;
                        continue;
                    }
                    let evts: Vec<OrderbookEvent> = borsh::from_slice(&hyle_output.program_outputs)
                        .expect("output comes from contract, should always be valid");

                    for event in evts {
                        events.push(event);
                    }
                }

                // Send events to all clients
                for event in events {
                    let event_clone = event.clone();
                    match &event {
                        OrderbookEvent::BalanceUpdated { user, .. } => {
                            self.bus.send(WsTopicMessage {
                                topic: user.clone(),
                                message: event_clone,
                            })?;
                        }
                        OrderbookEvent::OrderCancelled { pair, .. }
                        | OrderbookEvent::OrderExecuted { pair, .. }
                        | OrderbookEvent::OrderUpdate { pair, .. } => {
                            let pair = format!("{}-{}", pair.0, pair.1);
                            self.bus.send(WsTopicMessage {
                                topic: pair,
                                message: event_clone,
                            })?;
                        }
                        OrderbookEvent::OrderCreated { order } => {
                            let pair = format!("{}-{}", order.pair.0, order.pair.1);
                            self.bus.send(WsTopicMessage {
                                topic: pair,
                                message: event_clone,
                            })?;
                        }
                    }
                }
                Ok(())
            }
            RollupExecutorEvent::RevertedTx(_, _) => {
                todo!("Handle reverted transactions");
            }
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
