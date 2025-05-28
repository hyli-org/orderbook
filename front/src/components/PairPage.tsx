import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Orderbook, CandleChart, Positions, TradingForm, MarketInfoBanner } from './index';
// import { useTradingData } from '../hooks/useTradingData';
// import { usePositions } from '../hooks/usePositions'; // No longer needed
import { useAppContext } from '../contexts/AppContext';
import { useOrderbookContext } from '../contexts/OrderbookContext';
import { usePositionsContext } from '../contexts/PositionsContext';
import OrderbookWsService from '../services/OrderbookWsService';
import type { Order } from '../types/orderbook';
import { generateMockTradingData } from '../utils/mockData';
import '../App.css';

// Define a basic type for trading data based on its usage
interface TradingData {
  assetPair: string;
  historicalData: Array<{ open: number; close: number; high: number; low: number; time: number }>;
  currentPrice: number;
  volume24h?: number;
  marketCap?: number;
  contractAddress?: string;
}

const PairPage: React.FC = () => {
  const { pairId } = useParams<{ pairId: string }>();
  const navigate = useNavigate();
  const [localTradingData, setLocalTradingData] = useState<TradingData | null>(null);
  // const { addPosition } = usePositions(); // Removed, positions are managed by PositionsContext
  const { state: appState, dispatch } = useAppContext();
  const { addLocalOrder, removeLocalOrder, updateLocalOrder } = useOrderbookContext();
  const { refetchPositions } = usePositionsContext();

  useEffect(() => {
    const pairToLoad = pairId ? pairId.replace('-', '/') : appState.currentPair;
    if (pairToLoad) {
      const data = generateMockTradingData(pairToLoad, 200, 3600);
      if (data) {
        setLocalTradingData(data as TradingData);
        if (appState.currentPair !== pairToLoad) {
          dispatch({ type: 'SET_PAIR', payload: pairToLoad });
        }
      } else {
        console.error(`Failed to load trading data for ${pairToLoad}`);
        setLocalTradingData(null);
      }
    }
  }, [pairId, appState.currentPair, dispatch]);

  useEffect(() => {
    if (localTradingData) {
      document.title = `${localTradingData.currentPrice.toFixed(3)} | ${localTradingData.assetPair} | HyLiquid`;
    }
  }, [localTradingData]);

  useEffect(() => {
    if (pairId) {
      OrderbookWsService.connect(pairId);
      
      const unsubscribeOrderCreated = OrderbookWsService.onOrderCreated((order: Order) => {
        console.log('Received OrderCreated event for pair:', pairId, order);
        addLocalOrder(order);
      });
      
      const unsubscribeOrderCancelled = OrderbookWsService.onOrderCancelled((cancelData) => {
        console.log('Received OrderCancelled event for pair:', pairId, cancelData);
        removeLocalOrder(cancelData.order_id);
      });

      const unsubscribeOrderExecuted = OrderbookWsService.onOrderExecuted((executedData) => {
        console.log('Received OrderExecuted event for pair:', pairId, executedData);
        removeLocalOrder(executedData.order_id);
        refetchPositions();
      });

      const unsubscribeOrderUpdated = OrderbookWsService.onOrderUpdated((updateData) => {
        console.log('Received OrderUpdate event for pair:', pairId, updateData);
        updateLocalOrder(updateData.order_id, updateData.remaining_quantity);
        // Optional: refetchPositions if an order update could affect overall position calculation
        // refetchPositions(); 
      });
      
      return () => {
        unsubscribeOrderCreated();
        unsubscribeOrderCancelled();
        unsubscribeOrderExecuted();
        unsubscribeOrderUpdated(); // Unsubscribe from order updates
      };
    }
  }, [pairId, addLocalOrder, removeLocalOrder, updateLocalOrder, refetchPositions]); // Added updateLocalOrder to dependencies

  if (!localTradingData || !appState.currentPair) {
    return <div>Loading trading data for {pairId}...</div>;
  }

  const { assetPair, historicalData, currentPrice, volume24h = 0, marketCap = 0, contractAddress } = localTradingData!;
  const currentActivePair = appState.currentPair;
  
  // const allPositions = Object.values(appState.positions).flat(); // Removed

  const lastCandle = historicalData.length > 0 ? historicalData[historicalData.length - 1] : null;
  const dailyChangeValue = lastCandle ? (lastCandle.close - lastCandle.open).toFixed(3) : "0.00";
  const dailyChangePercentage = lastCandle && lastCandle.open !== 0 
    ? (((lastCandle.close - lastCandle.open) / lastCandle.open) * 100).toFixed(2) + "%" 
    : "0.00%";
  const isPositiveChange = lastCandle ? lastCandle.close > lastCandle.open : false;

  const formatLargeNumber = (num?: number): string => {
    if (typeof num !== 'number' || isNaN(num)) {
      return 'N/A';
    }
    if (num >= 1_000_000_000) {
      return (num / 1_000_000_000).toFixed(2) + 'B';
    }
    if (num >= 1_000_000) {
      return (num / 1_000_000).toFixed(2) + 'M';
    }
    if (num >= 1_000) {
      return (num / 1_000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
  };

  const formatContractAddress = (address?: string): string => {
    if (!address) return 'N/A';
    if (address.length <= 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const marketBannerData = {
    price: currentPrice.toFixed(localTradingData.currentPrice > 10 ? 2 : 4),
    change: {
      value: `${isPositiveChange ? '+' : ''}${dailyChangeValue}`,
      percentage: `${isPositiveChange ? '+' : ''}${dailyChangePercentage}`,
      isPositive: isPositiveChange
    },
    volume: `$${formatLargeNumber(volume24h)}`,
    marketCap: `$${formatLargeNumber(marketCap)}`,
    contract: formatContractAddress(contractAddress)
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>HyLiquid - {assetPair}</h1>
        <div className="header-actions">
          <button onClick={() => navigate('/deposit')}>Deposit</button>
        </div>
      </header>
      
      <main className="app-main">
        <div className="trading-interface">
          <div className="market-section">
            <div className="chart-orderbook-container">
              <div className="chart-section">
                <MarketInfoBanner 
                  price={marketBannerData.price}
                  change={marketBannerData.change}
                  volume={marketBannerData.volume}
                  marketCap={marketBannerData.marketCap}
                  contract={marketBannerData.contract}
                />
                <div className="chart-container">
                  <CandleChart candleData={historicalData} />
                </div>
              </div>
              
              <div className="orderbook-container">
                <Orderbook 
                  showHeader={true}
                  showSpread={true}
                />
              </div>
            </div>
            
            <div className="positions-container">
              {/* Removed positions prop */}
              <Positions /> 
            </div>
          </div>

          <div className="trading-form-section">
            <div className="spot-trading-container">
              <TradingForm 
                // onSubmit={(newPosition) => addPosition(currentActivePair, newPosition)} // Removed addPosition call
                marketPrice={currentPrice}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PairPage; 