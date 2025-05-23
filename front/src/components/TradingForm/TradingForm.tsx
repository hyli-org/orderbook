import React, { useState } from 'react';
import styled from 'styled-components';
import { theme } from '../../styles/theme';
import type { Position } from '../../types/position'; // Import Position interface

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

export const TradingForm: React.FC<TradingFormProps> = ({ onSubmit, marketPrice }) => {
  const [activeTab, setActiveTab] = useState<'market' | 'limit' | 'pro'>('market');
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState<string>('');
  const [percentage, setPercentage] = useState<number>(0);

  // Get current pair information
  const currentPair = localStorage.getItem('lastVisitedPair') || "ORANJ/USDC";
  const [baseAsset, quoteAsset] = currentPair.split('/');

  // Mock available balance - replace with actual balance from your state management
  const availableBalance = 1000; // Example: 1000 USDC

  const handleAmountChange = (newAmount: string) => {
    setAmount(newAmount);
    const numericAmount = parseFloat(newAmount);
    if (!isNaN(numericAmount) && availableBalance > 0) {
      setPercentage((numericAmount / availableBalance) * 100);
    } else if (newAmount === '') {
      setPercentage(0);
    }
  };

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newPercentage = parseInt(event.target.value, 10);
    setPercentage(newPercentage);
    if (availableBalance > 0) {
      setAmount(((newPercentage / 100) * availableBalance).toFixed(2));
    } else {
      setAmount('0.00');
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit || !amount) return;

    const size = parseFloat(amount) * (orderType === 'buy' ? 1 : -1);
    const entryPrice = marketPrice || 0; // Use marketPrice prop, fallback to 0

    // Create a new position object with the required fields
    const newPosition: Position = {
      asset: baseAsset, // Use baseAsset from currentPair
      pairName: currentPair, // Add the currentPair as pairName
      size,
      entryPrice,
      markPrice: entryPrice, // For simplicity, markPrice = entryPrice initially
      pnl: 0,
      pnlPercent: 0,
    };

    onSubmit(newPosition);
    setAmount(''); // Reset amount after submission
    setPercentage(0); // Reset percentage after submission
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
        <Tab 
          active={activeTab === 'pro'} 
          onClick={() => setActiveTab('pro')}
        >
          Pro
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
          <Value>{availableBalance.toFixed(2)} {quoteAsset}</Value>
        </FlexRow>

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

        <PlaceOrderButton type="submit">
          Place Order
        </PlaceOrderButton>
        
        <InfoRow>
          <InfoLabel>Order Value</InfoLabel>
          <InfoValue>N/A</InfoValue>
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