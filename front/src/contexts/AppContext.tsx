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
  walletAddress: string; // Added walletAddress
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
  | { type: 'SET_CURRENT_USER'; payload: string } // Added SET_CURRENT_USER action
  | { type: 'SET_WALLET_ADDRESS'; payload: string }; // Added SET_WALLET_ADDRESS action


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
  currentUser: 'user@orderbook', // Default user is now user@orderbook
  balances: {}, // Initial empty balances
  walletAddress: 'user@orderbook', // Initial wallet address matches currentUser
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
      // Payload is expected to be the raw username (e.g., "john")
      const rawUsername = action.payload.split('@')[0];
      const newCurrentUser = `${rawUsername}@orderbook`;
      return {
        ...state,
        currentUser: newCurrentUser,
        walletAddress: newCurrentUser, // Ensure walletAddress is also updated
        balances: {}, // Reset balances on user change
      };
    case 'SET_WALLET_ADDRESS': // Handle SET_WALLET_ADDRESS
      // This action might still be dispatched from elsewhere, but currentUser should be the source of truth.
      // For now, let it update walletAddress independently, though ideally it aligns with currentUser.
      // Or, this action could be removed if walletAddress is always derived from currentUser via SET_CURRENT_USER.
      // Given the changes, SET_WALLET_ADDRESS should ideally not be called directly if currentUser is the master.
      // However, to prevent breaking other potential usages, we'll keep its direct effect.
      // But the primary update path is via SET_CURRENT_USER.
      return { ...state, walletAddress: action.payload };
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
    if (!user) {
      console.log('[AppProvider.fetchBalances] User is not defined, skipping fetch.');
      return;
    }
    console.log(`[AppProvider.fetchBalances] Starting to fetch balances for user: ${user}`);
    try {
      // Using standard fetch API as NodeApiHttpClient.get usage is unclear
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'; // Fallback if VITE_NODE_BASE_URL is not set
      const fullUrl = `${baseUrl}/api/optimistic/balances/${user}`;
      
      console.log(`[AppProvider.fetchBalances] Fetching from URL: ${fullUrl}`);
      const response = await fetch(fullUrl); // Standard fetch call

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AppProvider.fetchBalances] HTTP error! Status: ${response.status}, User: ${user}, Response: ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
      }
      const data: { [currency: string]: number } = await response.json();
      console.log(`[AppProvider.fetchBalances] Successfully fetched balances for user ${user}:`, data);
      dispatch({ type: 'SET_BALANCES', payload: data });
    } catch (error) {
      console.error(`[AppProvider.fetchBalances] Failed to fetch balances for user ${user}:`, error);
      dispatch({ type: 'SET_BALANCES', payload: {} }); // Set to empty on error
    }
  }, [dispatch]);

  useEffect(() => {
    // Load initial state from localStorage
    const storedPair = localStorage.getItem('appCurrentPair');
    const storedUser = localStorage.getItem('appCurrentUser'); // Expected to be username@orderbook
    // storedWalletAddress is not strictly needed for initialization if storedUser is the source of truth
    // and reducer for SET_INITIAL_STATE or SET_CURRENT_USER syncs them.

    const initialPayload: Partial<AppState> = {};
    if (storedPair) {
      initialPayload.currentPair = storedPair;
    }
    if (storedUser) { // If appCurrentUser (username@orderbook) exists
      initialPayload.currentUser = storedUser;
      initialPayload.walletAddress = storedUser; // Ensure walletAddress is also set from storedUser
    }
    // If only storedWalletAddress exists (legacy or partial save), use it for both.
    // This ensures that if appCurrentUser is missing, but appWalletAddress is there, we still load it.
    else {
        const storedWalletAddress = localStorage.getItem('appWalletAddress');
        if (storedWalletAddress) {
            initialPayload.currentUser = storedWalletAddress;
            initialPayload.walletAddress = storedWalletAddress;
        }
    }

    if (Object.keys(initialPayload).length > 0) {
      dispatch({ type: 'SET_INITIAL_STATE', payload: initialPayload });
    }
  }, []);


  useEffect(() => {
    // This effect runs when state.currentUser changes.
    if (state.currentUser) { // state.currentUser is now 'username@orderbook'
      fetchBalances(state.currentUser); // Correctly passes 'username@orderbook'
      
      // Persist currentUser and walletAddress to localStorage.
      // state.walletAddress is updated by the reducer in SET_CURRENT_USER or SET_INITIAL_STATE.
      localStorage.setItem('appCurrentUser', state.currentUser);
      localStorage.setItem('appWalletAddress', state.walletAddress); // Should be same as state.currentUser

      // If walletAddress somehow diverged, ensure it's synced from currentUser.
      // This is more of a safeguard; reducer for SET_CURRENT_USER should handle this primarily.
      if (state.walletAddress !== state.currentUser) {
        dispatch({ type: 'SET_WALLET_ADDRESS', payload: state.currentUser });
      }
    }
    console.log('[AppProvider useEffect - currentUser/fetchBalances] currentPair:', state.currentPair);
  }, [state.currentUser, fetchBalances]); // state.walletAddress removed from deps as it's driven by currentUser


  useEffect(() => {
    // Persist currentPair to localStorage
    if (state.currentPair) {
      localStorage.setItem('appCurrentPair', state.currentPair);
    }
  }, [state.currentPair]);


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