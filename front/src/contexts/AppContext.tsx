import React, { createContext, useContext, useReducer } from 'react';
import type { MockTradingData } from '../utils/mockData';
import type { Position } from '../types/position';
import type { OrderbookState } from '../types/orderbook';
import type { OrderbookFocus } from '../components/Orderbook/types';
import { DEFAULT_PAIR_ID } from '../constants/assets';

// Define the global state interface
interface AppState {
  currentPair: string;
  tradingData: MockTradingData | null;
  positions: { [pair: string]: Position[] };
  orderbook: OrderbookState;
  orderbookFocus: OrderbookFocus;
}

// Define action types
type AppAction =
  | { type: 'SET_PAIR'; payload: string }
  | { type: 'SET_TRADING_DATA'; payload: MockTradingData }
  | { type: 'ADD_POSITION'; payload: { pair: string; position: Position } }
  | { type: 'UPDATE_ORDERBOOK'; payload: OrderbookState }
  | { type: 'SET_ORDERBOOK_FOCUS'; payload: OrderbookFocus }
  | { type: 'SET_INITIAL_STATE'; payload: Partial<AppState> };

// Create the context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | undefined>(undefined);

// Initial state
const initialState: AppState = {
  currentPair: DEFAULT_PAIR_ID,
  tradingData: null,
  positions: {},
  orderbook: {
    orders: {},
    buy_orders: {},
    sell_orders: {},
    balances: {}
  },
  orderbookFocus: 'all',
};

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_INITIAL_STATE':
      return { ...state, ...action.payload };
    case 'SET_PAIR':
      return { ...state, currentPair: action.payload };
    case 'SET_TRADING_DATA':
      return {
        ...state,
        tradingData: action.payload,
      };
    case 'ADD_POSITION':
      const { pair, position } = action.payload;
      const existingPairPositions = state.positions[pair] || [];
      return {
        ...state,
        positions: {
          ...state.positions,
          [pair]: [...existingPairPositions, position],
        },
      };
    case 'UPDATE_ORDERBOOK':
      return { ...state, orderbook: action.payload };
    case 'SET_ORDERBOOK_FOCUS':
      return { ...state, orderbookFocus: action.payload };
    default:
      return state;
  }
}

// Provider component
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

// Custom hook to use the context
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};