#[cfg(test)]
mod tests {
    use crate::*;
    use sdk::Identity;
    use std::collections::HashMap;

    fn setup() -> Orderbook {
        Orderbook::default()
    }

    fn create_user_with_balance(
        orderbook: &mut Orderbook,
        token1: &str,
        amount1: u32,
        token2: &str,
        amount2: u32,
    ) -> Identity {
        let user = Identity::from([1u8; 32]);
        let mut balances = HashMap::new();
        balances.insert(token1.to_string(), amount1);
        balances.insert(token2.to_string(), amount2);
        orderbook.balances.insert(user.clone(), balances);
        user
    }

    #[test]
    fn test_limit_order_create() {
        let mut orderbook = setup();
        let user = create_user_with_balance(&mut orderbook, "ETH", 100, "USDC", 10000);

        // Create a limit sell order
        let order = Order {
            owner: user.clone(),
            order_id: "order1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: TokenPair("ETH".to_string(), "USDC".to_string()),
            quantity: 1,
            timestamp: 0,
        };

        let events = orderbook.execute_order(order.clone()).unwrap();

        // Check that the order was created
        assert_eq!(events.len(), 1);
        match &events[0] {
            OrderbookEvent::OrderCreated {
                order: created_order,
            } => {
                assert_eq!(created_order.order_id, "order1");
                assert_eq!(created_order.price, Some(2000));
            }
            _ => panic!("Expected OrderCreated event"),
        }

        // Check that the order is in the sell orders list
        assert!(orderbook.orders.contains_key("order1"));
        assert!(orderbook
            .sell_orders
            .get(&TokenPair("ETH".to_string(), "USDC".to_string()))
            .unwrap()
            .contains(&"order1".to_string()));
    }

    #[test]
    fn test_limit_order_match() {
        let mut orderbook = setup();

        // Create two users with balances
        let seller = create_user_with_balance(&mut orderbook, "ETH", 100, "USDC", 0);
        let buyer = create_user_with_balance(&mut orderbook, "ETH", 0, "USDC", 10000);

        // Create a limit sell order first
        let sell_order = Order {
            owner: seller.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: TokenPair("ETH".to_string(), "USDC".to_string()),
            quantity: 1,
            timestamp: 0,
        };
        orderbook.execute_order(sell_order).unwrap();

        // Create a matching buy order
        let buy_order = Order {
            owner: buyer.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: Some(2000),
            pair: TokenPair("ETH".to_string(), "USDC".to_string()),
            quantity: 1,
            timestamp: 1,
        };

        let events = orderbook.execute_order(buy_order).unwrap();

        // Check that the order was executed
        assert!(events.iter().any(|event| matches!(event, OrderbookEvent::OrderExecuted { order_id } if order_id == "sell1")));

        // Check balances were updated correctly
        let seller_usdc = orderbook
            .balances
            .get(&seller)
            .unwrap()
            .get("USDC")
            .unwrap();
        let buyer_eth = orderbook.balances.get(&buyer).unwrap().get("ETH").unwrap();

        assert_eq!(*seller_usdc, 2000); // Seller received USDC
        assert_eq!(*buyer_eth, 1); // Buyer received ETH
    }

    #[test]
    fn test_market_order_execution() {
        let mut orderbook = setup();

        // Create two users with balances
        let seller = create_user_with_balance(&mut orderbook, "ETH", 100, "USDC", 0);
        let buyer = create_user_with_balance(&mut orderbook, "ETH", 0, "USDC", 10000);

        // Create a limit sell order first
        let sell_order = Order {
            owner: seller.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: TokenPair("ETH".to_string(), "USDC".to_string()),
            quantity: 1,
            timestamp: 0,
        };
        orderbook.execute_order(sell_order).unwrap();

        // Create a market buy order
        let market_buy = Order {
            owner: buyer.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: None, // Market order
            pair: TokenPair("ETH".to_string(), "USDC".to_string()),
            quantity: 1,
            timestamp: 1,
        };

        let events = orderbook.execute_order(market_buy).unwrap();

        // Check that the order was executed
        assert!(events.iter().any(|event| matches!(event, OrderbookEvent::OrderExecuted { order_id } if order_id == "sell1")));

        // Check balances were updated correctly
        let seller_usdc = orderbook
            .balances
            .get(&seller)
            .unwrap()
            .get("USDC")
            .unwrap();
        let buyer_eth = orderbook.balances.get(&buyer).unwrap().get("ETH").unwrap();

        assert_eq!(*seller_usdc, 2000); // Seller received USDC
        assert_eq!(*buyer_eth, 1); // Buyer received ETH
    }

    #[test]
    fn test_partial_order_execution() {
        let mut orderbook = setup();

        // Create two users with balances
        let seller = create_user_with_balance(&mut orderbook, "ETH", 100, "USDC", 0);
        let buyer = create_user_with_balance(&mut orderbook, "ETH", 0, "USDC", 10000);

        // Create a limit sell order for 2 ETH
        let sell_order = Order {
            owner: seller.clone(),
            order_id: "sell1".to_string(),
            order_type: OrderType::Sell,
            price: Some(2000),
            pair: TokenPair("ETH".to_string(), "USDC".to_string()),
            quantity: 2,
            timestamp: 0,
        };
        orderbook.execute_order(sell_order).unwrap();

        // Create a buy order for 1 ETH
        let buy_order = Order {
            owner: buyer.clone(),
            order_id: "buy1".to_string(),
            order_type: OrderType::Buy,
            price: Some(2000),
            pair: TokenPair("ETH".to_string(), "USDC".to_string()),
            quantity: 1,
            timestamp: 1,
        };

        let events = orderbook.execute_order(buy_order).unwrap();

        // Check that we got an OrderUpdate event
        assert!(events.iter().any(|event| matches!(event,
            OrderbookEvent::OrderUpdate {
                order_id,
                remaining_quantity
            } if order_id == "sell1" && *remaining_quantity == 1
        )));

        // Check balances were updated correctly
        let seller_usdc = orderbook
            .balances
            .get(&seller)
            .unwrap()
            .get("USDC")
            .unwrap();
        let buyer_eth = orderbook.balances.get(&buyer).unwrap().get("ETH").unwrap();

        assert_eq!(*seller_usdc, 2000); // Seller received USDC for 1 ETH
        assert_eq!(*buyer_eth, 1); // Buyer received 1 ETH

        // Check that the sell order is still in the orderbook with updated quantity
        let remaining_order = orderbook.orders.get("sell1").unwrap();
        assert_eq!(remaining_order.quantity, 1);
    }
}
