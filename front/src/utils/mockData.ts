import { MOCK_ASSETS, DEFAULT_PAIR_ID } from '../constants/assets'; // Import MOCK_ASSETS

// Data structure for candlestick data
export interface CandleData {
  time: number; // UNIX timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number; // Optional: volume for this candle
}

// Comprehensive trading data structure (orderbook now fetched separately from API)
export interface MockTradingData {
  assetPair: string;
  historicalData: CandleData[];
  currentPrice: number; // Derived from the last candle close price
  volume24h: number; // 24 hour trading volume in quote asset
  marketCap: number; // Market capitalization in quote asset
  contractAddress?: string; // Contract address of the base asset
}

const DEFAULT_STARTING_PRICE = 100;
const DEFAULT_VOLATILITY = 0.02; // Price can change by up to 2% per candle

/**
 * Generates a stream of historical candlestick data.
 * @param count Number of candles to generate.
 * @param periodSeconds Time period of each candle in seconds (e.g., 300 for 5min, 3600 for 1hr, 86400 for 1day).
 * @param initialPrice Starting price for the simulation.
 */
const generateHistoricalCandles = (
  count: number = 200,
  periodSeconds: number = 86400, // Default to 1-day candles
  initialPrice: number = DEFAULT_STARTING_PRICE
): CandleData[] => {
  const data: CandleData[] = [];
  let lastClose = initialPrice;
  const startTime = Math.floor(Date.now() / 1000) - count * periodSeconds;

  for (let i = 0; i < count; i++) {
    const time = startTime + i * periodSeconds;
    const open = lastClose; // Open at the previous close

    // Simulate price movement
    const changePercentage = (Math.random() * 2 - 1) * DEFAULT_VOLATILITY;
    let close = open * (1 + changePercentage);

    let high = Math.max(open, close);
    let low = Math.min(open, close);

    // Add some wick
    const wickRandomness = Math.random() * DEFAULT_VOLATILITY * open;
    high += wickRandomness * Math.random();
    low -= wickRandomness * Math.random();

    // Ensure low is not negative
    low = Math.max(0.01, low);
    close = Math.max(0.01, close);
    high = Math.max(low, high); // ensure high is >= low

    const volume = Math.random() * 1000 + 500; // Random volume

    data.push({
      time,
      open,
      high,
      low,
      close,
      volume,
    });
    lastClose = close;
  }
  return data;
};

// Orderbook generation removed - now fetched from API

/**
 * Generates a complete set of mock trading data.
 * @param assetPairId The asset pair string, e.g., "HYPE/USDC".
 * @param historicalCandleCount Number of historical candles.
 * @param candlePeriodSeconds Period for each candle.
 * @param initialPrice Approximate starting price for the simulation.
 */
export const generateMockTradingData = (
  assetPairId: string = DEFAULT_PAIR_ID, // Changed parameter name for clarity
  historicalCandleCount: number = 200,
  candlePeriodSeconds: number = 3600, // 1-hour candles
  // initialPrice is now determined from MOCK_ASSETS
): MockTradingData | null => { // Return type can be null if asset not found
  const assetInfo = MOCK_ASSETS.find(asset => asset.id === assetPairId);

  if (!assetInfo) {
    console.error(`Asset with ID ${assetPairId} not found in MOCK_ASSETS.`);
    return null; // Or handle this error appropriately
  }

  const initialPrice = assetInfo.defaultPrice;

  const historicalData = generateHistoricalCandles(
    historicalCandleCount,
    candlePeriodSeconds,
    initialPrice
  );

  const lastCandle = historicalData[historicalData.length - 1];
  const currentPrice = lastCandle ? lastCandle.close : initialPrice;

  // Generate dynamic volume and market cap
  // These are simplified random generations. In a real app, these would come from an API.
  const baseVolume = (Math.random() * 1000000) + 500000; // Base volume between 500k and 1.5M
  const volume24h = baseVolume * currentPrice; // Volume in quote currency

  const baseMarketCap = (Math.random() * 50000000) + 10000000; // Base market cap between 10M and 60M (circulating supply * price)
  const marketCap = baseMarketCap * currentPrice; // Market cap in quote currency

  return {
    assetPair: assetInfo.id, // Use the ID from assetInfo
    historicalData,
    currentPrice,
    volume24h,
    marketCap,
    contractAddress: assetInfo.contractAddress,
  };
}; 