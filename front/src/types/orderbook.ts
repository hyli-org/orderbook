// Order and Orderbook interfaces
export interface Order {
  owner: string;
  order_id: string;
  order_type: "Buy" | "Sell";
  price: number;
  pair: [string, string];
  quantity: number;
  timestamp: number;
}

export interface OrderbookState {
  bids: Order[];
  asks: Order[];
  spread: number;
  spreadPercentage: number;
}

export type OrderbookEvent =
  | { type: "OrderCreated"; data: Order }
  | { type: "OrderCancelled"; data: { order_id: string; pair: [string, string]; user: string } }
  | { type: "OrderExecuted"; data: { order_id: string; pair: [string, string]; price: number; quantity: number; taker_user: string; maker_user: string } }
  | { type: "OrderUpdate"; data: { order_id: string; pair: [string, string]; new_quantity: number } } // Assuming OrderUpdate carries new_quantity
  | { type: "BalanceUpdated"; data: { user: string; token: string; new_balance: number } }; // Assuming BalanceUpdated carries this structure 