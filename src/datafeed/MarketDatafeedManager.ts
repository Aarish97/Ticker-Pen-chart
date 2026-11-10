/**
 * MarketDatafeedManager
 * Coordinates dual-mode market data feeds:
 * 1. Separate Connections: Crypto has its dedicated webhook/connection, Forex has its own, Stocks has its own, etc.
 * 2. Unified Connection: Single unified API / Webhook gateway for all markets.
 */

import type { CandleData, ChartSymbolInfo } from '../types/chart';
import type {
  MarketCategory,
  ConnectionMode,
  MarketEndpointConfig,
  UnifiedEndpointConfig,
  MarketConnectionSettings,
  MarketConnectionApi,
  WebhookFormat,
  WebhookSignalPayload,
  WebhookProcessResult,
  WebhookPushOptions,
  WebhookEvent,
  MarketFeedConnectOptions
} from '../types/marketConnection';

const STORAGE_KEY = 'trading_chart_market_connections';

export const DEFAULT_MARKET_SYMBOLS: Record<MarketCategory, ChartSymbolInfo[]> = {
  crypto: [
    { ticker: 'BTCUSDT', name: 'Bitcoin', shortName: 'BTC/USDT', exchange: 'BINANCE', market: 'crypto', pricePrecision: 2 },
    { ticker: 'ETHUSDT', name: 'Ethereum', shortName: 'ETH/USDT', exchange: 'BINANCE', market: 'crypto', pricePrecision: 2 },
    { ticker: 'SOLUSDT', name: 'Solana', shortName: 'SOL/USDT', exchange: 'BINANCE', market: 'crypto', pricePrecision: 2 },
    { ticker: 'BNBUSDT', name: 'BNB', shortName: 'BNB/USDT', exchange: 'BINANCE', market: 'crypto', pricePrecision: 2 },
    { ticker: 'XRPUSDT', name: 'Ripple', shortName: 'XRP/USDT', exchange: 'BINANCE', market: 'crypto', pricePrecision: 4 },
    { ticker: 'ADAUSDT', name: 'Cardano', shortName: 'ADA/USDT', exchange: 'BINANCE', market: 'crypto', pricePrecision: 4 },
    { ticker: 'DOGEUSDT', name: 'Dogecoin', shortName: 'DOGE/USDT', exchange: 'BINANCE', market: 'crypto', pricePrecision: 5 },
    { ticker: 'DOTUSDT', name: 'Polkadot', shortName: 'DOT/USDT', exchange: 'BINANCE', market: 'crypto', pricePrecision: 3 },
    { ticker: 'AVAXUSDT', name: 'Avalanche', shortName: 'AVAX/USDT', exchange: 'BINANCE', market: 'crypto', pricePrecision: 2 },
    { ticker: 'LINKUSDT', name: 'Chainlink', shortName: 'LINK/USDT', exchange: 'BINANCE', market: 'crypto', pricePrecision: 2 },
    { ticker: 'SHIBUSDT', name: 'Shiba Inu', shortName: 'SHIB/USDT', exchange: 'BINANCE', market: 'crypto', pricePrecision: 8 },
    { ticker: 'PEPEUSDT', name: 'Pepe', shortName: 'PEPE/USDT', exchange: 'BINANCE', market: 'crypto', pricePrecision: 8 },
  ],
  forex: [
    { ticker: 'EURUSD', name: 'Euro / US Dollar', shortName: 'EUR/USD', exchange: 'FOREX', market: 'forex', pricePrecision: 5 },
    { ticker: 'GBPUSD', name: 'British Pound / US Dollar', shortName: 'GBP/USD', exchange: 'FOREX', market: 'forex', pricePrecision: 5 },
    { ticker: 'USDJPY', name: 'US Dollar / Japanese Yen', shortName: 'USD/JPY', exchange: 'FOREX', market: 'forex', pricePrecision: 3 },
    { ticker: 'AUDUSD', name: 'Australian Dollar / US Dollar', shortName: 'AUD/USD', exchange: 'FOREX', market: 'forex', pricePrecision: 5 },
    { ticker: 'USDCAD', name: 'US Dollar / Canadian Dollar', shortName: 'USD/CAD', exchange: 'FOREX', market: 'forex', pricePrecision: 5 },
    { ticker: 'USDCHF', name: 'US Dollar / Swiss Franc', shortName: 'USD/CHF', exchange: 'FOREX', market: 'forex', pricePrecision: 5 },
    { ticker: 'NZDUSD', name: 'New Zealand Dollar / US Dollar', shortName: 'NZD/USD', exchange: 'FOREX', market: 'forex', pricePrecision: 5 },
    { ticker: 'EURGBP', name: 'Euro / British Pound', shortName: 'EUR/GBP', exchange: 'FOREX', market: 'forex', pricePrecision: 5 },
    { ticker: 'EURJPY', name: 'Euro / Japanese Yen', shortName: 'EUR/JPY', exchange: 'FOREX', market: 'forex', pricePrecision: 3 },
  ],
  stock: [
    { ticker: 'AAPL', name: 'Apple Inc.', shortName: 'AAPL', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },
    { ticker: 'TSLA', name: 'Tesla Inc.', shortName: 'TSLA', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },
    { ticker: 'NVDA', name: 'NVIDIA Corporation', shortName: 'NVDA', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },
    { ticker: 'MSFT', name: 'Microsoft Corporation', shortName: 'MSFT', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },
    { ticker: 'AMZN', name: 'Amazon.com Inc.', shortName: 'AMZN', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },
    { ticker: 'GOOGL', name: 'Alphabet Inc. (Google)', shortName: 'GOOGL', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },
    { ticker: 'META', name: 'Meta Platforms Inc.', shortName: 'META', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },
    { ticker: 'NFLX', name: 'Netflix Inc.', shortName: 'NFLX', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },
    { ticker: 'AMD', name: 'Advanced Micro Devices', shortName: 'AMD', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },
  ],
  commodity: [
    { ticker: 'GOLD', name: 'Gold Futures', shortName: 'GOLD', exchange: 'COMEX', market: 'commodity', pricePrecision: 2 },
    { ticker: 'SILVER', name: 'Silver Futures', shortName: 'SILVER', exchange: 'COMEX', market: 'commodity', pricePrecision: 3 },
    { ticker: 'CRUDE_OIL', name: 'Crude Oil (WTI)', shortName: 'OIL', exchange: 'NYMEX', market: 'commodity', pricePrecision: 2 },
    { ticker: 'NAT_GAS', name: 'Natural Gas Futures', shortName: 'NATGAS', exchange: 'NYMEX', market: 'commodity', pricePrecision: 3 },
    { ticker: 'COPPER', name: 'Copper Futures', shortName: 'COPPER', exchange: 'COMEX', market: 'commodity', pricePrecision: 4 },
  ],
  indices: [
    { ticker: 'SPX500', name: 'S&P 500 Index', shortName: 'US500', exchange: 'INDEX', market: 'indices', pricePrecision: 2 },
    { ticker: 'NAS100', name: 'Nasdaq 100 Index', shortName: 'NAS100', exchange: 'INDEX', market: 'indices', pricePrecision: 2 },
    { ticker: 'US30', name: 'Dow Jones Industrial 30', shortName: 'US30', exchange: 'INDEX', market: 'indices', pricePrecision: 1 },
    { ticker: 'UK100', name: 'FTSE 100 Index', shortName: 'UK100', exchange: 'INDEX', market: 'indices', pricePrecision: 1 },
    { ticker: 'GER40', name: 'DAX 40 Index', shortName: 'GER40', exchange: 'INDEX', market: 'indices', pricePrecision: 1 },
    { ticker: 'JPN225', name: 'Nikkei 225 Index', shortName: 'JP225', exchange: 'INDEX', market: 'indices', pricePrecision: 1 },
  ]
};

export const DEFAULT_SETTINGS: MarketConnectionSettings = {
  mode: 'separate',
  separate: {
    crypto: {
      name: 'Crypto (Binance & Webhook)',
      market: 'crypto',
      restUrl: 'https://api.binance.com',
      wsUrl: 'wss://stream.binance.com:9443/ws',
      status: 'connected',
      webhookFormat: 'binance'
    },
    forex: {
      name: 'Forex (Webhook / API)',
      market: 'forex',
      restUrl: '',
      wsUrl: '',
      status: 'simulated',
      webhookFormat: 'standard'
    },
    stock: {
      name: 'Stocks (Webhook / API)',
      market: 'stock',
      restUrl: '',
      wsUrl: '',
      status: 'simulated',
      webhookFormat: 'standard'
    },
    commodity: {
      name: 'Commodities (Webhook / API)',
      market: 'commodity',
      restUrl: '',
      wsUrl: '',
      status: 'simulated',
      webhookFormat: 'standard'
    },
    indices: {
      name: 'Indices (Webhook / API)',
      market: 'indices',
      restUrl: '',
      wsUrl: '',
      status: 'simulated',
      webhookFormat: 'standard'
    }
  },
  unified: {
    restUrl: 'http://127.0.0.1:8000/api/market',
    wsUrl: 'ws://127.0.0.1:8000/ws/market',
    status: 'idle'
  }
};

export class MarketDatafeedManager {
  private static instance: MarketDatafeedManager | null = null;
  private settings: MarketConnectionSettings;
  private listeners = new Set<(settings: MarketConnectionSettings) => void>();
  private webhookListeners = new Set<(event: WebhookEvent) => void>();
  private activeSubscribers = new Map<string, Set<(candle: CandleData) => void>>();
  private webSockets = new Map<string, WebSocket>();

  private constructor() {
    this.settings = this.loadSettings();
    this.setupWindowEvents();
  }

  public static getInstance(): MarketDatafeedManager {
    if (!MarketDatafeedManager.instance) {
      MarketDatafeedManager.instance = new MarketDatafeedManager();
    }
    return MarketDatafeedManager.instance;
  }

  private loadSettings(): MarketConnectionSettings {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            mode: parsed.mode || DEFAULT_SETTINGS.mode,
            separate: {
              ...DEFAULT_SETTINGS.separate,
              ...(parsed.separate || {})
            },
            unified: {
              ...DEFAULT_SETTINGS.unified,
              ...(parsed.unified || {})
            }
          };
        }
      }
    } catch (e) {
      console.warn('Failed to load market connection settings:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  private saveSettings(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      }
    } catch (e) {
      console.warn('Failed to save market connection settings:', e);
    }
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach(cb => {
      try { cb(this.settings); } catch (e) { }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('market-connection:settings-changed', {
        detail: this.settings
      }));
    }
  }

  private setupWindowEvents(): void {
    if (typeof window === 'undefined') return;

    // Listen for custom host app events
    window.addEventListener('market-connection:set-mode', ((e: CustomEvent) => {
      if (e.detail && (e.detail === 'separate' || e.detail === 'unified')) {
        this.setMode(e.detail);
      }
    }) as EventListener);

    window.addEventListener('market-connection:update-market', ((e: CustomEvent) => {
      if (e.detail && e.detail.market && e.detail.config) {
        this.setMarketConfig(e.detail.market, e.detail.config);
      }
    }) as EventListener);

    window.addEventListener('market-connection:update-unified', ((e: CustomEvent) => {
      if (e.detail && e.detail.config) {
        this.setUnifiedConfig(e.detail.config);
      }
    }) as EventListener);

    window.addEventListener('market-connection:push-tick', ((e: CustomEvent) => {
      if (e.detail) {
        this.pushTick(e.detail);
      }
    }) as EventListener);

    window.addEventListener('market-connection:push-candles', ((e: CustomEvent) => {
      if (e.detail && e.detail.candles && e.detail.symbol) {
        this.pushCandles(e.detail.candles, e.detail.symbol, e.detail.market);
      }
    }) as EventListener);

    window.addEventListener('market-connection:push-webhook', ((e: CustomEvent) => {
      if (e.detail) {
        const payload = e.detail.payload !== undefined ? e.detail.payload : e.detail;
        const options = e.detail.options;
        this.pushWebhook(payload, options);
      }
    }) as EventListener);

    window.addEventListener('market-connection:connect-feed', ((e: CustomEvent) => {
      if (e.detail) {
        this.connectFeed(e.detail);
      }
    }) as EventListener);

    window.addEventListener('market-connection:disconnect-feed', ((e: CustomEvent) => {
      this.disconnectFeed(e.detail?.market || e.detail);
    }) as EventListener);
  }

  // ─── Public API ───

  public getSettings(): MarketConnectionSettings {
    return JSON.parse(JSON.stringify(this.settings));
  }

  public getMode(): ConnectionMode {
    return this.settings.mode;
  }

  public setMode(mode: ConnectionMode): void {
    this.settings.mode = mode;
    this.saveSettings();
  }

  public setMarketConfig(market: MarketCategory, config: Partial<MarketEndpointConfig>): void {
    if (!this.settings.separate[market]) {
      this.settings.separate[market] = {
        name: market.toUpperCase(),
        market,
        ...config
      };
    } else {
      this.settings.separate[market] = {
        ...this.settings.separate[market],
        ...config
      };
    }
    this.saveSettings();
  }

  public setUnifiedConfig(config: Partial<UnifiedEndpointConfig>): void {
    this.settings.unified = {
      ...this.settings.unified,
      ...config
    };
    this.saveSettings();
  }

  public resetDefaults(): void {
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.saveSettings();
  }

  public onSettingsChange(callback: (settings: MarketConnectionSettings) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Automatically detect market category from symbol ticker string
   */
  public detectMarket(ticker: string): MarketCategory {
    const clean = ticker.toUpperCase().replace('-', '').replace('/', '');

    // 1. Forex pairs: 6 chars composed of major currencies or contains EURUSD, etc.
    const majorCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
    if (clean.length === 6 && majorCurrencies.includes(clean.substring(0, 3)) && majorCurrencies.includes(clean.substring(3, 6))) {
      return 'forex';
    }

    // 2. Commodities
    const commodities = ['GOLD', 'SILVER', 'OIL', 'GAS', 'COPPER', 'CRUDE', 'XAU', 'XAG', 'BRENT', 'NATGAS'];
    if (commodities.some(c => clean.startsWith(c) || clean.endsWith(c) || clean.includes(c))) {
      return 'commodity';
    }

    // 3. Indices
    const indices = ['SPX', 'NAS', 'DOW', 'US30', 'UK100', 'GER', 'DAX', 'JPN', 'FTSE', 'INDEX'];
    if (indices.some(idx => clean.includes(idx))) {
      return 'indices';
    }

    // 4. Crypto
    const cryptoSuffixes = ['USDT', 'USDC', 'BUSD', 'TUSD', 'FDUSD', 'DAI', 'BTC', 'ETH', 'SOL', 'BNB'];
    const isCrypto = cryptoSuffixes.some(s => clean.endsWith(s)) ||
      ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'LINK', 'SHIB', 'PEPE'].some(b => clean.startsWith(b));
    if (isCrypto) {
      return 'crypto';
    }

    // Default to stock
    return 'stock';
  }

  /**
   * Search symbols across markets or for a specific market category
   */
  public async searchSymbols(query: string, marketFilter?: MarketCategory | 'ALL'): Promise<ChartSymbolInfo[]> {
    const cleanQuery = query.toLowerCase().trim();
    const mode = this.settings.mode;

    // 1. Unified Mode: check if host provided customHandler or call unified REST
    if (mode === 'unified') {
      const unifiedConfig = this.settings.unified;
      if (unifiedConfig.customHandler?.searchSymbols) {
        try {
          const res = await unifiedConfig.customHandler.searchSymbols(
            query,
            marketFilter && marketFilter !== 'ALL' ? marketFilter : undefined
          );
          if (Array.isArray(res) && res.length > 0) return res;
        } catch (e) {
          console.warn('Unified customHandler searchSymbols failed:', e);
        }
      }

      if (unifiedConfig.restUrl && !unifiedConfig.restUrl.includes('127.0.0.1:8000')) {
        try {
          const url = `${unifiedConfig.restUrl.replace(/\/$/, '')}/symbols?query=${encodeURIComponent(query)}` +
            (marketFilter && marketFilter !== 'ALL' ? `&market=${marketFilter}` : '');
          const res = await fetch(url, {
            headers: {
              ...(unifiedConfig.apiKey ? { Authorization: `Bearer ${unifiedConfig.apiKey}` } : {}),
              ...(unifiedConfig.headers || {})
            }
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) return data;
          }
        } catch (e) { }
      }
    }

    // 2. Separate Mode or Fallback: Gather symbols from the relevant market category
    let allSymbols: ChartSymbolInfo[] = [];

    const categories: MarketCategory[] = (marketFilter && marketFilter !== 'ALL')
      ? [marketFilter]
      : ['crypto', 'forex', 'stock', 'commodity', 'indices'];

    for (const cat of categories) {
      const marketConfig = this.settings.separate[cat];
      let marketSymbols: ChartSymbolInfo[] = [];

      // Check custom handler
      if (marketConfig?.customHandler?.searchSymbols) {
        try {
          const res = await marketConfig.customHandler.searchSymbols(query);
          if (Array.isArray(res) && res.length > 0) {
            marketSymbols = res;
          }
        } catch (e) { }
      }

      // Check custom symbols list in config
      if (marketSymbols.length === 0 && marketConfig?.customSymbols && marketConfig.customSymbols.length > 0) {
        marketSymbols = marketConfig.customSymbols;
      }

      // Default built-in list
      if (marketSymbols.length === 0 && DEFAULT_MARKET_SYMBOLS[cat]) {
        marketSymbols = DEFAULT_MARKET_SYMBOLS[cat];
      }

      allSymbols.push(...marketSymbols);
    }

    if (!cleanQuery) {
      return allSymbols;
    }

    return allSymbols.filter(item =>
      item.ticker.toLowerCase().includes(cleanQuery) ||
      (item.name && item.name.toLowerCase().includes(cleanQuery)) ||
      (item.shortName && item.shortName.toLowerCase().includes(cleanQuery))
    );
  }

  /**
   * Load Historical KLine / Candle Data for a symbol
   */
  public async getHistoryKLineData(params: {
    symbol: string | ChartSymbolInfo;
    period: { text?: string; multiplier?: number; timespan?: string };
    from?: number;
    to?: number;
    limit?: number;
  }): Promise<CandleData[] | null> {
    const tickerStr = typeof params.symbol === 'string' ? params.symbol : params.symbol.ticker;
    const market = typeof params.symbol === 'object' && params.symbol.market
      ? (params.symbol.market as MarketCategory)
      : this.detectMarket(tickerStr);
    const timeframe = params.period.text || `${params.period.multiplier || 15}m`;
    const limit = params.limit || 500;

    // ─── Case 1: Unified Mode ───
    if (this.settings.mode === 'unified') {
      const unified = this.settings.unified;

      if (unified.customHandler?.getHistory) {
        try {
          const candles = await unified.customHandler.getHistory({
            symbol: tickerStr,
            market,
            timeframe,
            from: params.from,
            to: params.to,
            limit
          });
          if (Array.isArray(candles) && candles.length > 0) return candles;
        } catch (e) {
          console.warn('Unified customHandler.getHistory error:', e);
        }
      }

      if (unified.restUrl) {
        try {
          const url = new URL(`${unified.restUrl.replace(/\/$/, '')}/klines`);
          url.searchParams.set('symbol', tickerStr);
          url.searchParams.set('market', market);
          url.searchParams.set('interval', timeframe);
          if (params.from) url.searchParams.set('from', String(Math.floor(params.from)));
          if (params.to) url.searchParams.set('to', String(Math.floor(params.to)));
          url.searchParams.set('limit', String(limit));

          const res = await fetch(url.toString(), {
            headers: {
              ...(unified.apiKey ? { Authorization: `Bearer ${unified.apiKey}` } : {}),
              ...(unified.headers || {})
            }
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              return this.normalizeCandleArray(data);
            }
          }
        } catch (e) {
          console.warn('Unified REST fetch failed:', e);
        }
      }

      // Unified mode is deliberately terminal.  A failed gateway request must
      // not silently escape through one of the separate market connections.
      return null;
    }

    // ─── Case 2: Separate Mode (Per-Market Connection) ───
    const marketConfig = this.settings.separate[market];

    // Check if host app provided a custom handler for this market
    if (marketConfig?.customHandler?.getHistory) {
      try {
        const candles = await marketConfig.customHandler.getHistory({
          symbol: tickerStr,
          timeframe,
          from: params.from,
          to: params.to,
          limit
        });
        if (Array.isArray(candles) && candles.length > 0) return candles;
      } catch (e) {
        console.warn(`Market [${market}] customHandler.getHistory error:`, e);
      }
    }

    // Check if custom REST/Webhook URL is configured for this market
    const customRestUrl = marketConfig?.restUrl?.trim();
    const isDefaultBinance = market === 'crypto' && (!customRestUrl || customRestUrl.includes('binance.com'));

    if (customRestUrl && !isDefaultBinance) {
      try {
        const url = new URL(customRestUrl.includes('?') ? customRestUrl : `${customRestUrl.replace(/\/$/, '')}/klines`);
        url.searchParams.set('symbol', tickerStr);
        url.searchParams.set('interval', timeframe);
        if (params.from) url.searchParams.set('from', String(Math.floor(params.from)));
        if (params.to) url.searchParams.set('to', String(Math.floor(params.to)));
        url.searchParams.set('limit', String(limit));

        const res = await fetch(url.toString(), {
          headers: {
            ...(marketConfig.apiKey ? { Authorization: `Bearer ${marketConfig.apiKey}` } : {}),
            ...(marketConfig.headers || {})
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            return this.normalizeCandleArray(data);
          }
        }
      } catch (e) {
        console.warn(`Market [${market}] custom REST fetch failed:`, e);
      }
    }

    // Return null to let the widget fallback to native Binance (for crypto) or simulated (for other markets)
    return null;
  }

  /**
   * Subscribe to live updates for a symbol
   */
  public subscribe(
    symbol: string | ChartSymbolInfo,
    period: { text?: string; multiplier?: number; timespan?: string },
    callback: (candle: CandleData) => void
  ): () => void {
    const tickerStr = this.normalizeSymbol(typeof symbol === 'string' ? symbol : symbol.ticker);
    const market = typeof symbol === 'object' && symbol.market
      ? (symbol.market as MarketCategory)
      : this.detectMarket(tickerStr);
    const timeframe = period.text || `${period.multiplier || 15}m`;
    const subKey = `${tickerStr}_${timeframe}`;

    // Add to active subscribers
    if (!this.activeSubscribers.has(subKey)) {
      this.activeSubscribers.set(subKey, new Set());
    }
    this.activeSubscribers.get(subKey)!.add(callback);

    let cleanupExternal: (() => void) | void = undefined;
    let socket: WebSocket | undefined;

    // Check Unified Mode
    if (this.settings.mode === 'unified') {
      const unified = this.settings.unified;
      if (unified.customHandler?.subscribe) {
        cleanupExternal = unified.customHandler.subscribe(
          { symbol: tickerStr, market, timeframe },
          callback
        );
      }
    } else {
      // Separate Mode
      const marketConfig = this.settings.separate[market];
      if (marketConfig?.customHandler?.subscribe) {
        cleanupExternal = marketConfig.customHandler.subscribe(
          { symbol: tickerStr, timeframe },
          callback
        );
      }
    }

    const endpoint = this.settings.mode === 'unified'
      ? this.settings.unified
      : this.settings.separate[market];

    // A configured WS endpoint is useful without requiring consumers to
    // provide a JavaScript handler.  Parameters are supplied both as URL
    // template values and query parameters for common gateway conventions.
    if (!cleanupExternal && endpoint?.wsUrl?.trim() && typeof WebSocket !== 'undefined') {
      try {
        const wsUrl = this.buildWebSocketUrl(endpoint.wsUrl, tickerStr, market, timeframe);
        socket = new WebSocket(wsUrl);
        this.webSockets.set(subKey, socket);
        socket.onmessage = event => {
          const candle = this.parseLiveCandle(event.data);
          if (candle) this.pushTick({ ...candle, symbol: tickerStr, market });
        };
        socket.onerror = () => {
          // The chart may still receive externally pushed ticks; avoid turning
          // a transient custom-WS error into a fatal chart error.
        };
      } catch (error) {
        console.warn(`Market [${market}] WebSocket subscription failed:`, error);
      }
    }

    return () => {
      const set = this.activeSubscribers.get(subKey);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.activeSubscribers.delete(subKey);
        }
      }
      if (typeof cleanupExternal === 'function') {
        cleanupExternal();
      }
      if (socket) {
        try { socket.close(); } catch (e) { }
      }
      if (this.webSockets.get(subKey) === socket) {
        this.webSockets.delete(subKey);
      }
    };
  }

  private buildWebSocketUrl(wsUrl: string, symbol: string, market: MarketCategory, timeframe: string): string {
    const replace = (value: string) => value
      .replace(/\{symbol\}/gi, encodeURIComponent(symbol))
      .replace(/\{market\}/gi, encodeURIComponent(market))
      .replace(/\{(?:interval|timeframe)\}/gi, encodeURIComponent(timeframe));
    const resolved = replace(wsUrl.trim());
    if (/\{[^}]+\}/.test(resolved)) return resolved;

    const url = new URL(resolved);
    if (!url.searchParams.has('symbol')) url.searchParams.set('symbol', symbol);
    if (!url.searchParams.has('market')) url.searchParams.set('market', market);
    if (!url.searchParams.has('interval')) url.searchParams.set('interval', timeframe);
    return url.toString();
  }

  private normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase().replace(/[-/\s]/g, '');
  }

  private parseLiveCandle(payload: unknown): CandleData | null {
    try {
      const message = typeof payload === 'string' ? JSON.parse(payload) : payload as any;
      const value = message?.k || message?.candle || message?.data || message;
      const timestamp = Number(value?.timestamp ?? value?.time ?? value?.t ?? value?.openTime);
      const open = Number(value?.open ?? value?.o);
      const high = Number(value?.high ?? value?.h);
      const low = Number(value?.low ?? value?.l);
      const close = Number(value?.close ?? value?.c ?? value?.price ?? value?.p);
      const volume = Number(value?.volume ?? value?.v ?? 0);
      if (![timestamp, open, high, low, close].every(Number.isFinite)) return null;
      return { timestamp, open, high, low, close, volume };
    } catch (error) {
      return null;
    }
  }

  /**
   * Push a live price tick or candle update into the chart system
   * Useful when host application receives webhooks or WebSocket ticks externally.
   */
  public pushTick(tick: CandleData & { symbol: string; market?: MarketCategory }): void {
    if (!tick || !tick.symbol) return;
    const tickerStr = this.normalizeSymbol(tick.symbol);

    // Broadcast to any subscriber listening to this symbol (regardless of timeframe if matching latest)
    this.activeSubscribers.forEach((subscribers, subKey) => {
      if (subKey.startsWith(`${tickerStr}_`)) {
        subscribers.forEach(cb => {
          try { cb(tick); } catch (e) { }
        });
      }
    });

    // Also update global live price for overlays and status line if matching active symbol
    if (typeof window !== 'undefined') {
      const activeChart = (window as any).__active_chart_instance__;
      const curSym = activeChart?.getSymbol?.();
      const curTick = curSym ? (curSym.ticker || curSym.name || '').toUpperCase().replace(/[-/]/g, '') : '';
      if (!curTick || curTick === tickerStr) {
        (window as any).__last_live_price__ = tick.close;
        (window as any).__last_live_tick__ = tick;
        (window as any).__last_live_symbol__ = tickerStr;
        if (activeChart && typeof activeChart.updateData === 'function') {
          try {
            activeChart.updateData(tick);
          } catch (e) { }
        }
      }
    }
  }

  /**
   * Push an entire historical candle array for a symbol
   */
  public pushCandles(candles: CandleData[], symbol: string, _market?: MarketCategory): void {
    if (!Array.isArray(candles) || candles.length === 0 || !symbol) return;
    const activeChart = typeof window !== 'undefined' ? (window as any).__active_chart_instance__ : null;
    if (activeChart && typeof activeChart.applyNewData === 'function') {
      try {
        activeChart.applyNewData(candles);
      } catch (e) {
        console.warn('Failed to apply pushed candles to active chart:', e);
      }
    }
  }

  /**
   * Test network connection and measure ping latency
   */
  public async testConnection(
    target?: MarketCategory | 'unified'
  ): Promise<{ success: boolean; message: string; pingMs?: number }> {
    const isUnified = target === 'unified' || (!target && this.settings.mode === 'unified');
    const start = Date.now();

    try {
      if (isUnified) {
        const url = this.settings.unified.restUrl;
        if (!url) {
          return { success: false, message: 'No unified REST URL specified.' };
        }
        await fetch(url, { method: 'HEAD', mode: 'no-cors' });
        const pingMs = Date.now() - start;
        this.settings.unified.status = 'connected';
        this.settings.unified.pingMs = pingMs;
        this.saveSettings();
        return { success: true, message: `Connected to Unified Gateway (${pingMs}ms)`, pingMs };
      } else {
        const marketCat = (target as MarketCategory) || 'crypto';
        const config = this.settings.separate[marketCat];
        if (!config) return { success: false, message: `Unknown market ${target}` };

        if (marketCat === 'crypto' && (!config.restUrl || config.restUrl.includes('binance.com'))) {
          // Test Binance ping
          const res = await fetch('https://api.binance.com/api/v3/ping');
          const pingMs = Date.now() - start;
          if (res.ok) {
            config.status = 'connected';
            config.pingMs = pingMs;
            this.saveSettings();
            return { success: true, message: `Binance Crypto Connected (${pingMs}ms)`, pingMs };
          }
        }

        if (!config.restUrl) {
          return {
            success: true,
            message: `Market [${marketCat.toUpperCase()}] running in default simulated mode. Add a webhook/REST URL to connect live.`,
            pingMs: 1
          };
        }

        await fetch(config.restUrl, { method: 'HEAD', mode: 'no-cors' });
        const pingMs = Date.now() - start;
        config.status = 'connected';
        config.pingMs = pingMs;
        this.saveSettings();
        return { success: true, message: `Connected to ${config.name} (${pingMs}ms)`, pingMs };
      }
    } catch (err: any) {
      const msg = err?.message || 'Connection failed';
      if (isUnified) {
        this.settings.unified.status = 'error';
        this.settings.unified.lastError = msg;
      } else if (target) {
        const conf = this.settings.separate[target as MarketCategory];
        if (conf) {
          conf.status = 'error';
          conf.lastError = msg;
        }
      }
      this.saveSettings();
      return { success: false, message: msg };
    }
  }

  /**
   * Connect or update a market feed programmatically through the API
   */
  public async connectFeed(
    options: MarketFeedConnectOptions
  ): Promise<{ success: boolean; message: string; pingMs?: number }> {
    if (options.mode) {
      this.setMode(options.mode);
    }

    const isUnified = options.market === 'unified' || (this.settings.mode === 'unified' && !options.market);

    if (isUnified) {
      this.setUnifiedConfig({
        restUrl: options.restUrl !== undefined ? options.restUrl : this.settings.unified.restUrl,
        wsUrl: options.wsUrl !== undefined ? options.wsUrl : this.settings.unified.wsUrl,
        apiKey: options.apiKey !== undefined ? options.apiKey : this.settings.unified.apiKey,
        headers: options.headers !== undefined ? options.headers : this.settings.unified.headers,
        customHandler: (options.customHandler as any) || this.settings.unified.customHandler
      });

      if (options.autoTest !== false) {
        return await this.testConnection('unified');
      }
      return { success: true, message: 'Unified gateway feed configured successfully' };
    }

    const marketCat = (options.market as MarketCategory) || 'crypto';
    const existing = this.settings.separate[marketCat] || { market: marketCat, name: marketCat.toUpperCase() };

    this.setMarketConfig(marketCat, {
      name: options.name || existing.name,
      restUrl: options.restUrl !== undefined ? options.restUrl : existing.restUrl,
      wsUrl: options.wsUrl !== undefined ? options.wsUrl : existing.wsUrl,
      apiKey: options.apiKey !== undefined ? options.apiKey : existing.apiKey,
      headers: options.headers !== undefined ? options.headers : existing.headers,
      webhookFormat: options.webhookFormat || existing.webhookFormat,
      customSymbols: options.customSymbols || existing.customSymbols,
      customHandler: options.customHandler || existing.customHandler
    });

    if (options.autoTest !== false) {
      return await this.testConnection(marketCat);
    }
    return { success: true, message: `Market [${marketCat.toUpperCase()}] feed configured successfully` };
  }

  /**
   * Disconnect a market feed or unified gateway
   */
  public disconnectFeed(market?: MarketCategory | 'unified'): void {
    const isUnified = market === 'unified' || (this.settings.mode === 'unified' && !market);

    if (isUnified) {
      // Close unified sockets
      this.webSockets.forEach((ws, key) => {
        if (key.includes('unified')) {
          try { ws.close(); } catch (e) { }
          this.webSockets.delete(key);
        }
      });
      this.settings.unified.status = 'idle';
      this.settings.unified.wsUrl = '';
      this.saveSettings();
      return;
    }

    const marketCat = (market as MarketCategory) || 'crypto';
    const conf = this.settings.separate[marketCat];
    if (conf) {
      // Close sockets associated with this market
      this.webSockets.forEach((ws, key) => {
        if (key.includes(marketCat)) {
          try { ws.close(); } catch (e) { }
          this.webSockets.delete(key);
        }
      });
      conf.status = 'simulated';
      conf.wsUrl = '';
      this.saveSettings();
    }
  }

  /**
   * Register a callback listener for all incoming webhook events
   */
  public onWebhook(callback: (event: WebhookEvent) => void): () => void {
    this.webhookListeners.add(callback);
    return () => {
      this.webhookListeners.delete(callback);
    };
  }

  /**
   * Ingest and process an incoming webhook payload with automatic format detection.
   * If valid candle data is found, updates chart ticks/candles in real time.
   * If a trade/order signal is found, plots or executes the position.
   */
  public pushWebhook(payload: unknown, options?: WebhookPushOptions): WebhookProcessResult {
    const result = this.processWebhook(payload, options);

    if (result.success) {
      const targetSym = result.symbol || options?.symbol || (typeof window !== 'undefined' ? (window as any).__last_live_symbol__ || 'BTCUSDT' : 'BTCUSDT');

      // 1. If candle tick present and applyToChart is not disabled, push tick
      if (result.candle && options?.applyToChart !== false) {
        this.pushTick({
          ...result.candle,
          symbol: targetSym,
          market: result.market || options?.market
        });
      }

      // 2. If candles array present and applyToChart is not disabled, push candles
      if (result.candles && options?.applyToChart !== false) {
        this.pushCandles(
          result.candles,
          targetSym,
          result.market || options?.market
        );
      }

      // 3. If signal present and autoPlotSignal is not disabled, plot/execute on chart
      if (result.signal && options?.autoPlotSignal !== false) {
        this.executeSignalOnChart(result.signal);
      }

      // 4. Notify registered webhook listeners
      const event: WebhookEvent = {
        result,
        timestamp: Date.now()
      };
      this.webhookListeners.forEach(cb => {
        try { cb(event); } catch (e) { }
      });

      // 5. Dispatch global window custom events
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('market-connection:webhook-event', { detail: event }));
        if (result.signal) {
          window.dispatchEvent(new CustomEvent('trading:webhook-signal', { detail: result.signal }));
        }
      }
    }

    return result;
  }

  /**
   * Parse an incoming webhook without necessarily applying it to the chart.
   * Supports: Binance klines, TradingView alerts, standard OHLCV, array datasets, and plain-text trade signals.
   */
  public processWebhook(payload: unknown, options?: WebhookPushOptions): WebhookProcessResult {
    const raw = payload;
    const formatReq = options?.format || 'auto';

    if (payload === null || payload === undefined) {
      return {
        success: false,
        formatDetected: formatReq,
        type: 'unknown',
        error: 'Payload is null or undefined',
        raw
      };
    }

    // 1. Custom transformer handler
    if (formatReq === 'custom' || typeof options?.transform === 'function') {
      if (typeof options?.transform === 'function') {
        try {
          const res = options.transform(payload);
          if (res) return res;
        } catch (e: any) {
          return {
            success: false,
            formatDetected: 'custom',
            type: 'unknown',
            error: e?.message || 'Custom transformer error',
            raw
          };
        }
      }
    }

    // Parse string to JSON if possible
    let data: any = payload;
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          data = JSON.parse(trimmed);
        } catch (e) {
          // not valid JSON; fallback to plain-text signal parser
        }
      } else {
        const textSignal = this.parsePlainTextSignal(trimmed);
        if (textSignal) {
          const sym = textSignal.symbol || options?.symbol || '';
          return {
            success: true,
            formatDetected: 'signal',
            type: 'signal',
            symbol: sym,
            market: options?.market || (sym ? this.detectMarket(sym) : undefined),
            signal: textSignal,
            raw
          };
        }
      }
    }

    // 2. Array of candles e.g. [[t,o,h,l,c,v]] or [{timestamp, open, ...}]
    if (Array.isArray(data)) {
      if (data.length > 0) {
        const normalized = this.normalizeCandleArray(data);
        if (normalized.length > 0) {
          const sym = options?.symbol || '';
          return {
            success: true,
            formatDetected: 'standard',
            type: 'candles',
            symbol: sym,
            market: options?.market || (sym ? this.detectMarket(sym) : undefined),
            candles: normalized,
            raw
          };
        }
      }
      return {
        success: false,
        formatDetected: 'standard',
        type: 'candles',
        error: 'Empty or invalid candle array',
        raw
      };
    }

    if (typeof data !== 'object') {
      return {
        success: false,
        formatDetected: formatReq,
        type: 'unknown',
        error: 'Payload must be an object, array, or parseable string',
        raw
      };
    }

    // 3. Binance Kline / Stream payload
    // e.g.: { e: "kline", s: "BTCUSDT", k: { t: 1700000000, o: "68000", h: "68500", l: "67900", c: "68400", v: "120.5" } }
    const binanceData = data.data || data;
    if (
      formatReq === 'binance' ||
      binanceData.e === 'kline' ||
      (binanceData.k && (binanceData.k.o || binanceData.k.c)) ||
      binanceData.stream?.includes?.('kline')
    ) {
      const k = binanceData.k || binanceData;
      const sym = binanceData.s || k.s || options?.symbol || '';
      const candle: CandleData = {
        timestamp: Number(k.t || k.T || k.openTime || Date.now()),
        open: Number(k.o || k.open),
        high: Number(k.h || k.high),
        low: Number(k.l || k.low),
        close: Number(k.c || k.close),
        volume: Number(k.v || k.volume || 0)
      };

      if ([candle.open, candle.high, candle.low, candle.close].every(v => typeof v === 'number' && !isNaN(v))) {
        return {
          success: true,
          formatDetected: 'binance',
          type: 'candle',
          symbol: sym,
          market: options?.market || (sym ? this.detectMarket(sym) : 'crypto'),
          candle,
          raw
        };
      }
    }

    // 4. Trade / Order Signal Payload (e.g. from TradingView alerts or trading bots)
    const rawAction = data.action || data.order_action || data.signal || data.side || data.type;
    const actionLower = typeof rawAction === 'string' ? rawAction.toLowerCase() : '';
    const isSignal = ['buy', 'sell', 'long', 'short', 'close', 'reverse'].includes(actionLower);

    if (formatReq === 'signal' || isSignal) {
      const normalizedAction = (actionLower === 'long' ? 'buy' : actionLower === 'short' ? 'sell' : actionLower) as 'buy' | 'sell' | 'close' | 'reverse';
      const sym = data.ticker || data.symbol || data.s || options?.symbol || '';
      const price = Number(data.price || data.order_price || data.close || data.p || data.entryPrice || 0) || undefined;
      const amount = Number(data.amount || data.contracts || data.qty || data.order_contracts || data.quantity || 1);
      const tp = Number(data.takeProfit || data.tp || data.take_profit) || undefined;
      const sl = Number(data.stopLoss || data.sl || data.stop_loss) || undefined;

      const signal: WebhookSignalPayload = {
        action: normalizedAction || 'buy',
        symbol: sym,
        price,
        amount,
        type: data.order_type || data.orderType || 'market',
        takeProfit: tp,
        stopLoss: sl,
        orderId: data.orderId || data.id,
        positionId: data.positionId,
        comment: data.comment || data.message || data.msg || data.text,
        ...data
      };

      // Check if payload also contains candle OHLCV data
      let candle: CandleData | undefined;
      const open = Number(data.open || data.o);
      const high = Number(data.high || data.h);
      const low = Number(data.low || data.l);
      const close = Number(data.close || data.c || price);
      const rawTime = Number(data.timestamp || data.time || data.t || Date.now());
      const timestamp = rawTime < 1e11 ? rawTime * 1000 : rawTime;

      if ([open, high, low, close].every(v => typeof v === 'number' && !isNaN(v))) {
        candle = {
          timestamp,
          open,
          high,
          low,
          close,
          volume: Number(data.volume || data.v || 0)
        };
      }

      return {
        success: true,
        formatDetected: (formatReq === 'tradingview' || data.ticker) ? 'tradingview' : 'signal',
        type: 'signal',
        symbol: sym,
        market: options?.market || (sym ? this.detectMarket(sym) : undefined),
        signal,
        candle,
        raw
      };
    }

    // 5. Standard Candle OHLCV format
    const rawTime = Number(data.timestamp ?? data.time ?? data.t ?? data.datetime ?? data.date ?? Date.now());
    const timestamp = rawTime < 1e11 ? rawTime * 1000 : rawTime;
    const open = Number(data.open ?? data.o);
    const high = Number(data.high ?? data.h);
    const low = Number(data.low ?? data.l);
    const close = Number(data.close ?? data.c ?? data.price ?? data.p ?? data.last);
    const volume = Number(data.volume ?? data.v ?? data.vol ?? data.qty ?? 0);
    const sym = data.symbol || data.ticker || data.s || options?.symbol || '';

    if ([open, high, low, close].every(v => typeof v === 'number' && !isNaN(v))) {
      return {
        success: true,
        formatDetected: data.ticker ? 'tradingview' : 'standard',
        type: 'candle',
        symbol: sym,
        market: options?.market || (sym ? this.detectMarket(sym) : undefined),
        candle: { timestamp, open, high, low, close, volume },
        raw
      };
    }

    return {
      success: false,
      formatDetected: formatReq,
      type: 'unknown',
      error: 'Unrecognized webhook payload structure. Expected OHLCV candle, Binance kline, TradingView alert, or trade signal.',
      raw
    };
  }

  /**
   * Helper to parse human-readable signal string e.g. "BUY BTCUSDT price=68500 tp=71000 sl=67000"
   */
  private parsePlainTextSignal(text: string): WebhookSignalPayload | null {
    const upper = text.toUpperCase();
    const actionMatch = upper.match(/\b(BUY|SELL|LONG|SHORT|CLOSE|REVERSE)\b/);
    if (!actionMatch) return null;

    const actionRaw = actionMatch[1];
    const action: 'buy' | 'sell' | 'close' | 'reverse' =
      actionRaw === 'LONG' ? 'buy' : actionRaw === 'SHORT' ? 'sell' : (actionRaw.toLowerCase() as any);

    const words = upper.split(/\s+/).filter(w => !w.includes('=') && w !== actionRaw);
    const symbol = words.find(w => /^[A-Z0-9]{3,12}$/.test(w)) || '';

    const priceMatch = text.match(/(?:price|entry|@|at)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i) ||
      text.match(/\b([0-9]+\.[0-9]+)\b/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : undefined;

    const qtyMatch = text.match(/(?:qty|amount|size|contracts|vol)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i);
    const amount = qtyMatch ? parseFloat(qtyMatch[1]) : 1;

    const tpMatch = text.match(/(?:tp|takeprofit|take_profit)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i);
    const slMatch = text.match(/(?:sl|stoploss|stop_loss)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i);

    return {
      action,
      symbol,
      price,
      amount,
      takeProfit: tpMatch ? parseFloat(tpMatch[1]) : undefined,
      stopLoss: slMatch ? parseFloat(slMatch[1]) : undefined,
      comment: text
    };
  }

  /**
   * Automatically execute or plot a parsed signal on the interactive chart
   */
  private executeSignalOnChart(signal: WebhookSignalPayload): void {
    if (typeof window === 'undefined') return;

    try {
      const posApi = (window as any).tradingPositionApi;
      const chart = (window as any).__active_chart_instance__;
      const lastCandle = chart?.getDataList?.()?.slice(-1)?.[0];
      const execPrice = signal.price ?? lastCandle?.close ?? (window as any).__last_live_price__ ?? 65000;
      const amount = Math.abs(signal.amount || 1);

      if (posApi) {
        if (signal.action === 'buy') {
          posApi.openPosition({
            id: signal.orderId || `sig-${Date.now()}`,
            side: 'long',
            entryPrice: execPrice,
            amount,
            takeProfit: signal.takeProfit,
            stopLoss: signal.stopLoss,
            currency: 'USD'
          });
        } else if (signal.action === 'sell') {
          posApi.openPosition({
            id: signal.orderId || `sig-${Date.now()}`,
            side: 'short',
            entryPrice: execPrice,
            amount,
            takeProfit: signal.takeProfit,
            stopLoss: signal.stopLoss,
            currency: 'USD'
          });
        } else if (signal.action === 'close') {
          posApi.closePosition(signal.positionId || (posApi.getPositions?.()?.[0]?.id || 'all'), execPrice);
        } else if (signal.action === 'reverse') {
          const targetPos = signal.positionId
            ? posApi.getPositions?.()?.find((p: any) => p.id === signal.positionId)
            : posApi.getPositions?.()?.[0];
          if (targetPos) {
            posApi.reversePosition(targetPos.id);
          }
        }
      } else {
        // Fallback: dispatch DOM events
        if (signal.action === 'buy' || signal.action === 'sell') {
          window.dispatchEvent(new CustomEvent('trading:open-position', {
            detail: {
              side: signal.action === 'buy' ? 'long' : 'short',
              entryPrice: execPrice,
              amount,
              takeProfit: signal.takeProfit,
              stopLoss: signal.stopLoss
            }
          }));
        } else if (signal.action === 'close') {
          window.dispatchEvent(new CustomEvent('trading:close-position', {
            detail: { positionId: signal.positionId || 'all', price: execPrice }
          }));
        }
      }
    } catch (e) {
      console.warn('Failed to execute signal on chart:', e);
    }
  }

  // ─── Helpers ───

  private normalizeCandleArray(data: any[]): CandleData[] {
    return data.map(item => {
      if (Array.isArray(item)) {
        // [timestamp, open, high, low, close, volume]
        return {
          timestamp: Number(item[0]),
          open: Number(item[1]),
          high: Number(item[2]),
          low: Number(item[3]),
          close: Number(item[4]),
          volume: Number(item[5] || 0)
        };
      }
      return {
        timestamp: Number(item.timestamp || item.time || item.t),
        open: Number(item.open || item.o),
        high: Number(item.high || item.h),
        low: Number(item.low || item.l),
        close: Number(item.close || item.c),
        volume: Number(item.volume || item.v || 0)
      };
    }).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Expose instance as the public window API
   */
  public bindToWindow(): void {
    if (typeof window === 'undefined') return;

    const api: MarketConnectionApi = {
      getMode: () => this.getMode(),
      setMode: (mode) => this.setMode(mode),
      getSettings: () => this.getSettings(),
      setMarketConfig: (market, config) => this.setMarketConfig(market, config),
      setUnifiedConfig: (config) => this.setUnifiedConfig(config),
      pushTick: (tick) => this.pushTick(tick),
      pushCandles: (candles, symbol, market) => this.pushCandles(candles, symbol, market),
      testConnection: (market) => this.testConnection(market),
      resetDefaults: () => this.resetDefaults(),
      onSettingsChange: (cb) => this.onSettingsChange(cb),
      connectFeed: (options) => this.connectFeed(options),
      disconnectFeed: (market) => this.disconnectFeed(market),
      pushWebhook: (payload, options) => this.pushWebhook(payload, options),
      processWebhook: (payload, options) => this.processWebhook(payload, options),
      onWebhook: (cb) => this.onWebhook(cb)
    };

    (window as any).marketConnectionApi = api;
  }
}

// Global auto-instantiation
export const marketDatafeedManager = MarketDatafeedManager.getInstance();
marketDatafeedManager.bindToWindow();
