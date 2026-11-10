/**
 * Market Connection & Datafeed Types
 * Supports Dual-Mode architecture:
 * 1. Separate Connections: Crypto has its dedicated webhook/connection, Forex has its own, Stocks has its own, etc.
 * 2. Unified Connection: Single unified API / Webhook gateway for all markets.
 */

import type { CandleData, ChartSymbolInfo } from './chart';

export type MarketCategory = 'crypto' | 'forex' | 'stock' | 'commodity' | 'indices';

export type ConnectionMode = 'separate' | 'unified';

export type ConnectionStatus = 'connected' | 'connecting' | 'simulated' | 'error' | 'idle';

export type WebhookFormat =
  | 'auto'
  | 'standard'
  | 'binance'
  | 'tradingview'
  | 'signal'
  | 'custom';

export interface WebhookSignalPayload {
  /** Trading action signal */
  action: 'buy' | 'sell' | 'close' | 'reverse';
  /** Symbol ticker */
  symbol?: string;
  /** Signal / execution price */
  price?: number;
  /** Trade order volume / amount */
  amount?: number;
  /** Order execution type */
  type?: 'market' | 'limit' | 'stop';
  /** Optional Take Profit price */
  takeProfit?: number;
  /** Optional Stop Loss price */
  stopLoss?: number;
  /** Optional custom order ID */
  orderId?: string;
  /** Optional position ID to target (for close / reverse) */
  positionId?: string;
  /** Optional note or comment */
  comment?: string;
  [key: string]: any;
}

export interface WebhookCandlePayload extends CandleData {
  symbol?: string;
  market?: MarketCategory;
}

export interface WebhookProcessResult {
  /** Whether the webhook was successfully parsed */
  success: boolean;
  /** Detected or explicitly configured format */
  formatDetected: WebhookFormat;
  /** Identified payload category */
  type: 'candle' | 'candles' | 'signal' | 'unknown';
  /** Resolved symbol if present */
  symbol?: string;
  /** Resolved market category */
  market?: MarketCategory;
  /** Single parsed candle if applicable */
  candle?: CandleData;
  /** Array of parsed candles if applicable */
  candles?: CandleData[];
  /** Parsed trade / order signal if applicable */
  signal?: WebhookSignalPayload;
  /** Error explanation if parsing failed */
  error?: string;
  /** Raw unparsed incoming payload */
  raw: unknown;
}

export interface WebhookPushOptions {
  /** Specific format or 'auto' to auto-detect (default: 'auto') */
  format?: WebhookFormat;
  /** Fallback symbol if not present in webhook payload */
  symbol?: string;
  /** Market category if not specified */
  market?: MarketCategory;
  /** If true, automatically apply candle / tick to active chart (default: true) */
  applyToChart?: boolean;
  /** If true and a signal is detected, automatically plot/execute on chart (default: true) */
  autoPlotSignal?: boolean;
  /** Custom transformer function when format is 'custom' */
  transform?: (payload: unknown) => WebhookProcessResult | null;
}

export interface WebhookEvent {
  /** Full parsing result details */
  result: WebhookProcessResult;
  /** Millisecond timestamp when webhook was ingested */
  timestamp: number;
}

export interface MarketFeedConnectOptions {
  /** Target market category or 'unified' gateway (default: 'unified' if mode is unified, else detected from symbol or 'crypto') */
  market?: MarketCategory | 'unified';
  /** Switch system mode ('separate' | 'unified') */
  mode?: ConnectionMode;
  /** Friendly display name for this connection */
  name?: string;
  /** REST / Webhook base URL for historical klines / symbol lookup */
  restUrl?: string;
  /** WebSocket URL for live streaming price ticks */
  wsUrl?: string;
  /** Optional Authorization header / API Key */
  apiKey?: string;
  /** Optional custom HTTP headers */
  headers?: Record<string, string>;
  /** Webhook payload format */
  webhookFormat?: 'standard' | 'binance' | 'tradingview' | 'custom';
  /** Optional custom symbol list */
  customSymbols?: ChartSymbolInfo[];
  /** Programmatic custom handlers injected by host app */
  customHandler?: MarketEndpointConfig['customHandler'];
  /** Automatically test ping / connectivity after setting (default: true) */
  autoTest?: boolean;
}

export interface MarketEndpointConfig {
  /** Display name for this market provider */
  name: string;
  /** Market category */
  market: MarketCategory;
  /** REST API base URL or Webhook endpoint for historical klines / symbol search */
  restUrl?: string;
  /** WebSocket URL for real-time live price ticks */
  wsUrl?: string;
  /** Optional Authorization header or API Key */
  apiKey?: string;
  /** Optional custom HTTP headers */
  headers?: Record<string, string>;
  /** Webhook payload format */
  webhookFormat?: 'standard' | 'binance' | 'tradingview' | 'custom';
  /** Connection status */
  status?: ConnectionStatus;
  /** Latency in ms from last ping test */
  pingMs?: number;
  /** Last error message if any */
  lastError?: string;
  /** Optional custom symbol list for this market */
  customSymbols?: ChartSymbolInfo[];
  /** Programmatic custom handlers injected by the host app */
  customHandler?: {
    searchSymbols?: (query: string) => Promise<ChartSymbolInfo[]> | ChartSymbolInfo[];
    getHistory?: (params: {
      symbol: string;
      timeframe: string;
      from?: number;
      to?: number;
      limit?: number;
    }) => Promise<CandleData[]> | CandleData[];
    subscribe?: (
      params: { symbol: string; timeframe: string },
      onTick: (candle: CandleData) => void
    ) => (() => void) | void;
  };
}

export interface UnifiedEndpointConfig {
  /** Unified REST API base URL or Webhook endpoint */
  restUrl: string;
  /** Unified WebSocket URL */
  wsUrl?: string;
  /** Optional API Key / Auth Token */
  apiKey?: string;
  /** Optional custom HTTP headers */
  headers?: Record<string, string>;
  /** Connection status */
  status?: ConnectionStatus;
  /** Latency in ms from last ping test */
  pingMs?: number;
  /** Last error message */
  lastError?: string;
  /** Programmatic custom handlers injected by the host app */
  customHandler?: {
    searchSymbols?: (query: string, market?: MarketCategory) => Promise<ChartSymbolInfo[]> | ChartSymbolInfo[];
    getHistory?: (params: {
      symbol: string;
      market: MarketCategory;
      timeframe: string;
      from?: number;
      to?: number;
      limit?: number;
    }) => Promise<CandleData[]> | CandleData[];
    subscribe?: (
      params: { symbol: string; market: MarketCategory; timeframe: string },
      onTick: (candle: CandleData) => void
    ) => (() => void) | void;
  };
}

export interface MarketConnectionSettings {
  /** Active system mode: 'separate' (per-market APIs) or 'unified' (single gateway) */
  mode: ConnectionMode;
  /** Separate per-market connection configs */
  separate: Record<MarketCategory, MarketEndpointConfig>;
  /** Unified connection config */
  unified: UnifiedEndpointConfig;
}

export interface MarketConnectionApi {
  /** Get active connection mode ('separate' | 'unified') */
  getMode: () => ConnectionMode;
  /** Set connection mode */
  setMode: (mode: ConnectionMode) => void;
  /** Get current full settings */
  getSettings: () => MarketConnectionSettings;
  /** Update configuration for a specific market in separate mode */
  setMarketConfig: (market: MarketCategory, config: Partial<MarketEndpointConfig>) => void;
  /** Update unified connection config */
  setUnifiedConfig: (config: Partial<UnifiedEndpointConfig>) => void;
  /** Push a live candle tick from host app into the chart */
  pushTick: (tick: CandleData & { symbol: string; market?: MarketCategory }) => void;
  /** Push historical candle dataset from host app into the chart */
  pushCandles: (candles: CandleData[], symbol: string, market?: MarketCategory) => void;
  /** Test connection for a market or unified gateway */
  testConnection: (market?: MarketCategory | 'unified') => Promise<{ success: boolean; message: string; pingMs?: number }>;
  /** Reset to default configurations */
  resetDefaults: () => void;
  /** Register callback on config change */
  onSettingsChange: (callback: (settings: MarketConnectionSettings) => void) => () => void;

  // ─── Programmatic Market Feed & Webhook Methods ───
  /** Connect or update a market feed programmatically */
  connectFeed: (options: MarketFeedConnectOptions) => Promise<{ success: boolean; message: string; pingMs?: number }>;
  /** Disconnect a market feed or unified gateway */
  disconnectFeed: (market?: MarketCategory | 'unified') => void;
  /** Ingest an incoming webhook payload with auto format detection */
  pushWebhook: (payload: unknown, options?: WebhookPushOptions) => WebhookProcessResult;
  /** Parse an incoming webhook without necessarily applying it to the chart */
  processWebhook: (payload: unknown, options?: WebhookPushOptions) => WebhookProcessResult;
  /** Register a listener for all processed webhook events */
  onWebhook: (callback: (event: WebhookEvent) => void) => () => void;
}
