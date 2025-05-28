import React, { useMemo } from 'react';
import { OrderbookHeader } from './OrderbookHeader';
import { OrderbookRow } from './OrderbookRow';
import { OrderbookSpread } from './OrderbookSpread';
import { useOrderbookState } from '../../hooks/useOrderbookState';
// import { useOrderbookManager } from '../../hooks/useOrderbookManager'; // No longer needed
import { useAppContext } from '../../contexts/AppContext';
import { useOrderbookContext } from '../../contexts/OrderbookContext'; // Import useOrderbookContext
import type { Order } from '../../types/orderbook';
import type { OrderbookProps } from './types';

interface OrderbookComponentProps extends Omit<OrderbookProps, 'bids' | 'asks' | 'focus' | 'onFocusChange'> {
  // refreshInterval?: number; // Optional refresh interval in milliseconds - No longer needed here, manager handles updates
}

export const Orderbook: React.FC<OrderbookComponentProps> = ({
  showHeader = true,
  showSpread = true,
  maxRows = 10,
  precision = 5,
  // grouping = 1, // Grouping not implemented in manager yet, remove for now or pass through
  onOrderClick,
  // refreshInterval, // No longer needed
}) => {
  // const { state: appGlobalState } = useAppContext(); // No longer needed directly for pair
  const { focus, setFocus } = useOrderbookState();
  
  // Use the context to get orderbook data and functions
  const { orderbook, loading, error, refetch } = useOrderbookContext();

  console.log("Orderbook state", orderbook);
  const { state } = useAppContext();
  console.log("App state", state);
  const { bids, asks, spread, spreadPercentage } = orderbook;

  // Define a new type for aggregated orders that includes the calculated total
  type AggregatedOrder = Order & { total: number; aggregatedQuantity: number; orderCount: number };

  // Function to group orders by price and aggregate quantities
  const groupOrdersByPrice = (orders: Order[]): Order[] => {
    const priceMap = new Map<number, Order[]>();
    
    // Group orders by price
    orders.forEach(order => {
      const price = order.price;
      if (!priceMap.has(price)) {
        priceMap.set(price, []);
      }
      priceMap.get(price)!.push(order);
    });

    // Aggregate orders at each price level
    const aggregatedOrders: Order[] = [];
    priceMap.forEach((ordersAtPrice) => {
      const totalQuantity = ordersAtPrice.reduce((sum, order) => sum + order.quantity, 0);
      
      // Use the first order as the base and update quantity to be the aggregated amount
      const aggregatedOrder: Order = {
        ...ordersAtPrice[0], // Take the first order as the base
        quantity: totalQuantity, // Set quantity to the sum of all orders at this price
      };
      
      aggregatedOrders.push(aggregatedOrder);
    });

    return aggregatedOrders;
  };

  const calculateCumulativeTotal = (orders: Order[]): AggregatedOrder[] => {
    let cumulativeTotal = 0;
    return orders.map(order => {
      cumulativeTotal += order.quantity;
      return { 
        ...order, 
        total: cumulativeTotal,
        aggregatedQuantity: order.quantity,
        orderCount: 1 // This could be enhanced to track actual order count if needed
      };
    });
  };

  const getProcessedOrders = (orders: AggregatedOrder[], isAsks: boolean, count: number): AggregatedOrder[] => {
    let processed = isAsks ? orders.slice(0, count) : orders.slice(0, count);
    // Asks are typically displayed with the lowest price (closest to spread) at the bottom,
    // and cumulative total increasing upwards. The raw asks array is sorted ascending by price.
    // If reversing for display (to show lowest price at top), the cumulative total logic might need adjustment
    // depending on whether it was calculated on the original or reversed array.
    // For now, assuming reversal is for display order only and cumulative total is already correct.
    if (isAsks) {
      processed = processed.reverse(); // Reversing for display order (lowest ask price at the top)
    }
    return processed;
  };

  const displayedAsks = useMemo(() => {
    // First group orders by price, then calculate cumulative totals
    const groupedAsks = groupOrdersByPrice(asks);
    const asksWithTotal = calculateCumulativeTotal(groupedAsks);
    return getProcessedOrders(asksWithTotal, true, maxRows);
  }, [asks, maxRows]);

  const displayedBids = useMemo(() => {
    // First group orders by price, then calculate cumulative totals
    const groupedBids = groupOrdersByPrice(bids);
    const bidsWithTotal = calculateCumulativeTotal(groupedBids);
    // Bids are sorted descending. `getProcessedOrders` takes the top `maxRows`.
    // Cumulative total for bids should increase as price decreases (further from spread).
    return getProcessedOrders(bidsWithTotal, false, maxRows);
  }, [bids, maxRows]);

  const maxAskTotal = displayedAsks.length > 0 ? Math.max(...displayedAsks.map(ask => ask.total)) : 0;
  const maxBidTotal = displayedBids.length > 0 ? Math.max(...displayedBids.map(bid => bid.total)) : 0;
  const maxTotal = Math.max(maxAskTotal, maxBidTotal);

  // Show loading state
  if (loading && orderbook.bids.length === 0 && orderbook.asks.length === 0) {
    return (
      <div className="orderbook-container">
        <div className="orderbook-loading">Loading orderbook...</div>
      </div>
    );
  }

  // Show error state with retry option
  if (error && orderbook.bids.length === 0 && orderbook.asks.length === 0) {
    return (
      <div className="orderbook-container">
        <div className="orderbook-error">
          <div>Error loading orderbook: {error}</div>
          <button onClick={refetch} className="retry-button">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="orderbook-container">
      {showHeader && (
        <OrderbookHeader
          currentFocus={focus}
          onFocusChange={setFocus}
        />
      )}
      
      <div className="orderbook-content">
        <div className="asks-container">
          {displayedAsks.map((order) => (
            <OrderbookRow
              key={`${order.price}-aggregated-ask`}
              order={order}
              type="ask"
              maxTotal={maxTotal}
              onClick={onOrderClick ? () => onOrderClick(order, 'ask') : undefined}
              precision={precision}
            />
          ))}
        </div>
        
        {showSpread && spread > 0 && (
          <OrderbookSpread
            spread={spread}
            spreadPercentage={spreadPercentage}
            precision={precision}
          />
        )}
        
        <div className="bids-container">
          {displayedBids.map((order) => (
            <OrderbookRow
              key={`${order.price}-aggregated-bid`}
              order={order}
              type="bid"
              maxTotal={maxTotal}
              onClick={onOrderClick ? () => onOrderClick(order, 'bid') : undefined}
              precision={precision}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
