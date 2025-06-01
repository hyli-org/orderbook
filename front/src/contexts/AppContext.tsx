import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type { MockTradingData } from '../utils/mockData';
import type { Position } from '../types/position';
import type { OrderbookState } from '../types/orderbook';
import type { OrderbookFocus } from '../components/Orderbook/types'; // Assuming this type exists or will be created
import { DEFAULT_PAIR_ID } from '../constants/assets'; // Import default pair ID
import { useWallet } from 'hyli-wallet';

// Define the global state interface
interface AppState {
  currentPair: string;
  tradingData: MockTradingData | null;
  positions: { [pair: string]: Position[] }; // Changed to support multi-pair positions
  orderbook: OrderbookState;
  orderbookFocus: OrderbookFocus; // Changed to OrderbookFocus type
  balances: { [currency: string]: number }; // Balances for wallet
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
  | { type: 'SET_BALANCES'; payload: { [currency: string]: number } }; // Balances action


// Create the context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  fetchBalances: (userAddress: string) => Promise<void>;
  wallet: any; // Wallet object from useWallet
} | undefined>(undefined);

// Initial state (will be hydrated from localStorage or defaults)
const initialState: AppState = {
  currentPair: DEFAULT_PAIR_ID, // Use imported default
  tradingData: null,
  positions: {}, // Initialized as an empty object
  orderbook: { bids: [], asks: [], spread: 0, spreadPercentage: 0 },
  orderbookFocus: 'all',
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
  const { wallet } = useWallet();
  console.log('[AppProvider] Initial state after useReducer:', state); // Log initial state

  const fetchBalances = useCallback(async (userAddress: string) => {
    if (!userAddress) {
      console.log('[AppProvider.fetchBalances] User address is not defined, skipping fetch.');
      return;
    }
    console.log(`[AppProvider.fetchBalances] Starting to fetch balances for user: ${userAddress}`);
    try {
      // Using standard fetch API as NodeApiHttpClient.get usage is unclear
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'; // Fallback if VITE_NODE_BASE_URL is not set
      const fullUrl = `${baseUrl}/api/optimistic/balances/${userAddress}`;
      
      console.log(`[AppProvider.fetchBalances] Fetching from URL: ${fullUrl}`);
      const response = await fetch(fullUrl); // Standard fetch call

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AppProvider.fetchBalances] HTTP error! Status: ${response.status}, User: ${userAddress}, Response: ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
      }
      const data: { [currency: string]: number } = await response.json();
      console.log(`[AppProvider.fetchBalances] Successfully fetched balances for user ${userAddress}:`, data);
      dispatch({ type: 'SET_BALANCES', payload: data });
    } catch (error) {
      console.error(`[AppProvider.fetchBalances] Failed to fetch balances for user ${userAddress}:`, error);
      dispatch({ type: 'SET_BALANCES', payload: {} }); // Set to empty on error
    }
  }, [dispatch]);

  useEffect(() => {
    // Load initial state from localStorage
    const storedPair = localStorage.getItem('appCurrentPair');

    const initialPayload: Partial<AppState> = {};
    if (storedPair) {
      initialPayload.currentPair = storedPair;
    }

    if (Object.keys(initialPayload).length > 0) {
      dispatch({ type: 'SET_INITIAL_STATE', payload: initialPayload });
    }
  }, []);

  // Effect to fetch balances when wallet changes
  useEffect(() => {
    if (wallet?.address) {
      console.log('[AppProvider] Wallet changed, fetching balances for:', wallet.address);
      fetchBalances(wallet.address);
    } else {
      // Clear balances when wallet is disconnected
      console.log('[AppProvider] Wallet disconnected, clearing balances');
      dispatch({ type: 'SET_BALANCES', payload: {} });
    }
  }, [wallet?.address, fetchBalances]);

  useEffect(() => {
    // Persist currentPair to localStorage
    if (state.currentPair) {
      localStorage.setItem('appCurrentPair', state.currentPair);
    }
  }, [state.currentPair]);


  // Log the state right before rendering the provider's value
  console.log('[AppProvider] State before providing context:', state);

  return (
    <AppContext.Provider value={{ state, dispatch, fetchBalances, wallet }}>
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