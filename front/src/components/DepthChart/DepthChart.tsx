import React, { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
import type { DeepPartial, ChartOptions, AreaSeriesOptions } from 'lightweight-charts';
import styled from 'styled-components';
import type { Order } from '../../types/orderbook';
import { theme } from '../../styles/theme';

interface DepthChartProps {
  bids: Order[];
  asks: Order[];
  height?: number;
  width?: number;
}

const ChartContainer = styled.div`
  width: 100%;
  max-width: 600px; // Match orderbook width
  background-color: ${theme.colors.background};
  border-radius: 8px;
  margin-top: ${theme.spacing.lg};
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  padding: ${theme.spacing.sm};
  box-sizing: border-box;
`;

const chartOptions: DeepPartial<ChartOptions> = {
  layout: {
    background: { color: theme.colors.background },
    textColor: theme.colors.text,
  },
  grid: {
    vertLines: {
      color: 'rgba(42, 46, 57, 0.5)',
    },
    horzLines: {
      color: 'rgba(42, 46, 57, 0.5)',
    },
  },
  rightPriceScale: {
    borderColor: 'rgba(197, 203, 206, 0.3)',
  },
  timeScale: {
    borderColor: 'rgba(197, 203, 206, 0.3)',
    visible: false,
  },
  crosshair: {
    horzLine: {
      visible: true,
      style: 3,
      color: 'rgba(197, 203, 206, 0.5)',
      width: 1,
    },
    vertLine: {
      visible: true,
      style: 3,
      color: 'rgba(197, 203, 206, 0.5)',
      width: 1,
    },
  },
};

const bidAreaOptions: DeepPartial<AreaSeriesOptions> = {
  lineColor: theme.colors.positive,
  topColor: `${theme.colors.positive}50`, // 50% transparent
  bottomColor: `${theme.colors.positive}05`, // 5% transparent
  lineWidth: 2,
  priceFormat: {
    type: 'price',
    precision: 2,
    minMove: 0.01,
  },
};

const askAreaOptions: DeepPartial<AreaSeriesOptions> = {
  lineColor: theme.colors.negative,
  topColor: `${theme.colors.negative}50`, // 50% transparent
  bottomColor: `${theme.colors.negative}05`, // 5% transparent
  lineWidth: 2,
  priceFormat: {
    type: 'price',
    precision: 2,
    minMove: 0.01,
  },
};

// Convert orders to the format required for the depth chart
const prepareDepthData = (orders: Order[], isAsk: boolean) => {
  // Clone and sort orders by price
  // For bids (buy orders): we want descending order for depth calculation
  // For asks (sell orders): we want ascending order for depth calculation
  const sortedOrders = [...orders].sort((a, b) => 
    isAsk ? a.price - b.price : b.price - a.price
  );
  
  let cumulativeVolume = 0;
  const data: { price: number; depth: number }[] = [];
  
  for (const order of sortedOrders) {
    cumulativeVolume += order.size;
    data.push({
      price: order.price,
      depth: cumulativeVolume,
    });
  }
  
  // Important: The chart requires data sorted in ascending order by price (time)
  return data.sort((a, b) => a.price - b.price);
};

export const DepthChart: React.FC<DepthChartProps> = ({ bids, asks, height = 300, width = 600 }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    const chart = createChart(chartContainerRef.current, {
      ...chartOptions,
      width: width,
      height: height,
    });
    
    // Convert orders to chart data, ensuring proper sorting
    const bidData = prepareDepthData(bids, false);
    const askData = prepareDepthData(asks, true);
    
    // Create bid area series
    const bidSeries = chart.addAreaSeries(bidAreaOptions);
    bidSeries.setData(bidData.map(item => ({ 
      time: item.price as any, // Cast to any to bypass the Time type constraint
      value: item.depth 
    })));
    
    // Create ask area series
    const askSeries = chart.addAreaSeries(askAreaOptions);
    askSeries.setData(askData.map(item => ({ 
      time: item.price as any, // Cast to any to bypass the Time type constraint
      value: item.depth 
    })));
    
    // Fit content
    chart.timeScale().fitContent();
    
    // Add chart title
    const container = chartContainerRef.current;
    const header = document.createElement('div');
    header.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      text-align: center;
      margin-bottom: 10px;
      color: ${theme.colors.text};
    `;
    header.textContent = 'Depth Chart';
    container.insertBefore(header, container.firstChild);
    
    return () => {
      chart.remove();
      if (header.parentNode === container) {
        container.removeChild(header);
      }
    };
  }, [bids, asks, height, width]);
  
  return (
    <ChartContainer>
      <div ref={chartContainerRef} />
    </ChartContainer>
  );
}; 