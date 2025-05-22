import React, { useMemo } from 'react';
import { OrderbookHeader } from './OrderbookHeader';
import { OrderbookRow } from './OrderbookRow';
import { OrderbookSpread } from './OrderbookSpread';
import { useOrderbookState } from '../../hooks/useOrderbookState';
import type { Order } from '../../types/orderbook';
import type { OrderbookProps } from './types';

export const Orderbook: React.FC<Omit<OrderbookProps, 'bids' | 'asks' | 'focus' | 'onFocusChange'>> = ({
  showHeader = true,
  showSpread = true,
  maxRows = 10,
  precision = 5,
  grouping = 1,
  onOrderClick,
}) => {
  const { orderbook, focus, setFocus } = useOrderbookState();
  const { bids, asks, spread, spreadPercentage } = orderbook;

  const getProcessedOrders = (orders: Order[], isAsks: boolean, count: number): Order[] => {
    let processed = isAsks ? orders.slice(0, count) : orders.slice(0, count);
    if (isAsks) {
      processed = processed.reverse();
    }
    return processed;
  };

  const displayedAsks = useMemo(() => getProcessedOrders(asks, true, maxRows), [asks, maxRows, grouping]);
  const displayedBids = useMemo(() => getProcessedOrders(bids, false, maxRows), [bids, maxRows, grouping]);

  const maxAskTotal = displayedAsks.length > 0 ? Math.max(...displayedAsks.map(ask => ask.total)) : 0;
  const maxBidTotal = displayedBids.length > 0 ? Math.max(...displayedBids.map(bid => bid.total)) : 0;
  const maxTotal = Math.max(maxAskTotal, maxBidTotal);

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
              key={`${order.price}-${order.size}-ask`}
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
              key={`${order.price}-${order.size}-bid`}
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
