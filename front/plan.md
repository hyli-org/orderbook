# Orderbook Frontend Implementation Plan

## Overview
This document outlines the plan for implementing an orderbook frontend component in the HyLiquid project. The orderbook will display buy (bid) and sell (ask) orders with appropriate styling according to the provided color scheme.

## Color Scheme

| Role               | Color             | Hex       |
| ------------------ | ----------------- | --------- |
| Primary background | Oxide-Black       | `#111112` |
| Primary text       | Lunar-White       | `#F2F2F2` |
| Accent 1           | Hematite-Red      | `#B0413E` |
| Accent 2           | Flame-Orange      | `#FF6B35` |
| Positive (bid)     | Desaturated-Olive | `#6C9A3E` |
| Negative (ask)     | Dust-Teal         | `#2D7F8F` |

## Implementation Phases

### Phase 1: Setup and Dependencies (Day 1)

1. **Create Component Directory Structure**
   ```
   src/
   ├── components/
   │   ├── Orderbook/
   │   │   ├── Orderbook.tsx
   │   │   ├── OrderbookRow.tsx
   │   │   ├── OrderbookHeader.tsx
   │   │   ├── OrderbookSpread.tsx
   │   │   ├── types.ts
   │   │   └── index.ts
   │   └── index.ts
   ├── hooks/
   │   └── useOrderbook.ts
   ├── styles/
   │   ├── theme.ts
   │   └── orderbook.css
   └── types/
       └── orderbook.ts
   ```

2. **Add Required Dependencies**
   - Install styled-components or CSS modules for styling
   - Add any charting libraries if needed (e.g., lightweight-charts)
   ```bash
   npm install styled-components @types/styled-components
   # or
   npm install classnames
   ```

3. **Define Theme Constants**
   - Create a theme file with the provided color scheme

### Phase 2: Data Structure and Types (Day 1)

1. **Define Core Types**
   ```typescript
   // Order and Orderbook interfaces
   interface Order {
     price: number;
     size: number;
     total: number;
   }
   
   interface OrderbookState {
     bids: Order[];
     asks: Order[];
     spread: number;
     spreadPercentage: number;
   }
   ```

2. **Create Mock Data**
   - Implement sample data generation for development

### Phase 3: Component Implementation (Days 2-3)

1. **Implement Base Orderbook Component**
   - Create container component
   - Implement basic layout with headers for price, size, and total
   
2. **Implement Order Rows**
   - Create components for bid and ask rows
   - Implement depth visualization (horizontal bars)
   - Apply proper coloring based on bid/ask status
   
3. **Implement Spread Component**
   - Display spread value and percentage

4. **Implement Responsive Design**
   - Ensure proper rendering on various screen sizes
   - Consider mobile-specific layout adjustments

### Phase 4: Interactivity and Features (Day 4)

1. **Sorting Options**
   - Implement the ability to change the sort order

2. **Grouping Options**
   - Add functionality to group orders by price levels

3. **Focus Mode**
   - Toggle between showing only bids, only asks, or both

4. **Hover Interactions**
   - Show additional information on hover
   - Highlight related values

### Phase 5: Performance Optimization (Day 5)

1. **Virtualized List Rendering**
   - Implement efficient rendering for large orderbooks
   - Use a virtualized list library like react-window or react-virtualized

2. **Memoization**
   - Apply React.memo for row components
   - Optimize rerenders with useMemo and useCallback

3. **Backend Integration**
   - Connect to data source (WebSocket or REST API)
   - Implement efficient update mechanism

### Phase 6: Animation and Polish (Day 6)

1. **Add Animations**
   - Animate price/size changes
   - Visual feedback for updates

2. **Refine UI Details**
   - Fine-tune spacing and alignment
   - Ensure consistent typography

3. **Accessibility**
   - Add ARIA attributes
   - Ensure keyboard navigation works
   - Test with screen readers

## Component API

```typescript
interface OrderbookProps {
  // Data
  bids?: Order[];
  asks?: Order[];
  
  // Configuration
  precision?: number;
  grouping?: number;
  
  // Display options
  showHeader?: boolean;
  showSpread?: boolean;
  maxRows?: number;
  
  // Callbacks
  onOrderClick?: (order: Order, type: 'bid' | 'ask') => void;
}
```

## File Structure Details

### Orderbook.tsx
Main container component that orchestrates the orderbook display.

### OrderbookRow.tsx
Renders individual price rows with proper styling and depth visualization.

### OrderbookHeader.tsx
Header component with column titles and controls.

### OrderbookSpread.tsx
Component that displays the spread between highest bid and lowest ask.

### types.ts
Type definitions for orderbook components.

### useOrderbook.ts
Custom hook to handle orderbook data, grouping, sorting, and updates.

## CSS Implementation

Create a consistent theme file using the provided colors:

```typescript
// src/styles/theme.ts
export const theme = {
  colors: {
    background: '#111112', // Oxide-Black
    text: '#F2F2F2',       // Lunar-White
    accent1: '#B0413E',    // Hematite-Red
    accent2: '#FF6B35',    // Flame-Orange
    positive: '#6C9A3E',   // Desaturated-Olive (bid)
    negative: '#2D7F8F',   // Dust-Teal (ask)
  },
  fontSize: {
    small: '0.85rem',
    normal: '1rem',
    large: '1.25rem',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
  }
}
```

## Testing Strategy

1. **Unit Tests**
   - Test rendering of components
   - Test sorting and grouping logic
   - Test price formatting

2. **Integration Tests**
   - Test interaction between components
   - Test data flow

3. **Visual Testing**
   - Test responsive layout
   - Verify color scheme implementation

## Timeline

1. **Day 1**: Setup, types, and theme implementation
2. **Day 2-3**: Core component implementation
3. **Day 4**: Interactivity features
4. **Day 5**: Performance optimization
5. **Day 6**: Polish, animation, and testing
6. **Day 7**: Documentation and final review

## Future Enhancements

1. **Trade History Integration**
   - Show recent trades alongside the orderbook

2. **Price Alerts**
   - Allow users to set alerts at specific price levels

3. **Order Placement**
   - Add UI for placing orders directly from the orderbook

4. **Multiple Markets**
   - Support showing orderbooks for different markets/pairs

5. **Depth Chart**
   - Add visual representation of order book depth as a chart

## Resources and References

- [React Performance Documentation](https://react.dev/learn/render-and-commit)
- [WebSocket API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- Existing orderbook implementations for reference:
  - Binance
  - Uniswap v3
  - dYdX 