import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import type { DeepPartial, ChartOptions, CandlestickSeriesOptions, Time } from 'lightweight-charts';
import styled from 'styled-components';
import { theme } from '../../styles/theme';
import type { CandleData as ExternalCandleData } from '../../utils/mockData'; // Import the CandleData type

interface CandleChartProps {
  candleData: ExternalCandleData[]; // Add prop for external candle data
  height?: number;
  width?: number;
}

// No longer needed, ExternalCandleData is used directly
// // Candlestick data type (internal, if needed for specific transformations)
// interface CandleData {
//   time: number; // UNIX timestamp in seconds
//   open: number;
//   high: number;
//   low: number;
//   close: number;
// }

const ChartContainer = styled.div`
  width: 100%;
  height: 100%;
  background-color: #111112;
  border-radius: 8px;
  padding: ${theme.spacing.md};
  box-sizing: border-box;
  
  .chart-title {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 15px;
    color: ${theme.colors.text};
    text-align: center;
  }
  
  .chart-wrapper {
    width: 100%;
    height: calc(100% - 40px);
  }
`;

const chartOptions: DeepPartial<ChartOptions> = {
  layout: {
    background: { color: '#111112' },
    textColor: '#F2F2F2',
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
    timeVisible: true,
    secondsVisible: false,
    tickMarkFormatter: (time: number) => {
      const date = new Date(time * 1000);
      return date.toLocaleDateString();
    },
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

const candlestickOptions: DeepPartial<CandlestickSeriesOptions> = {
  upColor: theme.colors.positive,
  downColor: theme.colors.negative,
  borderUpColor: theme.colors.positive,
  borderDownColor: theme.colors.negative,
  wickUpColor: theme.colors.positive,
  wickDownColor: theme.colors.negative,
  priceFormat: {
    type: 'price',
    precision: 2,
    minMove: 0.01,
  },
};

export const CandleChart: React.FC<CandleChartProps> = ({ candleData, height: _height, width: _width }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  
  // Update container size when resized
  useEffect(() => {
    const updateSize = () => {
      if (chartContainerRef.current) {
        const { clientWidth, clientHeight } = chartContainerRef.current;
        setContainerSize({ width: clientWidth, height: clientHeight });
      }
    };
    
    // Initial size check
    updateSize();
    
    // Add resize listener
    window.addEventListener('resize', updateSize);
    
    return () => {
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Create and update chart based on container size
  useEffect(() => {
    if (!chartContainerRef.current || containerSize.width === 0 || !candleData || candleData.length === 0) return;
    
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    
    const chart = createChart(chartContainerRef.current, {
      ...chartOptions,
      width: containerSize.width,
      height: containerSize.height,
    });
    
    chartRef.current = chart;
    
    // Create candlestick series in the main pane
    const candlestickSeries = chart.addCandlestickSeries(candlestickOptions);
    
    // Generate and add candlestick data
    candlestickSeries.setData(candleData.map(d => ({ ...d, time: d.time as Time })));
    
    // Add volume series in a separate pane
    const volumeSeries = chart.addHistogramSeries({
      color: 'rgba(76, 175, 80, 0.5)',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume', // Use a separate price scale
    } as any);
    
    // Add corresponding volume data
    const volumeData = candleData.map(candle => ({
      time: candle.time as Time,
      value: candle.volume || Math.abs(candle.close - candle.open) * (1000 + Math.random() * 2000),
      color: candle.close > candle.open ? 'rgba(76, 175, 80, 0.5)' : 'rgba(255, 82, 82, 0.5)',
    }));
    
    volumeSeries.setData(volumeData as any);
    
    // Create a separate price scale for volume
    const volumeScale = chart.priceScale('volume');
    if (volumeScale) {
      volumeScale.applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });
    }
    
    // Fit content
    chart.timeScale().fitContent();
    
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [containerSize, candleData]);
  
  return (
    <ChartContainer>
      <div className="chart-wrapper" ref={chartContainerRef} />
    </ChartContainer>
  );
}; 