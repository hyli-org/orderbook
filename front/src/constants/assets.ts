export interface MockAsset {
  id: string; // e.g., "ORANJ/USDC"
  name: string; // e.g., "Oranj / USD Coin"
  baseAsset: string; // e.g., "ORANJ"
  quoteAsset: string; // e.g., "USDC"
  defaultPrice: number; // For mock data generation
  category?: string; // e.g., "Spot", "Perps"
  contractAddress?: string; // Optional contract address
}

export const MOCK_ASSETS: MockAsset[] = [
  {
    id: "ORANJ/USDC",
    name: "Oranj / USD Coin",
    baseAsset: "ORANJ",
    quoteAsset: "USDC",
    defaultPrice: 25,
    category: "Spot",
    contractAddress: "0x0ranJ0C0inContractAddress123",
  },
  {
    id: "BTC/USDC",
    name: "Bitcoin / USD Coin",
    baseAsset: "BTC",
    quoteAsset: "USDC",
    defaultPrice: 100000,
    category: "Spot",
    contractAddress: "0xBitcoinContractAddress789xyz",
  },
  {
    id: "ETH/USDC",
    name: "Ethereum / USD Coin",
    baseAsset: "ETH",
    quoteAsset: "USDC",
    defaultPrice: 2600,
    category: "Spot",
    contractAddress: "0xEthereumContractAddress456abc",
  },
  {
    id: "SOL/USDC",
    name: "Solana / USD Coin",
    baseAsset: "SOL",
    quoteAsset: "USDC",
    defaultPrice: 170,
    category: "Spot",
  },
  {
    id: "ORANJ/USD",
    name: "Oranj / USD",
    baseAsset: "ORANJ",
    quoteAsset: "USD",
    defaultPrice: 25.5,
    category: "Spot",
  },
  {
    id: "HYLLAR/USD",
    name: "Hyllar / USD",
    baseAsset: "HYLLAR",
    quoteAsset: "USD",
    defaultPrice: 10.75,
    category: "Spot",
  },
  {
    id: "ORANJ/HYLLAR",
    name: "Oranj / Hyllar",
    baseAsset: "ORANJ",
    quoteAsset: "HYLLAR",
    defaultPrice: 2.3721, // Calculated as 25.5 / 10.75
    category: "Spot",
  },
  // Add more mock assets as needed
];

export const DEFAULT_PAIR_ID = MOCK_ASSETS[0].id; // Default to ORANJ/USDC 