import React, { useMemo, useRef, useState, useEffect } from 'react';
import styled from 'styled-components';
import { useOrderbook } from '../../hooks/useOrderbook';
import type { OrderbookFocus, OrderbookProps } from './types';
import { OrderbookHeader } from './OrderbookHeader';
import { OrderbookRow } from './OrderbookRow';
import { OrderbookSpread } from './OrderbookSpread';
import { theme } from '../../styles/theme';

const OrderbookContainer = styled.div`
  background-color: ${theme.colors.background};
  color: ${theme.colors.text};
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const OrderbookHeader1 = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
`;

const OrderbookTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
`;

const OrderbookControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const FocusButton = styled.button<{ isActive: boolean }>`
  background-color: ${props => props.isActive ? 'rgba(45, 127, 143, 0.2)' : 'transparent'};
  color: ${props => props.isActive ? theme.colors.accent1 : theme.colors.textSecondary};
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: rgba(45, 127, 143, 0.1);
  }
`;

const OrderbookContent = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
`;

const OrdersList = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
  
  /* Hide scrollbar for Chrome, Safari and Opera */
  &::-webkit-scrollbar {
    display: none;
  }
  /* Hide scrollbar for IE, Edge and Firefox */
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
`;

const AsksContainer = styled(OrdersList)`
  // flex: 1; // Already in OrdersList
`;

const BidsContainer = styled(OrdersList)`
  // flex: 1; // Already in OrdersList
`;

// Calculate a reasonable max number of rows based on container height and row height
const calculateMaxRows = (containerHeight: number, rowHeight: number = 24): number => {
  if (containerHeight <= 0 || rowHeight <= 0) return 0;
  // Calculate for one list (asks or bids), assuming they roughly share the space if both visible
  // Or, if only one is visible, it takes full height.
  // For simplicity now, we assume the containerHeight is for *one* of the lists if 'all' focus is not active,
  // or half if 'all' focus is active. This needs refinement if layout is complex.
  // The -1 is to leave a bit of breathing room or prevent a partial row from showing.
  return Math.max(0, Math.floor(containerHeight / rowHeight) -1 ); 
};

export const Orderbook: React.FC<OrderbookProps> = ({
  bids: initialBids,
  asks: initialAsks,
  showHeader = true,
  showSpread = true,
}) => {
  const { orderbook, focus, setFocus } = useOrderbook(initialBids, initialAsks);
  const orderbookContentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    const contentElement = orderbookContentRef.current;
    if (!contentElement) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        setContentHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(contentElement);
    return () => resizeObserver.unobserve(contentElement);
  }, []);
  
  const rowHeightEstimate = 24; // Estimated height of a single row

  // Calculate maxRows based on focus
  const maxRows = useMemo(() => {
    if (contentHeight === 0) return 10; // Default small number before measurement
    let availableHeight = contentHeight;
    if (showHeader) availableHeight -= 30; // Approximate height of OrderbookHeader, adjust if necessary
    if (showSpread && focus === 'all') availableHeight -= 30; // Approximate height of OrderbookSpread

    if (focus === 'all') {
      return calculateMaxRows(availableHeight / 2, rowHeightEstimate);
    } else {
      return calculateMaxRows(availableHeight, rowHeightEstimate);
    }
  }, [contentHeight, focus, showHeader, showSpread, rowHeightEstimate]);
  
  const visibleAsks = useMemo(() => {
    return orderbook.asks.slice(0, maxRows);
  }, [orderbook.asks, maxRows]);
  
  const visibleBids = useMemo(() => {
    return orderbook.bids.slice(0, maxRows);
  }, [orderbook.bids, maxRows]);

  // Calculate max total for depth visualization from the *displayed* orders
  const maxBidTotal = Math.max(...visibleBids.map(o => o.total), 0);
  const maxAskTotal = Math.max(...visibleAsks.map(o => o.total), 0);
  const maxTotal = Math.max(maxBidTotal, maxAskTotal, 1);

  return (
    <OrderbookContainer>
      <OrderbookHeader1>
        <OrderbookTitle>Order Book</OrderbookTitle>
        <OrderbookControls>
          <FocusButton 
            onClick={() => setFocus('all')} 
            isActive={focus === 'all'}
          >
            All
          </FocusButton>
          <FocusButton 
            onClick={() => setFocus('bids')} 
            isActive={focus === 'bids'}
          >
            Bids
          </FocusButton>
          <FocusButton 
            onClick={() => setFocus('asks')} 
            isActive={focus === 'asks'}
          >
            Asks
          </FocusButton>
        </OrderbookControls>
      </OrderbookHeader1>

      <OrderbookContent ref={orderbookContentRef}>
        {showHeader && <OrderbookHeader />}
        
        {(focus === 'all' || focus === 'asks') && (
          <AsksContainer>
            {/* Asks - displayed top-down (lowest price first), so reverse if your data is highest price first */} 
            {visibleAsks.slice().reverse().map((order) => (
              <OrderbookRow key={`ask-${order.price}`} order={order} type="ask" maxTotal={maxTotal} />
            ))}
          </AsksContainer>
        )}

        {showSpread && (focus === 'all') && 
          <OrderbookSpread spread={orderbook.spread} spreadPercentage={orderbook.spreadPercentage} />
        }

        {(focus === 'all' || focus === 'bids') && (
          <BidsContainer>
            {/* Bids */} 
            {visibleBids.map((order) => (
              <OrderbookRow key={`bid-${order.price}`} order={order} type="bid" maxTotal={maxTotal} />
            ))}
          </BidsContainer>
        )}
      </OrderbookContent>
    </OrderbookContainer>
  );
}; 