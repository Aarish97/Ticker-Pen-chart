# Trading Chart Integration Guide

This guide explains how to connect and embed the **Trading Chart** into **any trading application** (React, Vue, Angular, Svelte, Next.js, Electron, or Vanilla HTML/JavaScript).

---

## Table of Contents
1. [1-Minute Quickstart (React / Next.js / Vite)](#1-minute-quickstart-react--nextjs--vite)
2. [Vanilla JavaScript / HTML / Any Framework Quickstart](#vanilla-javascript--html--any-framework-quickstart)
3. [Connecting Custom REST & WebSocket Datafeed](#connecting-custom-rest--websocket-datafeed)
4. [Using Static / Offline / Backtest Data](#using-static--offline--backtest-data)
5. [Managing Orders & Positions on Chart](#managing-orders--positions-on-chart)
6. [Programmatic Chart Controller (Ref API)](#programmatic-chart-controller-ref-api)
7. [Props & Configuration Reference](#props--configuration-reference)

---

## 1. 1-Minute Quickstart (React / Next.js / Vite)

Import and use the `<TradingChart />` component in your React application:

```tsx
import React, { useRef } from 'react';
import { TradingChart, type TradingChartApi } from './TradingChart';

export function MyTradingTerminal() {
  const chartRef = useRef<TradingChartApi>(null);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <TradingChart
        ref={chartRef}
        symbol="BTCUSDT"
        period="15m"
        theme="dark"
        onSymbolChange={(symbol) => console.log('Active symbol:', symbol)}
        onPeriodChange={(period) => console.log('Active timeframe:', period)}
      />
    </div>
  );
}
```

---

## 2. Vanilla JavaScript / HTML / Any Framework Quickstart

You can mount the chart into any HTML container element in Vanilla JS, Vue, Angular, Svelte, PHP, or Electron:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Trading Platform</title>
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    #chart-container { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="chart-container"></div>

  <script type="module">
    import { createTradingChart } from './src/vanilla.ts';

    // Initialize chart
    const chart = createTradingChart({
      container: '#chart-container',
      symbol: 'BTCUSDT',
      theme: 'dark',
      period: '1h'
    });

    // Programmatic control example
    setTimeout(() => {
      chart.api.setSymbol('ETHUSDT');
    }, 5000);
  </script>
</body>
</html>
```

---

## 3. Dual-Mode Market Connection System (Separate Webhooks vs Unified Single API)

The chart features a **Dual-Mode Market Connection System** allowing you to connect markets either:
1. **Type 1: Separate Market Connections** (Crypto has its own dedicated connection/webhook, Forex has its own separate connection, Stocks has its own separate connection, etc.)
2. **Type 2: Unified Single API** (Connect ALL markets through 1 unified API / Webhook gateway)

You can connect both **Programmatically via your Application** and **Manually via the Chart UI**.

---

### Option A: Connect Programmatically via Your Application

#### 1. Type 1: Separate Market Connections (Per-Market Webhooks / APIs)
In this mode, Crypto, Forex, Stocks, etc. connect to their own separate backend endpoints:

```javascript
// Access the global Market Connection API
const api = window.marketConnectionApi;

// 1. Set mode to 'separate'
api.setMode('separate');

// 2. Connect Crypto to your dedicated Crypto Webhook / API
api.setMarketConfig('crypto', {
  name: 'My Crypto Bot Webhook',
  restUrl: 'https://my-trading-bot.com/api/crypto/webhook',
  wsUrl: 'wss://my-trading-bot.com/ws/crypto',
  apiKey: 'CRYPTO_SECRET_KEY'
});

// 3. Connect Forex to your separate Forex Webhook / API (e.g. MetaTrader or Oanda)
api.setMarketConfig('forex', {
  name: 'Forex MT5 Webhook',
  restUrl: 'https://my-trading-bot.com/api/forex/webhook',
  wsUrl: 'wss://my-trading-bot.com/ws/forex',
  apiKey: 'FOREX_SECRET_KEY'
});

// 4. Connect Stocks to your separate Stocks API (e.g. Alpaca / Polygon)
api.setMarketConfig('stock', {
  name: 'Alpaca Stocks Webhook',
  restUrl: 'https://my-trading-bot.com/api/stocks/webhook',
  wsUrl: 'wss://my-trading-bot.com/ws/stocks'
});
```

#### 2. Type 2: Unified Single Gateway (All Markets by 1 API)
In this mode, all markets route through a single unified backend API gateway:

```javascript
// Connect all markets through 1 unified API
window.marketConnectionApi.setMode('unified');

window.marketConnectionApi.setUnifiedConfig({
  restUrl: 'https://my-unified-server.com/api/market',
  wsUrl: 'wss://my-unified-server.com/ws/market',
  apiKey: 'MASTER_GATEWAY_TOKEN'
});
```

The unified API receives standard queries:
- Historical: `GET /klines?symbol=BTCUSDT&market=crypto&interval=15m`
- Symbols: `GET /symbols?query=BTC&market=crypto`

---

### Push Live Webhook Ticks from Your Application

If your application or Electron bot receives real-time price updates or trade signals via webhook, you can push them directly into the chart in **1 line of code**:

```javascript
// Push a live candle tick to the chart immediately
window.marketConnectionApi.pushTick({
  symbol: 'BTCUSDT',
  timestamp: Date.now(),
  open: 96450.0,
  high: 96520.5,
  low: 96410.0,
  close: 96495.2,
  volume: 12.4
});
```

---

### Option B: Connect Manually via the Chart UI

1. Click the **"⚡ Feeds & Webhooks"** button inside the **Symbol Search modal** or the **"Market Feeds & Webhooks"** button in **Settings**.
2. A sleek modal will appear allowing you to:
   - Toggle between **"Type 1: Separate Market Connections"** and **"Type 2: Unified Single Gateway"**.
   - Input your custom REST / Webhook base URL and WebSocket URL for each market category (`Crypto`, `Forex`, `Stocks`, `Commodities`).
   - Click **"Test Connection"** to measure live latency (ping ms).
   - Use quick presets (`Binance Feed`, `Localhost Bot 127.0.0.1:8000`).
   - Settings are automatically saved to `localStorage` and persist across sessions.

---

## 4. Using Static / Offline / Backtest Data

For backtesting results, historical simulations, or offline CSV datasets:

```tsx
import { TradingChart, StaticDatafeed } from './TradingChart';

const historicalCandles = [
  { timestamp: 1700000000000, open: 35000, high: 35500, low: 34800, close: 35200, volume: 1200 },
  { timestamp: 1700000060000, open: 35200, high: 35800, low: 35100, close: 35700, volume: 1500 },
  // ...
];

const staticFeed = new StaticDatafeed(historicalCandles, {
  ticker: 'STRATEGY_BACKTEST',
  name: 'Backtest Run #1'
});

export function BacktestChart() {
  return (
    <TradingChart
      datafeed={staticFeed}
      symbol="STRATEGY_BACKTEST"
      theme="dark"
    />
  );
}
```

---

## 5. Managing Orders, Positions & Executions on Chart

The chart provides a complete, interactive **TradingPositionOverlay** that renders real-time PnL tracking, drag-to-set Take Profit (TP) and Stop Loss (SL) lines, Reverse Position button, Close Position button, and historical execution arrows.

### A. React Component Props Integration

```tsx
import { useState } from 'react';
import { TradingChart, type ChartPosition, type ChartExecution } from './TradingChart';

export function LiveBrokerTerminal() {
  const [positions, setPositions] = useState<ChartPosition[]>([
    {
      id: 'pos_101',
      entryPrice: 62500,
      amount: 1.0,         // Positive for Long, negative for Short
      side: 'long',
      takeProfit: 66000,   // Optional: Take profit price level
      stopLoss: 60000,     // Optional: Stop loss price level
      currency: 'USD'
    }
  ]);

  const [executions, setExecutions] = useState<ChartExecution[]>([
    {
      id: 'exec_101',
      timestamp: Date.now() - 3600000,
      price: 62500,
      amount: 1.0,
      side: 'buy',
      type: 'entry',
      linkedTradeId: 'pos_101',
      label: 'Buy to Open 1.0 @ 62,500'
    }
  ]);

  return (
    <TradingChart
      symbol="BTCUSDT"
      period="15m"
      positions={positions}
      executions={executions}
      // Fired when user clicks the Close [ ✕ ] button on the position box
      onPositionClose={(positionId) => {
        const pos = positions.find(p => p.id === positionId);
        if (!pos) return;

        // 1. Remove open position
        setPositions(prev => prev.filter(p => p.id !== positionId));

        // 2. Add exit execution marker (Buy to Close or Sell to Close)
        const exitSide = pos.side === 'long' ? 'sell' : 'buy';
        setExecutions(prev => [
          ...prev,
          {
            id: `exec_exit_${Date.now()}`,
            timestamp: Date.now(),
            price: 64200,
            amount: Math.abs(pos.amount),
            side: exitSide,
            type: 'exit',
            linkedTradeId: pos.id,
            pnl: 1700,
            label: `${exitSide === 'buy' ? 'Buy to Close' : 'Sell to Close'} 1.0 @ 64,200`
          }
        ]);
      }}
      // Fired when user clicks the Reverse button [ ⇅ ]
      onPositionReverse={(position) => {
        console.log('Reverse position:', position);
      }}
      // Fired when user drags the dotted [ TP ] button or moves an existing TP line
      onModifyTP={(newTPPrice, position) => {
        setPositions(prev => prev.map(p => p.id === position.id ? { ...p, takeProfit: newTPPrice } : p));
      }}
      // Fired when user drags the dotted [ SL ] button or moves an existing SL line
      onModifySL={(newSLPrice, position) => {
        setPositions(prev => prev.map(p => p.id === position.id ? { ...p, stopLoss: newSLPrice } : p));
      }}
    />
  );
}
```

### B. Global Window API & Custom Event Integration (Vanilla JS, Vue, Angular, Svelte)

The chart exposes `window.tradingPositionApi` on the window object:

```js
// 1. Open a new trade
window.tradingPositionApi.openPosition({
  side: 'long',        // 'long' | 'short'
  amount: 500,
  entryPrice: 65000,   // Optional: defaults to live candle price
  takeProfit: 68000,   // Optional
  stopLoss: 63000,     // Optional
  currency: 'USD'
});

// 2. Close a position
window.tradingPositionApi.closePosition('pos-id-123', 66500);

// 3. Reverse a position
window.tradingPositionApi.reversePosition('pos-id-123');

// 4. Update TP / SL
window.tradingPositionApi.modifyTP('pos-id-123', 69000);
window.tradingPositionApi.modifySL('pos-id-123', 62500);

// 5. Get current state
const currentPositions = window.tradingPositionApi.getPositions();
const tradeHistory = window.tradingPositionApi.getExecutions();
```

Alternatively, dispatch DOM CustomEvents from anywhere in your application:
```js
window.dispatchEvent(new CustomEvent('trading:open-position', {
  detail: { side: 'long', amount: 250 }
}));

window.dispatchEvent(new CustomEvent('trading:close-position', {
  detail: { positionId: 'pos-id-123' }
}));
```


---

## 6. Programmatic Chart Controller (Ref API)

Use the chart's imperative ref API to control it from your application headers, sidebars, or bot triggers:

```tsx
import { useRef } from 'react';
import { TradingChart, type TradingChartApi } from './TradingChart';

export function Dashboard() {
  const chartRef = useRef<TradingChartApi>(null);

  return (
    <div>
      <div className="toolbar">
        <button onClick={() => chartRef.current?.setSymbol('SOLUSDT')}>Switch to SOL</button>
        <button onClick={() => chartRef.current?.setPeriod('1h')}>1 Hour</button>
        <button onClick={() => chartRef.current?.setTheme('light')}>Light Theme</button>
        <button onClick={() => chartRef.current?.addIndicator('RSI')}>Add RSI</button>
        <button onClick={async () => {
          const screenshotDataUrl = await chartRef.current?.takeScreenshot();
          console.log('Screenshot captured:', screenshotDataUrl);
        }}>Screenshot</button>
      </div>

      <TradingChart ref={chartRef} symbol="BTCUSDT" />
    </div>
  );
}
```

---

## 7. Props & Configuration Reference

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `symbol` | `string` | `'BTCUSDT'` | Active trading pair/ticker. |
| `period` | `string \| Period` | `'15m'` | Default timeframe (`'1m'`, `'5m'`, `'15m'`, `'1h'`, `'4h'`, `'1D'`, etc.). |
| `theme` | `'dark' \| 'light'` | `'dark'` | Visual theme mode. |
| `layout` | `string` | `'1'` | Multi-chart grid layout mode (`'1'`, `'2v'`, `'2h'`, `'3v'`, `'3h'`, `'4'`). |
| `symbols` | `string[]` | `['BTCUSDT', ...]` | Symbol list for multi-chart grid layouts. |
| `datafeed` | `IChartDatafeed` | `BinanceFeed` | Custom REST / WebSocket datafeed. |
| `orders` | `ChartOrder[]` | `[]` | Active order lines. |
| `positions` | `ChartPosition[]` | `[]` | Active position lines and PnL badges. |
| `executions` | `ChartExecution[]` | `[]` | Historical execution entry/exit arrows. |
| `headerVisible` | `boolean` | `true` | Show/hide top header & timeframe bar. |
| `drawingBarVisible` | `boolean` | `true` | Show/hide left drawing tools bar. |
| `settingsModalEnabled` | `boolean` | `true` | Enable/disable built-in Chart Settings dialog. |
| `marketModalEnabled` | `boolean` | `true` | Enable/disable built-in Market Connections dialog. |
| `onSymbolChange` | `(symbol: string) => void` | - | Fired when user selects a new symbol. |
| `onPeriodChange` | `(period: string) => void` | - | Fired when timeframe changes. |
| `onLayoutChange` | `(layout: string) => void` | - | Fired when multi-chart grid layout changes. |
| `onCandleTick` | `(tick: CandleData) => void` | - | Fired on incoming real-time price tick. |
| `containerStyle` | `CSSProperties` | - | Custom container styles. |

---

## 8. Modular Sub-Components (Use on Separate or As One)

You can import and use any element separately if you prefer a custom layout:

```tsx
import {
  TradingChart,           // All-in-one unified component
  SideToolPanel,          // Standalone left drawing tools bar
  ChartSettingsModal,     // Standalone chart settings modal
  MarketConnectionModal,  // Standalone dual-mode market connection modal
  TickerPenProWidget,     // Standalone core chart canvas + period bar
  DrawingDragToolbar      // Standalone floating drawing toolbar
} from 'trading-chart';
```
