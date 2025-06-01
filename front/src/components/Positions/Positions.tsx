import React from 'react';
import styled from 'styled-components';
import { theme } from '../../styles/theme';
// import type { Position } from '../../types/position'; // No longer using local Position type
import { usePositionsContext } from '../../contexts/PositionsContext'; // Import context 
import type { UserPositionOrder } from '../../contexts/PositionsContext'; // Import type separately
import { nodeService } from '../../services/NodeService'; // Added for cancel order
import { cancelOrder } from '../../models/Orderbook'; // Added for cancel order
import type { BlobTransaction, Identity } from 'hyli'; // Added for cancel order
import { useAppContext } from '../../contexts/AppContext'; // Added for current user

// The UserPositionOrder type is imported from '../../contexts/PositionsContext'
// It should include: pairName, asset, quantity, price

interface PositionsProps {
  // positions?: Position[]; // Prop is no longer needed
}

const PositionsContainer = styled.div`
  width: 100%;
  height: 100%;
  background-color: ${theme.colors.background};
  border-radius: 12px;
  padding: ${theme.spacing.lg};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.05);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${theme.spacing.lg};
  padding-bottom: ${theme.spacing.md};
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`;

const PositionsTitle = styled.h2`
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: ${theme.colors.text};
  letter-spacing: -0.02em;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  
  &:before {
    content: '';
    width: 4px;
    height: 24px;
    background: linear-gradient(135deg, ${theme.colors.positive}, ${theme.colors.accent1});
    border-radius: 2px;
  }
`;

const PositionCount = styled.span`
  background: rgba(255, 255, 255, 0.08);
  color: ${theme.colors.textSecondary};
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
`;

const TableContainer = styled.div`
  flex: 1;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: sticky;
  top: 0;
  z-index: 2;
`;

const HeaderCell = styled.div`
  font-size: 10px;
  font-weight: 700;
  color: ${theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.8px;
  display: flex;
  align-items: center;
`;

const TableBody = styled.div`
  overflow-y: auto;
  max-height: calc(100vh - 250px);
  
  &::-webkit-scrollbar {
    width: 4px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    
    &:hover {
      background: rgba(255, 255, 255, 0.15);
    }
  }
`;

const PositionRow = styled.div`
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.xs} ${theme.spacing.md};
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: all 0.15s ease;
  align-items: center;
  
  &:hover {
    background: rgba(255, 255, 255, 0.04);
    transform: translateX(1px);
  }
  
  &:last-child {
    border-bottom: none;
  }
`;

const Cell = styled.div`
  display: flex;
  align-items: center;
  font-size: 12px;
  color: ${theme.colors.text};
  min-height: 28px;
`;

const AssetCell = styled(Cell)`
  font-weight: 700;
  font-size: 13px;
  letter-spacing: -0.01em;
`;

const MarketCell = styled(Cell)`
  color: ${theme.colors.textSecondary};
  font-weight: 500;
  font-size: 11px;
`;

const SideCell = styled(Cell)<{ side: 'Buy' | 'Sell' }>`
  font-weight: 700;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  
  &:before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-right: 6px;
    background: ${props => props.side === 'Buy' ? theme.colors.positive : theme.colors.negative};
  }
  
  color: ${props => props.side === 'Buy' ? theme.colors.positive : theme.colors.negative};
`;

const SizeCell = styled(Cell)`
  font-weight: 600;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  font-size: 11px;
`;

const PriceCell = styled(Cell)`
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  font-weight: 500;
  letter-spacing: 0.01em;
  font-size: 11px;
`;

const ActionsCell = styled(Cell)`
  justify-content: center;
  width: 100%;
`;

const CloseButton = styled.button`
  background: ${theme.colors.negative};
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  transition: all 0.15s ease;
  min-width: 40px;
  
  &:hover {
    background: ${theme.colors.negative}dd;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(255, 59, 48, 0.25);
  }
  
  &:active {
    transform: translateY(0);
    box-shadow: 0 1px 4px rgba(255, 59, 48, 0.25);
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.lg} ${theme.spacing.lg};
  text-align: center;
  color: ${theme.colors.textSecondary};
  min-height: 200px;
`;

const EmptyIcon = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: ${theme.spacing.md};
  font-size: 20px;
`;

const EmptyTitle = styled.h3`
  margin: 0 0 ${theme.spacing.sm} 0;
  font-size: 16px;
  font-weight: 600;
  color: ${theme.colors.text};
`;

const EmptyDescription = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${theme.colors.textSecondary};
  line-height: 1.5;
`;

const LoadingState = styled(EmptyState)`
  min-height: 150px;
`;

const LoadingSpinner = styled.div`
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top: 3px solid ${theme.colors.accent1};
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: ${theme.spacing.md};
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const ErrorState = styled(EmptyState)`
  color: ${theme.colors.negative};
`;

const RetryButton = styled.button`
  background: ${theme.colors.accent1};
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  margin-top: ${theme.spacing.sm};
  transition: all 0.2s ease;
  
  &:hover {
    background: ${theme.colors.accent1}dd;
    transform: translateY(-1px);
  }
`;

// Define the type for the enhanced position data used for rendering
interface EnhancedPositionForDisplay {
  pairName: string;    // From UserPositionOrder
  asset: string;       // From UserPositionOrder (base asset)
  quantity: number;    // From UserPositionOrder
  entryPrice: number;  // Derived from UserPositionOrder.price
  markPrice: number;   // Derived from UserPositionOrder.price (simplification)
  market: string;      // Derived: Quote asset (e.g., "HYLLAR")
  side: 'Buy' | 'Sell'; // Derived: 'buy' or 'sell'
  displaySize: number; // Derived: Absolute quantity for display
  displayAsset: string; // Derived: Base asset for display (same as asset)
  // Original UserPositionOrder fields can be included if needed elsewhere
  originalOrderData: UserPositionOrder;
}


export const Positions: React.FC<PositionsProps> = () => {
  const { positions, loading, error, refetchPositions } = usePositionsContext();
  const { fetchBalances, wallet } = useAppContext(); // Use AppContext for wallet and balance updates

  // Process positions to include market information and adapt to display structure
  const enhancedPositions: EnhancedPositionForDisplay[] = positions.map((orderData: UserPositionOrder) => {
    const { pairName, asset, quantity, price, order_type } = orderData;
    const quoteAsset = pairName.split('/')[1] || 'HYLLAR';
    const side = order_type; // Use order_type directly from API
    const displaySize = Math.abs(quantity);
    
    return {
      pairName,
      asset,
      quantity,
      entryPrice: price,
      markPrice: price,
      market: quoteAsset,
      side,
      displaySize,
      displayAsset: asset,
      originalOrderData: orderData,
    };
  });

  // Handle cancel order functionality
  const handleCancelOrder = async (order: UserPositionOrder) => {
    if (!wallet?.address) {
      console.error("No wallet addressSend available for canceling order");
      return;
    }

    try {
      console.log('Canceling order:', order.order_id);
      
      const blob = cancelOrder(order.order_id);
      
      const identity: Identity = wallet as Identity;
      
      const blobTx: BlobTransaction = {
        identity,
        blobs: [blob],
      };

      console.log('Sending cancel transaction:', blobTx);
      const blobTxHash = await nodeService.client.sendBlobTx(blobTx);
      console.log('Cancel transaction sent, hash:', blobTxHash);
      
      // Fetch updated balances after successful cancellation
      if (wallet?.address) {
        await fetchBalances(wallet.addressSend);
      }

      // Refetch positions after successful cancellation and balance update
      refetchPositions();
      
    } catch (error) {
      console.error('Failed to cancel order:', error);
      // Handle error appropriately in the UI
    }
  };

  if (loading) {
    return (
      <PositionsContainer>
        <Header>
          <PositionsTitle>Current Positions</PositionsTitle>
        </Header>
        <LoadingState>
          <LoadingSpinner />
          <EmptyTitle>Loading positions...</EmptyTitle>
          <EmptyDescription>Fetching your current trading positions</EmptyDescription>
        </LoadingState>
      </PositionsContainer>
    );
  }

  if (error) {
    return (
      <PositionsContainer>
        <Header>
          <PositionsTitle>Current Positions</PositionsTitle>
        </Header>
        <ErrorState>
          <EmptyIcon>⚠️</EmptyIcon>
          <EmptyTitle>Failed to load positions</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
          <RetryButton onClick={refetchPositions}>Retry</RetryButton>
        </ErrorState>
      </PositionsContainer>
    );
  }

  return (
    <PositionsContainer>
      <Header>
        <PositionsTitle>Current Positions</PositionsTitle>
        <PositionCount>{enhancedPositions.length}</PositionCount>
      </Header>
      
      {enhancedPositions.length === 0 ? (
        <EmptyState>
          <EmptyIcon>📊</EmptyIcon>
          <EmptyTitle>No open positions</EmptyTitle>
          <EmptyDescription>
            You don't have any active trading positions.<br />
            Start trading to see your positions here.
          </EmptyDescription>
        </EmptyState>
      ) : (
        <TableContainer>
          <TableHeader>
            <HeaderCell>Asset</HeaderCell>
            <HeaderCell>Market</HeaderCell>
            <HeaderCell>Side</HeaderCell>
            <HeaderCell>Size</HeaderCell>
            <HeaderCell>Entry</HeaderCell>
            <HeaderCell>Mark</HeaderCell>
            <HeaderCell>Actions</HeaderCell>
          </TableHeader>
          <TableBody>
            {enhancedPositions.map((position, index) => (
              <PositionRow key={`${position.pairName}-${position.asset}-${position.entryPrice}-${index}`}>
                <AssetCell>{position.displayAsset}</AssetCell>
                <MarketCell>{position.market}</MarketCell>
                <SideCell side={position.side}>{position.side}</SideCell>
                <SizeCell>{position.displaySize.toLocaleString()}</SizeCell>
                <PriceCell>{position.entryPrice.toFixed(2)}</PriceCell>
                <PriceCell>{position.markPrice.toFixed(2)}</PriceCell>
                <ActionsCell>
                  <CloseButton onClick={() => handleCancelOrder(position.originalOrderData)}>Close</CloseButton>
                </ActionsCell>
              </PositionRow>
            ))}
          </TableBody>
        </TableContainer>
      )}
    </PositionsContainer>
  );
};