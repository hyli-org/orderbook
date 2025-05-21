import React, { useState, useEffect } from 'react';
import { Orderbook, CandleChart, Positions, TradingForm, MarketInfoBanner } from './components';
import { useOrderbook } from './hooks/useOrderbook';
import { generateMockTradingData } from './utils/mockData'; 
import type { MockTradingData, CandleData } from './utils/mockData'; // Correct type-only import
import './App.css';

function App() {
  const [tradingData, setTradingData] = useState<MockTradingData | null>(null);

  useEffect(() => {
    // Generate initial mock data
    setTradingData(generateMockTradingData("ORANJ/USDC", 200, 3600, 25)); // Example: ORANJ/USDC, 200 hourly candles, starting price 25
  }, []);

  // Update document title with asset pair and price
  useEffect(() => {
    if (tradingData) {
      document.title = `${tradingData.assetPair} | ${tradingData.currentPrice.toFixed(3)} - HyLiquid`;
    }
  }, [tradingData]); // Re-run when tradingData (and thus assetPair or currentPrice) changes

  // Use the useOrderbook hook with data from our mock generator
  const { orderbook } = useOrderbook(tradingData?.currentOrderbook.bids, tradingData?.currentOrderbook.asks);

  const handlePlaceOrder = (formData: any) => {
    console.log('Placing order:', formData);
    // In a real app, this would submit to your backend/API
  };

  if (!tradingData) {
    return <div>Loading trading data...</div>; // Or some other loading indicator
  }

  const { assetPair, historicalData, currentPrice } = tradingData;
  const lastCandle = historicalData.length > 0 ? historicalData[historicalData.length -1] : null;
  const dailyChangeValue = lastCandle ? (lastCandle.close - lastCandle.open).toFixed(3) : "0.00";
  const dailyChangePercentage = lastCandle && lastCandle.open !== 0 ? (((lastCandle.close - lastCandle.open) / lastCandle.open) * 100).toFixed(2) + "%" : "0.00%";
  const isPositiveChange = lastCandle ? lastCandle.close > lastCandle.open : false;

  const marketBannerData = {
    pair: assetPair,
    price: currentPrice.toFixed(3),
    change: {
      value: `${isPositiveChange ? '+':''}${dailyChangeValue}`,
      percentage: `${isPositiveChange ? '+':''}${dailyChangePercentage}`,
      isPositive: isPositiveChange
    },
    volume: "$103,310,917.66", // This is still hardcoded, consider generating if needed
    marketCap: "$9,028,456,311", // Also hardcoded
    contract: "0x0d01...11ec" // Also hardcoded
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>HyLiquid</h1>
        <div className="header-actions">
          <button>Deposit</button>
        </div>
      </header>
      
      <main className="app-main">
        <div className="trading-interface">
          <div className="market-section">
            <div className="chart-orderbook-container">
              <div className="chart-section">
                <MarketInfoBanner 
                  pair={marketBannerData.pair}
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
                  bids={orderbook.bids}
                  asks={orderbook.asks}
                />
              </div>
            </div>
            
            <div className="positions-container">
              <Positions positions={[]} />
            </div>
          </div>

          <div className="trading-form-section">
            <div className="spot-trading-container">
              <TradingForm onSubmit={handlePlaceOrder} />
            </div>
          </div>
        </div>
        
        <div className="account-info-container">
          <div>Account Balance: 0.00 USDC</div>
        </div>
      </main>
    </div>
  );
}

export default App;
