import type { Order, OrderbookState } from '../types/orderbook';
import { useState, useMemo } from 'react';
import type { OrderbookFocus } from '../components/Orderbook/types';
import { OrderType } from '../models/Orderbook';

export const generateMockOrder = (price: number, quantity: number): Order & { total: number } => ({
  owner: 'user',
  order_id: '1',
  order_type: OrderType.Buy,
  pair: ['BTC', 'USDC'],
  timestamp: Date.now(),
  price,
  quantity,
  total: price * quantity,
});

export const generateMockOrderbook = (count: number = 10): OrderbookState => {
  const bids: Order[] = [];
  const asks: Order[] = [];
  let lastBidPrice = 100;
  let lastAskPrice = 101;

  for (let i = 0; i < count; i++) {
    lastBidPrice -= Math.random() * 0.1 + 0.01; // ensure price changes
    bids.push(generateMockOrder(parseFloat(lastBidPrice.toFixed(5)), Math.random() * 10));
    lastAskPrice += Math.random() * 0.1 + 0.01; // ensure price changes
    asks.push(generateMockOrder(parseFloat(lastAskPrice.toFixed(5)), Math.random() * 10));
  }
  
  const sortedBids = bids.sort((a, b) => b.price - a.price);
  const sortedAsks = asks.sort((a, b) => a.price - b.price);

  const spread = sortedAsks.length > 0 && sortedBids.length > 0 ? sortedAsks[0].price - sortedBids[0].price : 0;
  const spreadPercentage = sortedBids.length > 0 && sortedBids[0].price > 0 ? (spread / sortedBids[0].price) * 100 : 0;

  return {
    bids: sortedBids,
    asks: sortedAsks,
    spread,
    spreadPercentage,
  };
};

export type OrderbookSortField = 'price' | 'size' | 'total';
export type OrderbookSortDirection = 'asc' | 'desc';


export const useOrderbook = (initialBids?: Order[], initialAsks?: Order[], initialFocus: OrderbookFocus = 'all') => {
  const [focus, setFocusState] = useState<OrderbookFocus>(initialFocus);
  // TODO: Implement sorting
  // const [sortField, setSortField] = useState<OrderbookSortField>('price');
  // const [sortDirection, setSortDirection] = useState<OrderbookSortDirection>('desc');
  // TODO: Implement grouping
  // const [grouping, setGrouping] = useState<number>(1);


  const baseOrderbook = useMemo(() => {
    if (initialBids && initialAsks) {
      // Ensure asks are sorted ascending and bids descending for correct spread calculation
      const sortedAsks = [...initialAsks].sort((a,b) => a.price - b.price);
      const sortedBids = [...initialBids].sort((a,b) => b.price - a.price);
      const spread = sortedAsks.length > 0 && sortedBids.length > 0 && sortedAsks[0].price > sortedBids[0].price ? sortedAsks[0].price - sortedBids[0].price : 0;
      const spreadPercentage = sortedBids.length > 0 && sortedBids[0].price > 0 ? (spread / sortedBids[0].price) * 100 : 0;
      return { bids: sortedBids, asks: sortedAsks, spread, spreadPercentage};
    }
    return generateMockOrderbook();
  }, [initialBids, initialAsks]);

  // Removed unused GHOST_ORDERBOOK_FOR_COMPILATION

  const displayedBids = useMemo(() => {
    if (focus === 'asks') return [];
    // TODO: Apply sorting and grouping
    return baseOrderbook.bids;
  }, [baseOrderbook.bids, focus]);

  const displayedAsks = useMemo(() => {
    if (focus === 'bids') return [];
    // TODO: Apply sorting and grouping
    return baseOrderbook.asks;
  }, [baseOrderbook.asks, focus]);

  const orderbook = useMemo((): OrderbookState => ({
    bids: displayedBids,
    asks: displayedAsks,
    spread: baseOrderbook.spread,
    spreadPercentage: baseOrderbook.spreadPercentage,
  }), [displayedBids, displayedAsks, baseOrderbook.spread, baseOrderbook.spreadPercentage]);

  const setFocus = (newFocus: OrderbookFocus) => {
    setFocusState(newFocus);
    // onFocusChange prop can be called here if passed to the hook
  };


  return {
    orderbook,
    focus,
    setFocus,
    // TODO: Expose sorting and grouping functions
  };
}; 