use std::collections::{HashMap, HashSet, VecDeque};

use crate::{Order, Orderbook, TokenPair};
use borsh::{io::Error, BorshDeserialize, BorshSerialize};
use sdk::{hyle_model_utils::TimestampMs, ContractName, LaneId};

#[derive(BorshSerialize, BorshDeserialize)]
struct OrderbookCommitment {
    lane_id: LaneId,
    balances: HashMap<String, HashMap<String, u32>>,
    orders: HashMap<String, Order>,
    buy_orders: HashMap<TokenPair, VecDeque<String>>,
    sell_orders: HashMap<TokenPair, VecDeque<String>>,
    orders_history: HashMap<TokenPair, HashMap<TimestampMs, u32>>,
    accepted_tokens: HashSet<ContractName>,
}

pub trait OptimisticCommitments {
    fn optimistic_commitments(&self) -> Result<Vec<u8>, Error>;
}

impl OptimisticCommitments for Orderbook {
    fn optimistic_commitments(&self) -> Result<Vec<u8>, Error> {
        let commitment = OrderbookCommitment {
            lane_id: self.lane_id.clone(),
            balances: self.balances.clone(),
            orders: self.orders.clone(),
            buy_orders: self.buy_orders.clone(),
            sell_orders: self.sell_orders.clone(),
            orders_history: self.orders_history.clone(),
            accepted_tokens: self.accepted_tokens.clone(),
        };

        borsh::to_vec(&commitment)
    }
}
