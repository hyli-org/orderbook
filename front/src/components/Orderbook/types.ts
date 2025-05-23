import type { Order, OrderbookState } from '../../types/orderbook';

export type OrderbookFocus = 'all' | 'buy' | 'sell';

export interface OrderbookProps {
  // Data
  buyOrders?: Order[];
  sellOrders?: Order[];
  rawOrderbook?: OrderbookState;

  // Configuration
  precision?: number;
  grouping?: number;
  focus?: OrderbookFocus;

  // Display options
  showHeader?: boolean;
  showSpread?: boolean;
  maxRows?: number;

  // Callbacks
  onOrderClick?: (order: Order) => void;
  onFocusChange?: (focus: OrderbookFocus) => void;
}

export interface OrderbookHeaderProps {
  // TODO: Define props
}

export interface OrderbookRowProps {
  order: Order;
  maxTotal?: number; // For depth visualization
  onClick?: (order: Order) => void;
  precision?: number;
}

export interface OrderbookSpreadProps {
  spread: number;
  spreadPercentage: number;
  precision?: number;
}