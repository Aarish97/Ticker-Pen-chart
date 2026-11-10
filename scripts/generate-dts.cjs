const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '../dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Read and strip imports from chart.ts and marketConnection.ts
let chartTs = fs.readFileSync(path.resolve(__dirname, '../src/types/chart.ts'), 'utf8');
chartTs = chartTs.replace(/import\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?\r?\n?/g, '');
chartTs = chartTs.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?\r?\n?/g, '');
chartTs = chartTs.replace(/import\s+['"][^'"]*['"];?\r?\n?/g, '');
// replace import('./marketConnection') references
chartTs = chartTs.replace(/import\(['"]\.\/marketConnection['"]\)\.([A-Za-z0-9_]+)/g, '$1');

let marketTs = fs.readFileSync(path.resolve(__dirname, '../src/types/marketConnection.ts'), 'utf8');
marketTs = marketTs.replace(/import\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?\r?\n?/g, '');
marketTs = marketTs.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?\r?\n?/g, '');
marketTs = marketTs.replace(/import\s+['"][^'"]*['"];?\r?\n?/g, '');

const dtsContent = `/**
 * trading-chart TypeScript Type Declarations
 * All-in-one & Modular TradingView-Style Charting Library
 */

import type { CSSProperties, ForwardRefExoticComponent, RefAttributes, FC, ReactNode } from 'react';

// Common Period & Symbol definitions
export type Period = string | { multiplier: number; timespan: string; text?: string };
export interface TickerPenSymbolInfo {
  ticker: string;
  name?: string;
  shortName?: string;
  exchange?: string;
  market?: string;
  priceCurrency?: string;
  type?: string;
  pricePrecision?: number;
  volumePrecision?: number;
  [key: string]: any;
}

${chartTs}

${marketTs}

// ─── Component Declarations ───

/**
 * All-in-One Turnkey TradingChart Component
 */
export declare const TradingChart: ForwardRefExoticComponent<TradingChartProps & RefAttributes<TradingChartApi>>;
export default TradingChart;

/**
 * Standalone Drawing Sidebar / Tool Panel
 */
export interface SideToolPanelProps {
  activeTool?: string;
  onSelectTool?: (tool: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
  style?: CSSProperties;
  [key: string]: any;
}
export declare const SideToolPanel: FC<SideToolPanelProps>;

/**
 * Standalone Chart Settings Modal (Symbol, Status Line, Scales, Canvas, Shortcuts)
 */
export interface ChartSettingsModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  [key: string]: any;
}
export declare const ChartSettingsModal: FC<ChartSettingsModalProps>;

/**
 * Standalone Market Connection & Webhook Modal
 */
export interface MarketConnectionModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  activeMarket?: string;
  onSelectMarket?: (market: string) => void;
  [key: string]: any;
}
export declare const MarketConnectionModal: FC<MarketConnectionModalProps>;

/**
 * Internal Chart Core Widget
 */
export declare const TickerPenProWidget: FC<any>;

/**
 * Drawing Floating Context Toolbar
 */
export declare const DrawingDragToolbar: FC<any>;

/**
 * Emoji / Sticker Picker Dialog
 */
export declare const EmojiStickerPicker: FC<any>;

/**
 * Table Toolbar & Inspector Modal
 */
export declare const TableToolbarAndModal: FC<any>;

/**
 * Standalone Fullscreen Demo App
 */
export declare const App: FC<any>;

// ─── Vanilla JS API ───

export interface VanillaChartOptions extends TradingChartProps {
  container: HTMLElement | string;
}

export interface VanillaChartInstance extends TradingChartApi {
  destroy: () => void;
}

export declare function createTradingChart(options: VanillaChartOptions): VanillaChartInstance;

// ─── Theme Utilities ───

export type ChromeThemeMode = 'dark' | 'light' | 'system';
export declare function applyChromeTheme(mode: ChromeThemeMode): void;
export declare function getSavedChromeThemeMode(): ChromeThemeMode;
export declare function setChromeThemeMode(mode: ChromeThemeMode): void;
`;

fs.writeFileSync(path.join(distDir, 'index.d.ts'), dtsContent);
console.log('Successfully generated self-contained dist/index.d.ts');
