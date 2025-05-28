use borsh::{io::Error, BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

use sdk::{hyle_model_utils::TimestampMs, BlockHeight, ContractName, LaneId, RunResult};

#[cfg(feature = "client")]
pub mod client;
#[cfg(feature = "client")]
pub mod indexer;

impl sdk::ZkContract for Orderbook {
    /// Entry point of the contract's logic
    fn execute(&mut self, calldata: &sdk::Calldata) -> RunResult {
        // Parse contract inputs
        let (action, ctx) = sdk::utils::parse_raw_calldata::<OrderbookAction>(calldata)?;

        let user = calldata.identity.0.clone();

        let Some(tx_ctx) = &calldata.tx_ctx else {
            return Err("tx_ctx is missing".to_string());
        };

        if tx_ctx.lane_id != self.lane_id {
            return Err("Invalid lane id".to_string());
        }

        // The contract must be provided with all blobs
        if calldata.blobs.len() != calldata.tx_blob_count {
            return Err("Calldata is not composed with all tx's blobs".to_string());
        }

        // Check if blobs in the calldata are all whitelisted
        for (_, blob) in &calldata.blobs {
            if !self.is_blob_whitelisted(&blob.contract_name) {
                return Err(format!(
                    "Blob with contract name {} is not whitelisted",
                    blob.contract_name
                ));
            }
        }

        // Execute the given action
        let events = match action {
            OrderbookAction::CreateOrder {
                order_id,
                order_type,
                price,
                pair,
                quantity,
            } => {
                let order = Order {
                    owner: user,
                    order_id,
                    order_type,
                    price,
                    pair,
                    quantity,
                    timestamp: tx_ctx.timestamp.clone(),
                };
                if self.orders.contains_key(&order.order_id) {
                    return Err(format!("Order with id {} already exists", order.order_id));
                }
                self.execute_order(order, tx_ctx)?
            }
            OrderbookAction::Cancel { order_id } => self.cancel_order(order_id, user)?,
            OrderbookAction::Deposit { token, amount } => {
                // TODO: assert there is a transfer blob for that token
                self.deposit(token, amount, user, tx_ctx)?
            }
            OrderbookAction::Withdraw { token, amount } => {
                // TODO: assert there is a transfer blob for that token
                self.withdraw(token, amount, user)?
            }
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
        user: String,
        tx_ctx: &sdk::TxContext,
    ) -> Result<Vec<OrderbookEvent>, String> {
        let balance = self.get_balance_mut(&user, &token);
        *balance += amount;
        let balance = *balance;

        let latest_deposit_block_height = self.get_latest_deposit_mut(&user, &token);
        *latest_deposit_block_height = tx_ctx.block_height;

        Ok(vec![OrderbookEvent::BalanceUpdated {
            user,
            token,
            amount: balance,
        }])
    }

    pub fn withdraw(
        &mut self,
        token: String,
        amount: u32,
        user: String,
    ) -> Result<Vec<OrderbookEvent>, String> {
        let balance = self.get_balance_mut(&user, &token);

        if *balance < amount {
            return Err(format!(
                "Could not withdraw: Insufficient balance: user {} has {} {} tokens, trying to withdraw {}",
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

    pub fn cancel_order(
        &mut self,
        order_id: String,
        user: String,
    ) -> Result<Vec<OrderbookEvent>, String> {
        let order = self
            .orders
            .get(&order_id)
            .ok_or(format!("Order {order_id} not found"))?
            .clone();

        if order.owner != user {
            return Err(format!(
                "User {} is not the owner of order {}",
                user, order_id
            ));
        }

        let user = order.owner.clone();
        let required_token = match &order.order_type {
            OrderType::Buy => order.pair.1.clone(),
            OrderType::Sell => order.pair.0.clone(),
        };

        // Refund the reserved amount to the user
        self.transfer_tokens(
            "orderbook",
            &user,
            &required_token,
            order.quantity,
        )?;

        // Now that all operations have succeeded, remove the order from storage
        self.orders.remove(&order_id);

        // Remove from orders list
        match order.order_type {
            OrderType::Buy => {
                if let Some(orders) = self.buy_orders.get_mut(&order.pair) {
                    orders.retain(|id| id != &order_id);
                }
            }
            OrderType::Sell => {
                if let Some(orders) = self.sell_orders.get_mut(&order.pair) {
                    orders.retain(|id| id != &order_id);
                }
            }
        }

        let user_balance = self.get_balance(&user, &required_token);

        Ok(vec![
            OrderbookEvent::OrderCancelled { order_id, pair: order.pair },
            OrderbookEvent::BalanceUpdated {
                user,
                token: required_token.to_string(),
                amount: user_balance,
            },
        ])
    }

    fn execute_order(&mut self, mut order: Order, tx_ctx: &sdk::TxContext) -> Result<Vec<OrderbookEvent>, String> {
        let mut events = Vec::new();

        // Check if user has enough balance for the order
        let user = order.owner.clone();
        let mut transfers_to_process: Vec<(String, String, String, u32)> = vec![];
        let mut order_to_insert: Option<Order> = None;


        let (required_token, required_amount) = match order.order_type {
            OrderType::Buy => (
                order.pair.1.clone(),
                order.price.map(|p| order.quantity * p)
            ),
            OrderType::Sell => (
                order.pair.0.clone(),
                Some(order.quantity)
            ),
        };

        let user_balance = self.get_balance(&user, &required_token);
        let latest_deposit_block_height = self.get_latest_deposit(&user, &required_token);

        if tx_ctx.block_height < latest_deposit_block_height + 5 {
            return Err(format!(
                "User {} tried to execute an order too soon after the last deposit block height: {:?} < {}. 5 blocks are required between deposits and order execution.",
                user, tx_ctx.block_height, latest_deposit_block_height.0 + 5
            ));
        }

        // For limit orders, verify sufficient balance
        if let Some(amount) = required_amount {
            if user_balance < amount {
                return Err(format!(
                    "Insufficient balance for {:?} order: user {} has {} {} tokens, requires {}",
                    order.order_type,
                    user,
                    user_balance, 
                    required_token,
                    amount
                ));
            }
        }

        // Try to fill already existing orders
        match &order.order_type {
            OrderType::Buy => {
                let sell_orders_option = self.sell_orders.get_mut(&order.pair);

                if sell_orders_option.is_none() && order.price.is_some() {
                    // If there are no sell orders and this is a limit order, add it to the orderbook

                    self.orders.insert(order.order_id.clone(), order.clone());
                    self.buy_orders
                        .entry(order.pair.clone())
                        .or_default()
                        .push_back(order.order_id.clone());
                    events.push(OrderbookEvent::OrderCreated {
                        order: order.clone(),
                    });

                    // Remove liquitidy from the user balance
                    events.push(OrderbookEvent::BalanceUpdated {
                        user: user.clone(),
                        token: required_token.clone(),
                        amount: user_balance - order.quantity * order.price.unwrap(),
                    });
                    let orderbook_balance = self.get_balance("orderbook", &required_token);
                    events.push(OrderbookEvent::BalanceUpdated {
                        user: "orderbook".into(),
                        token: required_token.clone(),
                        amount: orderbook_balance + order.quantity * order.price.unwrap(),
                    });
                    self.transfer_tokens(
                        &user,
                        "orderbook",
                        &required_token,
                        order.quantity * order.price.unwrap(),
                    )?;

                    return Ok(events);
                } else if sell_orders_option.is_none() {
                    // If there are no sell orders and this is a market order, we cannot proceed
                    return Err(format!(
                        "No matching sell orders for market order {}",
                        order.order_id
                    ));
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
                        if existing_order_price > price {
                            // Place the order in buy_orders
                            order_to_insert = Some(order);

                            // Put back the sell order we popped
                            sell_orders.push_front(order_id);
                            break;
                        }
                    }

                    // Update history
                    self.orders_history
                        .entry(order.pair.clone())
                        .or_default()
                        .insert(order.timestamp.clone(), existing_order.price.unwrap());

                    // There is an order that can be filled
                    match existing_order.quantity.cmp(&order.quantity) {
                        std::cmp::Ordering::Greater => {
                            // The existing order do not fully cover this order
                            existing_order.quantity -= order.quantity;

                            sell_orders.push_front(order_id);

                            events.push(OrderbookEvent::OrderUpdate {
                                order_id: existing_order.order_id.clone(),
                                remaining_quantity: existing_order.quantity,
                                pair: order.pair.clone()
                            });

                            // Send token to the order owner
                            transfers_to_process.push((
                                user.clone(),
                                existing_order.owner.clone(),
                                order.pair.1.clone(),
                                existing_order.price.unwrap() * order.quantity,
                            ));
                            // Send token to the user
                            transfers_to_process.push((
                                "orderbook".to_string(),
                                user.clone(),
                                order.pair.0.clone(),
                                order.quantity,
                            ));
                            break;
                        }
                        std::cmp::Ordering::Equal => {
                            // The two orders are executed
                            events.push(OrderbookEvent::OrderExecuted {
                                order_id: order_id.clone(),
                                pair: order.pair.clone()
                            });
                            events.push(OrderbookEvent::OrderExecuted {
                                order_id: order.order_id.clone(),
                                pair: order.pair.clone()
                            });

                            // Send token to the order owner
                            transfers_to_process.push((
                                user.clone(),
                                existing_order.owner.clone(),
                                order.pair.1.clone(),
                                existing_order.price.unwrap() * existing_order.quantity,
                            ));

                            // Send token to the user
                            transfers_to_process.push((
                                "orderbook".to_string(),
                                user.clone(),
                                order.pair.0.clone(),
                                existing_order.quantity,
                            ));

                            self.orders.remove(&order_id);
                            break;
                        }
                        std::cmp::Ordering::Less => {
                            // The existing order is fully filled
                            events.push(OrderbookEvent::OrderExecuted {
                                order_id: existing_order.order_id.clone(),
                                pair: order.pair.clone()
                            });
                            transfers_to_process.push((
                                user.clone(),
                                existing_order.owner.clone(),
                                order.pair.1.clone(),
                                existing_order.price.unwrap() * existing_order.quantity,
                            ));
                            transfers_to_process.push((
                                "orderbook".to_string(),
                                user.clone(),
                                order.pair.0.clone(),
                                existing_order.quantity,
                            ));
                            order.quantity -= existing_order.quantity;

                            // We DO NOT push bash the order_id back to the sell orders
                            self.orders.remove(&order_id);

                            // Update the order to insert
                            order_to_insert = Some(order.clone());
                        }
                    }
                }
            }
            OrderType::Sell => {
                let buy_orders_option = self.buy_orders.get_mut(&order.pair);

                if buy_orders_option.is_none() && order.price.is_some() {
                    // If there are no buy orders and this is a limit order, add it to the orderbook
                    self.orders.insert(order.order_id.clone(), order.clone());
                    self.sell_orders
                        .entry(order.pair.clone())
                        .or_default()
                        .push_back(order.order_id.clone());
                    events.push(OrderbookEvent::OrderCreated {
                        order: order.clone(),
                    });

                    // Remove liquitidy from the user balance
                    events.push(OrderbookEvent::BalanceUpdated {
                        user: user.clone(),
                        token: required_token.clone(),
                        amount: user_balance - order.quantity,
                    });
                    let orderbook_balance = self.get_balance("orderbook", &required_token);
                    events.push(OrderbookEvent::BalanceUpdated {
                        user: "orderbook".into(),
                        token: required_token.clone(),
                        amount: orderbook_balance + order.quantity,
                    });
                    self.transfer_tokens(
                        &user,
                        "orderbook",
                        &required_token,
                        order.quantity,
                    )?;

                    return Ok(events);
                } else if buy_orders_option.is_none() {
                    // If there are no buy orders and this is a market order, we cannot proceed
                    return Err(format!(
                        "No matching buy orders for market order {}",
                        order.order_id
                    ));
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
                        if existing_order_price < price {
                            // Place the order in sell_orders
                            order_to_insert = Some(order.clone());

                            // Put back the buy order we popped
                            buy_orders.push_front(order_id);
                            break;
                        }
                    }

                    // Update history
                    self.orders_history
                        .entry(order.pair.clone())
                        .or_default()
                        .insert(order.timestamp.clone(), existing_order.price.unwrap());

                    match existing_order.quantity.cmp(&order.quantity) {
                        std::cmp::Ordering::Greater => {
                            // The existing order do not fully cover this order
                            existing_order.quantity -= order.quantity;

                            buy_orders.push_front(order_id);

                            events.push(OrderbookEvent::OrderUpdate {
                                order_id: existing_order.order_id.clone(),
                                remaining_quantity: existing_order.quantity,
                                pair: order.pair.clone()
                            });

                            // Send token to the order owner
                            transfers_to_process.push((
                                user.clone(),
                                existing_order.owner.clone(),
                                order.pair.0.clone(),
                                order.quantity,
                            ));
                            // Send token to the user
                            transfers_to_process.push((
                                "orderbook".to_string(),
                                user.clone(),
                                order.pair.1.clone(),
                                existing_order.price.unwrap() * order.quantity,
                            ));
                            break;
                        }
                        std::cmp::Ordering::Equal => {
                            // The existing order fully covers this order
                            events.push(OrderbookEvent::OrderExecuted {
                                order_id: existing_order.order_id.clone(),
                                pair: order.pair.clone()
                            });
                            // Send token to the order owner
                            transfers_to_process.push((
                                user.clone(),
                                existing_order.owner.clone(),
                                order.pair.0.clone(),
                                existing_order.quantity,
                            ));
                            transfers_to_process.push((
                                "orderbook".to_string(),
                                user.clone(),
                                order.pair.1.clone(),
                                existing_order.price.unwrap() * existing_order.quantity,
                            ));

                            self.orders.remove(&order_id);
                            break;
                        }
                        std::cmp::Ordering::Less => {
                            // The existing order is fully filled
                            events.push(OrderbookEvent::OrderExecuted {
                                order_id: existing_order.order_id.clone(),
                                pair: order.pair.clone()
                            });
                            transfers_to_process.push((
                                user.clone(),
                                existing_order.owner.clone(),
                                order.pair.0.clone(),
                                existing_order.quantity,
                            ));
                            transfers_to_process.push((
                                "orderbook".to_string(),
                                user.clone(),
                                order.pair.1.clone(),
                                existing_order.price.unwrap() * existing_order.quantity,
                            ));
                            order.quantity -= existing_order.quantity;

                            // We DO NOT push bash the order_id back to the buy orders
                            self.orders.remove(&order_id);

                            // Update the order to insert
                            order_to_insert = Some(order.clone());
                        }
                    }
                }
            }
        }

        // If there is still some quantity left, we need to insert the order in the orderbook
        if let Some(order) = order_to_insert {
            if order.price.is_some() {
                self.insert_order(order.clone())?;
                // Remove liquitidy from the user balance
                let quantity = match order.order_type {
                    OrderType::Buy => order.quantity * order.price.unwrap(),
                    OrderType::Sell => order.quantity,
                };

                transfers_to_process.push((
                    user.clone(),
                    "orderbook".to_string(),
                    required_token,
                    quantity,
                ));
                events.push(OrderbookEvent::OrderCreated { order });
            }
        }

        // Updating balances
        // If not limit order: assert that total balance in user_to_fund is equal to the order quantity
        let mut ids = HashMap::<String, HashSet<String>>::new();
        for (from, to, token, amout) in transfers_to_process {
            self.transfer_tokens(&from, &to, &token, amout)?;
            let t = ids.entry(token.clone()).or_default();
            t.insert(from.clone());
            t.insert(to.clone());
        }
        for (token, users) in ids {
            for user in users {
                let user_balance = self.get_balance(&user, &token);
                events.push(OrderbookEvent::BalanceUpdated {
                    user: user.clone(),
                    token: token.clone(),
                    amount: user_balance,
                });
            }
        }

        Ok(events)
    }
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Default, Debug, Clone)]
pub struct Orderbook {
    // Validator public key of the lane this orderbook is running on
    lane_id: LaneId,
    // Map of user address to token balances
    balances: HashMap<String, HashMap<String, u32>>,
    // Map of user address to token latest deposit block height
    latest_deposit: HashMap<String, HashMap<String, BlockHeight>>,
    // All orders indexed by order_id
    orders: HashMap<String, Order>,
    // Buy orders sorted by price (highest first) for each token pair
    buy_orders: HashMap<TokenPair, VecDeque<String>>,
    // Sell orders sorted by price (lowest first) for each token pair
    sell_orders: HashMap<TokenPair, VecDeque<String>>,
    // History of orders executed, indexed by token pair and timestamp
    orders_history: HashMap<TokenPair, HashMap<TimestampMs, u32>>,
    // Accepted tokens
    accepted_tokens: HashSet<ContractName>,
}

impl Orderbook {
    fn transfer_tokens(
        &mut self,
        from: &str,
        to: &str,
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
        let to_balances = self.balances.entry(to.to_string()).or_default();
        let to_balance = to_balances.entry(token.to_string()).or_default();
        *to_balance += amount;

        Ok(())
    }

    pub fn get_balance_mut(&mut self, user: &str, token: &str) -> &mut u32 {
        self.balances
            .entry(user.to_string())
            .or_default()
            .entry(token.to_owned())
            .or_default()
    }

    pub fn get_balance(&mut self, user: &str, token: &str) -> u32 {
        *self.get_balance_mut(user, token)
    }

    pub fn get_latest_deposit_mut(&mut self, user: &str, token: &str) -> &mut BlockHeight {
        self.latest_deposit
            .entry(user.to_string())
            .or_default()
            .entry(token.to_owned())
            .or_default()
    }

    pub fn get_latest_deposit(&mut self, user: &str, token: &str) -> BlockHeight {
        *self.get_latest_deposit_mut(user, token)
    }

    fn insert_order(&mut self, order: Order) -> Result<(), String> {
        // Function only called for Limit orders
        let price = order.price.unwrap();
        if price == 0 {
            return Err("Price cannot be zero".to_string());
        }
        let order_list = match order.order_type {
            OrderType::Buy => self.buy_orders.entry(order.pair.clone()).or_default(),
            OrderType::Sell => self.sell_orders.entry(order.pair.clone()).or_default(),
        };

        let insert_pos = order_list
            .iter()
            .position(|id| {
                let other_order = self.orders.get(id).unwrap();
                // To be inserted, the order must be <> than the current one
                match order.order_type {
                    OrderType::Buy => other_order.price.unwrap_or(0) < price,
                    OrderType::Sell => other_order.price.unwrap_or(0) > price,
                }
            })
            .unwrap_or(order_list.len());

        order_list.insert(insert_pos, order.order_id.clone());
        self.orders.insert(order.order_id.clone(), order.clone());
        Ok(())
    }

    pub fn is_blob_whitelisted(&self, contract_name: &ContractName) -> bool {
        self.accepted_tokens.contains(contract_name) || contract_name.0 == "orderbook" || contract_name.0 == "wallet" || contract_name.0 == "secp256k1"
    }

    pub fn as_bytes(&self) -> Result<Vec<u8>, Error> {
        borsh::to_vec(self)
    }
}


impl Orderbook {
    pub fn init(lane_id: LaneId) -> Self {
        let mut balances = HashMap::new();
        balances.insert("orderbook".to_string(), HashMap::new());

        let accepted_tokens = HashSet::from([
            "oranj".into(),
            "hyllar".into(),
        ]);

        Orderbook {
            lane_id,
            balances,
            latest_deposit: HashMap::new(),
            orders: HashMap::new(),
            buy_orders: HashMap::new(),
            sell_orders: HashMap::new(),
            orders_history: HashMap::new(),
            accepted_tokens
        }
    }

    pub fn init_with_fake_data(lane_id: LaneId) -> Self {
        let user1 = "Alice".to_string();
        let user2 = "Bob".to_string();

        let mut balances = HashMap::new();
        balances.insert(user1.clone(), HashMap::from([
            ("oranj".to_string(), 5),
            ("hyllar".to_string(), 20),
        ]));
        balances.insert(user2.clone(), HashMap::from([
            ("oranj".to_string(), 10),
            ("hyllar".to_string(), 10),
        ]));

        let mut latest_deposit = HashMap::new();
        latest_deposit.insert(user1.clone(), HashMap::from([
            ("oranj".to_string(), BlockHeight(0)),
            ("hyllar".to_string(), BlockHeight(0)),
        ]));
        latest_deposit.insert(user2.clone(), HashMap::from([
            ("oranj".to_string(), BlockHeight(0)),
            ("hyllar".to_string(), BlockHeight(0)),
        ]));

        let pair = ("oranj".to_string(), "hyllar".to_string());
        let now = TimestampMs(1);

        let order1 = Order {
            owner: user1.clone(),
            order_id: "order1".to_string(),
            order_type: OrderType::Buy,
            price: Some(10),
            pair: pair.clone(),
            quantity: 2,
            timestamp: now,
        };

        let order2 = Order {
            owner: user2.clone(),
            order_id: "order2".to_string(),
            order_type: OrderType::Sell,
            price: Some(12),
            pair: pair.clone(),
            quantity: 3,
            timestamp: TimestampMs(2),
        };

        let mut orders = HashMap::new();
        orders.insert(order1.order_id.clone(), order1.clone());
        orders.insert(order2.order_id.clone(), order2.clone());

        let mut buy_orders = HashMap::new();
        buy_orders.insert(pair.clone(), VecDeque::from(vec![order1.order_id.clone()]));

        let mut sell_orders = HashMap::new();
        sell_orders.insert(pair.clone(), VecDeque::from(vec![order2.order_id.clone()]));


        let accepted_tokens = HashSet::from([
            "oranj".into(),
            "hyllar".into(),
        ]);

        Orderbook {
            lane_id,
            balances,
            latest_deposit,
            orders,
            buy_orders,
            sell_orders,
            orders_history: HashMap::new(),
            accepted_tokens
        }
    }
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
    pub owner: String,
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

pub type TokenPair = (String, String);

#[derive(Debug, Serialize, Deserialize, Clone, BorshSerialize, BorshDeserialize)]
pub enum OrderbookEvent {
    OrderCreated {
        order: Order,
    },
    OrderCancelled {
        order_id: String,
        pair: TokenPair,
    },
    OrderExecuted {
        order_id: String,
        pair: TokenPair,
    },
    OrderUpdate {
        order_id: String,
        remaining_quantity: u32,
        pair: TokenPair,
    },
    BalanceUpdated {
        user: String,
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

#[cfg(test)]
mod tests {
    use crate::*;
    use std::collections::HashMap;

    static TX_CTX: sdk::TxContext = sdk::TxContext {
            block_height: sdk::BlockHeight(6),
            lane_id: LaneId(sdk::ValidatorPublicKey(vec![])),
            timestamp: TimestampMs(0),
            block_hash: sdk::ConsensusProposalHash(String::new()),
            chain_id: 0,
        };

    fn setup() -> (String, String, Orderbook) {
        let mut orderbook = Orderbook::init(LaneId::default());
        let eth_user = "eth_user".to_string();
        let usd_user = "usd_user".to_string();

        let mut eth_token = HashMap::new();
        eth_token.insert("ETH".to_string(), 10);
        orderbook.balances.insert(eth_user.clone(), eth_token);

        let mut usd_token = HashMap::new();
        usd_token.insert("USD".to_string(), 3000);

        orderbook.balances.insert(usd_user.clone(), usd_token);

        orderbook.latest_deposit.insert(
            eth_user.clone(),
            HashMap::from([("ETH".to_string(), BlockHeight(0))]));

        orderbook.latest_deposit.insert(
            usd_user.clone(),
            HashMap::from([("USD".to_string(), BlockHeight(0))]),
        );

        (eth_user, usd_user, orderbook)
    }

    #[test_log::test]
    fn test_limit_sell_order_create() {
        let (eth_user, _, mut orderbook) = setup();

        // Create a limit sell order
        let order = Order {
            owner: eth_user.clone(),
            order_id: "order1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(0),
        };

        let events = orderbook.execute_order(order.clone(), &TX_CTX).unwrap();

        // Check that the order was created
        assert_eq!(events.len(), 3);
        let created_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::OrderCreated { .. }))
            .count();
        let balance_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::BalanceUpdated { .. }))
            .count();
        assert_eq!(created_count, 1);
        assert_eq!(balance_count, 2);

        // Check that the order is in the sell orders list
        assert!(orderbook.orders.contains_key("order1"));
        assert!(orderbook
            .sell_orders
            .get(&("ETH".to_string(), "USD".to_string()))
            .unwrap()
            .contains(&"order1".to_string()));
    }

    #[test_log::test]
    fn test_limit_buy_order_create() {
        let (_, usd_user, mut orderbook) = setup();

        // Create a limit sell order
        let order = Order {
            owner: usd_user.clone(),
            order_id: "order1".to_string(),
            order_type: OrderType::Buy,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(0),
        };

        let events = orderbook.execute_order(order.clone(), &TX_CTX).unwrap();

        // Check that the order was created
        assert_eq!(events.len(), 3);
        let created_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::OrderCreated { .. }))
            .count();
        let balance_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::BalanceUpdated { .. }))
            .count();
        assert_eq!(created_count, 1);
        assert_eq!(balance_count, 2);

        // Check that the order is in the sell orders list
        assert!(orderbook.orders.contains_key("order1"));
        assert!(orderbook
            .buy_orders
            .get(&("ETH".to_string(), "USD".to_string()))
            .unwrap()
            .contains(&"order1".to_string()));
    }

    #[test_log::test]
    fn test_limit_order_match_same_quantity_same_price() {
        let (eth_user, usd_user, mut orderbook) = setup();

        // Create a limit sell order first
        let sell_order = Order {
            owner: eth_user.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(0),
        };
        orderbook.execute_order(sell_order, &TX_CTX).unwrap();

        // Create a matching buy order
        let buy_order = Order {
            owner: usd_user.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(1),
        };

        let events = orderbook.execute_order(buy_order, &TX_CTX).unwrap();

        // Check that the order was executed
        assert_eq!(events.len(), 6);
        let executed_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::OrderExecuted { .. }))
            .count();
        let balance_updated_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::BalanceUpdated { .. }))
            .count();
        assert_eq!(executed_count, 2);
        // usd_user received ETH
        // usd_user sent USD
        // orderbook sent ETH
        // eth_user received USD
        assert_eq!(balance_updated_count, 4);

        // Check balances were updated correctly
        let eth_user_usd = orderbook
            .balances
            .get(&eth_user)
            .unwrap()
            .get("USD")
            .unwrap();
        let usd_user_eth = orderbook
            .balances
            .get(&usd_user)
            .unwrap()
            .get("ETH")
            .unwrap();

        assert_eq!(*eth_user_usd, 2000); // Seller received USD
        assert_eq!(*usd_user_eth, 1); // Buyer received ETH
    }

    #[test_log::test]
    fn test_limit_order_match_same_quantity_lower_price() {
        let (eth_user, usd_user, mut orderbook) = setup();

        // Create a limit sell order first
        let sell_order = Order {
            owner: eth_user.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(0),
        };
        orderbook.execute_order(sell_order, &TX_CTX).unwrap();

        // Create a matching buy order
        let buy_order = Order {
            owner: usd_user.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: Some(1900),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(1),
        };
        let events = orderbook.execute_order(buy_order, &TX_CTX).unwrap();

        // Check that the order was NOT executed
        assert_eq!(events.len(), 3);
        let created_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::OrderCreated { .. }))
            .count();
        let balance_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::BalanceUpdated { .. }))
            .count();
        assert_eq!(created_count, 1);
        assert_eq!(balance_count, 2);

        // Check balances were updated correctly
        let eth_user_usd = orderbook
            .balances
            .get(&eth_user)
            .unwrap()
            .get("USD")
            .unwrap_or(&0);
        let usd_user_eth = orderbook
            .balances
            .get(&usd_user)
            .unwrap()
            .get("ETH")
            .unwrap_or(&0);

        assert_eq!(*eth_user_usd, 0); // Seller did not received USD
        assert_eq!(*usd_user_eth, 0); // Buyer did not received ETH

        // Check user correctly desposited the amount
        let eth_user_eth = orderbook
            .balances
            .get(&eth_user)
            .unwrap()
            .get("ETH")
            .unwrap();
        let usd_user_usd = orderbook
            .balances
            .get(&usd_user)
            .unwrap()
            .get("USD")
            .unwrap();

        assert_eq!(*eth_user_eth, 10 - 1); // Seller did not received USD
        assert_eq!(*usd_user_usd, 3000 - 1900); // Buyer did not received ETH
    }

    #[test_log::test]
    fn test_limit_order_match_same_quantity_lower_price_bis() {
        let (eth_user, usd_user, mut orderbook) = setup();

        // Create a limit sell order first
        let sell_order = Order {
            owner: usd_user.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Buy,
            price: Some(1900),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(0),
        };
        orderbook.execute_order(sell_order, &TX_CTX).unwrap();

        // Create a matching buy order
        let buy_order = Order {
            owner: eth_user.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(1),
        };
        let events = orderbook.execute_order(buy_order, &TX_CTX).unwrap();

        // Check that the order was NOT executed
        assert_eq!(events.len(), 3);
        let created_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::OrderCreated { .. }))
            .count();
        let balance_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::BalanceUpdated { .. }))
            .count();
        assert_eq!(created_count, 1);
        assert_eq!(balance_count, 2);

        // Check balances were updated correctly
        let eth_user_usd = orderbook
            .balances
            .get(&eth_user)
            .unwrap()
            .get("USD")
            .unwrap_or(&0);
        let usd_user_eth = orderbook
            .balances
            .get(&usd_user)
            .unwrap()
            .get("ETH")
            .unwrap_or(&0);

        assert_eq!(*eth_user_usd, 0); // Seller did not received USD
        assert_eq!(*usd_user_eth, 0); // Buyer did not received ETH

        // Check user correctly desposited the amount
        let eth_user_eth = orderbook
            .balances
            .get(&eth_user)
            .unwrap()
            .get("ETH")
            .unwrap();
        let usd_user_usd = orderbook
            .balances
            .get(&usd_user)
            .unwrap()
            .get("USD")
            .unwrap();

        assert_eq!(*eth_user_eth, 10 - 1); // Seller did not received USD
        assert_eq!(*usd_user_usd, 3000 - 1900); // Buyer did not received ETH
    }

    #[test_log::test]
    fn test_limit_order_match_same_quantity_higher_price() {
        let (eth_user, usd_user, mut orderbook) = setup();

        // Create a limit sell order first
        let sell_order = Order {
            owner: eth_user.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(0),
        };
        orderbook.execute_order(sell_order, &TX_CTX).unwrap();

        // Create a matching buy order
        let buy_order = Order {
            owner: usd_user.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: Some(2100),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(1),
        };

        let events = orderbook.execute_order(buy_order, &TX_CTX).unwrap();

        // Check that the order was executed
        assert_eq!(events.len(), 6);
        let executed_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::OrderExecuted { .. }))
            .count();
        let balance_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::BalanceUpdated { .. }))
            .count();
        assert_eq!(executed_count, 2);
        // usd_user received ETH
        // usd_user sent USD
        // orderbook sent ETH
        // eth_user received USD
        assert_eq!(balance_count, 4);

        // Check balances were updated correctly
        let eth_user_balances = orderbook.balances.get(&eth_user).unwrap();
        let usd_user_balances = orderbook.balances.get(&usd_user).unwrap();

        assert_eq!(*eth_user_balances.get("USD").unwrap(), 2000);
        assert_eq!(*eth_user_balances.get("ETH").unwrap(), 9);

        assert_eq!(*usd_user_balances.get("USD").unwrap(), 1000);
        assert_eq!(*usd_user_balances.get("ETH").unwrap(), 1);
    }

    #[test_log::test]
    fn test_limit_order_match_less_sell_quantity_same_price() {
        let (eth_user, usd_user, mut orderbook) = setup();

        // Create a limit sell order for 1 ETH
        let sell_order = Order {
            owner: eth_user.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: Some(1000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(0),
        };
        orderbook.execute_order(sell_order, &TX_CTX).unwrap();

        // Create a buy order for 2 ETH
        let buy_order = Order {
            owner: usd_user.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: Some(1000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 2,
            timestamp: TimestampMs(1),
        };

        let events = orderbook.execute_order(buy_order, &TX_CTX).unwrap();

        // Check that the order was NOT executed
        assert_eq!(events.len(), 7);
        let executed_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::OrderExecuted { .. }))
            .count();
        let created_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::OrderCreated { .. }))
            .count();
        let balance_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::BalanceUpdated { .. }))
            .count();
        assert_eq!(executed_count, 1);
        assert_eq!(created_count, 1);
        // eth_user received USD
        // usd_user sent USD
        // usd_user received ETH
        // orderbook received USD
        // orderbook sent ETH
        assert_eq!(balance_count, 5);

        assert_eq!(orderbook.orders.len(), 1);
        let only_order = orderbook.orders.values().next().unwrap();
        assert!(matches!(only_order.order_type, OrderType::Buy));

        // Check balances were updated correctly
        let eth_user_balances = orderbook.balances.get(&eth_user).unwrap();
        let usd_user_balances = orderbook.balances.get(&usd_user).unwrap();
        let orderbook_balances = orderbook
            .balances
            .get("orderbook")
            .unwrap();

        assert_eq!(*eth_user_balances.get("USD").unwrap(), 1000);
        assert_eq!(*eth_user_balances.get("ETH").unwrap(), 9);

        assert_eq!(*usd_user_balances.get("USD").unwrap(), 1000);
        assert_eq!(*usd_user_balances.get("ETH").unwrap(), 1);

        assert_eq!(*orderbook_balances.get("USD").unwrap(), 1000);
        assert_eq!(*orderbook_balances.get("ETH").unwrap(), 0);
    }

    #[test_log::test]
    fn test_partial_order_execution_same_price() {
        let (eth_user, usd_user, mut orderbook) = setup();

        // Create a limit sell order for 2 ETH
        let sell_order = Order {
            owner: eth_user.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 2,
            timestamp: TimestampMs(0),
        };
        orderbook.execute_order(sell_order, &TX_CTX).unwrap();

        // Create a buy order for 1 ETH
        let buy_order = Order {
            owner: usd_user.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(1),
        };

        let events = orderbook.execute_order(buy_order, &TX_CTX).unwrap();

        // Check that we got an OrderUpdate event
        assert!(events.iter().any(|event| matches!(event,
            OrderbookEvent::OrderUpdate {
                order_id,
                remaining_quantity,
                pair: _
            } if order_id == "sell1" && *remaining_quantity == 1
        )));

        // Check balances were updated correctly
        let seller_usd = orderbook
            .balances
            .get(&eth_user)
            .unwrap()
            .get("USD")
            .unwrap();
        let buyer_eth = orderbook
            .balances
            .get(&usd_user)
            .unwrap()
            .get("ETH")
            .unwrap();

        assert_eq!(*seller_usd, 2000); // Seller received USD for 1 ETH
        assert_eq!(*buyer_eth, 1); // Buyer received 1 ETH

        // Check that the sell order is still in the orderbook with updated quantity
        let remaining_order = orderbook.orders.get("sell1").unwrap();
        assert_eq!(remaining_order.quantity, 1);
    }

    #[test_log::test]
    fn test_partial_order_execution_higher_price() {
        let (eth_user, usd_user, mut orderbook) = setup();

        // Create a limit sell order for 2 ETH
        let sell_order = Order {
            owner: eth_user.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 2,
            timestamp: TimestampMs(0),
        };
        orderbook.execute_order(sell_order, &TX_CTX).unwrap();

        // Create a buy order for 1 ETH at a higher price
        let buy_order = Order {
            owner: usd_user.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: Some(2100),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(1),
        };

        let events = orderbook.execute_order(buy_order, &TX_CTX).unwrap();

        // Check that we got an OrderUpdate event
        assert!(events.iter().any(|event| matches!(event,
            OrderbookEvent::OrderUpdate {
                order_id,
                remaining_quantity,
                pair: _
            } if order_id == "sell1" && *remaining_quantity == 1
        )));

        // Check balances were updated correctly
        let seller_usd = orderbook
            .balances
            .get(&eth_user)
            .unwrap()
            .get("USD")
            .unwrap();
        let buyer_eth = orderbook
            .balances
            .get(&usd_user)
            .unwrap()
            .get("ETH")
            .unwrap();

        assert_eq!(*seller_usd, 2000); // Seller received USD for 1 ETH (at sell price)
        assert_eq!(*buyer_eth, 1); // Buyer received 1 ETH

        // Check that the sell order is still in the orderbook with updated quantity
        let remaining_order = orderbook.orders.get("sell1").unwrap();
        assert_eq!(remaining_order.quantity, 1);
    }

    #[test_log::test]
    fn test_market_sell_order_against_larger_buy_order() {
        let (eth_user, usd_user, mut orderbook) = setup();

        // Create a limit buy order first for 2 ETH
        let buy_order = Order {
            owner: usd_user.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: Some(1000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 2,
            timestamp: TimestampMs(0),
        };
        orderbook.execute_order(buy_order, &TX_CTX).unwrap();

        // Create a market sell order for 1 ETH
        let sell_order = Order {
            owner: eth_user.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: None, // Market order
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(1),
        };

        let events = orderbook.execute_order(sell_order, &TX_CTX).unwrap();

        // Order should be executed immediately at the buy order's price
        assert!(events.iter().any(|event| matches!(event, OrderbookEvent::OrderUpdate { 
            order_id,
            remaining_quantity,
            pair: _
        } if order_id == "buy1" && *remaining_quantity == 1)));

        // Check balances were updated correctly
        let eth_user_usd = orderbook.balances.get(&eth_user).unwrap().get("USD").unwrap();
        let usd_user_eth = orderbook.balances.get(&usd_user).unwrap().get("ETH").unwrap();

        assert_eq!(*eth_user_usd, 1000); // Seller got the buy order's price
        assert_eq!(*usd_user_eth, 1); // Buyer got their ETH
    }

    #[test_log::test]
    fn test_market_sell_order_against_exact_buy_order() {
        let (eth_user, usd_user, mut orderbook) = setup();

        // Create a limit buy order first for 1 ETH
        let buy_order = Order {
            owner: usd_user.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(0),
        };
        orderbook.execute_order(buy_order, &TX_CTX).unwrap();

        // Create a market sell order for 1 ETH
        let sell_order = Order {
            owner: eth_user.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: None, // Market order
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(1),
        };

        let events = orderbook.execute_order(sell_order, &TX_CTX).unwrap();

        assert_eq!(events.len(), 5);
        let executed_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::OrderExecuted { .. }))
            .count();
        let balance_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::BalanceUpdated { .. }))
            .count();
        assert_eq!(executed_count, 1);
        // eth_user sent ETH
        // usd_user received ETH
        // orderbook sent USD
        // eth_user received USD
        assert_eq!(balance_count, 4);

        // Assert orderbook is empty
        assert_eq!(orderbook.orders.len(), 0);


        // Check that balances haven't changed
        let eth_user_balances = orderbook.balances.get(&eth_user).unwrap();
        let usd_user_balances = orderbook.balances.get(&usd_user).unwrap();
        let orderbook_balances = orderbook.balances.get("orderbook").unwrap();

        assert_eq!(*eth_user_balances.get("ETH").unwrap(), 9); // eth_user sold 1 ETH ...
        assert_eq!(*eth_user_balances.get("USD").unwrap(), 2000); // .. for 2000 USD

        assert_eq!(*usd_user_balances.get("ETH").unwrap(), 1); // usd_user bought 1 ETH ...
        assert_eq!(*usd_user_balances.get("USD").unwrap(), 1000); // .. for 2000 USD

        assert_eq!(*orderbook_balances.get("ETH").unwrap_or(&0), 0); // orderbook is empty
        assert_eq!(*orderbook_balances.get("USD").unwrap_or(&0), 0); // orderbook is empty
    }

    #[test_log::test]
    fn test_market_sell_order_against_smaller_buy_order() {
        let (eth_user, usd_user, mut orderbook) = setup();

        // Create a limit buy order first for 1 ETH
        let buy_order = Order {
            owner: usd_user.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(0),
        };
        
        orderbook.execute_order(buy_order, &TX_CTX).unwrap();

        // Create a market sell order for 2 ETH
        let sell_order = Order {
            owner: eth_user.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: None, // Market order
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 2,
            timestamp: TimestampMs(1),
        };

        let events = orderbook.execute_order(sell_order, &TX_CTX).unwrap();

        assert_eq!(events.len(), 5);
        let executed_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::OrderExecuted { .. }))
            .count();
        let balance_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::BalanceUpdated { .. }))
            .count();
        assert_eq!(executed_count, 1);
        // eth_user sent ETH
        // usd_user received ETH
        // orderbook sent USD
        // eth_user received USD
        assert_eq!(balance_count, 4);

        // Assert orderbook is empty
        assert_eq!(orderbook.orders.len(), 0);


        // Check that balances haven't changed
        let eth_user_balances = orderbook.balances.get(&eth_user).unwrap();
        let usd_user_balances = orderbook.balances.get(&usd_user).unwrap();
        let orderbook_balances = orderbook.balances.get("orderbook").unwrap();

        assert_eq!(*eth_user_balances.get("ETH").unwrap(), 9); // eth_user sold 1 ETH ...
        assert_eq!(*eth_user_balances.get("USD").unwrap(), 2000); // .. for 2000 USD

        assert_eq!(*usd_user_balances.get("ETH").unwrap(), 1); // usd_user bought 1 ETH ...
        assert_eq!(*usd_user_balances.get("USD").unwrap(), 1000); // .. for 2000 USD

        assert_eq!(*orderbook_balances.get("ETH").unwrap_or(&0), 0); // orderbook is empty
        assert_eq!(*orderbook_balances.get("USD").unwrap_or(&0), 0); // orderbook is empty
    }

    // Tests with existing sell orders
    #[test_log::test]
    fn test_market_buy_order_against_larger_sell_order() {
        let (eth_user, usd_user, mut orderbook) = setup();

        // Create a limit sell order first for 2 ETH
        let sell_order = Order {
            owner: eth_user.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 2,
            timestamp: TimestampMs(0),
        };
        orderbook.execute_order(sell_order, &TX_CTX).unwrap();

        // Create a market buy order for 1 ETH
        let buy_order = Order {
            owner: usd_user.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: None, // Market order
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(1),
        };

        let events = orderbook.execute_order(buy_order, &TX_CTX).unwrap();

        // Order should be executed immediately at the sell order's price
        assert!(events.iter().any(|event| matches!(event, OrderbookEvent::OrderUpdate { 
            order_id,
            remaining_quantity,
            pair: _
        } if order_id == "sell1" && *remaining_quantity == 1)));

        // Check balances were updated correctly
        let eth_user_usd = orderbook.balances.get(&eth_user).unwrap().get("USD").unwrap();
        let usd_user_eth = orderbook.balances.get(&usd_user).unwrap().get("ETH").unwrap();

        assert_eq!(*eth_user_usd, 2000); // Seller got their asking price
        assert_eq!(*usd_user_eth, 1); // Buyer got their ETH
    }

    #[test_log::test]
    fn test_market_buy_order_against_exact_sell_order() {
        let (eth_user, usd_user, mut orderbook) = setup();

        // Create a limit sell order first for 1 ETH
        let sell_order = Order {
            owner: eth_user.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(0),
        };
        orderbook.execute_order(sell_order, &TX_CTX).unwrap();

        // Create a market buy order for 1 ETH
        let buy_order = Order {
            owner: usd_user.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: None, // Market order
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(1),
        };

        let events = orderbook.execute_order(buy_order, &TX_CTX).unwrap();

        // Both orders should be fully executed
        assert_eq!(
            events.iter().filter(|e| matches!(e, OrderbookEvent::OrderExecuted { .. })).count(),
            2
        );

        // Check balances
        let eth_user_usd = orderbook.balances.get(&eth_user).unwrap().get("USD").unwrap();
        let usd_user_eth = orderbook.balances.get(&usd_user).unwrap().get("ETH").unwrap();

        assert_eq!(*eth_user_usd, 2000);
        assert_eq!(*usd_user_eth, 1);
    }

    #[test_log::test]
    fn test_market_buy_order_against_smaller_sell_order() {
        let (eth_user, usd_user, mut orderbook) = setup();

        // Create a limit sell order first for 1 ETH
        let sell_order = Order {
            owner: eth_user.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 1,
            timestamp: TimestampMs(0),
        };
        orderbook.execute_order(sell_order, &TX_CTX).unwrap();

        // Create a market buy order for 2 ETH
        let buy_order = Order {
            owner: usd_user.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: None, // Market order
            pair: ("ETH".to_string(), "USD".to_string()),
            quantity: 2,
            timestamp: TimestampMs(1),
        };

        let events = orderbook.execute_order(buy_order, &TX_CTX).unwrap();

        assert_eq!(events.len(), 5);
        let executed_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::OrderExecuted { .. }))
            .count();
        let balance_count = events
            .iter()
            .filter(|e| matches!(e, OrderbookEvent::BalanceUpdated { .. }))
            .count();
        assert_eq!(executed_count, 1);
        // eth_user sent ETH
        // usd_user received ETH
        // orderbook sent USD
        // eth_user received USD
        assert_eq!(balance_count, 4);

        // Assert orderbook is empty
        assert_eq!(orderbook.orders.len(), 0);


        // Check that balances haven't changed
        let eth_user_balances = orderbook.balances.get(&eth_user).unwrap();
        let usd_user_balances = orderbook.balances.get(&usd_user).unwrap();
        let orderbook_balances = orderbook.balances.get("orderbook").unwrap();

        assert_eq!(*eth_user_balances.get("ETH").unwrap(), 9); // eth_user sold 1 ETH ...
        assert_eq!(*eth_user_balances.get("USD").unwrap(), 2000); // .. for 2000 USD

        assert_eq!(*usd_user_balances.get("ETH").unwrap(), 1); // usd_user bought 1 ETH ...
        assert_eq!(*usd_user_balances.get("USD").unwrap(), 1000); // .. for 2000 USD

        assert_eq!(*orderbook_balances.get("ETH").unwrap_or(&0), 0); // orderbook is empty
        assert_eq!(*orderbook_balances.get("USD").unwrap_or(&0), 0); // orderbook is empty
    }
}
