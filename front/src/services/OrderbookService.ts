import type { OrderbookState, Order } from "../types/orderbook";

class OrderbookService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL;
  }

  async getOrderbookState(): Promise<OrderbookState> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/indexer/contract/orderbook/state`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching orderbook state:', error);
      throw error;
    }
  }

  async getAllBalances(): Promise<Record<string, Record<string, number>>> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/indexer/contract/orderbook/balances`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching balances:', error);
      throw error;
    }
  }

  async getBalanceForAccount(account: string): Promise<Record<string, number>> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/indexer/contract/orderbook/balances/${account}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching account balance:', error);
      throw error;
    }
  }

  async getAllOrders(): Promise<Record<string, Order>> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/indexer/contract/orderbook/orders`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }
  }

  async getOrdersByPair(baseToken: string, quoteToken: string): Promise<{
    buy_orders: Order[];
    sell_orders: Order[];
  }> {
    try {
      console.log("fetching orders by pair");
      console.log(`${this.baseUrl}/v1/indexer/contract/orderbook/orders/pair/${baseToken}/${quoteToken}`);
      const response = await fetch(`${this.baseUrl}/v1/indexer/contract/orderbook/orders/pair/${baseToken}/${quoteToken}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching orders by pair:', error);
      throw error;
    }
  }

  async getOrdersByUser(address: string): Promise<Order[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/indexer/contract/orderbook/orders/user/${address}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching user orders:', error);
      throw error;
    }
  }
}

export const orderbookService = new OrderbookService();
