import type { Order, OrderbookState } from '../types/orderbook';
import { useState, useMemo } from 'react';
import type { OrderbookFocus } from '../components/Orderbook/types';

export const generateMockOrder = (price: number, quantity: number, orderType: 'Buy' | 'Sell'): Order => ({
  order_id: Math.random().toString(36).substring(7),
  owner: 'mock_user',
  order_type: orderType,
  price,
  quantity,
  pair: ['ORANJ', 'USDC'],
  timestamp: Date.now()
});

export const generateMockOrderbook = (count: number = 10): OrderbookState => {
  const orders: Record<string, Order> = {};
  const buyOrders: Record<string, string[]> = {};
  const sellOrders: Record<string, string[]> = {};
  const pairKey = 'ORANJ,USDC';

  buyOrders[pairKey] = [];
  sellOrders[pairKey] = [];

  let lastBuyPrice = 100;
  let lastSellPrice = 101;

  // Generate buy orders (highest to lowest price)
  for (let i = 0; i < count; i++) {
    lastBuyPrice *= (1 - Math.random() * 0.01);
    const order = generateMockOrder(
      parseFloat(lastBuyPrice.toFixed(5)), 
      Math.random() * 10 + 1,
      'Buy'
    );
    orders[order.order_id] = order;
    buyOrders[pairKey].push(order.order_id);
  }

  // Generate sell orders (lowest to highest price)
  for (let i = 0; i < count; i++) {
    lastSellPrice *= (1 + Math.random() * 0.01);
    const order = generateMockOrder(
      parseFloat(lastSellPrice.toFixed(5)), 
      Math.random() * 10 + 1,
      'Sell'
    );
    orders[order.order_id] = order;
    sellOrders[pairKey].push(order.order_id);
  }

  return {
    orders,
    buy_orders: buyOrders,
    sell_orders: sellOrders,
    balances: {}
  };
};

export const useOrderbook = (initialBuyOrders?: Order[], initialSellOrders?: Order[], initialFocus: OrderbookFocus = 'all') => {
  const [focus, setFocusState] = useState<OrderbookFocus>(initialFocus);

  const baseOrderbook = useMemo(() => {
    if (!initialBuyOrders || !initialSellOrders) {
      return generateMockOrderbook();
    }

    // Convert arrays to OrderbookState format
    const orders: Record<string, Order> = {};
    const buyOrders: Record<string, string[]> = { 'ORANJ,USDC': [] };
    const sellOrders: Record<string, string[]> = { 'ORANJ,USDC': [] };

    initialBuyOrders.forEach(order => {
      orders[order.order_id] = order;
      buyOrders['ORANJ,USDC'].push(order.order_id);
    });

    initialSellOrders.forEach(order => {
      orders[order.order_id] = order;
      sellOrders['ORANJ,USDC'].push(order.order_id);
    });

    return {
      orders,
      buy_orders: buyOrders,
      sell_orders: sellOrders,
      balances: {}
    };
  }, [initialBuyOrders, initialSellOrders]);

  const displayedBuyOrders = useMemo(() => {
    if (focus === 'sell') return [];
    const orderIds = Object.values(baseOrderbook.buy_orders)[0] || [];
    return orderIds
      .map(id => baseOrderbook.orders[id])
      .filter((order): order is Order => order !== undefined)
      .sort((a, b) => (b.price || 0) - (a.price || 0));
  }, [baseOrderbook.buy_orders, baseOrderbook.orders, focus]);

  const displayedSellOrders = useMemo(() => {
    if (focus === 'buy') return [];
    const orderIds = Object.values(baseOrderbook.sell_orders)[0] || [];
    return orderIds
      .map(id => baseOrderbook.orders[id])
      .filter((order): order is Order => order !== undefined)
      .sort((a, b) => (a.price || 0) - (b.price || 0));
  }, [baseOrderbook.sell_orders, baseOrderbook.orders, focus]);

  const orderbook = useMemo(() => {
    const highestBuyPrice = displayedBuyOrders[0]?.price || 0;
    const lowestSellPrice = displayedSellOrders[0]?.price || 0;
    const spread = Math.max(0, lowestSellPrice - highestBuyPrice);
    const spreadPercentage = highestBuyPrice > 0 ? (spread / highestBuyPrice) * 100 : 0;

    return {
      buyOrders: displayedBuyOrders,
      sellOrders: displayedSellOrders,
      spread,
      spreadPercentage
    };
  }, [displayedBuyOrders, displayedSellOrders]);

  const setFocus = (newFocus: OrderbookFocus) => {
    setFocusState(newFocus);
  };

  return {
    orderbook,
    focus,
    setFocus,
  };
};