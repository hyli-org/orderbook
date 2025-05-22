import React, { createContext, useContext, useReducer } from 'react';
import type { MockTradingData } from '../utils/mockData';
import type { Position } from '../types/position';
import type { OrderbookState, Order } from '../types/orderbook'; // Added Order
import type { OrderbookFocus } from '../components/Orderbook/types'; // Assuming this type exists or will be created
import { DEFAULT_PAIR_ID } from '../constants/assets'; // Import default pair ID

// Define the global state interface
interface AppState {
  currentPair: string;
  tradingData: MockTradingData | null;
  positions: { [pair: string]: Position[] }; // Changed to support multi-pair positions
  orderbook: OrderbookState;
  orderbookFocus: OrderbookFocus; // Changed to OrderbookFocus type
  // Potentially add other global states like user preferences, theme, etc.
}

// Define action types
type AppAction =
  | { type: 'SET_PAIR'; payload: string }
  | { type: 'SET_TRADING_DATA'; payload: MockTradingData }
  | { type: 'ADD_POSITION'; payload: { pair: string; position: Position } } // Changed payload
  | { type: 'UPDATE_ORDERBOOK'; payload: OrderbookState }
  | { type: 'SET_ORDERBOOK_FOCUS'; payload: OrderbookFocus } // Changed to OrderbookFocus type
  | { type: 'SET_INITIAL_STATE'; payload: Partial<AppState> }; // For setting initial state from localStorage etc.


// Create the context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | undefined>(undefined);

// Initial state (will be hydrated from localStorage or defaults)
const initialState: AppState = {
  currentPair: DEFAULT_PAIR_ID, // Use imported default
  tradingData: null,
  positions: {}, // Initialized as an empty object
  orderbook: { bids: [], asks: [], spread: 0, spreadPercentage: 0 },
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
      // When trading data changes, it often implies the orderbook should also update
      // Ensure this logic is either here or in the component/hook that dispatches SET_TRADING_DATA
      return {
        ...state,
        tradingData: action.payload,
        orderbook: action.payload.currentOrderbook // Directly update orderbook from trading data
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
      // It's good practice to handle unknown actions, e.g., by throwing an error
      // or returning the current state if the action is not recognized.
      // For now, we return state, but in a larger app, stricter handling might be better.
      return state;
  }
}

// Provider component
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // TODO: Consider adding a useEffect here to load initial state from localStorage
  // for currentPair, etc., and dispatch a SET_INITIAL_STATE action.

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