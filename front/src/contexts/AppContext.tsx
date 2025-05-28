import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type { MockTradingData } from '../utils/mockData';
import type { Position } from '../types/position';
import type { OrderbookState } from '../types/orderbook';
import type { OrderbookFocus } from '../components/Orderbook/types'; // Assuming this type exists or will be created
import { DEFAULT_PAIR_ID } from '../constants/assets'; // Import default pair ID

// Define the global state interface
interface AppState {
  currentPair: string;
  tradingData: MockTradingData | null;
  positions: { [pair: string]: Position[] }; // Changed to support multi-pair positions
  orderbook: OrderbookState;
  orderbookFocus: OrderbookFocus; // Changed to OrderbookFocus type
  currentUser: string; // Added currentUser
  balances: { [currency: string]: number }; // Added balances
  // Potentially add other global states like user preferences, theme, etc.
}

// Define action types
type AppAction =
  | { type: 'SET_PAIR'; payload: string }
  | { type: 'SET_TRADING_DATA'; payload: MockTradingData }
  | { type: 'ADD_POSITION'; payload: { pair: string; position: Position } } // Changed payload
  | { type: 'UPDATE_ORDERBOOK'; payload: OrderbookState }
  | { type: 'SET_ORDERBOOK_FOCUS'; payload: OrderbookFocus } // Changed to OrderbookFocus type
  | { type: 'SET_INITIAL_STATE'; payload: Partial<AppState> } // For setting initial state from localStorage etc.
  | { type: 'SET_BALANCES'; payload: { [currency: string]: number } } // Added SET_BALANCES action
  | { type: 'SET_CURRENT_USER'; payload: string }; // Added SET_CURRENT_USER action


// Create the context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  fetchBalances: (user: string) => Promise<void>; // Added fetchBalances
} | undefined>(undefined);

// Initial state (will be hydrated from localStorage or defaults)
const initialState: AppState = {
  currentPair: DEFAULT_PAIR_ID, // Use imported default
  tradingData: null,
  positions: {}, // Initialized as an empty object
  orderbook: { bids: [], asks: [], spread: 0, spreadPercentage: 0 },
  orderbookFocus: 'all',
  currentUser: 'user@orderbook', // Default user
  balances: {}, // Initial empty balances
};

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_INITIAL_STATE':
      return { ...state, ...action.payload };
    case 'SET_PAIR':
      return { ...state, currentPair: action.payload };
    case 'SET_TRADING_DATA':
      // When trading data changes, keep orderbook separate (now fetched from API)
      return {
        ...state,
        tradingData: action.payload,
        // Remove orderbook update from trading data - now handled by API
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
    case 'SET_BALANCES': // Handle SET_BALANCES
      return { ...state, balances: action.payload };
    case 'SET_CURRENT_USER': // Handle SET_CURRENT_USER
      return { ...state, currentUser: action.payload, balances: {} }; // Reset balances on user change
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
  console.log('[AppProvider] Initial state after useReducer:', state); // Log initial state

  const fetchBalances = useCallback(async (user: string) => {
    if (!user) return;
    try {
      // Using standard fetch API as NodeApiHttpClient.get usage is unclear
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'; // Fallback if VITE_NODE_BASE_URL is not set
      const fullUrl = `${baseUrl}/api/optimistic/balances/${user}`;
      
      const response = await fetch(fullUrl); // Standard fetch call
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: { [currency: string]: number } = await response.json();
      dispatch({ type: 'SET_BALANCES', payload: data });
    } catch (error) {
      console.error('Failed to fetch balances:', error);
      dispatch({ type: 'SET_BALANCES', payload: {} });
    }
  }, [dispatch]);

  useEffect(() => {
    // Fetch balances for the initial current user
    if (state.currentUser) {
      fetchBalances(state.currentUser);
    }
    // Log currentPair whenever currentUser or fetchBalances changes, to see its state then
    console.log('[AppProvider useEffect - currentUser/fetchBalances] currentPair:', state.currentPair);
  }, [state.currentUser, fetchBalances]);


  // TODO: Consider adding a useEffect here to load initial state from localStorage
  // for currentPair, etc., and dispatch a SET_INITIAL_STATE action.
  // <<< IF YOU HAVE SUCH A useEffect, ADD LOGGING INSIDE IT TOO >>>
  // Example:
  // useEffect(() => {
  //   const storedPair = localStorage.getItem('appCurrentPair');
  //   console.log('[AppProvider localStorageEffect] Found storedPair:', storedPair);
  //   if (storedPair) {
  //     dispatch({ type: 'SET_PAIR', payload: storedPair });
  //     console.log('[AppProvider localStorageEffect] Dispatched SET_PAIR with:', storedPair);
  //   }
  // }, []); // Empty dependency array means it runs once on mount


  // Log the state right before rendering the provider's value
  console.log('[AppProvider] State before providing context:', state);

  return (
    <AppContext.Provider value={{ state, dispatch, fetchBalances }}>
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