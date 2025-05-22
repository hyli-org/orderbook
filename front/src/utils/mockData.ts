import type { Order, OrderbookState } from '../types/orderbook';
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

// Comprehensive trading data structure
export interface MockTradingData {
  assetPair: string;
  historicalData: CandleData[];
  currentOrderbook: OrderbookState;
  currentPrice: number; // Derived from the orderbook or last trade
  volume24h: number; // 24 hour trading volume in quote asset
  marketCap: number; // Market capitalization in quote asset
  contractAddress?: string; // Contract address of the base asset
}

const DEFAULT_STARTING_PRICE = 100;
const DEFAULT_VOLATILITY = 0.02; // Price can change by up to 2% per candle
const ORDERBOOK_DEPTH = 200; // Number of bids and asks
const ORDERBOOK_SPREAD_PERCENTAGE = 0.001; // 0.1% spread
const MAX_ORDER_SIZE = 10; // Max size for a single order in the orderbook

/**
 * Generates a more natural-looking order size with varied magnitudes.
 * @param typicalMaxSize The typical upper bound for medium-sized orders.
 */
const generateNaturalOrderSize = (typicalMaxSize: number = 10): number => {
  let size;
  const r = Math.random();

  if (r < 0.6) { // 60% chance of small order
    size = Math.random() * (typicalMaxSize * 0.2) + 0.001; // e.g., 0.001 to 2.0 for typicalMaxSize=10
  } else if (r < 0.9) { // 30% chance of medium order
    size = Math.random() * (typicalMaxSize * 0.8) + (typicalMaxSize * 0.2); // e.g., 2.0 to 10.0 for typicalMaxSize=10
  } else { // 10% chance of large order
    size = Math.random() * (typicalMaxSize * 4) + typicalMaxSize; // e.g., 10.0 to 50.0 for typicalMaxSize=10
  }
  return Math.max(0.0001, size); // Ensure a minimum positive size
};

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

/**
 * Generates a plausible orderbook based on a given center price.
 * @param centerPrice The price around which to build the orderbook.
 */
const generateOrderbookFromPrice = (centerPrice: number): OrderbookState => {
  const bids: Order[] = [];
  const asks: Order[] = [];

  let currentBidPrice = centerPrice * (1 - ORDERBOOK_SPREAD_PERCENTAGE / 2);
  let currentAskPrice = centerPrice * (1 + ORDERBOOK_SPREAD_PERCENTAGE / 2);

  for (let i = 0; i < ORDERBOOK_DEPTH; i++) {
    const bidSize = generateNaturalOrderSize(MAX_ORDER_SIZE);
    bids.push({
      price: parseFloat(currentBidPrice.toFixed(5)),
      size: bidSize,
      total: parseFloat((currentBidPrice * bidSize).toFixed(5)),
    });
    // Decrease bid price slightly for the next level
    currentBidPrice *= (1 - (Math.random() * ORDERBOOK_SPREAD_PERCENTAGE * 0.5)); 

    const askSize = generateNaturalOrderSize(MAX_ORDER_SIZE);
    asks.push({
      price: parseFloat(currentAskPrice.toFixed(5)),
      size: askSize,
      total: parseFloat((currentAskPrice * askSize).toFixed(5)),
    });
    // Increase ask price slightly for the next level
    currentAskPrice *= (1 + (Math.random() * ORDERBOOK_SPREAD_PERCENTAGE * 0.5));
  }

  // Ensure bids are sorted descending, asks ascending by price
  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);

  // Calculate cumulative totals
  let cumulativeBidTotal = 0;
  for (let i = 0; i < bids.length; i++) {
    cumulativeBidTotal += bids[i].size;
    bids[i].total = cumulativeBidTotal; // Overwriting total with cumulative size for depth chart
  }

  let cumulativeAskTotal = 0;
  // Accumulate asks from lowest price (best ask) upwards
  for (let i = 0; i < asks.length; i++) { // Iterate from lowest price to highest price
    cumulativeAskTotal += asks[i].size;
    asks[i].total = cumulativeAskTotal; 
  }
  // Asks are already sorted lowest price first, no re-sort needed here for total calculation logic.

  const spread = asks.length > 0 && bids.length > 0 ? asks[0].price - bids[0].price : 0;
  const spreadPercentage = bids.length > 0 && bids[0].price > 0 ? (spread / bids[0].price) * 100 : 0;

  return {
    bids,
    asks,
    spread: parseFloat(spread.toFixed(5)),
    spreadPercentage: parseFloat(spreadPercentage.toFixed(2)),
  };
};

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
  const currentCenterPrice = lastCandle ? lastCandle.close : initialPrice;

  const currentOrderbook = generateOrderbookFromPrice(currentCenterPrice);
  
  const currentPrice = currentOrderbook.bids.length > 0 && currentOrderbook.bids[0].price > 0 
    ? currentOrderbook.bids[0].price 
    : (currentOrderbook.asks.length > 0 && currentOrderbook.asks[0].price > 0 
      ? currentOrderbook.asks[0].price 
      : currentCenterPrice);

  // Generate dynamic volume and market cap
  // These are simplified random generations. In a real app, these would come from an API.
  const baseVolume = (Math.random() * 1000000) + 500000; // Base volume between 500k and 1.5M
  const volume24h = baseVolume * currentPrice; // Volume in quote currency

  const baseMarketCap = (Math.random() * 50000000) + 10000000; // Base market cap between 10M and 60M (circulating supply * price)
  const marketCap = baseMarketCap * currentPrice; // Market cap in quote currency

  return {
    assetPair: assetInfo.id, // Use the ID from assetInfo
    historicalData,
    currentOrderbook,
    currentPrice,
    volume24h,
    marketCap,
    contractAddress: assetInfo.contractAddress,
  };
}; 