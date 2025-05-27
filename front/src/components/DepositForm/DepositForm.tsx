import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { theme } from '../../styles/theme';
import { deposit } from '../../models/Orderbook';
import { nodeService } from '../../services/NodeService';
import type { Blob, BlobTransaction, Identity } from 'hyli';

// Page Container
const PageContainer = styled.div`
  width: 100%;
  height: 100vh;
  background: linear-gradient(135deg, #111112 0%, #1a1a1b 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

// Header
const Header = styled.header`
  padding: 0 1rem;
  background-color: #1a1a1b;
  border-bottom: 1px solid #2a2a2b;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 10;
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  color: ${theme.colors.text};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.2s ease;

  &:hover {
    background-color: rgba(255, 255, 255, 0.05);
    color: ${theme.colors.accent1};
  }

  &:before {
    content: '←';
    font-size: 16px;
    font-weight: bold;
  }
`;

const HeaderTitle = styled.h1`
  font-size: 1.2rem;
  font-weight: 600;
  color: ${theme.colors.text};
  margin: 0;
`;

const HeaderSpacer = styled.div`
  width: 100px; // Balance the back button
`;

// Main Content
const MainContent = styled.main`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  position: relative;
  overflow-y: auto;
`;

// Background decoration
const BackgroundDecoration = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 0.03;
  background-image: radial-gradient(circle at 25% 25%, ${theme.colors.accent1} 0%, transparent 50%),
                    radial-gradient(circle at 75% 75%, ${theme.colors.positive} 0%, transparent 50%);
  pointer-events: none;
`;

// Card Container
const CardContainer = styled.div`
  background: rgba(33, 35, 40, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 2.5rem;
  width: 100%;
  max-width: 480px;
  box-shadow: 
    0 20px 40px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  position: relative;
  z-index: 1;
`;

// Title Section
const TitleSection = styled.div`
  text-align: center;
  margin-bottom: 2rem;
`;

const Title = styled.h2`
  color: ${theme.colors.text};
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 0.5rem 0;
  background: linear-gradient(135deg, ${theme.colors.text} 0%, ${theme.colors.accent1} 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const Subtitle = styled.p`
  color: ${theme.colors.textSecondary};
  font-size: 1rem;
  margin: 0;
  line-height: 1.5;
`;

// Form Styling
const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: ${theme.colors.text};
  margin-bottom: 0.25rem;
`;

const InputWrapper = styled.div`
  position: relative;
`;

const FormInput = styled.input`
  width: 100%;
  background: rgba(35, 35, 36, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: ${theme.colors.text};
  padding: 1rem;
  border-radius: 12px;
  font-size: 16px;
  box-sizing: border-box;
  transition: all 0.3s ease;

  &:focus {
    outline: none;
    border-color: ${theme.colors.accent1};
    box-shadow: 0 0 0 3px rgba(244, 94, 69, 0.1);
    background: rgba(35, 35, 36, 1);
  }

  &::placeholder {
    color: ${theme.colors.textSecondary};
  }
`;

const SelectStyled = styled.select`
  width: 100%;
  background: rgba(35, 35, 36, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: ${theme.colors.text};
  padding: 1rem;
  border-radius: 12px;
  font-size: 16px;
  box-sizing: border-box;
  transition: all 0.3s ease;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${theme.colors.accent1};
    box-shadow: 0 0 0 3px rgba(244, 94, 69, 0.1);
    background: rgba(35, 35, 36, 1);
  }

  option {
    background: #232324;
    color: ${theme.colors.text};
  }
`;

// Currency Badge
const CurrencyBadge = styled.div`
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  background: ${theme.colors.accent1};
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  pointer-events: none;
`;

// Submit Button
const SubmitButton = styled.button`
  width: 100%;
  padding: 1rem;
  margin-top: 1rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, ${theme.colors.accent1} 0%, ${theme.colors.accent2} 100%);
  color: white;
  font-weight: 700;
  font-size: 16px;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;

  &:before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    transition: left 0.5s;
  }

  &:hover:not(:disabled):before {
    left: 100%;
  }

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 10px 25px rgba(244, 94, 69, 0.3);
  }

  &:disabled {
    opacity: 0.6;
    transform: none;
    box-shadow: none;
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }
`;

const LoadingSpinner = styled.div`
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s ease-in-out infinite;
  margin-right: 8px;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

// Message Styling
const MessageContainer = styled.div`
  margin-top: 1.5rem;
  text-align: center;
`;

const MessageText = styled.div<{ isError?: boolean }>`
  padding: 1rem;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  background: ${props => props.isError 
    ? 'rgba(244, 67, 54, 0.1)' 
    : 'rgba(76, 175, 80, 0.1)'};
  border: 1px solid ${props => props.isError 
    ? 'rgba(244, 67, 54, 0.3)' 
    : 'rgba(76, 175, 80, 0.3)'};
  color: ${props => props.isError ? theme.colors.negative : theme.colors.positive};
`;

// Info Section
const InfoSection = styled.div`
  margin-top: 2rem;
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
`;

const InfoTitle = styled.h3`
  color: ${theme.colors.text};
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
`;

const InfoList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const InfoItem = styled.li`
  color: ${theme.colors.textSecondary};
  font-size: 14px;
  margin-bottom: 0.5rem;
  padding-left: 1rem;
  position: relative;

  &:before {
    content: '•';
    color: ${theme.colors.accent1};
    position: absolute;
    left: 0;
  }

  &:last-child {
    margin-bottom: 0;
  }
`;

// Define available currencies
const CURRENCIES = ["HYLLAR", "ORANJ"];

const DepositForm: React.FC = () => {
    const navigate = useNavigate();
    const [tokenAddress, setTokenAddress] = useState<string>('');
    const [amount, setAmount] = useState<string>('');
    const [selectedCurrency, setSelectedCurrency] = useState<string>(CURRENCIES[0]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleBack = () => {
        const lastVisitedPair = localStorage.getItem('lastVisitedPair') || 'ORANJ/USDC';
        const pairUrl = lastVisitedPair.replace('/', '-');
        navigate(`/pair/${pairUrl}`);
    };

    const handleDeposit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setSuccessMessage(null);

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            setError('Please enter a valid positive amount.');
            return;
        }

        if (!tokenAddress.trim()) {
            setError('Please enter your account ID.');
            return;
        }

        setIsLoading(true);

        const blob = deposit(
            selectedCurrency,
            numericAmount,
        );

        const identity: Identity = "user@orderbook";

        const blobTx: BlobTransaction = {
            identity,
            blobs: [blob],
        };

        try {
            console.log('Sending deposit transaction:', blobTx);
            const blobTxHash = await nodeService.client.sendBlobTx(blobTx);
            console.log('Deposit transaction successful, hash:', blobTxHash);
            setSuccessMessage(`Deposit successful! Your ${selectedCurrency} will be available shortly.`);
            setTokenAddress('');
            setAmount('');
        } catch (e: any) {
            console.error('Deposit transaction failed:', e);
            setError(e.message || 'An unknown error occurred during deposit.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <PageContainer>
            <Header>
                <BackButton onClick={handleBack}>
                    Back to Trading
                </BackButton>
                <HeaderTitle>HyLiquid</HeaderTitle>
                <HeaderSpacer />
            </Header>

            <MainContent>
                <BackgroundDecoration />
                
                <CardContainer>
                    <TitleSection>
                        <Title>Deposit Funds</Title>
                        <Subtitle>
                            Add funds to your HyLiquid account to start trading
                        </Subtitle>
                    </TitleSection>

                    <Form onSubmit={handleDeposit}>
                        <FormGroup>
                            <Label htmlFor="tokenAddress">Account ID</Label>
                            <InputWrapper>
                                <FormInput
                                    id="tokenAddress"
                                    type="text"
                                    value={tokenAddress}
                                    onChange={(e) => setTokenAddress(e.target.value)}
                                    placeholder="Enter your account ID"
                                    required
                                />
                            </InputWrapper>
                        </FormGroup>

                        <FormGroup>
                            <Label htmlFor="currency">Currency</Label>
                            <SelectStyled
                                id="currency"
                                value={selectedCurrency}
                                onChange={(e) => setSelectedCurrency(e.target.value)}
                            >
                                {CURRENCIES.map((currency) => (
                                    <option key={currency} value={currency}>
                                        {currency}
                                    </option>
                                ))}
                            </SelectStyled>
                        </FormGroup>

                        <FormGroup>
                            <Label htmlFor="amount">Amount</Label>
                            <InputWrapper>
                                <FormInput
                                    id="amount"
                                    type="text"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    required
                                />
                                {selectedCurrency && (
                                    <CurrencyBadge>{selectedCurrency}</CurrencyBadge>
                                )}
                            </InputWrapper>
                        </FormGroup>

                        <SubmitButton type="submit" disabled={isLoading}>
                            {isLoading && <LoadingSpinner />}
                            {isLoading ? 'Processing Deposit...' : 'Deposit Funds'}
                        </SubmitButton>
                    </Form>

                    {(error || successMessage) && (
                        <MessageContainer>
                            {error && <MessageText isError>{error}</MessageText>}
                            {successMessage && <MessageText>{successMessage}</MessageText>}
                        </MessageContainer>
                    )}

                    <InfoSection>
                        <InfoTitle>Important Information</InfoTitle>
                        <InfoList>
                            <InfoItem>Deposits are processed instantly on the network</InfoItem>
                            <InfoItem>Minimum deposit amount is 0.000001 {selectedCurrency}</InfoItem>
                            <InfoItem>Your funds will be available for trading immediately</InfoItem>
                            <InfoItem>Transaction fees may apply depending on network conditions</InfoItem>
                        </InfoList>
                    </InfoSection>
                </CardContainer>
            </MainContent>
        </PageContainer>
    );
};

export default DepositForm; 