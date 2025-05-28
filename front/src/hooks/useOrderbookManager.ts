import { useState, useEffect, useCallback } from 'react';
import type { Order, OrderbookState } from '../types/orderbook';
import { fetchOrderbookData, parsePairString } from '../services/orderbookApi';

const EMPTY_ORDERBOOK: OrderbookState = {
  bids: [],
  asks: [],
  spread: 0,
  spreadPercentage: 0,
};

// Helper to sort and update spread
const calculateSpread = (bids: Order[], asks: Order[]): { spread: number; spreadPercentage: number } => {
  if (bids.length === 0 || asks.length === 0) {
    return { spread: 0, spreadPercentage: 0 };
  }
  // Ensure bids are sorted descending and asks ascending by price
  const bestBidPrices = bids.map(b => b.price);
  const bestAskPrices = asks.map(a => a.price);

  if (bestBidPrices.length === 0 || bestAskPrices.length === 0) {
    return { spread: 0, spreadPercentage: 0 };
  }

  const bestBid = Math.max(...bestBidPrices);
  const bestAsk = Math.min(...bestAskPrices);

  if (bestAsk >= bestBid) {
    const spreadValue = bestAsk - bestBid;
    const spreadPercentageValue = bestBid > 0 ? (spreadValue / bestBid) * 100 : Infinity; // Avoid division by zero
    return { spread: spreadValue, spreadPercentage: spreadPercentageValue };
  }
  return { spread: 0, spreadPercentage: 0 }; // Or handle crossed book case
};

export const useOrderbookManager = (pairString: string | null) => {
  console.log('[useOrderbookManager] Hook initialized/re-rendered with pairString:', pairString);
  const [orderbook, setOrderbook] = useState<OrderbookState>(EMPTY_ORDERBOOK);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (currentPair: string) => {
    console.log('[useOrderbookManager fetchData] Called for pair:', currentPair, 'Current loading state:', loading);
    if (!currentPair) {
      console.log('[useOrderbookManager fetchData] No currentPair, setting EMPTY_ORDERBOOK');
      setOrderbook(EMPTY_ORDERBOOK);
      setLoading(false);
      setError(null);
      return;
    }
    console.log('[useOrderbookManager fetchData] Setting loading true for pair:', currentPair);
    setLoading(true);
    setError(null);
    try {
      const { baseAsset, quoteAsset } = parsePairString(currentPair);
      console.log('[useOrderbookManager fetchData] Fetching data for assets:', baseAsset, quoteAsset);
      const initialOrderbook = await fetchOrderbookData(baseAsset, quoteAsset);
      console.log('[useOrderbookManager fetchData] Data fetched for pair:', currentPair, 'Data:', initialOrderbook);
      setOrderbook(initialOrderbook);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch orderbook data';
      setError(errorMessage);
      console.error('Error fetching initial orderbook:', err);
      // Optionally reset or keep stale data. Current: keep stale if fetch fails.
      // setOrderbook(EMPTY_ORDERBOOK); 
    } finally {
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(() => {
    if (pairString) {
      fetchData(pairString);
    }
  }, [pairString, fetchData]);

  // Effect for initial data fetch and when pairString changes
  useEffect(() => {
    console.log('[useOrderbookManager useEffect] pairString received:', pairString);
    if (pairString) {
      fetchData(pairString);
    } else {
      // Clear orderbook and loading state if pairString becomes null
      setOrderbook(EMPTY_ORDERBOOK);
      setLoading(false);
      setError(null);
    }
  }, [pairString, fetchData]); // Dependency array ensures this runs when pairString or fetchData changes

  // Function to add an order locally without an API call
  const addLocalOrder = useCallback((newOrder: Order) => {
    setOrderbook(prevOrderbook => {
      let updatedBids = [...prevOrderbook.bids];
      let updatedAsks = [...prevOrderbook.asks];

      if (newOrder.order_type === 'Buy') {
        updatedBids.push(newOrder);
        updatedBids.sort((a, b) => b.price - a.price); // Maintain sort: highest price first
      } else { // Sell
        updatedAsks.push(newOrder);
        updatedAsks.sort((a, b) => a.price - b.price); // Maintain sort: lowest price first
      }
      // Recalculate spread after adding the new order
      const { spread, spreadPercentage } = calculateSpread(updatedBids, updatedAsks);
      return { ...prevOrderbook, bids: updatedBids, asks: updatedAsks, spread, spreadPercentage };
    });
  }, []); // No dependencies needed for this purely state-updating function

  // Function to remove an order locally by order_id
  const removeLocalOrder = useCallback((orderId: string) => {
    setOrderbook(prevOrderbook => {
      const updatedBids = prevOrderbook.bids.filter(order => order.order_id !== orderId);
      const updatedAsks = prevOrderbook.asks.filter(order => order.order_id !== orderId);
      
      const { spread, spreadPercentage } = calculateSpread(updatedBids, updatedAsks);
      return { ...prevOrderbook, bids: updatedBids, asks: updatedAsks, spread, spreadPercentage };
    });
  }, []);

  // Function to update an order's quantity locally by order_id
  const updateLocalOrder = useCallback((orderId: string, newQuantity: number) => {
    setOrderbook(prevOrderbook => {
      const updateOrderList = (orders: Order[]): Order[] => 
        orders.map(order => 
          order.order_id === orderId ? { ...order, quantity: newQuantity } : order
        ).filter(order => order.quantity > 0); // Remove if quantity becomes zero or less

      const updatedBids = updateOrderList([...prevOrderbook.bids]);
      const updatedAsks = updateOrderList([...prevOrderbook.asks]);

      // Re-sort as quantity change might affect price-time priority if we were using it, 
      // but primarily to ensure lists are consistently processed for spread calculation.
      updatedBids.sort((a, b) => b.price - a.price);
      updatedAsks.sort((a, b) => a.price - b.price);

      const { spread, spreadPercentage } = calculateSpread(updatedBids, updatedAsks);
      return { ...prevOrderbook, bids: updatedBids, asks: updatedAsks, spread, spreadPercentage };
    });
  }, []);

  return {
    orderbook,
    loading,
    error,
    refetch,
    addLocalOrder, // Expose the function to add orders locally
    removeLocalOrder, // Expose the function to remove orders locally
    updateLocalOrder, // Expose the function to update orders locally
  };
};