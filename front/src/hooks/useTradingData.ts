import { useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { generateMockTradingData } from '../utils/mockData';

export const useTradingData = (pairIdParam?: string) => {
  const { state, dispatch } = useAppContext();
  const { currentPair: currentPairFromState } = state;

  useEffect(() => {
    const pairToLoad = pairIdParam ? pairIdParam.replace('-', '/') : currentPairFromState;
    const storedTradingData = localStorage.getItem(`tradingData_${pairToLoad}`);

    if (storedTradingData) {
      const tradingData = JSON.parse(storedTradingData);
      if (state.currentPair !== pairToLoad) {
        dispatch({ type: 'SET_PAIR', payload: pairToLoad });
      }
      dispatch({ type: 'SET_TRADING_DATA', payload: tradingData });
      localStorage.setItem('lastVisitedPair', pairToLoad);
    } else {
      const tradingData = generateMockTradingData(pairToLoad, 200, 3600);
      if (tradingData) {
        localStorage.setItem(`tradingData_${pairToLoad}`, JSON.stringify(tradingData));
        if (state.currentPair !== pairToLoad) {
          dispatch({ type: 'SET_PAIR', payload: pairToLoad });
        }
        dispatch({ type: 'SET_TRADING_DATA', payload: tradingData });
        localStorage.setItem('lastVisitedPair', pairToLoad);
      } else {
        console.error(`Failed to load trading data for ${pairToLoad}`);
      }
    }
  }, [pairIdParam, currentPairFromState, dispatch, state.currentPair]);

  return state.tradingData;
}; 