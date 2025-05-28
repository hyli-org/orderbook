import type { Order } from './orderbook';

export interface ApiOrderbookResponse {
  buy_orders: Order[];
  sell_orders: Order[];
}

// Environment configuration
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  ENDPOINTS: {
    ORDERBOOK: '/v1/indexer/contract/orderbook/orders/pair',
  },
} as const; 