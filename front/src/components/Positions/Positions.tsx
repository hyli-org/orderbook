import React from 'react';
import styled from 'styled-components';
import { theme } from '../../styles/theme';

interface Position {
  asset: string;
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  pnlPercent: number;
}

interface PositionsProps {
  positions?: Position[];
}

const PositionsContainer = styled.div`
  width: 100%;
  height: 100%;
  background-color: ${theme.colors.background};
  border-radius: 8px;
  padding: ${theme.spacing.md};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
`;

const PositionsTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 1rem;
  color: ${theme.colors.text};
`;

const PositionsTable = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100% - 50px);
  overflow-y: auto;
`;

const PositionsHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
  gap: 0.5rem;
  padding: 0.5rem;
  font-weight: 600;
  border-bottom: 1px solid #2a2a2b;
  color: ${theme.colors.textSecondary};
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.5px;
`;

const NoPositions = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${theme.colors.textSecondary};
  font-style: italic;
`;

export const Positions: React.FC<PositionsProps> = ({ positions = [] }) => {
  return (
    <PositionsContainer>
      <PositionsTitle>Current Positions</PositionsTitle>
      <PositionsTable>
        <PositionsHeader>
          <div>Asset</div>
          <div>Size</div>
          <div>Entry Price</div>
          <div>Mark Price</div>
          <div>PnL</div>
          <div>Actions</div>
        </PositionsHeader>
        {positions.length === 0 ? (
          <NoPositions>
            No open positions
          </NoPositions>
        ) : (
          positions.map((position, index) => (
            <div key={index}>
              {/* Position rows would go here */}
            </div>
          ))
        )}
      </PositionsTable>
    </PositionsContainer>
  );
}; 