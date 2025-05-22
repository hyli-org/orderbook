import { useCallback, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import type { Position } from '../types/position';

export const usePositions = () => {
  const { state, dispatch } = useAppContext();
  const { positions: allPositions, currentPair } = state;

  // Function to add a position for a specific pair
  const addPosition = useCallback((pair: string, position: Position) => {
    dispatch({ type: 'ADD_POSITION', payload: { pair, position } });
    // TODO: Potentially add logging or side effects here, like updating backend or localStorage for positions
    console.log(`New position added for pair ${pair} via context:`, position);
  }, [dispatch]);

  // Memoized selector for current pair's positions
  const currentPairPositions = useMemo(() => {
    return allPositions[currentPair] || [];
  }, [allPositions, currentPair]);

  // Function to get positions for any given pair (optional)
  const getPositionsForPair = useCallback((pair: string): Position[] => {
    return allPositions[pair] || [];
  }, [allPositions]);

  return {
    positions: currentPairPositions, // Positions for the currently active pair
    allPositions, // All positions across all pairs (if needed directly)
    addPosition, // Function to add a new position for a specific pair
    getPositionsForPair, // Function to retrieve positions for an arbitrary pair
  };
}; 