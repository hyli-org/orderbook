import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAppContext } from './AppContext'; // To get user address

// Type for the raw order data expected from the API
interface ApiOrder {
  pair: [string, string]; // [base_token, quote_token]
  user: string;
  price: number;
  quantity: number;
  order_type: "Buy" | "Sell"; // Add order_type field from API
  order_id: string; // Required for canceling orders
  // id: string; // Example: if orders have IDs
  // timestamp: number; // Example: if orders have timestamps
}

// Type for the data structure we want to use in the Positions component
// This aligns with what enhancedPositions in Positions.tsx expects/produces parts of.
export interface UserPositionOrder {
  pairName: string; // e.g., "BTC/HYLLAR"
  asset: string;    // Base asset, e.g., "BTC"
  quantity: number;
  price: number;    // Order price, will be used as entryPrice
  order_type: "Buy" | "Sell"; // Add order_type field
  order_id: string; // Required for canceling orders
  // Include other raw fields if Positions.tsx might use them or if they are part of Position type
  user?: string; 
}

interface PositionsState {
  positions: UserPositionOrder[];
  loading: boolean;
  error: string | null;
}

interface PositionsContextType extends PositionsState {
  refetchPositions: () => void;
}

const PositionsContext = createContext<PositionsContextType | undefined>(undefined);

export const PositionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state: appState } = useAppContext();
  const userAddress = appState.currentUser; // Get user address from AppContext

  const [state, setState] = useState<PositionsState>({
    positions: [],
    loading: false,
    error: null,
  });

  const fetchPositions = useCallback(async () => {
    if (!userAddress) {
      // console.log('No userAddress available in AppContext, skipping fetchPositions.');
      setState({
        positions: [],
        loading: false,
        // Optionally set an error or just clear positions if user is not logged in/set
        error: 'Current user not set. Cannot fetch positions.', 
      });
      return;
    }
    // console.log('Fetching positions for user:', userAddress);

    setState(prevState => ({ ...prevState, loading: true, error: null }));
    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'; // Fallback for API URL
      const response = await fetch(`${baseUrl}/api/optimistic/orders/user/${encodeURIComponent(userAddress)}`);
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to fetch positions: ${response.status} ${response.statusText} - ${errorBody}`);
      }
      const data: ApiOrder[] = await response.json();

      const transformedPositions: UserPositionOrder[] = data.map(order => ({
        pairName: `${order.pair[0]}/${order.pair[1]}`,
        asset: order.pair[0],
        price: order.price,
        quantity: order.quantity,
        order_type: order.order_type,
        order_id: order.order_id,
        user: order.user,
      }));

      setState({
        positions: transformedPositions,
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error('Error fetching positions:', err);
      setState({
        positions: [],
        loading: false,
        error: err instanceof Error ? err.message : 'An unknown error occurred fetching positions',
      });
    }
  }, [userAddress]); // Add userAddress to dependency array

  useEffect(() => {
    // Fetch positions when the component mounts or when userAddress changes
    fetchPositions();
  }, [fetchPositions]); // fetchPositions itself depends on userAddress

  const refetchPositions = () => {
    fetchPositions();
  };

  return (
    <PositionsContext.Provider value={{ ...state, refetchPositions }}>
      {children}
    </PositionsContext.Provider>
  );
};

export const usePositionsContext = (): PositionsContextType => {
  const context = useContext(PositionsContext);
  if (context === undefined) {
    throw new Error('usePositionsContext must be used within a PositionsProvider');
  }
  return context;
}; 