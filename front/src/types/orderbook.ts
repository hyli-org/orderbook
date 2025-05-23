// Order and Orderbook interfaces
export interface Order {
  owner: string;
  order_id: string;
  order_type: 'Buy' | 'Sell';
  price?: number;
  pair: [string, string];
  quantity: number;
  timestamp: number;
}

export interface OrderbookState {
  balances: Record<string, Record<string, number>>;
  orders: Record<string, Order>;
  buy_orders: Record<string, string[]>;
  sell_orders: Record<string, string[]>;
} 


export interface OrderbookEvent {
  OrderCreated?: { order: Order };
  OrderCancelled?: { order_id: string };
  OrderExecuted?: { order_id: string };
  OrderUpdate?: { order_id: string; remaining_quantity: number };
  BalanceUpdated?: { user: { 0: string }; token: string; amount: number };
}