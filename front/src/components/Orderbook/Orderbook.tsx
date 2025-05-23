import React, { useMemo } from 'react';
import { OrderbookHeader } from './OrderbookHeader';
import { OrderbookRow } from './OrderbookRow';
import { OrderbookSpread } from './OrderbookSpread';
import type { Order } from '../../types/orderbook';
import type { OrderbookProps } from './types';

export const Orderbook: React.FC<OrderbookProps> = ({
  buyOrders: initialBuyOrders = [],
  sellOrders: initialSellOrders = [],
  showHeader = true,
  showSpread = true,
  maxRows = 10,
  precision = 5,
  onOrderClick,
  rawOrderbook
}) => {
  // Transform the raw orderbook state into buy and sell arrays
  const { processedBuyOrders, processedSellOrders, spread, spreadPercentage } = useMemo(() => {
    if (!rawOrderbook || !rawOrderbook.buy_orders || !rawOrderbook.sell_orders || !rawOrderbook.orders) {
      return {
        processedBuyOrders: initialBuyOrders,
        processedSellOrders: initialSellOrders,
        spread: 0,
        spreadPercentage: 0
      };
    }

    const buyOrders: Order[] = [];
    const sellOrders: Order[] = [];

    // Get the first pair's orders if they exist
    const buyOrderIds = Object.values(rawOrderbook.buy_orders)[0] || [];
    const sellOrderIds = Object.values(rawOrderbook.sell_orders)[0] || [];

    // Process buy orders
    if (Array.isArray(buyOrderIds)) {
      buyOrderIds.forEach(orderId => {
        const order = rawOrderbook.orders[orderId];
        if (order) {
          buyOrders.push(order);
        }
      });
    }

    // Process sell orders
    if (Array.isArray(sellOrderIds)) {
      sellOrderIds.forEach(orderId => {
        const order = rawOrderbook.orders[orderId];
        if (order) {
          sellOrders.push(order);
        }
      });
    }

    // Sort buy orders (highest price first) and sell orders (lowest price first)
    buyOrders.sort((a, b) => (b.price || 0) - (a.price || 0));
    sellOrders.sort((a, b) => (a.price || 0) - (b.price || 0));

    // Calculate spread
    const highestBuyPrice = buyOrders[0]?.price || 0;
    const lowestSellPrice = sellOrders[0]?.price || 0;
    const spread = Math.max(0, lowestSellPrice - highestBuyPrice);
    const spreadPercentage = highestBuyPrice > 0 ? (spread / highestBuyPrice) * 100 : 0;

    return {
      processedBuyOrders: buyOrders.slice(0, maxRows),
      processedSellOrders: sellOrders.slice(0, maxRows),
      spread,
      spreadPercentage
    };
  }, [rawOrderbook, initialBuyOrders, initialSellOrders, maxRows]);

  // Calculate max total for depth visualization
  const maxTotal = Math.max(
    ...processedSellOrders.map(o => (o.price || 0) * o.quantity),
    ...processedBuyOrders.map(o => (o.price || 0) * o.quantity),
    0 // Ensure we always have a non-negative value even if there are no orders
  );

  return (
    <div>
      {showHeader && <OrderbookHeader />}
      <div className="orderbook-content">
        <div className="sell-orders-container">
          {processedSellOrders.map((order) => (
            <OrderbookRow
              key={order.order_id}
              order={order}
              maxTotal={maxTotal}
              onClick={onOrderClick}
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
        
        <div className="buy-orders-container">
          {processedBuyOrders.map((order) => (
            <OrderbookRow
              key={order.order_id}
              order={order}
              maxTotal={maxTotal}
              onClick={onOrderClick}
              precision={precision}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
