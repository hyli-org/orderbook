import React from 'react';
import styled from 'styled-components';
import type { OrderbookHeaderProps } from './types';
import { theme } from '../../styles/theme';

const HeaderContainer = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 6px 10px;
  margin-bottom: 0;
  font-weight: 500;
  color: ${theme.colors.textSecondary};
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
`;

const HeaderItemLeft = styled.span`
  flex: 1;
  text-align: left;
`;

const HeaderItemRight = styled.span`
  flex: 1;
  text-align: right;
`;

export const OrderbookHeader: React.FC<OrderbookHeaderProps> = () => {
  return (
    <HeaderContainer>
      <HeaderItemLeft>Price</HeaderItemLeft>
      <HeaderItemRight>Size</HeaderItemRight>
      <HeaderItemRight>Total</HeaderItemRight>
    </HeaderContainer>
  );
}; 