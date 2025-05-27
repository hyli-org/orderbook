import { useState, useEffect, useCallback } from 'react';
import type { OrderbookState } from '../types/orderbook';
import { fetchOrderbookData, parsePairString } from '../services/orderbookApi';

interface UseOrderbookDataReturn {
  orderbook: OrderbookState;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const EMPTY_ORDERBOOK: OrderbookState = {
  bids: [],
  asks: [],
  spread: 0,
  spreadPercentage: 0,
};

/**
 * Hook to fetch and manage orderbook data from the API
 */
export const useOrderbookData = (pairString: string, refreshInterval?: number): UseOrderbookDataReturn => {
  const [orderbook, setOrderbook] = useState<OrderbookState>(EMPTY_ORDERBOOK);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const { baseAsset, quoteAsset } = parsePairString(pairString);
      const orderbookData = await fetchOrderbookData(baseAsset, quoteAsset);
      setOrderbook(orderbookData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch orderbook data';
      setError(errorMessage);
      console.error('Error fetching orderbook:', err);
      // Keep the previous orderbook data on error, don't reset to empty
    } finally {
      setLoading(false);
    }
  }, [pairString]);

  const refetch = useCallback(async () => {
    setLoading(true);
    await fetchData();
  }, [fetchData]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set up refresh interval only if explicitly provided
  useEffect(() => {
    if (refreshInterval === undefined || refreshInterval <= 0) return;

    const interval = setInterval(() => {
      fetchData();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  return {
    orderbook,
    loading,
    error,
    refetch,
  };
}; 