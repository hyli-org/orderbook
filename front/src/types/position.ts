export interface Position {
  asset: string; // Base asset, e.g., ETH
  pairName: string; // Full pair name, e.g., ETH/USD
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  pnlPercent: number;
} 