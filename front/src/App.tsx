import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PairPage } from './components'; // Assuming PairPage is in './components'
import DepositForm from './components/DepositForm/DepositForm'; // Import DepositForm
import { AppProvider, useAppContext } from './contexts/AppContext'; // Import AppProvider and useAppContext
import { OrderbookProvider } from './contexts/OrderbookContext'; // Import OrderbookProvider
import { PositionsProvider } from './contexts/PositionsContext'; // Import PositionsProvider
import './App.css';
import { useEffect } from 'react'; // Import useEffect
import { DEFAULT_PAIR_ID } from './constants/assets'; // Import default pair ID
import { WalletProvider } from 'hyli-wallet';

// Component to handle initial state loading
const AppInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { dispatch } = useAppContext();
  const location = useLocation();

  useEffect(() => {
    // Extract pairId from current URL path
    const pathMatch = location.pathname.match(/^\/pair\/(.+)$/);
    let initialPair = DEFAULT_PAIR_ID;
    
    if (pathMatch && pathMatch[1]) {
      initialPair = pathMatch[1].replace('-', '/');
    }
    
    console.log('[AppInitializer] URL path:', location.pathname);
    console.log('[AppInitializer] Extracted pairId from URL:', pathMatch?.[1]);
    console.log('[AppInitializer] Setting initial pair to:', initialPair);
    
    // Set initial state with the pair from URL or default
    dispatch({ type: 'SET_INITIAL_STATE', payload: { currentPair: initialPair } });
  }, [dispatch, location.pathname]);

  return <>{children}</>;
};

function App() {
  // lastVisitedPair logic is now handled within AppInitializer or directly in AppProvider/useTradingData
  // For the Navigate component, we can still read it initially to avoid a flicker,
  // or let the context handle the redirection once the state is set.
  const lastVisitedPairUrl = DEFAULT_PAIR_ID.replace('/', '-');

  return (
    <WalletProvider
        config={{
            nodeBaseUrl: import.meta.env.VITE_NODE_BASE_URL,
            walletServerBaseUrl: import.meta.env.VITE_WALLET_SERVER_BASE_URL,
            applicationWsUrl: import.meta.env.VITE_WALLET_WS_URL,
        }}
    >
      <AppProvider>
        <OrderbookProvider>
          <PositionsProvider>
            <AppInitializer>
              <Routes>
                <Route path="/" element={<Navigate to={`/pair/${lastVisitedPairUrl}`} replace />} />
                <Route path="/pair/:pairId" element={<PairPage />} />
                <Route path="/deposit" element={<DepositForm />} />
              </Routes>
            </AppInitializer>
          </PositionsProvider>
        </OrderbookProvider>
      </AppProvider>
    </WalletProvider>
  );
}

export default App;
