use std::collections::{BTreeMap, BTreeSet, VecDeque};

use crate::{Order, Orderbook, TokenPair};
use borsh::{BorshDeserialize, BorshSerialize};
use client_sdk::transaction_builder::OptimisticCommitments;
use sdk::{hyle_model_utils::TimestampMs, ContractName, LaneId};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct OrderbookCommitment {
    lane_id: LaneId,
    balances: BTreeMap<String, BTreeMap<String, u32>>,
    orders: BTreeMap<String, Order>,
    buy_orders: BTreeMap<TokenPair, VecDeque<String>>,
    sell_orders: BTreeMap<TokenPair, VecDeque<String>>,
    orders_history: BTreeMap<TokenPair, BTreeMap<TimestampMs, u32>>,
    accepted_tokens: BTreeSet<ContractName>,
}

impl OptimisticCommitments for Orderbook {
    fn optimistic_commitments(&self) -> anyhow::Result<Vec<u8>> {
        let commitment = OrderbookCommitment {
            lane_id: self.lane_id.clone(),
            balances: self.balances.clone(),
            orders: self.orders.clone(),
            buy_orders: self.buy_orders.clone(),
            sell_orders: self.sell_orders.clone(),
            orders_history: self.orders_history.clone(),
            accepted_tokens: self.accepted_tokens.clone(),
        };

        Ok(borsh::to_vec(&commitment)?)
    }
}
