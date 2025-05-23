import React from 'react';
import styled from 'styled-components';
import type { OrderbookRowProps } from './types';
import { theme } from '../../styles/theme';

interface RowContainerProps {
  isBid: boolean;
}

const RowContainer = styled.div<RowContainerProps>`
  display: flex;
  justify-content: space-between;
  padding: 4px 10px;
  position: relative;
  color: ${(props) => (props.isBid ? theme.colors.positive : theme.colors.negative)};
  font-size: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.02);
  transition: background-color 0.15s ease;

  &:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }
`;

const PriceItem = styled.span<{ isBid: boolean }>`
  flex: 1;
  text-align: left;
  position: relative;
  z-index: 1; 
  font-family: 'Roboto Mono', monospace, sans-serif;
  font-weight: 500;
  color: ${(props) => (props.isBid ? theme.colors.positive : theme.colors.negative)};
`;

const SizeItem = styled.span`
  flex: 1;
  text-align: right;
  position: relative;
  z-index: 1; 
  font-family: 'Roboto Mono', monospace, sans-serif;
  font-weight: 500;
  color: ${theme.colors.text};
`;

const TotalItem = styled.span`
  flex: 1;
  text-align: right;
  position: relative;
  z-index: 1; 
  font-family: 'Roboto Mono', monospace, sans-serif;
  font-weight: 400;
  color: ${theme.colors.textSecondary};
`;

interface DepthBarProps {
  isBid: boolean;
  depthPercentage: number;
}

const DepthBar = styled.div<DepthBarProps>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: ${(props) => props.depthPercentage}%;
  background-color: ${(props) =>
    props.isBid
      ? `rgba(${hexToRgb(theme.colors.positive)}, 0.08)`
      : `rgba(${hexToRgb(theme.colors.negative)}, 0.08)`};
  z-index: 0;
  transition: width 0.3s ease-out;
`;

// Helper to convert hex to rgb for rgba usage
const hexToRgb = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0,0,0';
};

export const OrderbookRow: React.FC<OrderbookRowProps> = ({ 
  order, 
  maxTotal = 1,
  onClick,
  precision = 2
}) => {
  const total = (order.price || 0) * order.quantity;
  const isBid = order.order_type === 'Buy';
  const depthPercentage = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

  // Format numbers with thousand separators
  const formatNumber = (num: number, decimals: number): string => {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  return (
    <RowContainer isBid={isBid} onClick={() => onClick?.(order)}>
      <DepthBar isBid={isBid} depthPercentage={depthPercentage} />
      <PriceItem isBid={isBid}>{formatNumber(order.price || 0, precision)}</PriceItem>
      <SizeItem>{formatNumber(order.quantity, precision)}</SizeItem>
      <TotalItem>{formatNumber(total, precision)}</TotalItem>
    </RowContainer>
  );
};