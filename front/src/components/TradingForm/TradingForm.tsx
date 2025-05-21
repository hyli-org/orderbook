import React, { useState } from 'react';
import styled from 'styled-components';
import { theme } from '../../styles/theme';

interface TradingFormProps {
  onSubmit?: (formData: {
    type: 'buy' | 'sell';
    amount: number;
    price: number | 'market';
  }) => void;
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
  padding: 0.5rem;
  border-radius: 4px;
  border: none;
  background-color: ${props => props.active 
    ? (props.isBuy ? theme.colors.positive : theme.colors.negative)
    : 'transparent'};
  color: ${props => props.active ? '#fff' : props.isBuy ? theme.colors.positive : theme.colors.negative};
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid ${props => props.isBuy ? theme.colors.positive : theme.colors.negative};
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

const SliderContainer = styled.div`
  margin: 1rem 0;
`;

const SliderInput = styled.input`
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: #232324;
  border-radius: 2px;
  outline: none;
  margin: 1rem 0;
  
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    background-color: ${theme.colors.accent1};
    border: 2px solid #fff;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
    transition: background-color 0.2s;
    
    &:hover {
      background-color: ${theme.colors.accent1Hover};
    }
  }
  
  &::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background-color: ${theme.colors.accent1};
    border: 2px solid #fff;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
    transition: background-color 0.2s;
    
    &:hover {
      background-color: ${theme.colors.accent1Hover};
    }
  }
`;

const SliderTicks = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 0 8px;
`;

const SliderTick = styled.div`
  width: 6px;
  height: 6px;
  background-color: #3a3a3b;
  border-radius: 50%;
  margin-top: -16px;
`;

const PercentageInput = styled.input`
  width: 40px;
  padding: 0.25rem;
  text-align: right;
  background-color: #232324;
  border: 1px solid #2a2a2b;
  border-radius: 4px;
  color: ${theme.colors.text};
  margin-left: 0.5rem;
  font-size: 12px;
`;

const PlaceOrderButton = styled.button`
  width: 100%;
  padding: 0.6rem;
  margin: 0.5rem 0;
  border: none;
  border-radius: 4px;
  background-color: ${theme.colors.accent1};
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background-color: ${theme.colors.accent1Hover};
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

export const TradingForm: React.FC<TradingFormProps> = ({ onSubmit }) => {
  const [activeTab, setActiveTab] = useState<'market' | 'limit' | 'pro'>('market');
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState<string>('');
  const [percentage, setPercentage] = useState<number>(0);

  const handlePercentageChange = (newPercentage: number) => {
    setPercentage(Math.min(100, Math.max(0, newPercentage)));
    // In a real app, this would calculate the amount based on available balance
  };
  
  const handleSliderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const position = ((e.clientX - rect.left) / rect.width) * 100;
    handlePercentageChange(Math.round(position));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      onSubmit({
        type: orderType,
        amount: parseFloat(amount) || 0,
        price: 'market', // For market orders
      });
    }
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
          <Value>0.00 USDC</Value>
        </FlexRow>

        <FormGroup>
          <FlexRow>
            <Label>Size</Label>
            <DropdownContainer>
              <SelectStyled>
                ORANJ
                <ChevronIcon>▼</ChevronIcon>
              </SelectStyled>
            </DropdownContainer>
          </FlexRow>
          <FormInput 
            type="number" 
            placeholder="0.00" 
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </FormGroup>

        <SliderContainer>
          <SliderInput 
            type="range"
            min="0"
            max="100"
            value={percentage}
            onChange={(e) => handlePercentageChange(parseInt(e.target.value))}
          />
          <SliderTicks>
            <SliderTick />
            <SliderTick />
            <SliderTick />
            <SliderTick />
            <SliderTick />
          </SliderTicks>
          <FlexRow>
            <div></div>
            <div>
              <PercentageInput 
                type="number" 
                value={percentage} 
                onChange={(e) => handlePercentageChange(parseInt(e.target.value) || 0)}
                min="0"
                max="100"
              />
              <span> %</span>
            </div>
          </FlexRow>
        </SliderContainer>

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