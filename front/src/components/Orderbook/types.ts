import type { Order } from '../../types/orderbook';

export type OrderbookFocus = 'all' | 'bids' | 'asks';

export interface OrderbookProps {
  // Data
  bids?: Order[];
  asks?: Order[];

  // Configuration
  precision?: number;
  grouping?: number;
  focus?: OrderbookFocus; // Allow initial focus to be set

  // Display options
  showHeader?: boolean;
  showSpread?: boolean;
  maxRows?: number;

  // Callbacks
  onOrderClick?: (order: Order, type: 'bid' | 'ask') => void;
  onFocusChange?: (focus: OrderbookFocus) => void; // Callback for focus change
}

export interface OrderbookHeaderProps {
  currentFocus?: OrderbookFocus;
  onFocusChange?: (focus: OrderbookFocus) => void;
}

export interface OrderbookRowProps {
  order: Order;
  type: 'bid' | 'ask';
  maxTotal?: number; // For depth visualization
  onClick?: (order: Order, type: 'bid' | 'ask') => void;
  precision?: number;
}

export interface OrderbookSpreadProps {
  spread: number;
  spreadPercentage: number;
  precision?: number;
} 