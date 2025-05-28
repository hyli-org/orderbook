import React, { createContext, useContext, type ReactNode } from 'react';
import { useOrderbookManager } from '../hooks/useOrderbookManager';
import { useAppContext } from './AppContext'; // To get the current pair
import type { OrderbookState, Order } from '../types/orderbook';

interface OrderbookContextType {
  orderbook: OrderbookState;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  addLocalOrder: (order: Order) => void;
}

const OrderbookContext = createContext<OrderbookContextType | undefined>(undefined);

export const OrderbookProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { state: appGlobalState } = useAppContext();
  const manager = useOrderbookManager(appGlobalState.currentPair);

  // Ensure the manager object includes all necessary functions and state
  const contextValue: OrderbookContextType = {
    orderbook: manager.orderbook,
    loading: manager.loading,
    error: manager.error,
    refetch: manager.refetch,
    addLocalOrder: manager.addLocalOrder,
  };

  return (
    <OrderbookContext.Provider value={contextValue}>
      {children}
    </OrderbookContext.Provider>
  );
};

export const useOrderbookContext = () => {
  const context = useContext(OrderbookContext);
  if (context === undefined) {
    throw new Error('useOrderbookContext must be used within an OrderbookProvider');
  }
  return context;
}; 