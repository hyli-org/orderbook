import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Orderbook, CandleChart, Positions, TradingForm, MarketInfoBanner } from './index';
import { useTradingData } from '../hooks/useTradingData';
import { usePositions } from '../hooks/usePositions';
import { useAppContext } from '../contexts/AppContext';
import '../App.css';

const PairPage: React.FC = () => {
  const { pairId } = useParams<{ pairId: string }>();
  const navigate = useNavigate();
  const tradingData = useTradingData(pairId); // Fetches and manages trading data via context
  const { addPosition } = usePositions(); // Remove positions from here
  const { state: appState } = useAppContext(); // Get full app state

  useEffect(() => {
    if (tradingData) {
      document.title = `${tradingData.currentPrice.toFixed(3)} | ${tradingData.assetPair} | HyLiquid`;
    }
  }, [tradingData]);

  if (!tradingData || !appState.currentPair) { // Added check for appState.currentPair
    return <div>Loading trading data for {pairId}...</div>;
  }

  // Destructure necessary data directly from tradingData
  const { assetPair, historicalData, currentPrice, volume24h = 0, marketCap = 0, contractAddress } = tradingData!;
  const currentActivePair = appState.currentPair; // Use currentPair from global state
  
  // Consolidate all positions from the appState
  const allPositions = Object.values(appState.positions).flat();
  
  // Calculations for MarketInfoBanner based on tradingData
  const lastCandle = historicalData.length > 0 ? historicalData[historicalData.length - 1] : null;
  const dailyChangeValue = lastCandle ? (lastCandle.close - lastCandle.open).toFixed(3) : "0.00";
  const dailyChangePercentage = lastCandle && lastCandle.open !== 0 
    ? (((lastCandle.close - lastCandle.open) / lastCandle.open) * 100).toFixed(2) + "%" 
    : "0.00%";
  const isPositiveChange = lastCandle ? lastCandle.close > lastCandle.open : false;

  // Helper function to format large numbers
  const formatLargeNumber = (num?: number): string => { // num can be optional
    if (typeof num !== 'number' || isNaN(num)) { // Check for valid number
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
    return num.toFixed(2); // Use toFixed(2) for consistency, even for smaller numbers
  };

  // Helper function to truncate contract address
  const formatContractAddress = (address?: string): string => {
    if (!address) return 'N/A';
    if (address.length <= 10) return address; // Arbitrary length, e.g., 0x + 4 chars + ... + 4 chars
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const marketBannerData = {
    price: currentPrice.toFixed(tradingData.currentPrice > 10 ? 2 : 4), // Dynamic precision for price
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
              <Positions positions={allPositions} />
            </div>
          </div>

          <div className="trading-form-section">
            <div className="spot-trading-container">
              <TradingForm 
                onSubmit={(newPosition) => addPosition(currentActivePair, newPosition)}
                marketPrice={currentPrice}
              />
            </div>
          </div>
        </div>
        
        <div className="account-info-container">
          <div>Account Balance: 0.00 USDC</div>
        </div>
      </main>
    </div>
  );
};

export default PairPage; 