import { useCallback, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { orderbookService } from '../services/OrderbookService';
import type { OrderbookFocus } from '../components/Orderbook/types';
import type { Order } from '../types/orderbook';

export const useOrderbookState = () => {
  const { state, dispatch } = useAppContext();
  const currentPair = state.currentPair?.split('/') || ["ORANJ", "USDC"];
  
  const setFocus = useCallback((focus: OrderbookFocus) => {
    dispatch({ type: 'SET_ORDERBOOK_FOCUS', payload: focus });
  }, [dispatch]);

  const loadOrders = useCallback(async (base: string, quote: string) => {
    try {
      const pairKey = `${base},${quote}`;
      const pairOrders = await orderbookService.getOrdersByPair(base, quote);
      console.log('Pair Orders:', pairOrders);
      dispatch({ 
        type: 'UPDATE_ORDERBOOK', 
        payload: {
          balances: {},
          orders: pairOrders.buy_orders.concat(pairOrders.sell_orders).reduce((acc, order) => {
            acc[order.order_id] = order;
            return acc;
          }, {} as Record<string, Order>),
          buy_orders: { [pairKey]: pairOrders.buy_orders.map(o => o.order_id) },
          sell_orders: { [pairKey]: pairOrders.sell_orders.map(o => o.order_id) }
        }
      });
    } catch (error) {
      console.error('Error loading orders:', error);
    }
  }, [dispatch]);

  // Load orders only once at mount or when pair changes intentionally
  useEffect(() => {
    if (currentPair[0] && currentPair[1]) {
      console.log('Loading orders for pair:', currentPair.join('/'));
      loadOrders(currentPair[0], currentPair[1]);
    }
  }, [state.currentPair]); // Only depend on the intentional pair changes

  return {
    orderbook: state.orderbook,
    focus: state.orderbookFocus,
    setFocus,
  };
};