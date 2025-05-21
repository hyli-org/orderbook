import React from 'react';
import './MarketInfoBanner.css';

interface MarketInfoBannerProps {
  pair: string;
  price: string;
  change: {
    value: string;
    percentage: string;
    isPositive: boolean;
  };
  volume: string;
  marketCap: string;
  contract: string;
}

export const MarketInfoBanner: React.FC<MarketInfoBannerProps> = ({
  pair,
  price,
  change,
  volume,
  marketCap,
  contract
}) => {
  return (
    <div className="market-info-banner">
      <div className="pair-selector">
        <span className="pair-name">{pair}</span>
        <span className="dropdown-icon">▼</span>
      </div>
      
      <div className="market-data-item">
        <div className="data-label">Price</div>
        <div className="data-value">{price}</div>
      </div>
      
      <div className={`market-data-item ${change.isPositive ? 'positive' : 'negative'}`}>
        <div className="data-label">24h Change</div>
        <div className="data-value">{change.value} / {change.percentage}</div>
      </div>
      
      <div className="market-data-item">
        <div className="data-label">24h Volume</div>
        <div className="data-value">{volume}</div>
      </div>
      
      <div className="market-data-item">
        <div className="data-label">Market Cap</div>
        <div className="data-value">{marketCap}</div>
      </div>
      
      <div className="market-data-item">
        <div className="data-label">Contract</div>
        <div className="data-value">{contract}</div>
      </div>
    </div>
  );
};

export default MarketInfoBanner; 