# 📈 Ticker Pen Chart

> A high-performance, TradingView-grade financial charting suite built with TypeScript, React, and HTML5 Canvas. Featuring **17 multi-chart grid layouts**, **48+ drawing & technical analysis tools**, **30+ indicators**, **dual-mode market datafeeds**, **universal webhook ingestion API**, and **interactive order & position management with drag-and-drop TP/SL brackets**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18%20%7C%2019-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Canvas 120 FPS](https://img.shields.io/badge/Canvas-120%20FPS-success.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)

---

## 🌟 Foundational Open-Source Credits & Acknowledgments

This charting suite proudly builds upon and draws architectural inspiration from two exceptional open-source projects:

- **[KLineChart](https://github.com/klinecharts/KLineChart)** (`klinecharts/KLineChart`): The core financial charting engine providing high-speed candlestick rendering, time-scale mathematics, indicator panes, and coordinate projection.
- **[lightweight-charts-line-tools](https://github.com/difurious/lightweight-charts-line-tools)** (`difurious/lightweight-charts-line-tools`): Advanced technical analysis drawing algorithms, geometric handle manipulation, anchor drag mechanics, and overlay coordinate persistence.

We express our deepest gratitude to the authors and maintainers of these foundational libraries for advancing the state of open-source financial visualization.

---

## 📋 Comprehensive Chart Specifications

### 1. Multi-Chart Grid Layouts (17 Layouts)
Switch between multi-symbol, multi-timeframe monitoring layouts with a single click or API call (`chartRef.current.setLayout('...')`):

| Layout Key | Description | Grid Structure |
|---|---|---|
| `'1'` | Single Fullscreen Chart | 1x1 full viewport |
| `'2v'` | 2 Charts Split Vertically | 1 column x 2 rows |
| `'2h'` | 2 Charts Split Horizontally | 2 columns x 1 row |
| `'3v'` | 3 Charts Split Vertically | 1 column x 3 rows |
| `'3h'` | 3 Charts Split Horizontally | 3 columns x 1 row |
| `'3g'` | 3 Charts (1 Large Left, 2 Right) | 2 columns (1 row on left, 2 stacked on right) |
| `'3g2'` | 3 Charts (2 Left, 1 Large Right) | 2 columns (2 stacked on left, 1 row on right) |
| `'3g3'` | 3 Charts (1 Large Top, 2 Bottom) | 2 rows (1 full on top, 2 columns bottom) |
| `'3g4'` | 3 Charts (2 Top, 1 Large Bottom) | 2 rows (2 columns top, 1 full on bottom) |
| `'4'` | 4 Charts Quad Grid | 2 columns x 2 rows (2x2) |
| `'5'` | 5 Charts Grid | 2 large top + 3 bottom |
| `'6'` | 6 Charts Grid | 3 columns x 2 rows (3x2) |
| `'7'` | 7 Charts Grid | 3 top + 4 bottom grid |
| `'8'` | 8 Charts Grid | 4 columns x 2 rows (4x2) |
| `'9'` | 9 Charts Grid | 3 columns x 3 rows (3x3) |
| `'10'` | 10 Charts Grid | 5 columns x 2 rows (5x2) |
| `'12'` | 12 Charts Master Terminal | 4 columns x 3 rows (4x3) |

- **Pane Autonomy**: Each chart pane maintains its own ticker, timeframe, crosshair coordinate, and indicator stack while synchronizing user drawing tools.
- **Auto-Fill Symbol Pool**: Automatically distributes tickers across multi-chart cells without blank panes.

---

### 2. 48+ Drawing & Technical Analysis Tools
Accessible via the collapsible left sidebar or programmatically exported/imported as JSON:

- **Lines & Rays**: Trend Line, Extended Line, Ray, Segment, Arrow, Horizontal Line, Horizontal Ray, Vertical Line, Cross Line, Parallel Channel.
- **Fibonacci Suite**: Fibonacci Retracement, Fibonacci Extension, Fibonacci Time Zones, Fibonacci Fan, Fibonacci Circles, Fibonacci Spiral, Fibonacci Wedge, Fibonacci Arc.
- **Gann & Cycles**: Gann Box, Gann Square, Gann Fan, Cyclic Lines, Time Cycles.
- **Shapes & Zones**: Rectangle, Rotated Rectangle, Circle, Ellipse, Triangle, Polyline, Polygon, Arc, Highlight Zone.
- **Forecast & Trading**:
  - **Long Position**: Draggable entry price with live Profit/Loss calculation, Take Profit (TP), and Stop Loss (SL) visual risk-reward brackets.
  - **Short Position**: Inverted risk-reward forecast tool with automatic ratio computation.
  - **Measurement Tools**: Price Range, Date Range, Date & Price Range, Bars Pattern.
- **Annotations & Badges**:
  - **Anchored Text & Notes**: Text sticky labels, Callout bubbles, Balloon flags.
  - **Pin Flags**: 6 color-coded alert pins with editable title labels.
  - **Emoji & Stickers**: 2D twemoji stickers with canvas positioning.
- **Waves & Harmonic Patterns**:
  - **Elliott Impulse Wave (1-2-3-4-5)**: Full degree labeling (Grand Supercycle to Subminuette).
  - **Elliott Correction Wave (A-B-C)**: Auto-connecting wave legs.

---

### 3. Technical Indicators Suite
Integrated multi-pane and overlay indicators with real-time recalculation:

- **Moving Averages**: Simple Moving Average (SMA), Exponential Moving Average (EMA), Weighted Moving Average (WMA), Double EMA (DEMA), Triple EMA (TEMA).
- **Oscillators & Momentum**: Relative Strength Index (RSI), Moving Average Convergence Divergence (MACD), Stochastic (STOCH), Commodity Channel Index (CCI), Williams %R (WR), Average Directional Index (ADX).
- **Volatility & Bands**: Bollinger Bands (BOLL), Average True Range (ATR), Keltner Channels, Donchian Channels, Parabolic SAR (SAR).
- **Volume & Trend**: Volume Bar (VOL), Volume Profile, On-Balance Volume (OBV), SuperTrend, Ichimoku Cloud.
- **Multi-Pane Stacking**: Open multiple secondary sub-panes beneath the main candlestick pane with synchronized cursor crosshairs.

---

### 4. Dual-Mode Market Datafeed Engine
Designed for any architecture:

- **Mode 1: Separate Feeds**:
  - Dedicated independent WebSocket and REST endpoints per asset class:
    - **Crypto**: Built-in Binance spot & futures streaming or custom cryptocurrency endpoints.
    - **Forex**: Dedicated currency pair endpoints (TwelveData, OANDA, custom broker).
    - **Stocks**: US and global equity market feeds (NASDAQ, NYSE).
    - **Commodities**: Metals and energy futures feeds (Gold, Silver, Oil).
    - **Indices**: S&P 500, Nasdaq 100, Dow 30, DAX, Nikkei feeds.
- **Mode 2: Unified Gateway**:
  - Direct all asset classes through a single centralized gateway URL (`GET /klines?symbol=...&market=...`, `GET /symbols`, and WebSocket stream).
- **Custom In-Memory Handlers (`customHandler`)**:
  - Directly bind your host application's existing WebSocket, gRPC, or IPC connection (`getHistory`, `subscribe`, `searchSymbols`) without HTTP roundtrips.

---

### 5. Universal Real-Time Webhook Ingestion API
Ingest market ticks, klines, alerts, and bot orders through code without touching the UI:

- **TradingView Alert Webhooks**: Ingests TradingView JSON alerts; automatically updates current candle bar and places interactive buy/sell orders, positions, and TP/SL bracket lines.
- **Binance Kline Streams**: Parses native `{ e: "kline", s: "BTCUSDT", k: { ... } }` messages.
- **Standard OHLCV Payloads**: Accepts single ticks or array datasets (`[[time, o, h, l, c, v]]` or `[{ timestamp, open, high, low, close, volume }]`) with automatic second-to-millisecond timestamp normalization.
- **Automated Trade Signals**: Ingest `{ action: 'buy' | 'sell' | 'close' | 'reverse', price, amount, takeProfit, stopLoss }` to auto-plot interactive trading positions and execution markers on the canvas.

---

### 6. Interactive Trading & Position Management
- **Draggable Order Lines**: Place limit/stop orders directly on the price scale and drag lines up/down to adjust order price.
- **Live Position Overlays**: View active position cards directly on historical bars showing entry price, quantity, direction (Long/Short), and real-time unrealized PnL.
- **TP/SL Bracket Dragging**: Visually pull Take Profit and Stop Loss boundary handles to set or modify exit orders.
- **Trade Execution History**: Visual dots marking buy/sell fills with timestamps and realized PnL tooltips.

---

### 7. Performance & Kinetic Physics
- **120 FPS Batched Rendering**: Custom double-buffered HTML5 Canvas engine bypasses React DOM overhead.
- **Kinetic Momentum Glide**: Smooth momentum panning on mouse release, matching TradingView's signature feel.
- **Zero-Lag Zooming**: Cursor-anchored exponential zoom with precision bar spacing scaling.
- **IndexedDB Persistence**: Automatically saves drawings, layouts, indicator preferences, and theme choices in local IndexedDB.

---

## ⚡ Quick Start

### 1. Installation

```bash
npm install trading-chart
# or
pnpm add trading-chart
# or
yarn add trading-chart
```

Include the stylesheet in your project's root entry file:
```ts
import 'trading-chart/style.css';
```

---

### 2. All-in-One Turnkey Integration (React / Next.js)

```tsx
import React, { useRef } from 'react';
import { TradingChart, type TradingChartApi } from 'trading-chart';
import 'trading-chart/style.css';

export default function Terminal() {
  const chartRef = useRef<TradingChartApi>(null);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <TradingChart
        ref={chartRef}
        symbol="BTCUSDT"
        period="15m"
        theme="dark"
        layout="1"
        onCandleTick={(tick) => console.log('Live tick:', tick.close)}
      />
    </div>
  );
}
```

---

### 3. Programmatic API Access (3 Layers)

#### Layer 1: React Ref (`chartRef.current`)
```tsx
// Switch layout to 4-chart quad grid
chartRef.current?.setLayout('4');

// Connect a custom market feed
chartRef.current?.connectMarketFeed({
  market: 'crypto',
  restUrl: 'https://api.binance.com',
  wsUrl: 'wss://stream.binance.com:9443/ws'
});

// Push an incoming webhook (e.g. from TradingView or a python bot)
chartRef.current?.pushWebhook({
  ticker: 'BTCUSDT',
  action: 'buy',
  price: 68500,
  amount: 1,
  takeProfit: 71000,
  stopLoss: 66800
});
```

#### Layer 2: Component Props (`<TradingChart ... />`)
```tsx
<TradingChart
  symbol="BTCUSDT"
  period="15m"
  webhookConfig={{
    autoPlotSignals: true, // Automatically plot incoming buy/sell signals as positions
    format: 'auto'
  }}
  onWebhook={(event) => {
    console.log('Webhook ingested:', event.result.type, event.result.symbol);
  }}
  marketConnection={{
    mode: 'separate',
    separate: {
      forex: {
        name: 'Forex Stream',
        market: 'forex',
        restUrl: 'https://api.twelvedata.com',
        wsUrl: 'wss://ws.twelvedata.com/v1/quotes/price'
      }
    }
  }}
/>
```

#### Layer 3: Vanilla JS / HTML / Global Window API
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="./dist/trading-chart.css" />
</head>
<body style="margin: 0; background: #131722;">
  <div id="chart" style="width: 100vw; height: 100vh;"></div>

  <script src="https://unpkg.com/react@19/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@19/umd/react-dom.production.min.js"></script>
  <script src="./dist/trading-chart.umd.js"></script>

  <script>
    // 1. Initialize chart
    const chart = TradingChart.create('#chart', {
      symbol: 'BTCUSDT',
      period: '15m',
      theme: 'dark'
    });

    // 2. Control via global API from console or external scripts
    window.marketConnectionApi.pushWebhook({
      ticker: 'BTCUSDT',
      price: 68500,
      open: 68200, high: 68600, low: 68100, close: 68500, volume: 50
    });
  </script>
</body>
</html>
```

---

## 🛠️ Imperative Ref API Reference

| Method | Signature | Description |
|---|---|---|
| `setSymbol` | `(symbol: string) => void` | Changes the active trading pair |
| `setPeriod` | `(period: string) => void` | Changes timeframe (`1m`, `5m`, `15m`, `1h`, `4h`, `1D`, etc.) |
| `setTheme` | `(theme: 'dark' \| 'light') => void` | Dynamically switches color theme |
| `setLayout` | `(layout: ChartLayout) => void` | Switches between the 17 multi-chart layouts |
| `connectMarketFeed` | `(options: MarketFeedConnectOptions) => Promise<Result>` | Connects/updates REST and WebSocket feed |
| `disconnectMarketFeed` | `(market?: MarketCategory \| 'unified') => void` | Disconnects the active market feed |
| `pushWebhook` | `(payload: unknown, options?: WebhookPushOptions) => Result` | Ingests webhook payload with auto format detection |
| `pushTick` | `(tick: CandleData & { symbol: string }) => void` | Pushes a single live price tick |
| `pushCandles` | `(candles: CandleData[], symbol: string) => void` | Replaces/appends historical candlestick bars |
| `addIndicator` | `(name: string, isStack?: boolean, options?: any) => void` | Adds indicator overlay or sub-pane |
| `removeIndicator` | `(nameOrId: string) => void` | Removes an active indicator |
| `exportDrawings` | `() => any[]` | Serializes all user drawings to JSON |
| `importDrawings` | `(drawings: any[]) => void` | Restores drawing overlays from JSON |
| `clearDrawings` | `() => void` | Removes all drawings from canvas |
| `takeScreenshot` | `() => Promise<string>` | Exports high-resolution PNG data URL |
| `openSettingsModal` | `() => void` | Opens visual chart customization dialog |
| `openMarketConnectionModal`| `() => void` | Opens Market Feeds & Webhook dialog |

---

## 📦 Project Scripts

```bash
# Start local development server
npm run dev

# Build production application bundle
npm run build

# Build standalone library distribution (dist/ ESM, UMD, CSS, and .d.ts)
npm run build:lib

# Generate TypeScript declaration files
npm run build:types

# Run ultra-fast code linter
npm run lint
```

---

## 📄 License & Attribution

This project is open-source under the [MIT License](LICENSE).

- **Core Financial Engine**: [KLineChart](https://github.com/klinecharts/KLineChart) (Apache-2.0 License)
- **Line Tools & Overlay Mechanics**: [lightweight-charts-line-tools](https://github.com/difurious/lightweight-charts-line-tools) (MIT License)
