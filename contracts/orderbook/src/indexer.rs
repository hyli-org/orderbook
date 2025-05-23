use std::str;

use anyhow::{anyhow, Result};
use client_sdk::contract_indexer::{
    axum::{extract::State, http::StatusCode, response::IntoResponse, Json, Router},
    utoipa::openapi::OpenApi,
    utoipa_axum::{router::OpenApiRouter, routes},
    AppError, ContractHandler, ContractHandlerStore,
};
use serde::Serialize;

use crate::*;
use client_sdk::contract_indexer::axum;
use client_sdk::contract_indexer::utoipa;

impl ContractHandler for Orderbook {
    async fn api(store: ContractHandlerStore<Orderbook>) -> (Router<()>, OpenApi) {
        let (router, api) = OpenApiRouter::default()
            .routes(routes!(get_balances))
            .routes(routes!(get_balance_for_account))
            .routes(routes!(get_orders))
            .routes(routes!(get_orders_by_pair))
            .routes(routes!(get_orders_by_user))
            .split_for_parts();

        (router.with_state(store), api)
    }
}

#[utoipa::path(
    get,
    path = "/balances",
    tag = "Contract",
    responses(
        (status = OK, description = "Get json balances of contract")
    )
)]
pub async fn get_balances(
    State(state): State<ContractHandlerStore<Orderbook>>,
) -> Result<impl IntoResponse, AppError> {
    let store = state.read().await;
    store
        .state
        .as_ref()
        .map(|state| Json(state.balances.clone()))
        .ok_or(AppError(
            StatusCode::NOT_FOUND,
            anyhow!("No state found for contract '{}'", store.contract_name),
        ))
}

#[utoipa::path(
    get,
    path = "/balances/{account}",
    tag = "Contract",
    params(
        ("account" = String, Path, description = "Account address to fetch balance for")
    ),
    responses(
        (status = OK, description = "Get json balance of a specific account")
    )
)]
pub async fn get_balance_for_account(
    State(state): State<ContractHandlerStore<Orderbook>>,
    axum::extract::Path(account): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let store = state.read().await;
    store
        .state
        .as_ref()
        .and_then(|state| state.balances.get(&account).cloned())
        .map(Json)
        .ok_or(AppError(
            StatusCode::NOT_FOUND,
            anyhow!(
                "No balance found for account '{}' in contract '{}'",
                account,
                store.contract_name
            ),
        ))
}

#[utoipa::path(
    get,
    path = "/orders",
    tag = "Contract",
    responses(
        (status = OK, description = "Get json state of contract")
    )
)]
pub async fn get_orders(
    State(state): State<ContractHandlerStore<Orderbook>>,
) -> Result<impl IntoResponse, AppError> {
    let store = state.read().await;
    store
        .state
        .as_ref()
        .map(|state| Json(state.orders.clone()))
        .ok_or(AppError(
            StatusCode::NOT_FOUND,
            anyhow!("No state found for contract '{}'", store.contract_name),
        ))
}

#[derive(Serialize)]
struct PairOrders {
    buy_orders: Vec<Order>,
    sell_orders: Vec<Order>,
}

#[utoipa::path(
    get,
    path = "/orders/pair/{base_token}/{quote_token}",
    tag = "Contract",
    params(
        ("base_token" = String, Path, description = "Base token of the pair"),
        ("quote_token" = String, Path, description = "Quote token of the pair")
    ),
    responses(
        (status = OK, description = "Get all orders for a specific token pair")
    )
)]
pub async fn get_orders_by_pair(
    State(state): State<ContractHandlerStore<Orderbook>>,
    axum::extract::Path((base_token, quote_token)): axum::extract::Path<(String, String)>,
) -> Result<impl IntoResponse, AppError> {
    let store = state.read().await;
    let pair = (base_token.clone(), quote_token.clone());

    store
        .state
        .as_ref()
        .map(|state| {
            let buy_orders: Vec<_> = state
                .buy_orders
                .get(&pair)
                .map(|ids| {
                    ids.iter()
                        .filter_map(|id| state.orders.get(id))
                        .cloned()
                        .collect()
                })
                .unwrap_or_default();

            let sell_orders: Vec<_> = state
                .sell_orders
                .get(&pair)
                .map(|ids| {
                    ids.iter()
                        .filter_map(|id| state.orders.get(id))
                        .cloned()
                        .collect()
                })
                .unwrap_or_default();

            Json(PairOrders {
                buy_orders,
                sell_orders,
            })
        })
        .ok_or(AppError(
            StatusCode::NOT_FOUND,
            anyhow!(
                "No orders found for pair '{}/{}' in contract '{}'",
                base_token,
                quote_token,
                store.contract_name
            ),
        ))
}

#[utoipa::path(
    get,
    path = "/orders/user/{address}",
    tag = "Contract",
    params(
        ("address" = String, Path, description = "Address of the user")
    ),
    responses(
        (status = OK, description = "Get all orders for a specific user")
    )
)]
pub async fn get_orders_by_user(
    State(state): State<ContractHandlerStore<Orderbook>>,
    axum::extract::Path(address): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let store = state.read().await;
    store
        .state
        .as_ref()
        .map(|state| {
            let user_orders: Vec<_> = state
                .orders
                .values()
                .filter(|order| order.owner == address)
                .cloned()
                .collect();

            Json(user_orders)
        })
        .ok_or(AppError(
            StatusCode::NOT_FOUND,
            anyhow!(
                "No orders found for user '{}' in contract '{}'",
                address,
                store.contract_name
            ),
        ))
}
