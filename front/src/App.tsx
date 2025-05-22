import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PairPage } from './components'; // Assuming PairPage is in './components'
import { AppProvider, useAppContext } from './contexts/AppContext'; // Import AppProvider and useAppContext
import './App.css';
import { useEffect } from 'react'; // Import useEffect
import { DEFAULT_PAIR_ID } from './constants/assets'; // Import default pair ID

// Component to handle initial state loading
const AppInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { dispatch } = useAppContext();

  useEffect(() => {
    const lastVisitedPair = localStorage.getItem('lastVisitedPair') || DEFAULT_PAIR_ID; // Use imported default
    // Potentially load other initial states like positions, focus, etc.
    dispatch({ type: 'SET_INITIAL_STATE', payload: { currentPair: lastVisitedPair } });
  }, [dispatch]);

  return <>{children}</>;
};

function App() {
  // lastVisitedPair logic is now handled within AppInitializer or directly in AppProvider/useTradingData
  // For the Navigate component, we can still read it initially to avoid a flicker,
  // or let the context handle the redirection once the state is set.
  const lastVisitedPairFromStorage = localStorage.getItem('lastVisitedPair') || DEFAULT_PAIR_ID; // Use imported default
  const lastVisitedPairUrl = lastVisitedPairFromStorage.replace('/', '-');

  return (
    <AppProvider>
      <AppInitializer>
        <Routes>
          <Route path="/" element={<Navigate to={`/pair/${lastVisitedPairUrl}`} replace />} />
          <Route path="/pair/:pairId" element={<PairPage />} />
        </Routes>
      </AppInitializer>
    </AppProvider>
  );
}

export default App;
