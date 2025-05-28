import type { ApiOrderbookResponse } from '../types/api';
import type { OrderbookState, Order } from '../types/orderbook';
import { API_CONFIG } from '../types/api';

/**
 * Transform API response to internal orderbook format
 */
const transformApiResponseToOrderbook = (apiResponse: ApiOrderbookResponse): OrderbookState => {
  // Use orders directly from API response
  const bids: Order[] = apiResponse.buy_orders.slice().sort((a, b) => b.price - a.price); // Bids sorted descending by price
  const asks: Order[] = apiResponse.sell_orders.slice().sort((a, b) => a.price - b.price); // Asks sorted ascending by price

  // Calculate spread
  const spread = asks.length > 0 && bids.length > 0 ? asks[0].price - bids[0].price : 0;
  const spreadPercentage = bids.length > 0 && bids[0].price > 0 ? (spread / bids[0].price) * 100 : 0;

  return {
    bids: bids, // Store sorted bids directly
    asks: asks, // Store sorted asks directly
    spread: parseFloat(spread.toFixed(5)),
    spreadPercentage: parseFloat(spreadPercentage.toFixed(2)),
  };
};

/**
 * Fetch orderbook data for a specific trading pair
 */
export const fetchOrderbookData = async (baseAsset: string, quoteAsset: string): Promise<OrderbookState> => {
  try {
    const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ORDERBOOK}/${baseAsset}/${quoteAsset}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const apiResponse: ApiOrderbookResponse = await response.json();
    return transformApiResponseToOrderbook(apiResponse);
  } catch (error) {
    console.error('Error fetching orderbook data:', error);
    throw error;
  }
};

/**
 * Parse pair string to base and quote assets
 */
export const parsePairString = (pairString: string): { baseAsset: string; quoteAsset: string } => {
  const [baseAsset, quoteAsset] = pairString.split('/');
  if (!baseAsset || !quoteAsset) {
    throw new Error(`Invalid pair format: ${pairString}. Expected format: BASE/QUOTE`);
  }
  return { baseAsset, quoteAsset };
}; 