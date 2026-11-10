// Main Unified Component
export { TradingChart, default } from './TradingChart';

// Modular Components (Can be used separately or as one)
export { default as SideToolPanel } from './components/SideToolPanel';
export { default as ChartSettingsModal } from './components/ChartSettingsModal';
export { MarketConnectionModal } from './components/MarketConnectionModal';
export { default as TickerPenProWidget } from './components/TickerPenProWidget';
export { DrawingDragToolbar } from './components/DrawingDragToolbar';
export { EmojiStickerPicker } from './components/EmojiStickerPicker';
export { TableToolbarAndModal } from './components/TableToolbarAndModal';
export { default as App } from './App';

// Vanilla / Non-React Embedder
export { createTradingChart, type VanillaChartOptions, type VanillaChartInstance } from './vanilla';

// Datafeed Adapters & Market Connection Manager
export * from './datafeed';

// Type Definitions
export * from './types/chart';
export * from './types/marketConnection';

// Theme Manager
export { applyChromeTheme, getSavedChromeThemeMode, setChromeThemeMode } from './utils/themeManager';
