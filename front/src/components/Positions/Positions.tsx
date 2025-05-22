import React from 'react';
import styled from 'styled-components';
import { theme } from '../../styles/theme';
import type { Position } from '../../types/position';

// The Position type is imported from '../../types/position'
// It should include: asset, size, entryPrice, markPrice, pnl, pnlPercent
// We'll enhance it with market and side properties at runtime

interface PositionsProps {
  positions?: Position[];
}

const PositionsContainer = styled.div`
  width: 100%;
  height: 100%;
  background-color: ${theme.colors.background};
  border-radius: 12px;
  padding: ${theme.spacing.md};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
`;

const PositionsTitle = styled.h2`
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 1.2rem;
  color: ${theme.colors.text};
  letter-spacing: 0.5px;
  position: relative;
  padding-bottom: 10px;
  
  &:after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 40px;
    height: 3px;
    background: linear-gradient(90deg, ${theme.colors.positive}, ${theme.colors.accent1});
    border-radius: 3px;
  }
`;

const PositionsTable = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100% - 60px);
  overflow-y: auto;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    
    &:hover {
      background: rgba(255, 255, 255, 0.15);
    }
  }
`;

const PositionsHeader = styled.div`
  display: grid;
  grid-template-columns: 0.8fr 0.6fr 1fr 0.8fr 0.8fr 0.8fr 1fr 0.8fr;
  gap: 0.5rem;
  padding: 0.75rem 0.5rem;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: ${theme.colors.textSecondary};
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.8px;
  position: sticky;
  top: 0;
  background-color: ${theme.colors.background};
  z-index: 1;
`;

const PositionRow = styled.div`
  display: grid;
  grid-template-columns: 0.8fr 0.6fr 1fr 0.8fr 0.8fr 0.8fr 1fr 0.8fr;
  gap: 0.5rem;
  padding: 0.85rem 0.5rem;
  margin: 0.3rem 0;
  border-radius: 6px;
  color: ${theme.colors.text};
  font-size: 14px;
  transition: background-color 0.2s ease;
  
  &:hover {
    background-color: rgba(255, 255, 255, 0.03);
  }

  div {
    display: flex;
    align-items: center;
  }
`;

const AssetCell = styled.div`
  font-weight: 600;
  font-size: 14px;
`;

const MarketCell = styled.div`
  color: ${theme.colors.textSecondary};
  font-size: 14px;
`;

const SideCell = styled.div<{side: 'buy' | 'sell'}>`
  font-weight: 600;
  color: ${props => props.side === 'buy' ? theme.colors.positive : theme.colors.negative};
  text-transform: uppercase;
  font-size: 13px;
  letter-spacing: 0.5px;
`;

const SizeCell = styled.div`
  font-weight: 500;
`;

const PriceCell = styled.div`
  font-family: monospace;
  letter-spacing: 0.5px;
`;

const PnlValue = styled.div<{isPositive: boolean}>`
  color: ${props => props.isPositive ? theme.colors.positive : theme.colors.negative};
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  
  &:before {
    content: ${props => props.isPositive ? '"▲"' : '"▼"'};
    margin-right: 5px;
    font-size: 10px;
  }
`;

const CloseButton = styled.button`
  background-color: ${theme.colors.negative};
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  
  &:hover {
    background-color: ${theme.colors.negative}ee;
    transform: translateY(-1px);
    box-shadow: 0 2px 5px rgba(255, 59, 48, 0.3);
  }
  
  &:active {
    transform: translateY(0);
    box-shadow: none;
  }
`;

const NoPositions = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${theme.colors.textSecondary};
  font-style: italic;
  padding: 2rem;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  margin-top: 1rem;
`;

export const Positions: React.FC<PositionsProps> = ({ positions = [] }) => {
  // Process positions to include market information
  const enhancedPositions = positions.map(position => {
    // Derive quote asset from pairName
    const quoteAsset = position.pairName.split('/')[1] || 'USDC'; // Fallback if split fails
    
    // Determine the side based on the size
    const side = (position as any).side || (position.size >= 0 ? 'buy' : 'sell');
    
    // Ensure size is displayed as absolute value
    const displaySize = Math.abs(position.size);
    
    // Format position with pair info
    const formattedPosition = {
      ...position,
      market: quoteAsset, // Use derived quote asset
      side,
      displaySize,
      displayAsset: position.asset // asset field is already the base asset
    };
    
    return formattedPosition;
  });

  return (
    <PositionsContainer>
      <PositionsTitle>Current Positions</PositionsTitle>
      <PositionsTable>
        <PositionsHeader>
          <div>Asset</div>
          <div>Market</div>
          <div>Side</div>
          <div>Size</div>
          <div>Entry</div>
          <div>Mark</div>
          <div>PnL</div>
          <div>Actions</div>
        </PositionsHeader>
        {positions.length === 0 ? (
          <NoPositions>
            No open positions
          </NoPositions>
        ) : (
          enhancedPositions.map((position, index) => (
            <PositionRow key={`${position.pairName}-${position.asset}-${index}`}>
              <AssetCell>{position.displayAsset}</AssetCell>
              <MarketCell>{position.market}</MarketCell>
              <SideCell side={position.side}>{position.side}</SideCell>
              <SizeCell>{position.displaySize}</SizeCell>
              <PriceCell>{position.entryPrice.toFixed(2)}</PriceCell>
              <PriceCell>{position.markPrice.toFixed(2)}</PriceCell>
              <PnlValue isPositive={position.pnl >= 0}>
                {position.pnl.toFixed(2)} ({position.pnlPercent.toFixed(2)}%)
              </PnlValue>
              <div>
                <CloseButton>Close</CloseButton>
              </div>
            </PositionRow>
          ))
        )}
      </PositionsTable>
    </PositionsContainer>
  );
};