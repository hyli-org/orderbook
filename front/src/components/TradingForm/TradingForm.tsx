import React, { useState } from 'react';
import styled from 'styled-components';
import { theme } from '../../styles/theme';
import type { Position } from '../../types/position'; // Import Position interface
import { nodeService } from '../../services/NodeService'; // Added
import { createOrder, OrderType as OrderbookOrderType } from '../../models/Orderbook'; // Added
import type { BlobTransaction, Identity } from 'hyli'; // Added
import { useAppContext } from '../../contexts/AppContext'; // Import useAppContext
import { usePositionsContext } from '../../contexts/PositionsContext'; // Import usePositionsContext

// Assuming Position interface is available or imported
// For now, let's define it here if not globally available in this context
/*
interface Position {
  asset: string;
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  pnlPercent: number;
}
*/

interface TradingFormProps {
  // assetName: string; // Added to identify the asset being traded
  onSubmit?: (position: Position) => void; // Modified to pass the whole Position object
  marketPrice?: number; // Added to receive the current market price
}

const FormContainer = styled.div`
  width: 100%;
  height: 100%;
  background-color: ${theme.colors.background};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
`;

const TabsContainer = styled.div`
  display: flex;
  border-bottom: 1px solid #2a2a2b;
  margin-bottom: 0.5rem;
`;

const Tab = styled.button<{ active: boolean }>`
  padding: 0.6rem 0.75rem;
  background: none;
  border: none;
  color: ${props => props.active ? theme.colors.text : theme.colors.textSecondary};
  font-weight: ${props => props.active ? '600' : '400'};
  font-size: 12px;
  cursor: pointer;
  position: relative;
  
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 2px;
    background-color: ${props => props.active ? theme.colors.accent1 : 'transparent'};
  }
`;

const OrderTypeContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
`;

const OrderTypeButton = styled.button<{ active: boolean; isBuy: boolean }>`
  flex: 1;
  padding: 0.6rem 0.5rem;
  border-radius: 4px;
  border: 1px solid transparent;
  background-color: ${props => 
    props.active 
      ? (props.isBuy ? theme.colors.positive : theme.colors.negative) 
      : '#2a2a2b'};
  color: ${props => 
    props.active 
      ? '#fff' 
      : (props.isBuy ? theme.colors.positive : theme.colors.negative)};
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover:not(:disabled) {
    background-color: ${props => 
      props.isBuy ? theme.colors.positive : theme.colors.negative};
    // Simplified hover to avoid darken, adjust as needed
    opacity: 0.8;
    color: #fff;
  }

  &:not(:active) {
    border: 1px solid ${props => props.isBuy ? theme.colors.positive : theme.colors.negative};
  }
`;

const FormGroup = styled.div`
  margin-bottom: 0.75rem;
`;

const FlexRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
  font-size: 12px;
`;

const Label = styled.label`
  display: block;
  font-size: 12px;
  color: ${theme.colors.textSecondary};
`;

const Value = styled.div`
  font-size: 12px;
  text-align: right;
`;

const FormInput = styled.input`
  width: 100%;
  background-color: #232324;
  border: 1px solid #2a2a2b;
  color: ${theme.colors.text};
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${theme.colors.accent1};
    box-shadow: 0 0 0 1px ${theme.colors.accent1};
  }
`;

const DropdownContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const SelectStyled = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  background-color: #232324;
  border: 1px solid #2a2a2b;
  border-radius: 4px;
  color: ${theme.colors.text};
  cursor: pointer;
  font-size: 14px;
  min-width: 80px;
  margin-left: 0.5rem;
`;

const ChevronIcon = styled.span`
  margin-left: 0.5rem;
  font-size: 10px;
`;

const PlaceOrderButton = styled.button`
  width: 100%;
  padding: 0.75rem;
  margin: 1rem 0 0.5rem;
  border: none;
  border-radius: 4px;
  background-color: ${props => props.disabled ? '#555' : theme.colors.accent1};
  color: #fff;
  font-weight: 600;
  font-size: 15px;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  transition: background-color 0.2s ease-in-out;

  &:hover:not(:disabled) {
    background-color: ${theme.colors.accent1Hover};
  }

  &:disabled {
    opacity: 0.7;
  }
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 0.25rem;
`;

const InfoLabel = styled.span`
  color: ${theme.colors.textSecondary};
`;

const InfoValue = styled.span`
  color: ${theme.colors.text};
`;

const HighlightedText = styled.span`
  color: ${theme.colors.accent1};
`;

const SliderInput = styled.input`
  width: 100%;
  margin-top: 0.5rem;
  margin-bottom: 0.25rem;
  accent-color: ${theme.colors.accent1};
`;

const PercentageDisplay = styled.div`
  font-size: 12px;
  color: ${theme.colors.textSecondary};
  text-align: right;
  margin-bottom: 0.5rem;
`;

export const TradingForm: React.FC<TradingFormProps> = ({ marketPrice }) => {
  const { state, fetchBalances } = useAppContext(); // Use AppContext
  const { currentUser, balances } = state;
  const { refetchPositions } = usePositionsContext(); // Get refetchPositions from context

  const [activeTab, setActiveTab] = useState<'market' | 'limit'>('market');
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState<string>('');
  const [limitPrice, setLimitPrice] = useState<string>(''); // Added for limit orders
  const [percentage, setPercentage] = useState<number>(0);

  // Get current pair information
  const currentPairString = state.currentPair;
  const [baseAsset, quoteAsset] = currentPairString.split('/');
  const currentPair: [string, string] = [baseAsset, quoteAsset];

  // Get available balance from context, ensuring balances is not null
  const availableBalance = balances ? (balances[quoteAsset] || 0) : 0;
  const baseAssetBalance = balances ? (balances[baseAsset] || 0) : 0;

  const handleAmountChange = (newAmount: string) => {
    setAmount(newAmount);
    const numericAmount = parseFloat(newAmount);
    if (!isNaN(numericAmount) && availableBalance > 0) {
      // Ensure percentage calculation doesn't exceed 100 if amount > balance for some reason
      const calculatedPercentage = (numericAmount / availableBalance) * 100;
      setPercentage(Math.min(calculatedPercentage, 100)); 
    } else if (newAmount === '' || numericAmount === 0) {
      setPercentage(0);
    }
  };

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newPercentage = parseInt(event.target.value, 10);
    setPercentage(newPercentage);
    if (availableBalance > 0) {
      setAmount(((newPercentage / 100) * availableBalance).toFixed(2)); // toFixed(2) for currency format
    } else {
      setAmount('0.00');
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => { // Made async
    e.preventDefault();
    if (!amount) return; 

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      console.error("Invalid amount");
      return;
    }

    // Check if sufficient balance for sell orders or for buy orders (cost)
    const orderValue = activeTab === 'limit' ? (parseFloat(limitPrice) * numericAmount) : (marketPrice ? marketPrice * numericAmount : 0);
    if (orderType === 'buy' && availableBalance < orderValue) {
      console.error("Insufficient balance to place buy order.");
      // Here you might want to set an error state to show in the UI
      return;
    }
    if (orderType === 'sell' && baseAssetBalance < numericAmount) {
        console.error("Insufficient balance to place sell order.");
        // Here you might want to set an error state to show in the UI
        return;
    }

    const orderId = crypto.randomUUID(); // Generate a unique order ID

    let price: number | null = null;
    if (activeTab === 'limit') {
      const numericLimitPrice = parseFloat(limitPrice);
      if (isNaN(numericLimitPrice) || numericLimitPrice <= 0) {
        console.error("Invalid limit price");
        return;
      }
      price = numericLimitPrice;
    }

    const blob = createOrder(
      orderId,
      orderType === 'buy' ? OrderbookOrderType.Buy : OrderbookOrderType.Sell,
      price, 
      currentPair,
      numericAmount,
    );

    const identity: Identity = currentUser as Identity; // Use currentUser from context

    const blobTx: BlobTransaction = {
      identity,
      blobs: [blob],
    };

    try {
      console.log('Sending transaction:', blobTx);
      const blobTxHash = await nodeService.client.sendBlobTx(blobTx);
      console.log('Transaction sent, hash:', blobTxHash);
      
      // Fetch updated balances after successful order
      if (currentUser) {
        await fetchBalances(currentUser);
      }

      // Refetch positions after successful order and balance update
      refetchPositions();

      setAmount(''); 
      setLimitPrice('');
      setPercentage(0); 
    } catch (error) {
      console.error('Failed to send transaction:', error);
      // Handle error appropriately in the UI
    }
  };

  // Calculate order value for display
  const calculatedOrderValue = () => {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) return 'N/A';

    if (activeTab === 'market') {
      if (marketPrice && marketPrice > 0) {
        return (numericAmount * marketPrice).toFixed(2) + ' ' + quoteAsset;
      }
      return 'N/A (Market price unavailable)';
    }
    // Limit order
    const numericLimitPrice = parseFloat(limitPrice);
    if (isNaN(numericLimitPrice) || numericLimitPrice <= 0) return 'N/A';
    return (numericAmount * numericLimitPrice).toFixed(2) + ' ' + quoteAsset;
  };

  return (
    <FormContainer>
      <TabsContainer>
        <Tab 
          active={activeTab === 'market'} 
          onClick={() => setActiveTab('market')}
        >
          Market
        </Tab>
        <Tab 
          active={activeTab === 'limit'} 
          onClick={() => setActiveTab('limit')}
        >
          Limit
        </Tab>
      </TabsContainer>
      
      <form onSubmit={handleSubmit}>
        <OrderTypeContainer>
          <OrderTypeButton 
            type="button"
            active={orderType === 'buy'} 
            isBuy={true}
            onClick={() => setOrderType('buy')}
          >
            Buy
          </OrderTypeButton>
          <OrderTypeButton 
            type="button"
            active={orderType === 'sell'} 
            isBuy={false}
            onClick={() => setOrderType('sell')}
          >
            Sell
          </OrderTypeButton>
        </OrderTypeContainer>

        <FlexRow>
          <Label>Available to Trade</Label>
          <Value>
            {orderType === 'buy' 
              ? availableBalance.toFixed(2) // Quote asset balance for buying
              : baseAssetBalance.toFixed(2) // Base asset balance for selling
            } {orderType === 'buy' ? quoteAsset : baseAsset}
          </Value>
        </FlexRow>
        
        {activeTab === 'limit' && (
          <FormGroup>
            <FlexRow>
                <Label>Limit Price</Label>
                <Label>{orderType === 'buy' ? quoteAsset : baseAsset}</Label>
            </FlexRow>
            <FormInput 
                type="number" 
                placeholder="0.00"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                step="any" // Allow decimal input
            />
          </FormGroup>
        )}

        <FormGroup>
          <FlexRow>
            <Label>Size</Label>
            <DropdownContainer>
              <SelectStyled>
                {baseAsset}
                <ChevronIcon>▼</ChevronIcon>
              </SelectStyled>
            </DropdownContainer>
          </FlexRow>
          <FormInput 
            type="number" 
            placeholder="0.00" 
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            step="any" // Allow decimal input
          />
        </FormGroup>

        <FormGroup>
          <PercentageDisplay>{percentage.toFixed(0)}%</PercentageDisplay>
          <SliderInput 
            type="range" 
            min="0" 
            max="100" 
            value={percentage} 
            onChange={handleSliderChange} 
          />
        </FormGroup>

        <PlaceOrderButton type="submit" disabled={!amount || (activeTab === 'limit' && !limitPrice)}>
          {orderType === 'buy' ? 'Buy' : 'Sell'} {baseAsset}
        </PlaceOrderButton>
        
        <InfoRow>
          <InfoLabel>Order Value</InfoLabel>
          <InfoValue>{calculatedOrderValue()}</InfoValue>
        </InfoRow>
        
        <InfoRow>
          <InfoLabel>Slippage</InfoLabel>
          <InfoValue>Est: 0% / Max: <HighlightedText>8.00%</HighlightedText></InfoValue>
        </InfoRow>
        
        <InfoRow>
          <InfoLabel>Fees</InfoLabel>
          <InfoValue><HighlightedText>0.0700%</HighlightedText> / 0.0400%</InfoValue>
        </InfoRow>
      </form>
    </FormContainer>
  );
}; 