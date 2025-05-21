// Order and Orderbook interfaces
export interface Order {
  price: number;
  size: number;
  total: number;
}

export interface OrderbookState {
  bids: Order[];
  asks: Order[];
  spread: number;
  spreadPercentage: number;
} 