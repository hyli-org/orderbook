// API response types that match the backend format
export interface ApiOrder {
  owner: string;
  order_id: string;
  order_type: "Buy" | "Sell";
  price: number;
  pair: [string, string];
  quantity: number;
  timestamp: number;
}

export interface ApiOrderbookResponse {
  buy_orders: ApiOrder[];
  sell_orders: ApiOrder[];
}

// Environment configuration
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  ENDPOINTS: {
    ORDERBOOK: '/v1/indexer/contract/orderbook/orders/pair',
  },
} as const; 