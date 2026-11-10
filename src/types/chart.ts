import type { CSSProperties } from 'react';
import type { Period, SymbolInfo as TickerPenSymbolInfo } from '@tickerpen/pro';

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
  [key: string]: any;
}

export type ChartTimeframe =
  | '1s' | '5s' | '15s' | '30s'
  | '1m' | '3m' | '5m' | '15m' | '30m' | '45m'
  | '1h' | '2h' | '3h' | '4h' | '6h' | '8h' | '12h'
  | '1D' | '2D' | '3D' | '1W' | '1M' | '3M' | '6M' | '1Y';

export interface ChartSymbolInfo extends Partial<TickerPenSymbolInfo> {
  ticker: string;
  name?: string;
  shortName?: string;
  exchange?: string;
  market?: string;
  type?: string;
  pricePrecision?: number;
  volumePrecision?: number;
  priceCurrency?: string;
  logo?: string;
}

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'stop' | 'market';
export type PositionSide = 'long' | 'short';

export interface ChartOrder {
  id: string;
  price: number;
  amount: number | string;
  side: OrderSide;
  type?: OrderType;
  label?: string;
  color?: string;
  draggable?: boolean;
  takeProfit?: number;
  stopLoss?: number;
  status?: 'open' | 'pending' | 'filled' | 'cancelled';
  onModify?: (newPrice: number, order: ChartOrder) => void;
  onCancel?: (order: ChartOrder) => void;
}

export interface ChartPosition {
  id: string;
  entryPrice: number;
  amount: number | string;
  side: PositionSide;
  pnl?: number;
  pnlPercentage?: number;
  takeProfit?: number;
  stopLoss?: number;
  color?: string;
  label?: string;
  currency?: string;
  onClose?: (position: ChartPosition) => void;
  onReverse?: (position: ChartPosition) => void;
  onModifyTP?: (tpPrice: number | undefined, position: ChartPosition) => void;
  onModifySL?: (slPrice: number | undefined, position: ChartPosition) => void;
}

export interface ChartExecution {
  id: string;
  timestamp: number;
  price: number;
  amount: number | string;
  side: OrderSide;
  label?: string;
  type?: 'entry' | 'exit' | 'tp' | 'sl';
  linkedTradeId?: string;
  pnl?: number;
}

export interface IChartDatafeed {
  searchSymbols?: (query: string) => Promise<ChartSymbolInfo[]>;
  getHistoryKLineData: (params: {
    symbol: ChartSymbolInfo;
    period: Period;
    from?: number;
    to?: number;
    count?: number;
  }) => Promise<CandleData[]>;
  subscribe: (
    params: { symbol: ChartSymbolInfo; period: Period },
    onTick: (candle: CandleData) => void
  ) => (() => void) | void;
  unsubscribe?: (params: { symbol: ChartSymbolInfo; period: Period }) => void;
}

export type ChartLayout =
  | '1'
  | '2v'
  | '2h'
  | '3v'
  | '3h'
  | '3g'
  | '3g2'
  | '3g3'
  | '3g4'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | '12'
  | (string & {});

export type ChartType =
  | 'candle_solid'
  | 'candle_stroke'
  | 'candle_up_stroke'
  | 'candle_down_stroke'
  | 'ohlc'
  | 'area'
  | 'line'
  | 'heikin_ashi'
  | 'kline';

export interface ChartStylesConfig {
  gridShow?: boolean;
  gridHorizontalShow?: boolean;
  gridVerticalShow?: boolean;
  gridVerticalColor?: string;
  gridVerticalOpacity?: number;
  gridVerticalStyle?: 'solid' | 'dashed' | 'dotted';
  gridHorizontalColor?: string;
  gridHorizontalOpacity?: number;
  gridHorizontalStyle?: 'solid' | 'dashed' | 'dotted';
  candleUpColor?: string;
  candleDownColor?: string;
  candleUpBorderColor?: string;
  candleDownBorderColor?: string;
  candleUpWickColor?: string;
  candleDownWickColor?: string;
  areaLineColor?: string;
  areaFillColor?: string;
  bgType?: 'solid' | 'gradient';
  bgColor?: string;
  bgColor2?: string;
  bgOpacity?: number;
  crosshairShow?: boolean;
  crosshairColor?: string;
  crosshairStyle?: 'solid' | 'dashed' | 'dotted';
  watermarkType?: 'all' | 'none';
  watermarkColor?: string;
  watermarkOpacity?: number;
  [key: string]: any;
}

export interface TradingChartProps {
  /** Symbol ticker to display (e.g. 'BTCUSDT', 'ETHUSDT', 'AAPL') */
  symbol?: string;
  /** Initial timeframe / period (e.g. '1m', '5m', '15m', '1h', '4h', '1D') */
  period?: ChartTimeframe | Period | string;
  /** Visual theme mode */
  theme?: 'dark' | 'light';
  /** Custom datafeed instance to stream custom exchange / broker data */
  datafeed?: IChartDatafeed;
  /** Static candle history array for offline / backtest usage */
  staticData?: CandleData[];
  /** Open trading orders to render interactive limit/stop lines */
  orders?: ChartOrder[];
  /** Open positions to render entry and PnL levels */
  positions?: ChartPosition[];
  /** Trade execution dots to mark on historical candles */
  executions?: ChartExecution[];
  /** Default chart presentation style */
  chartType?: ChartType;
  /** Active indicators (e.g. ['MA', 'EMA', 'VOL', 'RSI', 'MACD', 'BOLL']) */
  indicators?: string[];
  /** Whether the top toolbar / header is visible */
  headerVisible?: boolean;
  /** Whether the left drawing tools sidebar is visible */
  drawingBarVisible?: boolean;
  /** Callback fired when user switches symbol in chart */
  onSymbolChange?: (symbol: string) => void;
  /** Callback fired when user switches timeframe */
  onPeriodChange?: (period: Period | string) => void;
  /** Callback fired when historical data is loaded */
  onDataLoaded?: (data: CandleData[]) => void;
  /** Callback fired on real-time live price ticks */
  onCandleTick?: (candle: CandleData) => void;
  /** Callback fired when user places an order through chart interaction */
  onOrderPlace?: (order: { price: number; side: OrderSide }) => void;
  /** Callback fired when an order price is dragged / modified */
  onOrderModify?: (orderId: string, newPrice: number) => void;
  /** Callback fired when an order cancel button is clicked */
  onOrderCancel?: (orderId: string) => void;
  /** Callback fired when a position close button is clicked */
  onPositionClose?: (positionId: string, position?: ChartPosition) => void;
  /** Callback fired when a position reverse button is clicked */
  onPositionReverse?: (position: ChartPosition) => void;
  /** Callback fired when position Take Profit is dragged, placed, or cancelled */
  onModifyTP?: (tpPrice: number | undefined, position: ChartPosition) => void;
  /** Callback fired when position Stop Loss is dragged, placed, or cancelled */
  onModifySL?: (slPrice: number | undefined, position: ChartPosition) => void;
  /** Custom styling parameters */
  styles?: ChartStylesConfig;
  /** Container CSS style */
  containerStyle?: CSSProperties;
  /** Container CSS class name */
  className?: string;
  /** Multi-chart grid layout mode ('1' | '2v' | '2h' | '3v' | '3h' | '3g' | '3g2' | '3g3' | '3g4' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '12') */
  layout?: ChartLayout;
  /** List of symbols for multi-chart layouts */
  symbols?: string[];
  /** Whether the chart settings modal is enabled */
  settingsModalEnabled?: boolean;
  /** Whether the market connection modal is enabled */
  marketModalEnabled?: boolean;
  /** Callback fired when multi-chart layout changes */
  onLayoutChange?: (layout: string) => void;
  /** Dual-mode market connection configuration (separate per-market or unified gateway) */
  marketConnection?: Partial<import('./marketConnection').MarketConnectionSettings>;
  /** Callback fired when market connection settings change */
  onMarketConnectionChange?: (settings: import('./marketConnection').MarketConnectionSettings) => void;
  /** Webhook ingestion configuration */
  webhookConfig?: {
    autoPlotSignals?: boolean;
    format?: import('./marketConnection').WebhookFormat;
  };
  /** Callback fired whenever a market webhook is ingested and processed */
  onWebhook?: (event: import('./marketConnection').WebhookEvent) => void;
}

export interface TradingChartApi {
  /** Switch current symbol programmatically */
  setSymbol: (symbol: string) => void;
  /** Switch timeframe programmatically */
  setPeriod: (period: ChartTimeframe | Period | string) => void;
  /** Toggle chart visual theme ('dark' | 'light') */
  setTheme: (theme: 'dark' | 'light') => void;
  /** Update / append a new real-time candle bar */
  updateCandle: (candle: CandleData) => void;
  /** Set or replace entire historical candle dataset */
  setCandleData: (candles: CandleData[]) => void;
  /** Add a technical indicator by name (e.g. 'RSI', 'MACD', 'EMA', 'BOLL') */
  addIndicator: (name: string, isStack?: boolean, options?: any) => void;
  /** Remove an active indicator */
  removeIndicator: (nameOrId: string) => void;
  /** Export all user drawings on chart */
  exportDrawings: () => any[];
  /** Import drawings into chart */
  importDrawings: (drawings: any[]) => void;
  /** Clear all active drawings */
  clearDrawings: () => void;
  /** Capture PNG screenshot of chart */
  takeScreenshot: () => Promise<string>;
  /** Get reference to the underlying chart core instance */
  getCoreChart: () => any;
  /** Market Connection API controller (dual-mode separate vs unified) */
  marketConnection?: import('./marketConnection').MarketConnectionApi;
  /** Connect or update a market feed programmatically */
  connectMarketFeed?: (options: import('./marketConnection').MarketFeedConnectOptions) => Promise<{ success: boolean; message: string; pingMs?: number }>;
  /** Disconnect a market feed or unified gateway */
  disconnectMarketFeed?: (market?: import('./marketConnection').MarketCategory | 'unified') => void;
  /** Ingest an incoming webhook payload with auto format detection */
  pushWebhook?: (payload: unknown, options?: import('./marketConnection').WebhookPushOptions) => import('./marketConnection').WebhookProcessResult;
  /** Push a live candle tick into the chart */
  pushTick?: (tick: CandleData & { symbol: string; market?: import('./marketConnection').MarketCategory }) => void;
  /** Push historical candle dataset into the chart */
  pushCandles?: (candles: CandleData[], symbol: string, market?: import('./marketConnection').MarketCategory) => void;
  /** Open the Market Connections & Webhook settings modal */
  openMarketConnectionModal?: () => void;
  /** Open the Chart Settings Modal (Candle styling, Scales, Canvas, Shortcuts) */
  openSettingsModal?: () => void;
  /** Toggle drawing sidebar state */
  toggleDrawingSidebar?: (open?: boolean) => void;
  /** Set layout ('1' | '2v' | '2h' | '3v' | '3h' | '3g' | '3g2' | '3g3' | '3g4' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '12') */
  setLayout?: (layout: ChartLayout) => void;
}
