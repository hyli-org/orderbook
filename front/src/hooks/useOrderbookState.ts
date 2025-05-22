import { useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import type { OrderbookFocus } from '../components/Orderbook/types';

export const useOrderbookState = () => {
  const { state, dispatch } = useAppContext();

  const setFocus = useCallback((focus: OrderbookFocus) => {
    dispatch({ type: 'SET_ORDERBOOK_FOCUS', payload: focus });
  }, [dispatch]);

  // The orderbook data itself is derived directly from state.orderbook,
  // which is updated by useTradingData or other potential sources in the future.
  return {
    orderbook: state.orderbook,
    focus: state.orderbookFocus,
    setFocus,
  };
}; 