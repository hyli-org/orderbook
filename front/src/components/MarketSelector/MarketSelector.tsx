import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../contexts/AppContext';
import { MOCK_ASSETS } from '../../constants/assets';
import './MarketSelector.css'; // We'll create this CSS file next

export const MarketSelector: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { currentPair } = state;
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelectPair = (pairId: string) => {
    if (pairId !== currentPair) {
      // Dispatch an action to update the current pair in the global state
      dispatch({ type: 'SET_PAIR', payload: pairId });
      // Navigate to the new pair's URL
      navigate(`/pair/${pairId.replace('/', '-')}`);
    }
    setIsOpen(false); // Close the dropdown after selection
  };

  const currentMarket = MOCK_ASSETS.find(asset => asset.id === currentPair);

  return (
    <div className="market-selector-container">
      <button className="market-selector-button" onClick={() => setIsOpen(!isOpen)}>
        <span>{currentMarket ? currentMarket.name : 'Select Market'}</span>
        <span className={`arrow ${isOpen ? 'up' : 'down'}`}>&#9660;</span> {/* Down arrow, changes to up if needed */}
      </button>
      {isOpen && (
        <div className="market-selector-dropdown">
          <div className="market-search-bar">
            <input type="text" placeholder="Search" /> {/* Basic search, can be enhanced */}
          </div>
          {/* TODO: Add tabs for categories like All, Spot, Perps if needed */}
          <ul className="market-list">
            {MOCK_ASSETS.map((asset) => (
              <li 
                key={asset.id} 
                className={`market-list-item ${asset.id === currentPair ? 'active' : ''}`}
                onClick={() => handleSelectPair(asset.id)}
              >
                <span className="market-name">{asset.name}</span>
                {/* TODO: Add more details like last price, change from MOCK_ASSETS or context */}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}; 