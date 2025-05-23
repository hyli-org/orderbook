import { useState, useEffect } from 'react';
import { webSocketService } from '../services/WebSocketService';
import { orderbookService } from '../services/OrderbookService';
import type { OrderbookState, OrderbookEvent } from '../types/orderbook';

export const useOrderbookWebSocket = (account: string) => {
  const [orderbook, setOrderbook] = useState<OrderbookState | null>(null);

  useEffect(() => {
    // Connexion initiale et récupération de l'état
    const initializeOrderbook = async () => {
      try {
        const initialState = await orderbookService.getOrderbookState();
        setOrderbook(initialState);
      } catch (error) {
        console.error('Failed to fetch initial orderbook state:', error);
      }
    };

    // S'abonner aux mises à jour WebSocket
    const handleWebSocketMessage = (event: OrderbookEvent) => {
      setOrderbook((currentOrderbook) => {
        if (!currentOrderbook) return null;

        const newOrderbook = { ...currentOrderbook };

        switch (true) {
          case 'OrderCreated' in event: {
            const { order } = event.OrderCreated!;
            newOrderbook.orders[order.order_id] = order;
            
            const ordersList = order.order_type === 'Buy' 
              ? (newOrderbook.buy_orders[order.pair.join(',')] || [])
              : (newOrderbook.sell_orders[order.pair.join(',')] || []);
              
            if (order.order_type === 'Buy') {
              newOrderbook.buy_orders[order.pair.join(',')] = [...ordersList, order.order_id];
            } else {
              newOrderbook.sell_orders[order.pair.join(',')] = [...ordersList, order.order_id];
            }
            break;
          }
          
          case 'OrderCancelled' in event: {
            const { order_id } = event.OrderCancelled!;
            const order = newOrderbook.orders[order_id];
            if (order) {
              delete newOrderbook.orders[order_id];
              
              const pairKey = order.pair.join(',');
              if (order.order_type === 'Buy') {
                newOrderbook.buy_orders[pairKey] = (newOrderbook.buy_orders[pairKey] || [])
                  .filter(id => id !== order_id);
              } else {
                newOrderbook.sell_orders[pairKey] = (newOrderbook.sell_orders[pairKey] || [])
                  .filter(id => id !== order_id);
              }
            }
            break;
          }
          
          case 'OrderExecuted' in event: {
            const { order_id } = event.OrderExecuted!;
            delete newOrderbook.orders[order_id];

            // Remove from buy/sell orders
            Object.keys(newOrderbook.buy_orders).forEach(pair => {
              newOrderbook.buy_orders[pair] = newOrderbook.buy_orders[pair].filter(id => id !== order_id);
            });
            Object.keys(newOrderbook.sell_orders).forEach(pair => {
              newOrderbook.sell_orders[pair] = newOrderbook.sell_orders[pair].filter(id => id !== order_id);
            });
            break;
          }

          case 'OrderUpdate' in event: {
            const { order_id, remaining_quantity } = event.OrderUpdate!;
            if (newOrderbook.orders[order_id]) {
              newOrderbook.orders[order_id] = {
                ...newOrderbook.orders[order_id],
                quantity: remaining_quantity
              };
            }
            break;
          }

          case 'BalanceUpdated' in event: {
            const { user, token, amount } = event.BalanceUpdated!;
            if (!newOrderbook.balances[user[0]]) {
              newOrderbook.balances[user[0]] = {};
            }
            newOrderbook.balances[user[0]][token] = amount;
            break;
          }
        }

        return newOrderbook;
      });
    };

    // Initialiser la connexion WebSocket
    webSocketService.connect(account);
    const unsubscribe = webSocketService.subscribeToEvents(handleWebSocketMessage);

    // Récupérer l'état initial
    initializeOrderbook();

    return () => {
      unsubscribe();
      webSocketService.disconnect();
    };
  }, [account]);

  return orderbook;
};
