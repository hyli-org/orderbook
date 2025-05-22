use borsh::{io::Error, BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};

use sdk::{hyle_model_utils::TimestampMs, Identity, RunResult};

#[cfg(feature = "client")]
pub mod client;
#[cfg(feature = "client")]
pub mod indexer;

impl sdk::ZkContract for Orderbook {
    /// Entry point of the contract's logic
    fn execute(&mut self, calldata: &sdk::Calldata) -> RunResult {
        // Parse contract inputs
        let (action, ctx) = sdk::utils::parse_raw_calldata::<OrderbookAction>(calldata)?;

        let user = calldata.identity.clone();

        // Execute the given action
        let events = match action {
            OrderbookAction::CreateOrder {
                order_id,
                order_type,
                price,
                pair,
                quantity,
                timestamp,
            } => {
                let order = Order {
                    owner: user,
                    order_id,
                    order_type,
                    price,
                    pair,
                    quantity,
                    timestamp,
                };
                // self.create_order(order)?
                self.execute_order(order)?
            }
            OrderbookAction::Cancel { order_id } => self.cancel_order(order_id)?,
            OrderbookAction::Deposit { token, amount } => {
                // TODO: assert there is a transfer blob for that token
                self.deposit(token, amount, user)?
            }
            OrderbookAction::Withdraw { token, amount } => self.withdraw(token, amount, user)?,
        };

        let res =
            borsh::to_vec(&events).map_err(|_| "Failed to encode OrderbookEvents".to_string())?;

        Ok((res, ctx, vec![]))
    }

    /// In this example, we serialize the full state on-chain.
    fn commit(&self) -> sdk::StateCommitment {
        sdk::StateCommitment(self.as_bytes().expect("Failed to encode Orderbook"))
    }
}

impl Orderbook {
    pub fn deposit(
        &mut self,
        token: String,
        amount: u32,
        user: Identity,
    ) -> Result<Vec<OrderbookEvent>, String> {
        let user_balances = self
            .balances
            .get_mut(&user)
            .ok_or(format!("User {user} not found"))?;

        let balance = user_balances.entry(token.clone()).or_insert(0);
        *balance += amount;
        Ok(vec![OrderbookEvent::BalanceUpdated {
            user,
            token,
            amount: *balance,
        }])
    }

    pub fn withdraw(
        &mut self,
        token: String,
        amount: u32,
        user: Identity,
    ) -> Result<Vec<OrderbookEvent>, String> {
        let user_balances = self
            .balances
            .get_mut(&user)
            .ok_or(format!("User {user} not found"))?;
        let balance = user_balances.get_mut(&token).ok_or("Token not found")?;

        if *balance < amount {
            return Err(format!(
                "Insufficient balance: user {} has {} {} tokens, trying to withdraw {}",
                user, balance, token, amount
            ));
        }

        *balance -= amount;
        Ok(vec![OrderbookEvent::BalanceUpdated {
            user,
            token,
            amount: *balance,
        }])
    }

    pub fn cancel_order(&mut self, _order_id: String) -> Result<Vec<OrderbookEvent>, String> {
        // let order = self
        //     .orders
        //     .get(&order_id)
        //     .ok_or(format!("Order {order_id} not found"))?
        //     .clone();

        // let user = order.owner.clone();
        // let required_token = match &order.order_type {
        //     OrderType::Buy => order.pair.1.clone(),
        //     OrderType::Sell => order.pair.0.clone(),
        // };

        // let user_balances = self
        //     .balances
        //     .get_mut(&user)
        //     .ok_or(format!("User {user} not found"))?;
        // let balance = user_balances.entry(required_token.clone()).or_insert(0);

        // let required_amount = match (&order.order_type, side) {
        //     (OrderType::Limit { price, .. }, OrderType::Buy) => order.quantity * price,
        //     (OrderType::Market { .. }, OrderType::Buy) => {
        //         return Err("Cannot cancel market buy order".to_string())
        //     }
        //     (_, OrderType::Sell) => order.quantity,
        // };

        // // Refund the reserved amount to the user
        // *balance += required_amount;

        // // Now that all operations have succeeded, remove the order from storage
        // self.orders.remove(&order_id);

        // // Remove from orders list
        // match side {
        //     OrderType::Buy => {
        //         if let Some(orders) = self.buy_orders.get_mut(&order.pair) {
        //             orders.retain(|id| id != &order_id);
        //         }
        //     }
        //     OrderType::Sell => {
        //         if let Some(orders) = self.sell_orders.get_mut(&order.pair) {
        //             orders.retain(|id| id != &order_id);
        //         }
        //     }
        // }

        Ok(vec![
            // OrderbookEvent::OrderCancelled { order_id },
            // OrderbookEvent::BalanceUpdated {
            //     user,
            //     token: required_token.to_string(),
            //     amount: *balance,
            // },
        ])
    }

    fn execute_order(&mut self, mut order: Order) -> Result<Vec<OrderbookEvent>, String> {
        let mut events = Vec::new();
        // Check if user has enough balance for the order
        let user = order.owner.clone();

        let required_token = match order.order_type {
            OrderType::Buy => order.pair.1.clone(),
            OrderType::Sell => order.pair.0.clone(),
        };

        let user_balances = self
            .balances
            .get_mut(&user)
            .ok_or(format!("User {user} not found"))?;
        let balance = user_balances.get_mut(&required_token).ok_or(format!(
            "Token {} not found for user {}",
            required_token, user
        ))?;

        if *balance < order.quantity {
            return Err(format!(
                "Insufficient balance for order: user {} has {} {} tokens, order requires {}",
                user, balance, required_token, order.quantity
            ));
        }

        let mut transfers_to_process: Vec<(Identity, Identity, String, u32)> = vec![];

        // Try to fill already existing orders
        match &order.order_type {
            OrderType::Buy => {
                let sell_orders_option = self.sell_orders.get_mut(&order.pair);

                if sell_orders_option.is_none() {
                    // If there are no sell orders and this is a limit order, add it to the orderbook
                    if order.price.is_some() {
                        self.orders.insert(order.order_id.clone(), order.clone());
                        self.buy_orders
                            .entry(order.pair.clone())
                            .or_default()
                            .push_back(order.order_id.clone());
                        events.push(OrderbookEvent::OrderCreated { order });
                    }
                    return Ok(events);
                }

                let sell_orders = sell_orders_option.unwrap();

                // Get the lowest price sell order
                while let Some(order_id) = sell_orders.pop_front() {
                    let existing_order = self
                        .orders
                        .get_mut(&order_id)
                        .ok_or(format!("Order {order_id} not found"))?;

                    // If the ordrer is a limit order, check if the *selling* price is lower than the limit price
                    if let Some(price) = order.price {
                        let existing_order_price = existing_order.price.expect(
                        "An order has been stored without a price limit. This should never happen",
                        );
                        if existing_order_price < price {
                            // Place the order in buy_orders sorted by price (highest first)
                            self.orders.insert(order.order_id.clone(), order.clone());
                            let buy_orders = self.buy_orders.entry(order.pair.clone()).or_default();

                            let insert_pos = buy_orders
                                .iter()
                                .position(|id| {
                                    let other_order = self.orders.get(id).unwrap();
                                    other_order.price.unwrap_or(0) < price
                                })
                                .unwrap_or(buy_orders.len());

                            buy_orders.insert(insert_pos, order.order_id.clone());
                            events.push(OrderbookEvent::OrderCreated { order });

                            // Put back the sell order we popped
                            sell_orders.push_front(order_id);
                            break;
                        }
                    }

                    match existing_order.quantity.cmp(&order.quantity) {
                        std::cmp::Ordering::Greater => {
                            // The existing order do not fully cover this order
                            existing_order.quantity -= order.quantity;
                            sell_orders.push_front(order_id);
                            events.push(OrderbookEvent::OrderUpdate {
                                order_id: existing_order.order_id.clone(),
                                remaining_quantity: existing_order.quantity,
                            });
                            transfers_to_process.push((
                                existing_order.owner.clone(),
                                user.clone(),
                                order.pair.0.clone(),
                                order.quantity,
                            ));
                            break;
                        }
                        std::cmp::Ordering::Equal => {
                            // The existing order fully covers this order
                            events.push(OrderbookEvent::OrderExecuted {
                                order_id: existing_order.order_id.clone(),
                            });
                            transfers_to_process.push((
                                existing_order.owner.clone(),
                                user.clone(),
                                order.pair.0.clone(),
                                order.quantity,
                            ));
                            self.orders.remove(&order_id);
                            break;
                        }
                        std::cmp::Ordering::Less => {
                            // The existing order is fully filled
                            events.push(OrderbookEvent::OrderExecuted {
                                order_id: existing_order.order_id.clone(),
                            });
                            transfers_to_process.push((
                                existing_order.owner.clone(),
                                user.clone(),
                                order.pair.0.clone(),
                                existing_order.quantity,
                            ));
                            order.quantity -= existing_order.quantity;
                            self.orders.remove(&order_id);
                        }
                    }
                }
            }
            OrderType::Sell => {
                let buy_orders_option = self.buy_orders.get_mut(&order.pair);

                if buy_orders_option.is_none() {
                    // If there are no buy orders and this is a limit order, add it to the orderbook
                    if order.price.is_some() {
                        self.orders.insert(order.order_id.clone(), order.clone());
                        self.buy_orders
                            .entry(order.pair.clone())
                            .or_default()
                            .push_back(order.order_id.clone());
                        events.push(OrderbookEvent::OrderCreated { order });
                    }
                    return Ok(events);
                }

                let buy_orders = buy_orders_option.unwrap();

                while let Some(order_id) = buy_orders.pop_front() {
                    let existing_order = self
                        .orders
                        .get_mut(&order_id)
                        .ok_or(format!("Order {order_id} not found"))?;

                    // If the ordrer is a limit order, check if the *buying* price is higher than the limit price
                    if let Some(price) = order.price {
                        let existing_order_price = existing_order.price.expect(
                        "An order has been stored without a price limit. This should never happen",
                        );
                        if existing_order_price > price {
                            // Place the order in sell_orders sorted by price (highest first)
                            self.orders.insert(order.order_id.clone(), order.clone());
                            let sell_orders =
                                self.sell_orders.entry(order.pair.clone()).or_default();

                            let insert_pos = sell_orders
                                .iter()
                                .position(|id| {
                                    let other_order = self.orders.get(id).unwrap();
                                    other_order.price.unwrap_or(0) < price
                                })
                                .unwrap_or(sell_orders.len());

                            sell_orders.insert(insert_pos, order.order_id.clone());
                            events.push(OrderbookEvent::OrderCreated { order });

                            // Don't forget to put back the buy order we popped
                            buy_orders.push_front(order_id);
                            break;
                        }
                    }

                    match existing_order.quantity.cmp(&order.quantity) {
                        std::cmp::Ordering::Greater => {
                            // The existing order do not fully cover this order
                            existing_order.quantity -= order.quantity;
                            buy_orders.push_front(order_id);
                            events.push(OrderbookEvent::OrderUpdate {
                                order_id: existing_order.order_id.clone(),
                                remaining_quantity: existing_order.quantity,
                            });
                            transfers_to_process.push((
                                user.clone(),
                                existing_order.owner.clone(),
                                order.pair.0.clone(),
                                order.quantity,
                            ));
                            break;
                        }
                        std::cmp::Ordering::Equal => {
                            // The existing order fully covers this order
                            events.push(OrderbookEvent::OrderExecuted {
                                order_id: existing_order.order_id.clone(),
                            });
                            transfers_to_process.push((
                                user.clone(),
                                existing_order.owner.clone(),
                                order.pair.0.clone(),
                                order.quantity,
                            ));
                            self.orders.remove(&order_id);
                            break;
                        }
                        std::cmp::Ordering::Less => {
                            // The existing order is fully filled
                            events.push(OrderbookEvent::OrderExecuted {
                                order_id: existing_order.order_id.clone(),
                            });
                            transfers_to_process.push((
                                user.clone(),
                                existing_order.owner.clone(),
                                order.pair.0.clone(),
                                existing_order.quantity,
                            ));
                            order.quantity -= existing_order.quantity;
                            self.orders.remove(&order_id);
                        }
                    }
                }
            }
        }

        // Updating balances
        // If not limit order: assert that total balance in user_to_fund is equal to the order quantity
        let mut ids = HashMap::<String, Identity>::new();
        for (from, to, token, amout) in transfers_to_process {
            self.transfer_tokens(&from, &to, &token, amout)?;
            ids.insert(token.clone(), from.clone());
            ids.insert(token.clone(), to.clone());
        }

        for (token, user) in ids {
            let user_balance = self
                .balances
                .get_mut(&user)
                .ok_or(format!("User {user} not found"))?
                .get(&token)
                .ok_or(format!("Token {token} not found"))?;
            events.push(OrderbookEvent::BalanceUpdated {
                user,
                token,
                amount: *user_balance,
            });
        }

        Ok(events)
    }

    fn transfer_tokens(
        &mut self,
        from: &Identity,
        to: &Identity,
        token: &str,
        amount: u32,
    ) -> Result<(), String> {
        // Deduct from sender
        let from_balance = self
            .balances
            .get_mut(from)
            .ok_or(format!("User {} not found", from))?
            .get_mut(token)
            .ok_or(format!("Token {} not found for user {}", token, from))?;

        if *from_balance < amount {
            return Err(format!(
                "Could not transfer: Insufficient balance: user {} has {} {} tokens, trying to transfer {}",
                from, from_balance, token, amount
            ));
        }
        *from_balance -= amount;

        // Add to receiver
        let to_balances = self
            .balances
            .get_mut(to)
            .ok_or(format!("User {} not found", to))?;
        let to_balance = to_balances.entry(token.to_string()).or_insert(0);
        *to_balance += amount;

        Ok(())
    }

    pub fn as_bytes(&self) -> Result<Vec<u8>, Error> {
        borsh::to_vec(self)
    }
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Debug, Clone, Default)]
pub struct Orderbook {
    // Map of user address to token balances
    balances: HashMap<Identity, HashMap<String, u32>>,
    // All orders indexed by order_id
    orders: HashMap<String, Order>,
    // Buy orders sorted by price (highest first) for each token pair
    buy_orders: HashMap<TokenPair, VecDeque<String>>,
    // Sell orders sorted by price (lowest first) for each token pair
    sell_orders: HashMap<TokenPair, VecDeque<String>>,
}

/// Enum representing possible calls to the contract functions.
#[derive(Serialize, Deserialize, BorshSerialize, BorshDeserialize, Debug, Clone)]
pub enum OrderbookAction {
    CreateOrder {
        order_id: String,
        order_type: OrderType,
        price: Option<u32>,
        pair: TokenPair,
        quantity: u32,
        timestamp: TimestampMs,
    },
    Cancel {
        order_id: String,
    },
    Deposit {
        token: String,
        amount: u32,
    },
    Withdraw {
        token: String,
        amount: u32,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone, BorshSerialize, BorshDeserialize)]
pub struct Order {
    pub owner: Identity,
    pub order_id: String,
    pub order_type: OrderType,
    pub price: Option<u32>,
    pub pair: TokenPair,
    pub quantity: u32,
    pub timestamp: TimestampMs,
}

#[derive(Debug, Serialize, Deserialize, Clone, BorshSerialize, BorshDeserialize)]
pub enum OrderType {
    Buy,
    Sell,
}

#[derive(
    Debug,
    Serialize,
    Deserialize,
    Clone,
    BorshSerialize,
    BorshDeserialize,
    PartialEq,
    Eq,
    Hash,
    PartialOrd,
    Ord,
)]
pub struct TokenPair(String, String);

#[derive(Debug, Serialize, Deserialize, Clone, BorshSerialize, BorshDeserialize)]
pub enum OrderbookEvent {
    OrderCreated {
        order: Order,
    },
    OrderCancelled {
        order_id: String,
    },
    OrderExecuted {
        order_id: String,
    },
    OrderUpdate {
        order_id: String,
        remaining_quantity: u32,
    },
    BalanceUpdated {
        user: Identity,
        token: String,
        amount: u32,
    },
}

impl OrderbookAction {
    pub fn as_blob(&self, contract_name: sdk::ContractName) -> sdk::Blob {
        sdk::Blob {
            contract_name,
            data: sdk::BlobData(borsh::to_vec(self).expect("Failed to encode OrderbookAction")),
        }
    }
}

impl From<sdk::StateCommitment> for Orderbook {
    fn from(state: sdk::StateCommitment) -> Self {
        borsh::from_slice(&state.0)
            .map_err(|_| "Could not decode Orderbook state".to_string())
            .unwrap()
    }
}
