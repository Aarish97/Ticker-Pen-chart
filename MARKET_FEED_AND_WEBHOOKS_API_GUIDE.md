# Market Feed & Webhooks Connection API Guide

The **`trading-chart`** library provides a comprehensive, production-grade programmatic API for connecting market data feeds (cryptocurrency, forex, stocks, commodities, indices, and unified gateways) and ingesting real-time webhooks (TradingView alerts, Binance klines, OHLCV candles, and automated trade execution signals).

Developers can control feeds and push webhooks via three seamless access layers:
1. **React Ref (`chartRef.current`)**
2. **React Props (`<TradingChart ... />`)**
3. **Global Window API (`window.marketConnectionApi` / DOM Custom Events)**

---

## Table of Contents
1. [Core Capabilities](#core-capabilities)
2. [Layer 1: React Ref API (`TradingChartApi`)](#layer-1-react-ref-api)
3. [Layer 2: React Component Props (`TradingChartProps`)](#layer-2-react-component-props)
4. [Layer 3: Global Window API & Custom Events](#layer-3-global-window-api--custom-events)
5. [Market Feed Connection (`connectMarketFeed`)](#market-feed-connection)
   - [Per-Market Connection (Separate Feeds)](#per-market-connection-separate-feeds)
   - [Unified Gateway Connection](#unified-gateway-connection)
   - [Custom In-Memory Handlers (`customHandler`)](#custom-in-memory-handlers)
6. [Universal Webhook Ingestion (`pushWebhook`)](#universal-webhook-ingestion)
   - [TradingView Webhook Alerts](#1-tradingview-webhook-alerts)
   - [Binance Kline Streams / Webhooks](#2-binance-kline-streams--webhooks)
   - [Standard OHLCV Candles](#3-standard-ohlcv-candles)
   - [Trade & Execution Signals (Auto-Plotting Positions)](#4-trade--execution-signals-auto-plotting-positions)
   - [Plain-Text Human Readable Alerts](#5-plain-text-human-readable-alerts)
   - [Custom Transformers](#6-custom-transformers)
7. [Full Integration Examples](#full-integration-examples)
   - [Next.js / React Example](#nextjs--react-example)
   - [Node.js Webhook Forwarder (Express)](#nodejs-webhook-forwarder-express)
8. [TypeScript Definitions Reference](#typescript-definitions-reference)

---

## Core Capabilities

- **Dual-Mode Feed Engine**: Connect dedicated feeds per asset class (`crypto`, `forex`, `stock`, `commodity`, `indices`) or pipe all symbols through a single `unified` gateway.
- **Universal Multi-Format Ingestion**: Auto-detects and parses TradingView alert webhooks, Binance klines, OHLCV payloads, batch candle arrays, and trade signals.
- **Auto-Plotting Trade Signals**: Incoming `buy`/`sell` webhooks automatically create interactive positions, Take Profit / Stop Loss brackets, and historical execution markers on the chart.
- **Low Latency 120 FPS Real-Time Updating**: Directly updates the active candle bar and live status line without unnecessary React re-renders.

---

## Layer 1: React Ref API

When using the `TradingChart` component with a `ref`, all connection and webhook methods are exposed directly on `ref.current`:

```tsx
import React, { useRef, useEffect } from 'react';
import { TradingChart, type TradingChartApi } from 'trading-chart';
import 'trading-chart/style.css';

export function ChartView() {
  const chartRef = useRef<TradingChartApi>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // 1. Programmatically connect a Forex data feed
    chartRef.current.connectMarketFeed({
      market: 'forex',
      name: 'TwelveData Forex',
      restUrl: 'https://api.twelvedata.com',
      wsUrl: 'wss://ws.twelvedata.com/v1/quotes/price',
      apiKey: 'YOUR_API_KEY'
    });

    // 2. Ingest an incoming webhook (e.g. from TradingView or a trading bot)
    chartRef.current.pushWebhook({
      ticker: 'EURUSD',
      action: 'buy',
      price: 1.0855,
      amount: 10000,
      takeProfit: 1.0920,
      stopLoss: 1.0820
    });
  }, []);

  return <TradingChart ref={chartRef} symbol="EURUSD" period="15m" />;
}
```

### Methods on `TradingChartApi`

| Method | Signature | Description |
|---|---|---|
| `connectMarketFeed` | `(options: MarketFeedConnectOptions) => Promise<Result>` | Connects or updates a market feed (REST, WS, custom handler). |
| `disconnectMarketFeed` | `(market?: MarketCategory \| 'unified') => void` | Disconnects the active feed, terminating WebSocket connections. |
| `pushWebhook` | `(payload: unknown, options?: WebhookPushOptions) => WebhookProcessResult` | Ingests a webhook with auto format detection, updates chart, and auto-plots signals. |
| `pushTick` | `(tick: CandleData & { symbol: string }) => void` | Injects a live price tick into the chart store. |
| `pushCandles` | `(candles: CandleData[], symbol: string) => void` | Injects an entire historical candle array into the chart. |
| `marketConnection` | `MarketConnectionApi` | Direct reference to the singleton `marketDatafeedManager`. |

---

## Layer 2: React Component Props

You can configure feeds and listen to incoming webhooks declaratively through props:

```tsx
import { TradingChart, type WebhookEvent, type MarketConnectionSettings } from 'trading-chart';

<TradingChart
  symbol="BTCUSDT"
  period="15m"
  // Initial feed configuration
  marketConnection={{
    mode: 'separate',
    separate: {
      crypto: {
        name: 'Binance Live',
        market: 'crypto',
        restUrl: 'https://api.binance.com',
        wsUrl: 'wss://stream.binance.com:9443/ws'
      }
    }
  }}
  // Webhook ingestion behavior
  webhookConfig={{
    autoPlotSignals: true, // Automatically plot buy/sell positions on chart
    format: 'auto'         // Auto-detect TradingView, Binance, OHLCV, or signals
  }}
  // Callback triggered whenever a webhook is ingested and processed
  onWebhook={(event: WebhookEvent) => {
    console.log('Webhook Ingested:', event.result.type, event.result);
  }}
  // Callback triggered when feed settings change
  onMarketConnectionChange={(settings: MarketConnectionSettings) => {
    console.log('New Feed Mode:', settings.mode);
  }}
/>
```

---

## Layer 3: Global Window API & Custom Events

For non-React apps, external browser scripts, test runners, or iframe parent wrappers, the API is mounted on `window.marketConnectionApi` and responds to standard DOM events.

### JavaScript Global API

```javascript
// Check current feed mode
window.marketConnectionApi.getMode(); // 'separate' | 'unified'

// Connect a market feed programmatically
await window.marketConnectionApi.connectFeed({
  market: 'crypto',
  restUrl: 'https://api.binance.com',
  wsUrl: 'wss://stream.binance.com:9443/ws',
  autoTest: true
});

// Push an incoming webhook payload
window.marketConnectionApi.pushWebhook({
  ticker: 'BTCUSDT',
  action: 'buy',
  price: 68450,
  amount: 0.5,
  takeProfit: 71000,
  stopLoss: 66500
});

// Push a single live tick
window.marketConnectionApi.pushTick({
  symbol: 'BTCUSDT',
  timestamp: Date.now(),
  open: 68400,
  high: 68500,
  low: 68350,
  close: 68480,
  volume: 12.5
});

// Subscribe to all processed webhooks
const unsubscribe = window.marketConnectionApi.onWebhook((event) => {
  console.log('Webhook Event received:', event);
});
```

### DOM Custom Events

You can also communicate with the chart across iframe or component boundaries using native browser events:

```javascript
// Push a webhook
window.dispatchEvent(new CustomEvent('market-connection:push-webhook', {
  detail: {
    ticker: 'ETHUSDT',
    price: 3650.50,
    open: 3640,
    high: 3660,
    low: 3635,
    close: 3650.50,
    volume: 85
  }
}));

// Connect a feed
window.dispatchEvent(new CustomEvent('market-connection:connect-feed', {
  detail: {
    market: 'stock',
    restUrl: 'https://my-stock-api.com/api',
    wsUrl: 'wss://my-stock-api.com/ws'
  }
}));

// Listen for chart webhook signal executions
window.addEventListener('trading:webhook-signal', (e) => {
  console.log('Signal executed on chart:', e.detail);
});
```

---

## Market Feed Connection

### Per-Market Connection (Separate Feeds)

To connect an independent REST and WebSocket feed for an individual asset category:

```typescript
await chartRef.current.connectMarketFeed({
  market: 'forex', // 'crypto' | 'forex' | 'stock' | 'commodity' | 'indices'
  name: 'Forex Provider',
  restUrl: 'https://api.broker.com/v1',
  wsUrl: 'wss://stream.broker.com/forex',
  apiKey: 'secret_token_abc123',
  headers: {
    'X-Client-ID': 'TradingApp1'
  },
  webhookFormat: 'standard',
  autoTest: true // Performs HEAD ping to test connectivity and latency
});
```

### Unified Gateway Connection

In **Unified Mode**, all symbols and market categories query a single centralized gateway URL:

```typescript
await chartRef.current.connectMarketFeed({
  mode: 'unified',
  market: 'unified',
  restUrl: 'https://gateway.myexchange.com/api/market',
  wsUrl: 'wss://gateway.myexchange.com/ws/market',
  apiKey: 'bearer_token_xyz',
  autoTest: true
});
```

The gateway receives standard REST parameters:
- `GET {restUrl}/klines?symbol=BTCUSDT&market=crypto&interval=15m&from=...&to=...&limit=500`
- `GET {restUrl}/symbols?query=BTC`

### Custom In-Memory Handlers

If your host application already maintains an active WebSocket or gRPC connection, inject JavaScript handler functions directly:

```typescript
chartRef.current.connectMarketFeed({
  market: 'crypto',
  customHandler: {
    // 1. Symbol search
    searchSymbols: async (query) => {
      return [
        { ticker: 'BTCUSDT', name: 'Bitcoin', market: 'crypto', pricePrecision: 2 },
        { ticker: 'ETHUSDT', name: 'Ethereum', market: 'crypto', pricePrecision: 2 }
      ];
    },
    // 2. Historical candle data
    getHistory: async ({ symbol, timeframe, from, to, limit }) => {
      const response = await fetch(`/api/candles?symbol=${symbol}&tf=${timeframe}&limit=${limit}`);
      return await response.json(); // Array of { timestamp, open, high, low, close, volume }
    },
    // 3. Real-time streaming
    subscribe: ({ symbol, timeframe }, onTick) => {
      const myWs = new WebSocket(`wss://my-data-server.com/stream?sym=${symbol}`);
      myWs.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        onTick({
          timestamp: data.t,
          open: data.o,
          high: data.h,
          low: data.l,
          close: data.c,
          volume: data.v
        });
      };
      // Return cleanup function on unsubscribe
      return () => myWs.close();
    }
  }
});
```

---

## Universal Webhook Ingestion

The `pushWebhook(payload, options?)` method automatically parses incoming messages into either real-time candle ticks or visual trade execution signals.

### 1. TradingView Webhook Alerts

Supports standard TradingView alert syntax and JSON payloads:

```json
{
  "ticker": "BTCUSDT",
  "action": "buy",
  "price": 68500,
  "contracts": 1.5,
  "takeProfit": 71000,
  "stopLoss": 66800,
  "comment": "RSI Bullish Divergence on 15m",
  "open": 68200,
  "high": 68600,
  "low": 68150,
  "close": 68500,
  "volume": 25.4
}
```

Ingestion:
```typescript
chartRef.current.pushWebhook(tradingViewAlertJson);
```
**Result**: The chart immediately updates the current candle bar, opens a long position at \$68,500, and places interactive TP (\$71,000) and SL (\$66,800) bracket lines on the canvas.

### 2. Binance Kline Streams / Webhooks

Supports native Binance format:

```json
{
  "e": "kline",
  "E": 1700000000000,
  "s": "BTCUSDT",
  "k": {
    "t": 1700000000000,
    "T": 1700000059999,
    "s": "BTCUSDT",
    "i": "1m",
    "o": "68400.00",
    "c": "68450.00",
    "h": "68500.00",
    "l": "68350.00",
    "v": "12.450",
    "x": false
  }
}
```

Ingestion:
```typescript
chartRef.current.pushWebhook(binanceKlinePayload);
```

### 3. Standard OHLCV Candles

Accepts single candles or array datasets:

```javascript
// Single candle object
chartRef.current.pushWebhook({
  symbol: 'AAPL',
  timestamp: Date.now(),
  open: 175.20,
  high: 176.00,
  low: 174.90,
  close: 175.80,
  volume: 125000
});

// Array of historical bars: [timestamp, open, high, low, close, volume]
chartRef.current.pushWebhook([
  [1700000000000, 175.2, 176.0, 174.9, 175.8, 125000],
  [1700000060000, 175.8, 176.4, 175.5, 176.1, 98000]
], { symbol: 'AAPL' });
```

### 4. Trade & Execution Signals (Auto-Plotting Positions)

Send buy, sell, close, or reverse signals from any automated trading strategy or webhook relay:

```javascript
// Open Long position
chartRef.current.pushWebhook({
  action: 'buy', // or 'sell' | 'close' | 'reverse'
  symbol: 'SOLUSDT',
  price: 185.20,
  amount: 10,
  takeProfit: 195.00,
  stopLoss: 178.00,
  comment: 'Breakout Confirmed'
});

// Close position
chartRef.current.pushWebhook({
  action: 'close',
  symbol: 'SOLUSDT',
  price: 195.00
});
```

### 5. Plain-Text Human Readable Alerts

Also parses plain text sent directly in the payload:

```javascript
chartRef.current.pushWebhook("BUY BTCUSDT price=68500 tp=71000 sl=66500 qty=0.5");
chartRef.current.pushWebhook("SELL EURUSD 1.0850 tp=1.0790 sl=1.0890");
```

### 6. Custom Transformers

If you have a proprietary webhook schema, pass a `transform` function:

```typescript
chartRef.current.pushWebhook(customPayload, {
  format: 'custom',
  transform: (payload: any) => {
    return {
      success: true,
      formatDetected: 'custom',
      type: 'candle',
      symbol: payload.ticker_symbol,
      candle: {
        timestamp: payload.unix_ms,
        open: payload.pricing.open_val,
        high: payload.pricing.high_val,
        low: payload.pricing.low_val,
        close: payload.pricing.last_val,
        volume: payload.size
      },
      raw: payload
    };
  }
});
```

---

## Full Integration Examples

### Next.js / React Example

```tsx
'use client';

import React, { useRef, useEffect } from 'react';
import { TradingChart, type TradingChartApi, type WebhookEvent } from 'trading-chart';
import 'trading-chart/style.css';

export default function LiveTradingTerminal() {
  const chartRef = useRef<TradingChartApi>(null);

  useEffect(() => {
    // Connect live feed on mount
    chartRef.current?.connectMarketFeed({
      market: 'crypto',
      name: 'Binance Live',
      restUrl: 'https://api.binance.com',
      wsUrl: 'wss://stream.binance.com:9443/ws'
    });

    // Listen to webhook socket from backend relay
    const ws = new WebSocket('wss://my-backend.com/webhook-stream');
    ws.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        chartRef.current?.pushWebhook(payload);
      } catch (err) {
        console.error('Failed to parse webhook message:', err);
      }
    };

    return () => ws.close();
  }, []);

  const handleWebhookEvent = (event: WebhookEvent) => {
    console.log('Ingested webhook:', event.result.type, event.result.symbol);
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <TradingChart
        ref={chartRef}
        symbol="BTCUSDT"
        period="15m"
        theme="dark"
        webhookConfig={{ autoPlotSignals: true }}
        onWebhook={handleWebhookEvent}
      />
    </div>
  );
}
```

### Node.js Webhook Forwarder (Express)

Forward TradingView webhooks directly to the chart over WebSocket or Server-Sent Events (SSE):

```javascript
import express from 'express';
import { WebSocketServer } from 'ws';

const app = express();
app.use(express.json());

const wss = new WebSocketServer({ port: 8081 });

// TradingView Webhook Endpoint
app.post('/api/webhook', (req, res) => {
  const payload = req.body;
  console.log('Received Webhook:', payload);

  // Broadcast to all connected chart clients
  const message = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });

  res.status(200).json({ status: 'received' });
});

app.listen(3000, () => console.log('Webhook server running on :3000, WS on :8081'));
```

---

## TypeScript Definitions Reference

```typescript
export type MarketCategory = 'crypto' | 'forex' | 'stock' | 'commodity' | 'indices';
export type ConnectionMode = 'separate' | 'unified';
export type ConnectionStatus = 'connected' | 'connecting' | 'simulated' | 'error' | 'idle';
export type WebhookFormat = 'auto' | 'standard' | 'binance' | 'tradingview' | 'signal' | 'custom';

export interface MarketFeedConnectOptions {
  market?: MarketCategory | 'unified';
  mode?: ConnectionMode;
  name?: string;
  restUrl?: string;
  wsUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  webhookFormat?: 'standard' | 'binance' | 'tradingview' | 'custom';
  customSymbols?: ChartSymbolInfo[];
  customHandler?: MarketEndpointConfig['customHandler'];
  autoTest?: boolean;
}

export interface WebhookPushOptions {
  format?: WebhookFormat;
  symbol?: string;
  market?: MarketCategory;
  applyToChart?: boolean;
  autoPlotSignal?: boolean;
  transform?: (payload: unknown) => WebhookProcessResult | null;
}

export interface WebhookProcessResult {
  success: boolean;
  formatDetected: WebhookFormat;
  type: 'candle' | 'candles' | 'signal' | 'unknown';
  symbol?: string;
  market?: MarketCategory;
  candle?: CandleData;
  candles?: CandleData[];
  signal?: WebhookSignalPayload;
  error?: string;
  raw: unknown;
}

export interface WebhookEvent {
  result: WebhookProcessResult;
  timestamp: number;
}
```
