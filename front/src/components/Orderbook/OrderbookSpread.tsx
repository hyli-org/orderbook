import React from 'react';
import styled from 'styled-components';
import type { OrderbookSpreadProps } from './types';
import { theme } from '../../styles/theme';

const SpreadContainer = styled.div`
  padding: 4px 10px;
  text-align: center;
  border-top: 1px solid rgba(45, 127, 143, 0.1);
  border-bottom: 1px solid rgba(45, 127, 143, 0.1);
  background-color: rgba(45, 127, 143, 0.05);
  margin: 0;
  color: ${theme.colors.accent1};
  font-weight: 500;
  font-size: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const SpreadLabel = styled.span`
  color: ${theme.colors.textSecondary};
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const SpreadValue = styled.span`
  font-family: 'Roboto Mono', monospace, sans-serif;
  display: flex;
  align-items: center;
  gap: 5px;
`;

const SpreadPercentage = styled.span`
  opacity: 0.7;
  font-size: 11px;
  color: ${theme.colors.textSecondary};
`;

export const OrderbookSpread: React.FC<OrderbookSpreadProps> = ({ spread, spreadPercentage }) => {
  return (
    <SpreadContainer>
      <SpreadLabel>Spread</SpreadLabel>
      <SpreadValue>
        {spread.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        <SpreadPercentage>
          ({spreadPercentage.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}%)
        </SpreadPercentage>
      </SpreadValue>
    </SpreadContainer>
  );
}; 