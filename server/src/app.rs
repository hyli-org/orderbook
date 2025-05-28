use std::{collections::HashMap, sync::Arc};

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
    log_warn, module_bus_client, module_handle_messages,
    modules::{
        websocket::{WsInMessage, WsTopicMessage},
        BuildApiContextInner, Module,
    },
};
use orderbook::{Orderbook, OrderbookEvent};
use sdk::{hyle_model_utils::TimestampMs, ContractName, Hashed};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tracing::debug;

use crate::rollup_executor::RollupExecutorEvent;

pub struct OrderbookModule {
    bus: OrderbookModuleBusClient,
    orderbook_cn: ContractName,
    contract: Arc<RwLock<Orderbook>>,
}

pub struct OrderbookModuleCtx {
    pub api: Arc<BuildApiContextInner>,
    pub orderbook_cn: ContractName,
    pub default_state: Orderbook,
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
    receiver(RollupExecutorEvent),
}
}

impl Module for OrderbookModule {
    type Context = Arc<OrderbookModuleCtx>;

    async fn build(bus: SharedMessageBus, ctx: Self::Context) -> Result<Self> {
        let contract = Arc::new(RwLock::new(ctx.default_state.clone()));

        let state = RouterCtx {
            orderbook_cn: ctx.orderbook_cn.clone(),
            contract: contract.clone(),
        };

        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(vec![Method::GET, Method::POST])
            .allow_headers(Any);

        let api = Router::new()
            .route("/_health", get(health))
            .route("/api/config", get(get_config))
            .route("/api/optimistic/state", get(get_state))
            .route("/api/optimistic/balances", get(get_balances))
            .route(
                "/api/optimistic/balances/{account}",
                get(get_balance_for_account),
            )
            .route("/api/optimistic/orders", get(get_orders))
            .route(
                "/api/optimistic/orders/pair/{base_token}/{quote_token}",
                get(get_orders_by_pair),
            )
            .route(
                "/api/optimistic/orders/user/{address}",
                get(get_orders_by_user),
            )
            .route(
                "/api/optimistic/orders/history/{base_token}/{quote_token}",
                get(get_pair_history),
            )
            .route(
                "/api/optimistic/orders/candles/{base_token}/{quote_token}",
                get(get_pair_candles),
            )
            .with_state(state)
            .layer(cors);

        if let Ok(mut guard) = ctx.api.router.lock() {
            if let Some(router) = guard.take() {
                guard.replace(router.merge(api));
            }
        }
        let bus = OrderbookModuleBusClient::new_from_bus(bus.new_handle()).await;

        Ok(OrderbookModule {
            bus,
            contract,
            orderbook_cn: ctx.orderbook_cn.clone(),
        })
    }

    async fn run(&mut self) -> Result<()> {
        module_handle_messages! {
            on_bus self.bus,

            listen<RollupExecutorEvent> event => {
                self.handle_rollup_executor_event(event).await?;
            }

        };

        Ok(())
    }
}

impl OrderbookModule {
    async fn handle_rollup_executor_event(&mut self, event: RollupExecutorEvent) -> Result<()> {
        match event {
            RollupExecutorEvent::TxExecutionSuccess(blob_tx, contracts, hyle_outputs) => {
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

                // Update contract state for optimistic RestAPI
                {
                    if let Some(orderbook_contract) = contracts
                        .iter()
                        .find(|(contract_name, _)| contract_name == &self.orderbook_cn)
                        .map(|(_, state)| state.clone())
                        .expect("Orderbook contract not found")
                        .downcast::<Orderbook>()
                    {
                        let mut contract_guard = self.contract.write().await;
                        *contract_guard = orderbook_contract.clone();
                    }
                }

                // Send events to all clients
                for event in events {
                    let event_clone = event.clone();
                    match &event {
                        OrderbookEvent::BalanceUpdated { user, .. } => {
                            _ = log_warn!(
                                self.bus.send(WsTopicMessage {
                                    topic: user.clone(),
                                    message: event_clone,
                                }),
                                "Failed to send balance update"
                            );
                        }
                        OrderbookEvent::OrderCancelled { pair, .. }
                        | OrderbookEvent::OrderExecuted { pair, .. }
                        | OrderbookEvent::OrderUpdate { pair, .. } => {
                            let pair = format!("{}-{}", pair.0, pair.1);
                            _ = log_warn!(
                                self.bus.send(WsTopicMessage {
                                    topic: pair,
                                    message: event_clone,
                                }),
                                "Failed to send order event"
                            );
                        }
                        OrderbookEvent::OrderCreated { order } => {
                            let pair = format!("{}-{}", order.pair.0, order.pair.1);
                            _ = log_warn!(
                                self.bus.send(WsTopicMessage {
                                    topic: pair,
                                    message: event_clone,
                                }),
                                "Failed to send order created event"
                            );
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
    pub contract: Arc<RwLock<Orderbook>>,
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

async fn get_state(State(ctx): State<RouterCtx>) -> impl IntoResponse {
    let contract = ctx.contract.read().await;
    Json(contract.get_state())
}

async fn get_balances(State(ctx): State<RouterCtx>) -> impl IntoResponse {
    let contract = ctx.contract.read().await;
    Json(contract.get_balances())
}

async fn get_balance_for_account(
    State(ctx): State<RouterCtx>,
    axum::extract::Path(account): axum::extract::Path<String>,
) -> impl IntoResponse {
    let contract = ctx.contract.read().await;
    let balance = contract.get_balance_for_account(&account);
    Json(balance)
}

async fn get_orders(State(ctx): State<RouterCtx>) -> impl IntoResponse {
    let contract = ctx.contract.read().await;
    Json(contract.get_orders())
}

async fn get_orders_by_pair(
    State(ctx): State<RouterCtx>,
    axum::extract::Path((base_token, quote_token)): axum::extract::Path<(String, String)>,
) -> impl IntoResponse {
    let contract = ctx.contract.read().await;
    let orders = contract.get_orders_by_pair(&base_token, &quote_token);
    Json(orders)
}

async fn get_orders_by_user(
    State(ctx): State<RouterCtx>,
    axum::extract::Path(address): axum::extract::Path<String>,
) -> impl IntoResponse {
    let contract = ctx.contract.read().await;
    let orders = contract.get_orders_by_user(&address);
    Json(orders)
}

async fn get_pair_history(
    State(ctx): State<RouterCtx>,
    axum::extract::Path((base_token, quote_token)): axum::extract::Path<(String, String)>,
) -> impl IntoResponse {
    let contract = ctx.contract.read().await;
    let history = contract.get_pair_history(&base_token, &quote_token);
    Json(history)
}

async fn get_pair_candles(
    State(ctx): State<RouterCtx>,
    axum::extract::Path((base_token, quote_token)): axum::extract::Path<(String, String)>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let contract = ctx.contract.read().await;

    let from = params
        .get("from")
        .and_then(|s| s.parse::<i64>().ok())
        .map(|ts| TimestampMs(ts as u128))
        .unwrap_or(TimestampMs(0));

    let to = params
        .get("to")
        .and_then(|s| s.parse::<i64>().ok())
        .map(|ts| TimestampMs(ts as u128))
        .unwrap_or(TimestampMs(u128::MAX));

    let interval = params
        .get("interval")
        .and_then(|s| s.parse::<i64>().ok())
        .map(|i| i as u128)
        .unwrap_or(3600000); // 1 hour by default

    let candles = contract.get_pair_candles(&base_token, &quote_token, from, to, interval);
    Json(candles)
}
