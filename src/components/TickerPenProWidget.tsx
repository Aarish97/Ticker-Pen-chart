import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sidebarIcons, getSidebarIconSvgString, LockbtnIcon, UnlockbtnIcon, DeletebtnIcon } from './SidebarIcons';
import { GripVertical, ChevronDown, ChevronUp, ChevronsUp, ChevronsDown, Check, Copy, Layers, Eye } from 'lucide-react';
import { TickerPenPro, loadLocales, type SymbolInfo, type Period, type DatafeedSubscribeCallback, type Datafeed } from '@tickerpen/pro';
import { dispose, registerIndicator, registerOverlay, utils, registerYAxis, registerXAxis } from 'tickerpen';
import { saveCandlesToIndexedDB } from '../utils/candleIndexedDB';
import { saveDrawingsToIndexedDB, getDrawingsFromIndexedDB, timestampToDataIndex } from '../utils/drawingIndexedDB';
import { getSavedChromeThemeMode, setChromeThemeMode, getEffectiveChromeTheme, type ChromeThemeMode } from '../utils/themeManager';
import { isColorTransparent } from './ColorStylePicker';
import { marketDatafeedManager } from '../datafeed/MarketDatafeedManager';
import type { MarketCategory } from '../types/marketConnection';
import MarketConnectionModal from './MarketConnectionModal';
import { getGlobalActiveDragAnchor } from '../rendering/canvas-utils';
export interface TickerPenData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  turnover?: number;
  _haOpen?: number;
  _haClose?: number;
  _rawOpen?: number;
  _rawHigh?: number;
  _rawLow?: number;
  _rawClose?: number;
  [key: string]: any;
}

// ─── Heikin-Ashi Candle Calculations ───
export function transformToHeikinAshi(rawData: TickerPenData[]): TickerPenData[] {
  if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
    return [];
  }

  const length = rawData.length;
  const haData: TickerPenData[] = new Array(length);

  for (let i = 0; i < length; i++) {
    const cur = rawData[i];
    if (!cur) continue;
    const prevHA = i > 0 ? haData[i - 1] : null;

    const o = Number(cur.open ?? cur.close ?? 0);
    const h = Number(cur.high ?? Math.max(o, Number(cur.close ?? o)));
    const l = Number(cur.low ?? Math.min(o, Number(cur.close ?? o)));
    const c = Number(cur.close ?? o);

    const haClose = (o + h + l + c) / 4;
    const haOpen = prevHA ? (prevHA.open + prevHA.close) / 2 : (o + c) / 2;
    const haHigh = Math.max(h, haOpen, haClose);
    const haLow = Math.min(l, haOpen, haClose);

    const transformedItem: TickerPenData = {
      ...cur,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      _haOpen: haOpen,
      _haClose: haClose,
      _rawOpen: o,
      _rawHigh: h,
      _rawLow: l,
      _rawClose: c
    };

    // Cache computed HA open/close on source object for fast single-tick reference
    try {
      (cur as any)._haOpen = haOpen;
      (cur as any)._haClose = haClose;
    } catch {}

    haData[i] = transformedItem;
  }

  return haData;
}

export function calculateHeikinAshiTick(
  tick: TickerPenData,
  rawHistory: TickerPenData[]
): TickerPenData {
  const o = Number(tick.open);
  const h = Number(tick.high);
  const l = Number(tick.low);
  const c = Number(tick.close);

  if (!rawHistory || rawHistory.length === 0) {
    const haClose = (o + h + l + c) / 4;
    const haOpen = (o + c) / 2;
    return {
      ...tick,
      open: haOpen,
      high: Math.max(h, haOpen, haClose),
      low: Math.min(l, haOpen, haClose),
      close: haClose,
      _haOpen: haOpen,
      _haClose: haClose,
      _rawOpen: o,
      _rawHigh: h,
      _rawLow: l,
      _rawClose: c
    };
  }

  const lastIdx = rawHistory.length - 1;
  const lastBar = rawHistory[lastIdx];

  const prevBarIdx = tick.timestamp === lastBar.timestamp ? lastIdx - 1 : lastIdx;

  if (prevBarIdx < 0) {
    const haClose = (o + h + l + c) / 4;
    const haOpen = (o + c) / 2;
    return {
      ...tick,
      open: haOpen,
      high: Math.max(h, haOpen, haClose),
      low: Math.min(l, haOpen, haClose),
      close: haClose,
      _haOpen: haOpen,
      _haClose: haClose,
      _rawOpen: o,
      _rawHigh: h,
      _rawLow: l,
      _rawClose: c
    };
  }

  const prevBar = rawHistory[prevBarIdx];
  let prevHaOpen = (prevBar as any)._haOpen;
  let prevHaClose = (prevBar as any)._haClose;

  if (typeof prevHaOpen !== 'number' || typeof prevHaClose !== 'number') {
    const haSegment = transformToHeikinAshi(rawHistory.slice(0, prevBarIdx + 1));
    const lastHa = haSegment[haSegment.length - 1];
    prevHaOpen = lastHa.open;
    prevHaClose = lastHa.close;
  }

  const haClose = (o + h + l + c) / 4;
  const haOpen = (prevHaOpen + prevHaClose) / 2;
  const haHigh = Math.max(h, haOpen, haClose);
  const haLow = Math.min(l, haOpen, haClose);

  return {
    ...tick,
    open: haOpen,
    high: haHigh,
    low: haLow,
    close: haClose,
    _haOpen: haOpen,
    _haClose: haClose,
    _rawOpen: o,
    _rawHigh: h,
    _rawLow: l,
    _rawClose: c
  };
}

import { futureTimeScaleOverlay, tickerPenOverlays, registerTickerPenDrawingAdapter, checkAndClosePolyline, dispatchOverlaySettings } from '../ticker-pen-adapter-bridge';
import { registerTALibIndicators } from '../core';
import ColorPicker from './ColorPicker';
import ColorStylePicker from './ColorStylePicker';
import CustomDropdown from './CustomDropdown';
import {
  DEFAULT_FIB_RETRACEMENT_LEVELS,
  FIB_EXTENSION_LEVELS,
  DEFAULT_FIB_TIME_ZONE_LEVELS,
  DEFAULT_FIB_TIME_EXTENSION_LEVELS,
  DEFAULT_FIB_CHANNEL_LEVELS,
  DEFAULT_FIB_CIRCLES_LEVELS,
  DEFAULT_FIB_ARCS_LEVELS,
  DEFAULT_FIB_WEDGE_LEVELS,
  DEFAULT_PITCHFAN_LEVELS,
  DEFAULT_SPEED_FAN_PRICE_LEVELS,
  DEFAULT_SPEED_FAN_TIME_LEVELS,
  DEFAULT_PITCHFORK_LEVELS
} from '../constants/drawingLevels';
import { TableToolbarAndModal } from './TableToolbarAndModal';
import { DrawingDragToolbar } from './DrawingDragToolbar';
import TradingPositionOverlay from './TradingPositionOverlay';
import type { ChartPosition, ChartExecution } from '../types/chart';

const builtInMapping: Record<string, string> = {
  'trend-line': 'straightLine',
  'fib-retracement': 'fibonacciLine',
  'rectangle': 'rect',
  'parallel-channel': 'priceChannelLine',
  'ray': 'rayLine',
  'horizontal-line': 'horizontalStraightLine',
  'vertical-line': 'verticalStraightLine',
  'horizontal-ray': 'horizontalRayLine',
  'andrews-pitchfork': 'parallelStraightLine',
  'schiff-pitchfork': 'schiffPitchfork',
  'modified-schiff-pitchfork': 'modifiedSchiffPitchfork',
  'inside-pitchfork': 'insidePitchfork',
  'pitchfan': 'pitchFan',
  'fib-speed-fan': 'speedFan',
  'text-annotation': 'simpleAnnotation'
};

// Register the full drawing-tool implementation before any Ticker Pen instance
// is created. The Pro toolbar can still be used, while the custom sidebar below
// can now select the ported tools by their original names.
registerTickerPenDrawingAdapter();
registerTALibIndicators();
tickerPenOverlays.forEach((overlay) => {
  registerOverlay(overlay);
  const builtInName = builtInMapping[overlay.name];
  if (builtInName) {
    registerOverlay({
      ...overlay,
      name: builtInName
    });
  }
});
registerOverlay(futureTimeScaleOverlay);

// ─── Currency Conversion System ───
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹', AUD: 'A$', CAD: 'C$', CHF: 'Fr', CNY: '¥', BTC: '₿', ETH: 'Ξ', USDT: '$',
  AED: 'د.إ', AFN: '؋', ALL: 'L', AMD: '֏', ANG: 'ƒ', AOA: 'Kz', ARS: '$', AWG: 'ƒ', AZN: '₼', BAM: 'KM', BBD: '$',
  BDT: '৳', BGN: 'лв', BHD: '.د.ب', BIF: 'FBu', BMD: '$', BND: '$', BOB: '$b', BRL: 'R$', BSD: '$', BTN: 'Nu.',
  BWP: 'P', BYN: 'Br', BZD: 'BZ$', CDF: 'FC', CLP: '$', COP: '$', CRC: '₡', CUP: '₱', CVE: '$', CZK: 'Kč',
  DJF: 'Fdj', DKK: 'kr', DOP: 'RD$', DZD: 'دج', EGP: '£', ERN: 'Nfk', ETB: 'Br', FJD: '$', FKP: '£', GEL: '₾',
  GGP: '£', GHS: 'GH₵', GIP: '£', GMD: 'D', GNF: 'FG', GTQ: 'Q', GYD: '$', HKD: 'HK$', HNL: 'L', HRK: 'kn',
  HTG: 'G', HUF: 'Ft', IDR: 'Rp', ILS: '₪', IMP: '£', IQD: 'ع.د', IRR: '﷼', ISK: 'kr', JEP: '£', JMD: 'J$',
  JOD: 'د.ا', KES: 'KSh', KGS: 'сом', KHR: '៛', KMF: 'CF', KPW: '₩', KRW: '₩', KWD: 'د.ك', KYD: '$', KZT: '₸',
  LAK: '₭', LBP: 'ل.ل', LKR: '₨', LRD: '$', LSL: 'M', LYD: 'ل.د', MAD: 'د.م.', MDL: 'L', MGA: 'Ar', MKD: 'ден',
  MMK: 'K', MNT: '₮', MOP: 'MOP$', MRU: 'UM', MUR: '₨', MVR: '.ރ', MWK: 'MK', MXN: '$', MYR: 'RM', MZN: 'MT',
  NAD: '$', NGN: '₦', NIO: 'C$', NOK: 'kr', NPR: '₨', NZD: '$', OMR: 'ر.ع.', PAB: 'B/.', PEN: 'S/.', PGK: 'K',
  PHP: '₱', PKR: '₨', PLN: 'zł', PYG: '₲', QAR: 'ر.ق', RON: 'lei', RSD: 'دين.', RUB: '₽', RWF: 'FRw', SAR: 'ر.س',
  SBD: '$', SCR: '₨', SDG: 'ج.س.', SEK: 'kr', SGD: 'S$', SHP: '£', SLL: 'Le', SOS: 'S', SRD: '$', SSP: '£',
  STN: 'Db', SYP: '£', SZL: 'L', THB: '฿', TJS: 'ЅМ', TMT: 'T', TND: 'د.ت', TOP: 'T$', TRY: '₺', TTD: 'TT$',
  TWD: 'NT$', TZS: 'TSh', UAH: '₴', UGX: 'USh', UYU: '$U', UZS: 'лв', VES: 'Bs.S', VND: '₫', VUV: 'VT', WST: 'WS$',
  XAF: 'FCFA', XCD: '$', XOF: 'CFA', XPF: '₣', YER: '﷼', ZAR: 'R', ZMW: 'ZK', ZWL: 'Z$'
};

// Supported display currencies with their symbols
const CURRENCY_OPTIONS: { code: string; symbol: string; label: string }[] = [
  { code: 'NATIVE', symbol: '', label: 'Native' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar' },
  { code: 'CHF', symbol: 'Fr', label: 'Swiss Franc' },
  { code: 'CNY', symbol: '¥', label: 'Chinese Yuan' },
  { code: 'BTC', symbol: '₿', label: 'Bitcoin' },
  { code: 'ETH', symbol: 'Ξ', label: 'Ethereum' },
];

// Cached conversion rates relative to USD (USD = 1.0)
let _conversionRatesCache: Record<string, number> = { USD: 1, NATIVE: 1 };
let _ratesFetchedAt = 0;
const RATES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchConversionRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (now - _ratesFetchedAt < RATES_CACHE_TTL && Object.keys(_conversionRatesCache).length > 3) {
    return _conversionRatesCache;
  }

  const rates: Record<string, number> = { USD: 1, NATIVE: 1 };

  // Fetch fiat rates from exchangerate-api (free, no key needed)
  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await resp.json();
    if (data && data.rates) {
      for (const code of Object.keys(data.rates)) {
        rates[code] = data.rates[code];
      }
    }
  } catch (err) {
    console.warn('[CurrencyConversion] Failed to fetch fiat rates:', err);
    // Hardcoded fallbacks
    rates.EUR = rates.EUR || 0.92; rates.GBP = rates.GBP || 0.79;
    rates.JPY = rates.JPY || 149.5; rates.INR = rates.INR || 83.5;
    rates.AUD = rates.AUD || 1.53; rates.CAD = rates.CAD || 1.36;
    rates.CHF = rates.CHF || 0.88; rates.CNY = rates.CNY || 7.24;
  }

  // Fetch crypto rates from Binance
  try {
    const btcData = await binanceFetch('/api/v3/ticker/price?symbol=BTCUSDT');
    if (btcData && btcData.price) {
      rates.BTC = 1 / Number(btcData.price); // 1 USD = X BTC
    }
  } catch { rates.BTC = rates.BTC || 1 / 96000; }

  try {
    const ethData = await binanceFetch('/api/v3/ticker/price?symbol=ETHUSDT');
    if (ethData && ethData.price) {
      rates.ETH = 1 / Number(ethData.price); // 1 USD = X ETH
    }
  } catch { rates.ETH = rates.ETH || 1 / 3200; }

  _conversionRatesCache = rates;
  if (typeof window !== 'undefined') {
    (window as any).__currency_rates__ = rates;
  }
  _ratesFetchedAt = now;
  return rates;
}

// Initialize globals for cross-module access (formatters, adapter bridge)
if (typeof window !== 'undefined') {
  (window as any).__currency_conversion_rate__ = 1;
  (window as any).__currency_symbol__ = '';
  (window as any).__currency_code__ = 'NATIVE';
  (window as any).__currency_rates__ = _conversionRatesCache;
}

// Helper to format custom Y-axis tick labels to match the chart style
// Handles the full spectrum: tiny crypto (0.0{6}847) → normal prices (96,541.01) → market cap (1.80T)
const formatAxisTickText = (val: number, precision: number): string => {
  // Apply currency conversion if active
  const convRate = (typeof window !== 'undefined' && (window as any).__currency_conversion_rate__) || 1;
  if (convRate !== 1) {
    val = val * convRate;
    // Adjust precision for converted currency
    const absConverted = Math.abs(val);
    if (absConverted >= 1000) precision = Math.min(precision, 2);
    else if (absConverted >= 1) precision = Math.min(precision, 4);
    else if (absConverted >= 0.001) precision = Math.max(precision, 6);
    else precision = Math.max(precision, 8);
  }

  const absVal = Math.abs(val);

  // ─── Large value abbreviation (market cap, volume, etc.) ───
  // For values ≥ 1 million, use compact notation: M, B, T
  if (absVal >= 1_000_000_000_000) {
    // Trillions
    const v = val / 1_000_000_000_000;
    return v.toFixed(2) + 'T';
  }
  if (absVal >= 1_000_000_000) {
    // Billions
    const v = val / 1_000_000_000;
    return v.toFixed(2) + 'B';
  }
  if (absVal >= 1_000_000) {
    // Millions
    const v = val / 1_000_000;
    return v.toFixed(2) + 'M';
  }

  // ─── Normal price formatting ───
  let str = val.toFixed(precision);

  // 1. Thousands Separator (apply comma grouping to integer part)
  const parts = str.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  str = parts.join('.');

  // 2. Decimal Folding (apply if there are >= 4 consecutive zeros after decimal point)
  // e.g., 0.00000847 → 0.0{5}847
  const dotIdx = str.indexOf('.');
  if (dotIdx !== -1) {
    const decimals = str.substring(dotIdx + 1);
    const zeroMatch = decimals.match(/^0{4,}/);
    if (zeroMatch) {
      const zeroCount = zeroMatch[0].length;
      const remaining = decimals.substring(zeroCount);
      str = `${str.substring(0, dotIdx)}.0{${zeroCount}}${remaining}`;
    }
  }

  return str;
};

// Overwrite the built-in Y-axis tick calculations to insert intermediate ticks (prices)
// in between every tick, extending across the entire visible range to fill margin gaps.
const createLinearYAxisTicks = (params: any) => {
  const defaultTicks = params.defaultTicks || [];
  if (defaultTicks.length < 2) return defaultTicks;

  // Sort ticks by numeric value ascending
  const sortedTicks = [...defaultTicks].sort((a, b) => Number(a.value) - Number(b.value));

  const val0 = Number(sortedTicks[0].value);
  const val1 = Number(sortedTicks[sortedTicks.length - 1].value);
  const coord0 = sortedTicks[0].coord;
  const coord1 = sortedTicks[sortedTicks.length - 1].coord;

  // Calculate the linear scale conversion ratio
  const ratio = (val1 - val0) !== 0 ? (coord1 - coord0) / (val1 - val0) : 0;

  // Determine the step interval between default ticks
  const defaultInterval = Number(sortedTicks[1].value) - Number(sortedTicks[0].value);
  if (defaultInterval <= 0 || ratio === 0) return defaultTicks;

  // Subdivided interval step (divide the main interval by 2 to place exactly 1 intermediate price tick)
  const step = defaultInterval / 2;

  const precision = (() => {
    const refText = sortedTicks[0].text;
    const dotIdx = refText.indexOf('.');
    return dotIdx !== -1 ? refText.length - dotIdx - 1 : 2;
  })();

  // Robust bounds regardless of Y-axis direction / scale inversion
  const minReal = Math.min(params.range.realFrom, params.range.realTo);
  const maxReal = Math.max(params.range.realFrom, params.range.realTo);
  const startVal = Math.floor((minReal - 2 * step) / step) * step;
  const endVal = Math.ceil((maxReal + 2 * step) / step) * step;

  const newTicks: any[] = [];
  for (let val = startVal; val <= endVal + (step / 10); val += step) {
    const coord = coord0 + (val - val0) * ratio;
    // Filter out ticks that fall outside the physical screen boundaries
    if (coord >= -2 && coord <= params.bounding.height + 2) {
      newTicks.push({
        value: val,
        coord: coord,
        text: formatAxisTickText(val, precision)
      });
    }
  }
  // Never return empty — fall back to library defaults to prevent Y-axis collapse
  return newTicks.length > 0 ? newTicks : defaultTicks;
};

const createLogarithmicYAxisTicks = (params: any) => {
  const defaultTicks = params.defaultTicks || [];
  if (defaultTicks.length < 2) return defaultTicks;

  // Sort ticks by numeric value ascending
  const sortedTicks = [...defaultTicks].sort((a, b) => Number(a.value) - Number(b.value));

  // Ensure all values are positive for log scale
  const firstVal = Number(sortedTicks[0].value);
  const lastVal = Number(sortedTicks[sortedTicks.length - 1].value);
  if (firstVal <= 0 || lastVal <= 0) {
    // Fallback to linear if values are not strictly positive (log is undefined for <= 0)
    return createLinearYAxisTicks(params);
  }

  const val0 = Math.log(firstVal);
  const val1 = Math.log(lastVal);
  const coord0 = sortedTicks[0].coord;
  const coord1 = sortedTicks[sortedTicks.length - 1].coord;

  // Calculate the log scale conversion ratio
  const ratio = (val1 - val0) !== 0 ? (coord1 - coord0) / (val1 - val0) : 0;

  // Determine the step interval in log space between default ticks
  const defaultInterval = Math.log(Number(sortedTicks[1].value)) - Math.log(Number(sortedTicks[0].value));
  if (defaultInterval <= 0 || ratio === 0) return defaultTicks;

  // Subdivided interval step (divide the main interval by 2 to place exactly 1 intermediate price tick)
  const step = defaultInterval / 2;

  const precision = (() => {
    const refText = sortedTicks[0].text;
    const dotIdx = refText.indexOf('.');
    return dotIdx !== -1 ? refText.length - dotIdx - 1 : 2;
  })();

  // Robust bounds regardless of Y-axis direction / scale inversion
  const minReal = Math.min(params.range.realFrom, params.range.realTo);
  const maxReal = Math.max(params.range.realFrom, params.range.realTo);
  const logFrom = Math.log(Math.max(1e-5, minReal));
  const logTo = Math.log(Math.max(1e-5, maxReal));

  const startValLog = Math.floor((logFrom - 2 * step) / step) * step;
  const endValLog = Math.ceil((logTo + 2 * step) / step) * step;

  const newTicks: any[] = [];
  for (let valLog = startValLog; valLog <= endValLog + (step / 10); valLog += step) {
    const val = Math.exp(valLog);
    const coord = coord0 + (valLog - val0) * ratio;
    // Filter out ticks that fall outside the physical screen boundaries
    if (coord >= -2 && coord <= params.bounding.height + 2) {
      newTicks.push({
        value: val,
        coord: coord,
        text: formatAxisTickText(val, precision)
      });
    }
  }
  // Never return empty — fall back to library defaults to prevent Y-axis collapse
  return newTicks.length > 0 ? newTicks : defaultTicks;
};

// Register for all names so it applies to any price scale type selected.
// Keep TickerPen's native minimum span so an auto-scaled price range cannot
// collapse and stretch near-flat candles across the entire pane.
registerYAxis({
  name: 'default',
  createTicks: createLinearYAxisTicks,
  displayValueToText: (value: number, precision: number) => {
    return formatAxisTickText(value, precision);
  }
});

registerYAxis({
  name: 'normal',
  createTicks: createLinearYAxisTicks,
  displayValueToText: (value: number, precision: number) => {
    return formatAxisTickText(value, precision);
  }
});

registerYAxis({
  name: 'logarithm',
  createTicks: createLogarithmicYAxisTicks,
  displayValueToText: (value: number, precision: number) => {
    return formatAxisTickText(value, precision);
  }
});


// ═══════════════════════════════════════════════════════════════════════
// TradingView-style X-axis: calendar-aligned "nice" ticks with smooth
// zoom transitions and hierarchical boundary labels.
// ═══════════════════════════════════════════════════════════════════════



// ── Nice interval table ──
// Clean divisor-based intervals ensuring completely even grid lines.
const NICE_INTERVALS: Array<{ ms: number; unit: 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year'; amount: number }> = [
  { ms: 1_000,            unit: 'second', amount: 1 },
  { ms: 5_000,            unit: 'second', amount: 5 },
  { ms: 10_000,           unit: 'second', amount: 10 },
  { ms: 15_000,           unit: 'second', amount: 15 },
  { ms: 30_000,           unit: 'second', amount: 30 },
  { ms: 60_000,           unit: 'minute', amount: 1 },
  { ms: 2 * 60_000,       unit: 'minute', amount: 2 },
  { ms: 5 * 60_000,       unit: 'minute', amount: 5 },
  { ms: 10 * 60_000,      unit: 'minute', amount: 10 },
  { ms: 15 * 60_000,      unit: 'minute', amount: 15 },
  { ms: 30 * 60_000,      unit: 'minute', amount: 30 },
  { ms: 3600_000,          unit: 'hour',   amount: 1 },
  { ms: 2 * 3600_000,     unit: 'hour',   amount: 2 },
  { ms: 3 * 3600_000,     unit: 'hour',   amount: 3 },
  { ms: 4 * 3600_000,     unit: 'hour',   amount: 4 },
  { ms: 6 * 3600_000,     unit: 'hour',   amount: 6 },
  { ms: 12 * 3600_000,    unit: 'hour',   amount: 12 },
  { ms: 86_400_000,        unit: 'day',    amount: 1 },   // 1 candle/day at max zoom in
  { ms: 2 * 86_400_000,   unit: 'day',    amount: 2 },   // 1, 3, 5, 7, 9...
  { ms: 5 * 86_400_000,   unit: 'day',    amount: 5 },   // 1, 6, 11, 16, 21, 26
  { ms: 10 * 86_400_000,  unit: 'day',    amount: 10 },  // 1, 11, 21
  { ms: 15 * 86_400_000,  unit: 'day',    amount: 15 },  // 1, 15
  { ms: 30 * 86_400_000,  unit: 'month',  amount: 1 },   // Jan, Feb, Mar...
  { ms: 61 * 86_400_000,  unit: 'month',  amount: 2 },   // Jan, Mar, May...
  { ms: 91 * 86_400_000,  unit: 'month',  amount: 3 },   // Q1, Q2, Q3, Q4
  { ms: 182 * 86_400_000, unit: 'month',  amount: 6 },   // Jan, Jul
  { ms: 365 * 86_400_000, unit: 'year',   amount: 1 },   // 2023, 2024, 2025...
  { ms: 730 * 86_400_000, unit: 'year',   amount: 2 },
  { ms: 1825 * 86_400_000, unit: 'year',  amount: 5 },
  { ms: 3650 * 86_400_000, unit: 'year',  amount: 10 },
];

function pickNiceInterval(durationMs: number, targetCount: number) {
  const rawStep = durationMs / targetCount;
  let best = NICE_INTERVALS[0];
  let bestDiff = Infinity;
  for (const iv of NICE_INTERVALS) {
    const diff = Math.abs(iv.ms - rawStep);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = iv;
    }
  }
  return best;
}

function snapToCalendarBoundary(
  ts: number,
  interval: typeof NICE_INTERVALS[0],
  tzOffsetMs: number
): number {
  const local = ts + tzOffsetMs;
  const d = new Date(local);
  const { unit, amount } = interval;

  let snapped: Date;
  switch (unit) {
    case 'second': {
      const s = d.getUTCSeconds();
      d.setUTCSeconds(s - (s % amount), 0);
      snapped = d;
      break;
    }
    case 'minute': {
      const m = d.getUTCMinutes();
      d.setUTCMinutes(m - (m % amount), 0, 0);
      snapped = d;
      break;
    }
    case 'hour': {
      const h = d.getUTCHours();
      d.setUTCHours(h - (h % amount), 0, 0, 0);
      snapped = d;
      break;
    }
    case 'day': {
      d.setUTCHours(0, 0, 0, 0);
      if (amount > 1) {
        const dayOfMonth = d.getUTCDate();
        d.setUTCDate(dayOfMonth - ((dayOfMonth - 1) % amount));
      }
      snapped = d;
      break;
    }
    case 'month': {
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      if (amount > 1) {
        const m = d.getUTCMonth();
        d.setUTCMonth(m - (m % amount));
      }
      snapped = d;
      break;
    }
    case 'year': {
      d.setUTCMonth(0, 1);
      d.setUTCHours(0, 0, 0, 0);
      if (amount > 1) {
        const y = d.getUTCFullYear();
        d.setUTCFullYear(y - (y % amount));
      }
      snapped = d;
      break;
    }
    default:
      snapped = d;
  }

  return snapped.getTime() - tzOffsetMs;
}

function advanceByInterval(
  ts: number,
  interval: typeof NICE_INTERVALS[0],
  tzOffsetMs: number
): number {
  const local = ts + tzOffsetMs;
  const d = new Date(local);
  const { unit, amount } = interval;

  switch (unit) {
    case 'second': d.setUTCSeconds(d.getUTCSeconds() + amount); break;
    case 'minute': d.setUTCMinutes(d.getUTCMinutes() + amount); break;
    case 'hour':   d.setUTCHours(d.getUTCHours() + amount); break;
    case 'day':    d.setUTCDate(d.getUTCDate() + amount); break;
    case 'month':  d.setUTCMonth(d.getUTCMonth() + amount); break;
    case 'year':   d.setUTCFullYear(d.getUTCFullYear() + amount); break;
  }

  return d.getTime() - tzOffsetMs;
}

const tzOffsetCache: Record<string, { offset: number; lastChecked: number }> = {};

function getTzOffsetMs(ts: number): number {
  const tz = (typeof window !== 'undefined' ? (window as any).__custom_timezone__ : undefined) || 'Asia/Kolkata';
  const now = Date.now();
  if (tzOffsetCache[tz] && now - tzOffsetCache[tz].lastChecked < 300_000) {
    return tzOffsetCache[tz].offset;
  }
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false
    });
    const parts = fmt.formatToParts(new Date(ts));
    const pm: Record<string, string> = {};
    for (const p of parts) pm[p.type] = p.value;
    let h = parseInt(pm.hour, 10);
    if (h === 24) h = 0;
    const localAsUtc = Date.UTC(
      parseInt(pm.year, 10),
      parseInt(pm.month, 10) - 1,
      parseInt(pm.day, 10),
      h,
      parseInt(pm.minute, 10),
      parseInt(pm.second, 10)
    );
    const offset = localAsUtc - ts;
    tzOffsetCache[tz] = { offset, lastChecked: now };
    return offset;
  } catch {
    const offset = -new Date(ts).getTimezoneOffset() * 60_000;
    tzOffsetCache[tz] = { offset, lastChecked: now };
    return offset;
  }
}

function getBarIntervalMs(): number {
  let tf: string = '';
  if (typeof window !== 'undefined') {
    tf = (window as any).__current_timeframe__
      || (window as any).__active_period__
      || (window as any).__active_timeframe_text__
      || '';
  }
  if (!tf) {
    try {
      const charts = Array.from((window as any).globalCoreCharts || []);
      for (const chart of charts) {
        const period = (chart as any).getPeriod?.();
        if (period?.text) { tf = period.text; break; }
      }
    } catch { /* ignore */ }
  }
  if (!tf) tf = '15m';
  const match = tf.match(/^(\d+)?([mHDWM])$/i);
  if (!match) return 900_000;
  const mult = parseInt(match[1] || '1', 10);
  const unit = match[2];
  switch (unit) {
    case 'm': return mult * 60_000;
    case 'H': return mult * 3_600_000;
    case 'D': return mult * 86_400_000;
    case 'W': return mult * 7 * 86_400_000;
    case 'M': return mult * 30 * 86_400_000;
    default:  return 900_000;
  }
}

function piecewiseInterpolateCoord(
  ts: number,
  sortedDefaults: Array<{ coord: number; value: number }>
): number {
  if (sortedDefaults.length === 0) return 0;
  if (sortedDefaults.length === 1) return sortedDefaults[0].coord;

  const firstVal = Number(sortedDefaults[0].value);
  const lastIdx = sortedDefaults.length - 1;
  const lastVal = Number(sortedDefaults[lastIdx].value);

  if (ts <= firstVal) {
    const v0 = firstVal;
    const v1 = Number(sortedDefaults[1].value);
    const c0 = sortedDefaults[0].coord;
    const c1 = sortedDefaults[1].coord;
    if (v1 === v0) return c0;
    return c0 + (ts - v0) * (c1 - c0) / (v1 - v0);
  }

  if (ts >= lastVal) {
    const v0 = Number(sortedDefaults[lastIdx - 1].value);
    const v1 = lastVal;
    const c0 = sortedDefaults[lastIdx - 1].coord;
    const c1 = sortedDefaults[lastIdx].coord;
    if (v1 === v0) return c1;
    return c1 + (ts - v1) * (c1 - c0) / (v1 - v0);
  }

  for (let i = 0; i < lastIdx; i++) {
    const v0 = Number(sortedDefaults[i].value);
    const v1 = Number(sortedDefaults[i + 1].value);
    if (ts >= v0 && ts <= v1) {
      const c0 = sortedDefaults[i].coord;
      const c1 = sortedDefaults[i + 1].coord;
      if (v1 === v0) return c0;
      return c0 + (ts - v0) * (c1 - c0) / (v1 - v0);
    }
  }

  return sortedDefaults[0].coord;
}

registerXAxis({
  name: 'normal',
  createTicks: (params) => {
    return params.defaultTicks || [];
  }
});

// Global reference of all core chart instances captured via Map prototype hijack
const globalCoreCharts = new Set<any>();
(window as any).globalCoreCharts = globalCoreCharts;

// One page size for the initial chart load and every historical continuation.
const HISTORY_PAGE_SIZE = 500;

// ═══════════════════════════════════════════════════════════════════════
// DIAGNOSTIC UTILITIES & SESSION LOGS
// ═══════════════════════════════════════════════════════════════════════
(window as any).__chart_log_buffer__ = [];
(window as any).__chartDebug__ = false;

(window as any).__addChartLog__ = (msg: string) => {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${msg}`;
  (window as any).__chart_log_buffer__.push(entry);
  if ((window as any).__chart_log_buffer__.length > 3000) {
    (window as any).__chart_log_buffer__.shift();
  }
  if ((window as any).__chartDebug__) {
    console.log(`%c[ChartLog] ${entry}`, 'color: #9c27b0');
  }
};

const logDiagnostic = (msg: string, ...args: any[]) => {
  const formattedArgs = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  const fullMsg = `${msg} ${formattedArgs}`.trim();
  if (typeof (window as any).__addChartLog__ === 'function') {
    (window as any).__addChartLog__(fullMsg);
  }
  console.log(`[TickerPen Log] ${fullMsg}`);
};

(window as any).__downloadChartLogs__ = () => {
  const logs = [...((window as any).__chart_log_buffer__ || [])];

  // Append current diagnostic state snapshot to the end of the file
  logs.push('\n=== CURRENT DIAGNOSTIC STATE ===');
  const charts = Array.from(globalCoreCharts);
  logs.push(`Detected ${charts.length} chart instances.\n`);

  charts.forEach((chart: any, i: number) => {
    try {
      const chartStore = typeof chart.getChartStore === 'function' ? chart.getChartStore() : chart._chartStore;
      const ts = typeof chartStore?.getTimeScaleStore === 'function' ? chartStore.getTimeScaleStore() : chartStore?._timeScaleStore;
      const dataList = typeof chart.getDataList === 'function' ? chart.getDataList() : [];
      const visibleRange = ts ? (typeof ts.getVisibleRange === 'function' ? ts.getVisibleRange() : ts._visibleRange) : null;
      const barSpace = ts ? ts._barSpace : '??';
      const barCount = ts ? (typeof ts.getLastBarRightSideDiffBarCount === 'function' ? ts.getLastBarRightSideDiffBarCount() : ts._lastBarRightSideDiffBarCount) : '??';
      const totalBarSpace = ts ? ts._totalBarSpace : '??';
      const visibleDataLen = ts ? (ts._visibleRangeDataList?.length ?? '??') : '??';
      const container = typeof chart.getContainer === 'function' ? chart.getContainer() : null;
      const containerSize = container ? `${container.clientWidth}x${container.clientHeight}` : '??';
      const panes = chart._drawPanes || [];
      const isInDOM = container ? document.body.contains(container) : false;

      logs.push(`Chart #${i} State:`);
      logs.push(`  Container Size: ${containerSize}`);
      logs.push(`  Is In DOM: ${isInDOM}`);
      logs.push(`  Data Length: ${dataList.length}`);
      logs.push(`  Bar Space: ${barSpace}`);
      logs.push(`  Total Bar Space: ${totalBarSpace}`);
      logs.push(`  Last Bar Right Side Diff Bar Count: ${barCount}`);
      logs.push(`  User Panned Bar Count: ${chart.__user_panned_bar_count__}`);
      logs.push(`  Pane Count: ${panes.length}`);
      if (visibleRange) {
        logs.push(`  Visible Range: from=${visibleRange.from}, to=${visibleRange.to}, realFrom=${visibleRange.realFrom}, realTo=${visibleRange.realTo}`);
      } else {
        logs.push(`  Visible Range: null`);
      }
      logs.push(`  Visible Data List Length: ${visibleDataLen}`);

      const problems: string[] = [];
      if (visibleDataLen === 0) problems.push('_visibleRangeDataList is EMPTY — candles will NOT render');
      if (visibleRange && visibleRange.realFrom >= visibleRange.realTo) problems.push('realFrom >= realTo — no data in range');
      if (visibleRange && visibleRange.realTo > dataList.length) problems.push('realTo exceeds data length');
      if (barSpace <= 0) problems.push('barSpace is zero or negative');
      if (container && !isInDOM) problems.push('Chart container is NOT in DOM (stale)');
      if (panes.length === 0) problems.push('No draw panes');

      if (problems.length > 0) {
        logs.push('  Problems:');
        problems.forEach(p => logs.push(`    - ${p}`));
      } else {
        logs.push('  Problems: None');
      }
      logs.push('');
    } catch (e: any) {
      logs.push(`  Chart #${i} Inspection Failed: ${e.message}\n`);
    }
  });

  const blob = new Blob([logs.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trading-chart-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

(window as any).__dumpChartState__ = () => {
  const charts = Array.from(globalCoreCharts);
  console.group(`%c[ChartDiag] ${charts.length} chart instance(s)`, 'color: #00bcd4; font-weight: bold');
  charts.forEach((chart: any, i: number) => {
    try {
      const chartStore = typeof chart.getChartStore === 'function' ? chart.getChartStore() : chart._chartStore;
      const ts = typeof chartStore?.getTimeScaleStore === 'function' ? chartStore.getTimeScaleStore() : chartStore?._timeScaleStore;
      const dataList = typeof chart.getDataList === 'function' ? chart.getDataList() : [];
      const visibleRange = ts ? (typeof ts.getVisibleRange === 'function' ? ts.getVisibleRange() : ts._visibleRange) : null;
      const barSpace = ts ? ts._barSpace : '??';
      const barCount = ts ? (typeof ts.getLastBarRightSideDiffBarCount === 'function' ? ts.getLastBarRightSideDiffBarCount() : ts._lastBarRightSideDiffBarCount) : '??';
      const totalBarSpace = ts ? ts._totalBarSpace : '??';
      const visibleDataLen = ts ? (ts._visibleRangeDataList?.length ?? '??') : '??';
      const container = typeof chart.getContainer === 'function' ? chart.getContainer() : null;
      const containerSize = container ? `${container.clientWidth}x${container.clientHeight}` : '??';
      const panes = chart._drawPanes || [];

      console.group(`%cChart #${i}`, 'color: #ff9800; font-weight: bold');
      console.table({
        'Container Size': containerSize,
        'Data Length': dataList.length,
        'Bar Space': barSpace,
        'Total Bar Space': totalBarSpace,
        'Last Bar Right Side Diff': barCount,
        'Visible Range': visibleRange ? `from:${visibleRange.from} to:${visibleRange.to} realFrom:${visibleRange.realFrom} realTo:${visibleRange.realTo}` : 'null',
        'Visible Data List Length': visibleDataLen,
        'Pane Count': panes.length,
        'User Panned Bar Count': chart.__user_panned_bar_count__ ?? 'undefined',
        'Is In DOM': container ? document.body.contains(container) : false,
      });

      // Check for problems
      const problems: string[] = [];
      if (visibleDataLen === 0) problems.push('⚠️ _visibleRangeDataList is EMPTY — candles will NOT render');
      if (visibleRange && visibleRange.realFrom >= visibleRange.realTo) problems.push('⚠️ realFrom >= realTo — no data in range');
      if (visibleRange && visibleRange.realTo > dataList.length) problems.push('⚠️ realTo exceeds data length');
      if (barSpace <= 0) problems.push('⚠️ barSpace is zero or negative');
      if (container && !document.body.contains(container)) problems.push('⚠️ Chart container is NOT in DOM (stale)');
      if (panes.length === 0) problems.push('⚠️ No draw panes');

      if (problems.length > 0) {
        console.warn(`%cPROBLEMS FOUND:`, 'color: #f44336; font-weight: bold');
        problems.forEach(p => console.warn(`  ${p}`));
      } else {
        console.log('%c✓ No obvious problems detected', 'color: #4caf50');
      }
      console.groupEnd();
    } catch (e) {
      console.error(`Chart #${i} inspection failed:`, e);
    }
  });
  console.groupEnd();
};

const originalMapSet = Map.prototype.set;
Map.prototype.set = function (key, value) {
  if (value && typeof value === 'object' && typeof value.subscribeAction === 'function' && typeof value.getDataList === 'function') {
    globalCoreCharts.add(value);
    try {
      window.dispatchEvent(new CustomEvent('core-chart-created', { detail: value }));
    } catch (e) { }

    // Hijack removeOverlay immediately on every chart instance creation
    try {
      if (value.removeOverlay && !value.__is_remove_overlay_hijacked__) {
        value.__is_remove_overlay_hijacked__ = true;
        const origRemoveOverlay = value.removeOverlay;
        value.removeOverlay = function (options: any) {
          let deletedId = "";
          if (typeof options === 'string') {
            deletedId = options;
          } else if (options && typeof options.id === 'string') {
            deletedId = options.id;
          }

          if (deletedId) {
            window.dispatchEvent(new CustomEvent('close-text-settings', { detail: { overlayId: deletedId } }));
            window.dispatchEvent(new CustomEvent('close-fib-settings', { detail: { overlayId: deletedId } }));
            window.dispatchEvent(new CustomEvent('close-position-settings', { detail: { overlayId: deletedId } }));
            window.dispatchEvent(new CustomEvent('close-table-toolbar', { detail: { overlayId: deletedId } }));
          } else {
            window.dispatchEvent(new CustomEvent('close-text-settings', { detail: {} }));
            window.dispatchEvent(new CustomEvent('close-fib-settings', { detail: {} }));
            window.dispatchEvent(new CustomEvent('close-position-settings', { detail: {} }));
            window.dispatchEvent(new CustomEvent('close-table-toolbar', { detail: {} }));
          }
          const res = origRemoveOverlay.apply(this, arguments as any);
          setTimeout(() => window.dispatchEvent(new CustomEvent('save-history-state')), 50);
          return res;
        };
      }
    } catch (e) { }

    // Helper to lock offset after data loads (applyNewData/applyMoreData only).
    // Uses _lastBarRightSideDiffBarCount (barCount) instead of _offsetRightDistance (pixels)
    // to stay in sync with TickerPen's internal offset tracking.
    // NOTE: Bar count is stored per-chart-instance (on chartInstance.__user_panned_bar_count__)
    // to prevent cross-chart viewport contamination in multi-layout mode.
    const restoreHistoricalBarCountIfNeeded = (chartInstance: any) => {
      try {
        if (chartInstance?.__zoom_animating__ || chartInstance?._chartApi?.__zoom_animating__) {
          // Safety timeout fallback: if animation is stuck for more than 1.5 seconds, auto-clear the flag
          const animTime = chartInstance?.__zoom_animating_time__ || chartInstance?._chartApi?.__zoom_animating_time__ || 0;
          if (Date.now() - animTime > 1500) {
            if (chartInstance) chartInstance.__zoom_animating__ = false;
            if (chartInstance?._chartApi) chartInstance._chartApi.__zoom_animating__ = false;
          } else {
            return;
          }
        }
        const cachedBarCount = chartInstance?.__user_panned_bar_count__;
        const chartStore = typeof chartInstance.getChartStore === 'function' ? chartInstance.getChartStore() : chartInstance._chartStore;
        if (chartStore) {
          const timeScaleStore = typeof chartStore.getTimeScaleStore === 'function' ? chartStore.getTimeScaleStore() : chartStore._timeScaleStore;
          if (timeScaleStore && typeof timeScaleStore.setLastBarRightSideDiffBarCount === 'function') {
            const globalStyles = (typeof window !== 'undefined' ? (window as any).__chart_styles__ : null) || {};
            const targetBarCount = cachedBarCount !== undefined ? cachedBarCount : (globalStyles.marginRight !== undefined ? globalStyles.marginRight : 10);
            timeScaleStore.setLastBarRightSideDiffBarCount(targetBarCount);
            if (typeof timeScaleStore._adjustVisibleRange === 'function') {
              timeScaleStore._adjustVisibleRange();
            }
          }
        }
      } catch (e) { }
    };

    // Hijack updateData
    try {
      const chartProto = value ? Object.getPrototypeOf(value) : null;
      const targetObj = (chartProto && typeof chartProto.updateData === 'function') ? chartProto : (typeof value.updateData === 'function' ? value : null);
      if (targetObj && !targetObj.__is_update_data_hijacked__) {
        targetObj.__is_update_data_hijacked__ = true;
        const origUpdateData = targetObj.updateData;
        targetObj.updateData = function () {
          // TickerPen natively handles offset stability during updateData
          // (it adjusts _lastBarRightSideDiffBarCount when new candles are added).
          // No restore needed here — restoring was CAUSING the snap-back.
          const chartStore = typeof this.getChartStore === 'function' ? this.getChartStore() : this._chartStore;
          const timeScaleStore = typeof chartStore?.getTimeScaleStore === 'function' ? chartStore.getTimeScaleStore() : chartStore?._timeScaleStore;
          const dataCount = typeof this.getDataList === 'function' ? this.getDataList().length : 0;
          const visibleRange = typeof timeScaleStore?.getVisibleRange === 'function' ? timeScaleStore.getVisibleRange() : null;
          const wasPannedBack = !!visibleRange && dataCount > 0 && visibleRange.to < dataCount - 1;
          const barCount = wasPannedBack && typeof timeScaleStore?.getLastBarRightSideDiffBarCount === 'function'
            ? timeScaleStore.getLastBarRightSideDiffBarCount()
            : undefined;
          const result = origUpdateData.apply(this, arguments as any);
          if (barCount !== undefined && typeof timeScaleStore?.setLastBarRightSideDiffBarCount === 'function') {
            timeScaleStore.setLastBarRightSideDiffBarCount(barCount);
            if (typeof timeScaleStore._adjustVisibleRange === 'function') timeScaleStore._adjustVisibleRange();
            this.__user_panned_bar_count__ = barCount;
          }
          return result;
        };
      }
    } catch (e) { }

    // Hijack applyNewData
    try {
      const chartProto = value ? Object.getPrototypeOf(value) : null;
      const targetObj = (chartProto && typeof chartProto.applyNewData === 'function') ? chartProto : (typeof value.applyNewData === 'function' ? value : null);
      if (targetObj && !targetObj.__is_apply_new_data_hijacked__) {
        targetObj.__is_apply_new_data_hijacked__ = true;
        const origApplyNewData = targetObj.applyNewData;
        targetObj.applyNewData = function () {
          const targetTimestamp = this.__target_historical_timestamp__;
          const res = origApplyNewData.apply(this, arguments as any);
          // applyNewData resets the library's page flags. A timeframe switch
          // may intentionally load a historical window, so retain both edges
          // as pageable until each endpoint is actually exhausted.
          try {
            const freshStore = typeof this.getChartStore === 'function' ? this.getChartStore() : this._chartStore;
            if (freshStore?._dataLoadMore) {
              freshStore._dataLoadMore.forward = true;
              freshStore._dataLoadMore.backward = true;
            }
            const freshTimeScale = typeof freshStore?.getTimeScaleStore === 'function'
              ? freshStore.getTimeScaleStore()
              : freshStore?._timeScaleStore;
            if (freshTimeScale) freshTimeScale.__has_more_historical_candles__ = true;
          } catch (e) { }

          if (targetTimestamp !== null && targetTimestamp !== undefined && !isNaN(targetTimestamp)) {
            try {
              const dataList = typeof this.getDataList === 'function' ? this.getDataList() : [];
              const chartStore = typeof this.getChartStore === 'function' ? this.getChartStore() : this._chartStore;
              const timeScaleStore = typeof chartStore?.getTimeScaleStore === 'function' ? chartStore.getTimeScaleStore() : chartStore?._timeScaleStore;
              if (dataList.length > 0 && timeScaleStore) {
                // Find candle in the new timeframe's dataList closest to targetTimestamp
                let closestIdx = -1;
                let minDiff = Infinity;
                for (let i = 0; i < dataList.length; i++) {
                  const diff = Math.abs(Number(dataList[i].timestamp) - targetTimestamp);
                  if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = i;
                  }
                }

                if (closestIdx >= 0) {
                  const visibleRange = typeof timeScaleStore.getVisibleRange === 'function' ? timeScaleStore.getVisibleRange() : null;
                  const visibleBars = visibleRange && typeof visibleRange.from === 'number' && typeof visibleRange.to === 'number'
                    ? Math.max(10, visibleRange.to - visibleRange.from)
                    : 50;
                  const newTo = Math.min(dataList.length - 1, closestIdx + Math.round(visibleBars / 2));
                  const newBarCount = newTo - (dataList.length - 1);
                  if (typeof timeScaleStore.setLastBarRightSideDiffBarCount === 'function') {
                    timeScaleStore.setLastBarRightSideDiffBarCount(newBarCount);
                  } else {
                    timeScaleStore._lastBarRightSideDiffBarCount = newBarCount;
                  }
                  this.__user_panned_bar_count__ = newBarCount;
                  if (typeof timeScaleStore._adjustVisibleRange === 'function') {
                    timeScaleStore._adjustVisibleRange();
                  }
                  if (typeof this.updatePane === 'function') {
                    this.updatePane(1);
                  }
                }
              }
            } catch (e) {
              console.warn('Failed to restore historical timestamp on applyNewData:', e);
            }
          } else {
            restoreHistoricalBarCountIfNeeded(this);
          }
          return res;
        };
      }
    } catch (e) { }

    // Hijack applyMoreData
    try {
      const chartProto = value ? Object.getPrototypeOf(value) : null;
      const targetObj = (chartProto && typeof chartProto.applyMoreData === 'function') ? chartProto : (typeof value.applyMoreData === 'function' ? value : null);
      if (targetObj && !targetObj.__is_apply_more_data_hijacked__) {
        targetObj.__is_apply_more_data_hijacked__ = true;
        const origApplyMoreData = targetObj.applyMoreData;
        targetObj.applyMoreData = function () {
          const res = origApplyMoreData.apply(this, arguments as any);
          restoreHistoricalBarCountIfNeeded(this);
          return res;
        };
      }
    } catch (e) { }

    // Hijack resize to prevent chart resize calls from resetting historical scroll position
    try {
      const chartProto = value ? Object.getPrototypeOf(value) : null;
      const targetObj = (chartProto && typeof chartProto.resize === 'function') ? chartProto : (typeof value.resize === 'function' ? value : null);
      if (targetObj && !targetObj.__is_resize_hijacked__) {
        targetObj.__is_resize_hijacked__ = true;
        const origResize = targetObj.resize;
        targetObj.resize = function () {
          try {
            const chartStore = typeof this.getChartStore === 'function' ? this.getChartStore() : this._chartStore;
            if (chartStore) {
              const timeScaleStore = typeof chartStore.getTimeScaleStore === 'function' ? chartStore.getTimeScaleStore() : chartStore._timeScaleStore;
              if (timeScaleStore) {
                const dataList = typeof this.getDataList === 'function' ? this.getDataList() : [];
                const visibleRange = typeof timeScaleStore.getVisibleRange === 'function' ? timeScaleStore.getVisibleRange() : null;
                const isPannedBack = visibleRange && typeof visibleRange.to === 'number' && dataList.length > 0 && (visibleRange.to < dataList.length - 2);
                // Pixel offsets clamp historical (negative) positions to zero.
                // The native bar count is the only stable viewport value.
                const currentBarCount = typeof timeScaleStore.getLastBarRightSideDiffBarCount === 'function'
                  ? timeScaleStore.getLastBarRightSideDiffBarCount()
                  : undefined;

                const res = origResize.apply(this, arguments as any);

                if (isPannedBack && currentBarCount !== undefined) {
                  if (typeof timeScaleStore.setLastBarRightSideDiffBarCount === 'function') {
                    timeScaleStore.setLastBarRightSideDiffBarCount(currentBarCount);
                  }
                  if (typeof timeScaleStore._adjustVisibleRange === 'function') {
                    timeScaleStore._adjustVisibleRange();
                  }
                  this.__user_panned_bar_count__ = currentBarCount;
                }
                return res;
              }
            }
          } catch (e) { }
          return origResize.apply(this, arguments as any);
        };
      }
    } catch (e) { }

    // Hijack TimeScaleStore getBarSpace immediately upon core chart creation
    try {
      const chartStore = typeof value.getChartStore === 'function' ? value.getChartStore() : value._chartStore;
      if (chartStore) {
        const timeScaleStore = typeof chartStore.getTimeScaleStore === 'function' ? chartStore.getTimeScaleStore() : chartStore._timeScaleStore;
        if (timeScaleStore) {
          // Preserve the native bar-space object. Its gap values are used by
          // both candle placement and X-axis tick positioning.
          const TimeScaleStoreProto = Object.getPrototypeOf(timeScaleStore);

          if (TimeScaleStoreProto && !TimeScaleStoreProto.__is_offset_hijacked__) {
            TimeScaleStoreProto.__is_offset_hijacked__ = true;
            const originalSetOffset = TimeScaleStoreProto.setOffsetRightDistance;
            TimeScaleStoreProto.setOffsetRightDistance = function (distance: number, animation: any) {
              try {
                // Enforce left-edge limit: live candle cannot exceed the left margin of the chart
                const totalBarSpace = this._totalBarSpace || 800;
                if (distance > totalBarSpace) {
                  distance = totalBarSpace;
                }
              } catch (e) { }
              return originalSetOffset.call(this, distance, animation);
            };
          }

          // Hijack _adjustVisibleRange (the INTERNAL method TickerPen calls during scroll/zoom/data updates)
          // to enforce max offsets and left-margin clamping. No offset restoration — TickerPen handles it natively.
          if (TimeScaleStoreProto && !TimeScaleStoreProto.__is_adjust_range_hijacked__) {
            TimeScaleStoreProto.__is_adjust_range_hijacked__ = true;
            const origInternalAdjust = TimeScaleStoreProto._adjustVisibleRange;
            if (typeof origInternalAdjust === 'function') {
              TimeScaleStoreProto._adjustVisibleRange = function () {
                try {
                  // Ensure large max offsets so TickerPen doesn't clamp our scroll range
                  if (this._scrollLimitRole === 'distance') {
                    if (this._maxOffsetDistance) {
                      this._maxOffsetDistance.right = 999999;
                      this._maxOffsetDistance.left = 999999;
                    }
                  } else {
                    this._minVisibleBarCount = this._minVisibleBarCount || {};
                    this._minVisibleBarCount.left = 1;
                    this._minVisibleBarCount.right = 1;
                  }

                  // Enforce left-edge clamp: live candle cannot pass the left margin
                  const totalBarSpace = this._totalBarSpace || 800;
                  const barSpace = this._barSpace || 6;
                  const maxBarCount = totalBarSpace / barSpace;
                  if (this._lastBarRightSideDiffBarCount > maxBarCount) {
                    this._lastBarRightSideDiffBarCount = maxBarCount;
                  }
                } catch (e) { }

                return origInternalAdjust.apply(this, arguments as any);
              };
            }
          }

          // Hijack OverlayView.prototype.drawImp to draw hovered overlay LAST (on top of other overlay labels)
          // Live price label and crosshair label are drawn AFTER overlays in YAxisWidget.updateOverlay/XAxisWidget.updateOverlay,
          // so they always remain on top.
          const OverlayViewProto = Object.getPrototypeOf(Object.getPrototypeOf(timeScaleStore));
          // We need to find the OverlayView prototype via the actual overlay views.
          // Instead, we'll do it after the chart is fully initialized by accessing overlayViews from panes.
          // For now, set a flag so we can do it once from the chart instance.
          if (!(window as any).__overlay_draw_order_hijacked__) {
            (window as any).__overlay_draw_order_hijacked__ = true;
            // Deferred hijack: after chart renders, find the OverlayView prototype and hijack drawImp
            setTimeout(() => {
              try {
                const charts = Array.from((window as any).globalCoreCharts || []);
                for (const chart of charts) {
                  const c = chart as any;
                  // Access the candle pane's overlay views to get the OverlayView prototype
                  const panes = c._paneList || c._panes || [];
                  for (const pane of panes) {
                    const yAxisWidget = pane._yAxisWidget || pane._rightYAxisWidget;
                    if (yAxisWidget && yAxisWidget._overlayYAxisView) {
                      const overlayViewProto = Object.getPrototypeOf(yAxisWidget._overlayYAxisView);
                      // Walk up the prototype chain to find drawImp on OverlayView
                      let proto = overlayViewProto;
                      while (proto && !proto.hasOwnProperty('drawImp') && proto !== Object.prototype) {
                        proto = Object.getPrototypeOf(proto);
                      }
                      if (proto && typeof proto.drawImp === 'function' && !proto.__is_draw_order_hijacked__) {
                        proto.__is_draw_order_hijacked__ = true;
                        const origDrawImp = proto.drawImp;
                        proto.drawImp = function (ctx: any) {
                          try {
                            const completeOverlays = this.getCompleteOverlays();
                            const chartStore = this.getWidget().getPane().getChart().getChartStore();
                            const hoverInfo = chartStore.getHoverOverlayInfo();
                            const hoveredId = hoverInfo?.overlay?.id;

                            // Separate hovered overlay from the rest
                            const nonHovered: any[] = [];
                            let hoveredOverlay: any = null;

                            if (completeOverlays && hoveredId) {
                              completeOverlays.forEach((overlay: any) => {
                                if (overlay.visible) {
                                  if (overlay.id === hoveredId) {
                                    hoveredOverlay = overlay;
                                  } else {
                                    nonHovered.push(overlay);
                                  }
                                }
                              });
                            }

                            if (hoveredOverlay) {
                              // Draw non-hovered overlays first
                              nonHovered.forEach((overlay: any) => {
                                this._drawOverlay(ctx, overlay);
                              });
                              // Draw progress overlay
                              const progressOverlay = this.getProgressOverlay();
                              if (progressOverlay && progressOverlay.visible) {
                                this._drawOverlay(ctx, progressOverlay);
                              }
                              // Draw hovered overlay LAST (on top)
                              this._drawOverlay(ctx, hoveredOverlay);
                              return;
                            }
                          } catch (e) { }
                          // Fallback to original draw order
                          return origDrawImp.call(this, ctx);
                        };
                      }
                      break; // Only need to hijack once
                    }
                  }
                  break; // Only need one chart
                }
              } catch (e) { }
            }, 500);
          }

          if (chartStore) {
            if (typeof chartStore.getDataList !== 'function') {
              chartStore.getDataList = function () {
                return this._dataList || [];
              };
            }
            if (typeof chartStore.getPeriod !== 'function') {
              chartStore.getPeriod = function () {
                return this._period;
              };
            }
            if (typeof chartStore.getVisibleRangeDataList !== 'function') {
              chartStore.getVisibleRangeDataList = function () {
                return this._visibleRangeDataList || [];
              };
            }
            if (typeof chartStore.getVisibleRangeHighLowPrice !== 'function') {
              chartStore.getVisibleRangeHighLowPrice = function () {
                return this._visibleRangeHighLowPrice || [{ price: -Infinity, x: 0 }, { price: Infinity, x: 0 }];
              };
            }
            if (typeof chartStore._addData !== 'function') {
              chartStore._addData = function (this: any, data: any, type: any, more: any) {
                if (Array.isArray(data)) {
                  if (type === 'init') {
                    this._dataList = data;
                  } else if (type === 'forward') {
                    this._dataList = data.concat(this._dataList);
                  } else if (type === 'backward') {
                    this._dataList = this._dataList.concat(data);
                  }
                }
                if (typeof this._adjustVisibleRange === 'function') {
                  this._adjustVisibleRange();
                }
                if (this._chart && typeof this._chart.layout === 'function') {
                  this._chart.layout({ update: true });
                }
              };
            }
          }

          if (!timeScaleStore.__is_instance_hijacked__) {
            timeScaleStore.__is_instance_hijacked__ = true;
            const originalGetBarSpaceInstance = timeScaleStore.getBarSpace;
            timeScaleStore.getBarSpace = function () {
              const bs = originalGetBarSpaceInstance.call(this);
              const newGapBar = Math.max(1, Math.round(bs.bar * 0.68));
              return {
                bar: bs.bar,
                halfBar: bs.bar / 2,
                gapBar: newGapBar,
                halfGapBar: newGapBar / 2
              };
            };
          }
        }
      }
    } catch (e) {
      console.warn('Failed to hijack getBarSpace on creation:', e);
    }
  }
  return originalMapSet.apply(this, arguments as any);
};

// Custom Date Formatter based on the selected TradingView pattern and timezone
const weekdaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getTzParts(timestamp: number, timezone?: string) {
  if (isNaN(timestamp)) {
    return { y: 1970, m: 0, d: 1, hour: 0, minute: 0, second: 0, weekday: 'Thu' };
  }
  try {
    const offset = getTzOffsetMs(timestamp);
    const localDate = new Date(timestamp + offset);
    return {
      y: localDate.getUTCFullYear(),
      m: localDate.getUTCMonth(),
      d: localDate.getUTCDate(),
      hour: localDate.getUTCHours(),
      minute: localDate.getUTCMinutes(),
      second: localDate.getUTCSeconds(),
      weekday: weekdaysShort[localDate.getUTCDay()]
    };
  } catch (e) {
    const date = new Date(timestamp);
    return {
      y: date.getFullYear(),
      m: date.getMonth(),
      d: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
      weekday: weekdaysShort[date.getDay()]
    };
  }
}

function formatTimestamp(timestamp: number, pattern: string, showDayOfWeek: boolean): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return '';
  const { y, m, d, weekday } = getTzParts(timestamp);

  const monthsAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const yShort = y.toString().slice(-2);
  const yFull = y.toString();
  const mAbbr = monthsAbbr[m];
  const mNum = (m + 1).toString().padStart(2, '0');
  const dNum = d.toString().padStart(2, '0');
  const q = 'Q' + Math.floor(m / 3 + 1);

  let formatted = pattern;
  if (showDayOfWeek) {
    formatted = formatted.replace(/Mon/g, weekday);
  } else {
    // Strip Mon prefix and any trailing spaces
    formatted = formatted.replace(/Mon\s*/g, '');
  }

  // Tokenize with unique placeholders first to prevent sequential substitution collision (e.g. day 09 matching month 09)
  return formatted
    .replace(/1997/g, '\u0001')
    .replace(/97/g, '\u0002')
    .replace(/Sep/g, '\u0003')
    .replace(/09/g, '\u0004')
    .replace(/29/g, '\u0005')
    .replace(/Q3/g, '\u0006')
    .replace(/\u0001/g, yFull)
    .replace(/\u0002/g, yShort)
    .replace(/\u0003/g, mAbbr)
    .replace(/\u0004/g, mNum)
    .replace(/\u0005/g, dNum)
    .replace(/\u0006/g, q)
    .trim();
}

export function formatCustomDateStamp(timestamp: number): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return '';
  const showWeekday = (typeof window !== 'undefined' ? (window as any).__custom_date_show_weekday__ : true) ?? true;
  const datePattern = (typeof window !== 'undefined' ? (window as any).__custom_date_format__ : null) || "Mon 29 Sep '97";
  const timeFormat = (typeof window !== 'undefined' ? (window as any).__custom_time_format__ : null) || '24h';
  let { y, m, d, hour, minute } = getTzParts(timestamp);

  const currentPeriod = typeof window !== 'undefined' ? (window as any).__last_chart_period__ : null;
  const isHigherTf = (timestamp % 86400000 === 0) || (currentPeriod && (
    currentPeriod.timespan === 'day' || currentPeriod.timespan === 'week' || currentPeriod.timespan === 'month' || currentPeriod.timespan === 'year' ||
    currentPeriod.text === '1D' || currentPeriod.text === '1W' || currentPeriod.text === '1M' || currentPeriod.text === '1Y' ||
    currentPeriod.text === 'D' || currentPeriod.text === 'W' || currentPeriod.text === 'M' || currentPeriod.text === 'Y'
  ));

  if (isHigherTf) {
    hour = 0;
    minute = 0;
  }

  // Format the date portion using the selected pattern
  const datePart = formatTimestamp(timestamp, datePattern, showWeekday);

  // Format the time portion
  const minutes = minute.toString().padStart(2, '0');
  let timePart: string;
  if (timeFormat === '12h') {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHours = (hour % 12 || 12).toString().padStart(2, '0');
    timePart = `${displayHours}:${minutes} ${ampm}`;
  } else {
    timePart = `${hour.toString().padStart(2, '0')}:${minutes}`;
  }

  return `${datePart} ${timePart}`;
}

// Hijack tickerpen.utils.formatDate to apply custom date formatting dynamically
if (utils && typeof utils.formatDate === 'function') {
  if (!(utils.formatDate as any).__hijacked__) {
    const originalFormatDate = utils.formatDate;

    const formatTime = function (timestamp: number, formatType: '12h' | '24h'): string {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return '';
      let { hour, minute } = getTzParts(timestamp);
      const currentPeriod = typeof window !== 'undefined' ? (window as any).__last_chart_period__ : null;
      const isHigherTf = (timestamp % 86400000 === 0) || (currentPeriod && (
        currentPeriod.timespan === 'day' || currentPeriod.timespan === 'week' || currentPeriod.timespan === 'month' || currentPeriod.timespan === 'year' ||
        currentPeriod.text === '1D' || currentPeriod.text === '1W' || currentPeriod.text === '1M' || currentPeriod.text === '1Y' ||
        currentPeriod.text === 'D' || currentPeriod.text === 'W' || currentPeriod.text === 'M' || currentPeriod.text === 'Y'
      ));

      if (isHigherTf) {
        hour = 0;
        minute = 0;
      }

      const minutes = minute.toString().padStart(2, '0');
      if (formatType === '12h') {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHours = (hour % 12 || 12).toString().padStart(2, '0');
        return `${displayHours}:${minutes} ${ampm}`;
      } else {
        return `${hour.toString().padStart(2, '0')}:${minutes}`;
      }
    };

    const formatXAxisDate = function (timestamp: number, format: string, datePattern: string, timeFormat: '12h' | '24h'): string {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return '';
      const { y, m, d, hour, minute, second } = getTzParts(timestamp);

      const monthsAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mAbbr = monthsAbbr[m];
      const q = 'Q' + Math.floor(m / 3 + 1);
      const isQFormat = datePattern.includes('Q3');

      // Helper for Year (e.g. 2025)
      const formatYear = () => String(y);

      // Helper for Month (e.g. 'Jan', 'Feb', 'Aug')
      const formatMonth = () => {
        if (isQFormat) return `${q} ${y}`;
        return mAbbr;
      };

      // 1. Explicit Time template from tick generator (follows 24h and 12h format)
      if (format === 'HH:mm' || format === 'HH:mm:ss') {
        if (format === 'HH:mm:ss' && second !== 0) {
          const sNum = second.toString().padStart(2, '0');
          return `${formatTime(timestamp, timeFormat)}:${sNum}`;
        }
        return formatTime(timestamp, timeFormat);
      }

      // 2. Year-level template (at start of year only show YYYY)
      if (format === 'YYYY') {
        return formatYear();
      }

      // 3. Month-level template (at start of month show MMM)
      if (format === 'YYYY-MM' || format === 'MMM') {
        return formatMonth();
      }

      // 4. Day-level template (at start of day show DD)
      if (format === 'DD' || format === 'D' || format === 'DD-MMM' || format === 'YYYY-MM-DD') {
        return String(d);
      }

      // Fallback: if intraday with non-zero time, show time in 12h/24h format; else date
      if (hour !== 0 || minute !== 0) {
        return formatTime(timestamp, timeFormat);
      }
      return String(d);
    };

    const newFormatDate = function (this: any, dateTimeFormat: any, timestamp: any, format: any) {
      let dtFormat = dateTimeFormat;
      let ts = timestamp;
      let template = format;
      let type = arguments[3];

      // Handle (dtFormat, timestamp, template, type) — traditional 4-arg signature
      if (typeof timestamp === 'number') {
        dtFormat = dateTimeFormat;
        ts = timestamp;
        template = format;
        type = arguments[3];
      }
      // Handle (timestamp, template, type) signature — first arg is number
      else if (typeof dateTimeFormat === 'number') {
        ts = dateTimeFormat;
        template = timestamp;
        type = format;
        dtFormat = null;
      }
      // Detect v10 object signature — must actually have a timestamp property
      else if (dateTimeFormat && typeof dateTimeFormat === 'object' && 'timestamp' in dateTimeFormat) {
        const params = dateTimeFormat;
        dtFormat = params.dateTimeFormat;
        ts = params.timestamp;
        template = params.template;
        type = params.type;
      }

      if (typeof window !== 'undefined' && typeof ts === 'number') {
        if (!Number.isFinite(ts)) return '';
        const datePattern = (window as any).__custom_date_format__ || "Mon 29 Sep '97";
        const showWeekday = (window as any).__custom_date_show_weekday__ ?? true;
        const timeFormat = (window as any).__custom_time_format__ || "24h";

        if (type === 1 || type === 'crosshair') {
          // Crosshair label formatting: Day/dd/mm/yy HH:MM
          return formatCustomDateStamp(ts);
        }

        if (type === 2 || type === 'xAxis') {
          // XAxis label formatting
          return formatXAxisDate(ts, template, datePattern, timeFormat);
        }

        // Default formatting (Tooltips, Crosshairs, etc.)
        const customDate = formatTimestamp(ts, datePattern, showWeekday);

        const hasDate = template && (template.includes('Y') || template.includes('M') || template.includes('D'));
        const hasTime = template && (template.includes('H') || template.includes('m'));

        if (hasDate && hasTime) {
          return `${customDate} ${formatTime(ts, timeFormat)}`;
        } else if (hasDate) {
          return customDate;
        } else if (hasTime) {
          return formatTime(ts, timeFormat);
        }
      }

      // Fallback – guard against invalid timestamps that would throw in DateTimeFormat
      try {
        if (dateTimeFormat && typeof dateTimeFormat === 'object' && 'timestamp' in dateTimeFormat) {
          const params = dateTimeFormat;
          if (typeof params.timestamp === 'number' && !Number.isFinite(params.timestamp)) return '';
          return (originalFormatDate as any).call(this, params.dateTimeFormat, params.timestamp, params.template, params.type);
        }
        return originalFormatDate.apply(this, arguments as any);
      } catch (e) {
        return '';
      }
    };
    (newFormatDate as any).__hijacked__ = true;
    (newFormatDate as any).__original__ = originalFormatDate;
    utils.formatDate = newFormatDate;
  }
}

// Register custom overlay volume indicator (TradingView-style overlay in main candle pane)
registerIndicator({
  name: 'VOL OVERLAY',
  shortName: 'VOL',
  precision: 0,
  zLevel: -1,
  calcParams: [0.24],
  figures: [
    { key: 'up', title: 'Up Volume: ', type: 'bar' },
    { key: 'down', title: 'Down Volume: ', type: 'bar' }
  ],
  styles: {
    bars: [
      { color: 'rgba(38, 166, 154, 1)' },
      { color: 'rgba(239, 83, 80, 1)' }
    ]
  },
  calc: (tickerPenDataList: any[]) => {
    return tickerPenDataList.map(k => ({ volume: k.volume }));
  },
  createTooltipDataSource: (params: any) => {
    const { chart, crosshair, defaultStyles } = params;
    const tickerPenDataList = (chart && typeof chart.getDataList === 'function')
      ? chart.getDataList()
      : (params.dataList || params.kLineDataList || []);

    let dataIndex = tickerPenDataList.length - 1;
    if (crosshair && typeof crosshair.dataIndex === 'number' && crosshair.dataIndex >= 0 && crosshair.dataIndex < tickerPenDataList.length) {
      dataIndex = crosshair.dataIndex;
    }
    const k = tickerPenDataList[dataIndex];
    const volume = k ? Number(k.volume ?? k.vol ?? 0) : 0;

    let formattedVolume = '-';
    if (typeof volume === 'number' && !isNaN(volume)) {
      if (volume >= 1e9) {
        formattedVolume = (volume / 1e9).toFixed(2) + 'B';
      } else if (volume >= 1e6) {
        formattedVolume = (volume / 1e6).toFixed(2) + 'M';
      } else if (volume >= 1e3) {
        formattedVolume = (volume / 1e3).toFixed(2) + 'K';
      } else {
        formattedVolume = volume.toFixed(0);
      }
    }

    // Use the independent up/down colors for tooltip too!
    const upColor = 'rgba(38, 166, 154, 1)';
    const downColor = 'rgba(239, 83, 80, 1)';
    const color = k ? ((k.close ?? 0) >= (k.open ?? 0) ? upColor : downColor) : (defaultStyles?.tooltip?.text?.color || '#d1d4dc');

    return {
      name: 'VOL',
      calcParamsText: '',
      values: [
        {
          title: 'Volume: ',
          value: {
            text: formattedVolume,
            color: color
          }
        }
      ]
    };
  },
  draw: (params: any) => {
    const { ctx, chart, indicator, bounding, xAxis } = params;
    if (indicator && indicator.visible === false) {
      return false;
    }
    if (!ctx || !bounding || !xAxis) {
      return false;
    }

    const tickerPenDataList = (chart && typeof chart.getDataList === 'function')
      ? chart.getDataList()
      : (params.dataList || params.kLineDataList || []);

    if (!tickerPenDataList || tickerPenDataList.length === 0) {
      return false;
    }

    const visibleRange = (chart && typeof chart.getVisibleRange === 'function')
      ? chart.getVisibleRange()
      : (params.visibleRange || { from: 0, to: tickerPenDataList.length });

    const barSpace = (chart && typeof chart.getBarSpace === 'function')
      ? chart.getBarSpace()
      : (params.barSpace || { bar: 6, halfBar: 3 });

    const from = Math.max(0, visibleRange.from ?? 0);
    const to = Math.min(tickerPenDataList.length, visibleRange.to ?? tickerPenDataList.length);
    const { height } = bounding;

    // 1. Find the maximum volume in the visible range to scale the bars
    let maxVolume = 0;
    for (let i = from; i < to; i++) {
      const k = tickerPenDataList[i];
      const vol = Number(k?.volume ?? k?.vol ?? 0);
      if (vol > maxVolume) {
        maxVolume = vol;
      }
    }

    if (maxVolume === 0) return false;

    // 2. Draw the volume bars at the bottom 20% of the viewport height (similar to TradingView / Lightweight Charts)
    const maxBarHeight = height * 0.20;
    const barW = barSpace?.bar ?? 6;
    const halfBarWidth = Math.max(1, (barW * 0.8) / 2);

    // Default independent colors (defaults to standard #26a69a and #ef5350)
    let upColor = 'rgba(38, 166, 154, 1)';
    let downColor = 'rgba(239, 83, 80, 1)';

    // Retrieve from indicator styles if available
    if (indicator && indicator.styles && indicator.styles.bars) {
      if (indicator.styles.bars[0] && indicator.styles.bars[0].color) {
        upColor = indicator.styles.bars[0].color;
      }
      if (indicator.styles.bars[1] && indicator.styles.bars[1].color) {
        downColor = indicator.styles.bars[1].color;
      }
    }

    // Access opacity from calcParams (default is 0.24)
    const opacity = (indicator && indicator.calcParams && typeof indicator.calcParams[0] === 'number')
      ? indicator.calcParams[0]
      : 0.24;

    ctx.save();
    ctx.globalAlpha = opacity; // Translucent overlay with configurable opacity

    for (let i = from; i < to; i++) {
      const k = tickerPenDataList[i];
      if (!k) continue;

      const vol = Number(k.volume ?? k.vol ?? 0);
      const x = typeof xAxis.convertToPixel === 'function' ? xAxis.convertToPixel(i) : 0;
      const barHeight = (vol / maxVolume) * maxBarHeight;
      const y = height - barHeight;

      // Color coding (green/red matching the price action)
      ctx.fillStyle = (k.close ?? 0) >= (k.open ?? 0) ? upColor : downColor;
      ctx.fillRect(x - halfBarWidth, y, halfBarWidth * 2, barHeight);
    }

    ctx.restore();
    return false;
  }
} as any);

import '@tickerpen/pro/dist/ticker-pen-pro.css';

// All available timeframe periods for the chart
const ALL_PERIODS = [
  { multiplier: 1, timespan: 'minute', text: '1m' },
  { multiplier: 3, timespan: 'minute', text: '3m' },
  { multiplier: 5, timespan: 'minute', text: '5m' },
  { multiplier: 15, timespan: 'minute', text: '15m' },
  { multiplier: 30, timespan: 'minute', text: '30m' },
  { multiplier: 1, timespan: 'hour', text: '1H' },
  { multiplier: 2, timespan: 'hour', text: '2H' },
  { multiplier: 3, timespan: 'hour', text: '3H' },
  { multiplier: 4, timespan: 'hour', text: '4H' },
  { multiplier: 1, timespan: 'day', text: 'D' },
  { multiplier: 1, timespan: 'week', text: 'W' },
  { multiplier: 1, timespan: 'month', text: 'M' },
];

// Complete English translations to patch missing/incomplete keys in Ticker Pen Pro library dictionary
const englishTranslations = {
  indicator: 'Indicator',
  main_indicator: 'Main Indicator',
  sub_indicator: 'Sub Indicator',
  setting: 'Setting',
  timezone: 'Timezone',
  screenshot: 'Screenshot',
  full_screen: 'Full Screen',
  exit_full_screen: 'Exit Full Screen',
  save: 'Save',
  confirm: 'Confirm',
  cancel: 'Cancel',
  ma: 'MA',
  ema: 'EMA',
  sma: 'SMA',
  boll: 'BOLL',
  bbi: 'BBI',
  sar: 'SAR',
  vol: 'VOL',
  macd: 'MACD',
  kdj: 'KDJ',
  rsi: 'RSI',
  bias: 'BIAS',
  brar: 'BRAR',
  cci: 'CCI',
  dmi: 'DMI',
  cr: 'CR',
  psy: 'PSY',
  dma: 'DMA',
  trix: 'TRIX',
  obv: 'OBV',
  vr: 'VR',
  wr: 'WR',
  mtm: 'MTM',
  emv: 'EMV',
  roc: 'ROC',
  pvt: 'PVT',
  ao: 'AO',
  utc: 'UTC',
  atr: 'ATR',
  wma: 'WMA',
  dema: 'DEMA',
  tema: 'TEMA',
  kama: 'KAMA',
  mfi: 'MFI',
  vwap: 'VWAP',
  stoch: 'Stochastic',
  stochrsi: 'StochRSI',
  aroon: 'Aroon',
  aroonosc: 'Aroon Osc',
  cmo: 'CMO',
  bop: 'BOP',
  ad: 'A/D Line',
  adosc: 'Chaikin Osc',
  natr: 'NATR',
  stddev: 'StdDev',

  // Settings Panel Keys
  candle_type: 'Candle Type',
  candle_solid: 'Solid Candle',
  candle_stroke: 'Stroke Candle',
  candle_up_stroke: 'Up Stroke',
  candle_down_stroke: 'Down Stroke',
  heikin_ashi: 'Heikin Ashi',
  ohlc: 'OHLC',
  area: 'Area',
  last_price_show: 'Show Last Price',
  high_price_show: 'Show High Price',
  low_price_show: 'Show Low Price',
  indicator_last_value_show: 'Show Indicator Last Value',
  price_axis_type: 'Price Scale Type',
  normal: 'Normal',
  percentage: 'Percentage',
  log: 'Logarithmic',
  reverse_coordinate: 'Reverse Scale',
  grid_show: 'Show Grid',
  restore_default: 'Restore Default',

  // Drawing Tools Keys
  horizontal_straight_line: 'Horizontal Line',
  horizontal_ray_line: 'Horizontal Ray',
  horizontal_segment: 'Horizontal Segment',
  vertical_straight_line: 'Vertical Line',
  vertical_ray_line: 'Vertical Ray',
  vertical_segment: 'Vertical Segment',
  straight_line: 'Trend Line',
  ray_line: 'Ray',
  segment: 'Segment',
  arrow: 'Arrow',
  price_line: 'Price Line',
  price_channel_line: 'Price Channel',
  parallel_straight_line: 'Parallel Line',
  fibonacci_line: 'Fibonacci Retracement',
  fibonacci_segment: 'Fibonacci Segment',
  fibonacci_circle: 'Fibonacci Circle',
  fibonacci_spiral: 'Fibonacci Spiral',
  fibonacci_speed_resistance_fan: 'Fibonacci Fan',
  fibonacci_extension: 'Fibonacci Extension',
  gann_box: 'Gann Box',
  rect: 'Rectangle',
  parallelogram: 'Parallelogram',
  circle: 'Circle',
  triangle: 'Triangle',
  three_waves: '3 Waves',
  five_waves: '5 Waves',
  eight_waves: '8 Waves',
  any_waves: 'Any Waves',
  abcd: 'ABCD Pattern',
  xabcd: 'XABCD Pattern',
  weak_magnet: 'Weak Magnet',
  strong_magnet: 'Strong Magnet',
  symbol_search: 'Search Symbol',
  symbol_code: 'Symbol Code'
};

// Register the translations at module-level once
loadLocales('en-US', englishTranslations);

interface TickerPenProWidgetProps {
  idx?: number;
  symbol: string;
  onSymbolChange?: (symbol: string) => void;
  layout?: string;
  onLayoutChange?: (layout: string) => void;
  drawingBarVisible?: boolean;
  headerVisible?: boolean;
  isActive?: boolean;
  positions?: ChartPosition[];
  executions?: ChartExecution[];
  onPositionClose?: (positionId: string, position?: ChartPosition) => void;
  onPositionReverse?: (position: ChartPosition) => void;
  onModifyTP?: (tpPrice: number | undefined, position: ChartPosition) => void;
  onModifySL?: (slPrice: number | undefined, position: ChartPosition) => void;
  styles?: {
    gridShow: boolean;
    gridHorizontalShow?: boolean;
    gridVerticalShow?: boolean;
    gridVerticalColor?: string;
    gridVerticalOpacity?: number;
    gridVerticalStyle?: 'solid' | 'dashed' | 'dotted';
    gridHorizontalColor?: string;
    gridHorizontalOpacity?: number;
    gridHorizontalStyle?: 'solid' | 'dashed' | 'dotted';
    candleUpColor: string;
    candleDownColor: string;
    candleUpBorderColor?: string;
    candleDownBorderColor?: string;
    candleUpWickColor?: string;
    candleDownWickColor?: string;
    areaLineColor?: string;
    areaFillColor?: string;
    bgType?: 'solid' | 'gradient';
    bgColor: string;
    bgColor2?: string;
    bgOpacity?: number;
    scaleLineShow?: boolean;
    scaleLineColor?: string;
    crosshairShow?: boolean;
    crosshairColor?: string;
    crosshairOpacity?: number;
    crosshairStyle?: 'solid' | 'dashed' | 'dotted';
    crosshairWidth?: number;
    crosshairHorizontalShow?: boolean;
    crosshairVerticalShow?: boolean;
    crosshairLabelBgColor?: string;
    crosshairLabelTextColor?: string;
    watermarkType?: 'all' | 'none';
    watermarkColor?: string;
    watermarkOpacity?: number;
    watermarkShowTicker?: boolean;
    watermarkShowInterval?: boolean;
    watermarkShowDescription?: boolean;
    watermarkShowReplay?: boolean;
    scalesTextColor?: string;
    scalesTextSize?: number;
    scalesLineColor?: string;
    scalesLineOpacity?: number;
    navigationVisibility?: 'always' | 'hover' | 'hidden';
    paneButtonsVisibility?: 'always' | 'hover' | 'hidden';
    marginTop?: number;
    marginBottom?: number;
    marginRight?: number;
    zoomEnabled?: boolean;
    scrollEnabled?: boolean;
    zoomSpeed?: number;
    // Status Line
    statusLogo: boolean;
    statusTitle: boolean;
    statusTitleType: 'name' | 'symbol' | 'symbol_name';
    statusMarketStatus: boolean;
    statusValues: boolean;
    statusBarChange: boolean;
    statusVolume: boolean;
    statusLastDayChange: boolean;
    statusIndicatorTitles: boolean;
    statusIndicatorInputs: boolean;
    statusIndicatorValues: boolean;
    statusIndicatorBg: boolean;
    statusIndicatorBgColor: string;
    scalesDateFormat?: string;
    scalesDayOfWeek?: boolean;
    scalesTimeFormat?: string;
    scalesHighPrice?: boolean;
    scalesLowPrice?: boolean;
    scalesPriceScaleType?: string;
    scalesPriceScaleReverse?: boolean;
    scalesTimezone?: string;
    scalesCurrencyUnit?: string;
    scalesPlacement?: string;
  };
}

// Global dictionary for live asset price fallbacks, dynamically calibrated from Coincap REST API
const liveFallbackPrices: Record<string, number> = {
  BTC: 61900,
  ETH: 3200,
  SOL: 140,
  BNB: 580,
  XRP: 0.6,
  ADA: 0.4,
  DOGE: 0.12,
  DOT: 6.5,
  AVAX: 28,
  LINK: 15,
  SHIB: 0.000017,
  PEPE: 0.000009
};

// Background worker to fetch real market prices from Coincap to calibrate fallback prices
let hasAttemptedCoincap = false;
async function fetchCoincapPrices() {
  if (hasAttemptedCoincap) return;
  hasAttemptedCoincap = true;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://api.coincap.io/v2/assets', true);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          if (json && Array.isArray(json.data)) {
            json.data.forEach((item: any) => {
              if (item.symbol) {
                const sym = item.symbol.toUpperCase();
                const val = Number(item.priceUsd);
                if (!isNaN(val) && val > 0) {
                  liveFallbackPrices[sym] = val;
                }
              }
            });
          }
        } catch (e) { }
      }
    };
    xhr.onerror = () => { };
    xhr.send();
  } catch (e) {
    console.warn('Failed to fetch fallback prices from Coincap:', e);
  }
}

// Helper to get descriptive asset name
function getAssetName(ticker: string): string {
  const t = ticker.toUpperCase().replace('-', '').replace('/', '');
  if (t.includes('BTC')) return 'Bitcoin';
  if (t.includes('ETH')) return 'Ethereum';
  if (t.includes('SOL')) return 'Solana';
  if (t.includes('BNB')) return 'BNB';
  if (t.includes('XRP')) return 'Ripple';
  if (t.includes('ADA')) return 'Cardano';
  if (t.includes('DOGE')) return 'Dogecoin';
  if (t.includes('DOT')) return 'Polkadot';
  if (t.includes('AVAX')) return 'Avalanche';
  if (t.includes('LINK')) return 'Chainlink';
  if (t.includes('SHIB')) return 'Shiba Inu';
  if (t.includes('PEPE')) return 'Pepe';
  if (t.includes('MATIC')) return 'Polygon';
  if (t.includes('UNI')) return 'Uniswap';
  if (t.includes('NEAR')) return 'Near Protocol';
  if (t.includes('APT')) return 'Aptos';
  if (t.includes('SUI')) return 'Sui';
  if (t.includes('OP')) return 'Optimism';
  if (t.includes('ARB')) return 'Arbitrum';
  if (t.includes('LTC')) return 'Litecoin';
  if (t.includes('TRX')) return 'TRON';
  if (t.includes('BCH')) return 'Bitcoin Cash';
  if (t.endsWith('USDT')) {
    const base = t.replace('USDT', '');
    return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
  }
  return t;
}

// Helper to resolve symbol logo URL
function getSymbolLogoUrl(ticker: string): string {
  const base = ticker.toUpperCase().replace('USDT', '').replace('-', '').replace('/', '');
  return `https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`;
}

const GRID_STYLE_MAP: Record<string, { style: 'solid' | 'dashed'; dashedValue: number[] }> = {
  'solid': { style: 'solid', dashedValue: [] },
  'dashed': { style: 'dashed', dashedValue: [4, 4] },
  'dotted': { style: 'dashed', dashedValue: [1, 3] },
  'short dash': { style: 'dashed', dashedValue: [2, 2] },
  'short dot': { style: 'dashed', dashedValue: [1, 1] },
  'short dash dot': { style: 'dashed', dashedValue: [2, 2, 1, 2] },
  'short dash dot dot': { style: 'dashed', dashedValue: [2, 2, 1, 2, 1, 2] },
  'dot': { style: 'dashed', dashedValue: [1, 2] },
  'dash': { style: 'dashed', dashedValue: [4, 4] },
  'long dash': { style: 'dashed', dashedValue: [8, 8] },
  'dash dot': { style: 'dashed', dashedValue: [6, 4, 2, 4] },
  'long dash dot': { style: 'dashed', dashedValue: [12, 6, 2, 6] },
  'long dash dot dot': { style: 'dashed', dashedValue: [12, 6, 2, 6, 2, 6] }
};

function applyColorOpacity(color: string, opacity: number): string {
  if (!color) return `rgba(42, 46, 57, ${opacity})`;
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    let r = 0, g = 0, b = 0;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  if (color.startsWith('rgba')) {
    const match = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`;
    }
  }
  if (color.startsWith('rgb')) {
    const match = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`;
    }
  }
  return color;
}

/**
 * Auto-detect price precision from raw Binance tickerpen API response strings.
 * Binance returns prices as strings like "96541.01000000" — the tickSize
 * determines which trailing zeros are padding vs. significant.
 * This function finds the maximum meaningful decimal places across a sample
 * of OHLC price strings by stripping trailing zeros.
 * Works universally for any symbol: crypto, forex, stocks, commodities.
 */
function detectPrecisionFromRawPrices(rawItems: any[]): number {
  if (!rawItems || rawItems.length === 0) return -1; // -1 = no detection possible

  let maxPrecision = 0;
  // Sample up to 50 candles from different sections of the data for robustness
  const sampleSize = Math.min(rawItems.length, 50);
  const step = Math.max(1, Math.floor(rawItems.length / sampleSize));

  for (let i = 0; i < rawItems.length; i += step) {
    const item = rawItems[i];
    // Binance candle format: [openTime, open, high, low, close, volume, ...]
    // items 1-4 are price strings
    for (let j = 1; j <= 4; j++) {
      const priceStr = String(item[j] || '');
      const dotIdx = priceStr.indexOf('.');
      if (dotIdx === -1) continue;

      // Strip trailing zeros to find meaningful precision
      const decimals = priceStr.substring(dotIdx + 1).replace(/0+$/, '');
      if (decimals.length > maxPrecision) {
        maxPrecision = decimals.length;
      }
    }
  }

  // If ALL sampled prices had .00 (whole numbers), check if it's truly integer-priced
  // or just coincidence. For safety, use at least 2 for most assets.
  return maxPrecision || 2;
}

// Helper to determine asset class / symbol details
function mapSymbolInfo(symbol: string): SymbolInfo {
  const s = symbol.toUpperCase().trim();
  const clean = s.replace('-', '').replace('/', '');

  let info: SymbolInfo;

  // ─── Priority 1: Check Binance exchangeInfo API cache for exact precision ───
  // The Binance API's PRICE_FILTER.tickSize gives the exact tick increment
  // (e.g., "0.01000000" → 2 decimals, "0.00000001" → 8 decimals).
  // This is the most accurate source for any Binance-listed symbol.
  if (cachedBinanceSymbols && cachedBinanceSymbols.length > 0) {
    const apiMatch = cachedBinanceSymbols.find(
      (sym: SymbolInfo) => sym.ticker.toUpperCase() === clean
    );
    if (apiMatch) {
      // Use exact API-derived precision — override everything
      const result: SymbolInfo = {
        ...apiMatch,
        logo: getSymbolLogoUrl(clean),
      };

      return result;
    }
  }

  // ─── Priority 2: Market-specific heuristic detection ───
  // 1. Forex Identification
  const majorCurrencies = ['EUR', 'GBP', 'USD', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'HKD', 'TRY', 'MXN', 'SEK', 'NOK', 'ZAR'];
  const isForexPair = clean.length === 6 && majorCurrencies.includes(clean.substring(0, 3)) && majorCurrencies.includes(clean.substring(3, 6));

  if (isForexPair || clean.includes('EURUSD') || clean.includes('GBPUSD') || clean.includes('USDJPY')) {
    const isJpy = clean.endsWith('JPY') || clean.startsWith('JPY');
    const base = clean.substring(0, 3);
    const quote = clean.substring(3, 6);
    info = {
      ticker: clean,
      name: `${base}/${quote} Forex Pair`,
      shortName: `${base}/${quote}`,
      logo: getSymbolLogoUrl(clean),
      exchange: 'FOREX',
      market: 'forex',
      pricePrecision: isJpy ? 3 : 5,
      volumePrecision: 2,
      priceCurrency: quote.toLowerCase()
    };
  }
  // 2. Commodities Identification
  else if (Object.keys({
    'XAU': 1, 'GOLD': 1, 'XAG': 1, 'SILVER': 1, 'WTI': 1, 'USOIL': 1,
    'BRENT': 1, 'UKOIL': 1, 'NATGAS': 1, 'NG': 1, 'COPPER': 1
  }).some(key => clean.startsWith(key) || clean.endsWith(key) || clean === key)) {
    const commodityList: Record<string, { name: string, precision: number, volPrecision: number }> = {
      'XAU': { name: 'Gold', precision: 2, volPrecision: 2 },
      'GOLD': { name: 'Gold', precision: 2, volPrecision: 2 },
      'XAG': { name: 'Silver', precision: 3, volPrecision: 2 },
      'SILVER': { name: 'Silver', precision: 3, volPrecision: 2 },
      'WTI': { name: 'WTI Crude Oil', precision: 2, volPrecision: 2 },
      'USOIL': { name: 'WTI Crude Oil', precision: 2, volPrecision: 2 },
      'BRENT': { name: 'Brent Crude Oil', precision: 2, volPrecision: 2 },
      'UKOIL': { name: 'Brent Crude Oil', precision: 2, volPrecision: 2 },
      'NATGAS': { name: 'Natural Gas', precision: 3, volPrecision: 2 },
      'NG': { name: 'Natural Gas', precision: 3, volPrecision: 2 },
      'COPPER': { name: 'Copper', precision: 4, volPrecision: 2 }
    };

    let matchedConfig = { name: 'Commodity', precision: 2, volPrecision: 2, key: 'COMMODITIES' };
    for (const [key, config] of Object.entries(commodityList)) {
      if (clean.startsWith(key) || clean.endsWith(key) || clean === key) {
        matchedConfig = { ...config, key };
        break;
      }
    }

    info = {
      ticker: clean,
      name: matchedConfig.name,
      shortName: matchedConfig.key === 'XAU' || matchedConfig.key === 'GOLD' ? 'GOLD' : (matchedConfig.key === 'XAG' || matchedConfig.key === 'SILVER' ? 'SILVER' : matchedConfig.name),
      logo: getSymbolLogoUrl(clean),
      exchange: 'COMMODITIES',
      market: 'commodity',
      pricePrecision: matchedConfig.precision,
      volumePrecision: matchedConfig.volPrecision,
      priceCurrency: 'usd'
    };
  }
  // 3. Cryptocurrencies Identification
  else {
    const cryptoSuffixes = ['USDT', 'USDC', 'BUSD', 'TUSD', 'FDUSD', 'DAI', 'BTC', 'ETH'];
    const hasCryptoSuffix = cryptoSuffixes.some(suffix => clean.endsWith(suffix));
    const isCommonCryptoBase = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'LINK', 'SHIB', 'PEPE'].some(base => clean.startsWith(base));

    if (hasCryptoSuffix || isCommonCryptoBase) {
      let pricePrecision = 4;
      let volumePrecision = 2;

      const baseAsset = clean.replace(/USDT$|USDC$|BUSD$|TUSD$|FDUSD$|DAI$|BTC$|ETH$/, '');
      const price = liveFallbackPrices[baseAsset];

      if (price !== undefined) {
        if (price < 0.0001) {
          pricePrecision = 8;
          volumePrecision = 0;
        } else if (price < 0.01) {
          pricePrecision = 6;
          volumePrecision = 0;
        } else if (price < 1) {
          pricePrecision = 4;
          volumePrecision = 1;
        } else if (price < 100) {
          pricePrecision = 3;
          volumePrecision = 2;
        } else {
          pricePrecision = 2;
          volumePrecision = 4;
        }
      } else {
        if (clean.startsWith('BTC') || clean.startsWith('ETH')) {
          pricePrecision = 2;
          volumePrecision = 4;
        } else if (clean.startsWith('SHIB') || clean.startsWith('PEPE') || clean.startsWith('BONK') || clean.startsWith('FLOKI')) {
          pricePrecision = 8;
          volumePrecision = 0;
        } else if (clean.startsWith('DOGE') || clean.startsWith('XRP') || clean.startsWith('ADA')) {
          pricePrecision = 4;
          volumePrecision = 1;
        }
      }

      let shortName = clean;
      for (const suffix of cryptoSuffixes) {
        if (clean.endsWith(suffix)) {
          shortName = `${clean.replace(suffix, '')}/${suffix}`;
          break;
        }
      }

      info = {
        ticker: clean,
        name: getAssetName(clean),
        shortName: shortName,
        logo: getSymbolLogoUrl(clean),
        exchange: 'BINANCE',
        market: 'crypto',
        pricePrecision,
        volumePrecision,
        priceCurrency: 'usd'
      };
    } else {
      // 4. Default to Stock
      info = {
        ticker: clean,
        name: `${clean} Stock`,
        shortName: clean,
        logo: getSymbolLogoUrl(clean),
        exchange: 'NASDAQ',
        market: 'stock',
        pricePrecision: 2,
        volumePrecision: 0,
        priceCurrency: 'usd'
      };
    }
  }

  // Cache precision globally so custom Y-axis tick renderers can reference it directly


  return info;
}

function getYAxisComponent(coreChart: any): any {
  if (!coreChart) return null;
  if (typeof coreChart.getYAxes === "function") {
    try {
      let yAxes = coreChart.getYAxes({ paneId: "candle_pane" });
      if (!yAxes || yAxes.length === 0) {
        yAxes = coreChart.getYAxes({ paneId: "candle" });
      }
      if (!yAxes || yAxes.length === 0) {
        yAxes = coreChart.getYAxes({});
      }
      if (yAxes && yAxes.length > 0) return yAxes[0];
    } catch (e) { }
  }
  return null;
}

// Helper to resolve period timeframe into Binance interval codes
function getBinanceInterval(period: Period): string {
  const m = period.multiplier;
  if (period.timespan === 'minute') {
    // Binance supports: 1m, 3m, 5m, 15m, 30m
    if ([1, 3, 5, 15, 30].includes(m)) return `${m}m`;
    return '1m';
  }
  if (period.timespan === 'hour') {
    // Binance supports: 1h, 2h, 4h, 6h, 8h, 12h
    if ([1, 2, 4, 6, 8, 12].includes(m)) return `${m}h`;
    if (m === 3) return '1h'; // 3H is aggregated from 1h candles
    return '1h';
  }
  if (period.timespan === 'day') return '1d';
  if (period.timespan === 'week') return '1w';
  if (period.timespan === 'month') return '1M';
  return '1d';
}

function isAggregatedPeriod(period: Period | undefined | null): boolean {
  if (!period) return false;
  return period.timespan === 'hour' && period.multiplier === 3;
}

function getTargetPeriodMs(period: Period | undefined | null): number {
  if (!period) return 0;
  if (period.timespan === 'hour' && period.multiplier === 3) return 3 * 3600 * 1000;
  return 0;
}

function aggregateBars(bars: TickerPenData[], targetPeriodMs: number): TickerPenData[] {
  if (!bars || bars.length === 0 || targetPeriodMs <= 0) return bars || [];
  const map = new Map<number, TickerPenData>();

  for (const bar of bars) {
    const bucketTs = Math.floor(bar.timestamp / targetPeriodMs) * targetPeriodMs;
    const existing = map.get(bucketTs);
    if (!existing) {
      map.set(bucketTs, {
        timestamp: bucketTs,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: Number(bar.volume || 0),
        turnover: Number(bar.turnover || 0),
      });
    } else {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
      existing.volume = (existing.volume || 0) + Number(bar.volume || 0);
      if (bar.turnover) existing.turnover = (existing.turnover || 0) + Number(bar.turnover || 0);
    }
  }

  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
}

const getLayoutIcon = (lay: string) => {
  const prefix = `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">`;
  const suffix = `</svg>`;

  if (lay === '2v') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M12 3v18"></path>${suffix}`;
  if (lay === '2h') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 12h18"></path>${suffix}`;
  if (lay === '3v') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M9 3v18M15 3v18"></path>${suffix}`;
  if (lay === '3h') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 9h18M3 15h18"></path>${suffix}`;
  if (lay === '3g') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M12 3v18M12 12h9"></path>${suffix}`;
  if (lay === '3g2') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 12h18M12 12v9"></path>${suffix}`;
  if (lay === '3g3') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 12h18M12 3v9"></path>${suffix}`;
  if (lay === '3g4') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M12 3v18M3 12h9"></path>${suffix}`;
  if (lay === '4') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M12 3v18M3 12h18"></path>${suffix}`;
  if (lay === '5') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 12h18M12 3v9M9 12v9M15 12v9"></path>${suffix}`;
  if (lay === '6') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M8 3v18M16 3v18M3 12h18"></path>${suffix}`;
  if (lay === '7') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 12h18M9 3v9M15 3v9M7.5 12v9M12 12v9M16.5 12v9"></path>${suffix}`;
  if (lay === '8') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M7 3v18M12 3v18M17 3v18M3 12h18"></path>${suffix}`;
  if (lay === '9') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M9 3v18M15 3v18M3 9h18M3 15h18"></path>${suffix}`;
  if (lay === '10') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M6.6 3v18M10.2 3v18M13.8 3v18M17.4 3v18M3 12h18"></path>${suffix}`;
  if (lay === '12') return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M7.5 3v18M12 3v18M16.5 3v18M3 9h18M3 15h18"></path>${suffix}`;
  return `${prefix}<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>${suffix}`;
};

let cachedBinanceSymbols: SymbolInfo[] | null = null;
let isFetchingSymbols = false;

const DEFAULT_SYMBOLS = [
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

  // Stocks
  { ticker: 'AAPL', name: 'Apple Inc.', shortName: 'AAPL', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },
  { ticker: 'TSLA', name: 'Tesla Inc.', shortName: 'TSLA', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', shortName: 'NVDA', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },
  { ticker: 'MSFT', name: 'Microsoft Corp.', shortName: 'MSFT', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', shortName: 'AMZN', exchange: 'NASDAQ', market: 'stock', pricePrecision: 2 },

  // Forex Pairs
  { ticker: 'EURUSD', name: 'Euro / US Dollar', shortName: 'EUR/USD', exchange: 'FOREX', market: 'forex', pricePrecision: 5 },
  { ticker: 'GBPUSD', name: 'British Pound / US Dollar', shortName: 'GBP/USD', exchange: 'FOREX', market: 'forex', pricePrecision: 5 },
  { ticker: 'USDJPY', name: 'US Dollar / Japanese Yen', shortName: 'USD/JPY', exchange: 'FOREX', market: 'forex', pricePrecision: 3 },
  { ticker: 'AUDUSD', name: 'Australian Dollar / US Dollar', shortName: 'AUD/USD', exchange: 'FOREX', market: 'forex', pricePrecision: 5 },
  { ticker: 'USDCAD', name: 'US Dollar / Canadian Dollar', shortName: 'USD/CAD', exchange: 'FOREX', market: 'forex', pricePrecision: 5 },
  { ticker: 'USDCHF', name: 'US Dollar / Swiss Franc', shortName: 'USD/CHF', exchange: 'FOREX', market: 'forex', pricePrecision: 5 },
  { ticker: 'NZDUSD', name: 'New Zealand Dollar / US Dollar', shortName: 'NZD/USD', exchange: 'FOREX', market: 'forex', pricePrecision: 5 },

  // Commodities
  { ticker: 'GOLD', name: 'Gold Futures', shortName: 'GOLD', exchange: 'COMEX', market: 'commodity', pricePrecision: 1 },
  { ticker: 'SILVER', name: 'Silver Futures', shortName: 'SILVER', exchange: 'COMEX', market: 'commodity', pricePrecision: 3 },
  { ticker: 'CRUDE_OIL', name: 'Crude Oil Futures', shortName: 'OIL', exchange: 'NYMEX', market: 'commodity', pricePrecision: 2 },
  { ticker: 'NAT_GAS', name: 'Natural Gas Futures', shortName: 'GAS', exchange: 'NYMEX', market: 'commodity', pricePrecision: 3 },

  // Indices
  { ticker: 'SPX500', name: 'S&P 500 Index', shortName: 'US500', exchange: 'INDEX', market: 'indices', pricePrecision: 2 },
  { ticker: 'NAS100', name: 'Nasdaq 100 Index', shortName: 'NAS100', exchange: 'INDEX', market: 'indices', pricePrecision: 2 }
].map(d => ({
  ticker: d.ticker,
  name: d.name,
  shortName: d.shortName,
  logo: getSymbolLogoUrl(d.ticker),
  exchange: d.exchange,
  market: d.market,
  pricePrecision: d.pricePrecision,
  volumePrecision: 2
}));

const BINANCE_DOMAINS = [
  'api.binance.com',
  'api-gcp.binance.com',
  'api1.binance.com',
  'api2.binance.com',
  'api3.binance.com',
  'api4.binance.com',
  'api.binance.us'
];

const WS_DOMAINS = [
  'stream.binance.com:9443',
  'stream.binance.com:443',
  'stream1.binance.com:9443',
  'stream2.binance.com:9443',
  'stream3.binance.com:9443',
  'stream.binance.us:9443'
];

async function binanceFetch(path: string, timeoutMs: number = 2000): Promise<any> {
  const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // In dev mode, use the Vite proxy to bypass CORS.
  // Try proxy first; only fall back to direct domains in production builds.
  const proxyUrls = isDev ? [
    `${window.location.origin}/binance-api${path}`,
  ] : [];
  const directUrls = BINANCE_DOMAINS.map(domain => `https://${domain}${path}`);
  const allUrls = [...proxyUrls, ...directUrls];

  const makeRequest = (url: string): Promise<any> => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(e); }
      } else {
        reject(new Error(`HTTP ${xhr.status} on ${url}`));
      }
    };
    xhr.onerror = () => reject(new Error(`XHR network error on ${url}`));
    xhr.timeout = timeoutMs;
    xhr.ontimeout = () => reject(new Error(`Timeout on ${url}`));
    xhr.send();
  });

  // Race all URLs — first success wins
  return new Promise<any>((resolve, reject) => {
    let rejectedCount = 0;
    const errors: any[] = [];
    const promises = allUrls.map(url => makeRequest(url));
    promises.forEach(p => {
      p.then(resolve).catch(err => {
        errors.push(err);
        rejectedCount++;
        if (rejectedCount === promises.length) {
          reject(new Error(`All Binance fetches failed: ${errors.map(e => e.message).join(', ')}`));
        }
      });
    });
  });
}



async function fetchBinanceSymbols(): Promise<SymbolInfo[]> {
  if (cachedBinanceSymbols) return cachedBinanceSymbols;
  if (isFetchingSymbols) return [];
  isFetchingSymbols = true;
  try {
    const data = await binanceFetch('/api/v3/exchangeInfo', 15000);
    if (data && Array.isArray(data.symbols)) {
      const filtered = data.symbols.filter(
        (s: any) => s.status === 'TRADING'
      );
      const mapped = filtered.map((s: any) => {
        // Derive pricePrecision from PRICE_FILTER tickSize
        let pricePrecision = 2;
        const priceFilter = s.filters?.find((f: any) => f.filterType === 'PRICE_FILTER');
        if (priceFilter && priceFilter.tickSize) {
          const tickStr = String(priceFilter.tickSize);
          const dotIndex = tickStr.indexOf('.');
          const oneIndex = tickStr.indexOf('1', dotIndex);
          if (dotIndex >= 0 && oneIndex > dotIndex) {
            pricePrecision = oneIndex - dotIndex;
          }
        }
        return {
          ticker: s.symbol,
          name: getAssetName(s.symbol),
          shortName: `${s.baseAsset}/${s.quoteAsset}`,
          logo: getSymbolLogoUrl(s.symbol),
          exchange: 'BINANCE',
          market: 'crypto',
          pricePrecision,
          volumePrecision: 2
        };
      });
      cachedBinanceSymbols = mapped;
      isFetchingSymbols = false;
      return mapped;
    }
  } catch (err) {
    console.warn('Failed to fetch Binance exchangeInfo, using fallback list:', err);
  }
  isFetchingSymbols = false;
  return [];
}

// Prefetch symbols immediately on load
fetchBinanceSymbols();
fetchCoincapPrices();

class CustomDatafeed {
  private sockets = new Map<string, WebSocket>();
  private pollingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private managerUnsubscribers = new Map<string, () => void>();
  private onSubscribeCallback?: () => void;
  private currentSubscriptionKey?: string;

  private onSymbolChangeCallback?: (symbol: string) => void;
  private lastSubscribedTicker?: string;
  private lastSubscribedPeriodText?: string;
  public lastRawData: TickerPenData[] = [];
  public activeTimeframeMs: number = 15 * 60 * 1000;
  public historyCache = new Map<string, TickerPenData[]>();
  public isCacheSimulated = new Map<string, boolean>();
  public savedAnchorInfo: { timestamp: number; screenRatio: number } | null = null;
  public savedAnchorTimestamp: number | null = null;
  public lastLivePrice: number | null = null;
  public lastLiveTick: any = null;
  private historyLoadVersion = 0;
  private activePeriodState: Period | null = null;
  private inFlightRequests = new Map<string, Promise<TickerPenData[]>>();

  private getCoreChartCallback?: () => any;
  private onLiveTickCallback?: (tick: any) => void;
  private getIsActiveCallback?: () => boolean;
  private onPeriodChangeCallback?: (period: Period) => void;
  private getCurrentPeriodCallback?: () => Period;
  private getChartTypeCallback?: () => string;
  private onNetworkStatusChangeCallback?: (status: { isError: boolean; message?: string }) => void;

  constructor(
    onSubscribe?: () => void,
    onSymbolChange?: (symbol: string) => void,
    getCoreChart?: () => any,
    onLiveTick?: (tick: any) => void,
    getIsActive?: () => boolean,
    onPeriodChange?: (period: Period) => void,
    getCurrentPeriod?: () => Period,
    getChartType?: () => string,
    onNetworkStatusChange?: (status: { isError: boolean; message?: string }) => void
  ) {
    this.onSubscribeCallback = onSubscribe;
    this.onSymbolChangeCallback = onSymbolChange;
    this.getCoreChartCallback = getCoreChart;
    this.onLiveTickCallback = onLiveTick;
    this.getIsActiveCallback = getIsActive;
    this.onPeriodChangeCallback = onPeriodChange;
    this.getCurrentPeriodCallback = getCurrentPeriod;
    this.getChartTypeCallback = getChartType;
    this.onNetworkStatusChangeCallback = onNetworkStatusChange;
  }

  public isHeikinAshi(): boolean {
    return this.getChartTypeCallback ? this.getChartTypeCallback() === 'heikin_ashi' : false;
  }

  public formatDataForChart(bars: TickerPenData[]): TickerPenData[] {
    if (this.isHeikinAshi() && Array.isArray(bars) && bars.length > 0) {
      return transformToHeikinAshi(bars);
    }
    return bars;
  }

  private clearLiveUpdates(subKey: string): void {
    const unsubscribeManager = this.managerUnsubscribers.get(subKey);
    if (unsubscribeManager) {
      try { unsubscribeManager(); } catch (e) { }
      this.managerUnsubscribers.delete(subKey);
    }
    if (this.sockets.has(subKey)) {
      try { this.sockets.get(subKey)?.close(); } catch (e) { }
      this.sockets.delete(subKey);
    }
    if (this.pollingIntervals.has(subKey)) {
      clearInterval(this.pollingIntervals.get(subKey)!);
      this.pollingIntervals.delete(subKey);
    }
  }

  private setupSimulatedFeed(
    subKey: string,
    symbol: SymbolInfo,
    period: Period,
    intervalMs: number,
    callback: DatafeedSubscribeCallback
  ): void {
    const upperTicker = symbol.ticker.toUpperCase().replace('-', '').replace('/', '');
    let tickCount = 0;
    const simulateTick = async () => {
      if (this.currentSubscriptionKey !== subKey) {
        this.clearLiveUpdates(subKey);
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.clearLiveUpdates(subKey);
        return;
      }

      tickCount++;
      if (tickCount % 15 === 0) {
        try {
          const pingResult = await binanceFetch('/api/v3/ping', 2000);
          if (pingResult) {
            const cacheKey = `${symbol.ticker}_${period.text}`;
            const cleanTicker = symbol.ticker.toUpperCase().replace('-', '').replace('/', '');
            const binanceInterval = getBinanceInterval(period);
            const data = await this.fetchTickerPenHistory(cleanTicker, binanceInterval, undefined, false);

            if (Array.isArray(data) && data.length > 0) {
              const rawData = data.map((item: any) => ({
                timestamp: Number(item[0]),
                open: Number(item[1]),
                high: Number(item[2]),
                low: Number(item[3]),
                close: Number(item[4]),
                volume: Number(item[5]),
              }));
              const rawTickerPenBars = isAggregatedPeriod(period)
                ? aggregateBars(rawData, getTargetPeriodMs(period))
                : rawData;
              this.lastRawData = rawTickerPenBars;
              this.historyCache.set(cacheKey, rawTickerPenBars);
              this.isCacheSimulated.set(cacheKey, false);
            }

            this.clearLiveUpdates(subKey);
            this.startLiveUpdates(subKey, symbol, period, callback);
            return;
          }
        } catch (e) {
          // Still offline, keep simulating
        }
      }

      const now = Date.now();
      const candleTimestamp = Math.floor(now / intervalMs) * intervalMs;

      let basePrice = 100;
      if (this.lastRawData && this.lastRawData.length > 0) {
        const lastCandle = this.lastRawData[this.lastRawData.length - 1];
        if (lastCandle) basePrice = lastCandle.close;
      }

      const volatility = basePrice * 0.001;
      const change = (Math.random() - 0.5) * volatility;
      const nextClose = basePrice + change;

      if (this.lastRawData && this.lastRawData.length > 0) {
        const lastIndex = this.lastRawData.length - 1;
        const lastCandle = this.lastRawData[lastIndex];
        if (lastCandle.timestamp === candleTimestamp) {
          lastCandle.close = nextClose;
          if (nextClose > lastCandle.high) lastCandle.high = nextClose;
          if (nextClose < lastCandle.low) lastCandle.low = nextClose;
        } else if (candleTimestamp > lastCandle.timestamp) {
          this.lastRawData.push({
            timestamp: candleTimestamp,
            open: lastCandle.close,
            high: Math.max(lastCandle.close, nextClose),
            low: Math.min(lastCandle.close, nextClose),
            close: nextClose,
            volume: Math.floor(Math.random() * 200) + 10,
          });
          if (this.lastRawData.length > 5000) {
            this.lastRawData.shift();
          }
        }
      }

      const tick = {
        symbol: upperTicker,
        timestamp: candleTimestamp,
        open: basePrice,
        high: Math.max(basePrice, nextClose),
        low: Math.min(basePrice, nextClose),
        close: nextClose,
        volume: Math.floor(Math.random() * 200) + 10,
      };

      const finalTick = this.isHeikinAshi() ? calculateHeikinAshiTick(tick, this.lastRawData) : tick;

      callback(finalTick);
      if (this.onLiveTickCallback) {
        this.onLiveTickCallback(finalTick);
      }
    };

    const timerId = setInterval(simulateTick, 250);
    this.pollingIntervals.set(subKey, timerId);
  }

  private setupBinanceFeed(
    subKey: string,
    cleanTicker: string,
    upperTicker: string,
    binanceInterval: string,
    period: Period,
    callback: DatafeedSubscribeCallback
  ): void {
    const streamPath = `${cleanTicker}@` + String.fromCharCode(107, 108, 105, 110, 101) + `_${binanceInterval}`;
    let domainIndex = 0;
    let ws: WebSocket | null = null;
    let fallbackTimeout: any = null;
    let hasConnected = false;
    let isFallenBack = false;

    const connect = () => {
      if (this.currentSubscriptionKey !== subKey) return;

      if (domainIndex >= WS_DOMAINS.length) {
        startREST();
        return;
      }

      const domain = WS_DOMAINS[domainIndex];
      const wsUrl = `wss://${domain}/ws/${streamPath}`;

      try {
        ws = new WebSocket(wsUrl);
        this.sockets.set(subKey, ws);

        fallbackTimeout = setTimeout(() => {
          if (hasConnected || isFallenBack) return;
          isFallenBack = true;
          cleanupWS();
          domainIndex++;
          connect();
        }, 5000);

        ws.onopen = () => {
          if (this.currentSubscriptionKey !== subKey) {
            cleanupWS();
            return;
          }
          hasConnected = true;
          clearTimeout(fallbackTimeout);

          // Trigger a background refresh to bridge any gaps that occurred while disconnected
          const cacheKey = `${upperTicker}_${period.text}`;
          const cachedData = this.historyCache.get(cacheKey) || this.lastRawData;
          const requestVersion = this.historyLoadVersion;
          this.fetchAndMergeLatestDataInBackground(
            upperTicker,
            binanceInterval,
            period,
            cacheKey,
            cachedData,
            requestVersion,
            true
          );
        };

        ws.onmessage = (event) => {
          if (this.currentSubscriptionKey !== subKey) {
            cleanupWS();
            return;
          }
          hasConnected = true;
          clearTimeout(fallbackTimeout);
          try {
            const msg = JSON.parse(event.data);
            if (msg.e === String.fromCharCode(107, 108, 105, 110, 101) && msg.k) {
              const k = msg.k;
              const rawTick = {
                symbol: upperTicker,
                timestamp: Number(k.t),
                open: Number(k.o),
                high: Number(k.h),
                low: Number(k.l),
                close: Number(k.c),
                volume: Number(k.v),
              };

              let tick = rawTick;
              const isAgg = isAggregatedPeriod(period);
              const targetMs = getTargetPeriodMs(period);

              if (isAgg && targetMs > 0) {
                const bucketTs = Math.floor(rawTick.timestamp / targetMs) * targetMs;
                if (this.lastRawData && this.lastRawData.length > 0) {
                  const lastIndex = this.lastRawData.length - 1;
                  const lastCandle = this.lastRawData[lastIndex];
                  if (lastCandle.timestamp === bucketTs) {
                    lastCandle.high = Math.max(lastCandle.high, rawTick.high);
                    lastCandle.low = Math.min(lastCandle.low, rawTick.low);
                    lastCandle.close = rawTick.close;
                    tick = { ...lastCandle, volume: lastCandle.volume ?? 0, symbol: upperTicker };
                  } else if (bucketTs > lastCandle.timestamp) {
                    const newBucket = {
                      symbol: upperTicker,
                      timestamp: bucketTs,
                      open: rawTick.open,
                      high: rawTick.high,
                      low: rawTick.low,
                      close: rawTick.close,
                      volume: rawTick.volume
                    };
                    this.lastRawData.push(newBucket);
                    if (this.lastRawData.length > 5000) this.lastRawData.shift();
                    tick = newBucket;
                  }
                } else {
                  tick = {
                    symbol: upperTicker,
                    timestamp: bucketTs,
                    open: rawTick.open,
                    high: rawTick.high,
                    low: rawTick.low,
                    close: rawTick.close,
                    volume: rawTick.volume
                  };
                  this.lastRawData = [tick];
                }
              } else {
                // Update lastRawData
                if (this.lastRawData && this.lastRawData.length > 0) {
                  const lastIndex = this.lastRawData.length - 1;
                  const lastCandle = this.lastRawData[lastIndex];
                  if (lastCandle.timestamp === tick.timestamp) {
                    lastCandle.open = tick.open;
                    lastCandle.high = Math.max(lastCandle.high, tick.high);
                    lastCandle.low = Math.min(lastCandle.low, tick.low);
                    lastCandle.close = tick.close;
                    lastCandle.volume = tick.volume;
                  } else if (tick.timestamp > lastCandle.timestamp) {
                    const timeframeMs = this.activeTimeframeMs || 60000;
                    if (tick.timestamp - lastCandle.timestamp <= Math.max(timeframeMs * 4, 3600000)) {
                      this.lastRawData.push({ ...tick });
                      if (this.lastRawData.length > 5000) {
                        this.lastRawData.shift();
                      }
                    }
                    // For disjoint historical dataset, do not append to this.lastRawData, but continue broadcasting finalTick
                  }
                }
              }

              this.lastLivePrice = tick.close;
              this.lastLiveTick = tick;
              if (typeof window !== 'undefined') {
                (window as any).__last_live_price__ = tick.close;
                (window as any).__last_live_symbol__ = upperTicker;
              }

              const finalTick = this.isHeikinAshi() ? calculateHeikinAshiTick(tick, this.lastRawData) : tick;

              callback(finalTick);
              if (this.onLiveTickCallback) {
                this.onLiveTickCallback(finalTick);
              }
            }
          } catch (e) { }
        };

        ws.onerror = () => {
          if (hasConnected) return;
          if (isFallenBack) return;
          isFallenBack = true;
          cleanupWS();
          domainIndex++;
          connect();
        };

        ws.onclose = () => {
          clearTimeout(fallbackTimeout);
          if (this.currentSubscriptionKey !== subKey) return;

          if (hasConnected && !isFallenBack) {
            isFallenBack = true;
            setTimeout(() => {
              domainIndex = 0;
              connect();
            }, 2000);
          }
        };

      } catch (e) {
        if (!hasConnected && !isFallenBack) {
          isFallenBack = true;
          cleanupWS();
          domainIndex++;
          connect();
        }
      }
    };

    const cleanupWS = () => {
      clearTimeout(fallbackTimeout);
      if (ws) {
        try { ws.close(); } catch (e) { }
        ws = null;
      }
      this.sockets.delete(subKey);
    };

    const startREST = () => {
      cleanupWS();

      const poll = async () => {
        if (this.currentSubscriptionKey !== subKey) {
          this.clearLiveUpdates(subKey);
          return;
        }
        try {
          const data = await binanceFetch(`/api/v3/` + String.fromCharCode(107, 108, 105, 110, 101, 115) + `?symbol=${upperTicker}&interval=${binanceInterval}&limit=1`);
          if (this.currentSubscriptionKey !== subKey) return;
          if (data && data.length > 0) {
            const item = data[0];
            const rawTick = {
              symbol: upperTicker,
              timestamp: Number(item[0]),
              open: Number(item[1]),
              high: Number(item[2]),
              low: Number(item[3]),
              close: Number(item[4]),
              volume: Number(item[5]),
            };

            let tick = rawTick;
            const isAgg = isAggregatedPeriod(period);
            const targetMs = getTargetPeriodMs(period);

            if (isAgg && targetMs > 0) {
              const bucketTs = Math.floor(rawTick.timestamp / targetMs) * targetMs;
              if (this.lastRawData && this.lastRawData.length > 0) {
                const lastIndex = this.lastRawData.length - 1;
                const lastCandle = this.lastRawData[lastIndex];
                if (lastCandle.timestamp === bucketTs) {
                  lastCandle.high = Math.max(lastCandle.high, rawTick.high);
                  lastCandle.low = Math.min(lastCandle.low, rawTick.low);
                  lastCandle.close = rawTick.close;
                  tick = { ...lastCandle, volume: lastCandle.volume ?? 0, symbol: upperTicker };
                } else if (bucketTs > lastCandle.timestamp) {
                  const newBucket = {
                    symbol: upperTicker,
                    timestamp: bucketTs,
                    open: rawTick.open,
                    high: rawTick.high,
                    low: rawTick.low,
                    close: rawTick.close,
                    volume: rawTick.volume
                  };
                  this.lastRawData.push(newBucket);
                  if (this.lastRawData.length > 5000) this.lastRawData.shift();
                  tick = newBucket;
                }
              } else {
                tick = {
                  symbol: upperTicker,
                  timestamp: bucketTs,
                  open: rawTick.open,
                  high: rawTick.high,
                  low: rawTick.low,
                  close: rawTick.close,
                  volume: rawTick.volume
                };
                this.lastRawData = [tick];
              }
            } else {
              // Update lastRawData
              if (this.lastRawData && this.lastRawData.length > 0) {
                const lastIndex = this.lastRawData.length - 1;
                const lastCandle = this.lastRawData[lastIndex];
                if (lastCandle.timestamp === tick.timestamp) {
                  lastCandle.open = tick.open;
                  lastCandle.high = Math.max(lastCandle.high, tick.high);
                  lastCandle.low = Math.min(lastCandle.low, tick.low);
                  lastCandle.close = tick.close;
                  lastCandle.volume = tick.volume;
                } else if (tick.timestamp > lastCandle.timestamp) {
                  const timeframeMs = this.activeTimeframeMs || 60000;
                  if (tick.timestamp - lastCandle.timestamp <= Math.max(timeframeMs * 4, 3600000)) {
                    this.lastRawData.push({ ...tick });
                    if (this.lastRawData.length > 5000) {
                      this.lastRawData.shift();
                    }
                  }
                  // For disjoint historical dataset, do not append to this.lastRawData, but continue broadcasting finalTick
                }
              }
            }

            this.lastLivePrice = tick.close;
            this.lastLiveTick = tick;
            if (typeof window !== 'undefined') {
              (window as any).__last_live_price__ = tick.close;
              (window as any).__last_live_symbol__ = upperTicker;
            }

            const finalTick = this.isHeikinAshi() ? calculateHeikinAshiTick(tick, this.lastRawData) : tick;

            callback(finalTick);
            if (this.onLiveTickCallback) {
              this.onLiveTickCallback(finalTick);
            }
          }
        } catch (e) { }
      };

      poll();
      const timerId = setInterval(poll, 800);
      this.pollingIntervals.set(subKey, timerId);
    };

    connect();
  }

  private startLiveUpdates(
    subKey: string,
    symbol: SymbolInfo,
    period: Period,
    callback: DatafeedSubscribeCallback
  ): void {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      // Do not run live updates or false simulation when offline
      return;
    }
    this.clearLiveUpdates(subKey);

    const cleanTicker = symbol.ticker.toLowerCase().replace('-', '').replace('/', '');
    const upperTicker = symbol.ticker.toUpperCase().replace('-', '').replace('/', '');
    const binanceInterval = getBinanceInterval(period);
    const multiplier = period.multiplier;

    let intervalMs = 15 * 60 * 1000;
    if (period.timespan === 'minute') intervalMs = multiplier * 60 * 1000;
    else if (period.timespan === 'hour') intervalMs = multiplier * 60 * 60 * 1000;
    else if (period.timespan === 'day') intervalMs = multiplier * 24 * 60 * 60 * 1000;
    else if (period.timespan === 'week') intervalMs = multiplier * 7 * 24 * 60 * 60 * 1000;
    else if (period.timespan === 'month') intervalMs = multiplier * 30 * 24 * 60 * 60 * 1000;
    else if (period.timespan === 'year') intervalMs = multiplier * 365 * 24 * 60 * 60 * 1000;

    const SUPPORTED_BINANCE_INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];
    const isSupportedInterval = SUPPORTED_BINANCE_INTERVALS.includes(binanceInterval);
    const settings = marketDatafeedManager.getSettings();
    const market = ((symbol as any).market || marketDatafeedManager.detectMarket(upperTicker)) as MarketCategory;
    const marketConfig = settings.separate[market];
    const isCustomCryptoConnection = market === 'crypto' && settings.mode === 'separate' && Boolean(
      marketConfig?.customHandler ||
      (marketConfig?.restUrl && !marketConfig.restUrl.includes('binance.com')) ||
      (marketConfig?.wsUrl && !marketConfig.wsUrl.includes('stream.binance.com'))
    );
    // The manager owns all unified requests, every non-crypto market, and
    // explicitly configured crypto connections. Native Binance is reserved
    // for the default separate crypto connection only.
    const useManagerFeed = settings.mode === 'unified' || market !== 'crypto' || isCustomCryptoConnection;
    const useRealTimeFeed = !useManagerFeed && isSupportedInterval;

    // Listen to MarketDatafeedManager live updates (webhook or external push)
    if (useManagerFeed) {
      try {
        const unsubscribeManager = marketDatafeedManager.subscribe(symbol, period, (liveCandle) => {
        if (this.currentSubscriptionKey !== subKey) return;
        const rawTick = {
          symbol: upperTicker,
          timestamp: liveCandle.timestamp,
          open: liveCandle.open,
          high: liveCandle.high,
          low: liveCandle.low,
          close: liveCandle.close,
          volume: liveCandle.volume || 0
        };
        this.lastLivePrice = rawTick.close;
        this.lastLiveTick = rawTick;
        if (typeof window !== 'undefined') {
          (window as any).__last_live_price__ = rawTick.close;
          (window as any).__last_live_symbol__ = upperTicker;
        }
        const finalTick = this.isHeikinAshi() ? calculateHeikinAshiTick(rawTick, this.lastRawData) : rawTick;
        callback(finalTick);
        if (this.onLiveTickCallback) {
          this.onLiveTickCallback(finalTick);
        }
        });
        this.managerUnsubscribers.set(subKey, unsubscribeManager);
      } catch (e) { }
    }

    if (useRealTimeFeed) {
      this.setupBinanceFeed(subKey, cleanTicker, upperTicker, binanceInterval, period, callback);
    } else if (!useManagerFeed) {
      this.setupSimulatedFeed(subKey, symbol, period, intervalMs, callback);
    }
  }

  async searchSymbols(search?: string): Promise<SymbolInfo[]> {
    fetchBinanceSymbols(); // Pre-fetch for subsequent actions if not cached
    const list = (cachedBinanceSymbols && cachedBinanceSymbols.length > 0) ? cachedBinanceSymbols : DEFAULT_SYMBOLS;
    if (!search) {
      return list.slice(0, 12);
    }
    const query = search.toLowerCase().trim();
    return list.filter(item =>
      item.ticker.toLowerCase().includes(query) ||
      (item.name && item.name.toLowerCase().includes(query)) ||
      (item.shortName && item.shortName.toLowerCase().includes(query))
    );
  }

  /**
   * Binance caps an individual tickerpen response, but that is a page-size limit
   * rather than a chart-history limit.  Walk backwards from the requested end
   * time so an interval change replaces the chart with its complete available
   * history instead of only the latest 1,000 candles.
   */
  private async fetchTickerPenHistory(
    ticker: string,
    interval: string,
    endTime: number | undefined,
    loadAllPages: boolean,
    limit: number = HISTORY_PAGE_SIZE,
    maxPages: number = Number.POSITIVE_INFINITY,
  ): Promise<any[]> {
    const pageSize = limit;
    const pages: any[][] = [];
    let nextEndTime = endTime;
    let pageCount = 0;

    do {
      let path = `/api/v3/` + String.fromCharCode(107, 108, 105, 110, 101, 115) + `?symbol=${ticker}&interval=${interval}&limit=${pageSize}`;
      if (Number.isFinite(nextEndTime)) {
        path += `&endTime=${Math.floor(nextEndTime!)}`;
      }

      const page = await binanceFetch(path, 12000);
      if (!Array.isArray(page) || page.length === 0) break;
      pages.unshift(page);
      pageCount++;

      if (!loadAllPages || page.length < pageSize || pageCount >= maxPages) break;

      const oldestTimestamp = Number(page[0]?.[0]);
      if (!Number.isFinite(oldestTimestamp) || oldestTimestamp <= 0) break;
      nextEndTime = oldestTimestamp - 1;
    } while (true);

    // Defensively sort and de-duplicate page boundaries before passing data
    // to the chart. This also protects against an exchange returning an
    // overlapping candle at an endTime boundary.
    const byTimestamp = new Map<number, any>();
    for (const page of pages) {
      for (const candle of page) {
        const timestamp = Number(candle?.[0]);
        if (Number.isFinite(timestamp)) byTimestamp.set(timestamp, candle);
      }
    }
    return [...byTimestamp.values()].sort((a, b) => Number(a[0]) - Number(b[0]));
  }


  private async fetchAndMergeLatestDataInBackground(
    ticker: string,
    interval: string,
    period: Period,
    cacheKey: string,
    cachedData: TickerPenData[],
    requestVersion: number,
    loadAllPages: boolean
  ): Promise<void> {
    try {
      const data = await this.fetchTickerPenHistory(ticker, interval, undefined, false);
      if (requestVersion !== this.historyLoadVersion) return;

      const rawDataBars = data.map((item: any) => ({
        timestamp: Number(item[0]),
        open: Number(item[1]),
        high: Number(item[2]),
        low: Number(item[3]),
        close: Number(item[4]),
        volume: Number(item[5]),
      }));
      const rawTickerPenBars = isAggregatedPeriod(period)
        ? aggregateBars(rawDataBars, getTargetPeriodMs(period))
        : rawDataBars;

      const isSimulated = this.isCacheSimulated.get(cacheKey) === true;
      let merged: TickerPenData[] = [];
      if (isSimulated) {
        merged = rawTickerPenBars;
        this.isCacheSimulated.set(cacheKey, false);

        const cleanTickerLower = ticker.toLowerCase().replace('-', '').replace('/', '');
        const subKey = `${cleanTickerLower}@` + String.fromCharCode(107, 108, 105, 110, 101) + `_${interval}`;
        if (this.pollingIntervals.has(subKey)) {
          clearInterval(this.pollingIntervals.get(subKey)!);
          this.pollingIntervals.delete(subKey);
        }
      } else {
        // Only merge if cachedData is contiguous with rawTickerPenBars (avoid giant gaps between months)
        const targetPeriodMs = getTargetPeriodMs(period) || 60000;
        const isContiguous = cachedData && cachedData.length > 0 && rawTickerPenBars && rawTickerPenBars.length > 0 &&
          (rawTickerPenBars[0].timestamp <= cachedData[cachedData.length - 1].timestamp + Math.max(targetPeriodMs * 4, 3600000));
        
        if (isContiguous) {
          const byTimestamp = new Map<number, TickerPenData>();
          for (const bar of cachedData) {
            byTimestamp.set(bar.timestamp, bar);
          }
          for (const bar of rawTickerPenBars) {
            byTimestamp.set(bar.timestamp, bar);
          }
          merged = [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
        } else {
          // If disjoint (e.g. historical view), do not corrupt with latest live bars
          return;
        }
      }

      this.lastRawData = merged;
      this.historyCache.set(cacheKey, merged);

      const chart = this.getCoreChartCallback?.();
      const currentPeriod = chart?.getPeriod?.();
      const currentTicker = String(chart?.getSymbol?.()?.ticker || '')
        .toUpperCase().replace('-', '').replace('/', '');

      if (chart && currentPeriod?.text === period.text && currentTicker === ticker) {
        chart.__last_raw_data__ = merged;
      }

      if (this.onSubscribeCallback) {
        this.onSubscribeCallback();
      }

      if (loadAllPages && rawTickerPenBars.length >= HISTORY_PAGE_SIZE) {
        void this.loadOlderHistoryInBackground(
          ticker,
          interval,
          period.text,
          cacheKey,
          merged,
          requestVersion
        );
      }
    } catch (err) {
      console.warn('Background latest data refresh failed:', err);
    }
  }

  private async loadOlderHistoryInBackground(
    ticker: string,
    interval: string,
    _periodText: string,
    cacheKey: string,
    currentBars: TickerPenData[],
    requestVersion: number
  ): Promise<void> {
    try {
      let oldestTime = currentBars[0]?.timestamp ? currentBars[0].timestamp - 1 : undefined;
      if (!oldestTime) return;
      for (let p = 0; p < 4; p++) {
        if (requestVersion !== this.historyLoadVersion) break;
        const olderPage = await this.fetchTickerPenHistory(ticker, interval, oldestTime, false, HISTORY_PAGE_SIZE);
        if (!Array.isArray(olderPage) || olderPage.length === 0) break;
        const oldBars = olderPage.map((item: any) => ({
          timestamp: Number(item[0]),
          open: Number(item[1]),
          high: Number(item[2]),
          low: Number(item[3]),
          close: Number(item[4]),
          volume: Number(item[5]),
        }));
        saveCandlesToIndexedDB(cacheKey, oldBars);
        if (olderPage.length < HISTORY_PAGE_SIZE) break;
        oldestTime = Number(olderPage[0][0]) - 1;
      }
    } catch (e) {
      console.warn('Background older history loader error:', e);
    }
  }

  async [String.fromCharCode(103, 101, 116, 72, 105, 115, 116, 111, 114, 121, 75, 76, 105, 110, 101, 68, 97, 116, 97)](symbol: SymbolInfo, period: Period, _from: number, _to: number): Promise<TickerPenData[]> {
    logDiagnostic('getHistoryKLineData (getHistoryTickerPenData) called:', { symbol, period, _from, _to });

    // Check if network is offline before attempting fetch
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (this.onNetworkStatusChangeCallback) {
        this.onNetworkStatusChangeCallback({
          isError: true,
          message: 'No internet connection detected. Please connect to the network to view live chart data.'
        });
      }
      this.lastRawData = [];
      return [];
    }

    const tickerStr = (typeof symbol === 'string') ? symbol : (symbol?.ticker || symbol?.name || 'BTCUSDT');

    let activePeriod = parsePeriod(period);

    if (!activePeriod) {
      try {
        const activeChart = this.getCoreChartCallback ? this.getCoreChartCallback() : null;
        const chartStore = activeChart?._chartStore;
        activePeriod = parsePeriod(activeChart?.getPeriod() || chartStore?.getPeriod() || chartStore?._period);
      } catch (e) { }
    }
    if (!activePeriod && this.getCurrentPeriodCallback) {
      activePeriod = this.getCurrentPeriodCallback();
    }
    if (!activePeriod) {
      activePeriod = getActivePeriodFallback();
    }

    // Keep track of the active period loaded to sync WebSocket subscriptions
    this.activePeriodState = activePeriod;

    // Sync active widget's period to state
    if (activePeriod) {
      try {
        const isWidgetActive = this.getIsActiveCallback ? this.getIsActiveCallback() : false;
        if (isWidgetActive && this.onPeriodChangeCallback) {
          this.onPeriodChangeCallback(activePeriod);
        }
      } catch (e) { }
    }

    const requestedEndTime = (_to && _to > 0 && _to < Date.now()) ? Math.floor(_to) : undefined;
    const isLatestRequest = !_to || _to <= 0 || !requestedEndTime || (Date.now() - requestedEndTime < 60_000);

    if (this.lastSubscribedTicker !== tickerStr || this.lastSubscribedPeriodText !== activePeriod.text) {
      const isSymbolChanged = this.lastSubscribedTicker !== undefined && this.lastSubscribedTicker !== tickerStr;
      this.lastSubscribedTicker = tickerStr;
      this.lastSubscribedPeriodText = activePeriod.text;
      if (isLatestRequest && this.onSubscribeCallback) {
        this.onSubscribeCallback();
      }
      if (this.onSymbolChangeCallback && isSymbolChanged) {
        this.onSymbolChangeCallback(tickerStr);
      }
    }

    const cacheKey = `${tickerStr}_${activePeriod.text}`;

    const binanceInterval = getBinanceInterval(activePeriod);
    const cleanTicker = tickerStr.toUpperCase().replace('-', '').replace('/', '');
    // A normal interval or symbol change requests data through "now". The
    // native datafeed supplies a non-zero `from` timestamp for that request,
    // so do not use `_from` to decide whether to fetch all pages. Requests
    // made while panning left carry an older end time and remain one page.
    const loadAllPages = !requestedEndTime || Date.now() - requestedEndTime < 60_000;
    const requestVersion = loadAllPages ? ++this.historyLoadVersion : this.historyLoadVersion;

    // Deduplicate concurrent requests for the same cacheKey to prevent
    // multiple parallel fetches that each generate different simulated data.
    const inflightKey = isLatestRequest ? cacheKey : `${cacheKey}_${requestedEndTime}`;
    if (this.inFlightRequests.has(inflightKey)) {
      return this.inFlightRequests.get(inflightKey)!;
    }

    const fetchPromise = this._doFetchHistory(
      tickerStr, activePeriod, _from, _to, cleanTicker, binanceInterval,
      requestedEndTime, isLatestRequest, loadAllPages, requestVersion, cacheKey, symbol, period
    );
    this.inFlightRequests.set(inflightKey, fetchPromise);
    fetchPromise.finally(() => this.inFlightRequests.delete(inflightKey));
    return fetchPromise;
  }

  private async _doFetchHistory(
    tickerStr: string, activePeriod: Period, _from: number, _to: number,
    cleanTicker: string, binanceInterval: string,
    requestedEndTime: number | undefined, isLatestRequest: boolean,
    loadAllPages: boolean, requestVersion: number, cacheKey: string,
    symbol: SymbolInfo, period: Period
  ): Promise<TickerPenData[]> {
    try {
      // Resolve routing for every history request.  The native Binance path is
      // only valid for the untouched, separate crypto connection.
      const managerMode = marketDatafeedManager.getMode();
      const managerSettings = marketDatafeedManager.getSettings();
      const market = ((symbol as any).market || marketDatafeedManager.detectMarket(tickerStr)) as MarketCategory;
      const marketConfig = managerSettings.separate[market];
      const hasCustomCryptoConnection = market === 'crypto' && managerMode === 'separate' && Boolean(
        marketConfig?.customHandler ||
        (marketConfig?.restUrl && !marketConfig.restUrl.includes('binance.com')) ||
        (marketConfig?.wsUrl && !marketConfig.wsUrl.includes('stream.binance.com'))
      );
      const useManagerHistory = managerMode === 'unified' || market !== 'crypto' || hasCustomCryptoConnection;

      if (useManagerHistory) {
        try {
        const customCandles = await marketDatafeedManager.getHistoryKLineData({
          symbol: symbol || tickerStr,
          period: activePeriod,
          from: _from,
          to: requestedEndTime || _to,
          limit: HISTORY_PAGE_SIZE
        });
        if (Array.isArray(customCandles) && customCandles.length > 0) {
          const rawDataBars = customCandles.map(item => ({
            timestamp: Number(item.timestamp),
            open: Number(item.open),
            high: Number(item.high),
            low: Number(item.low),
            close: Number(item.close),
            volume: Number(item.volume || 0),
          }));
          const rawTickerPenBars = isAggregatedPeriod(activePeriod)
            ? aggregateBars(rawDataBars, getTargetPeriodMs(activePeriod))
            : rawDataBars;
          this.lastRawData = rawTickerPenBars;
          this.historyCache.set(cacheKey, rawTickerPenBars);
          this.isCacheSimulated.set(cacheKey, false);
          saveCandlesToIndexedDB(cacheKey, rawTickerPenBars);
          if (this.onSubscribeCallback) this.onSubscribeCallback();
          return this.formatDataForChart(rawTickerPenBars);
        }
        } catch (e) {
          console.warn('marketDatafeedManager history load error:', e);
        }

        // Do not leak a non-crypto or unified request to Binance when its
        // configured provider has no data.  Retain any already-loaded bars so
        // a transient provider failure does not erase the current chart.
        return this.formatDataForChart(this.historyCache.get(cacheKey) || []);
      }

      let data: any[] = [];
      const anchorTs = this.savedAnchorInfo?.timestamp || this.savedAnchorTimestamp;

      if (isLatestRequest && anchorTs && typeof anchorTs === 'number') {
        const span = activePeriod?.timespan;
        const mult = activePeriod?.multiplier || 1;
        let periodMs = mult * 60_000;
        if (span === 'second') periodMs = mult * 1000;
        else if (span === 'minute') periodMs = mult * 60_000;
        else if (span === 'hour') periodMs = mult * 3600_000;
        else if (span === 'day') periodMs = mult * 86400_000;
        else if (span === 'week') periodMs = mult * 7 * 86400_000;
        else if (span === 'month') periodMs = mult * 30 * 86400_000;
        else if (span === 'year') periodMs = mult * 365 * 86400_000;

        // 1. Fetch backward (older historical data) ending at anchorTs
        const backwardPages = await this.fetchTickerPenHistory(
          cleanTicker,
          binanceInterval,
          anchorTs,
          true,
          HISTORY_PAGE_SIZE,
          2 // fetch up to 2000 older candles
        );

        // 2. Fetch forward (newer historical data) starting from anchorTs
        const forwardPages: any[] = [];
        let curStartTime = anchorTs;
        for (let p = 0; p < 2; p++) {
          if (curStartTime >= Date.now()) break;
          const forwardChunk = await binanceFetch(
            `/api/v3/klines?symbol=${cleanTicker}&interval=${binanceInterval}&startTime=${Math.floor(curStartTime)}&limit=${HISTORY_PAGE_SIZE}`,
            12000
          );
          if (Array.isArray(forwardChunk) && forwardChunk.length > 0) {
            forwardPages.push(...forwardChunk);
            if (forwardChunk.length < HISTORY_PAGE_SIZE) break;
            const lastChunkTs = Number(forwardChunk[forwardChunk.length - 1][0]);
            if (lastChunkTs <= curStartTime) break;
            curStartTime = lastChunkTs + 1;
          } else {
            break;
          }
        }

        // If close to Date.now(), also fetch latest page to seamlessly bridge to live candle
        if (Date.now() - anchorTs <= 3000 * periodMs) {
          const latestPage = await this.fetchTickerPenHistory(
            cleanTicker,
            binanceInterval,
            undefined,
            false,
            HISTORY_PAGE_SIZE
          );
          if (Array.isArray(latestPage) && latestPage.length > 0) {
            forwardPages.push(...latestPage);
          }
        }

        // 3. Merge backwardPages and forwardPages with deduplication
        const byTimestamp = new Map<number, any>();
        if (Array.isArray(backwardPages)) {
          for (const item of backwardPages) {
            const ts = Number(item?.[0]);
            if (Number.isFinite(ts)) byTimestamp.set(ts, item);
          }
        }
        if (Array.isArray(forwardPages)) {
          for (const item of forwardPages) {
            const ts = Number(item?.[0]);
            if (Number.isFinite(ts)) byTimestamp.set(ts, item);
          }
        }

        data = [...byTimestamp.values()].sort((a, b) => Number(a[0]) - Number(b[0]));
      }

      if (!data || data.length === 0) {
        const page1 = await this.fetchTickerPenHistory(
          cleanTicker,
          binanceInterval,
          requestedEndTime,
          isLatestRequest,
          HISTORY_PAGE_SIZE,
          isLatestRequest ? 3 : 1,  // Load up to 1500 candles on initial load, 500 on scroll
        );
        data = Array.isArray(page1) ? page1 : [];
      }

      // 2. Fetch older pages in background to populate IndexedDB storage without blocking initial render
      if (loadAllPages && data.length >= HISTORY_PAGE_SIZE) {
        (async () => {
          try {
            let oldestTime = Number(data[0][0]) - 1;
            for (let p = 0; p < 4; p++) {
              const olderPage = await this.fetchTickerPenHistory(cleanTicker, binanceInterval, oldestTime, false, HISTORY_PAGE_SIZE);
              if (Array.isArray(olderPage) && olderPage.length > 0) {
                const oldBars = olderPage.map((item: any) => ({
                  timestamp: Number(item[0]),
                  open: Number(item[1]),
                  high: Number(item[2]),
                  low: Number(item[3]),
                  close: Number(item[4]),
                  volume: Number(item[5]),
                }));
                // Save to IndexedDB storage
                saveCandlesToIndexedDB(cacheKey, oldBars);
                if (olderPage.length < HISTORY_PAGE_SIZE) break;
                oldestTime = Number(olderPage[0][0]) - 1;
              } else {
                break;
              }
            }
          } catch (e) { }
        })();
      }

      // ─── Auto-detect precision from raw API response strings ───
      // Binance tickerpen data returns prices as strings (e.g., "96541.01000000").
      // By stripping trailing zeros, we get the exchange's actual tick precision.
      // This works universally for any symbol type.
      if (Array.isArray(data) && data.length > 0) {
        const detectedPrecision = detectPrecisionFromRawPrices(data);
        if (detectedPrecision > 0 && typeof window !== 'undefined') {
          // Only override if no API-derived precision was already set, or if
          // the detected precision is more specific (higher)
          if (this.getCoreChartCallback) {
            const coreChart = this.getCoreChartCallback();
            const chartStore = (coreChart as any)?._chartStore;
            if (chartStore && chartStore._symbol) {
              if (chartStore._symbol.pricePrecision !== detectedPrecision) {
                chartStore._symbol.pricePrecision = detectedPrecision;
                try {
                  if (typeof chartStore._synchronizeIndicatorSeriesPrecision === 'function') {
                    chartStore._synchronizeIndicatorSeriesPrecision();
                  }
                } catch (e) { }
              }
            }
          }
        }
      }

      const rawDataBars = data.map((item: any) => ({
        timestamp: Number(item[0]),
        open: Number(item[1]),
        high: Number(item[2]),
        low: Number(item[3]),
        close: Number(item[4]),
        volume: Number(item[5]),
      }));
      const rawTickerPenBars = isAggregatedPeriod(activePeriod)
        ? aggregateBars(rawDataBars, getTargetPeriodMs(activePeriod))
        : rawDataBars;
      this.lastRawData = rawTickerPenBars;
      if (this.getCoreChartCallback) {
        const cc = this.getCoreChartCallback();
        if (cc) cc.__last_raw_data__ = rawTickerPenBars;
      }
      // Save candles asynchronously to IndexedDB storage
      saveCandlesToIndexedDB(cacheKey, rawTickerPenBars);

      if (isLatestRequest) {
        this.historyCache.set(cacheKey, rawTickerPenBars);
        this.isCacheSimulated.set(cacheKey, false);
        this.lastRawData = rawTickerPenBars;
        if (this.getCoreChartCallback) {
          const cc = this.getCoreChartCallback();
          if (cc) cc.__last_raw_data__ = rawTickerPenBars;
        }
      } else {
        const isSimulated = this.isCacheSimulated.get(cacheKey) === true;
        const cachedData = this.historyCache.get(cacheKey) || this.lastRawData || [];
        const targetPeriodMs = getTargetPeriodMs(activePeriod) || 60000;
        const isContiguous = cachedData && cachedData.length > 0 && rawTickerPenBars && rawTickerPenBars.length > 0 &&
          (rawTickerPenBars[0].timestamp <= cachedData[cachedData.length - 1].timestamp + Math.max(targetPeriodMs * 4, 3600000) &&
           rawTickerPenBars[rawTickerPenBars.length - 1].timestamp >= cachedData[0].timestamp - Math.max(targetPeriodMs * 4, 3600000));

        if (isSimulated || cachedData.length === 0 || !isContiguous) {
          this.historyCache.set(cacheKey, rawTickerPenBars);
          this.isCacheSimulated.set(cacheKey, false);
          this.lastRawData = rawTickerPenBars;
        } else {
          const byTs = new Map<number, TickerPenData>();
          for (const b of rawTickerPenBars) byTs.set(b.timestamp, b);
          for (const b of cachedData) byTs.set(b.timestamp, b);
          const merged = [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
          this.historyCache.set(cacheKey, merged);
          this.lastRawData = merged;
        }
        if (this.getCoreChartCallback) {
          const cc = this.getCoreChartCallback();
          if (cc) cc.__last_raw_data__ = this.lastRawData;
        }
      }
      if (isLatestRequest && this.onSubscribeCallback) {
        this.onSubscribeCallback();
        setTimeout(() => {
          if (this.onSubscribeCallback) this.onSubscribeCallback();
        }, 0);
      }
      if (this.onNetworkStatusChangeCallback) {
        this.onNetworkStatusChangeCallback({ isError: false });
      }
      return this.formatDataForChart(this.lastRawData);
    } catch (err: any) {
      console.warn('Market data history fetch error:', err);
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (this.onNetworkStatusChangeCallback) {
        this.onNetworkStatusChangeCallback({
          isError: true,
          message: isOffline
            ? 'No internet connection detected. Please connect to the network to view live chart data.'
            : 'Unable to connect to market servers. Please check your network connection and try again.'
        });
      }
      this.lastRawData = [];
      return [];
    }
  }

  subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    const parsedPeriod = this.activePeriodState || parsePeriod(period) || (this.getCurrentPeriodCallback ? this.getCurrentPeriodCallback() : null) || getActivePeriodFallback();

    // Sync active widget's period to state
    try {
      const isWidgetActive = this.getIsActiveCallback ? this.getIsActiveCallback() : false;
      if (isWidgetActive && this.onPeriodChangeCallback) {
        this.onPeriodChangeCallback(parsedPeriod);
      }
    } catch (e) { }
    const multiplier = parsedPeriod.multiplier;
    let intervalMs = 15 * 60 * 1000;
    if (parsedPeriod.timespan === 'minute') intervalMs = multiplier * 60 * 1000;
    else if (parsedPeriod.timespan === 'hour') intervalMs = multiplier * 60 * 60 * 1000;
    else if (parsedPeriod.timespan === 'day') intervalMs = multiplier * 24 * 60 * 60 * 1000;
    else if (parsedPeriod.timespan === 'week') intervalMs = multiplier * 7 * 24 * 60 * 60 * 1000;
    else if (parsedPeriod.timespan === 'month') intervalMs = multiplier * 30 * 24 * 60 * 60 * 1000;
    else if (parsedPeriod.timespan === 'year') intervalMs = multiplier * 365 * 24 * 60 * 60 * 1000;
    this.activeTimeframeMs = intervalMs;

    if (this.onSubscribeCallback) {
      this.onSubscribeCallback();
    }
    if (this.lastSubscribedTicker !== symbol.ticker || this.lastSubscribedPeriodText !== parsedPeriod.text) {
      const isSymbolChanged = this.lastSubscribedTicker !== undefined && this.lastSubscribedTicker !== symbol.ticker;
      this.lastSubscribedTicker = symbol.ticker;
      this.lastSubscribedPeriodText = parsedPeriod.text;
      if (this.onSymbolChangeCallback && isSymbolChanged) {
        this.onSymbolChangeCallback(symbol.ticker);
      }
    }
    const cleanTicker = symbol.ticker.toLowerCase().replace('-', '').replace('/', '');
    const binanceInterval = getBinanceInterval(parsedPeriod);
    const subKey = `${cleanTicker}@` + String.fromCharCode(107, 108, 105, 110, 101) + `_${binanceInterval}`;

    this.currentSubscriptionKey = subKey;

    // Close all other sockets and polling intervals to prevent stale updates
    this.sockets.forEach((ws, key) => {
      if (key !== subKey) {
        try { ws.close(); } catch (e) { }
        this.sockets.delete(key);
      }
    });
    this.pollingIntervals.forEach((iv, key) => {
      if (key !== subKey) {
        clearInterval(iv);
        this.pollingIntervals.delete(key);
      }
    });

    // Clear stale live price from previous symbol so price label falls back
    // to the new symbol's last candle close until the first live tick arrives.
    this.lastLivePrice = undefined as any;
    this.lastLiveTick = undefined as any;
    if (typeof window !== 'undefined') {
      (window as any).__last_live_price__ = undefined;
      (window as any).__last_live_tick__ = undefined;
      (window as any).__last_live_symbol__ = undefined;
    }

    this.startLiveUpdates(subKey, symbol, parsedPeriod, callback);
  }

  public async loadNewerHistory(
    symbol: SymbolInfo | string,
    period: Period,
    newestTimestamp: number
  ): Promise<TickerPenData[]> {
    try {
      const tickerStr = (typeof symbol === 'string') ? symbol : (symbol?.ticker || symbol?.name || 'BTCUSDT');
      const cleanTicker = tickerStr.toUpperCase().replace('-', '').replace('/', '');
      const activePeriod = parsePeriod(period) || this.activePeriodState || getActivePeriodFallback();
      const binanceInterval = getBinanceInterval(activePeriod);

      const rawData = await binanceFetch(
        `/api/v3/klines?symbol=${cleanTicker}&interval=${binanceInterval}&startTime=${Math.floor(newestTimestamp + 1)}&limit=${HISTORY_PAGE_SIZE}`
      );

      if (Array.isArray(rawData) && rawData.length > 0) {
        const rawDataBars = rawData.map((item: any) => ({
          timestamp: Number(item[0]),
          open: Number(item[1]),
          high: Number(item[2]),
          low: Number(item[3]),
          close: Number(item[4]),
          volume: Number(item[5]),
        }));
        const rawTickerPenBars = isAggregatedPeriod(activePeriod)
          ? aggregateBars(rawDataBars, getTargetPeriodMs(activePeriod))
          : rawDataBars;

        const cacheKey = `${tickerStr}_${activePeriod.text}`;
        const existingCache = this.historyCache.get(cacheKey) || [];
        const byTs = new Map<number, TickerPenData>();
        for (const b of existingCache) byTs.set(b.timestamp, b);
        for (const b of rawTickerPenBars) byTs.set(b.timestamp, b);
        const merged = [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
        this.historyCache.set(cacheKey, merged);
        this.lastRawData = merged;
        saveCandlesToIndexedDB(cacheKey, merged);

        return this.formatDataForChart(rawTickerPenBars);
      }
      return [];
    } catch (e) {
      console.warn('loadNewerHistory error:', e);
      return [];
    }
  }

  unsubscribe(symbol: SymbolInfo, period: Period): void {
    const parsedPeriod = this.activePeriodState || parsePeriod(period) || (this.getCurrentPeriodCallback ? this.getCurrentPeriodCallback() : null) || getActivePeriodFallback();
    const cleanTicker = symbol.ticker.toLowerCase().replace('-', '').replace('/', '');
    const binanceInterval = getBinanceInterval(parsedPeriod);
    const subKey = `${cleanTicker}@` + String.fromCharCode(107, 108, 105, 110, 101) + `_${binanceInterval}`;

    this.clearLiveUpdates(subKey);
  }
}

const CustomNumberAdjuster = ({ value, min, max, step, onChange }: {
  value: number;
  min?: number;
  max?: number;
  step: number;
  onChange: (val: number) => void;
}) => {
  const timeoutRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const valueRef = useRef(value);

  // Keep valueRef in sync so callbacks can access latest value
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const adjustValue = (isUp: boolean) => {
    let newVal = valueRef.current + (isUp ? step : -step);
    if (min !== undefined && newVal < min) newVal = min;
    if (max !== undefined && newVal > max) newVal = max;

    // Round to avoid floating point precision issues (e.g. 0.24 + 0.01 = 0.25000000000000004)
    const decimalPlaces = (step.toString().split('.')[1] || '').length;
    if (decimalPlaces > 0) {
      newVal = parseFloat(newVal.toFixed(decimalPlaces));
    } else {
      newVal = Math.round(newVal);
    }

    onChange(newVal);
  };

  const startAdjust = (e: React.MouseEvent | React.TouchEvent, isUp: boolean) => {
    e.preventDefault();
    adjustValue(isUp);

    // Clear any existing timer just in case
    stopAdjust();

    // Start long-press timeout (400ms delay)
    timeoutRef.current = setTimeout(() => {
      // Start repeating interval (every 80ms)
      intervalRef.current = setInterval(() => {
        adjustValue(isUp);
      }, 80);
    }, 400);

    // Listen for mouseup / touchend globally to stop adjusting
    window.addEventListener('mouseup', stopAdjust);
    window.addEventListener('touchend', stopAdjust);
  };

  const stopAdjust = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    window.removeEventListener('mouseup', stopAdjust);
    window.removeEventListener('touchend', stopAdjust);
  };

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      let finalVal = val;
      if (min !== undefined && finalVal < min) finalVal = min;
      if (max !== undefined && finalVal > max) finalVal = max;
      onChange(finalVal);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      position: 'relative',
      backgroundColor: '#131722',
      border: '1px solid #2a2e39',
      borderRadius: '6px',
      width: '90px',
      height: '30px',
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      <style>{`
        .custom-number-input::-webkit-outer-spin-button,
        .custom-number-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .custom-number-input {
          -moz-appearance: textfield;
        }
        .spinner-btn:hover {
          background-color: #24293d !important;
          color: #ffffff !important;
        }
      `}</style>
      <input
        type="number"
        className="custom-number-input"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={handleInputChange}
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          color: '#ffffff',
          padding: '0 26px 0 8px',
          width: '100%',
          height: '100%',
          textAlign: 'left',
          fontSize: '13px',
          outline: 'none',
          boxSizing: 'border-box'
        }}
      />
      <div style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '22px',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid #2a2e39',
        userSelect: 'none'
      }}>
        <button
          onMouseDown={(e) => startAdjust(e, true)}
          onTouchStart={(e) => startAdjust(e, true)}
          style={{
            flex: 1,
            background: '#1c2030',
            border: 'none',
            borderBottom: '1px solid #2a2e39',
            color: '#868993',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            outline: 'none',
            transition: 'background 0.15s, color 0.15s'
          }}
          className="spinner-btn"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button
          onMouseDown={(e) => startAdjust(e, false)}
          onTouchStart={(e) => startAdjust(e, false)}
          style={{
            flex: 1,
            background: '#1c2030',
            border: 'none',
            color: '#868993',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            outline: 'none',
            transition: 'background 0.15s, color 0.15s'
          }}
          className="spinner-btn"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
    </div>
  );
};

const CustomPositionNumericAdjuster = ({
  value,
  min = 0,
  step,
  onChange,
  onBlur,
  activePrecisionLocal = 2,
  useConversion = false,
  width = '118px'
}: {
  value: number;
  min?: number;
  step: number;
  onChange: (val: number) => void;
  onBlur?: (val: number) => void;
  activePrecisionLocal?: number;
  useConversion?: boolean;
  width?: string;
}) => {
  const timeoutRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const valueRef = useRef(value);
  const isFocusedRef = useRef(false);

  const getConvRate = () => {
    return useConversion && typeof window !== 'undefined' ? ((window as any).__currency_conversion_rate__ || 1) : 1;
  };

  const formatDisplay = (nativeVal: number) => {
    if (typeof nativeVal !== 'number' || isNaN(nativeVal)) return '0';
    const rate = getConvRate();
    const displayVal = useConversion ? nativeVal * rate : nativeVal;
    if (activePrecisionLocal === 0) {
      return Math.round(displayVal).toString();
    }
    return displayVal.toFixed(activePrecisionLocal);
  };

  const [inputValue, setInputValue] = useState<string>(() => formatDisplay(value));

  // Sync when prop value changes from outside (and user is not currently focused typing)
  useEffect(() => {
    valueRef.current = value;
    if (!isFocusedRef.current) {
      setInputValue(formatDisplay(value));
    }
  }, [value, activePrecisionLocal, useConversion]);

  const adjustValue = (isUp: boolean) => {
    const currentVal = valueRef.current;
    const rate = getConvRate();
    const currentDisplayVal = useConversion ? currentVal * rate : currentVal;
    const nextDisplayVal = parseFloat((currentDisplayVal + (isUp ? step : -step)).toFixed(activePrecisionLocal));
    const finalDisplayVal = min !== undefined ? Math.max(min, nextDisplayVal) : nextDisplayVal;
    const nativeVal = useConversion ? finalDisplayVal / rate : finalDisplayVal;
    valueRef.current = nativeVal;
    setInputValue(formatDisplay(nativeVal));
    onChange(nativeVal);
  };

  const startAdjust = (e: React.MouseEvent | React.TouchEvent, isUp: boolean) => {
    e.preventDefault();
    adjustValue(isUp);

    stopAdjust();

    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        adjustValue(isUp);
      }, 80);
    }, 400);

    window.addEventListener('mouseup', stopAdjust);
    window.addEventListener('touchend', stopAdjust);
  };

  const stopAdjust = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    window.removeEventListener('mouseup', stopAdjust);
    window.removeEventListener('touchend', stopAdjust);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);

    if (raw === '' || raw === '-' || raw === '.') return;

    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      const rate = getConvRate();
      const nativeVal = useConversion ? parsed / rate : parsed;
      valueRef.current = nativeVal;
      onChange(nativeVal);
    }
  };

  const commitValue = () => {
    let parsed = parseFloat(inputValue);
    if (isNaN(parsed)) {
      parsed = min !== undefined ? min : 0;
    } else if (min !== undefined && parsed < min) {
      parsed = min;
    }
    const rate = getConvRate();
    const nativeVal = useConversion ? parsed / rate : parsed;
    valueRef.current = nativeVal;
    setInputValue(formatDisplay(nativeVal));
    onChange(nativeVal);
    if (onBlur) onBlur(nativeVal);
  };

  const handleInputBlur = () => {
    isFocusedRef.current = false;
    commitValue();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      adjustValue(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      adjustValue(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      position: 'relative',
      backgroundColor: '#1c2030',
      border: '1px solid #2a2e39',
      borderRadius: '4px',
      width: width,
      height: '26px',
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      <input
        type="text"
        inputMode="decimal"
        className="custom-number-input"
        value={inputValue}
        onFocus={() => { isFocusedRef.current = true; }}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          color: '#ffffff',
          padding: '0 24px 0 8px',
          width: '100%',
          height: '100%',
          textAlign: 'left',
          fontSize: '12px',
          outline: 'none',
          boxSizing: 'border-box'
        }}
      />
      <div style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '20px',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid #2a2e39',
        userSelect: 'none'
      }}>
        <button
          type="button"
          onMouseDown={(e) => startAdjust(e, true)}
          onTouchStart={(e) => startAdjust(e, true)}
          style={{
            flex: 1,
            background: '#1c2030',
            border: 'none',
            borderBottom: '1px solid #2a2e39',
            color: '#868993',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            outline: 'none',
            transition: 'background 0.15s, color 0.15s'
          }}
          className="spinner-btn"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button
          type="button"
          onMouseDown={(e) => startAdjust(e, false)}
          onTouchStart={(e) => startAdjust(e, false)}
          style={{
            flex: 1,
            background: '#1c2030',
            border: 'none',
            color: '#868993',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            outline: 'none',
            transition: 'background 0.15s, color 0.15s'
          }}
          className="spinner-btn"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
    </div>
  );
};


function parsePeriod(period: any): Period | null {
  if (!period) return null;

  if (typeof period === 'string') {
    return ALL_PERIODS.find(p => p.text.toLowerCase() === period.toLowerCase()) || null;
  }

  if (period.text) {
    const match = ALL_PERIODS.find(p => p.text.toLowerCase() === String(period.text).toLowerCase());
    if (match) return match;
  }

  const m = Number(period.multiplier);
  const ts = period.timespan;
  if (Number.isFinite(m) && ts) {
    const match = ALL_PERIODS.find(p => p.multiplier === m && p.timespan.toLowerCase() === String(ts).toLowerCase());
    if (match) return match;
  }

  return null;
}

function getActivePeriodFallback(): Period {
  return { multiplier: 15, timespan: 'minute', text: '15m' };
}

export default function TickerPenProWidget({
  idx,
  symbol,
  onSymbolChange,
  styles,
  layout,
  onLayoutChange,
  drawingBarVisible = true,
  headerVisible = true,
  isActive = false,
  positions,
  executions,
  onPositionClose,
  onPositionReverse,
  onModifyTP,
  onModifySL
}: TickerPenProWidgetProps) {
  if (typeof window !== 'undefined') {
    (window as any).__chart_styles__ = styles;
  }
  const storageKey = idx !== undefined ? `chart_selected_period_${idx}` : 'chart_selected_period_default';
  const containerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<TickerPenPro | null>(null);
  const datafeedRef = useRef<CustomDatafeed | null>(null);
  const coreChartRef = useRef<any>(null);
  const [initialPeriod] = useState<Period>(() => getActivePeriodFallback());
  const periodBarRef = useRef<HTMLElement | null>(null);

  // History State for Drawing Undo/Redo
  const historyStateRef = useRef<{
    undoStack: any[][];
    redoStack: any[][];
    currentSnapshot: any[] | null;
  }>({
    undoStack: [],
    redoStack: [],
    currentSnapshot: null,
  });

  // Zoom History State per widget (like undo/redo, each layout panel gets its own stack)
  const zoomHistoryRef = useRef<any[]>([]);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const getDrawingsSnapshot = (chart: any) => {
    if (!chart || typeof chart.getOverlays !== 'function') return [];
    return chart.getOverlays()
      .filter((o: any) => o.id && o.name !== 'future-time-scale')
      .map((o: any) => ({
        id: o.id,
        name: o.name,
        points: o.points ? o.points.map((p: any) => ({ ...p })) : [],
        styles: o.styles ? JSON.parse(JSON.stringify(o.styles)) : undefined,
        lock: o.lock,
        visible: o.visible,
        extendData: o.extendData ? JSON.parse(JSON.stringify(o.extendData)) : undefined,
        mode: o.mode
      }));
  };

  const saveHistoryState = () => {
    if (!isActive) return;
    const activeChart = getCoreChart();
    if (!activeChart || typeof activeChart.getOverlays !== 'function') return;

    // Skip saving history if a drawing is currently in progress
    const overlays = activeChart.getOverlays() || [];
    const hasInProgress = overlays.some((o: any) => typeof o.isDrawing === 'function' && o.isDrawing());
    if (hasInProgress) return;

    const newSnapshot = getDrawingsSnapshot(activeChart);
    const lastState = historyStateRef.current.currentSnapshot;

    if (lastState && JSON.stringify(newSnapshot) === JSON.stringify(lastState)) return;

    if (lastState) {
      historyStateRef.current.undoStack.push(lastState);
      if (historyStateRef.current.undoStack.length > 50) {
        historyStateRef.current.undoStack.shift();
      }
    }
    historyStateRef.current.currentSnapshot = newSnapshot;
    historyStateRef.current.redoStack = []; // Clear redo stack on new action

    setCanUndo(historyStateRef.current.undoStack.length > 0);
    setCanRedo(false);
  };

  const restoreDrawingsSnapshot = (chart: any, snapshot: any[]) => {
    if (!chart || typeof chart.getOverlays !== 'function') return;

    // 1. Remove all current overlays (excluding future-time-scale)
    const currentOverlays = chart.getOverlays() || [];
    currentOverlays.forEach((o: any) => {
      if (o.id && o.name !== 'future-time-scale') {
        chart.removeOverlay({ id: o.id });
      }
    });

    // 2. Re-create overlays from the snapshot
    snapshot.forEach((o: any) => {
      chart.createOverlay({
        id: o.id,
        name: o.name,
        points: o.points,
        styles: o.styles,
        lock: o.lock,
        visible: o.visible,
        extendData: o.extendData,
        mode: o.mode
      });
    });
  };

  const handleUndo = () => {
    const activeChart = getCoreChart();
    if (!activeChart || historyStateRef.current.undoStack.length === 0) return;

    const previousState = historyStateRef.current.undoStack.pop()!;
    const currentState = historyStateRef.current.currentSnapshot;

    if (currentState) {
      historyStateRef.current.redoStack.push(currentState);
    }

    historyStateRef.current.currentSnapshot = previousState;
    restoreDrawingsSnapshot(activeChart, previousState);

    setCanUndo(historyStateRef.current.undoStack.length > 0);
    setCanRedo(true);
  };

  const handleRedo = () => {
    const activeChart = getCoreChart();
    if (!activeChart || historyStateRef.current.redoStack.length === 0) return;

    const nextState = historyStateRef.current.redoStack.pop()!;
    const currentState = historyStateRef.current.currentSnapshot;

    if (currentState) {
      historyStateRef.current.undoStack.push(currentState);
    }

    historyStateRef.current.currentSnapshot = nextState;
    restoreDrawingsSnapshot(activeChart, nextState);

    setCanUndo(true);
    setCanRedo(historyStateRef.current.redoStack.length > 0);
  };

  const [activeData, setActiveData] = useState<TickerPenData | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState('NATIVE');
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [customCursorMode, setCustomCursorMode] = useState<string>(() => (typeof window !== 'undefined' && (window as any).__active_cursor_mode__) || 'cross');
  const [customCursorPos, setCustomCursorPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let currentMode = (typeof window !== 'undefined' && (window as any).__active_cursor_mode__) || 'cross';
    let isPointerDown = false;
    let mouseDownPos = { x: 0, y: 0 };
    let isDragThresholdPassed = false;
    let isCanvasDragging = false;
    let isSpaceHeld = false;

    // Force cursor style ONLY on chart canvas elements
    const forceCursorOnCanvases = (cursorValue: string) => {
      const canvases = document.querySelectorAll('.ticker-pen-pro canvas, [class*="ticker-pen"] canvas, [class*="k-line-chart"] canvas');
      canvases.forEach((el: any) => {
        if (el.style.cursor !== cursorValue) {
          el.style.setProperty('cursor', cursorValue, 'important');
        }
      });
    };

    const getDesiredCursor = (type: 'normal' | 'anchor' | 'drawing' | 'drag', isMouseDown: boolean = false): string => {
      if (type === 'anchor') {
        return 'default'; // system arrow for moving/hovering anchor points
      }
      if (type === 'drawing') {
        return 'pointer'; // finger pointer ONLY for selecting drawings
      }
      if (type === 'drag') {
        return isMouseDown ? 'grabbing' : 'grab'; // drag hand for canvas or tool drag
      }
      if (currentMode === 'dot') {
        return 'none';
      }
      if (currentMode === 'demonstration' || currentMode === 'arrowCursor') {
        return 'default'; // system arrow above the red circle
      }
      return 'crosshair';
    };

    const checkHoverState = (): 'normal' | 'anchor' | 'drawing' | 'drag' => {
      // 1. Check anchor points with highest priority: Anchor points NEVER use grab hand, strictly system arrow!
      try {
        const activeAnchor = getGlobalActiveDragAnchor();
        if (activeAnchor && activeAnchor.index !== null && activeAnchor.index !== undefined) {
          return 'anchor';
        }
      } catch (e) { }

      const chart = (window as any).__active_chart_instance__ || coreChartRef.current;
      const hoverInfo = chart?._chartStore?.getHoverOverlayInfo?.();
      if (hoverInfo && hoverInfo.overlay) {
        const figKey = String(hoverInfo.figureKey || hoverInfo.figure?.key || '');
        const isAnchorHandle = figKey.includes('anchor') || figKey.includes('point') || figKey.includes('control') || (hoverInfo.figureIndex !== undefined && hoverInfo.figureIndex >= 0 && figKey === 'point');
        if (isAnchorHandle) {
          return 'anchor'; // Always system arrow on anchor points
        }
        // When dragging tool shades (fills) or lines with click-hold-and-drag -> show grab hand
        if (isPointerDown && isDragThresholdPassed) {
          return 'drag';
        }
        // When hovering tool shades or lines -> finger pointer ONLY to select
        return 'drawing';
      }

      if (isSpaceHeld) return 'drag';
      if (isCanvasDragging && isDragThresholdPassed) return 'drag';

      return 'normal';
    };

    // Mousemove handler that ensures canvas cursor remains correct without affecting UI elements
    const handleMouseMoveEnforce = (e: MouseEvent) => {
      if ((window as any).__is_position_dragging__) {
        return;
      }
      const target = e.target as HTMLElement | null;
      // If the target is an interactive UI control, side panel, modal, or toolbar, DO NOT touch its cursor
      if (target && target.closest('button, input, select, textarea, a, [role="button"], .custom-side-tool-panel, .custom-tool-popover-menu, .ticker-pen-pro-period-bar, [class*="modal"], [class*="dialog"], [class*="popover"], [class*="dropdown"], [class*="toolbar"], [class*="settings"], [class*="floating"], [class*="tv-position-"], [class*="tv-sl-"], [class*="tv-tp-"], [class*="tv-ep-"], .tv-position-overlay-container, line, svg')) {
        return;
      }
      if (isPointerDown && e.buttons > 0 && !isDragThresholdPassed) {
        const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
        if (dist > 3) {
          isDragThresholdPassed = true;
          try {
            const activeAnchor = getGlobalActiveDragAnchor();
            const isDraggingAnchor = activeAnchor && activeAnchor.index !== null && activeAnchor.index !== undefined;
            const chart = (window as any).__active_chart_instance__ || coreChartRef.current;
            const hoverInfo = chart?._chartStore?.getHoverOverlayInfo?.();
            const figKey = String(hoverInfo?.figureKey || hoverInfo?.figure?.key || '');
            const isHoveringAnchor = figKey.includes('anchor') || figKey.includes('point') || figKey.includes('control');
            if (!isDraggingAnchor && !isHoveringAnchor) {
              isCanvasDragging = true;
              document.body.classList.add('chart-panning');
            }
          } catch (err) {
            isCanvasDragging = true;
          }
        }
      }
      const type = checkHoverState();
      const desired = getDesiredCursor(type, isPointerDown && isDragThresholdPassed);
      forceCursorOnCanvases(desired);
    };

    const handleGlobalMouseDown = (e: MouseEvent) => {
      if ((window as any).__is_position_dragging__) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, input, select, textarea, a, [role="button"], .custom-side-tool-panel, .custom-tool-popover-menu, .ticker-pen-pro-period-bar, [class*="modal"], [class*="dialog"], [class*="popover"], [class*="dropdown"], [class*="toolbar"], [class*="settings"], [class*="floating"], [class*="tv-position-"], [class*="tv-sl-"], [class*="tv-tp-"], [class*="tv-ep-"], .tv-position-overlay-container, line, svg')) {
        return;
      }
      if (e.button === 0) {
        isPointerDown = true;
        mouseDownPos = { x: e.clientX, y: e.clientY };
        isDragThresholdPassed = false;
      }
    };

    const handleGlobalMouseUp = () => {
      isPointerDown = false;
      isDragThresholdPassed = false;
      if (isCanvasDragging) {
        isCanvasDragging = false;
        document.body.classList.remove('chart-panning');
      }
      const type = checkHoverState();
      const desired = getDesiredCursor(type, false);
      forceCursorOnCanvases(desired);
    };

    // MutationObserver to only intercept canvas style changes
    let observer: MutationObserver | null = null;
    const setupObserver = () => {
      const chartRoot = document.querySelector('.ticker-pen-pro') || document.querySelector('[class*="ticker-pen"]');
      if (!chartRoot) return;
      observer = new MutationObserver((mutations) => {
        const type = checkHoverState();
        const desiredCursor = getDesiredCursor(type, isCanvasDragging);
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            const el = mutation.target as HTMLElement;
            // Only enforce on canvas elements, never on UI controls
            if (el.tagName === 'CANVAS' && el.style.cursor !== desiredCursor) {
              el.style.setProperty('cursor', desiredCursor, 'important');
            }
          }
        }
      });
      observer.observe(chartRoot, { attributes: true, attributeFilter: ['style'], subtree: true });
    };

    const handleCursorChange = (e: any) => {
      const mode = e.detail?.mode || (window as any).__active_cursor_mode__ || 'cross';
      currentMode = mode;
      setCustomCursorMode(mode);
      // Always remove both classes first
      document.body.classList.remove('hide-native-chart-cursor', 'arrow-cursor-mode');
      if (mode === 'dot') {
        document.body.classList.add('hide-native-chart-cursor');
      } else if (mode === 'arrowCursor' || mode === 'demonstration') {
        document.body.classList.add('arrow-cursor-mode');
      }
      const type = checkHoverState();
      forceCursorOnCanvases(getDesiredCursor(type));
    };

    window.addEventListener('cursor-mode-change', handleCursorChange);
    document.addEventListener('mousemove', handleMouseMoveEnforce, true);
    document.addEventListener('mousedown', handleGlobalMouseDown, true);
    document.addEventListener('mouseup', handleGlobalMouseUp, true);

    // Initial setup
    if (currentMode === 'dot') {
      document.body.classList.add('hide-native-chart-cursor');
    } else if (currentMode === 'arrowCursor' || currentMode === 'demonstration') {
      document.body.classList.add('arrow-cursor-mode');
    }
    forceCursorOnCanvases(getDesiredCursor('normal'));

    // Delay observer setup to ensure chart DOM is ready
    const obsTimer = setTimeout(setupObserver, 500);

    return () => {
      window.removeEventListener('cursor-mode-change', handleCursorChange);
      document.removeEventListener('mousemove', handleMouseMoveEnforce, true);
      document.removeEventListener('mousedown', handleGlobalMouseDown, true);
      document.removeEventListener('mouseup', handleGlobalMouseUp, true);
      document.body.classList.remove('hide-native-chart-cursor', 'arrow-cursor-mode', 'chart-panning');
      if (observer) observer.disconnect();
      clearTimeout(obsTimer);
    };
  }, []);
  const [currencyOptions, setCurrencyOptions] = useState(() => [...CURRENCY_OPTIONS]);
  const [currencySearchQuery, setCurrencySearchQuery] = useState('');
  const [yAxisContainer, setYAxisContainer] = useState<HTMLElement | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showSymbolSearchModal, setShowSymbolSearchModal] = useState(false);
  const [showMarketConnectionModal, setShowMarketConnectionModal] = useState(false);

  useEffect(() => {
    const handleOpenMarketModal = () => setShowMarketConnectionModal(true);
    window.addEventListener('open-market-connection-modal', handleOpenMarketModal);
    return () => window.removeEventListener('open-market-connection-modal', handleOpenMarketModal);
  }, []);

  const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
  const [activeSearchTab, setActiveSearchTab] = useState<'ALL' | 'CRYPTO' | 'FOREX' | 'STOCK' | 'COMMODITY' | 'INDICES'>('ALL');
  const [recentSymbols, setRecentSymbols] = useState<SymbolInfo[]>([]);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [logoLoadErrors, setLogoLoadErrors] = useState<Record<string, boolean>>({});
  const isHoveringRef = useRef(false);
  const lastRawDataRef = useRef<TickerPenData[]>([]);
  const lastAppliedMarginsRef = useRef({ top: -1, bottom: -1, right: -1 });
  const activeTimeframeMsRef = useRef<number>(15 * 60 * 1000);
  const lastHoveredIndexRef = useRef<number | null>(null);
  const navZoomRafRef = useRef<number | null>(null);
  const [indicatorsExpanded, setIndicatorsExpanded] = useState(true);
  const [activeIndicators, setActiveIndicators] = useState<{ id?: string; name: string; visible: boolean; paneId: string }[]>([]);
  const activeIndicatorsRef = useRef<{ id?: string; name: string; visible: boolean; paneId: string }[]>([]);
  const hiddenIndicatorsRef = useRef<Set<string>>(new Set());
  const paneHeightsRef = useRef<Record<string, number>>({});
  const [editingIndicator, setEditingIndicator] = useState<{
    id?: string;
    name: string;
    paneId: string;
    calcParams: any[];
    colors: string[];
    figures: any[];
    lineStyleObjects: any[];
  } | null>(null);
  const [settingsTab, setSettingsTab] = useState<'inputs' | 'style'>('inputs');

  const [editingTextOverlay, setEditingTextOverlay] = useState<any | null>(null);
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false);
  const [isTextLayersDropdownOpen, setIsTextLayersDropdownOpen] = useState(false);
  const [editingFibOverlay, setEditingFibOverlay] = useState<any | null>(null);
  const [isFibFullModalOpen, setIsFibFullModalOpen] = useState(false);
  const [isTrendWidthDropdownOpen, setIsTrendWidthDropdownOpen] = useState(false);
  const [isLevelWidthDropdownOpen, setIsLevelWidthDropdownOpen] = useState(false);
  const [isFibLayersDropdownOpen, setIsFibLayersDropdownOpen] = useState(false);
  const [editingPositionOverlay, setEditingPositionOverlay] = useState<any | null>(null);
  const [isPositionLayersDropdownOpen, setIsPositionLayersDropdownOpen] = useState(false);
  const [editingPinFlagOverlay, setEditingPinFlagOverlay] = useState<any | null>(null);
  const [isPinFlagLayersDropdownOpen, setIsPinFlagLayersDropdownOpen] = useState(false);
  const [editingElliottOverlay, setEditingElliottOverlay] = useState<any | null>(null);
  const [isElliottLayersDropdownOpen, setIsElliottLayersDropdownOpen] = useState(false);
  const [isPositionFullModalOpen, setIsPositionFullModalOpen] = useState(false);
  const [isStatsDropdownOpen, setIsStatsDropdownOpen] = useState(false);
  const [isElliottSizeDropdownOpen, setIsElliottSizeDropdownOpen] = useState(false);
  const sizeBtnRef = useRef<HTMLButtonElement>(null);
  const trendWidthBtnRef = useRef<HTMLButtonElement>(null);
  const levelWidthBtnRef = useRef<HTMLButtonElement>(null);
  const statsBtnRef = useRef<HTMLButtonElement>(null);
  const elliottSizeBtnRef = useRef<HTMLButtonElement>(null);

  const [panelPos, setPanelPos] = useState({
    x: 64,
    y: 140
  });
  const [isPanelDragging, setIsPanelDragging] = useState(false);
  const panelDragStartRef = useRef({ x: 0, y: 0 });

  const reorderOverlayInStack = (overlayId: string, action: 'front' | 'forward' | 'backward' | 'back') => {
    const activeChart = (window as any).__active_chart_instance__;
    if (!activeChart || typeof activeChart.getOverlays !== 'function') return;

    const allOverlays = activeChart.getOverlays() || [];
    const userOverlays = allOverlays.filter((o: any) => o.id && o.name !== 'future-time-scale');
    if (userOverlays.length <= 1) return;

    const currentVisualList = [...userOverlays].reverse();
    const fromVisualIdx = currentVisualList.findIndex((o: any) => o.id === overlayId);
    if (fromVisualIdx === -1) return;

    let destVisualIdx = fromVisualIdx;
    if (action === 'front') {
      destVisualIdx = 0;
    } else if (action === 'forward') {
      destVisualIdx = Math.max(0, fromVisualIdx - 1);
    } else if (action === 'backward') {
      destVisualIdx = Math.min(currentVisualList.length - 1, fromVisualIdx + 1);
    } else if (action === 'back') {
      destVisualIdx = currentVisualList.length - 1;
    }

    if (destVisualIdx === fromVisualIdx) return;

    const [movedItem] = currentVisualList.splice(fromVisualIdx, 1);
    currentVisualList.splice(destVisualIdx, 0, movedItem);

    const newActualStack = [...currentVisualList].reverse();

    newActualStack.forEach((o: any, idx: number) => {
      const newZ = (idx + 1) * 10;
      try {
        if (typeof activeChart.overrideOverlay === 'function') {
          activeChart.overrideOverlay({ id: o.id, zLevel: newZ });
        }
      } catch (e) {}
      o.zLevel = newZ;
      if (typeof o.setPrevZLevel === 'function') {
        o.setPrevZLevel(newZ);
      }
    });

    const coreChart = (activeChart as any)._chartApi || activeChart;
    const store = coreChart?._chartStore || (activeChart as any)?._chartStore;
    if (store && store._overlays) {
      try {
        store._overlays.forEach((paneOverlays: any[]) => {
          if (Array.isArray(paneOverlays)) {
            paneOverlays.sort((a, b) => (Number(a.zLevel) || 0) - (Number(b.zLevel) || 0));
          }
        });
        if (typeof store._sortOverlays === 'function') {
          store._sortOverlays();
        }
      } catch (e) {}
    }

    if (typeof activeChart.updatePane === 'function') activeChart.updatePane(1);
    if (typeof activeChart.invalidate === 'function') activeChart.invalidate();

    window.dispatchEvent(new CustomEvent('reorder-drawing-layer', { detail: { overlayId } }));
    window.dispatchEvent(new CustomEvent('update-layer-panel'));
    setTimeout(() => window.dispatchEvent(new CustomEvent('save-history-state')), 50);
  };

  const cloneOverlayInStack = (overlayId: string) => {
    const activeChart = (window as any).__active_chart_instance__;
    if (!activeChart || typeof activeChart.getOverlays !== 'function') return;

    const overlays = activeChart.getOverlays() || [];
    const target = overlays.find((o: any) => o.id === overlayId);
    if (!target) return;

    const clonedPoints = (target.points || []).map((pt: any) => {
      let nextVal = pt.value;
      if (typeof nextVal === 'number') {
        nextVal = nextVal * 0.998;
      }
      let nextIndex = pt.dataIndex;
      if (typeof nextIndex === 'number') {
        nextIndex = nextIndex + 3;
      }
      return {
        ...pt,
        value: nextVal,
        dataIndex: nextIndex,
        timestamp: pt.timestamp ? pt.timestamp + 3 * 60000 : undefined
      };
    });

    if (typeof activeChart.createOverlay === 'function') {
      try {
        activeChart.createOverlay({
          name: target.name,
          points: clonedPoints,
          styles: JSON.parse(JSON.stringify(target.styles || {})),
          extendData: JSON.parse(JSON.stringify(target.extendData || {}))
        });
        if (typeof activeChart.updatePane === 'function') activeChart.updatePane(1);
        if (typeof activeChart.invalidate === 'function') activeChart.invalidate();
      } catch (e) {}
    }
  };

  // Universal draggable modals state
  const [modalPosMap, setModalPosMap] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingModalKey, setDraggingModalKey] = useState<string | null>(null);
  const modalDragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleModalHeaderMouseDown = (modalKey: string, e: React.MouseEvent, defaultW: number = 400, defaultH: number = 400) => {
    e.stopPropagation();
    const current = modalPosMap[modalKey] || {
      x: Math.max(10, Math.round(window.innerWidth / 2 - defaultW / 2)),
      y: Math.max(10, Math.round(window.innerHeight / 2 - defaultH / 2))
    };
    modalDragOffsetRef.current = {
      x: e.clientX - current.x,
      y: e.clientY - current.y
    };
    setDraggingModalKey(modalKey);
  };

  useEffect(() => {
    if (!draggingModalKey) return;

    const handleMouseMove = (e: MouseEvent) => {
      const nextX = e.clientX - modalDragOffsetRef.current.x;
      const nextY = e.clientY - modalDragOffsetRef.current.y;

      const boundedX = Math.max(10, Math.min(window.innerWidth - 100, nextX));
      const boundedY = Math.max(10, Math.min(window.innerHeight - 100, nextY));

      setModalPosMap((prev) => ({
        ...prev,
        [draggingModalKey]: { x: boundedX, y: boundedY }
      }));
    };

    const handleMouseUp = () => {
      setDraggingModalKey(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingModalKey]);

  // Handle panel dragging
  useEffect(() => {
    if (!isPanelDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const nextX = e.clientX - panelDragStartRef.current.x;
      const nextY = e.clientY - panelDragStartRef.current.y;

      const boundedX = Math.max(10, Math.min(window.innerWidth - 340, nextX));
      const boundedY = Math.max(10, Math.min(window.innerHeight - 360, nextY));

      setPanelPos({ x: boundedX, y: boundedY });
    };

    const handleMouseUp = () => {
      setIsPanelDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanelDragging]);

  const initialFibBackupRef = useRef<any>(null);

  // Listen to open-text-settings, open-fib-settings, and close events
  useEffect(() => {
    const handleOpenSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setEditingTextOverlay(detail);
      setIsSizeDropdownOpen(false);
      setPanelPos({
        x: 64,
        y: 140
      });
    };

    const handleCloseSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsSizeDropdownOpen(false);
      setEditingTextOverlay((prev: any) => {
        if (!detail || !detail.overlayId || (prev && prev.overlayId === detail.overlayId)) {
          return null;
        }
        return prev;
      });
    };

    const handleOpenFibSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setEditingFibOverlay(detail);
      initialFibBackupRef.current = detail ? JSON.parse(JSON.stringify(detail)) : null;
      setIsTrendWidthDropdownOpen(false);
      setIsLevelWidthDropdownOpen(false);
      setPanelPos({
        x: 64,
        y: 140
      });
    };

    const handleCloseFibSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsTrendWidthDropdownOpen(false);
      setIsLevelWidthDropdownOpen(false);
      setEditingFibOverlay((prev: any) => {
        if (!detail || !detail.overlayId || (prev && prev.overlayId === detail.overlayId)) {
          return null;
        }
        return prev;
      });
    };

    const handleUpdateTextContent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setEditingTextOverlay((prev: any) => {
        if (prev && prev.overlayId === detail.overlayId) {
          return {
            ...prev,
            text: detail.text
          };
        }
        return prev;
      });
    };

    const handleOpenPositionSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      let initData = { ...detail };
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        const overlays = activeChart.getOverlays() || [];
        const found = overlays.find((o: any) => o.id === detail.overlayId);
        if (found && found.points) {
          const ep = found.points[0]?.value ?? 0;
          const sl = found.points[1]?.value ?? 0;
          const tp = found.points[2]?.value ?? 0;

          let precision = 2;
          try {
            const symbolInfo = activeChart.getSymbol();
            if (symbolInfo && typeof symbolInfo.pricePrecision === 'number') {
              precision = symbolInfo.pricePrecision;
            } else if ((window as any).__active_price_precision__ !== undefined) {
              precision = (window as any).__active_price_precision__;
            }
          } catch (e) { }
          const tickSize = Math.pow(10, -precision);

          initData.entryPrice = parseFloat(ep.toFixed(precision));
          initData.stopPrice = parseFloat(sl.toFixed(precision));
          initData.profitPrice = parseFloat(tp.toFixed(precision));
          initData.stopTicks = Math.round(Math.abs(ep - sl) / tickSize);
          initData.profitTicks = Math.round(Math.abs(tp - ep) / tickSize);
        }
      }
      setEditingPositionOverlay(initData);
      setPanelPos({
        x: 64,
        y: 140
      });
    };

    const handleClosePositionSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setEditingPositionOverlay((prev: any) => {
        if (!detail || !detail.overlayId || (prev && prev.overlayId === detail.overlayId)) {
          return null;
        }
        return prev;
      });
      setIsPositionLayersDropdownOpen(false);
    };

    const handleDocumentClick = () => {
      setIsSizeDropdownOpen(false);
      setIsTextLayersDropdownOpen(false);
      setIsTrendWidthDropdownOpen(false);
      setIsLevelWidthDropdownOpen(false);
      setIsFibLayersDropdownOpen(false);
      setIsPositionLayersDropdownOpen(false);
      setIsPinFlagLayersDropdownOpen(false);
      setIsStatsDropdownOpen(false);
      setIsElliottSizeDropdownOpen(false);
      setIsElliottLayersDropdownOpen(false);
    };

    const handleOpenPinFlagSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setEditingPinFlagOverlay(detail);
      setPanelPos({
        x: 64,
        y: 140
      });
    };

    const handleClosePinFlagSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setEditingPinFlagOverlay((prev: any) => {
        if (!detail || !detail.overlayId || (prev && prev.overlayId === detail.overlayId)) {
          return null;
        }
        return prev;
      });
    };

    const handleOpenElliottToolbar = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !detail.overlayId) return;
      setEditingElliottOverlay(detail);
      setIsElliottSizeDropdownOpen(false);
      setPanelPos({
        x: 64,
        y: 140
      });
    };

    const handleCloseElliottToolbar = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsElliottSizeDropdownOpen(false);
      setEditingElliottOverlay((prev: any) => {
        if (!detail || !detail.overlayId || (prev && prev.overlayId === detail.overlayId)) {
          return null;
        }
        return prev;
      });
    };

    window.addEventListener('open-text-settings', handleOpenSettings);
    window.addEventListener('close-text-settings', handleCloseSettings);
    window.addEventListener('open-fib-settings', handleOpenFibSettings);
    window.addEventListener('close-fib-settings', handleCloseFibSettings);
    window.addEventListener('open-position-settings', handleOpenPositionSettings);
    window.addEventListener('close-position-settings', handleClosePositionSettings);
    window.addEventListener('open-pin-flag-settings', handleOpenPinFlagSettings);
    window.addEventListener('close-pin-flag-settings', handleClosePinFlagSettings);
    window.addEventListener('open-elliott-toolbar', handleOpenElliottToolbar);
    window.addEventListener('close-elliott-toolbar', handleCloseElliottToolbar);
    window.addEventListener('close-all-toolbars', handleCloseElliottToolbar);
    window.addEventListener('update-text-content', handleUpdateTextContent);
    document.addEventListener('click', handleDocumentClick);
    return () => {
      window.removeEventListener('open-text-settings', handleOpenSettings);
      window.removeEventListener('close-text-settings', handleCloseSettings);
      window.removeEventListener('open-fib-settings', handleOpenFibSettings);
      window.removeEventListener('close-fib-settings', handleCloseFibSettings);
      window.removeEventListener('open-position-settings', handleOpenPositionSettings);
      window.removeEventListener('close-position-settings', handleClosePositionSettings);
      window.removeEventListener('open-pin-flag-settings', handleOpenPinFlagSettings);
      window.removeEventListener('close-pin-flag-settings', handleClosePinFlagSettings);
      window.removeEventListener('open-elliott-toolbar', handleOpenElliottToolbar);
      window.removeEventListener('close-elliott-toolbar', handleCloseElliottToolbar);
      window.removeEventListener('close-all-toolbars', handleCloseElliottToolbar);
      window.removeEventListener('update-text-content', handleUpdateTextContent);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  const handlePanelDragStart = (e: React.MouseEvent) => {
    setIsPanelDragging(true);
    panelDragStartRef.current = {
      x: e.clientX - panelPos.x,
      y: e.clientY - panelPos.y
    };
    e.preventDefault();
  };

  const getCoreChart = () => {
    // Clean stale charts from globalCoreCharts Set
    for (const gc of Array.from(globalCoreCharts)) {
      if (gc) {
        try {
          const chartContainer = typeof gc.getContainer === 'function' ? gc.getContainer() : null;
          if (!chartContainer || !document.body.contains(chartContainer)) {
            globalCoreCharts.delete(gc);
          }
        } catch (e) {
          globalCoreCharts.delete(gc);
        }
      }
    }

    let chartObj: any = null;
    if (coreChartRef.current && globalCoreCharts.has(coreChartRef.current)) {
      chartObj = coreChartRef.current;
    } else if (chartInstanceRef.current && (chartInstanceRef.current as any)._chartApi) {
      chartObj = (chartInstanceRef.current as any)._chartApi;
      coreChartRef.current = chartObj;
    } else if (containerRef.current) {
      for (const gc of globalCoreCharts) {
        if (gc && typeof gc.getContainer === 'function') {
          const chartContainer = gc.getContainer();
          if (containerRef.current.contains(chartContainer)) {
            chartObj = gc;
            coreChartRef.current = gc;
            break;
          }
        }
      }
    }
    if (chartObj && !chartObj.__tooltip_hidden__) {
      try {
        chartObj.setStyles({ indicator: { tooltip: { showRule: 'none' } } });
        chartObj.__tooltip_hidden__ = true;
      } catch (e) { }
    }
    return chartObj;
  };

  const adjustPaneHeights = (coreChart: any) => {
    if (!coreChart) return;
    try {
      const container = coreChart.getContainer?.();
      const containerHeight = container ? container.clientHeight : 0;
      if (containerHeight <= 0) return;

      const panes = coreChart._drawPanes || [];
      // Count how many indicator sub-panes exist (excluding candle_pane and x_axis)
      let indicatorCount = 0;
      for (const pane of panes) {
        const id = pane.getId();
        if (id !== 'candle_pane' && id !== 'x_axis') {
          indicatorCount++;
        }
      }
      if (indicatorCount === 0) return;

      // Reserve ~45px for x-axis, distribute remaining between candle and indicators
      const xAxisHeight = 45;
      const available = containerHeight - xAxisHeight;
      // Adapt to small containers in multi-layout: use smaller ratio when container is tiny
      const isSmallContainer = containerHeight < 300;
      const indicatorRatio = isSmallContainer ? 0.15 : 0.22;
      const maxIndicatorRatio = isSmallContainer ? 0.35 : 0.45;
      const minIndicatorPx = isSmallContainer ? 25 : 40;
      const maxIndicatorPx = isSmallContainer ? 70 : 120;
      // Give each indicator pane a ratio of available height, clamped
      const rawIndicatorHeight = Math.floor(available * indicatorRatio);
      const indicatorHeight = Math.max(minIndicatorPx, Math.min(maxIndicatorPx, rawIndicatorHeight));
      // Ensure candle pane still gets majority of available space
      const maxTotalIndicatorHeight = Math.floor(available * maxIndicatorRatio);
      const totalIndicatorRequest = indicatorHeight * indicatorCount;
      const finalIndicatorHeight = totalIndicatorRequest > maxTotalIndicatorHeight
        ? Math.floor(maxTotalIndicatorHeight / indicatorCount)
        : indicatorHeight;

      for (const pane of panes) {
        const id = pane.getId();
        if (id === 'candle_pane') {
          // Set a sensible minHeight, library handles the actual candle height as remainder
          coreChart.setPaneOptions({
            id: id,
            minHeight: Math.max(80, available - (finalIndicatorHeight * indicatorCount) - 20)
          });
        } else if (id !== 'x_axis') {
          coreChart.setPaneOptions({
            id: id,
            minHeight: Math.max(30, finalIndicatorHeight - 10),
            height: finalIndicatorHeight
          });
        }
      }
    } catch (err) {
      console.warn('Error enforcing pane heights:', err);
    }
  };

  let _resetYAxesRunning = false;
  const resetYAxes = () => {
    if (_resetYAxesRunning) return; // guard against re-entrant calls during resize cascades
    _resetYAxesRunning = true;
    try {
      const coreChart = getCoreChart();
      if (coreChart) {
        // Clear cached Y-axis width to allow Y-axis to shrink when switching from high-precision to low-precision symbol
        if (coreChart._cacheYAxisWidth) {
          coreChart._cacheYAxisWidth = { left: 0, right: 0 };
        }
        const panes = coreChart._drawPanes || [];
        panes.forEach((pane: any) => {
          if (pane && typeof pane.getAxisComponent === 'function') {
            const yAxis = pane.getAxisComponent();
            if (yAxis && typeof yAxis.setAutoCalcTickFlag === 'function') {
              yAxis.setAutoCalcTickFlag(true);
            }
          }
        });
        if (typeof coreChart.adjustPaneViewport === 'function') {
          coreChart.adjustPaneViewport(false, true, true, true);
        }
        if (typeof coreChart.layout === 'function') {
          coreChart.layout({ update: true });
        }
      }
    } finally {
      _resetYAxesRunning = false;
    }
  };

  const handleRefreshChart = async () => {
    setIsRefreshing(true);

    try {
      const coreChart = getCoreChart();
      const currentSym = chartInstanceRef.current?.getSymbol() || mapSymbolInfo(symbol);
      const currentPeriod = chartInstanceRef.current?.getPeriod() || getActivePeriodFallback();

      if (datafeedRef.current) {
        const cacheKey = `${currentSym.ticker}_${currentPeriod.text}`;
        const df = datafeedRef.current as any;
        if (df.historyCache) {
          df.historyCache.delete(cacheKey);
        }
        if (df.isCacheSimulated) {
          df.isCacheSimulated.delete(cacheKey);
        }
        df.lastRawData = [];

        // Fetch fresh history data directly from datafeed/Binance API
        const freshData = await df[String.fromCharCode(103, 101, 116, 72, 105, 115, 116, 111, 114, 121, 75, 76, 105, 110, 101, 68, 97, 116, 97)](currentSym, currentPeriod, 0, Date.now());

        if (coreChart && Array.isArray(freshData) && freshData.length > 0) {
          lastRawDataRef.current = freshData;
          const chartStore = (coreChart as any)._chartStore;
          const timeScaleStore = typeof chartStore?.getTimeScaleStore === 'function'
            ? chartStore.getTimeScaleStore()
            : chartStore?._timeScaleStore;
          if (timeScaleStore) {
            timeScaleStore.__has_more_historical_candles__ = true;
          }
          if (typeof coreChart.applyNewData === 'function') {
            const isHA = chartTypeRef.current === 'heikin_ashi';
            coreChart.applyNewData(isHA ? transformToHeikinAshi(freshData) : freshData, true);
          }
        }

        // Re-subscribe live streaming data feed
        datafeedRef.current.subscribe(currentSym, currentPeriod, (tick) => {
          if (coreChart && typeof coreChart.updateData === 'function') {
            const isHA = chartTypeRef.current === 'heikin_ashi';
            const procTick = isHA ? calculateHeikinAshiTick(tick, lastRawDataRef.current) : tick;
            coreChart.updateData(procTick);
          }
        });
      }

      if (coreChart && typeof coreChart.resize === 'function') {
        coreChart.resize();
      }
    } catch (err) {
      console.warn('Error refreshing chart data:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  // Timeframe periods currently starred (favorited) to be shown directly on the top menu bar
  const [starredPeriods, setStarredPeriods] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('chart_starred_periods');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validTexts = ALL_PERIODS.map(p => p.text);
          const filtered = parsed.filter(t => validTexts.includes(t));
          if (filtered.length > 0) return filtered;
        }
      }
    } catch (e) {
      console.warn('Failed to parse chart_starred_periods:', e);
    }
    return ['5m', '1H', 'D'];
  });
  const starredPeriodsRef = useRef(starredPeriods);
  useEffect(() => { starredPeriodsRef.current = starredPeriods; }, [starredPeriods]);

  // Chart type state persisted to localStorage
  const [chartType, setChartType] = useState<string>(() => {
    const saved = localStorage.getItem('chart_type');
    const validNative = ['candle_solid', 'candle_stroke', 'candle_up_stroke', 'candle_down_stroke', 'heikin_ashi', 'ohlc', 'line', 'area'];
    return (saved && validNative.includes(saved)) ? saved : 'candle_solid';
  });
  const chartTypeRef = useRef(chartType);
  useEffect(() => { chartTypeRef.current = chartType; }, [chartType]);

  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const [currentPeriod, setCurrentPeriod] = useState<Period>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parsePeriod(JSON.parse(saved));
        if (parsed) return parsed;
      }
    } catch (e) { }
    return getActivePeriodFallback();
  });
  const currentPeriodRef = useRef(currentPeriod);
  useEffect(() => { currentPeriodRef.current = currentPeriod; }, [currentPeriod]);

  // Sync selected timeframe to index-keyed localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(currentPeriod));
    } catch (e) { }
  }, [currentPeriod, storageKey]);

  // Network Error State
  const [networkError, setNetworkError] = useState<{
    isError: boolean;
    message: string;
  } | null>(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {
        isError: true,
        message: 'No internet connection detected. Please connect to the network to view live chart data.'
      };
    }
    return null;
  });
  const [isRetryingNetwork, setIsRetryingNetwork] = useState(false);

  // Initialize datafeed once
  if (!datafeedRef.current) {
    datafeedRef.current = new CustomDatafeed(
      resetYAxes,
      (newSymbolTicker) => {
        if (onSymbolChange) {
          onSymbolChange(newSymbolTicker);
        }
      },
      getCoreChart,
      (tick) => {
        if (!isHoveringRef.current) {
          setActiveData(tick);
        }
      },
      () => isActiveRef.current,
      (newPeriod) => setCurrentPeriod(newPeriod),
      () => currentPeriodRef.current,
      () => chartTypeRef.current,
      (status) => {
        if (status.isError) {
          setNetworkError({
            isError: true,
            message: status.message || 'Network connection unavailable. Please check your network and reconnect.'
          });
        } else {
          setNetworkError(null);
        }
      }
    );
    if (typeof window !== 'undefined') {
      (window as any).__ACTIVE_DATAFEED__ = datafeedRef.current;
    }
  }

  useEffect(() => {
    const handleOnline = () => {
      if (networkError?.isError) {
        handleRefreshChart();
      }
    };
    const handleOffline = () => {
      setNetworkError({
        isError: true,
        message: 'No internet connection detected. Connect to the network to view live chart data.'
      });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [networkError]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Check if this specific DOM node was already initialized to prevent double chart overlays
    const el = container as any;
    if (el.__ticker_pen_pro_initialized__) {
      return;
    }
    el.__ticker_pen_pro_initialized__ = true;

    // Filter ALL_PERIODS to only pass the starred periods to the top menu bar
    const activePeriod = getActivePeriodFallback();
    const activePeriods = ALL_PERIODS.filter(p => starredPeriodsRef.current.includes(p.text));
    if (activePeriod && !activePeriods.some(p => p.text === activePeriod.text)) {
      activePeriods.push(activePeriod);
    }

    (window as any).__status_indicator_values__ = styles?.statusIndicatorValues !== false;

    // Seeding internal chart storage to initialize to current user period
    if (typeof window !== 'undefined') {
      localStorage.setItem('chart_selected_period', JSON.stringify(currentPeriod));
    }

    // Instantiate Ticker Pen Pro
    const chart = new TickerPenPro({
      container: container,
      theme: 'dark',
      locale: 'en-US',
      timezone: styles?.scalesTimezone || 'Asia/Kolkata',
      symbol: mapSymbolInfo(symbol),
      period: currentPeriod,
      periods: activePeriods,
      datafeed: datafeedRef.current! as any,
      watermark: '',
      mainIndicators: [],
      subIndicators: [],
      drawingBarVisible: drawingBarVisible, // Ensures the drawing bar sidebar on the left is active
      styles: {
        indicator: {
          lastValueMark: {
            show: true,
            text: {
              show: true,
              family: 'Rubik, sans-serif',
              textFamily: 'Rubik, sans-serif'
            }
          },
          tooltip: {
            showRule: 'none' as any,
            title: {
              showName: styles?.statusIndicatorTitles !== false,
              showParams: !!styles?.statusIndicatorInputs,
            },
          }
        },
        grid: {
          show: styles?.gridShow ?? true,
          horizontal: {
            show: styles?.gridHorizontalShow ?? true,
            color: applyColorOpacity(styles?.gridHorizontalColor || '#3c4050', styles?.gridHorizontalOpacity ?? 0.1),
            style: (GRID_STYLE_MAP[styles?.gridHorizontalStyle || 'dashed']?.style ?? 'dashed') as any,
            dashedValue: GRID_STYLE_MAP[styles?.gridHorizontalStyle || 'dashed']?.dashedValue ?? [2, 2],
          },
          vertical: {
            show: styles?.gridVerticalShow ?? true,
            color: applyColorOpacity(styles?.gridVerticalColor || '#3c4050', styles?.gridVerticalOpacity ?? 0.1),
            style: (GRID_STYLE_MAP[styles?.gridVerticalStyle || 'dashed']?.style ?? 'dashed') as any,
            dashedValue: GRID_STYLE_MAP[styles?.gridVerticalStyle || 'dashed']?.dashedValue ?? [2, 2],
          }
        },
        candle: {
          type: ((chartType === 'line' || chartType === 'area') ? 'area' : (['candle_solid', 'candle_stroke', 'candle_up_stroke', 'candle_down_stroke', 'ohlc'].includes(chartType) ? chartType : 'candle_solid')) as any,
          bar: {
            upColor: styles?.candleUpColor ?? '#26a69a',
            downColor: styles?.candleDownColor ?? '#ef5350',
            upBorderColor: styles?.candleUpBorderColor ?? styles?.candleUpColor ?? '#26a69a',
            downBorderColor: styles?.candleDownBorderColor ?? styles?.candleDownColor ?? '#ef5350',
            upWickColor: styles?.candleUpWickColor ?? styles?.candleUpColor ?? '#26a69a',
            downWickColor: styles?.candleDownWickColor ?? styles?.candleDownColor ?? '#ef5350',
          },
          priceMark: {
            high: {
              show: styles?.scalesHighPrice ?? false,
              family: 'Rubik, sans-serif',
              textFamily: 'Rubik, sans-serif'
            },
            low: {
              show: styles?.scalesLowPrice ?? false,
              family: 'Rubik, sans-serif',
              textFamily: 'Rubik, sans-serif'
            },
            last: {
              show: true,
              upColor: '#089981',
              downColor: '#f23645',
              noChangeColor: '#868993',
              text: {
                show: true,
                family: 'Rubik, sans-serif',
                textFamily: 'Rubik, sans-serif'
              }
            }
          },
          area: {
            lineSize: 2,
            lineColor: styles?.areaLineColor ?? '#2979ff',
            value: 'close',
            smooth: true,
            backgroundColor: (chartType === 'line'
              ? 'transparent'
              : [
                { offset: 0, color: applyColorOpacity(styles?.areaFillColor ?? '#2979ff', 0.25) },
                { offset: 1, color: applyColorOpacity(styles?.areaFillColor ?? '#2979ff', 0.02) }
              ]) as any,
          },
          tooltip: {
            showRule: 'none' as any
          }
        },
        xAxis: {
          show: true,
          axisLine: {
            show: styles?.scaleLineShow !== false,
            size: 1,
            color: applyColorOpacity(styles?.scalesLineColor || '#2a2e39', styles?.scalesLineOpacity ?? 1.0),
          },
          tickLine: {
            show: true,
            size: 1,
            length: 4,
            color: applyColorOpacity(styles?.scalesLineColor || '#2a2e39', styles?.scalesLineOpacity ?? 1.0),
          },
          tickText: {
            show: true,
            color: styles?.scalesTextColor ?? '#868993',
            size: styles?.scalesTextSize ?? 11,
            family: 'Rubik, sans-serif',
            weight: 'normal',
            marginStart: 4,
            marginEnd: 4
          }
        },
        yAxis: {
          type: (styles?.scalesPriceScaleType ?? 'normal') as any,
          reverse: !!styles?.scalesPriceScaleReverse,
          axisLine: {
            show: styles?.scaleLineShow !== false,
            size: 1,
            color: applyColorOpacity(styles?.scalesLineColor || '#2a2e39', styles?.scalesLineOpacity ?? 1.0),
          },
          tickText: {
            show: true,
            color: styles?.scalesTextColor ?? '#868993',
            size: styles?.scalesTextSize ?? 11,
            family: 'Rubik, sans-serif',
          }
        },
        separator: {
          size: 1,
          color: '#2a2e39',
          fill: true,
          activeBackgroundColor: '#2a2e39'
        },
        crosshair: {
          show: styles?.crosshairShow !== false,
          horizontal: {
            show: styles?.crosshairHorizontalShow !== false,
            line: {
              show: true,
              style: (GRID_STYLE_MAP[styles?.crosshairStyle || 'solid']?.style ?? 'solid') as any,
              dashedValue: GRID_STYLE_MAP[styles?.crosshairStyle || 'solid']?.dashedValue ?? [],
              size: styles?.crosshairWidth ?? 1,
              color: applyColorOpacity(styles?.crosshairColor || '#2979ff', styles?.crosshairOpacity ?? 1.0),
            },
            text: {
              show: true,
              color: styles?.crosshairLabelTextColor ?? '#ffffff',
              size: 11,
              family: 'Rubik, sans-serif',
              backgroundColor: styles?.crosshairLabelBgColor ?? '#2a2e39',
              borderRadius: 3,
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 4,
              paddingBottom: 4
            }
          },
          vertical: {
            show: styles?.crosshairVerticalShow !== false,
            line: {
              show: true,
              style: (GRID_STYLE_MAP[styles?.crosshairStyle || 'solid']?.style ?? 'solid') as any,
              dashedValue: GRID_STYLE_MAP[styles?.crosshairStyle || 'solid']?.dashedValue ?? [],
              size: styles?.crosshairWidth ?? 1,
              color: applyColorOpacity(styles?.crosshairColor || '#2979ff', styles?.crosshairOpacity ?? 1.0),
            },
            text: {
              show: true,
              color: styles?.crosshairLabelTextColor ?? '#ffffff',
              size: 11,
              family: 'Rubik, sans-serif',
              backgroundColor: styles?.crosshairLabelBgColor ?? '#2a2e39',
              borderRadius: 3,
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 4,
              paddingBottom: 4
            }
          }
        }
      } as any
    });

    if (containerRef.current && styles?.bgColor) {
      containerRef.current.style.background = styles.bgColor;
    }

    chartInstanceRef.current = chart;

    // Remove the built-in price-unit label and store Y-axis container for our dropdown portal
    setTimeout(() => {
      const priceUnit = container.querySelector('.ticker-pen-pro-price-unit');
      if (priceUnit) {
        const yAxisEl = priceUnit.parentElement;
        priceUnit.remove();
        if (yAxisEl) {
          setYAxisContainer(yAxisEl);
        }
      }
    }, 100);

    if (chart && typeof (chart as any).setFormatter === 'function') {
      try {
        (chart as any).setFormatter({
          formatDate: (params: any) => {
            return (utils.formatDate as any)(params);
          }
        });
      } catch (e) {
        console.warn('Failed to set chart formatter:', e);
      }
    }

    const core = (chart as any)._chartApi;
    if (core) {
      // Set the initial Y axis type, reverse options, and Margins (gap)
      if (typeof core.overrideYAxis === 'function') {
        try {
          const scaleType = styles?.scalesPriceScaleType === 'log' ? 'logarithm' : (styles?.scalesPriceScaleType || 'normal');
          const position = styles?.scalesPlacement === 'left' ? 'left' : 'right';
          const topGap = (styles?.marginTop !== undefined ? styles.marginTop : 0) / 100;
          const bottomGap = (styles?.marginBottom !== undefined ? styles.marginBottom : 0) / 100;
          core.overrideYAxis({
            paneId: 'candle_pane',
            name: scaleType,
            reverse: !!styles?.scalesPriceScaleReverse,
            position: position,
            gap: {
              top: topGap,
              bottom: bottomGap
            }
          });
        } catch (e) {
          console.warn('Failed to set initial Y axis scale type:', e);
        }
      }

      // Set the initial right bars margin from settings
      if (core._chartStore) {
        const timeScaleStore = core._chartStore.getTimeScaleStore();
        if (timeScaleStore && typeof timeScaleStore.setLastBarRightSideDiffBarCount === 'function') {
          const rightBars = styles?.marginRight !== undefined ? styles.marginRight : 10;
          timeScaleStore.setLastBarRightSideDiffBarCount(rightBars);
          if (typeof timeScaleStore._adjustVisibleRange === 'function') {
            timeScaleStore._adjustVisibleRange();
          }
        }
      }

      // 1. Set the initial barSpace zoom to 6 (matching TradingView default)
      if (typeof core.setBarSpace === 'function') {
        try {
          core.setBarSpace(6);
        } catch (e) {
          console.warn('Failed to set initial bar space:', e);
        }
      }

      // 2. Hijack getBarSpace on the TimeScaleStore prototype to enforce the 68% candle width and 32% gap spacing ratio
      if (core._chartStore) {
        const timeScaleStore = core._chartStore.getTimeScaleStore();
        if (timeScaleStore) {
          const TimeScaleStoreProto = Object.getPrototypeOf(timeScaleStore);
          if (TimeScaleStoreProto && !TimeScaleStoreProto.__is_hijacked__) {
            TimeScaleStoreProto.__is_hijacked__ = true;
            const originalGetBarSpace = TimeScaleStoreProto.getBarSpace;
            TimeScaleStoreProto.getBarSpace = function () {
              const bs = originalGetBarSpace.call(this);
              // Dynamic TV spacing rule: body width is 68% of barSpace, remaining 32% is the spacing gap
              const newGapBar = Math.max(1, Math.round(bs.bar * 0.68));
              return {
                bar: bs.bar,
                halfBar: bs.bar / 2,
                gapBar: newGapBar,
                halfGapBar: newGapBar / 2
              };
            };
          }
        }
      }

      // 3. Manually add the custom VOL OVERLAY indicator to the main price pane
      if (typeof core.createIndicator === 'function') {
        try {
          core.createIndicator({ name: 'VOL OVERLAY', paneId: 'candle_pane' }, true);
        } catch (e) {
          console.warn('Failed to create initial VOL OVERLAY indicator:', e);
        }
      }
    }

    // Reparent top period bar and left drawing bar to the parent .layout-container
    // to prevent clipping and stack order issues inside grid cells.
    const parentLayout = container.closest('.layout-container') as HTMLElement;
    let periodBar: HTMLElement | null = null;
    let drawingBar: HTMLElement | null = null;

    if (parentLayout) {
      periodBar = container.querySelector('.ticker-pen-pro-period-bar') as HTMLElement;
      if (periodBar) {
        periodBarRef.current = periodBar;
        periodBar.style.setProperty('display', isActive ? 'flex' : 'none', 'important');
        if (periodBar.parentNode !== parentLayout) {
          parentLayout.appendChild(periodBar);
        }

        // Inject vertical divider line between search and timeframe buttons
        const symbolBtn = periodBar.querySelector('.symbol') as HTMLElement;
        if (symbolBtn && !periodBar.querySelector('.custom-topbar-divider')) {
          const divider = document.createElement('div');
          divider.className = 'custom-topbar-divider';
          divider.style.width = '1px';
          divider.style.height = '18px';
          divider.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          divider.style.margin = '0 6px';
          divider.style.flexShrink = '0';
          symbolBtn.parentNode?.insertBefore(divider, symbolBtn.nextSibling);
        }
      }
      if (drawingBarVisible) {
        drawingBar = container.querySelector('.ticker-pen-pro-drawing-bar') as HTMLElement;
        if (drawingBar && drawingBar.parentNode !== parentLayout) {
          parentLayout.appendChild(drawingBar);
        }
      }
    }

    // Set up MutationObserver on Chart 0 container to track when drawing bar visibility shifts
    let mutationObserver: MutationObserver | null = null;
    if (headerVisible && parentLayout) {
      const checkDrawingBar = () => {
        const db = parentLayout.querySelector('.ticker-pen-pro-drawing-bar') as HTMLElement;
        const isVisible = db && db.style.display !== 'none' && getComputedStyle(db).display !== 'none';
        if (isVisible) {
          if (!parentLayout.classList.contains('drawing-bar-open')) {
            parentLayout.classList.remove('drawing-bar-closed');
            parentLayout.classList.add('drawing-bar-open');
            window.dispatchEvent(new Event('resize'));
          }
        } else {
          if (!parentLayout.classList.contains('drawing-bar-closed')) {
            parentLayout.classList.remove('drawing-bar-open');
            parentLayout.classList.add('drawing-bar-closed');
            window.dispatchEvent(new Event('resize'));
          }
        }
      };

      checkDrawingBar();

      mutationObserver = new MutationObserver(checkDrawingBar);
      mutationObserver.observe(parentLayout, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    }

    // Find the correct core chart instance associated with this widget's container
    let activeCoreChartInstance: any = null;
    for (const coreChart of globalCoreCharts) {
      if (coreChart && typeof coreChart.getContainer === 'function') {
        const chartContainer = coreChart.getContainer();
        if (container.contains(chartContainer)) {
          activeCoreChartInstance = coreChart;
          break;
        }
      }
    }

    if (!activeCoreChartInstance && chart) {
      activeCoreChartInstance = (chart as any)._chartApi || (chart as any).chartApi;
    }

    if ((window as any).__addChartLog__) {
      (window as any).__addChartLog__(`[INIT CHART] idx=${idx} activeCoreChartInstance resolved=${!!activeCoreChartInstance} globalCoreChartsCount=${globalCoreCharts.size}`);
    }

    if (activeCoreChartInstance) {
      coreChartRef.current = activeCoreChartInstance;

      // Restore drawings and indicators from previous state on chart recreation
      setTimeout(() => {
        try {
          if (historyStateRef.current.currentSnapshot) {
            restoreDrawingsSnapshot(activeCoreChartInstance, historyStateRef.current.currentSnapshot);
          }
          if (activeIndicatorsRef.current && activeIndicatorsRef.current.length > 0) {
            activeIndicatorsRef.current.forEach((ind) => {
              try {
                activeCoreChartInstance.createIndicator({ id: ind.id, name: ind.name, paneId: ind.paneId }, true);
              } catch (e) {
                console.warn(`Failed to restore indicator ${ind.name} on recreation:`, e);
              }
            });
          }
        } catch (e) {
          console.warn('Error restoring chart state on recreation:', e);
        }
      }, 50);

      setTimeout(() => {
        try {
          const yAxis = getYAxisComponent(activeCoreChartInstance);
          if (yAxis) {
            const YAxisProto = Object.getPrototypeOf(yAxis);
            if (YAxisProto && !YAxisProto.__is_set_range_hijacked__) {
              YAxisProto.__is_set_range_hijacked__ = true;
              const originalSetRange = YAxisProto.setRange;

              YAxisProto.setRange = function (rangeVal: any) {
                if (this.__is_internal_smooth_set_range__) {
                  return originalSetRange.call(this, rangeVal);
                }
                const isAutoCalc = this.getAutoCalcTickFlag ? this.getAutoCalcTickFlag() : !!this._autoCalcTickFlag;
                if (!isAutoCalc) {
                  return originalSetRange.call(this, rangeVal);
                }
                // Native autoscaling derives its range from the visible candles.
                // Do not animate those updates: the animation queued stale
                // ranges during pan/zoom and made the price axis lag behind.
                return originalSetRange.call(this, rangeVal);

                this.__target_range_val__ = rangeVal;

                if (!this.__smooth_scale_animating__) {
                  this.__smooth_scale_animating__ = true;

                  const animate = () => {
                    if (!this.__smooth_scale_animating__) return;
                    const target = this.__target_range_val__;
                    const current = this.getRange ? this.getRange() : this._range;

                    if (!target || !current) {
                      this.__smooth_scale_animating__ = false;
                      return;
                    }

                    const currentMin = current.from !== undefined ? current.from : current.min;
                    const currentMax = current.to !== undefined ? current.to : current.max;
                    const targetMin = target.from !== undefined ? target.from : target.min;
                    const targetMax = target.to !== undefined ? target.to : target.max;

                    const diffMin = Math.abs(targetMin - currentMin);
                    const diffMax = Math.abs(targetMax - currentMax);
                    const threshold = (targetMax - targetMin) * 0.0001;

                    if (diffMin < threshold && diffMax < threshold) {
                      this.__is_internal_smooth_set_range__ = true;
                      originalSetRange.call(this, target);
                      this._range = target;
                      this._realRange = target;
                      this.__is_internal_smooth_set_range__ = false;
                      this.__smooth_scale_animating__ = false;

                      const pane = this._parent || (this.getParent && this.getParent());
                      const chart = pane?.getChart?.() || this._chartStore?._chart;
                      if (chart && typeof chart.updatePane === "function") {
                        chart.updatePane(4);
                      } else {
                        const charts = Array.from((window as any).globalCoreCharts || []);
                        charts.forEach((c: any) => { if (c && typeof c.updatePane === "function") c.updatePane(4); });
                      }
                      return;
                    }

                    const ease = 0.18;
                    const nextMin = currentMin + (targetMin - currentMin) * ease;
                    const nextMax = currentMax + (targetMax - currentMax) * ease;

                    const baseRange = this.getRange ? this.getRange() : undefined;
                    const realFrom = typeof this.valueToRealValue === "function" ? this.valueToRealValue(nextMin, baseRange ? { range: baseRange } : undefined) : nextMin;
                    const realTo = typeof this.valueToRealValue === "function" ? this.valueToRealValue(nextMax, baseRange ? { range: baseRange } : undefined) : nextMax;
                    const displayFrom = typeof this.realValueToDisplayValue === "function" ? this.realValueToDisplayValue(realFrom, baseRange ? { range: baseRange } : undefined) : realFrom;
                    const displayTo = typeof this.realValueToDisplayValue === "function" ? this.realValueToDisplayValue(realTo, baseRange ? { range: baseRange } : undefined) : realTo;

                    const nextRangeVal = {
                      from: nextMin,
                      to: nextMax,
                      range: nextMax - nextMin,
                      realFrom,
                      realTo,
                      realRange: realTo - realFrom,
                      displayFrom,
                      displayTo,
                      displayRange: displayTo - displayFrom
                    };

                    this.__is_internal_smooth_set_range__ = true;
                    originalSetRange.call(this, nextRangeVal);
                    this._range = nextRangeVal;
                    this._realRange = nextRangeVal;
                    this.__is_internal_smooth_set_range__ = false;

                    const pane = this._parent || (this.getParent && this.getParent());
                    const chart = pane?.getChart?.() || this._chartStore?._chart;
                    if (chart && typeof chart.updatePane === "function") {
                      chart.updatePane(4);
                    } else {
                      const charts = Array.from((window as any).globalCoreCharts || []);
                      charts.forEach((c: any) => { if (c && typeof c.updatePane === "function") c.updatePane(4); });
                    }

                    requestAnimationFrame(animate);
                  };
                  requestAnimationFrame(animate);
                }
              };
            }
          }
        } catch (e) {
          console.warn("Deferred YAxis setRange hijack failed:", e);
        }
      }, 150);

      coreChartRef.current = activeCoreChartInstance;

      // Initialize core chart store symbol if not set
      try {
        const currentSymbol = activeCoreChartInstance.getSymbol();
        if (!currentSymbol) {
          const initialSymbolMapped = mapSymbolInfo(symbol);
          activeCoreChartInstance.setSymbol(initialSymbolMapped);
        }
      } catch (err) {
        console.warn('Unable to initialize core chart symbol:', err);
      }

      if (typeof activeCoreChartInstance.setCustomApi === 'function') {
        activeCoreChartInstance.setCustomApi({
          // The shared formatter preserves TradingView-style hierarchy: time
          // labels within a day, then day/month/year labels at boundaries.
          formatDate: (dateTimeFormat: any, timestamp: number, formatStr: string, type: any) =>
            (utils as any).formatDate(dateTimeFormat, timestamp, formatStr, type)
        });
      }

      // Override timeScaleStore._adjustVisibleRange to remove all scroll limits and clamping constraints
      try {
        const timeScaleStore = (activeCoreChartInstance as any)._chartStore?.getTimeScaleStore();
        if (timeScaleStore && !timeScaleStore._adjustVisibleRange.__wrapped__) {
          const nativeAdjustVisibleRange = timeScaleStore._adjustVisibleRange;
          timeScaleStore._adjustVisibleRange = function (this: any) {
            const res = nativeAdjustVisibleRange.apply(this, arguments as any);
            try {
              if (this._visibleRange && this._visibleRange.from <= 50 && this.__has_more_historical_candles__ !== false) {
                const store = (activeCoreChartInstance as any)?._chartStore;
                if (store && !store._loading && typeof store._processDataLoad === 'function') {
                  store._processDataLoad('forward');
                }
              } else if (this._visibleRange) {
                const store = (activeCoreChartInstance as any)?._chartStore;
                const totalBars = store?._dataList?.length || 0;
                if (totalBars > 0 && this._visibleRange.to >= totalBars && store && !store._loading && typeof store._processDataLoad === 'function') {
                  store._processDataLoad('backward');
                }
              }
            } catch (e) { }
            return res;
          };
          timeScaleStore._adjustVisibleRange.__wrapped__ = true;
        }
      } catch (e) {
        console.warn('Error overriding timeScaleStore._adjustVisibleRange:', e);
      }

      // TickerPen Pro wires its built-in load-more callback to the wrong
      // direction for chronological Binance data. Supply a real forward
      // loader so scrolling left prepends the next older page indefinitely.
      try {
        const chartStore = (activeCoreChartInstance as any)._chartStore;
        const timeScaleStore = typeof chartStore?.getTimeScaleStore === 'function'
          ? chartStore.getTimeScaleStore()
          : chartStore?._timeScaleStore;
        if (timeScaleStore) {
          timeScaleStore.__has_more_historical_candles__ = true;
        }
        if (chartStore && chartStore._dataLoadMore) {
          chartStore._dataLoadMore.forward = true;
          chartStore._dataLoadMore.backward = true;
        }

        if (chartStore) {
          chartStore._dataLoader = {
            getBars: function (params: any) {
              const activeDf = datafeedRef.current || (typeof window !== 'undefined' && (window as any).__ACTIVE_DATAFEED__);
              if (!activeDf || typeof activeDf.getHistoryKLineData !== 'function') {
                if (typeof params.callback === 'function') {
                  params.callback([], { forward: false, backward: false });
                }
                return;
              }

              if (params.type === 'forward') {
                const oldestTs = Number(params.timestamp);
                if (Number.isFinite(oldestTs)) {
                  activeDf.getHistoryKLineData(chartStore._symbol, chartStore._period, 0, oldestTs - 1)
                    .then((bars: any[]) => {
                      const olderBars = (bars || []).filter((b: any) => b && Number(b.timestamp) < oldestTs);
                      if (typeof params.callback === 'function') {
                        params.callback(olderBars, { forward: olderBars.length > 0, backward: true });
                      }
                    })
                    .catch((err: any) => {
                      console.warn('Historical forward loader error:', err);
                      if (typeof params.callback === 'function') {
                        params.callback([], { forward: false, backward: true });
                      }
                    });
                  return;
                }
              }
              if (params.type === 'init') {
                activeDf.getHistoryKLineData(chartStore._symbol, chartStore._period, 0, Date.now())
                  .then((bars: any[]) => {
                    if (typeof params.callback === 'function') {
                      params.callback(bars || [], { forward: true, backward: false });
                    }
                  })
                  .catch(() => {
                    if (typeof params.callback === 'function') {
                      params.callback([], { forward: false, backward: false });
                    }
                  });
                return;
              }
              if (typeof params.callback === 'function') {
                params.callback([], { forward: false, backward: false });
              }
            }
          };
        }



        if (chartStore) {
          let currentStorePeriod = chartStore._period;
          Object.defineProperty(chartStore, '_period', {
            configurable: true,
            enumerable: true,
            get() {
              return currentStorePeriod;
            },
            set(newPeriod) {
              currentStorePeriod = newPeriod;
              const parsed = parsePeriod(newPeriod);
              if (parsed) {
                setCurrentPeriod(parsed);
              }
            }
          });

          let currentLoader = chartStore._dataLoader;
          Object.defineProperty(chartStore, '_dataLoader', {
            configurable: true,
            enumerable: true,
            get() {
              return currentLoader;
            },
            set(val) {
              currentLoader = val;
              if (val && !val.__historical_forward_loader__) {
                val.__historical_forward_loader__ = true;
                const originalGetBars = val.getBars;
                val.getBars = (params: any) => {
                  if (params?.type === 'forward') {
                    const oldestTimestamp = Number(params.timestamp);
                    if (!Number.isFinite(oldestTimestamp) || !datafeedRef.current) {
                      params.callback([], { forward: false, backward: false });
                      return;
                    }
                    const currentSym = params.symbol || chartStore?._symbol || chartInstanceRef.current?.getSymbol() || mapSymbolInfo(symbol);
                    const currentPeriod = params.period || chartStore?._period || getActivePeriodFallback();
                    (datafeedRef.current as any)[String.fromCharCode(103, 101, 116, 72, 105, 115, 116, 111, 114, 121, 75, 76, 105, 110, 101, 68, 97, 116, 97)](currentSym, currentPeriod, 0, oldestTimestamp - 1)
                      .then((bars: any) => {
                        const olderBars = (bars || []).filter((bar: any) => Number(bar.timestamp) < oldestTimestamp);
                        const hasMore = olderBars.length > 0;
                        if (timeScaleStore) timeScaleStore.__has_more_historical_candles__ = hasMore;
                        if (chartStore && chartStore._dataLoadMore) chartStore._dataLoadMore.forward = hasMore;
                        params.callback(olderBars, { forward: hasMore, backward: true });
                      })
                      .catch((error: any) => {
                        console.warn('Unable to load older candles:', error);
                        if (timeScaleStore) timeScaleStore.__has_more_historical_candles__ = false;
                        params.callback([], { forward: false, backward: false });
                      });
                    return;
                  }

                  if (params?.type === 'backward') {
                    const newestTimestamp = Number(params.timestamp);
                    if (!Number.isFinite(newestTimestamp) || !datafeedRef.current) {
                      params.callback([], { forward: true, backward: false });
                      return;
                    }
                    const currentSym = params.symbol || chartStore?._symbol || chartInstanceRef.current?.getSymbol() || mapSymbolInfo(symbol);
                    const currentPeriod = params.period || chartStore?._period || getActivePeriodFallback();
                    (datafeedRef.current as any).loadNewerHistory(currentSym, currentPeriod, newestTimestamp)
                      .then((bars: any[]) => {
                        const newerBars = (bars || []).filter((bar: any) => Number(bar.timestamp) > newestTimestamp);
                        // A full Binance page may have another page after it;
                        // anything shorter means this is the latest candle.
                        const hasMore = newerBars.length >= HISTORY_PAGE_SIZE;
                        if (chartStore && chartStore._dataLoadMore) chartStore._dataLoadMore.backward = hasMore;
                        params.callback(newerBars, { forward: true, backward: hasMore });
                      })
                      .catch((error: any) => {
                        console.warn('Unable to load newer candles:', error);
                        if (chartStore && chartStore._dataLoadMore) chartStore._dataLoadMore.backward = false;
                        params.callback([], { forward: true, backward: false });
                      });
                    return;
                  }

                  return originalGetBars.call(val, params);
                };
              }
            }
          });

          // Trigger the setter immediately if already defined
          if (currentLoader) {
            chartStore._dataLoader = currentLoader;
          }
        }
      } catch (e) {
        console.warn('Unable to configure historical data loader:', e);
      }
      // Keep state that belongs to this layout pane on its own chart object.
      // The side toolbar uses this to avoid applying another pane's zoom stack.
      activeCoreChartInstance.__zoom_history_stack__ = zoomHistoryRef.current;
      if (isActive || !(window as any).__active_chart_instance__) {
        (window as any).__active_chart_instance__ = activeCoreChartInstance;
      }

      // Snapping / Magnet mode wrapper for coordinate pixel conversion (native tools)
      if (activeCoreChartInstance.convertFromPixel && !activeCoreChartInstance.convertFromPixel.__wrapped__) {
        const origConvertFromPixel = activeCoreChartInstance.convertFromPixel;
        activeCoreChartInstance.convertFromPixel = function (coordinates: any[], options: any) {
          const result = origConvertFromPixel.apply(this, arguments as any);
          if (!result || !Array.isArray(result) || result.length === 0) return result;

          const magnetMode = (window as any).__magnet_mode__ || 'normal';
          if (magnetMode === 'normal') return result;

          try {
            const dataList = typeof this.getDataList === 'function' ? this.getDataList() : [];
            if (!dataList || dataList.length === 0) return result;

            const panes = typeof this.getPanes === 'function' ? this.getPanes() : [];
            const xAxis = panes[0]?.getAxisComponent ? panes[0].getAxisComponent() : null;

            return result.map((item: any, idx: number) => {
              if (!item) return item;
              const coord = coordinates[idx];
              const coordX = coord && typeof coord.x === 'number' ? coord.x : null;
              const coordY = coord && typeof coord.y === 'number' ? coord.y : null;

              const dataIndex = typeof item.dataIndex === 'number'
                ? Math.max(0, Math.min(dataList.length - 1, Math.round(item.dataIndex)))
                : (xAxis && typeof xAxis.convertFromPixel === 'function' && coordX !== null
                    ? Math.max(0, Math.min(dataList.length - 1, Math.round(xAxis.convertFromPixel(coordX))))
                    : (dataList.length - 1));

              const candle = dataList[dataIndex];
              if (!candle) return item;

              const open = Number(candle.open);
              const high = Number(candle.high);
              const low = Number(candle.low);
              const close = Number(candle.close);
              const targets = [
                { type: 'high', price: high, weight: 1.25 },
                { type: 'low', price: low, weight: 1.25 },
                { type: 'open', price: open, weight: 1.0 },
                { type: 'close', price: close, weight: 1.0 }
              ].filter(n => Number.isFinite(n.price));
              if (targets.length === 0) return item;

              const candlePixelX = xAxis && typeof xAxis.convertToPixel === 'function'
                ? xAxis.convertToPixel(dataIndex)
                : (coordX ?? 0);

              let bestTarget = targets[0];
              let minWeightedDiff = Number.POSITIVE_INFINITY;
              let actualPixelDiff = Number.POSITIVE_INFINITY;

              for (const target of targets) {
                const ohlcPixelY = typeof this.convertToPixel === 'function'
                  ? this.convertToPixel([{ value: target.price }], options)?.[0]?.y
                  : null;
                const dy = coordY !== null && typeof ohlcPixelY === 'number' && !isNaN(ohlcPixelY)
                  ? Math.abs(coordY - ohlcPixelY)
                  : Math.abs(item.value - target.price);
                const dx = coordX !== null && typeof candlePixelX === 'number' && !isNaN(candlePixelX)
                  ? Math.abs(coordX - candlePixelX)
                  : 0;
                const rawDist = Math.hypot(dx, dy);
                const weightedDiff = rawDist / target.weight;

                if (weightedDiff < minWeightedDiff) {
                  minWeightedDiff = weightedDiff;
                  actualPixelDiff = rawDist;
                  bestTarget = target;
                }
              }

              if (magnetMode === 'strong_magnet') {
                return { ...item, dataIndex, timestamp: candle.timestamp || item.timestamp, value: bestTarget.price };
              } else if (magnetMode === 'weak_magnet') {
                if (actualPixelDiff <= 28) {
                  return { ...item, dataIndex, timestamp: candle.timestamp || item.timestamp, value: bestTarget.price };
                }
              }
              return item;
            });
          } catch (e) {
            console.warn('Error in snapped convertFromPixel:', e);
          }
          return result;
        };
        activeCoreChartInstance.convertFromPixel.__wrapped__ = true;
      }

      // Track cursor positions on pointermove to provide accurate anchor points for Axis convertFromPixel
      if (container && !(container as any).__has_magnet_pointer_tracker__) {
        (container as any).__has_magnet_pointer_tracker__ = true;
        container.addEventListener('pointermove', (e: PointerEvent) => {
          const rect = container.getBoundingClientRect();
          (window as any).__last_chart_pixel_x__ = e.clientX - rect.left;
          (window as any).__last_chart_pixel_y__ = e.clientY - rect.top;
        }, { passive: true });
      }

      // Snapping / Magnet mode wrapper for Axis convertFromPixel (custom overlays)
      try {
        const panes = typeof activeCoreChartInstance.getPanes === 'function' ? activeCoreChartInstance.getPanes() : [];
        panes.forEach((pane: any) => {
          const yAxis = typeof pane.getAxisComponent === 'function' ? pane.getAxisComponent() : null;
          const xAxis = typeof activeCoreChartInstance.getXAxis === 'function'
            ? activeCoreChartInstance.getXAxis()
            : (panes[0]?.getAxisComponent ? panes[0].getAxisComponent() : null);

          if (yAxis && typeof yAxis.convertFromPixel === 'function' && !yAxis.convertFromPixel.__wrapped__) {
            const origConvert = yAxis.convertFromPixel;
            yAxis.convertFromPixel = function (pixelY: number) {
              const originalPrice = origConvert.call(this, pixelY);
              if (originalPrice === null || originalPrice === undefined) return originalPrice;

              const magnetMode = (window as any).__magnet_mode__ || 'normal';
              if (magnetMode === 'normal') return originalPrice;

              const dataList = typeof activeCoreChartInstance.getDataList === 'function' ? activeCoreChartInstance.getDataList() : [];
              if (!dataList || dataList.length === 0) return originalPrice;

              const lastPx = (window as any).__last_chart_pixel_x__;
              let currentDataIndex = dataList.length - 1;
              if (xAxis && typeof xAxis.convertFromPixel === 'function' && typeof lastPx === 'number') {
                currentDataIndex = Math.max(0, Math.min(dataList.length - 1, Math.round(xAxis.convertFromPixel(lastPx))));
              }

              const candle = dataList[currentDataIndex];
              if (!candle) return originalPrice;

              const open = Number(candle.open);
              const high = Number(candle.high);
              const low = Number(candle.low);
              const close = Number(candle.close);
              const targets = [
                { type: 'high', price: high, weight: 1.25 },
                { type: 'low', price: low, weight: 1.25 },
                { type: 'open', price: open, weight: 1.0 },
                { type: 'close', price: close, weight: 1.0 }
              ].filter(n => Number.isFinite(n.price));
              if (targets.length === 0) return originalPrice;

              const candlePixelX = xAxis && typeof xAxis.convertToPixel === 'function' ? xAxis.convertToPixel(currentDataIndex) : (lastPx ?? 0);

              let bestTarget = targets[0];
              let minWeightedDiff = Number.POSITIVE_INFINITY;
              let actualPixelDiff = Number.POSITIVE_INFINITY;

              for (const target of targets) {
                const ohlcPixelY = typeof this.convertToPixel === 'function'
                  ? this.convertToPixel(target.price)
                  : null;
                const dy = typeof ohlcPixelY === 'number' && !isNaN(ohlcPixelY)
                  ? Math.abs(pixelY - ohlcPixelY)
                  : Math.abs(originalPrice - target.price);
                const dx = typeof lastPx === 'number' && typeof candlePixelX === 'number'
                  ? Math.abs(lastPx - candlePixelX)
                  : 0;
                const rawDist = Math.hypot(dx, dy);
                const weightedDiff = rawDist / target.weight;

                if (weightedDiff < minWeightedDiff) {
                  minWeightedDiff = weightedDiff;
                  actualPixelDiff = rawDist;
                  bestTarget = target;
                }
              }

              if (magnetMode === 'strong_magnet') {
                return bestTarget.price;
              } else if (magnetMode === 'weak_magnet') {
                if (actualPixelDiff <= 28) {
                  return bestTarget.price;
                }
              }
              return originalPrice;
            };
            yAxis.convertFromPixel.__wrapped__ = true;
          }
        });
      } catch (e) {
        console.warn('Error wrapping YAxis convertFromPixel:', e);
      }
    }
    if (chart && (isActive || !(window as any).__active_chart_widget__)) {
      (window as any).__active_chart_widget__ = chart;
    }
    // Direct, high-precision TradingView-style zoom centered on cursor
    let zoomRafId: number | null = null;

    const handleWheelZoom = (e: WheelEvent) => {
      if (!container || !container.contains(e.target as Node)) return;
      if (styles?.zoomEnabled === false) return;

      e.preventDefault();
      e.stopPropagation();

      // 1. Precise delta normalization across all devices (wheel notches, high-res mice, trackpads)
      let rawDelta = e.deltaY;
      if (e.deltaMode === 1) {
        // DOM_DELTA_LINE: Firefox / discrete wheel ticks (lines)
        rawDelta *= 33.33;
      } else if (e.deltaMode === 2) {
        // DOM_DELTA_PAGE: Page scroll
        rawDelta *= 100;
      }

      if (rawDelta === 0 || !Number.isFinite(rawDelta)) return;

      const coreChart = coreChartRef.current || activeCoreChartInstance;
      if (!coreChart) return;

      const chartStore = coreChart._chartStore || (coreChart as any).chartStore;
      const timeScaleStore = typeof chartStore?.getTimeScaleStore === 'function' ? chartStore.getTimeScaleStore() : chartStore?._timeScaleStore;
      if (!timeScaleStore) return;

      const containerRect = container.getBoundingClientRect();
      const cursorX = e.clientX - containerRect.left;
      const cursorY = e.clientY - containerRect.top;
      const mainWidth = (timeScaleStore as any)._totalBarSpace || (containerRect.width - 60);

      // Check if mouse is hovering over the Y-axis price scale on the right (TradingView price scale zoom)
      if (cursorX > mainWidth && cursorX <= containerRect.width) {
        try {
          const pane = coreChart.getPane?.() || (coreChart.getPanes?.() || [])[0];
          const yAxis = pane?.getYAxisComponentById?.('candle_pane') || coreChart.getYAxes?.({ paneId: 'candle_pane' })?.[0];
          if (yAxis && typeof yAxis.getRange === 'function' && typeof yAxis.setRange === 'function') {
            const range = yAxis.getRange();
            if (range && Number.isFinite(range.min) && Number.isFinite(range.max)) {
              const rangeSpan = range.max - range.min;
              const currentPrice = yAxis.convertFromPixel(cursorY);
              const priceRatio = currentPrice != null ? (currentPrice - range.min) / rangeSpan : 0.5;
              const clampedRatio = Math.max(0.05, Math.min(0.95, priceRatio));

              const yZoomFactor = rawDelta < 0 ? 0.96 : 1.0416;
              const newSpan = Math.max(0.000001, rangeSpan * yZoomFactor);
              const newMin = currentPrice - newSpan * clampedRatio;
              const newMax = currentPrice + newSpan * (1 - clampedRatio);
              yAxis.setAutoCalcTickFlag(false);
              yAxis.setRange({ min: newMin, max: newMax });
              coreChart.layout({ update: true });
              return;
            }
          }
        } catch (err) { }
      }

      // 2. Main chart time-scale zoom: Exact TradingView-style cursor tracking and exponential speed
      const speedMultiplier = typeof styles?.zoomSpeed === 'number' && styles.zoomSpeed > 0 ? styles.zoomSpeed : 1.5;
      const clampedDelta = Math.max(-300, Math.min(300, rawDelta));
      // Standard TradingView base speed: ~10% scale per discrete notch (continuous exponential scaling)
      const zoomFactor = Math.exp(-clampedDelta * 0.001 * (speedMultiplier / 1.5));

      const currentBarSpace = typeof timeScaleStore.getBarSpace === 'function'
        ? timeScaleStore.getBarSpace().bar
        : (timeScaleStore._barSpace || 6);

      // Clamp bar space within original TradingView boundaries (1.2px to 800px)
      if (zoomFactor > 1 && currentBarSpace >= 800) return;
      if (zoomFactor < 1 && currentBarSpace <= 1.2) return;

      // 3. Right-to-Left zoom: Anchor zoom to the right edge of the chart
      const totalBarSpace = (timeScaleStore as any)._totalBarSpace || mainWidth || 1000;
      const zoomPoint = { x: totalBarSpace, y: cursorY };

      // Convert zoomFactor to step scale: barSpace * (1 + scale / 10) = barSpace * zoomFactor
      // => scale = 10 * (zoomFactor - 1)
      const step = 10 * (zoomFactor - 1);

      try {
        if (typeof timeScaleStore.zoom === 'function') {
          timeScaleStore.zoom(step, zoomPoint);
        } else if (typeof coreChart.zoom === 'function') {
          coreChart.zoom(step, zoomPoint);
        } else {
          const newBarSpace = Math.max(1.2, Math.min(800, currentBarSpace * zoomFactor));
          const currentBarCount = timeScaleStore.getLastBarRightSideDiffBarCount();
          if (typeof timeScaleStore.setBarSpace === 'function') {
            timeScaleStore.setBarSpace(newBarSpace);
          } else if (typeof coreChart.setBarSpace === 'function') {
            coreChart.setBarSpace(newBarSpace);
          }
          const newBarCount = (currentBarCount * currentBarSpace) / newBarSpace;
          timeScaleStore.setLastBarRightSideDiffBarCount(newBarCount);
        }

        // Cache the new bar count to prevent incoming data updates from resetting the zoom
        coreChart.__user_panned_bar_count__ = timeScaleStore.getLastBarRightSideDiffBarCount();

        // Force a full layout update so the candle pane redraws immediately
        if (typeof coreChart.adjustPaneViewport === 'function') {
          coreChart.adjustPaneViewport(false, true, true, true);
        }
        if (typeof coreChart.layout === 'function') {
          coreChart.layout({ update: true });
        }
        resetYAxes();
      } catch (err) {
        console.warn('Error in wheel zoom:', err);
      }
    };

    window.addEventListener('wheel', handleWheelZoom, { passive: false, capture: true });





    // Subscribe to crosshair events to show hovered candle data in status line
    if (activeCoreChartInstance) {
      // Hijack drawing, period, and indicator methods on Chart 0 to redirect them to the active chart
      const origCreateOverlay = activeCoreChartInstance.createOverlay;
      const origOverrideOverlay = activeCoreChartInstance.overrideOverlay;
      const origRemoveOverlay = activeCoreChartInstance.removeOverlay;
      const origSetPeriod = activeCoreChartInstance.setPeriod;
      const origCreateIndicator = activeCoreChartInstance.createIndicator;
      const origRemoveIndicator = activeCoreChartInstance.removeIndicator;

      activeCoreChartInstance.createOverlay = function (options: any) {
        if (options && typeof options === 'object') {
          if (!options.mode) {
            options.mode = (window as any).__magnet_mode__ || 'normal';
          }
        }
        if (options && (!options.id || !options.id.includes('future-time-scale'))) {
          logDiagnostic('createOverlay called with options:', options);
        }
        if (options && options.name === 'emoji' && !options.extendData) {
          options.extendData = {
            unified: (window as any).__current_selected_2d_emoji || '1f600'
          };
        }
        if (options && options.name === 'table' && !options.extendData) {
          options.extendData = {
            rows: 3,
            cols: 3,
            tableData: Array.from({ length: 3 }, () => Array(3).fill('')),
            backgroundColor: '#3c404b',
            borderColor: '#2962ff',
            borderWidth: 1,
            textColor: '#ffffff',
            fontSize: 14,
            textAlign: 'left',
            headerRow: false,
            headerBgColor: '#242836',
            headerTextColor: '#ffffff',
            zebraStriping: false,
            zebraColor: 'rgba(255, 255, 255, 0.04)',
            borderRadius: 6
          };
        }
        // Helper: properly complete and save an in-progress polyline/path
        const _completeProgressPolyline = (chart: any) => {
          if (!chart?._chartStore) return;
          const info = chart._chartStore.getProgressOverlayInfo();
          if (!info) return;
          const overlay = info.overlay;
          if (!overlay) return;
          if (overlay.name !== 'polyline' && overlay.name !== 'path') return;
          if (!overlay.isDrawing()) return;
          if (!overlay.points || overlay.points.length < 2) return;
          // Remove the trailing "cursor" point that follows the mouse
          if (overlay.points.length >= 3) {
            overlay.points.length = overlay.points.length - 1;
          }
          checkAndClosePolyline(overlay);
          overlay.forceComplete();
          chart._chartStore.progressOverlayComplete();
          if (typeof overlay.onDrawEnd === 'function') {
            try { overlay.onDrawEnd({ overlay, chart }); } catch (e) { }
          }
        };

        _completeProgressPolyline(activeCoreChartInstance);
        const res = origCreateOverlay.apply(this, arguments as any);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('save-history-state'));
          window.dispatchEvent(new CustomEvent('update-layer-panel'));
        }, 50);
        return res;
      };

      activeCoreChartInstance.overrideOverlay = function (options: any) {
        if (options && (!options.id || !options.id.includes('future-time-scale'))) {
          logDiagnostic('overrideOverlay called with options:', options);
        }
        if (options && typeof options.mode === 'string') {
          (window as any).__magnet_mode__ = options.mode;
        }
        const res = origOverrideOverlay.apply(this, arguments as any);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('save-history-state'));
          window.dispatchEvent(new CustomEvent('update-layer-panel'));
        }, 50);
        return res;
      };

      activeCoreChartInstance.removeOverlay = function (options: any) {
        logDiagnostic('removeOverlay called with options/filter:', options);
        const res = origRemoveOverlay.apply(this, arguments as any);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('save-history-state'));
          window.dispatchEvent(new CustomEvent('update-layer-panel'));
        }, 50);
        return res;
      };

      if (typeof activeCoreChartInstance.subscribeAction === 'function') {
        activeCoreChartInstance.subscribeAction('onDrawEnd', () => {
          window.dispatchEvent(new CustomEvent('save-history-state'));
          window.dispatchEvent(new CustomEvent('tickerpen-draw-end'));
          window.dispatchEvent(new CustomEvent('update-layer-panel'));
        });
        activeCoreChartInstance.subscribeAction('onPressedMoveEnd', () => {
          window.dispatchEvent(new CustomEvent('save-history-state'));
          window.dispatchEvent(new CustomEvent('tickerpen-draw-end'));
          window.dispatchEvent(new CustomEvent('update-layer-panel'));
        });
      }

      activeCoreChartInstance.setPeriod = function (period: any) {
        logDiagnostic('setPeriod called with period:', period);
        const parsed = parsePeriod(period);
        if (parsed) {
          setCurrentPeriod(parsed);
        }

        // Capture current historical timestamp in visible center
        let targetTimestamp: number | null = null;
        try {
          const chartStore = this._chartStore;
          const timeScaleStore = typeof chartStore?.getTimeScaleStore === 'function'
            ? chartStore.getTimeScaleStore()
            : chartStore?._timeScaleStore;
          const dataList = typeof this.getDataList === 'function' ? this.getDataList() : [];
          if (timeScaleStore && dataList && dataList.length > 0) {
            const visibleRange = typeof timeScaleStore.getVisibleRange === 'function' ? timeScaleStore.getVisibleRange() : null;
            if (visibleRange && typeof visibleRange.from === 'number' && typeof visibleRange.to === 'number' && visibleRange.to > visibleRange.from) {
              const midIdx = Math.max(0, Math.min(dataList.length - 1, Math.round((visibleRange.from + visibleRange.to) / 2)));
              targetTimestamp = Number(dataList[midIdx]?.timestamp);
            }
          }
        } catch (e) { }

        if (targetTimestamp !== null && !isNaN(targetTimestamp)) {
          this.__target_historical_timestamp__ = targetTimestamp;
          const anchorInfo = { timestamp: targetTimestamp, screenRatio: 0.5 };
          if (datafeedRef.current) {
            (datafeedRef.current as any).savedAnchorInfo = anchorInfo;
            (datafeedRef.current as any).savedAnchorTimestamp = targetTimestamp;
          }
        } else {
          this.__target_historical_timestamp__ = null;
          this.__user_panned_bar_count__ = undefined;
        }

        const res = origSetPeriod.apply(this, arguments as any);
        return res;
      };

      activeCoreChartInstance.createIndicator = function (value: any, isStack: any) {
        logDiagnostic('createIndicator called with value:', value, 'isStack:', isStack);
        return origCreateIndicator.apply(this, arguments as any);
      };

      activeCoreChartInstance.removeIndicator = function (filter: any) {
        logDiagnostic('removeIndicator called with filter:', filter);
        return origRemoveIndicator.apply(this, arguments as any);
      };

      let pendingActiveData: any = null;
      let activeDataRaf: number | null = null;
      const updateActiveDataSmoothly = (data: any) => {
        pendingActiveData = data;
        if (activeDataRaf === null) {
          activeDataRaf = requestAnimationFrame(() => {
            activeDataRaf = null;
            if (pendingActiveData) {
              setActiveData(pendingActiveData);
            }
          });
        }
      };

      activeCoreChartInstance.subscribeAction('onCrosshairChange', (params: any) => {
        const chartStore = (activeCoreChartInstance as any)._chartStore;
        const crosshairObj = chartStore ? chartStore.getCrosshair() : null;

        let dataIndex: number | null = null;
        if (crosshairObj && typeof crosshairObj.dataIndex === 'number' && crosshairObj.dataIndex >= 0) {
          dataIndex = crosshairObj.dataIndex;
        }

        if (typeof dataIndex !== 'number' && params) {
          if (typeof params.dataIndex === 'number') {
            dataIndex = params.dataIndex;
          } else if (params.kLineData && typeof params.kLineData.dataIndex === 'number') {
            dataIndex = params.kLineData.dataIndex;
          } else if (params.tickerPenData && typeof params.tickerPenData.dataIndex === 'number') {
            dataIndex = params.tickerPenData.dataIndex;
          } else if (typeof params.x === 'number' && chartStore && typeof chartStore.coordinateToDataIndex === 'function') {
            const idxVal = chartStore.coordinateToDataIndex(params.x);
            if (typeof idxVal === 'number' && idxVal >= 0) {
              dataIndex = idxVal;
            }
          }
        }

        const myDataList = activeCoreChartInstance.getDataList();

        if (myDataList && typeof dataIndex === 'number' && dataIndex >= 0 && dataIndex < myDataList.length) {
          isHoveringRef.current = true;
          updateActiveDataSmoothly(myDataList[dataIndex]);
          lastHoveredIndexRef.current = dataIndex;
          (activeCoreChartInstance as any).__last_hovered_data_index__ = dataIndex;
        } else {
          const directData = params?.kLineData || params?.tickerPenData || (crosshairObj && crosshairObj.kLineData);
          if (directData && typeof directData.open === 'number') {
            isHoveringRef.current = true;
            updateActiveDataSmoothly(directData);
            if (typeof directData.dataIndex === 'number') {
              lastHoveredIndexRef.current = directData.dataIndex;
              (activeCoreChartInstance as any).__last_hovered_data_index__ = directData.dataIndex;
            }
          } else {
            isHoveringRef.current = false;
            if (myDataList && myDataList.length > 0) {
              const lastIdx = myDataList.length - 1;
              updateActiveDataSmoothly(myDataList[lastIdx]);
              lastHoveredIndexRef.current = lastIdx;
              (activeCoreChartInstance as any).__last_hovered_data_index__ = lastIdx;
            }
          }
        }
      });
    }

    // Keep a hidden overlay that supplies future time labels in the empty
    // right-side chart area. It does not add candles or change price data.
    const futureTimeOverlayId = `future-time-scale-${Math.random().toString(36).slice(2)}`;
    let futureTimeOverlayCreated = false;
    const syncFutureTimeScale = () => {
      const coreChart = getCoreChart();
      if (!coreChart || typeof coreChart.getDataList !== 'function') return;
      const dataList = coreChart.getDataList();
      if (!Array.isArray(dataList) || dataList.length < 2) return;

      const lastIndex = dataList.length - 1;
      const lastTimestamp = Number(dataList[lastIndex]?.timestamp);
      const previousTimestamp = Number(dataList[lastIndex - 1]?.timestamp);
      const interval = activeTimeframeMsRef.current || Number((window as any).__active_timeframe_ms__) || (lastTimestamp - previousTimestamp);
      if (!Number.isFinite(lastTimestamp) || !Number.isFinite(interval) || interval <= 0) return;

      const points = Array.from({ length: 10 }, (_, index) => {
        const step = (index + 1) * 4;
        return {
          dataIndex: lastIndex + step,
          timestamp: lastTimestamp + interval * step,
          value: Number(dataList[lastIndex]?.close ?? 0)
        };
      });

      try {
        if (!futureTimeOverlayCreated) {
          coreChart.createOverlay({
            id: futureTimeOverlayId,
            name: 'future-time-scale',
            points
          });
          futureTimeOverlayCreated = true;
        } else if (typeof coreChart.overrideOverlay === 'function') {
          coreChart.overrideOverlay({ id: futureTimeOverlayId, points });
        }
      } catch (error) {
        // The chart can be between period/datafeed transitions.
      }
    };

    syncFutureTimeScale();

    // Set up polling interval to fetch latest live tick data when not hovering and sync active indicators
    const dataInterval = setInterval(() => {
      const coreChart = getCoreChart();
      if (coreChart) {
        syncFutureTimeScale();
        if (!isHoveringRef.current) {
          const list = coreChart.getDataList();
          if (list && list.length > 0) {
            setActiveData(list[list.length - 1]);
          }
        }

        // Sync active indicators list
        const list: any[] = [];
        try {
          const indicators = coreChart.getIndicators();
          if (Array.isArray(indicators)) {
            indicators.forEach((ind: any) => {
              const paneId = ind.paneId;
              const key = `${paneId}-${ind.name}`;
              if (hiddenIndicatorsRef.current.has(key)) {
                hiddenIndicatorsRef.current.delete(key);
              }
              list.push({
                id: ind.id,
                name: ind.name,
                visible: ind.visible !== false,
                paneId: paneId
              });
              if (ind.name !== 'VOL OVERLAY') {
                const hideVal = styles?.statusIndicatorValues === false;
                try {
                  coreChart.overrideIndicator({
                    name: ind.name,
                    paneId: paneId,
                    createTooltipDataSource: () => ({
                      features: [],
                      ...(hideVal ? { values: [] } : {})
                    })
                  });
                } catch (e) { }
              }
            });
          }
        } catch (e) { }

        // Append hidden indicators that were removed from the chart to collapse their panes
        hiddenIndicatorsRef.current.forEach((key) => {
          const [paneId, name] = key.split('-');
          list.push({
            name: name,
            visible: false,
            paneId: paneId
          });
        });

        const listStr = JSON.stringify(list);
        if (listStr !== JSON.stringify(activeIndicatorsRef.current)) {
          activeIndicatorsRef.current = list;
          setActiveIndicators(list);
        }
      }
    }, 100);

    // Dynamically inject custom timeframe dropdown menu at the end of the period list
    const corePeriodBar = periodBar || container.querySelector('.ticker-pen-pro-period-bar') || (parentLayout ? parentLayout.querySelector('.ticker-pen-pro-period-bar') : null);
    if (corePeriodBar) {
      // Helper function to capture current visible center timestamp if user has dragged back into history
      const captureAnchorTimestamp = () => {
        try {
          const activeCore = getCoreChart();
          if (!activeCore) return null;
          const chartStore = (activeCore as any)?._chartStore;
          const timeScaleStore = typeof chartStore?.getTimeScaleStore === 'function'
            ? chartStore.getTimeScaleStore()
            : chartStore?._timeScaleStore;
          const dataList = (typeof activeCore.getDataList === 'function' ? activeCore.getDataList() : chartStore?._dataList) || [];
          if (!timeScaleStore || dataList.length === 0) return null;

          const visibleRange = timeScaleStore._visibleRange;
          const totalBars = dataList.length;

          let targetIdx = totalBars - 1;
          if (visibleRange && typeof visibleRange.realFrom === 'number' && typeof visibleRange.realTo === 'number' && visibleRange.realTo > visibleRange.realFrom) {
            targetIdx = Math.max(0, Math.min(totalBars - 1, Math.round((visibleRange.realFrom + visibleRange.realTo) / 2)));
          } else {
            const visBars = (timeScaleStore._totalBarSpace || 800) / (timeScaleStore._barSpace || 6);
            const lastBarDiff = typeof timeScaleStore.getLastBarRightSideDiffBarCount === 'function'
              ? timeScaleStore.getLastBarRightSideDiffBarCount()
              : timeScaleStore._lastBarRightSideDiffBarCount;
            targetIdx = Math.max(0, Math.min(totalBars - 1, Math.round(totalBars + lastBarDiff - (visBars / 2))));
          }

          const anchorCandle = dataList[targetIdx];
          if (anchorCandle && typeof anchorCandle.timestamp === 'number') {
            const anchorInfo = { timestamp: anchorCandle.timestamp, screenRatio: 0.5 };
            if (datafeedRef.current) {
              (datafeedRef.current as any).savedAnchorInfo = anchorInfo;
              (datafeedRef.current as any).savedAnchorTimestamp = anchorCandle.timestamp;
            }
            if (chartStore) {
              chartStore.__preserve_anchor_ts__ = anchorInfo;
            }
            activeCore.__preserve_anchor_ts__ = anchorInfo;
            return anchorInfo;
          }
        } catch (e) {
          console.warn('Error capturing anchor timestamp:', e);
        }
        return null;
      };

      // Helper function to change timeframe on core, wrapper and React state synchronously
      const changePeriod = (selectedPeriod: Period) => {
        captureAnchorTimestamp();
        setCurrentPeriod(selectedPeriod);
        if (typeof window !== 'undefined') {
          (window as any).__active_period__ = selectedPeriod.text;
          (window as any).__active_timeframe_text__ = selectedPeriod.text;
          (window as any).__current_timeframe__ = selectedPeriod.text;
        }

        const activeCore = getCoreChart();
        if (activeCore && typeof activeCore.setPeriod === 'function') {
          try {
            activeCore.setPeriod(selectedPeriod);
          } catch (e) {
            console.warn('Failed to set period on core chart:', e);
          }
        }
        if (chart && chart !== activeCore && typeof (chart as any).setPeriod === 'function') {
          try {
            (chart as any).setPeriod(selectedPeriod);
          } catch (e) { }
        }
      };

      // Listen to clicks on the built-in period toolbar buttons to update currentPeriod state synchronously
      corePeriodBar.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const button = target.closest('button') || target.closest('.item') || target.closest('.period');
        if (button) {
          const text = button.textContent?.trim();
          if (text) {
            const matchedPeriod = ALL_PERIODS.find(p => p.text === text);
            if (matchedPeriod) {
              logDiagnostic('Starred toolbar button clicked. Selecting period:', matchedPeriod.text, matchedPeriod);
              changePeriod(matchedPeriod);
            }
          }
        }
      });

      const dropdownParent = parentLayout || container;
      // Create dropdown container
      const dropdownContainer = document.createElement('div');
      dropdownContainer.className = 'custom-period-dropdown-container';
      dropdownContainer.style.position = 'relative';
      dropdownContainer.style.display = 'inline-flex';
      dropdownContainer.style.alignItems = 'center';
      dropdownContainer.style.marginLeft = '0px';
      dropdownContainer.style.borderRadius = '4px';
      dropdownContainer.style.transition = 'all 0.15s';
      dropdownContainer.style.color = '#d1d4dc';
      dropdownContainer.style.backgroundColor = 'transparent';

      // Create arrow dropdown button right next to the timeframe selection buttons
      const arrowBtn = document.createElement('button');
      arrowBtn.className = 'custom-timeframes-arrow-btn';
      arrowBtn.style.background = 'transparent';
      arrowBtn.style.border = 'none';
      arrowBtn.style.color = 'inherit';
      arrowBtn.style.cursor = 'pointer';
      arrowBtn.style.display = 'inline-flex';
      arrowBtn.style.alignItems = 'center';
      arrowBtn.style.justifyContent = 'center';
      arrowBtn.style.padding = '6px';
      arrowBtn.style.width = '32px';
      arrowBtn.style.height = '32px';
      arrowBtn.style.borderRadius = '6px';
      arrowBtn.style.transition = 'all 0.15s';
      arrowBtn.title = 'More Timeframes';
      arrowBtn.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="6 9 12 15 18 9"/></svg>`;

      dropdownContainer.appendChild(arrowBtn);

      dropdownContainer.onmouseenter = () => {
        const isOpen = dropdownMenu.classList.contains('show-menu');
        if (!isOpen) {
          dropdownContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
          dropdownContainer.style.color = '#ffffff';
        }
      };
      dropdownContainer.onmouseleave = () => {
        const isOpen = dropdownMenu.classList.contains('show-menu');
        dropdownContainer.style.backgroundColor = isOpen ? 'rgba(41, 98, 255, 0.25)' : 'transparent';
        dropdownContainer.style.color = isOpen ? '#ffffff' : '#d1d4dc';
      };

      // Create dropdown popover list
      const dropdownMenu = document.createElement('div');
      dropdownMenu.className = 'custom-timeframe-dropdown-menu';
      dropdownMenu.style.position = 'absolute';
      dropdownMenu.style.backgroundColor = '#1e222d';
      dropdownMenu.style.border = '1px solid #2a2e39';
      dropdownMenu.style.borderRadius = '6px';
      dropdownMenu.style.padding = '6px';
      dropdownMenu.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.7)';
      dropdownMenu.style.display = 'none';
      dropdownMenu.style.zIndex = '999999';
      dropdownMenu.style.minWidth = '130px';

      // Helper to rebuild menu items with updated selection state
      const rebuildTimeframeMenu = () => {
        dropdownMenu.innerHTML = '';
        const currentPeriodText = chartInstanceRef.current?.getPeriod()?.text || '15m';
        const isLight = typeof document !== 'undefined' && document.body.getAttribute('data-chrome-theme') === 'light';

        ALL_PERIODS.forEach((p) => {
          const optionItem = document.createElement('div');
          optionItem.style.display = 'flex';
          optionItem.style.justifyContent = 'space-between';
          optionItem.style.alignItems = 'center';
          optionItem.style.padding = '8px 12px';
          optionItem.style.cursor = 'pointer';
          optionItem.style.fontSize = '13px';

          const isSelected = p.text === currentPeriodText;
          optionItem.style.color = isSelected ? (isLight ? '#000000' : '#2962ff') : (isLight ? '#131722' : '#d1d4dc');
          optionItem.style.fontWeight = isSelected ? '700' : 'normal';
          optionItem.style.borderRadius = '4px';
          optionItem.style.margin = '2px 0';
          optionItem.style.transition = 'background-color 0.15s, color 0.15s';
          optionItem.style.backgroundColor = isSelected ? (isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(41, 98, 255, 0.15)') : 'transparent';

          // Timeframe text selection click
          const label = document.createElement('span');
          label.innerText = p.text;
          label.style.flexGrow = '1';
          label.style.color = 'inherit';
          optionItem.appendChild(label);

          // Star toggle click element
          const starBtn = document.createElement('span');
          const isStarred = starredPeriodsRef.current.includes(p.text);
          starBtn.className = 'timeframe-star-btn';
          starBtn.style.display = 'inline-flex';
          starBtn.style.alignItems = 'center';
          starBtn.style.justifyContent = 'center';
          starBtn.style.cursor = 'pointer';
          starBtn.style.transition = 'all 0.15s';

          const starFillColor = isStarred ? '#f5c518' : 'none';
          const starStrokeColor = isStarred ? '#f5c518' : (isLight ? '#b2b5be' : '#434651');
          starBtn.style.color = starStrokeColor;
          starBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${starFillColor}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-star">
              <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a.53.53 0 0 0 .4.292l5.165.751a.53.53 0 0 1 .3.905l-3.737 3.642a.53.53 0 0 0-.153.472l.882 5.14a.53.53 0 0 1-.77.56l-4.618-2.428a.53.53 0 0 0-.494 0L7.177 18.73a.53.53 0 0 1-.77-.56l.882-5.14a.53.53 0 0 0-.153-.472L3.398 8.918a.53.53 0 0 1 .3-.905l5.165-.751a.53.53 0 0 0 .4-.292z"/>
            </svg>
          `;

          starBtn.onmouseenter = (e) => {
            e.stopPropagation();
            starBtn.style.color = '#f5c518';
            const svg = starBtn.querySelector('svg');
            if (svg) svg.setAttribute('fill', '#f5c518');
          };
          starBtn.onmouseleave = (e) => {
            e.stopPropagation();
            const curIsLight = typeof document !== 'undefined' && document.body.getAttribute('data-chrome-theme') === 'light';
            const currentStarred = starredPeriodsRef.current.includes(p.text);
            starBtn.style.color = currentStarred ? '#f5c518' : (curIsLight ? '#b2b5be' : '#434651');
            const svg = starBtn.querySelector('svg');
            if (svg) svg.setAttribute('fill', currentStarred ? '#f5c518' : 'none');
          };

          // Click Star icon: toggle star and recreate chart
          starBtn.onclick = (e) => {
            e.stopPropagation();
            const nextStarred = starredPeriodsRef.current.includes(p.text)
              ? starredPeriodsRef.current.filter(x => x !== p.text)
              : [...starredPeriodsRef.current, p.text];
            logDiagnostic('star button clicked. Toggling star status for:', p.text, 'nextStarred list:', nextStarred);
            // Keep at least one starred timeframe to avoid empty toolbar crash
            if (nextStarred.length > 0) {
              setStarredPeriods(nextStarred);
              localStorage.setItem('chart_starred_periods', JSON.stringify(nextStarred));
              window.dispatchEvent(new CustomEvent('starred-periods-change', { detail: nextStarred }));
              dropdownMenu.classList.remove('show-menu');
              const curIsLight = typeof document !== 'undefined' && document.body.getAttribute('data-chrome-theme') === 'light';
              dropdownContainer.style.color = curIsLight ? '#131722' : '#d1d4dc';
              dropdownContainer.style.backgroundColor = 'transparent';
              arrowBtn.classList.remove('active-arrow');
            }
          };

          optionItem.appendChild(starBtn);

          optionItem.onmouseenter = () => {
            const curIsLight = typeof document !== 'undefined' && document.body.getAttribute('data-chrome-theme') === 'light';
            optionItem.style.backgroundColor = curIsLight ? '#f0f3fa' : '#2a2e39';
            optionItem.style.color = curIsLight ? '#000000' : '#ffffff';
            if (!starredPeriodsRef.current.includes(p.text)) {
              starBtn.style.color = curIsLight ? '#787b86' : '#868993';
            }
          };
          optionItem.onmouseleave = () => {
            const curIsLight = typeof document !== 'undefined' && document.body.getAttribute('data-chrome-theme') === 'light';
            const isSel = p.text === currentPeriodText;
            optionItem.style.backgroundColor = isSel ? (curIsLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(41, 98, 255, 0.15)') : 'transparent';
            optionItem.style.color = isSel ? (curIsLight ? '#000000' : '#2962ff') : (curIsLight ? '#131722' : '#d1d4dc');
            optionItem.style.fontWeight = isSel ? '700' : 'normal';
            if (!starredPeriodsRef.current.includes(p.text)) {
              starBtn.style.color = curIsLight ? '#b2b5be' : '#434651';
            }
          };

          optionItem.onclick = () => {
            const selectedPeriod = { ...p } as Period;
            logDiagnostic('dropdown option clicked. Selecting period:', selectedPeriod.text, selectedPeriod);
            changePeriod(selectedPeriod);
            dropdownMenu.classList.remove('show-menu');
            const curIsLight = typeof document !== 'undefined' && document.body.getAttribute('data-chrome-theme') === 'light';
            dropdownContainer.style.color = curIsLight ? '#131722' : '#d1d4dc';
            dropdownContainer.style.backgroundColor = 'transparent';
            arrowBtn.classList.remove('active-arrow');
          };

          dropdownMenu.appendChild(optionItem);
        });
      };

      rebuildTimeframeMenu();

      // Append menu inside the dropdownParent container (layout-container) to prevent clipping and stack order issues
      dropdownParent.appendChild(dropdownMenu);

      // Make sure the main container is positioned relatively to define absolute positioning boundary
      container.style.position = 'relative';

      const toggleTimeframeMenu = (e: MouseEvent) => {
        e.stopPropagation();
        const isOpen = dropdownMenu.classList.contains('show-menu');
        if (isOpen) {
          dropdownMenu.classList.remove('show-menu');
          dropdownContainer.style.color = '#d1d4dc';
          dropdownContainer.style.backgroundColor = 'transparent';
          arrowBtn.classList.remove('active-arrow');
        } else {
          rebuildTimeframeMenu();
          const rect = dropdownContainer.getBoundingClientRect();
          const parentRect = dropdownParent.getBoundingClientRect();
          const menuHeight = 350;
          const spaceBelow = window.innerHeight - rect.bottom;
          const spaceAbove = rect.top;
          if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
            dropdownMenu.style.top = `${rect.top - parentRect.top - menuHeight - 4}px`;
          } else {
            dropdownMenu.style.top = `${rect.bottom - parentRect.top}px`;
          }
          const menuWidth = 150;
          let leftPos = rect.left - parentRect.left;
          if (leftPos + menuWidth > window.innerWidth - 10) {
            leftPos = Math.max(10, window.innerWidth - menuWidth - 10);
          }
          dropdownMenu.style.left = `${leftPos}px`;
          dropdownMenu.classList.add('show-menu');
          dropdownContainer.style.color = '#ffffff';
          dropdownContainer.style.backgroundColor = 'rgba(41, 98, 255, 0.25)';
          arrowBtn.classList.add('active-arrow');
        }
      };
      arrowBtn.onclick = toggleTimeframeMenu;

      // Close dropdown when clicking outside
      const closeDropdown = () => {
        dropdownMenu.classList.remove('show-menu');
        dropdownContainer.style.color = '#d1d4dc';
        dropdownContainer.style.backgroundColor = 'transparent';
        arrowBtn.classList.remove('active-arrow');
      };
      document.addEventListener('click', closeDropdown);
      // Append after the last period option button
      const periodButtons = corePeriodBar.querySelectorAll('.period');
      if (periodButtons.length > 0) {
        const lastBtn = periodButtons[periodButtons.length - 1];
        lastBtn.parentNode?.insertBefore(dropdownContainer, lastBtn.nextSibling);
      } else {
        // Fallback: append inside the bar
        corePeriodBar.appendChild(dropdownContainer);
      }

      // ────────────────────────────────────────────────────────────
      // Inject Chart Type Selector Button in period bar
      // ────────────────────────────────────────────────────────────
      const chartTypes = [
        { key: 'candle_solid', label: 'Candles', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="8" y1="2" x2="8" y2="6"/><rect x="5" y="6" width="6" height="10" rx="1" fill="currentColor" stroke="none"/><line x1="8" y1="16" x2="8" y2="22"/><line x1="17" y1="2" x2="17" y2="8"/><rect x="14" y="8" width="6" height="8" rx="1" fill="currentColor" stroke="none"/><line x1="17" y1="16" x2="17" y2="22"/></svg>` },
        { key: 'candle_stroke', label: 'Hollow Candles', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="8" y1="2" x2="8" y2="6"/><rect x="5" y="6" width="6" height="10" rx="1"/><line x1="8" y1="16" x2="8" y2="22"/><line x1="17" y1="2" x2="17" y2="8"/><rect x="14" y="8" width="6" height="8" rx="1"/><line x1="17" y1="16" x2="17" y2="22"/></svg>` },
        { key: 'heikin_ashi', label: 'Heikin Ashi', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="7" y1="2" x2="7" y2="6"/><rect x="4" y="6" width="6" height="10" rx="1" fill="currentColor" stroke="none"/><line x1="7" y1="16" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="7"/><rect x="14" y="7" width="6" height="10" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="17" y1="17" x2="17" y2="22"/></svg>` },
        { key: 'ohlc', label: 'OHLC Bars', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="2" x2="8" y2="22"/><line x1="4" y1="7" x2="8" y2="7"/><line x1="8" y1="17" x2="12" y2="17"/><line x1="18" y1="4" x2="18" y2="20"/><line x1="14" y1="9" x2="18" y2="9"/><line x1="18" y1="15" x2="22" y2="15"/></svg>` },
        { key: 'line', label: 'Line', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/></svg>` },
        { key: 'area', label: 'Area', icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity="0.4"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.05"/></linearGradient></defs><path d="M2 20 L6 14 L10 16 L15 8 L22 12 L22 20 Z" fill="url(#areaGrad)"/><polyline points="2,20 6,14 10,16 15,8 22,12" stroke="currentColor" fill="none"/></svg>` }
      ];

      const chartTypeContainer = document.createElement('div');
      chartTypeContainer.className = 'custom-charttype-dropdown-container';
      chartTypeContainer.style.position = 'relative';
      chartTypeContainer.style.display = 'inline-flex';
      chartTypeContainer.style.alignItems = 'center';
      chartTypeContainer.style.marginLeft = '6px';
      chartTypeContainer.style.borderRadius = '4px';
      chartTypeContainer.style.transition = 'all 0.15s';
      chartTypeContainer.style.color = '#d1d4dc';
      chartTypeContainer.style.backgroundColor = 'transparent';

      // Divider line
      const chartTypeDivider = document.createElement('div');
      chartTypeDivider.style.width = '1px';
      chartTypeDivider.style.height = '14px';
      chartTypeDivider.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
      chartTypeDivider.style.marginRight = '8px';
      chartTypeContainer.appendChild(chartTypeDivider);

      // Helper to check if item matches active chart type
      const isChartTypeMatch = (key: string, current: string) => {
        if (key === 'candle_stroke') {
          return ['candle_stroke', 'candle_up_stroke', 'candle_down_stroke'].includes(current);
        }
        return key === current;
      };

      // Find the current chart type for the button icon
      const currentType = chartTypes.find(t => isChartTypeMatch(t.key, chartTypeRef.current)) || chartTypes[0];

      const chartTypeMainBtn = document.createElement('button');
      chartTypeMainBtn.className = 'custom-charttype-main-btn';
      chartTypeMainBtn.style.background = 'transparent';
      chartTypeMainBtn.style.border = 'none';
      chartTypeMainBtn.style.color = 'inherit';
      chartTypeMainBtn.style.cursor = 'pointer';
      chartTypeMainBtn.style.fontSize = '13px';
      chartTypeMainBtn.style.fontWeight = '500';
      chartTypeMainBtn.style.display = 'flex';
      chartTypeMainBtn.style.alignItems = 'center';
      chartTypeMainBtn.style.gap = '6px';
      chartTypeMainBtn.style.padding = '4px 8px';
      chartTypeMainBtn.style.height = '32px';
      chartTypeMainBtn.style.borderTopLeftRadius = '6px';
      chartTypeMainBtn.style.borderBottomLeftRadius = '6px';
      chartTypeMainBtn.style.borderTopRightRadius = '0';
      chartTypeMainBtn.style.borderBottomRightRadius = '0';
      chartTypeMainBtn.style.transition = 'all 0.15s';
      chartTypeMainBtn.title = 'Chart Type';
      chartTypeMainBtn.innerHTML = `
        <span class="charttype-btn-icon" style="display: inline-flex; align-items: center; justify-content: center; color: currentColor;">${currentType.icon}</span>
      `;

      const chartTypeArrowBtn = document.createElement('button');
      chartTypeArrowBtn.className = 'custom-charttype-arrow-btn';
      chartTypeArrowBtn.style.background = 'transparent';
      chartTypeArrowBtn.style.border = 'none';
      chartTypeArrowBtn.style.color = 'inherit';
      chartTypeArrowBtn.style.cursor = 'pointer';
      chartTypeArrowBtn.style.display = 'inline-flex';
      chartTypeArrowBtn.style.alignItems = 'center';
      chartTypeArrowBtn.style.justifyContent = 'center';
      chartTypeArrowBtn.style.padding = '4px';
      chartTypeArrowBtn.style.width = '26px';
      chartTypeArrowBtn.style.height = '32px';
      chartTypeArrowBtn.style.borderTopRightRadius = '6px';
      chartTypeArrowBtn.style.borderBottomRightRadius = '6px';
      chartTypeArrowBtn.style.borderTopLeftRadius = '0';
      chartTypeArrowBtn.style.borderBottomLeftRadius = '0';
      chartTypeArrowBtn.style.transition = 'all 0.15s';
      chartTypeArrowBtn.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="6 9 12 15 18 9"/></svg>`;

      chartTypeContainer.appendChild(chartTypeMainBtn);
      chartTypeContainer.appendChild(chartTypeArrowBtn);

      chartTypeContainer.onmouseenter = () => {
        const isOpen = chartTypeMenu.classList.contains('show-menu');
        if (!isOpen) {
          chartTypeContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
          chartTypeContainer.style.color = '#ffffff';
        }
      };
      chartTypeContainer.onmouseleave = () => {
        const isOpen = chartTypeMenu.classList.contains('show-menu');
        chartTypeContainer.style.backgroundColor = isOpen ? 'rgba(41, 98, 255, 0.15)' : 'transparent';
        chartTypeContainer.style.color = isOpen ? '#2962ff' : '#d1d4dc';
      };

      // Chart type dropdown menu
      const chartTypeMenu = document.createElement('div');
      chartTypeMenu.className = 'custom-charttype-dropdown-menu';
      chartTypeMenu.style.position = 'absolute';
      chartTypeMenu.style.backgroundColor = '#1e222d';
      chartTypeMenu.style.border = '1px solid #2a2e39';
      chartTypeMenu.style.borderRadius = '6px';
      chartTypeMenu.style.padding = '6px';
      chartTypeMenu.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.7)';
      chartTypeMenu.style.display = 'none';
      chartTypeMenu.style.zIndex = '999999';
      chartTypeMenu.style.minWidth = '160px';

      const applyChartTypeToCore = (cType: string) => {
        chartTypeRef.current = cType;
        const coreChart = getCoreChart();
        if (!coreChart) return;

        // Apply raw data or Heikin Ashi transformed data
        const rawData = (lastRawDataRef.current && lastRawDataRef.current.length > 0)
          ? lastRawDataRef.current
          : (datafeedRef.current?.lastRawData && datafeedRef.current.lastRawData.length > 0)
            ? datafeedRef.current.lastRawData
            : (coreChart ? ((coreChart as any).__last_raw_data__ || []) : []);
        
        if (rawData.length > 0) {
          lastRawDataRef.current = rawData;
          if (typeof coreChart.applyNewData === 'function') {
            if (cType === 'heikin_ashi') {
              coreChart.applyNewData(transformToHeikinAshi(rawData), true);
            } else {
              coreChart.applyNewData(rawData, true);
            }
          }
        }

        const isLineType = cType === 'line';
        const isAreaType = cType === 'area';
        const mappedCandleType = (isLineType || isAreaType) ? 'area' : (['candle_solid', 'candle_stroke', 'candle_up_stroke', 'candle_down_stroke', 'ohlc'].includes(cType) ? cType : 'candle_solid');

        const globalStyles = (typeof window !== 'undefined' ? (window as any).__chart_styles__ : null) || {};

        if (typeof coreChart.setStyles === 'function') {
          coreChart.setStyles({
            candle: {
              type: mappedCandleType as any,
              bar: {
                upColor: globalStyles.candleUpColor || '#089981',
                downColor: globalStyles.candleDownColor || '#f23645',
                upBorderColor: globalStyles.candleUpBorderColor || globalStyles.candleUpColor || '#089981',
                downBorderColor: globalStyles.candleDownBorderColor || globalStyles.candleDownColor || '#f23645',
                upWickColor: globalStyles.candleUpWickColor || globalStyles.candleUpColor || '#089981',
                downWickColor: globalStyles.candleDownWickColor || globalStyles.candleDownColor || '#f23645',
              },
              priceMark: {
                last: {
                  upColor: '#089981',
                  downColor: '#f23645',
                  noChangeColor: '#868993',
                }
              },
              area: {
                lineSize: 2,
                lineColor: globalStyles.areaLineColor || '#2979ff',
                value: 'close',
                smooth: true,
                backgroundColor: isLineType
                  ? 'transparent'
                  : [
                    { offset: 0, color: applyColorOpacity(globalStyles.areaFillColor || '#2979ff', 0.25) },
                    { offset: 1, color: applyColorOpacity(globalStyles.areaFillColor || '#2979ff', 0.02) }
                  ] as any,
              }
            }
          });
        }
      };

      // Helper to rebuild menu items with updated selection state
      const rebuildChartTypeMenu = () => {
        chartTypeMenu.innerHTML = '';
        chartTypes.forEach((ct) => {
          const optItem = document.createElement('div');
          const isSel = isChartTypeMatch(ct.key, chartTypeRef.current);
          optItem.style.display = 'flex';
          optItem.style.alignItems = 'center';
          optItem.style.gap = '10px';
          optItem.style.padding = '8px 12px';
          optItem.style.cursor = 'pointer';
          optItem.style.fontSize = '13px';
          optItem.style.color = isSel ? '#2962ff' : '#d1d4dc';
          optItem.style.borderRadius = '4px';
          optItem.style.margin = '2px 0';
          optItem.style.transition = 'background-color 0.15s, color 0.15s';
          optItem.style.backgroundColor = isSel ? 'rgba(41, 98, 255, 0.15)' : 'transparent';

          const ico = document.createElement('span');
          ico.style.display = 'inline-flex';
          ico.style.alignItems = 'center';
          ico.style.justifyContent = 'center';
          ico.style.width = '18px';
          ico.style.height = '18px';
          ico.style.color = isSel ? '#2962ff' : '#868993';
          ico.innerHTML = ct.icon;
          optItem.appendChild(ico);

          const lbl = document.createElement('span');
          lbl.innerText = ct.label;
          lbl.style.flexGrow = '1';
          optItem.appendChild(lbl);

          if (isSel) {
            const chk = document.createElement('span');
            chk.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2962ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            chk.style.display = 'inline-flex';
            chk.style.alignItems = 'center';
            optItem.appendChild(chk);
          }

          optItem.onmouseenter = () => {
            optItem.style.backgroundColor = '#2a2e39';
            optItem.style.color = '#ffffff';
            ico.style.color = '#ffffff';
          };
          optItem.onmouseleave = () => {
            const curSel = isChartTypeMatch(ct.key, chartTypeRef.current);
            optItem.style.backgroundColor = curSel ? 'rgba(41, 98, 255, 0.15)' : 'transparent';
            optItem.style.color = curSel ? '#2962ff' : '#d1d4dc';
            ico.style.color = curSel ? '#2962ff' : '#868993';
          };

          optItem.onclick = (ev) => {
            ev.stopPropagation();
            let targetKey = ct.key;
            if (ct.key === 'candle_stroke') {
              const savedHollow = localStorage.getItem('hollow_candle_type');
              targetKey = (savedHollow && ['candle_stroke', 'candle_up_stroke', 'candle_down_stroke'].includes(savedHollow))
                ? savedHollow
                : 'candle_stroke';
            }
            chartTypeRef.current = targetKey;
            setChartType(targetKey);
            localStorage.setItem('chart_type', targetKey);

            applyChartTypeToCore(targetKey);

            const btnIco = chartTypeContainer.querySelector('.charttype-btn-icon');
            if (btnIco) { btnIco.innerHTML = ct.icon; }
            chartTypeMenu.classList.remove('show-menu');
            chartTypeArrowBtn.classList.remove('active-arrow');
            rebuildChartTypeMenu();
            window.dispatchEvent(new CustomEvent('chart-type-changed', { detail: targetKey }));
          };

          chartTypeMenu.appendChild(optItem);
        });
      };

      rebuildChartTypeMenu();

      // Append chart type menu inside dropdownParent
      dropdownParent.appendChild(chartTypeMenu);

      const toggleChartTypeMenu = (e: MouseEvent) => {
        e.stopPropagation();
        const isOpen = chartTypeMenu.classList.contains('show-menu');
        if (isOpen) {
          chartTypeMenu.classList.remove('show-menu');
          chartTypeContainer.style.color = '#d1d4dc';
          chartTypeContainer.style.backgroundColor = 'transparent';
          chartTypeArrowBtn.classList.remove('active-arrow');
        } else {
          rebuildChartTypeMenu();
          const rect = chartTypeContainer.getBoundingClientRect();
          const parentRect = dropdownParent.getBoundingClientRect();
          const menuHeight = 220;
          const spaceBelow = window.innerHeight - rect.bottom;
          const spaceAbove = rect.top;
          if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
            chartTypeMenu.style.top = `${rect.top - parentRect.top - menuHeight - 4}px`;
          } else {
            chartTypeMenu.style.top = `${rect.bottom - parentRect.top}px`;
          }
          const menuWidth = 160;
          let leftPos = rect.left - parentRect.left;
          if (leftPos + menuWidth > window.innerWidth - 10) {
            leftPos = Math.max(10, window.innerWidth - menuWidth - 10);
          }
          chartTypeMenu.style.left = `${leftPos}px`;
          chartTypeMenu.classList.add('show-menu');
          chartTypeContainer.style.color = '#2962ff';
          chartTypeContainer.style.backgroundColor = 'rgba(41, 98, 255, 0.15)';
          chartTypeArrowBtn.classList.add('active-arrow');
        }
      };
      chartTypeMainBtn.onclick = toggleChartTypeMenu;
      chartTypeArrowBtn.onclick = toggleChartTypeMenu;

      const closeChartTypeMenu = () => {
        chartTypeMenu.classList.remove('show-menu');
        chartTypeContainer.style.color = '#d1d4dc';
        chartTypeContainer.style.backgroundColor = 'transparent';
        chartTypeArrowBtn.classList.remove('active-arrow');
      };
      document.addEventListener('click', closeChartTypeMenu);

      const handleExternalChartTypeChange = (e: any) => {
        const newType = e?.detail || localStorage.getItem('chart_type') || 'candle_solid';
        chartTypeRef.current = newType;
        setChartType(newType);
        applyChartTypeToCore(newType);
        const matchingType = chartTypes.find(t => isChartTypeMatch(t.key, newType)) || chartTypes[0];
        const btnIcon = chartTypeContainer.querySelector('.charttype-btn-icon');
        if (btnIcon) {
          btnIcon.innerHTML = matchingType.icon;
        }
        rebuildChartTypeMenu();
      };
      window.addEventListener('chart-type-changed', handleExternalChartTypeChange);

      // Insert after the timeframes dropdown container
      if (dropdownContainer.parentNode) {
        dropdownContainer.parentNode.insertBefore(chartTypeContainer, dropdownContainer.nextSibling);
      } else {
        corePeriodBar.appendChild(chartTypeContainer);
      }

      // Immediately apply initial chart type styles and overlays
      setTimeout(() => {
        applyChartTypeToCore(chartTypeRef.current);
      }, 200);

      // ────────────────────────────────────────────────────────────
      // Inject Custom Indicators Search and Favorites Sub-panels
      // ────────────────────────────────────────────────────────────
      const allToolsBtns = Array.from(corePeriodBar.querySelectorAll('.tools')) as HTMLElement[];
      allToolsBtns.forEach((btn: any) => {
        btn.style.setProperty('display', 'none', 'important');
      });

      // Inject top panel Settings gear button if not already created
      if (!corePeriodBar.querySelector('.custom-top-settings-btn')) {
        const topSettingsBtn = document.createElement('button');
        topSettingsBtn.className = 'item custom-top-settings-btn';
        topSettingsBtn.style.background = 'transparent';
        topSettingsBtn.style.border = 'none';
        topSettingsBtn.style.color = '#d1d4dc';
        topSettingsBtn.style.cursor = 'pointer';
        topSettingsBtn.style.display = 'inline-flex';
        topSettingsBtn.style.alignItems = 'center';
        topSettingsBtn.style.justifyContent = 'center';
        topSettingsBtn.style.padding = '4px';
        topSettingsBtn.style.width = '34px';
        topSettingsBtn.style.height = '34px';
        topSettingsBtn.style.borderRadius = '6px';
        topSettingsBtn.style.transition = 'all 0.15s';
        topSettingsBtn.title = 'Chart Settings';
        topSettingsBtn.innerHTML = `
          <svg width="21" height="21" viewBox="0 0 33.136 28.412" style="pointer-events: none;">
            <g id="Setting">
              <path fill-rule="evenodd" clip-rule="evenodd" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-miterlimit="10" d="M22.77,14.206c0,3.426-2.777,6.203-6.203,6.203s-6.203-2.777-6.203-6.203s2.777-6.203,6.203-6.203S22.77,10.78,22.77,14.206z M21.22,14.206c0,2.569-2.083,4.652-4.652,4.652s-4.652-2.083-4.652-4.652s2.083-4.652,4.652-4.652S21.22,11.637,21.22,14.206z"/>
              <path fill-rule="evenodd" clip-rule="evenodd" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-miterlimit="10" d="M8.039,0.25h17.057l7.753,13.956l-7.753,13.956H8.039L0.286,14.206L8.039,0.25z M2.054,14.206L8.97,1.801h15.227l6.9,12.405 l-6.9,12.405H8.97l-6.9-12.405H2.054z"/>
            </g>
          </svg>
        `;
        topSettingsBtn.onclick = (e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('open-custom-settings'));
        };
        topSettingsBtn.onmouseenter = () => {
          topSettingsBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          topSettingsBtn.style.color = '#ffffff';
        };
        topSettingsBtn.onmouseleave = () => {
          topSettingsBtn.style.backgroundColor = 'transparent';
          topSettingsBtn.style.color = '#d1d4dc';
        };
        corePeriodBar.appendChild(topSettingsBtn);
      }

      // Inject custom Screenshot button if not already created
      if (!corePeriodBar.querySelector('.custom-screenshot-btn')) {
        const screenshotBtn = document.createElement('button');
        screenshotBtn.className = 'item custom-screenshot-btn';
        screenshotBtn.style.background = 'transparent';
        screenshotBtn.style.border = 'none';
        screenshotBtn.style.color = '#d1d4dc';
        screenshotBtn.style.cursor = 'pointer';
        screenshotBtn.style.display = 'inline-flex';
        screenshotBtn.style.alignItems = 'center';
        screenshotBtn.style.justifyContent = 'center';
        screenshotBtn.style.padding = '4px';
        screenshotBtn.style.width = '34px';
        screenshotBtn.style.height = '34px';
        screenshotBtn.style.borderRadius = '6px';
        screenshotBtn.style.transition = 'all 0.15s';
        screenshotBtn.title = 'Take Screenshot';
        screenshotBtn.innerHTML = `
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
        `;
        screenshotBtn.onclick = (e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('trigger-custom-screenshot'));
        };
        screenshotBtn.onmouseenter = () => {
          screenshotBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          screenshotBtn.style.color = '#ffffff';
        };
        screenshotBtn.onmouseleave = () => {
          screenshotBtn.style.backgroundColor = 'transparent';
          screenshotBtn.style.color = '#d1d4dc';
        };
        corePeriodBar.appendChild(screenshotBtn);
      }



      // Inject custom Fullscreen button if not already created
      if (!corePeriodBar.querySelector('.custom-fullscreen-btn')) {
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'item custom-fullscreen-btn';
        fullscreenBtn.style.background = 'transparent';
        fullscreenBtn.style.border = 'none';
        fullscreenBtn.style.color = '#d1d4dc';
        fullscreenBtn.style.cursor = 'pointer';
        fullscreenBtn.style.display = 'inline-flex';
        fullscreenBtn.style.alignItems = 'center';
        fullscreenBtn.style.justifyContent = 'center';
        fullscreenBtn.style.padding = '4px';
        fullscreenBtn.style.width = '34px';
        fullscreenBtn.style.height = '34px';
        fullscreenBtn.style.borderRadius = '6px';
        fullscreenBtn.style.transition = 'all 0.15s';
        fullscreenBtn.title = 'Toggle Fullscreen';

        const updateFSBtnIcon = () => {
          const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
          fullscreenBtn.innerHTML = isFS ? `
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
              <path d="M4 14h6v6m10-10h-6V4m0 16v-6h6M3 10h6V4"/>
            </svg>
          ` : `
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          `;
        };
        updateFSBtnIcon();

        fullscreenBtn.onclick = (e) => {
          e.stopPropagation();
          if (allToolsBtns[4]) {
            (allToolsBtns[4] as HTMLElement).click();
          } else {
            if (document.fullscreenElement) {
              document.exitFullscreen();
            } else {
              containerRef.current?.requestFullscreen();
            }
          }
          setTimeout(updateFSBtnIcon, 100);
        };
        fullscreenBtn.onmouseenter = () => {
          fullscreenBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          fullscreenBtn.style.color = '#ffffff';
        };
        fullscreenBtn.onmouseleave = () => {
          fullscreenBtn.style.backgroundColor = 'transparent';
          fullscreenBtn.style.color = '#d1d4dc';
        };

        document.addEventListener('fullscreenchange', updateFSBtnIcon);
        document.addEventListener('webkitfullscreenchange', updateFSBtnIcon);

        corePeriodBar.appendChild(fullscreenBtn);
      }

      // Inject Theme Selector (Light, Dark, System default) on Top Panel
      if (!corePeriodBar.querySelector('.custom-theme-container')) {
        const themeContainer = document.createElement('div');
        themeContainer.className = 'custom-theme-container';
        themeContainer.style.position = 'relative';
        themeContainer.style.display = 'inline-flex';
        themeContainer.style.alignItems = 'center';
        themeContainer.style.marginLeft = '0px';
        themeContainer.style.marginRight = '0px';
        themeContainer.style.padding = '0px';

        const themeBtn = document.createElement('button');
        themeBtn.className = 'item custom-theme-btn';
        themeBtn.style.background = 'transparent';
        themeBtn.style.border = 'none';
        themeBtn.style.color = '#d1d4dc';
        themeBtn.style.cursor = 'pointer';
        themeBtn.style.display = 'inline-flex';
        themeBtn.style.alignItems = 'center';
        themeBtn.style.justifyContent = 'center';
        themeBtn.style.padding = '4px';
        themeBtn.style.width = '34px';
        themeBtn.style.height = '34px';
        themeBtn.style.borderRadius = '6px';
        themeBtn.style.transition = 'all 0.15s';
        themeBtn.title = 'Color Theme (Top & Side Toolbars)';

        const getThemeIconSvg = (mode: ChromeThemeMode) => {
          if (mode === 'light') {
            return `
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            `;
          } else if (mode === 'dark') {
            return `
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            `;
          } else {
            return `
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            `;
          }
        };

        const updateThemeBtnIcon = () => {
          const currentMode = getSavedChromeThemeMode();
          themeBtn.innerHTML = getThemeIconSvg(currentMode);
          themeBtn.title = `Theme: ${currentMode === 'system' ? 'System default' : currentMode.charAt(0).toUpperCase() + currentMode.slice(1)} (Toolbars Only)`;
        };
        updateThemeBtnIcon();

        // Create theme dropdown popover menu
        const themeMenu = document.createElement('div');
        themeMenu.className = 'custom-theme-dropdown-menu';
        themeMenu.style.position = 'absolute';
        themeMenu.style.backgroundColor = '#1e222d';
        themeMenu.style.border = '1px solid #2a2e39';
        themeMenu.style.borderRadius = '6px';
        themeMenu.style.padding = '6px';
        themeMenu.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.7)';
        themeMenu.style.display = 'none';
        themeMenu.style.zIndex = '999999';
        themeMenu.style.minWidth = '160px';

        const THEME_OPTIONS: Array<{ key: ChromeThemeMode; label: string; icon: string }> = [
          {
            key: 'light',
            label: 'Light',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
          },
          {
            key: 'dark',
            label: 'Dark',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`
          },
          {
            key: 'system',
            label: 'System default',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`
          }
        ];

        const rebuildThemeMenu = () => {
          themeMenu.innerHTML = '';
          const currentMode = getSavedChromeThemeMode();

          THEME_OPTIONS.forEach((opt) => {
            const optItem = document.createElement('div');
            const isSel = opt.key === currentMode;
            optItem.style.display = 'flex';
            optItem.style.alignItems = 'center';
            optItem.style.gap = '10px';
            optItem.style.padding = '8px 12px';
            optItem.style.cursor = 'pointer';
            optItem.style.fontSize = '13px';
            optItem.style.color = isSel ? '#2962ff' : '#d1d4dc';
            optItem.style.borderRadius = '4px';
            optItem.style.margin = '2px 0';
            optItem.style.transition = 'background-color 0.15s, color 0.15s';
            optItem.style.backgroundColor = isSel ? 'rgba(41, 98, 255, 0.15)' : 'transparent';

            const ico = document.createElement('span');
            ico.style.display = 'inline-flex';
            ico.style.alignItems = 'center';
            ico.style.justifyContent = 'center';
            ico.style.width = '18px';
            ico.style.height = '18px';
            ico.style.color = isSel ? '#2962ff' : '#868993';
            ico.innerHTML = opt.icon;
            optItem.appendChild(ico);

            const lbl = document.createElement('span');
            lbl.innerText = opt.label;
            lbl.style.flexGrow = '1';
            optItem.appendChild(lbl);

            if (isSel) {
              const chk = document.createElement('span');
              chk.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2962ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
              chk.style.display = 'inline-flex';
              chk.style.alignItems = 'center';
              optItem.appendChild(chk);
            }

            optItem.onmouseenter = () => {
              optItem.style.backgroundColor = '#2a2e39';
              optItem.style.color = '#ffffff';
              ico.style.color = '#ffffff';
            };
            optItem.onmouseleave = () => {
              const curSel = opt.key === getSavedChromeThemeMode();
              optItem.style.backgroundColor = curSel ? 'rgba(41, 98, 255, 0.15)' : 'transparent';
              optItem.style.color = curSel ? '#2962ff' : '#d1d4dc';
              ico.style.color = curSel ? '#2962ff' : '#868993';
            };

            optItem.onclick = (ev) => {
              ev.stopPropagation();
              setChromeThemeMode(opt.key);
              updateThemeBtnIcon();
              rebuildThemeMenu();
              themeMenu.classList.remove('show-menu');
              themeMenu.style.display = 'none';
            };

            themeMenu.appendChild(optItem);
          });
        };

        rebuildThemeMenu();
        dropdownParent.appendChild(themeMenu);

        const toggleThemeMenu = (e: MouseEvent) => {
          e.stopPropagation();
          const isOpen = themeMenu.classList.contains('show-menu');
          if (isOpen) {
            themeMenu.classList.remove('show-menu');
            themeMenu.style.display = 'none';
          } else {
            rebuildThemeMenu();
            const rect = themeBtn.getBoundingClientRect();
            const parentRect = dropdownParent.getBoundingClientRect();
            const menuHeight = 140;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
              themeMenu.style.top = `${rect.top - parentRect.top - menuHeight - 4}px`;
            } else {
              themeMenu.style.top = `${rect.bottom - parentRect.top + 4}px`;
            }
            const menuWidth = 160;
            let leftPos = Math.max(10, rect.right - parentRect.left - menuWidth);
            if (leftPos + menuWidth > window.innerWidth - 10) {
              leftPos = Math.max(10, window.innerWidth - menuWidth - 10);
            }
            themeMenu.style.left = `${leftPos}px`;
            themeMenu.style.display = 'block';
            themeMenu.classList.add('show-menu');
          }
        };

        themeBtn.onclick = toggleThemeMenu;
        themeBtn.onmouseenter = () => {
          const isLight = document.documentElement.getAttribute('data-chrome-theme') === 'light';
          themeBtn.style.backgroundColor = isLight ? '#f0f3fa' : 'rgba(255, 255, 255, 0.08)';
          themeBtn.style.color = isLight ? '#131722' : '#ffffff';
        };
        themeBtn.onmouseleave = () => {
          const isLight = document.documentElement.getAttribute('data-chrome-theme') === 'light';
          themeBtn.style.backgroundColor = 'transparent';
          themeBtn.style.color = isLight ? '#131722' : '#d1d4dc';
        };

        const closeThemeMenu = () => {
          themeMenu.classList.remove('show-menu');
          themeMenu.style.display = 'none';
        };
        document.addEventListener('click', closeThemeMenu);

        window.addEventListener('chrome-theme-changed', () => {
          updateThemeBtnIcon();
          rebuildThemeMenu();

          const dropdownMenus = document.querySelectorAll('.custom-layout-dropdown-menu');
          dropdownMenus.forEach(dropdownMenu => {
            const currentLay = dropdownMenu.getAttribute('data-current-layout') || '1';
            const isLight = document.documentElement.getAttribute('data-chrome-theme') === 'light';
            const defaultLineColor = isLight ? '#50535e' : '#434651';
            const defaultCellBorder = isLight ? '#50535e' : '#868993';

            const optionItems = dropdownMenu.querySelectorAll('[data-layout-key]');
            optionItems.forEach(item => {
              const optionItem = item as HTMLElement;
              const layKey = optionItem.getAttribute('data-layout-key');
              const isSelected = currentLay === layKey;
              optionItem.classList.toggle('selected', isSelected);
              optionItem.style.borderColor = isSelected ? '#2962ff' : defaultLineColor;
              optionItem.style.backgroundColor = isSelected ? (isLight ? 'rgba(41, 98, 255, 0.12)' : 'rgba(41, 98, 255, 0.15)') : 'transparent';

              const cells = optionItem.querySelectorAll('.layout-cell');
              cells.forEach(cell => {
                const cellElement = cell as HTMLElement;
                cellElement.style.borderColor = isSelected ? '#2962ff' : defaultCellBorder;
                cellElement.style.backgroundColor = isSelected ? '#2962ff' : 'transparent';
              });
            });
          });
        });

        themeContainer.appendChild(themeBtn);
        corePeriodBar.appendChild(themeContainer);
      }

      const defaultIndicatorsBtn = (allToolsBtns[0] || corePeriodBar.querySelector('.tools')) as HTMLElement;
      if (defaultIndicatorsBtn) {

        const AVAILABLE_INDICATORS = [
          // Main Pane Indicators
          { name: 'MA', label: 'Moving Average (MA)', type: 'main' },
          { name: 'EMA', label: 'Exponential Moving Average (EMA)', type: 'main' },
          { name: 'SMA', label: 'Simple Moving Average (SMA)', type: 'main' },
          { name: 'BOLL', label: 'Bollinger Bands (BOLL)', type: 'main' },
          { name: 'SAR', label: 'Parabolic SAR', type: 'main' },
          { name: 'BBI', label: 'Bull and Bear Index (BBI)', type: 'main' },
          { name: 'VOL OVERLAY', label: 'Volume Overlay', type: 'main' },
          { name: 'WMA', label: 'Weighted Moving Average (WMA)', type: 'main' },
          { name: 'DEMA', label: 'Double Exponential Moving Average (DEMA)', type: 'main' },
          { name: 'TEMA', label: 'Triple Exponential Moving Average (TEMA)', type: 'main' },
          { name: 'KAMA', label: 'Kaufman Adaptive Moving Average (KAMA)', type: 'main' },
          { name: 'VWAP', label: 'Volume Weighted Average Price (VWAP)', type: 'main' },

          // Sub Pane Indicators
          { name: 'VOL', label: 'Volume (VOL)', type: 'sub' },
          { name: 'MACD', label: 'MACD', type: 'sub' },
          { name: 'RSI', label: 'Relative Strength Index (RSI)', type: 'sub' },
          { name: 'KDJ', label: 'KDJ Index', type: 'sub' },
          { name: 'OBV', label: 'On Balance Volume (OBV)', type: 'sub' },
          { name: 'CCI', label: 'Commodity Channel Index (CCI)', type: 'sub' },
          { name: 'WR', label: 'Williams %R', type: 'sub' },
          { name: 'ROC', label: 'Rate of Change (ROC)', type: 'sub' },
          { name: 'AVP', label: 'Average Price (AVP)', type: 'sub' },
          { name: 'AO', label: 'Awesome Oscillator (AO)', type: 'sub' },
          { name: 'BIAS', label: 'Bias (BIAS)', type: 'sub' },
          { name: 'BRAR', label: 'BRAR', type: 'sub' },
          { name: 'CR', label: 'CR', type: 'sub' },
          { name: 'DMA', label: 'Different of Moving Average (DMA)', type: 'sub' },
          { name: 'DMI', label: 'Directional Movement Index (DMI)', type: 'sub' },
          { name: 'EMV', label: 'Ease of Movement (EMV)', type: 'sub' },
          { name: 'MTM', label: 'Momentum (MTM)', type: 'sub' },
          { name: 'PVT', label: 'Price Volume Trend (PVT)', type: 'sub' },
          { name: 'PSY', label: 'Psychological Line (PSY)', type: 'sub' },
          { name: 'TRIX', label: 'Triple Exponentially Smoothed Average (TRIX)', type: 'sub' },
          { name: 'VR', label: 'Volume Ratio (VR)', type: 'sub' },
          { name: 'ATR', label: 'Average True Range (ATR)', type: 'sub' },
          { name: 'MFI', label: 'Money Flow Index (MFI)', type: 'sub' },
          { name: 'STOCH', label: 'Stochastic Oscillator (STOCH)', type: 'sub' },
          { name: 'STOCHRSI', label: 'Stochastic RSI (StochRSI)', type: 'sub' },
          { name: 'AROON', label: 'Aroon (AROON)', type: 'sub' },
          { name: 'AROONOSC', label: 'Aroon Oscillator (AroonOsc)', type: 'sub' },
          { name: 'CMO', label: 'Chaikin Momentum Oscillator (CMO)', type: 'sub' },
          { name: 'BOP', label: 'Balance of Power (BOP)', type: 'sub' },
          { name: 'AD', label: 'Accumulation/Distribution (A/D)', type: 'sub' },
          { name: 'ADOSC', label: 'Chaikin Oscillator (ADOSC)', type: 'sub' },
          { name: 'NATR', label: 'Normalized ATR (NATR)', type: 'sub' },
          { name: 'STDDEV', label: 'Standard Deviation (StdDev)', type: 'sub' }
        ];

        let starredIndicators: string[] = JSON.parse(localStorage.getItem('chart_starred_indicators') || '["MA", "EMA", "VOL", "RSI"]');

        const toggleIndicator = (name: string) => {
          const coreChart = getCoreChart();
          if (!coreChart) return;

          const indConfig = AVAILABLE_INDICATORS.find(x => x.name === name);
          const isMain = indConfig ? indConfig.type === 'main' : false;

          if (isMain) {
            coreChart.createIndicator({ name: name, paneId: 'candle_pane' }, true);
          } else {
            const paneId = coreChart.createIndicator(name, false);
            if (paneId) {
              try {
                paneHeightsRef.current[paneId] = 160;
                coreChart.setPaneOptions({ id: paneId, height: 160, dragEnabled: true });
                if (typeof coreChart.overrideYAxis === 'function') {
                  const position = styles?.scalesPlacement === 'left' ? 'left' : 'right';
                  coreChart.overrideYAxis({
                    paneId: paneId,
                    position: position
                  });
                }
              } catch (e) { }
            }
          }
        };

        const indContainer = document.createElement('div');
        indContainer.className = 'custom-indicators-container';
        indContainer.style.position = 'relative';
        indContainer.style.display = 'inline-flex';
        indContainer.style.alignItems = 'center';
        indContainer.style.marginLeft = '4px';

        const indMainBtn = document.createElement('button');
        indMainBtn.className = 'item custom-indicators-btn';
        indMainBtn.style.background = 'transparent';
        indMainBtn.style.border = 'none';
        indMainBtn.style.color = '#d1d4dc';
        indMainBtn.style.cursor = 'pointer';
        indMainBtn.style.fontSize = '13px';
        indMainBtn.style.fontWeight = '500';
        indMainBtn.style.display = 'flex';
        indMainBtn.style.alignItems = 'center';
        indMainBtn.style.gap = '6px';
        indMainBtn.style.padding = '4px 8px';
        indMainBtn.style.height = '32px';
        indMainBtn.style.borderTopLeftRadius = '6px';
        indMainBtn.style.borderBottomLeftRadius = '6px';
        indMainBtn.style.borderTopRightRadius = '0';
        indMainBtn.style.borderBottomRightRadius = '0';
        indMainBtn.style.transition = 'all 0.15s';
        indMainBtn.title = 'Indicators';
        indMainBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: currentColor;">
            <path d="M3 3v18h18"></path>
            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
          </svg>
          <span class="label">Indicators</span>
        `;

        const indArrowBtn = document.createElement('button');
        indArrowBtn.className = 'item custom-indicators-arrow-btn';
        indArrowBtn.style.background = 'transparent';
        indArrowBtn.style.border = 'none';
        indArrowBtn.style.color = '#d1d4dc';
        indArrowBtn.style.cursor = 'pointer';
        indArrowBtn.style.display = 'inline-flex';
        indArrowBtn.style.alignItems = 'center';
        indArrowBtn.style.justifyContent = 'center';
        indArrowBtn.style.padding = '4px';
        indArrowBtn.style.width = '26px';
        indArrowBtn.style.height = '32px';
        indArrowBtn.style.borderTopRightRadius = '6px';
        indArrowBtn.style.borderBottomRightRadius = '6px';
        indArrowBtn.style.borderTopLeftRadius = '0';
        indArrowBtn.style.borderBottomLeftRadius = '0';
        indArrowBtn.style.marginLeft = '0';
        indArrowBtn.style.transition = 'all 0.15s';
        indArrowBtn.title = 'Favorite Indicators';
        indArrowBtn.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="6 9 12 15 18 9"/></svg>`;

        indContainer.appendChild(indMainBtn);
        indContainer.appendChild(indArrowBtn);
        defaultIndicatorsBtn.parentNode?.insertBefore(indContainer, defaultIndicatorsBtn.nextSibling);

        // Inject Undo/Redo buttons container
        const historyContainer = document.createElement('div');
        historyContainer.className = 'custom-history-container';
        historyContainer.style.position = 'relative';
        historyContainer.style.display = 'inline-flex';
        historyContainer.style.alignItems = 'center';
        historyContainer.style.marginLeft = '4px';

        // 1. Divider Line between Indicators and Undo/Redo buttons
        const historyDivider = document.createElement('div');
        historyDivider.className = 'custom-topbar-divider';
        historyDivider.style.width = '1px';
        historyDivider.style.height = '18px';
        historyDivider.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
        historyDivider.style.margin = '0 6px';
        historyDivider.style.flexShrink = '0';
        historyContainer.appendChild(historyDivider);

        // 2. Undo Button
        const undoBtn = document.createElement('button');
        undoBtn.className = 'item custom-undo-btn';
        undoBtn.style.background = 'transparent';
        undoBtn.style.border = 'none';
        undoBtn.style.color = '#d1d4dc';
        undoBtn.style.opacity = '0.3'; // Faded by default
        undoBtn.style.cursor = 'default';
        undoBtn.style.display = 'inline-flex';
        undoBtn.style.alignItems = 'center';
        undoBtn.style.justifyContent = 'center';
        undoBtn.style.padding = '4px';
        undoBtn.style.width = '32px';
        undoBtn.style.height = '32px';
        undoBtn.style.borderRadius = '6px';
        undoBtn.style.transition = 'all 0.15s';
        undoBtn.title = 'Undo (Ctrl+Z)';
        undoBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 13.208 10.354" fill="none" stroke="none" style="color: currentColor; pointer-events: none;">
            <path fill="currentColor" d="M1.915,4.354L4.562,7L3.855,7.708L0,3.854L3.853,0l0.708,0.708L1.915,3.354h5.793c3.038,0,5.5,2.462,5.5,5.5v1.5h-1v-1.5c0-2.485-2.015-4.5-4.5-4.5H1.915z"/>
          </svg>
        `;
        undoBtn.onclick = (e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('trigger-undo'));
        };
        historyContainer.appendChild(undoBtn);

        // 3. Redo Button
        const redoBtn = document.createElement('button');
        redoBtn.className = 'item custom-redo-btn';
        redoBtn.style.background = 'transparent';
        redoBtn.style.border = 'none';
        redoBtn.style.color = '#d1d4dc';
        redoBtn.style.opacity = '0.3'; // Faded by default
        redoBtn.style.cursor = 'default';
        redoBtn.style.display = 'inline-flex';
        redoBtn.style.alignItems = 'center';
        redoBtn.style.justifyContent = 'center';
        redoBtn.style.padding = '4px';
        redoBtn.style.width = '32px';
        redoBtn.style.height = '32px';
        redoBtn.style.borderRadius = '6px';
        redoBtn.style.transition = 'all 0.15s';
        redoBtn.title = 'Redo (Ctrl+Y)';
        redoBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 13.207 10.354" fill="none" stroke="none" style="color: currentColor; pointer-events: none;">
            <path fill="currentColor" d="M11.293,4.354L8.646,7l0.707,0.708l3.854-3.854L9.353,0L8.646,0.708l2.647,2.646H5.5c-3.038,0-5.5,2.462-5.5,5.5v1.5h1v-1.5c0-2.485,2.015-4.5,4.5-4.5H11.293z"/>
          </svg>
        `;
        redoBtn.onclick = (e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('trigger-redo'));
        };
        historyContainer.appendChild(redoBtn);

        // Insert historyContainer right after indContainer
        indContainer.parentNode?.insertBefore(historyContainer, indContainer.nextSibling);

        const indicatorsMenu = document.createElement('div');
        indicatorsMenu.className = 'custom-indicators-popover-menu';
        indicatorsMenu.style.position = 'absolute';
        indicatorsMenu.style.backgroundColor = '#1e222d';
        indicatorsMenu.style.border = '1px solid #2a2e39';
        indicatorsMenu.style.borderRadius = '6px';
        indicatorsMenu.style.padding = '8px';
        indicatorsMenu.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.7)';
        indicatorsMenu.classList.remove('show-menu');
        indicatorsMenu.style.zIndex = '999999';
        indicatorsMenu.style.width = '240px';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search indicators...';
        searchInput.style.width = '100%';
        searchInput.style.boxSizing = 'border-box';
        searchInput.style.backgroundColor = '#131722';
        searchInput.style.border = '1px solid #2a2e39';
        searchInput.style.borderRadius = '4px';
        searchInput.style.padding = '6px 10px';
        searchInput.style.color = '#ffffff';
        searchInput.style.fontSize = '13px';
        searchInput.style.outline = 'none';
        searchInput.style.marginBottom = '6px';
        indicatorsMenu.appendChild(searchInput);

        const allListContainer = document.createElement('div');
        allListContainer.style.maxHeight = '240px';
        allListContainer.style.overflowY = 'auto';
        allListContainer.style.display = 'flex';
        allListContainer.style.flexDirection = 'column';
        indicatorsMenu.appendChild(allListContainer);

        dropdownParent.appendChild(indicatorsMenu);

        const favMenu = document.createElement('div');
        favMenu.className = 'custom-fav-indicators-popover-menu';
        favMenu.style.position = 'absolute';
        favMenu.style.backgroundColor = '#1e222d';
        favMenu.style.border = '1px solid #2a2e39';
        favMenu.style.borderRadius = '6px';
        favMenu.style.padding = '8px 6px';
        favMenu.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.7)';
        favMenu.classList.remove('show-menu');
        favMenu.style.zIndex = '999999';
        favMenu.style.minWidth = '160px';

        const favHeader = document.createElement('div');
        favHeader.style.color = '#868993';
        favHeader.style.fontSize = '11px';
        favHeader.style.fontWeight = '700';
        favHeader.style.padding = '4px 12px';
        favHeader.style.textTransform = 'uppercase';
        favHeader.style.letterSpacing = '0.5px';
        favHeader.style.marginBottom = '4px';
        favHeader.innerText = 'Favourite Indicators';
        favMenu.appendChild(favHeader);

        const favListContainer = document.createElement('div');
        favListContainer.style.maxHeight = '240px';
        favListContainer.style.overflowY = 'auto';
        favListContainer.style.display = 'flex';
        favListContainer.style.flexDirection = 'column';
        favMenu.appendChild(favListContainer);

        dropdownParent.appendChild(favMenu);

        const rebuildIndicatorsList = (searchValue = '') => {
          allListContainer.innerHTML = '';
          const searchLower = searchValue.toLowerCase();

          const filtered = AVAILABLE_INDICATORS.filter(ind =>
            ind.label.toLowerCase().includes(searchLower) || ind.name.toLowerCase().includes(searchLower)
          );

          if (filtered.length === 0) {
            const noResult = document.createElement('div');
            noResult.style.padding = '8px 12px';
            noResult.style.color = '#868993';
            noResult.style.fontSize = '13px';
            noResult.innerText = 'No indicators found';
            allListContainer.appendChild(noResult);
            return;
          }

          filtered.forEach((ind) => {
            const optionItem = document.createElement('div');
            optionItem.style.display = 'flex';
            optionItem.style.justifyContent = 'space-between';
            optionItem.style.alignItems = 'center';
            optionItem.style.padding = '8px 12px';
            optionItem.style.cursor = 'pointer';
            optionItem.style.fontSize = '13px';
            optionItem.style.borderRadius = '4px';
            optionItem.style.margin = '2px 0';
            optionItem.style.transition = 'background-color 0.15s, color 0.15s';

            const isAdded = activeIndicatorsRef.current.some(x => x.name === ind.name);
            optionItem.style.color = isAdded ? '#2962ff' : '#d1d4dc';
            optionItem.style.backgroundColor = isAdded ? 'rgba(41, 98, 255, 0.15)' : 'transparent';

            const labelSpan = document.createElement('span');
            labelSpan.innerText = ind.label;
            labelSpan.style.flexGrow = '1';
            optionItem.appendChild(labelSpan);

            const starBtn = document.createElement('span');
            const isStarred = starredIndicators.includes(ind.name);
            starBtn.style.display = 'inline-flex';
            starBtn.style.alignItems = 'center';
            starBtn.style.justifyContent = 'center';
            starBtn.style.cursor = 'pointer';
            starBtn.style.transition = 'all 0.15s';

            const starFillColor = isStarred ? '#f5c518' : 'none';
            const starStrokeColor = isStarred ? '#f5c518' : '#434651';
            starBtn.style.color = starStrokeColor;
            starBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${starFillColor}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-star">
                <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a.53.53 0 0 0 .4.292l5.165.751a.53.53 0 0 1 .3.905l-3.737 3.642a.53.53 0 0 0-.153.472l.882 5.14a.53.53 0 0 1-.77.56l-4.618-2.428a.53.53 0 0 0-.494 0L7.177 18.73a.53.53 0 0 1-.77-.56l.882-5.14a.53.53 0 0 0-.153-.472L3.398 8.918a.53.53 0 0 1 .3-.905l5.165-.751a.53.53 0 0 0 .4-.292z"/>
              </svg>
            `;

            starBtn.onmouseenter = (e) => {
              e.stopPropagation();
              starBtn.style.color = '#f5c518';
              const svg = starBtn.querySelector('svg');
              if (svg) svg.setAttribute('fill', '#f5c518');
            };
            starBtn.onmouseleave = (e) => {
              e.stopPropagation();
              const currentStarred = starredIndicators.includes(ind.name);
              starBtn.style.color = currentStarred ? '#f5c518' : '#434651';
              const svg = starBtn.querySelector('svg');
              if (svg) svg.setAttribute('fill', currentStarred ? '#f5c518' : 'none');
            };

            starBtn.onclick = (e) => {
              e.stopPropagation();
              const idx = starredIndicators.indexOf(ind.name);
              if (idx > -1) {
                starredIndicators.splice(idx, 1);
              } else {
                starredIndicators.push(ind.name);
              }
              localStorage.setItem('chart_starred_indicators', JSON.stringify(starredIndicators));
              rebuildIndicatorsList(searchInput.value);
            };

            optionItem.appendChild(starBtn);

            optionItem.onmouseenter = () => {
              optionItem.style.backgroundColor = '#2a2e39';
              optionItem.style.color = '#ffffff';
              if (!starredIndicators.includes(ind.name)) {
                starBtn.style.color = '#868993';
              }
            };
            optionItem.onmouseleave = () => {
              const currentAdded = activeIndicatorsRef.current.some(x => x.name === ind.name);
              optionItem.style.backgroundColor = currentAdded ? 'rgba(41, 98, 255, 0.15)' : 'transparent';
              optionItem.style.color = currentAdded ? '#2962ff' : '#d1d4dc';
              if (!starredIndicators.includes(ind.name)) {
                starBtn.style.color = '#434651';
              }
            };

            optionItem.onclick = () => {
              toggleIndicator(ind.name);
              rebuildIndicatorsList(searchInput.value);
            };

            allListContainer.appendChild(optionItem);
          });
        };

        const rebuildFavIndicatorsList = () => {
          favListContainer.innerHTML = '';
          if (starredIndicators.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.padding = '8px 12px';
            emptyMsg.style.color = '#868993';
            emptyMsg.style.fontSize = '13px';
            emptyMsg.innerText = 'No favorite indicators';
            favListContainer.appendChild(emptyMsg);
            return;
          }

          starredIndicators.forEach((name) => {
            const ind = AVAILABLE_INDICATORS.find(x => x.name === name);
            if (!ind) return;

            const optionItem = document.createElement('div');
            optionItem.style.display = 'flex';
            optionItem.style.justifyContent = 'space-between';
            optionItem.style.alignItems = 'center';
            optionItem.style.padding = '8px 12px';
            optionItem.style.cursor = 'pointer';
            optionItem.style.fontSize = '13px';
            optionItem.style.borderRadius = '4px';
            optionItem.style.margin = '2px 0';
            optionItem.style.transition = 'background-color 0.15s, color 0.15s';

            const isAdded = activeIndicatorsRef.current.some(x => x.name === ind.name);
            optionItem.style.color = isAdded ? '#2962ff' : '#d1d4dc';
            optionItem.style.backgroundColor = isAdded ? 'rgba(41, 98, 255, 0.15)' : 'transparent';

            const labelSpan = document.createElement('span');
            labelSpan.innerText = ind.label;
            labelSpan.style.flexGrow = '1';
            optionItem.appendChild(labelSpan);

            optionItem.onmouseenter = () => {
              optionItem.style.backgroundColor = '#2a2e39';
              optionItem.style.color = '#ffffff';
            };
            optionItem.onmouseleave = () => {
              const currentAdded = activeIndicatorsRef.current.some(x => x.name === ind.name);
              optionItem.style.backgroundColor = currentAdded ? 'rgba(41, 98, 255, 0.15)' : 'transparent';
              optionItem.style.color = currentAdded ? '#2962ff' : '#d1d4dc';
            };

            optionItem.onclick = () => {
              toggleIndicator(ind.name);
              rebuildFavIndicatorsList();
              if (indicatorsMenu.classList.contains('show-menu')) {
                rebuildIndicatorsList(searchInput.value);
              }
            };

            favListContainer.appendChild(optionItem);
          });
        };

        indMainBtn.onmouseenter = () => {
          const isOpen = indicatorsMenu.classList.contains('show-menu');
          if (!isOpen) {
            indMainBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            indMainBtn.style.color = '#ffffff';
          }
        };
        indMainBtn.onmouseleave = () => {
          const isOpen = indicatorsMenu.classList.contains('show-menu');
          indMainBtn.style.backgroundColor = isOpen ? 'rgba(41, 98, 255, 0.15)' : 'transparent';
          indMainBtn.style.color = isOpen ? '#2962ff' : '#d1d4dc';
        };

        indMainBtn.onclick = (e) => {
          e.stopPropagation();
          const isOpen = indicatorsMenu.classList.contains('show-menu');
          favMenu.classList.remove('show-menu');
          indArrowBtn.style.color = '#d1d4dc';
          indArrowBtn.style.backgroundColor = 'transparent';
          indArrowBtn.classList.remove('active-arrow');

          if (isOpen) {
            indicatorsMenu.classList.remove('show-menu');
            indMainBtn.style.color = '#d1d4dc';
            indMainBtn.style.backgroundColor = 'transparent';
          } else {
            searchInput.value = '';
            rebuildIndicatorsList('');
            const rect = indMainBtn.getBoundingClientRect();
            const parentRect = dropdownParent.getBoundingClientRect();
            const menuHeight = 350;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
              indicatorsMenu.style.top = `${rect.top - parentRect.top - menuHeight - 4}px`;
            } else {
              indicatorsMenu.style.top = `${rect.bottom - parentRect.top}px`;
            }
            const menuWidth = 240;
            let leftPos = rect.left - parentRect.left;
            if (leftPos + menuWidth > window.innerWidth - 10) {
              leftPos = Math.max(10, window.innerWidth - menuWidth - 10);
            }
            indicatorsMenu.style.left = `${leftPos}px`;
            indicatorsMenu.classList.add('show-menu');
            indMainBtn.style.color = '#2962ff';
            indMainBtn.style.backgroundColor = 'rgba(41, 98, 255, 0.15)';
            setTimeout(() => searchInput.focus(), 50);
          }
        };

        indArrowBtn.onmouseenter = () => {
          const isOpen = favMenu.classList.contains('show-menu');
          if (!isOpen) {
            indArrowBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            indArrowBtn.style.color = '#ffffff';
          }
        };
        indArrowBtn.onmouseleave = () => {
          const isOpen = favMenu.classList.contains('show-menu');
          indArrowBtn.style.backgroundColor = isOpen ? 'rgba(41, 98, 255, 0.15)' : 'transparent';
          indArrowBtn.style.color = isOpen ? '#2962ff' : '#d1d4dc';
        };

        indArrowBtn.onclick = (e) => {
          e.stopPropagation();
          const isOpen = favMenu.classList.contains('show-menu');
          indicatorsMenu.classList.remove('show-menu');
          indMainBtn.style.color = '#d1d4dc';
          indMainBtn.style.backgroundColor = 'transparent';

          if (isOpen) {
            favMenu.classList.remove('show-menu');
            indArrowBtn.style.color = '#d1d4dc';
            indArrowBtn.style.backgroundColor = 'transparent';
            indArrowBtn.classList.remove('active-arrow');
          } else {
            rebuildFavIndicatorsList();
            const rect = indArrowBtn.getBoundingClientRect();
            const parentRect = dropdownParent.getBoundingClientRect();
            const menuHeight = 200;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
              favMenu.style.top = `${rect.top - parentRect.top - menuHeight - 4}px`;
            } else {
              favMenu.style.top = `${rect.bottom - parentRect.top}px`;
            }
            const menuWidth = 160;
            let leftPos = rect.left - parentRect.left;
            if (leftPos + menuWidth > window.innerWidth - 10) {
              leftPos = Math.max(10, window.innerWidth - menuWidth - 10);
            }
            favMenu.style.left = `${leftPos}px`;
            favMenu.classList.add('show-menu');
            indArrowBtn.style.color = '#2962ff';
            indArrowBtn.style.backgroundColor = 'rgba(41, 98, 255, 0.15)';
            indArrowBtn.classList.add('active-arrow');
          }
        };

        searchInput.oninput = () => {
          rebuildIndicatorsList(searchInput.value);
        };
        searchInput.onclick = (e) => {
          e.stopPropagation();
        };

        const closeAllIndicatorMenus = () => {
          indicatorsMenu.classList.remove('show-menu');
          indMainBtn.style.color = '#d1d4dc';
          indMainBtn.style.backgroundColor = 'transparent';
          favMenu.classList.remove('show-menu');
          indArrowBtn.style.color = '#d1d4dc';
          indArrowBtn.style.backgroundColor = 'transparent';
          indArrowBtn.classList.remove('active-arrow');
        };
        document.addEventListener('click', closeAllIndicatorMenus);

        // Chain cleanup
        const oldCleanup = el.__custom_dropdown_cleanup__;
        el.__custom_dropdown_cleanup__ = () => {
          if (oldCleanup) {
            try { oldCleanup(); } catch (err) { }
          }
          document.removeEventListener('click', closeAllIndicatorMenus);
          if (indicatorsMenu.parentNode) {
            indicatorsMenu.parentNode.removeChild(indicatorsMenu);
          }
          if (favMenu.parentNode) {
            favMenu.parentNode.removeChild(favMenu);
          }
          if (indContainer.parentNode) {
            indContainer.parentNode.removeChild(indContainer);
          }
        };
      }

      // Inject Layout Selector Button
      if (onLayoutChange) {
        const layoutContainer = document.createElement('div');
        layoutContainer.className = 'custom-layout-dropdown-container';
        layoutContainer.style.position = 'relative';
        layoutContainer.style.display = 'inline-flex';
        layoutContainer.style.alignItems = 'center';
        layoutContainer.style.marginLeft = '8px';
        layoutContainer.style.borderRadius = '4px';
        layoutContainer.style.transition = 'all 0.15s';
        layoutContainer.style.color = '#d1d4dc';
        layoutContainer.style.backgroundColor = 'transparent';



        const layoutMainBtn = document.createElement('button');
        layoutMainBtn.className = 'item custom-layout-main-btn';
        layoutMainBtn.style.background = 'transparent';
        layoutMainBtn.style.border = 'none';
        layoutMainBtn.style.color = '#d1d4dc';
        layoutMainBtn.style.cursor = 'pointer';
        layoutMainBtn.style.display = 'inline-flex';
        layoutMainBtn.style.alignItems = 'center';
        layoutMainBtn.style.justifyContent = 'center';
        layoutMainBtn.style.padding = '4px';
        layoutMainBtn.style.width = '34px';
        layoutMainBtn.style.height = '34px';
        layoutMainBtn.style.borderRadius = '6px';
        layoutMainBtn.style.transition = 'all 0.15s';
        layoutMainBtn.title = 'Select Layout';
        layoutMainBtn.innerHTML = getLayoutIcon(layout || '1');

        layoutContainer.appendChild(layoutMainBtn);

        layoutMainBtn.onmouseenter = () => {
          const isOpen = layoutDropdownMenu.classList.contains('show-menu');
          if (!isOpen) {
            layoutMainBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            layoutMainBtn.style.color = '#ffffff';
          }
        };
        layoutMainBtn.onmouseleave = () => {
          const isOpen = layoutDropdownMenu.classList.contains('show-menu');
          layoutMainBtn.style.backgroundColor = isOpen ? 'rgba(41, 98, 255, 0.15)' : 'transparent';
          layoutMainBtn.style.color = isOpen ? '#2962ff' : '#d1d4dc';
        };

        // Create dropdown popover list (as a visual grid of layout change icons only)
        const layoutDropdownMenu = document.createElement('div');
        layoutDropdownMenu.className = 'custom-layout-dropdown-menu';
        layoutDropdownMenu.setAttribute('data-current-layout', layout || '1');
        layoutDropdownMenu.style.position = 'absolute';
        layoutDropdownMenu.style.borderRadius = '6px';
        layoutDropdownMenu.style.padding = '8px';
        layoutDropdownMenu.style.zIndex = '9999999';
        layoutDropdownMenu.style.gap = '8px';

        // Layout options including 10 and 12 grid options
        const layoutsList = [
          { key: '1', rows: 1, cols: 1, text: '1 Chart' },
          { key: '2v', rows: 1, cols: 2, text: '2 Columns' },
          { key: '2h', rows: 2, cols: 1, text: '2 Rows' },
          { key: '3v', rows: 1, cols: 3, text: '3 Columns' },
          { key: '3h', rows: 3, cols: 1, text: '3 Rows' },
          { key: '3g', rows: 2, cols: 2, special: '3g', text: '3 Mixed (Left Full)' },
          { key: '3g2', rows: 2, cols: 2, special: '3g2', text: '3 Mixed (Top Full)' },
          { key: '3g3', rows: 2, cols: 2, special: '3g3', text: '3 Mixed (Bottom Full)' },
          { key: '3g4', rows: 2, cols: 2, special: '3g4', text: '3 Mixed (Right Full)' },
          { key: '4', rows: 2, cols: 2, text: '4 Grid' },
          { key: '5', rows: 2, cols: 6, special: '5', text: '5 Grid (2 Top, 3 Bottom)' },
          { key: '6', rows: 2, cols: 3, text: '6 Grid' },
          { key: '7', rows: 2, cols: 12, special: '7', text: '7 Grid (3 Top, 4 Bottom)' },
          { key: '8', rows: 2, cols: 4, text: '8 Grid' },
          { key: '9', rows: 3, cols: 3, text: '9 Grid' },
          { key: '10', rows: 2, cols: 5, text: '10 Grid' },
          { key: '12', rows: 3, cols: 4, text: '12 Grid' }
        ];

        layoutsList.forEach(lay => {
          const optionItem = document.createElement('div');
          optionItem.setAttribute('data-layout-key', lay.key);
          optionItem.className = 'layout-option-item';
          optionItem.style.width = '36px';
          optionItem.style.height = '28px';
          optionItem.style.borderRadius = '3px';
          optionItem.style.cursor = 'pointer';
          optionItem.style.boxSizing = 'border-box';
          optionItem.style.display = 'grid';
          optionItem.style.padding = '2px';
          optionItem.style.gap = '2px';
          optionItem.title = lay.text; // Native tooltip

          // Draw layout dividers
          if (lay.special === '3g' || lay.special === '3g2' || lay.special === '3g3' || lay.special === '3g4' || lay.special === '5' || lay.special === '7') {
            optionItem.style.display = 'flex';
            if (lay.special === '3g') {
              optionItem.style.flexDirection = 'row';

              const leftCell = document.createElement('div');
              leftCell.className = 'layout-cell';
              leftCell.style.flex = '1';
              leftCell.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
              leftCell.style.borderRadius = '1px';
              leftCell.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';

              const rightCol = document.createElement('div');
              rightCol.style.flex = '1';
              rightCol.style.display = 'flex';
              rightCol.style.flexDirection = 'column';
              rightCol.style.gap = '2px';

              const rightTop = document.createElement('div');
              rightTop.className = 'layout-cell';
              rightTop.style.flex = '1';
              rightTop.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
              rightTop.style.borderRadius = '1px';
              rightTop.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';

              const rightBottom = document.createElement('div');
              rightBottom.className = 'layout-cell';
              rightBottom.style.flex = '1';
              rightBottom.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
              rightBottom.style.borderRadius = '1px';
              rightBottom.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';

              rightCol.appendChild(rightTop);
              rightCol.appendChild(rightBottom);
              optionItem.appendChild(leftCell);
              optionItem.appendChild(rightCol);
            } else if (lay.special === '3g2') {
              optionItem.style.flexDirection = 'column';

              const topCell = document.createElement('div');
              topCell.className = 'layout-cell';
              topCell.style.flex = '1';
              topCell.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
              topCell.style.borderRadius = '1px';
              topCell.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';

              const bottomRow = document.createElement('div');
              bottomRow.style.flex = '1';
              bottomRow.style.display = 'flex';
              bottomRow.style.flexDirection = 'row';
              bottomRow.style.gap = '2px';

              const bottomLeft = document.createElement('div');
              bottomLeft.className = 'layout-cell';
              bottomLeft.style.flex = '1';
              bottomLeft.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
              bottomLeft.style.borderRadius = '1px';
              bottomLeft.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';

              const bottomRight = document.createElement('div');
              bottomRight.className = 'layout-cell';
              bottomRight.style.flex = '1';
              bottomRight.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
              bottomRight.style.borderRadius = '1px';
              bottomRight.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';

              bottomRow.appendChild(bottomLeft);
              bottomRow.appendChild(bottomRight);
              optionItem.appendChild(topCell);
              optionItem.appendChild(bottomRow);
            } else if (lay.special === '3g3') {
              optionItem.style.flexDirection = 'column';

              const topRow = document.createElement('div');
              topRow.style.flex = '1';
              topRow.style.display = 'flex';
              topRow.style.flexDirection = 'row';
              topRow.style.gap = '2px';

              const topLeft = document.createElement('div');
              topLeft.className = 'layout-cell';
              topLeft.style.flex = '1';
              topLeft.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
              topLeft.style.borderRadius = '1px';
              topLeft.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';

              const topRight = document.createElement('div');
              topRight.className = 'layout-cell';
              topRight.style.flex = '1';
              topRight.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
              topRight.style.borderRadius = '1px';
              topRight.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';

              const bottomCell = document.createElement('div');
              bottomCell.className = 'layout-cell';
              bottomCell.style.flex = '1';
              bottomCell.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
              bottomCell.style.borderRadius = '1px';
              bottomCell.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';

              topRow.appendChild(topLeft);
              topRow.appendChild(topRight);
              optionItem.appendChild(topRow);
              optionItem.appendChild(bottomCell);
            } else if (lay.special === '3g4') {
              optionItem.style.flexDirection = 'row';

              const leftCol = document.createElement('div');
              leftCol.style.flex = '1';
              leftCol.style.display = 'flex';
              leftCol.style.flexDirection = 'column';
              leftCol.style.gap = '2px';

              const leftTop = document.createElement('div');
              leftTop.className = 'layout-cell';
              leftTop.style.flex = '1';
              leftTop.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
              leftTop.style.borderRadius = '1px';
              leftTop.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';

              const leftBottom = document.createElement('div');
              leftBottom.className = 'layout-cell';
              leftBottom.style.flex = '1';
              leftBottom.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
              leftBottom.style.borderRadius = '1px';
              leftBottom.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';

              const rightCell = document.createElement('div');
              rightCell.className = 'layout-cell';
              rightCell.style.flex = '1';
              rightCell.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
              rightCell.style.borderRadius = '1px';
              rightCell.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';

              leftCol.appendChild(leftTop);
              leftCol.appendChild(leftBottom);
              optionItem.appendChild(leftCol);
              optionItem.appendChild(rightCell);
            } else if (lay.special === '5') {
              optionItem.style.flexDirection = 'column';

              const topRow = document.createElement('div');
              topRow.style.flex = '1';
              topRow.style.display = 'flex';
              topRow.style.flexDirection = 'row';
              topRow.style.gap = '2px';

              for (let i = 0; i < 2; i++) {
                const cell = document.createElement('div');
                cell.className = 'layout-cell';
                cell.style.flex = '1';
                cell.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
                cell.style.borderRadius = '1px';
                cell.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';
                topRow.appendChild(cell);
              }

              const bottomRow = document.createElement('div');
              bottomRow.style.flex = '1';
              bottomRow.style.display = 'flex';
              bottomRow.style.flexDirection = 'row';
              bottomRow.style.gap = '2px';

              for (let i = 0; i < 3; i++) {
                const cell = document.createElement('div');
                cell.className = 'layout-cell';
                cell.style.flex = '1';
                cell.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
                cell.style.borderRadius = '1px';
                cell.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';
                bottomRow.appendChild(cell);
              }

              optionItem.appendChild(topRow);
              optionItem.appendChild(bottomRow);
            } else if (lay.special === '7') {
              optionItem.style.flexDirection = 'column';

              const topRow = document.createElement('div');
              topRow.style.flex = '1';
              topRow.style.display = 'flex';
              topRow.style.flexDirection = 'row';
              topRow.style.gap = '2px';

              for (let i = 0; i < 3; i++) {
                const cell = document.createElement('div');
                cell.className = 'layout-cell';
                cell.style.flex = '1';
                cell.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
                cell.style.borderRadius = '1px';
                cell.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';
                topRow.appendChild(cell);
              }

              const bottomRow = document.createElement('div');
              bottomRow.style.flex = '1';
              bottomRow.style.display = 'flex';
              bottomRow.style.flexDirection = 'row';
              bottomRow.style.gap = '2px';

              for (let i = 0; i < 4; i++) {
                const cell = document.createElement('div');
                cell.className = 'layout-cell';
                cell.style.flex = '1';
                cell.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
                cell.style.borderRadius = '1px';
                cell.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';
                bottomRow.appendChild(cell);
              }

              optionItem.appendChild(topRow);
              optionItem.appendChild(bottomRow);
            }
          } else {
            optionItem.style.gridTemplateColumns = `repeat(${lay.cols}, 1fr)`;
            optionItem.style.gridTemplateRows = `repeat(${lay.rows}, 1fr)`;
            const cellCount = lay.rows * lay.cols;
            for (let i = 0; i < cellCount; i++) {
              const cell = document.createElement('div');
              cell.className = 'layout-cell';
              cell.style.border = '1px solid ' + (layout === lay.key ? '#2962ff' : '#868993');
              cell.style.borderRadius = '1px';
              cell.style.backgroundColor = layout === lay.key ? '#2962ff' : 'transparent';
              optionItem.appendChild(cell);
            }
          }

          const isSelected = (layout || '1') === lay.key;
          if (isSelected) optionItem.classList.add('selected');

          // Hover effects
          optionItem.onmouseenter = () => {
            const currentLayout = layoutDropdownMenu.getAttribute('data-current-layout') || '1';
            const isLight = document.documentElement.getAttribute('data-chrome-theme') === 'light';
            optionItem.style.borderColor = '#2962ff';
            optionItem.style.backgroundColor = isLight ? 'rgba(41, 98, 255, 0.08)' : 'rgba(41, 98, 255, 0.15)';
            const cells = optionItem.querySelectorAll('.layout-cell');
            cells.forEach(c => {
              const cell = c as HTMLElement;
              cell.style.borderColor = '#2962ff';
              if (currentLayout !== lay.key) {
                cell.style.backgroundColor = isLight ? 'rgba(41, 98, 255, 0.25)' : 'rgba(41, 98, 255, 0.4)';
              }
            });
          };

          optionItem.onmouseleave = () => {
            const currentLayout = layoutDropdownMenu.getAttribute('data-current-layout') || '1';
            const isSelected = currentLayout === lay.key;
            const isLight = document.documentElement.getAttribute('data-chrome-theme') === 'light';
            const defaultLineColor = isLight ? '#50535e' : '#434651';
            const defaultCellBorder = isLight ? '#50535e' : '#868993';

            optionItem.style.borderColor = isSelected ? '#2962ff' : defaultLineColor;
            optionItem.style.backgroundColor = isSelected ? (isLight ? 'rgba(41, 98, 255, 0.12)' : 'rgba(41, 98, 255, 0.15)') : 'transparent';
            const cells = optionItem.querySelectorAll('.layout-cell');
            cells.forEach(c => {
              const cell = c as HTMLElement;
              cell.style.borderColor = isSelected ? '#2962ff' : defaultCellBorder;
              cell.style.backgroundColor = isSelected ? '#2962ff' : 'transparent';
            });
          };

          optionItem.onclick = (ev) => {
            ev.stopPropagation();
            onLayoutChange(lay.key);
            layoutDropdownMenu.classList.remove('show-menu');
            const isLight = document.documentElement.getAttribute('data-chrome-theme') === 'light';
            layoutContainer.style.color = isLight ? '#131722' : '#d1d4dc';
            layoutContainer.style.backgroundColor = 'transparent';
          };

          layoutDropdownMenu.appendChild(optionItem);
        });

        // Append layout menu inside dropdownParent (layout-container) to prevent clipping and stack order issues
        dropdownParent.appendChild(layoutDropdownMenu);

        const toggleLayoutMenu = (e: MouseEvent) => {
          e.stopPropagation();
          const isOpen = layoutDropdownMenu.classList.contains('show-menu');
          const isLight = document.documentElement.getAttribute('data-chrome-theme') === 'light';
          if (isOpen) {
            layoutDropdownMenu.classList.remove('show-menu');
            layoutContainer.style.color = isLight ? '#131722' : '#d1d4dc';
            layoutContainer.style.backgroundColor = 'transparent';
          } else {
            const rect = layoutContainer.getBoundingClientRect();
            const parentRect = dropdownParent.getBoundingClientRect();
            layoutDropdownMenu.classList.add('show-menu');

            // Prevent popover from going off-screen by calculating width and right-aligning
            const menuWidth = layoutDropdownMenu.offsetWidth || 190;
            let leftPos = (rect.right - parentRect.left) - menuWidth;
            const maxLeft = (parentRect.width || window.innerWidth) - menuWidth - 10;
            if (leftPos > maxLeft) leftPos = maxLeft;
            if (leftPos < 8) leftPos = Math.max(8, rect.left - parentRect.left);

            layoutDropdownMenu.style.top = `${rect.bottom - parentRect.top + 4}px`;
            layoutDropdownMenu.style.left = `${leftPos}px`;
            layoutContainer.style.color = '#2962ff';
            layoutContainer.style.backgroundColor = isLight ? 'rgba(41, 98, 255, 0.12)' : 'rgba(41, 98, 255, 0.15)';
          }
        };
        layoutMainBtn.onclick = toggleLayoutMenu;

        const closeLayoutDropdown = () => {
          layoutDropdownMenu.classList.remove('show-menu');
          layoutContainer.style.color = '#d1d4dc';
          layoutContainer.style.backgroundColor = 'transparent';
        };
        document.addEventListener('click', closeLayoutDropdown);
        layoutContainer.style.marginLeft = '0px';
        layoutContainer.style.marginRight = '0px';

        corePeriodBar.appendChild(layoutContainer);

        // Chain cleanup
        const oldCleanup = el.__custom_dropdown_cleanup__;
        el.__custom_dropdown_cleanup__ = () => {
          if (oldCleanup) {
            try { oldCleanup(); } catch (err) { }
          }
          document.removeEventListener('click', closeLayoutDropdown);

          if (layoutDropdownMenu.parentNode) {
            layoutDropdownMenu.parentNode.removeChild(layoutDropdownMenu);
          }
          if (layoutContainer.parentNode) {
            layoutContainer.parentNode.removeChild(layoutContainer);
          }
        };
      }

      // ────────────────────────────────────────────────────────────
      // Inject Layers Button & Object Tree Dropdown in Top Menu Bar
      // ────────────────────────────────────────────────────────────
      const layersContainer = document.createElement('div');
      layersContainer.className = 'custom-layers-dropdown-container';
      layersContainer.style.position = 'relative';
      layersContainer.style.display = 'inline-flex';
      layersContainer.style.alignItems = 'center';
      layersContainer.style.borderRadius = '6px';
      layersContainer.style.transition = 'all 0.15s';
      layersContainer.style.color = '#d1d4dc';
      layersContainer.style.backgroundColor = 'transparent';
      layersContainer.style.marginLeft = 'auto'; // push right-side cluster

      const layersMainBtn = document.createElement('button');
      layersMainBtn.className = 'item custom-layers-main-btn';
      layersMainBtn.style.background = 'transparent';
      layersMainBtn.style.border = 'none';
      layersMainBtn.style.color = '#d1d4dc';
      layersMainBtn.style.cursor = 'pointer';
      layersMainBtn.style.display = 'inline-flex';
      layersMainBtn.style.alignItems = 'center';
      layersMainBtn.style.justifyContent = 'center';
      layersMainBtn.style.padding = '4px';
      layersMainBtn.style.width = '34px';
      layersMainBtn.style.height = '34px';
      layersMainBtn.style.borderRadius = '6px';
      layersMainBtn.style.transition = 'all 0.15s';
      layersMainBtn.title = 'Layers / Object Tree';
      layersMainBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
      `;

      layersContainer.appendChild(layersMainBtn);

      layersMainBtn.onmouseenter = () => {
        const isOpen = layersDropdownMenu.classList.contains('show-menu');
        if (!isOpen) {
          layersMainBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          layersMainBtn.style.color = '#ffffff';
        }
      };
      layersMainBtn.onmouseleave = () => {
        const isOpen = layersDropdownMenu.classList.contains('show-menu');
        layersMainBtn.style.backgroundColor = isOpen ? 'rgba(41, 98, 255, 0.15)' : 'transparent';
        layersMainBtn.style.color = isOpen ? '#2962ff' : '#d1d4dc';
      };

      const layersDropdownMenu = document.createElement('div');
      layersDropdownMenu.className = 'custom-layers-dropdown-menu';
      layersDropdownMenu.style.position = 'absolute';
      layersDropdownMenu.style.backgroundColor = '#1e222d';
      layersDropdownMenu.style.background = '#1e222d';
      layersDropdownMenu.style.opacity = '1';
      layersDropdownMenu.style.border = '1px solid #2a2e39';
      layersDropdownMenu.style.borderRadius = '8px';
      layersDropdownMenu.style.padding = '0';
      layersDropdownMenu.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.75)';
      layersDropdownMenu.style.display = 'none';
      layersDropdownMenu.style.zIndex = '9999999';
      layersDropdownMenu.style.width = '380px';
      layersDropdownMenu.style.boxSizing = 'border-box';
      layersDropdownMenu.style.flexDirection = 'column';
      layersDropdownMenu.style.overflow = 'hidden';

      const formatOverlayDisplayName = (name: string, index: number) => {
        const map: Record<string, string> = {
          'trend-line': 'Trend Line',
          'horizontal-line': 'Horizontal Line',
          'horizontal-ray': 'Horizontal Ray',
          'vertical-line': 'Vertical Line',
          'price-line': 'Price Line',
          'extended-line': 'Extended Line',
          'ray': 'Ray Line',
          'parallel-channel': 'Parallel Channel',
          'fibonacci': 'Fibonacci Retracement',
          'fib-retracement': 'Fibonacci Retracement',
          'pitchfork': 'Pitchfork',
          'gann-box': 'Gann Box',
          'gann-square': 'Gann Square',
          'rectangle': 'Rectangle',
          'circle': 'Circle',
          'ellipse': 'Ellipse',
          'triangle': 'Triangle',
          'brush': 'Brush',
          'highlighter': 'Highlighter',
          'text-annotation': 'Text',
          'text-box': 'Text Box',
          'long-position': 'Long Position',
          'short-position': 'Short Position',
          'price-range': 'Price Range',
          'date-range': 'Date Range',
          'cross-line': 'Cross Line',
          'info-line': 'Info Line',
          'trend-angle': 'Trend Angle',
          'polyline': 'Polyline',
          'path': 'Path'
        };
        const base = map[name] || name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `${base} #${index + 1}`;
      };

      const getOverlayToolIconSvg = (name: string): string => {
        return getSidebarIconSvgString(name, 18);
      };

      // Reorder overlay in stack by moving an overlay from a visual index to another visual index
      const reorderOverlayToVisualIndex = (chart: any, sourceOverlayId: string, destVisualIdx: number) => {
        if (!chart || typeof chart.getOverlays !== 'function') return;
        const allOverlays = chart.getOverlays() || [];
        const userOverlays = allOverlays.filter((o: any) => o.id && o.name !== 'future-time-scale');
        if (userOverlays.length <= 1) return;
        
        // List is displayed with topmost layer at visual index 0 (userOverlays[userOverlays.length - 1])
        const currentVisualList = [...userOverlays].reverse();
        const fromVisualIdx = currentVisualList.findIndex((o: any) => o.id === sourceOverlayId);
        if (fromVisualIdx === -1) return;

        const [movedItem] = currentVisualList.splice(fromVisualIdx, 1);
        const clampedDest = Math.max(0, Math.min(currentVisualList.length, destVisualIdx));
        currentVisualList.splice(clampedDest, 0, movedItem);

        // Convert back to chart stack (bottommost at index 0, topmost at end)
        const newActualStack = [...currentVisualList].reverse();

        newActualStack.forEach((o: any, idx: number) => {
          const newZ = (idx + 1) * 10;
          try {
            if (typeof chart.overrideOverlay === 'function') {
              chart.overrideOverlay({ id: o.id, zLevel: newZ });
            }
          } catch (e) {}
          o.zLevel = newZ;
          if (typeof o.setPrevZLevel === 'function') {
            o.setPrevZLevel(newZ);
          }
        });

        const coreChart = (chart as any)._chartApi || chart;
        const store = coreChart?._chartStore || (chart as any)?._chartStore;
        if (store && store._overlays) {
          try {
            store._overlays.forEach((paneOverlays: any[]) => {
              if (Array.isArray(paneOverlays)) {
                paneOverlays.sort((a, b) => (Number(a.zLevel) || 0) - (Number(b.zLevel) || 0));
              }
            });
            if (typeof store._sortOverlays === 'function') {
              store._sortOverlays();
            }
          } catch (e) {}
        }

        if (typeof chart.updatePane === 'function') chart.updatePane(1);
        if (typeof chart.invalidate === 'function') chart.invalidate();
        rebuildLayersMenu(true);
        window.dispatchEvent(new CustomEvent('reorder-drawing-layer', { detail: { overlayId: sourceOverlayId } }));
        setTimeout(() => window.dispatchEvent(new CustomEvent('save-history-state')), 50);
      };

      let draggedOverlayId: string | null = null;
      let layerLiveUpdateTimer: any = null;
      let lastRenderedSignature = '';
      let isMouseInsideLayersMenu = false;
      let selectedOverlayId: string | null = null;

      layersDropdownMenu.onmouseenter = () => {
        isMouseInsideLayersMenu = true;
      };
      layersDropdownMenu.onmouseleave = () => {
        isMouseInsideLayersMenu = false;
      };
      layersDropdownMenu.onclick = (e) => {
        e.stopPropagation();
      };
      layersDropdownMenu.onmousedown = (e) => {
        e.stopPropagation();
      };

      const startLayerLiveUpdates = () => {
        stopLayerLiveUpdates();
        layerLiveUpdateTimer = setInterval(() => {
          if (!layersDropdownMenu.classList.contains('show-menu')) {
            stopLayerLiveUpdates();
            return;
          }
          // Never rebuild on timer when dragging or interacting inside the layer menu
          if (draggedOverlayId || isMouseInsideLayersMenu) return;

          const chart = (window as any).__active_chart_instance__ || getCoreChart();
          const allOverlays = (chart && typeof chart.getOverlays === 'function') ? (chart.getOverlays() || []) : [];
          const userOverlays = allOverlays.filter((o: any) => o.id && o.name !== 'future-time-scale');
          const signature = userOverlays.map((o: any) => `${o.id}::${o.zLevel || 0}::${!!o.lock}::${o.visible !== false}::${o.name}`).join('||');
          
          if (signature !== lastRenderedSignature) {
            rebuildLayersMenu(false);
          }
        }, 400);
      };

      const stopLayerLiveUpdates = () => {
        if (layerLiveUpdateTimer) {
          clearInterval(layerLiveUpdateTimer);
          layerLiveUpdateTimer = null;
        }
      };

      let rebuildDebounceTimer: any = null;
      const scheduleRebuildLayersMenu = (force = false) => {
        if (rebuildDebounceTimer) clearTimeout(rebuildDebounceTimer);
        rebuildDebounceTimer = setTimeout(() => {
          if (layersDropdownMenu.classList.contains('show-menu')) {
            if (!isMouseInsideLayersMenu || force) {
              rebuildLayersMenu(force);
            }
          }
        }, 50);
      };

      // Persistent Header and List Container
      const layersHeader = document.createElement('div');
      layersHeader.className = 'custom-layers-header';
      layersHeader.style.display = 'flex';
      layersHeader.style.alignItems = 'center';
      layersHeader.style.justifyContent = 'space-between';
      layersHeader.style.padding = '12px 16px';
      layersHeader.style.borderBottom = '1px solid #2a2e39';
      layersHeader.style.backgroundColor = '#181b24';
      layersHeader.style.background = '#181b24';

      const titleBox = document.createElement('div');
      titleBox.style.display = 'flex';
      titleBox.style.alignItems = 'center';
      titleBox.style.gap = '10px';
      titleBox.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2979ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
        <span style="font-size: 14px; font-weight: 600; color: #ffffff;">Layers & Objects</span>
      `;
      const countBadge = document.createElement('span');
      countBadge.className = 'custom-layers-count-badge';
      countBadge.style.fontSize = '11px';
      countBadge.style.background = 'rgba(41, 98, 255, 0.2)';
      countBadge.style.color = '#2979ff';
      countBadge.style.padding = '2px 8px';
      countBadge.style.borderRadius = '10px';
      countBadge.style.fontWeight = '600';
      countBadge.textContent = '0';
      titleBox.appendChild(countBadge);
      layersHeader.appendChild(titleBox);

      const headerActions = document.createElement('div');
      headerActions.className = 'custom-layers-header-actions';
      headerActions.style.display = 'flex';
      headerActions.style.alignItems = 'center';
      headerActions.style.gap = '8px';

      const hideAllBtn = document.createElement('button');
      hideAllBtn.className = 'custom-layer-action-btn';
      hideAllBtn.title = 'Hide All';
      hideAllBtn.style.background = 'transparent';
      hideAllBtn.style.border = 'none';
      hideAllBtn.style.color = '#787b86';
      hideAllBtn.style.cursor = 'pointer';
      hideAllBtn.style.padding = '4px 6px';
      hideAllBtn.style.borderRadius = '4px';
      hideAllBtn.style.display = 'flex';
      hideAllBtn.style.alignItems = 'center';

      const lockAllBtn = document.createElement('button');
      lockAllBtn.className = 'custom-layer-action-btn';
      lockAllBtn.title = 'Lock / Unlock All';
      lockAllBtn.style.background = 'transparent';
      lockAllBtn.style.border = 'none';
      lockAllBtn.style.color = '#787b86';
      lockAllBtn.style.cursor = 'pointer';
      lockAllBtn.style.padding = '4px 6px';
      lockAllBtn.style.borderRadius = '4px';
      lockAllBtn.style.display = 'flex';
      lockAllBtn.style.alignItems = 'center';
      lockAllBtn.innerHTML = getSidebarIconSvgString('lockBtn', 16);

      const clearAllBtn = document.createElement('button');
      clearAllBtn.className = 'custom-layer-action-btn custom-layer-del-btn';
      clearAllBtn.title = 'Remove All Drawings';
      clearAllBtn.style.background = 'transparent';
      clearAllBtn.style.border = 'none';
      clearAllBtn.style.color = '#f23645';
      clearAllBtn.style.cursor = 'pointer';
      clearAllBtn.style.padding = '4px 6px';
      clearAllBtn.style.borderRadius = '4px';
      clearAllBtn.style.display = 'flex';
      clearAllBtn.style.alignItems = 'center';
      clearAllBtn.innerHTML = getSidebarIconSvgString('deleteBtn', 16);

      headerActions.appendChild(hideAllBtn);
      headerActions.appendChild(lockAllBtn);
      headerActions.appendChild(clearAllBtn);
      layersHeader.appendChild(headerActions);

      const listContainer = document.createElement('div');
      listContainer.className = 'custom-layers-list-container';
      listContainer.style.maxHeight = '460px';
      listContainer.style.overflowY = 'auto';
      listContainer.style.display = 'flex';
      listContainer.style.flexDirection = 'column';
      listContainer.style.padding = '6px 0';
      listContainer.style.backgroundColor = '#1e222d';
      listContainer.style.background = '#1e222d';

      layersDropdownMenu.appendChild(layersHeader);
      layersDropdownMenu.appendChild(listContainer);
      dropdownParent.appendChild(layersDropdownMenu);

      const rebuildLayersMenu = (_force = false) => {
        const chart = (window as any).__active_chart_instance__ || getCoreChart();
        const allOverlays = (chart && typeof chart.getOverlays === 'function') ? (chart.getOverlays() || []) : [];
        const userOverlays = allOverlays.filter((o: any) => o.id && o.name !== 'future-time-scale');
        const signature = userOverlays.map((o: any) => `${o.id}::${o.zLevel || 0}::${!!o.lock}::${o.visible !== false}::${o.name}`).join('||');

        countBadge.textContent = String(userOverlays.length);

        if (userOverlays.length === 0) {
          headerActions.style.display = 'none';
          listContainer.innerHTML = `
            <div style="padding: 28px 16px; text-align: center; color: #787b86; display: flex; flex-direction: column; align-items: center; gap: 8px;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#434651" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
              <div style="font-size: 13px; font-weight: 500; color: #d1d4dc;">No Drawings on Chart</div>
              <div style="font-size: 11px; color: #787b86;">Use drawing tools on the left toolbar to add layers.</div>
            </div>
          `;
          lastRenderedSignature = signature;
          return;
        }

        headerActions.style.display = 'flex';
        const anyVisible = userOverlays.some((o: any) => o.visible !== false);
        const expectedHideTitle = anyVisible ? 'Hide All' : 'Show All';
        if (hideAllBtn.title !== expectedHideTitle) {
          hideAllBtn.title = expectedHideTitle;
          hideAllBtn.innerHTML = anyVisible ? `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          ` : `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
              <line x1="2" x2="22" y1="2" y2="22"/>
            </svg>
          `;
        }
        hideAllBtn.onclick = (e) => {
          e.stopPropagation();
          const targetVisible = !anyVisible;
          userOverlays.forEach((o: any) => {
            if (typeof chart.overrideOverlay === 'function') {
              chart.overrideOverlay({ id: o.id, visible: targetVisible });
            }
          });
          if (typeof chart.updatePane === 'function') chart.updatePane(1);
          if (typeof chart.invalidate === 'function') chart.invalidate();
          rebuildLayersMenu(true);
        };

        const anyUnlocked = userOverlays.some((o: any) => !o.lock);
        const expectedLockTitle = anyUnlocked ? 'Lock All' : 'Unlock All';
        if (lockAllBtn.title !== expectedLockTitle) {
          lockAllBtn.title = expectedLockTitle;
          lockAllBtn.innerHTML = getSidebarIconSvgString(anyUnlocked ? 'lockBtn' : 'unlockBtn', 16);
        }
        lockAllBtn.onclick = (e) => {
          e.stopPropagation();
          userOverlays.forEach((o: any) => {
            if (typeof chart.overrideOverlay === 'function') {
              chart.overrideOverlay({ id: o.id, lock: anyUnlocked });
            }
          });
          if (typeof chart.invalidate === 'function') chart.invalidate();
          rebuildLayersMenu(true);
        };

        clearAllBtn.onclick = (e) => {
          e.stopPropagation();
          userOverlays.forEach((o: any) => {
            try { chart.removeOverlay({ id: o.id }); } catch (err) {}
          });
          if (typeof chart.updatePane === 'function') chart.updatePane(1);
          if (typeof chart.invalidate === 'function') chart.invalidate();
          window.dispatchEvent(new CustomEvent('close-drawing-toolbar'));
          rebuildLayersMenu(true);
        };

        // Clear empty state message if present
        if (listContainer.children.length === 1 && !listContainer.children[0].classList.contains('custom-layer-item-row')) {
          listContainer.innerHTML = '';
        }

        // Map existing DOM rows
        const existingRows = new Map<string, HTMLElement>();
        listContainer.querySelectorAll('.custom-layer-item-row').forEach((r: any) => {
          const id = r.getAttribute('data-overlay-id');
          if (id) existingRows.set(id, r);
        });

        // Reconcile rows in reversed order (top layer first)
        const reversedOverlays = [...userOverlays].reverse();
        const currentIds = new Set(reversedOverlays.map((o: any) => o.id));

        // Remove stale rows
        existingRows.forEach((row, id) => {
          if (!currentIds.has(id)) {
            row.remove();
            existingRows.delete(id);
          }
        });

        reversedOverlays.forEach((overlay: any, revIdx: number) => {
          const actualIdx = userOverlays.length - 1 - revIdx;
          const displayName = formatOverlayDisplayName(overlay.name, actualIdx);
          const isVisible = overlay.visible !== false;
          const isLocked = !!overlay.lock;

          const isNewRow = !existingRows.has(overlay.id);
          const itemRow = existingRows.get(overlay.id) || document.createElement('div');
          if (isNewRow) {
            // Create new row
            itemRow.className = 'custom-layer-item-row';
            itemRow.setAttribute('data-overlay-id', overlay.id);
            itemRow.style.display = 'flex';
            itemRow.style.alignItems = 'center';
            itemRow.style.justifyContent = 'space-between';
            itemRow.style.padding = '9px 14px';
            itemRow.style.borderBottom = '1px solid rgba(42, 46, 57, 0.4)';
            itemRow.style.borderTop = '2px solid transparent';
            itemRow.style.borderBottom = '2px solid transparent';
            itemRow.style.userSelect = 'none';

            // Left Info
            const leftInfo = document.createElement('div');
            leftInfo.className = 'custom-layer-left-info';
            leftInfo.style.display = 'flex';
            leftInfo.style.alignItems = 'center';
            leftInfo.style.gap = '10px';
            leftInfo.style.overflow = 'hidden';
            leftInfo.style.flex = '1';

            const toolIconElem = document.createElement('div');
            toolIconElem.className = 'custom-layer-tool-icon';
            toolIconElem.style.width = '20px';
            toolIconElem.style.height = '20px';
            toolIconElem.style.display = 'flex';
            toolIconElem.style.alignItems = 'center';
            toolIconElem.style.justifyContent = 'center';
            toolIconElem.style.marginRight = '6px';
            toolIconElem.style.flexShrink = '0';
            toolIconElem.innerHTML = getOverlayToolIconSvg(overlay.name);

            const nameElem = document.createElement('span');
            nameElem.className = 'custom-layer-name-span';
            nameElem.style.fontSize = '13px';
            nameElem.style.color = '#d1d4dc';
            nameElem.style.fontWeight = '500';
            nameElem.style.whiteSpace = 'nowrap';
            nameElem.style.overflow = 'hidden';
            nameElem.style.textOverflow = 'ellipsis';
            nameElem.textContent = displayName;

            leftInfo.appendChild(toolIconElem);
            leftInfo.appendChild(nameElem);

            // Item actions
            const itemActions = document.createElement('div');
            itemActions.className = 'custom-layer-actions';
            itemActions.style.display = 'flex';
            itemActions.style.alignItems = 'center';
            itemActions.style.gap = '6px';

            const itemEyeBtn = document.createElement('button');
            itemEyeBtn.className = 'custom-layer-action-btn custom-layer-eye-btn';
            itemEyeBtn.style.background = 'transparent';
            itemEyeBtn.style.border = 'none';
            itemEyeBtn.style.cursor = 'pointer';
            itemEyeBtn.style.padding = '4px';
            itemEyeBtn.style.borderRadius = '4px';
            itemEyeBtn.style.display = 'flex';
            itemEyeBtn.style.alignItems = 'center';

            const itemLockBtn = document.createElement('button');
            itemLockBtn.className = 'custom-layer-action-btn custom-layer-lock-btn';
            itemLockBtn.style.background = 'transparent';
            itemLockBtn.style.border = 'none';
            itemLockBtn.style.cursor = 'pointer';
            itemLockBtn.style.padding = '4px';
            itemLockBtn.style.borderRadius = '4px';
            itemLockBtn.style.display = 'flex';
            itemLockBtn.style.alignItems = 'center';

            const itemDelBtn = document.createElement('button');
            itemDelBtn.className = 'custom-layer-action-btn custom-layer-del-btn';
            itemDelBtn.title = 'Delete';
            itemDelBtn.style.background = 'transparent';
            itemDelBtn.style.border = 'none';
            itemDelBtn.style.color = '#787b86';
            itemDelBtn.style.cursor = 'pointer';
            itemDelBtn.style.padding = '4px';
            itemDelBtn.style.borderRadius = '4px';
            itemDelBtn.style.display = 'flex';
            itemDelBtn.style.alignItems = 'center';
            itemDelBtn.innerHTML = getSidebarIconSvgString('deleteBtn', 15);

            itemActions.appendChild(itemEyeBtn);
            itemActions.appendChild(itemLockBtn);
            itemActions.appendChild(itemDelBtn);

            itemRow.appendChild(leftInfo);
            itemRow.appendChild(itemActions);

            // Drag and drop
            itemRow.setAttribute('draggable', 'true');
            itemRow.ondragstart = (e: DragEvent) => {
              draggedOverlayId = overlay.id;
              if (e.dataTransfer) {
                e.dataTransfer.setData('text/plain', overlay.id);
                e.dataTransfer.effectAllowed = 'move';
              }
              itemRow.classList.add('dragging-layer-row');
            };

            itemRow.ondragend = () => {
              draggedOverlayId = null;
              listContainer.querySelectorAll('.custom-layer-item-row').forEach((r: any) => {
                r.classList.remove('dragging-layer-row');
                r.classList.remove('drag-over-top');
                r.classList.remove('drag-over-bottom');
              });
            };

            itemRow.ondragover = (e: DragEvent) => {
              e.preventDefault();
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
              }
              const rect = itemRow.getBoundingClientRect();
              const relY = e.clientY - rect.top;
              if (relY < rect.height / 2) {
                itemRow.classList.add('drag-over-top');
                itemRow.classList.remove('drag-over-bottom');
              } else {
                itemRow.classList.add('drag-over-bottom');
                itemRow.classList.remove('drag-over-top');
              }
            };

            itemRow.ondragleave = () => {
              itemRow.classList.remove('drag-over-top');
              itemRow.classList.remove('drag-over-bottom');
            };

            itemRow.ondrop = (e: DragEvent) => {
              e.preventDefault();
              e.stopPropagation();
              const sourceId = draggedOverlayId || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : null);
              itemRow.classList.remove('drag-over-top');
              itemRow.classList.remove('drag-over-bottom');
              if (sourceId && sourceId !== overlay.id) {
                const rect = itemRow.getBoundingClientRect();
                const relY = e.clientY - rect.top;
                let destVisualIdx = revIdx;
                if (relY >= rect.height / 2) {
                  destVisualIdx = revIdx + 1;
                }
                reorderOverlayToVisualIndex(chart, sourceId, destVisualIdx);
              }
            };

            itemRow.onclick = (e) => {
              e.stopPropagation();
              if ((e.target as HTMLElement).closest('button')) {
                return;
              }
              selectedOverlayId = overlay.id;
              listContainer.querySelectorAll('.custom-layer-item-row').forEach((r: any) => {
                if (r.getAttribute('data-overlay-id') === overlay.id) {
                  r.classList.add('selected-layer-row');
                } else {
                  r.classList.remove('selected-layer-row');
                }
              });

              try {
                const activeChart = (window as any).__active_chart_instance__ || chart;
                if (activeChart) {
                  if (activeChart._chartStore) {
                    if (typeof activeChart._chartStore.setClickOverlayInfo === 'function') {
                      const onSel = (o: any) => {
                        if (o && typeof o.onSelected === 'function') {
                          try { o.onSelected({ overlay: o, chart: activeChart }); } catch {}
                        }
                      };
                      const onDesel = (o: any) => {
                        if (o && typeof o.onDeselected === 'function') {
                          try { o.onDeselected({ overlay: o, chart: activeChart }); } catch {}
                        }
                      };
                      try {
                        activeChart._chartStore.setClickOverlayInfo(
                          { overlay: overlay, paneId: 'candle_pane', figureType: null, figure: null, figureIndex: -1 },
                          onSel,
                          onDesel
                        );
                      } catch {}
                    }
                  }
                  if (typeof overlay.onSelected === 'function') {
                    try { overlay.onSelected({ overlay, chart: activeChart }); } catch {}
                  }
                  if (typeof activeChart.updatePane === 'function') {
                    activeChart.updatePane(1);
                  }
                  if (typeof activeChart.invalidate === 'function') {
                    activeChart.invalidate();
                  }
                }
                const allCharts = Array.from((window as any).globalCoreCharts || []);
                allCharts.forEach((c: any) => {
                  if (typeof c.updatePane === 'function') c.updatePane(1);
                  if (typeof c.invalidate === 'function') c.invalidate();
                });
              } catch (err) {}

              dispatchOverlaySettings(overlay);
            };

            if (listContainer.children[revIdx] !== itemRow) {
              listContainer.insertBefore(itemRow, listContainer.children[revIdx] || null);
            }
            existingRows.set(overlay.id, itemRow);
          } else {
            // Re-order only if position is different to avoid touching DOM during hover
            if (listContainer.children[revIdx] !== itemRow) {
              listContainer.insertBefore(itemRow, listContainer.children[revIdx] || null);
            }
          }

          // Update row attributes and child element contents
          itemRow.setAttribute('data-visual-index', `${revIdx}`);
          if (overlay.id === selectedOverlayId) {
            if (!itemRow.classList.contains('selected-layer-row')) {
              itemRow.classList.add('selected-layer-row');
            }
          } else {
            if (itemRow.classList.contains('selected-layer-row')) {
              itemRow.classList.remove('selected-layer-row');
            }
          }

          const nameElem = itemRow.querySelector('.custom-layer-name-span');
          if (nameElem && nameElem.textContent !== displayName) {
            nameElem.textContent = displayName;
          }

          const itemEyeBtn = itemRow.querySelector('.custom-layer-eye-btn') as HTMLButtonElement;
          if (itemEyeBtn) {
            const expectedVisTitle = isVisible ? 'Hide' : 'Show';
            if (itemEyeBtn.title !== expectedVisTitle) {
              itemEyeBtn.title = expectedVisTitle;
              itemEyeBtn.style.color = isVisible ? '#787b86' : '#f23645';
              itemEyeBtn.innerHTML = isVisible ? `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              ` : `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                  <line x1="2" x2="22" y1="2" y2="22"/>
                </svg>
              `;
            }
            itemEyeBtn.onclick = (e) => {
              e.stopPropagation();
              if (typeof chart.overrideOverlay === 'function') {
                chart.overrideOverlay({ id: overlay.id, visible: !isVisible });
              }
              if (typeof chart.updatePane === 'function') chart.updatePane(1);
              if (typeof chart.invalidate === 'function') chart.invalidate();
              rebuildLayersMenu(true);
            };
          }

          const itemLockBtn = itemRow.querySelector('.custom-layer-lock-btn') as HTMLButtonElement;
          if (itemLockBtn) {
            const expectedLockTitle = isLocked ? 'Unlock' : 'Lock';
            if (itemLockBtn.title !== expectedLockTitle) {
              itemLockBtn.title = expectedLockTitle;
              itemLockBtn.style.color = isLocked ? '#f59e0b' : '#787b86';
              itemLockBtn.innerHTML = getSidebarIconSvgString(isLocked ? 'lockBtn' : 'unlockBtn', 15);
            }
            itemLockBtn.onclick = (e) => {
              e.stopPropagation();
              if (typeof chart.overrideOverlay === 'function') {
                chart.overrideOverlay({ id: overlay.id, lock: !isLocked });
              }
              if (typeof chart.invalidate === 'function') chart.invalidate();
              rebuildLayersMenu(true);
            };
          }

          const itemDelBtn = itemRow.querySelector('.custom-layer-del-btn') as HTMLButtonElement;
          if (itemDelBtn) {
            itemDelBtn.onclick = (e) => {
              e.stopPropagation();
              try { chart.removeOverlay({ id: overlay.id }); } catch (err) {}
              if (typeof chart.updatePane === 'function') chart.updatePane(1);
              if (typeof chart.invalidate === 'function') chart.invalidate();
              window.dispatchEvent(new CustomEvent('close-drawing-toolbar', { detail: { overlayId: overlay.id } }));
              rebuildLayersMenu(true);
            };
          }
        });

        lastRenderedSignature = signature;
      };

      const toggleLayersMenu = (e: MouseEvent) => {
        e.stopPropagation();
        const isOpen = layersDropdownMenu.classList.contains('show-menu');
        if (isOpen) {
          layersDropdownMenu.classList.remove('show-menu');
          layersContainer.style.color = '#d1d4dc';
          layersContainer.style.backgroundColor = 'transparent';
          stopLayerLiveUpdates();
        } else {
          rebuildLayersMenu(true);
          const rect = layersContainer.getBoundingClientRect();
          const parentRect = dropdownParent.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          const menuHeight = 480;
          if (spaceBelow < menuHeight && rect.top > spaceBelow) {
            layersDropdownMenu.style.top = `${rect.top - parentRect.top - menuHeight - 4}px`;
          } else {
            layersDropdownMenu.style.top = `${rect.bottom - parentRect.top}px`;
          }
          const menuWidth = 380;
          let leftPos = rect.left - parentRect.left;
          if (leftPos + menuWidth > window.innerWidth - 10) {
            leftPos = Math.max(10, window.innerWidth - menuWidth - 10);
          }
          layersDropdownMenu.style.left = `${leftPos}px`;
          layersDropdownMenu.classList.add('show-menu');
          layersContainer.style.color = '#2962ff';
          layersContainer.style.backgroundColor = 'rgba(41, 98, 255, 0.15)';
          startLayerLiveUpdates();
        }
      };
      layersMainBtn.onclick = toggleLayersMenu;

      const closeLayersDropdown = () => {
        layersDropdownMenu.classList.remove('show-menu');
        layersContainer.style.color = '#d1d4dc';
        layersContainer.style.backgroundColor = 'transparent';
        stopLayerLiveUpdates();
      };
      document.addEventListener('click', closeLayersDropdown);

      // Real-time live update listeners for layer panel
      window.addEventListener('update-layer-panel', () => scheduleRebuildLayersMenu(true));
      window.addEventListener('reorder-drawing-layer', () => scheduleRebuildLayersMenu(true));
      window.addEventListener('tickerpen-draw-end', () => scheduleRebuildLayersMenu(true));

      // Handle layer selection highlight across all overlay types without flickering or rebuilding DOM
      const handleLayerSelectionChange = (e: any) => {
        const overlayId = e?.detail?.overlayId;
        selectedOverlayId = overlayId || null;
        const list = layersDropdownMenu.querySelector('.custom-layers-list-container');
        if (list) {
          list.querySelectorAll('.custom-layer-item-row').forEach((r: any) => {
            if (overlayId && r.getAttribute('data-overlay-id') === overlayId) {
              r.classList.add('selected-layer-row');
            } else {
              r.classList.remove('selected-layer-row');
            }
          });
        }
      };

      [
        'open-drawing-toolbar',
        'open-text-settings',
        'open-fib-settings',
        'open-position-settings',
        'open-pin-flag-settings',
        'open-table-toolbar',
        'open-elliott-toolbar'
      ].forEach(evtName => {
        window.addEventListener(evtName, handleLayerSelectionChange);
      });

      window.addEventListener('close-drawing-toolbar', () => {
        selectedOverlayId = null;
        const list = layersDropdownMenu.querySelector('.custom-layers-list-container');
        if (list) {
          list.querySelectorAll('.custom-layer-item-row').forEach((r: any) => {
            r.classList.remove('selected-layer-row');
          });
        }
      });

      // Re-append right-side buttons in exact order: Layers -> Layout -> Screenshot -> Debug Log -> Fullscreen -> Settings -> Theme Change (far right corner)
      const layoutSelectorContainer = corePeriodBar.querySelector('.custom-layout-dropdown-container') as HTMLElement;
      const screenshotBtn = corePeriodBar.querySelector('.custom-screenshot-btn') as HTMLElement;
      const debugLogBtn = corePeriodBar.querySelector('.custom-debug-log-btn') as HTMLElement;
      const fullscreenBtn = corePeriodBar.querySelector('.custom-fullscreen-btn') as HTMLElement;
      const topSettingsBtn = corePeriodBar.querySelector('.custom-top-settings-btn') as HTMLElement;
      const themeContainer = corePeriodBar.querySelector('.custom-theme-container') as HTMLElement;

      corePeriodBar.appendChild(layersContainer);

      if (layoutSelectorContainer) {
        layoutSelectorContainer.style.marginLeft = '0px';
        layoutSelectorContainer.style.marginRight = '0px';
        corePeriodBar.appendChild(layoutSelectorContainer);
      }
      if (screenshotBtn) {
        screenshotBtn.style.marginLeft = '0px';
        screenshotBtn.style.marginRight = '0px';
        corePeriodBar.appendChild(screenshotBtn);
      }
      if (debugLogBtn) {
        debugLogBtn.style.marginLeft = '0px';
        debugLogBtn.style.marginRight = '0px';
        corePeriodBar.appendChild(debugLogBtn);
      }
      if (fullscreenBtn) {
        fullscreenBtn.style.marginLeft = '0px';
        fullscreenBtn.style.marginRight = '0px';
        corePeriodBar.appendChild(fullscreenBtn);
      }
      if (topSettingsBtn) {
        topSettingsBtn.style.marginLeft = '0px';
        topSettingsBtn.style.marginRight = '0px';
        corePeriodBar.appendChild(topSettingsBtn);
      }
      if (themeContainer) {
        themeContainer.style.marginLeft = '0px';
        themeContainer.style.marginRight = '4px';
        corePeriodBar.appendChild(themeContainer);
      }

      // Chain cleanup for layers dropdown
      const prevCleanup = el.__custom_dropdown_cleanup__;
      el.__custom_dropdown_cleanup__ = () => {
        if (prevCleanup) {
          try { prevCleanup(); } catch (err) { }
        }
        document.removeEventListener('click', closeLayersDropdown);
        if (layersDropdownMenu.parentNode) {
          layersDropdownMenu.parentNode.removeChild(layersDropdownMenu);
        }
        if (layersContainer.parentNode) {
          layersContainer.parentNode.removeChild(layersContainer);
        }
      };

      // Dynamically inject custom settings gear icon at bottom-right corner intersection of axes
      const settingsIcon = document.createElement('div');
      settingsIcon.className = 'custom-chart-settings-icon';
      settingsIcon.style.position = 'absolute';
      settingsIcon.style.bottom = '0';
      const isLeft = styles?.scalesPlacement === 'left';
      settingsIcon.style.left = isLeft ? '0' : 'auto';
      settingsIcon.style.right = isLeft ? 'auto' : '0';
      settingsIcon.style.width = '62px'; // exactly Y-axis width
      settingsIcon.style.height = '39px'; // exactly X-axis height (date scale height)
      settingsIcon.style.padding = '0';
      settingsIcon.style.boxSizing = 'border-box';
      settingsIcon.style.zIndex = '1000';
      settingsIcon.style.display = 'flex';
      settingsIcon.style.alignItems = 'center';
      settingsIcon.style.justifyContent = 'center';
      settingsIcon.style.cursor = 'pointer';
      settingsIcon.style.color = '#868993';
      settingsIcon.style.transition = 'color 0.2s';

      // No border lines around the settings gear container (completely borderless and transparent)
      settingsIcon.style.border = 'none';

      settingsIcon.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 33.136 28.412" style="pointer-events: none;">
          <g id="Setting">
            <path fill-rule="evenodd" clip-rule="evenodd" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-miterlimit="10" d="M22.77,14.206c0,3.426-2.777,6.203-6.203,6.203s-6.203-2.777-6.203-6.203s2.777-6.203,6.203-6.203S22.77,10.78,22.77,14.206z M21.22,14.206c0,2.569-2.083,4.652-4.652,4.652s-4.652-2.083-4.652-4.652s2.083-4.652,4.652-4.652S21.22,11.637,21.22,14.206z"/>
            <path fill-rule="evenodd" clip-rule="evenodd" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-miterlimit="10" d="M8.039,0.25h17.057l7.753,13.956l-7.753,13.956H8.039L0.286,14.206L8.039,0.25z M2.054,14.206L8.97,1.801h15.227l6.9,12.405 l-6.9,12.405H8.97l-6.9-12.405H2.054z"/>
          </g>
        </svg>
      `;

      settingsIcon.onmouseenter = () => {
        settingsIcon.style.color = '#ffffff';
      };
      settingsIcon.onmouseleave = () => {
        settingsIcon.style.color = '#868993';
      };

      settingsIcon.onclick = (e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('open-custom-settings'));
      };

      container.appendChild(settingsIcon);

      // Cleanup function callback inside containerRef closure
      el.__custom_dropdown_cleanup__ = () => {
        document.removeEventListener('click', closeDropdown);
        document.removeEventListener('click', closeChartTypeMenu);
        if (dropdownMenu.parentNode) {
          dropdownMenu.parentNode.removeChild(dropdownMenu);
        }
        if (chartTypeMenu.parentNode) {
          chartTypeMenu.parentNode.removeChild(chartTypeMenu);
        }
        if (chartTypeContainer.parentNode) {
          chartTypeContainer.parentNode.removeChild(chartTypeContainer);
        }
        if (settingsIcon.parentNode) {
          settingsIcon.parentNode.removeChild(settingsIcon);
        }
      };
    }

    // Set up ResizeObserver to resize chart dynamically on container size changes (e.g. sidebar collapse/expand)
    // NOTE: No global window resize dispatch — each chart handles its own resize locally
    // to prevent cross-chart resize cascades in multi-layout mode.
    // Debounced to avoid rapid-fire during layout animations.
    let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      // Save current barSpace before resize — preserve zoom level
      const core = coreChartRef.current;
      let savedBarSpace: number | null = null;
      if (core) {
        try {
          const cs = core._chartStore || (core as any).chartStore;
          const ts = typeof cs?.getTimeScaleStore === 'function' ? cs.getTimeScaleStore() : cs?._timeScaleStore;
          if (ts) savedBarSpace = ts._barSpace;
        } catch (e) { }
      }

      if ((window as any).__addChartLog__) {
        (window as any).__addChartLog__(`[RESIZE OBSERVER] Triggered. clientSize=${container.clientWidth}x${container.clientHeight} savedBarSpace=${savedBarSpace}`);
      }

      // Immediate resize so the chart doesn't visually lag
      if (core && typeof core.resize === 'function') {
        core.resize();
      }

      // Restore barSpace after immediate resize
      if (savedBarSpace !== null && savedBarSpace > 0 && core) {
        try {
          const cs = core._chartStore || (core as any).chartStore;
          const ts = typeof cs?.getTimeScaleStore === 'function' ? cs.getTimeScaleStore() : cs?._timeScaleStore;
          if (ts && ts._barSpace !== savedBarSpace) {
            if (typeof core.setBarSpace === 'function') {
              core.setBarSpace(savedBarSpace);
            }
          }
        } catch (e) { }
      }

      // Debounced Y-axis reset + pane height adjustment (expensive, only needs to run once per resize gesture)
      if (resizeDebounce) clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        const c = coreChartRef.current;
        if (c) {
          resetYAxes();
          adjustPaneHeights(c);
          if (typeof c.resize === 'function') {
            c.resize();
            // Restore barSpace after debounced resize too
            if (savedBarSpace !== null && savedBarSpace > 0) {
              try {
                const cs = c._chartStore || (c as any).chartStore;
                const ts = typeof cs?.getTimeScaleStore === 'function' ? cs.getTimeScaleStore() : cs?._timeScaleStore;
                if (ts && ts._barSpace !== savedBarSpace) {
                  if (typeof c.setBarSpace === 'function') {
                    c.setBarSpace(savedBarSpace);
                  }
                }
              } catch (e) { }
            }
          }
        }
      }, 150);
    });
    observer.observe(container);

    return () => {
      window.removeEventListener('wheel', handleWheelZoom, true);
      if (zoomRafId !== null) cancelAnimationFrame(zoomRafId);
      if (navZoomRafRef.current !== null) cancelAnimationFrame(navZoomRafRef.current);
      clearInterval(dataInterval);
      if (coreChartRef.current) {
        globalCoreCharts.delete(coreChartRef.current);
        if ((window as any).__active_chart_instance__ === coreChartRef.current) {
          const remaining = Array.from(globalCoreCharts).filter((c: any) => {
            try {
              const container = typeof c?.getContainer === 'function' ? c.getContainer() : null;
              return container && document.body.contains(container);
            } catch (e) {
              return false;
            }
          });
          (window as any).__active_chart_instance__ = remaining.length > 0 ? remaining[remaining.length - 1] : null;
        }
      }
      if (futureTimeOverlayCreated) {
        try {
          const coreChart = getCoreChart();
          coreChart?.removeOverlay?.({ id: futureTimeOverlayId });
        } catch (error) {
          // Ignore teardown races.
        }
      }
      observer.disconnect();
      if (el.__custom_dropdown_cleanup__) {
        try {
          el.__custom_dropdown_cleanup__();
        } catch (e) {
          console.warn(e);
        }
        delete el.__custom_dropdown_cleanup__;
      }
      if (container) {
        try {
          dispose(container);
        } catch (e) {
          console.error('Error disposing Ticker Pen Pro:', e);
        }
        container.innerHTML = '';
        delete el.__ticker_pen_pro_initialized__;
      }
      chartInstanceRef.current = null;
    };
  }, [starredPeriods]);

  // ─── Drawing Persistence: Save/Load overlays per symbol via IndexedDB ───
  const drawingSaveTimerRef = useRef<any>(null);
  const lastSavedSymbolRef = useRef<string>(symbol);
  const drawingsLoadedForSymbolRef = useRef<string>('');

  // Debounced save: collect current overlays and persist to IndexedDB
  const debouncedSaveDrawings = () => {
    if (drawingSaveTimerRef.current) clearTimeout(drawingSaveTimerRef.current);
    drawingSaveTimerRef.current = setTimeout(() => {
      try {
        const chart = getCoreChart();
        if (!chart || typeof chart.getOverlays !== 'function') return;
        const sym = lastSavedSymbolRef.current || symbol;
        if (!sym) return;
        const overlays = chart.getOverlays() || [];
        const dataList = typeof chart.getDataList === 'function' ? chart.getDataList() : [];
        // Filter out internal overlays (future-time-scale, zoomInBox, in-progress drawings)
        const userDrawings = overlays.filter((o: any) =>
          o.id && o.name !== 'future-time-scale' && o.name !== 'zoomInBox' && o.name !== 'zoom-in-box' &&
          !(typeof o.isDrawing === 'function' && o.isDrawing())
        );
        saveDrawingsToIndexedDB(sym, userDrawings, dataList);
      } catch (e) {
        console.warn('Drawing save error:', e);
      }
    }, 250);
  };

  // Load saved drawings for the given symbol, remapping dataIndex from timestamps
  const loadDrawingsForSymbol = async (sym: string) => {
    if (!sym) return;
    try {
      const chart = getCoreChart();
      if (!chart || typeof chart.getOverlays !== 'function') return;
      const saved = await getDrawingsFromIndexedDB(sym);
      if (!saved || saved.length === 0) return;

      const dataList = typeof chart.getDataList === 'function' ? chart.getDataList() : [];
      const existingOverlays = chart.getOverlays() || [];
      const existingIds = new Set(existingOverlays.map((o: any) => o.id));

      for (const drawing of saved) {
        try {
          if (drawing.id && existingIds.has(drawing.id)) continue;

          // Remap dataIndex from timestamp using current data
          const remappedPoints = (drawing.points || []).map((p: any) => {
            const newIdx = dataList.length > 0 && p.timestamp > 0
              ? timestampToDataIndex(p.timestamp, dataList)
              : (p.dataIndex ?? 0);
            return {
              dataIndex: newIdx,
              timestamp: p.timestamp,
              value: p.value
            };
          });

          chart.createOverlay({
            id: drawing.id,
            name: drawing.name,
            points: remappedPoints,
            styles: drawing.styles,
            extendData: drawing.extendData,
            lock: drawing.lock,
            visible: drawing.visible,
            mode: drawing.mode,
          });
        } catch (e) {
          console.warn('Failed to restore drawing:', drawing.name, e);
        }
      }
    } catch (e) {
      console.warn('Drawing load error:', e);
    }
  };

  // Effect: listen for draw-end and save-history-state events to trigger saves
  useEffect(() => {
    const handleDrawingSave = () => debouncedSaveDrawings();

    window.addEventListener('tickerpen-draw-end', handleDrawingSave);
    window.addEventListener('save-history-state', handleDrawingSave);
    window.addEventListener('update-layer-panel', handleDrawingSave);

    const handleBeforeUnload = () => {
      try {
        const chart = getCoreChart();
        if (!chart || typeof chart.getOverlays !== 'function') return;
        const sym = lastSavedSymbolRef.current || symbol;
        if (!sym) return;
        const overlays = chart.getOverlays() || [];
        const dataList = typeof chart.getDataList === 'function' ? chart.getDataList() : [];
        const userDrawings = overlays.filter((o: any) =>
          o.id && o.name !== 'future-time-scale' && o.name !== 'zoomInBox' && o.name !== 'zoom-in-box' &&
          !(typeof o.isDrawing === 'function' && o.isDrawing())
        );
        saveDrawingsToIndexedDB(sym, userDrawings, dataList);
      } catch (e) {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('tickerpen-draw-end', handleDrawingSave);
      window.removeEventListener('save-history-state', handleDrawingSave);
      window.removeEventListener('update-layer-panel', handleDrawingSave);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (drawingSaveTimerRef.current) clearTimeout(drawingSaveTimerRef.current);
    };
  }, [symbol]);

  // Effect: save current drawings before symbol change, load drawings for new symbol
  useEffect(() => {
    const currentSym = symbol;
    const prevSym = lastSavedSymbolRef.current;

    // Save drawings for previous symbol before switching
    if (prevSym && prevSym !== currentSym) {
      try {
        const chart = getCoreChart();
        if (chart && typeof chart.getOverlays === 'function') {
          const overlays = chart.getOverlays() || [];
          const dataList = typeof chart.getDataList === 'function' ? chart.getDataList() : [];
          const userDrawings = overlays.filter((o: any) =>
            o.id && o.name !== 'future-time-scale' && o.name !== 'zoomInBox' && o.name !== 'zoom-in-box' &&
            !(typeof o.isDrawing === 'function' && o.isDrawing())
          );
          saveDrawingsToIndexedDB(prevSym, userDrawings, dataList);

          // Clear previous symbol's drawings from chart instance so they do not leak
          for (const o of userDrawings) {
            try {
              chart.removeOverlay({ id: o.id });
            } catch (e) {}
          }
        }
      } catch (e) {}
    }

    lastSavedSymbolRef.current = currentSym;
    drawingsLoadedForSymbolRef.current = '';

    // Load drawings for the new symbol (polling until data is populated)
    let attempts = 0;
    let timerId: any = null;
    const pollLoad = () => {
      const chart = getCoreChart();
      const dataList = chart && typeof chart.getDataList === 'function' ? chart.getDataList() : [];
      if (dataList && dataList.length > 0) {
        if (drawingsLoadedForSymbolRef.current !== currentSym) {
          drawingsLoadedForSymbolRef.current = currentSym;
          loadDrawingsForSymbol(currentSym);
        }
      } else if (attempts < 20) {
        attempts++;
        timerId = setTimeout(pollLoad, 150);
      } else {
        if (drawingsLoadedForSymbolRef.current !== currentSym) {
          drawingsLoadedForSymbolRef.current = currentSym;
          loadDrawingsForSymbol(currentSym);
        }
      }
    };

    timerId = setTimeout(pollLoad, 80);

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [symbol]);

  // Custom high-quality screenshot capture and event listener
  useEffect(() => {
    const handleTriggerScreenshot = async () => {
      const coreChart = getCoreChart();
      if (!coreChart) {
        alert('Chart is not ready yet');
        return;
      }

      // Preserve original pixel ratio
      const originalPixelRatio = window.devicePixelRatio;

      try {
        // Redefine devicePixelRatio to 3 for ultra-crisp/high quality image rendering
        Object.defineProperty(window, 'devicePixelRatio', {
          get: () => 3,
          configurable: true
        });
      } catch (err) {
        console.warn('Failed to upscale devicePixelRatio:', err);
      }

      // Force chart to resize and redraw with 3x scale
      if (typeof coreChart.resize === 'function') {
        coreChart.resize();
      }

      // Give the canvas drawing a moment to draw at 3x resolution
      await new Promise(resolve => setTimeout(resolve, 200));

      let imgUrl = '';
      try {
        // Use PNG format for lossless high quality
        imgUrl = coreChart.getConvertPictureUrl(true, 'png', styles?.bgColor || '#151517');
      } catch (err) {
        console.error('Failed to capture high quality screenshot:', err);
      }

      // Restore original pixel ratio
      try {
        Object.defineProperty(window, 'devicePixelRatio', {
          get: () => originalPixelRatio,
          configurable: true
        });
      } catch (err) {
        console.warn('Failed to restore devicePixelRatio:', err);
      }

      // Resize chart back to normal display pixel ratio
      if (typeof coreChart.resize === 'function') {
        coreChart.resize();
      }

      if (imgUrl) {
        setScreenshotUrl(imgUrl);
        setShowScreenshotModal(true);
      } else {
        alert('Failed to generate screenshot.');
      }
    };

    window.addEventListener('trigger-custom-screenshot', handleTriggerScreenshot);
    return () => {
      window.removeEventListener('trigger-custom-screenshot', handleTriggerScreenshot);
    };
  }, [styles, symbol]);

  // Intercept symbol clicks to open custom React modal (independent of chart mount lifecycle)
  useEffect(() => {
    const handleSymbolClick = (e: MouseEvent) => {
      const target = e.target as Element;
      const symbolBtn = target && typeof target.closest === 'function' ? target.closest('.symbol') : null;
      if (symbolBtn && symbolBtn.closest('.ticker-pen-pro-period-bar')) {
        // Verify that this symbolBtn is contained inside our specific active widget's period bar
        if (isActive && periodBarRef.current && periodBarRef.current.contains(symbolBtn)) {
          e.stopPropagation();
          e.preventDefault();
          setSymbolSearchQuery('');
          setActiveSearchTab('ALL');
          setShowSymbolSearchModal(true);
        }
      }
    };
    document.addEventListener('click', handleSymbolClick, true);
    return () => {
      document.removeEventListener('click', handleSymbolClick, true);
    };
  }, [isActive]);

  // Capture initial state when chart is ready
  useEffect(() => {
    const timer = setTimeout(() => {
      const activeChart = getCoreChart();
      if (activeChart && historyStateRef.current.currentSnapshot === null) {
        historyStateRef.current.currentSnapshot = getDrawingsSnapshot(activeChart);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Listen for mouseup to save history state after drag ends
  useEffect(() => {
    const handleMouseUp = () => {
      setTimeout(() => {
        saveHistoryState();
      }, 50);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isActive]);

  // Listen for save-history-state, trigger-undo, and trigger-redo events
  useEffect(() => {
    const handleSaveHistory = () => saveHistoryState();
    const handleTriggerUndo = () => handleUndo();
    const handleTriggerRedo = () => handleRedo();

    window.addEventListener('save-history-state', handleSaveHistory);
    if (isActive) {
      window.addEventListener('trigger-undo', handleTriggerUndo);
      window.addEventListener('trigger-redo', handleTriggerRedo);
    }
    return () => {
      window.removeEventListener('save-history-state', handleSaveHistory);
      window.removeEventListener('trigger-undo', handleTriggerUndo);
      window.removeEventListener('trigger-redo', handleTriggerRedo);
    };
  }, [isActive]);

  // Listen for starred periods changes from other layout panels
  useEffect(() => {
    const handleStarredPeriodsChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (Array.isArray(detail)) {
        setStarredPeriods(detail);
      }
    };
    window.addEventListener('starred-periods-change', handleStarredPeriodsChange);
    return () => {
      window.removeEventListener('starred-periods-change', handleStarredPeriodsChange);
    };
  }, []);

  // Listen for Trigger Actions (Delete selected overlay, etc.)
  useEffect(() => {
    if (!isActive) return;

    const handleTriggerDeleteSelected = () => {
      const activeChart = getCoreChart();
      if (!activeChart) return;
      if (typeof activeChart.getOverlays === 'function') {
        const overlays = activeChart.getOverlays() || [];
        const selected = overlays.find((o: any) => typeof o.isSelected === 'function' ? o.isSelected() : false);
        if (selected && selected.id) {
          activeChart.removeOverlay({ id: selected.id });
        }
      }
    };

    window.addEventListener('trigger-delete-selected', handleTriggerDeleteSelected);

    return () => {
      window.removeEventListener('trigger-delete-selected', handleTriggerDeleteSelected);
    };
  }, [isActive]);

  // Load recents on mount
  useEffect(() => {
    try {
      const storedRecents = localStorage.getItem('__recent_symbols__');
      if (storedRecents) {
        const parsed = JSON.parse(storedRecents);
        if (Array.isArray(parsed)) setRecentSymbols(parsed);
      }
    } catch (e) {
      console.warn('Failed to load symbols from localStorage:', e);
    }
  }, []);

  // Update Symbol dynamically when prop changes
  useEffect(() => {
    setLogoError(false);
    const chart = chartInstanceRef.current;
    if (chart) {
      const currentSymbol = chart.getSymbol();
      const newSymbolMapped = mapSymbolInfo(symbol);
      if (!currentSymbol || currentSymbol.ticker !== newSymbolMapped.ticker) {
        (async () => {
          const coreChart = getCoreChart();
          const currentPeriod = chart.getPeriod() || getActivePeriodFallback();

          if (datafeedRef.current) {
            try {
              // Fetch fresh history data directly from datafeed
              const freshData = await (datafeedRef.current as any)[String.fromCharCode(103, 101, 116, 72, 105, 115, 116, 111, 114, 121, 75, 76, 105, 110, 101, 68, 97, 116, 97)](newSymbolMapped, currentPeriod, 0, Date.now());

              // Set symbol on the chart
              chart.setSymbol(newSymbolMapped);
              resetYAxes();

              if (coreChart && Array.isArray(freshData) && freshData.length > 0) {
                lastRawDataRef.current = freshData;
                const chartStore = (coreChart as any)._chartStore;
                const timeScaleStore = typeof chartStore?.getTimeScaleStore === 'function'
                  ? chartStore.getTimeScaleStore()
                  : chartStore?._timeScaleStore;
                if (timeScaleStore) {
                  timeScaleStore.__has_more_historical_candles__ = true;
                }
                // Clear stale live price from previous symbol so the Y-axis
                // price label immediately reflects the new symbol's last candle
                // close rather than the old symbol's lingering live price.
                if (chartStore) {
                  chartStore.__latest_live_price__ = undefined;
                  chartStore.__latest_live_data__ = undefined;
                }
                if ((coreChart as any).__latest_live_price__ !== undefined) {
                  (coreChart as any).__latest_live_price__ = undefined;
                  (coreChart as any).__latest_live_data__ = undefined;
                }
                if (typeof coreChart.applyNewData === 'function') {
                  const isHA = chartTypeRef.current === 'heikin_ashi';
                  coreChart.applyNewData(isHA ? transformToHeikinAshi(freshData) : freshData, true);
                }
                // Re-subscribe live streaming data feed
                datafeedRef.current.subscribe(newSymbolMapped, currentPeriod, (tick) => {
                  if (coreChart && typeof coreChart.updateData === 'function') {
                    const isHA = chartTypeRef.current === 'heikin_ashi';
                    const procTick = isHA ? calculateHeikinAshiTick(tick, lastRawDataRef.current) : tick;
                    coreChart.updateData(procTick);
                  }
                });
              }
            } catch (err) {
              console.warn('Failed to update symbol externally:', err);
            }
          }
        })();
      }
    }
  }, [symbol]);

  // Listen to style changes and apply them dynamically
  const prevStylesJsonRef = useRef<string>('');

  useEffect(() => {
    if (chartInstanceRef.current && styles) {
      const currentStylesJson = JSON.stringify({ styles, activeIndicators: activeIndicators?.map(i => i.name) });
      if (prevStylesJsonRef.current === currentStylesJson) {
        return;
      }
      prevStylesJsonRef.current = currentStylesJson;

      (window as any).__custom_date_format__ = styles.scalesDateFormat || "Mon 29 Sep '97";
      (window as any).__custom_date_show_weekday__ = styles.scalesDayOfWeek !== false;
      (window as any).__custom_time_format__ = styles.scalesTimeFormat || '24h';
      if (styles.scalesTimezone) {
        (window as any).__custom_timezone__ = styles.scalesTimezone;
      }

      (window as any).__status_indicator_values__ = styles.statusIndicatorValues !== false;

      const coreChart = getCoreChart();
      if (coreChart) {
        // Function to strip canvas tooltip icons (Eye, Gear, Close) and hide values if setting is off
        const applyTooltipOverrides = () => {
          const hideValues = styles.statusIndicatorValues === false;
          try {
            const indicators = coreChart.getIndicators();
            if (Array.isArray(indicators)) {
              indicators.forEach((ind: any) => {
                if (ind.name === 'VOL OVERLAY') return;
                try {
                  coreChart.overrideIndicator({
                    name: ind.name,
                    paneId: ind.paneId,
                    createTooltipDataSource: () => ({
                      features: [],
                      ...(hideValues ? { values: [] } : {})
                    })
                  });
                } catch (e) { }
              });
            }
          } catch (e) { }
        };

        applyTooltipOverrides();

        if (typeof coreChart.setCustomApi === 'function') {
          coreChart.setCustomApi({
            formatDate: (dateTimeFormat: any, timestamp: number, formatStr: string, type: any) =>
              (utils as any).formatDate(dateTimeFormat, timestamp, formatStr, type)
          });
        }

        // Apply interactive zoom & scroll options
        if (typeof coreChart.setOptions === 'function') {
          coreChart.setOptions({
            zoomEnabled: styles.zoomEnabled !== false,
            scrollEnabled: styles.scrollEnabled !== false
          });
        }

        const vertOpacity = styles.gridVerticalOpacity !== undefined ? styles.gridVerticalOpacity : 0.1;
        const finalVertColor = applyColorOpacity(styles.gridVerticalColor || '#3c4050', vertOpacity);
        const vertStyleMap = GRID_STYLE_MAP[styles.gridVerticalStyle || 'dashed'] || { style: 'dashed', dashedValue: [2, 2] };

        const horizOpacity = styles.gridHorizontalOpacity !== undefined ? styles.gridHorizontalOpacity : 0.1;
        const finalHorizColor = applyColorOpacity(styles.gridHorizontalColor || '#3c4050', horizOpacity);
        const horizStyleMap = GRID_STYLE_MAP[styles.gridHorizontalStyle || 'dashed'] || { style: 'dashed', dashedValue: [2, 2] };

        const crosshairStyleMap = GRID_STYLE_MAP[styles.crosshairStyle || 'solid'] || { style: 'solid', dashedValue: [] };

        coreChart.setStyles({
          indicator: {
            lastValueMark: {
              show: true,
              text: {
                show: true,
                family: 'Rubik, sans-serif',
                textFamily: 'Rubik, sans-serif'
              }
            },
            tooltip: {
              showRule: 'none' as any,
              title: {
                showName: styles.statusIndicatorTitles !== false,
                showParams: !!styles.statusIndicatorInputs,
              },
              features: []
            }
          },
          grid: {
            show: styles.gridShow !== false,
            horizontal: {
              show: styles.gridHorizontalShow !== false,
              color: finalHorizColor,
              style: horizStyleMap.style as any,
              dashedValue: horizStyleMap.dashedValue,
              size: 1
            },
            vertical: {
              show: styles.gridVerticalShow !== false,
              color: finalVertColor,
              style: vertStyleMap.style as any,
              dashedValue: vertStyleMap.dashedValue,
              size: 1
            }
          },
          candle: {
            type: ((chartTypeRef.current === 'line' || chartTypeRef.current === 'area')
              ? 'area'
              : (['candle_solid', 'candle_stroke', 'candle_up_stroke', 'candle_down_stroke', 'ohlc'].includes(chartTypeRef.current)
                ? chartTypeRef.current
                : 'candle_solid')) as any,
            bar: {
              upColor: styles.candleUpColor,
              downColor: styles.candleDownColor,
              upBorderColor: styles.candleUpBorderColor ?? styles.candleUpColor,
              downBorderColor: styles.candleDownBorderColor ?? styles.candleDownColor,
              upWickColor: styles.candleUpWickColor ?? styles.candleUpColor,
              downWickColor: styles.candleDownWickColor ?? styles.candleDownColor,
            },
            priceMark: {
              high: {
                show: styles.scalesHighPrice ?? false,
                family: 'Rubik, sans-serif',
                textFamily: 'Rubik, sans-serif'
              },
              low: {
                show: styles.scalesLowPrice ?? false,
                family: 'Rubik, sans-serif',
                textFamily: 'Rubik, sans-serif'
              },
              last: {
                show: true,
                upColor: '#089981',
                downColor: '#f23645',
                noChangeColor: '#868993',
                text: {
                  show: true,
                  family: 'Rubik, sans-serif',
                  textFamily: 'Rubik, sans-serif'
                }
              }
            },
            area: {
              lineSize: 2,
              lineColor: styles.areaLineColor ?? '#2979ff',
              value: 'close',
              smooth: true,
              backgroundColor: (chartTypeRef.current === 'line'
                ? 'transparent'
                : [
                  { offset: 0, color: applyColorOpacity(styles.areaFillColor ?? '#2979ff', 0.25) },
                  { offset: 1, color: applyColorOpacity(styles.areaFillColor ?? '#2979ff', 0.02) }
                ]) as any,
            },
            tooltip: {
              showRule: 'none' as any
            }
          },
          xAxis: {
            show: true,
            axisLine: {
              show: styles.scaleLineShow !== false,
              size: 1,
              color: applyColorOpacity(styles.scalesLineColor || '#2a2e39', styles.scalesLineOpacity ?? 1.0),
            },
            tickLine: {
              show: true,
              size: 1,
              length: 4,
              color: applyColorOpacity(styles.scalesLineColor || '#2a2e39', styles.scalesLineOpacity ?? 1.0),
            },
            tickText: {
              show: true,
              color: styles.scalesTextColor ?? '#868993',
              size: styles.scalesTextSize ?? 11,
              family: 'Rubik, sans-serif',
              weight: 'normal',
              marginStart: 4,
              marginEnd: 4
            }
          },
          yAxis: {
            type: (styles.scalesPriceScaleType ?? 'normal') as any,
            reverse: !!styles.scalesPriceScaleReverse,
            axisLine: {
              show: styles.scaleLineShow !== false,
              size: 1,
              color: applyColorOpacity(styles.scalesLineColor || '#2a2e39', styles.scalesLineOpacity ?? 1.0),
            },
            tickText: {
              show: true,
              color: styles.scalesTextColor ?? '#868993',
              size: styles.scalesTextSize ?? 11,
              family: 'Rubik, sans-serif',
            }
          },
          scroll: {
            speed: styles.zoomSpeed ?? 2,
            power: (styles.zoomSpeed ?? 2) + 1
          },
          crosshair: {
            show: styles.crosshairShow !== false,
            horizontal: {
              show: styles.crosshairHorizontalShow !== false,
              line: {
                show: styles.crosshairHorizontalShow !== false,
                style: crosshairStyleMap.style as any,
                dashedValue: crosshairStyleMap.dashedValue,
                size: styles.crosshairWidth ?? 1,
                color: applyColorOpacity(styles.crosshairColor || '#2979ff', styles.crosshairOpacity ?? 1.0),
              },
              text: {
                show: styles.crosshairHorizontalShow !== false,
                color: styles.crosshairLabelTextColor ?? '#ffffff',
                size: 11,
                family: 'Rubik, sans-serif',
                backgroundColor: styles.crosshairLabelBgColor ?? '#2a2e39',
                borderRadius: 3,
                paddingLeft: 6,
                paddingRight: 6,
                paddingTop: 4,
                paddingBottom: 4
              }
            },
            vertical: {
              show: styles.crosshairVerticalShow !== false,
              line: {
                show: styles.crosshairVerticalShow !== false,
                style: crosshairStyleMap.style as any,
                dashedValue: crosshairStyleMap.dashedValue,
                size: styles.crosshairWidth ?? 1,
                color: applyColorOpacity(styles.crosshairColor || '#2979ff', styles.crosshairOpacity ?? 1.0),
              },
              text: {
                show: styles.crosshairVerticalShow !== false,
                color: styles.crosshairLabelTextColor ?? '#ffffff',
                size: 11,
                family: 'Rubik, sans-serif',
                backgroundColor: styles.crosshairLabelBgColor ?? '#2a2e39',
                borderRadius: 3,
                paddingLeft: 6,
                paddingRight: 6,
                paddingTop: 4,
                paddingBottom: 4
              }
            }
          }
        });

        // Toggle Profile & Custom Overlays
        if (typeof coreChart.createIndicator === 'function' && typeof coreChart.removeIndicator === 'function') {
          const toggleIndicator = (name: string, active: boolean) => {
            if (active) {
              try { coreChart.createIndicator({ name: name, paneId: 'candle_pane' }, false); } catch (e) { }
            } else {
              try { coreChart.removeIndicator({ paneId: 'candle_pane', name: name }); } catch (e) { }
            }
          };

          toggleIndicator('KAGI_OVERLAY', chartTypeRef.current === 'kagi');
          toggleIndicator('POINT_FIGURE_OVERLAY', chartTypeRef.current === 'point_figure');
          toggleIndicator('BASELINE_OVERLAY', chartTypeRef.current === 'baseline');
          toggleIndicator('VOLUME_PROFILE_OVERLAY', chartTypeRef.current === 'volume_profile');
          toggleIndicator('MARKET_PROFILE_OVERLAY', chartTypeRef.current === 'market_profile');
          toggleIndicator('FOOTPRINT_OVERLAY', chartTypeRef.current === 'footprint');
        }

        // Enforce pane options (margins, scrollZoomEnabled, dragEnabled) via setPaneOptions
        const mTop = styles.marginTop !== undefined ? styles.marginTop : 0;
        const mBottom = styles.marginBottom !== undefined ? styles.marginBottom : 0;
        const mRight = styles.marginRight !== undefined ? styles.marginRight : 10;

        if (mTop !== lastAppliedMarginsRef.current.top || mBottom !== lastAppliedMarginsRef.current.bottom) {
          try {
            // Divide percentage margins (e.g. 10) by 100 to yield decimals (e.g. 0.1) for Ticker Pen percentage scaling
            const topGap = mTop / 100;
            const bottomGap = mBottom / 100;

            // Get all active pane IDs from the chart and apply the gap to each one
            const paneIds = ['candle_pane'];
            const drawPanes = coreChart._drawPanes || [];
            drawPanes.forEach((p: any) => {
              if (p && typeof p.getId === 'function') {
                paneIds.push(p.getId());
              }
            });

            paneIds.forEach((id) => {
              // 1. Set Pane options
              coreChart.setPaneOptions({
                id: id,
                dragEnabled: true,
                axisOptions: {
                  scrollZoomEnabled: true
                }
              });

              // 2. Set Y-axis options (this is where gap/margins are actually processed for scaling!)
              if (typeof coreChart.overrideYAxis === 'function') {
                coreChart.overrideYAxis({
                  paneId: id,
                  gap: {
                    top: topGap,
                    bottom: bottomGap
                  }
                });
              }
            });

            // Force chart layout recalculation and height measurement to apply changes
            if (typeof coreChart.layout === 'function') {
              coreChart.layout({
                measureHeight: true,
                measureWidth: true,
                update: true,
                buildYAxisTick: true,
                forceBuildYAxisTick: true
              });
            }

            lastAppliedMarginsRef.current.top = mTop;
            lastAppliedMarginsRef.current.bottom = mBottom;
          } catch (e) {
            console.warn('Error setting pane options:', e);
          }
        }

        // Apply right margin offset (right bars) whenever it changes
        if (mRight !== lastAppliedMarginsRef.current.right) {
          try {
            const chartStore = typeof coreChart.getChartStore === 'function' ? coreChart.getChartStore() : coreChart._chartStore;
            const timeScaleStore = typeof chartStore?.getTimeScaleStore === 'function' ? chartStore.getTimeScaleStore() : chartStore?._timeScaleStore;
            if (timeScaleStore && typeof timeScaleStore.setLastBarRightSideDiffBarCount === 'function') {
              timeScaleStore.setLastBarRightSideDiffBarCount(mRight);
              if (timeScaleStore._startLastBarRightSideDiffBarCount !== undefined) {
                timeScaleStore._startLastBarRightSideDiffBarCount = mRight;
              }
              coreChart.__user_panned_bar_count__ = undefined;
              coreChart.__user_panned_bar_count_manual__ = undefined;
              if (typeof timeScaleStore._adjustVisibleRange === 'function') {
                timeScaleStore._adjustVisibleRange();
              }
              if (typeof coreChart.layout === 'function') {
                coreChart.layout({ measureWidth: true, update: true, buildYAxisTick: true });
              }
              if (typeof coreChart.updatePane === 'function') {
                coreChart.updatePane(4);
              }
              lastAppliedMarginsRef.current.right = mRight;
            }
          } catch (e) {
            console.warn('Error setting right margin:', e);
          }
        }

        // Update Default Y Axis Scale Type and Reverse Options
        if (typeof coreChart.overrideYAxis === 'function') {
          try {
            const scaleType = styles.scalesPriceScaleType === 'log' ? 'logarithm' : (styles.scalesPriceScaleType || 'normal');
            const position = styles.scalesPlacement === 'left' ? 'left' : 'right';
            coreChart.overrideYAxis({
              paneId: 'candle_pane',
              name: scaleType,
              reverse: !!styles.scalesPriceScaleReverse,
              position: position
            });

            // Also align indicator Y-axes
            const uniquePaneIds = Array.from(
              new Set(
                activeIndicators
                  .map(ind => ind.paneId)
                  .filter(paneId => paneId && paneId !== 'candle_pane')
              )
            );
            uniquePaneIds.forEach(paneId => {
              try {
                coreChart.overrideYAxis({
                  paneId: paneId,
                  position: position
                });
              } catch (e) {
                console.warn(`Error overriding Y axis position for pane ${paneId}:`, e);
              }
            });

            // Force layout recalculation to apply Y-axis position/scale changes immediately
            if (typeof coreChart.layout === 'function') {
              coreChart.layout({
                measureHeight: true,
                measureWidth: true,
                update: true,
                buildYAxisTick: true,
                forceBuildYAxisTick: true
              });
            }
          } catch (e) {
            console.warn('Error overriding default Y axis scale type at runtime:', e);
          }
        }

        // Update Timezone
        if (styles.scalesTimezone && typeof coreChart.setTimezone === 'function') {
          try {
            if (coreChart.getTimezone() !== styles.scalesTimezone) {
              coreChart.setTimezone(styles.scalesTimezone);
            }
          } catch (e) {
            console.warn('Error setting timezone on chart:', e);
          }
        }
        // Force full chart repaint
        if (typeof coreChart.invalidate === 'function') {
          coreChart.invalidate();
        }
      }

      // Update DOM background color
      if (containerRef.current) {
        if (styles.bgType === 'gradient') {
          const topColor = applyColorOpacity(styles.bgColor, styles.bgOpacity ?? 1.0);
          const bottomColor = applyColorOpacity(styles.bgColor2 || styles.bgColor, styles.bgOpacity ?? 1.0);
          containerRef.current.style.background = `linear-gradient(to bottom, ${topColor}, ${bottomColor})`;
        } else {
          containerRef.current.style.background = applyColorOpacity(styles.bgColor, styles.bgOpacity ?? 1.0);
        }
      }

      // Ensure the settings gear container has no borders
      const iconEl = containerRef.current?.querySelector('.custom-chart-settings-icon') as HTMLDivElement | null;
      if (iconEl) {
        iconEl.style.border = 'none';
        if (styles.scalesPlacement === 'left') {
          iconEl.style.left = '0';
          iconEl.style.right = 'auto';
        } else {
          iconEl.style.left = 'auto';
          iconEl.style.right = '0';
        }
      }
    }
  }, [styles, activeIndicators]);



  // Listen to fullscreen changes to trigger chart resize after browser layout transitions settle
  useEffect(() => {
    const handleFullscreenChange = () => {
      // Fire multiple times as the browser animates the fullscreen window
      const triggerResize = () => {
        window.dispatchEvent(new Event('resize'));
      };
      triggerResize();
      setTimeout(triggerResize, 100);
      setTimeout(triggerResize, 200);
      setTimeout(triggerResize, 350);
      setTimeout(triggerResize, 500);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);



  const checkIsMarketOpen = (market: string): boolean => {
    if (!market || market === 'crypto') return true;

    try {
      const estString = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
      const estTime = new Date(estString);
      const estDay = estTime.getDay();
      const estHour = estTime.getHours();
      const estMinute = estTime.getMinutes();

      if (estDay === 0 || estDay === 6) {
        return false;
      }

      if (market === 'stock') {
        const timeInMinutes = estHour * 60 + estMinute;
        return timeInMinutes >= (9 * 60 + 30) && timeInMinutes < (16 * 60);
      }
    } catch (e) {
      const utcDay = new Date().getUTCDay();
      if (utcDay === 0 || utcDay === 6) return false;
    }

    return true;
  };

  // Render the Custom TradingView-Style Status Line
  const renderStatusLine = () => {
    const coreChart = getCoreChart();
    const currentSymbol = coreChart ? coreChart.getSymbol() : null;
    const precision = currentSymbol?.pricePrecision ?? 2;

    const isLightBg = (colorStr?: string) => {
      if (!colorStr) return false;
      const str = colorStr.trim().toLowerCase();
      if (str.startsWith('#')) {
        const hex = str.substring(1);
        let r = 0, g = 0, b = 0;
        if (hex.length === 3) {
          r = parseInt(hex[0] + hex[0], 16);
          g = parseInt(hex[1] + hex[1], 16);
          b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length >= 6) {
          r = parseInt(hex.substring(0, 2), 16);
          g = parseInt(hex.substring(2, 4), 16);
          b = parseInt(hex.substring(4, 6), 16);
        }
        return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
      }
      if (str.startsWith('rgb')) {
        const parts = str.match(/\d+/g);
        if (parts && parts.length >= 3) {
          const r = parseInt(parts[0]);
          const g = parseInt(parts[1]);
          const b = parseInt(parts[2]);
          return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
        }
      }
      return ['white', 'lightgray', 'silver', 'yellow', 'lightblue', '#ffffff', '#f8f9fa', '#eaeaea'].includes(str);
    };

    const isLight = isLightBg(styles?.bgColor);
    const parentTextColor = isLight ? '#474f66' : '#d1d4dc';
    const symbolTextColor = isLight ? '#131722' : '#ffffff';
    const mutedTextColor = isLight ? '#787b86' : '#868993';

    // If status line properties are not provided, define safe defaults
    const statusLine: any = styles || {
      statusLogo: true,
      statusTitle: true,
      statusTitleType: 'symbol_name',
      statusMarketStatus: true,
      statusValues: true,
      statusBarChange: true,
      statusVolume: true,
      statusLastDayChange: true,
      statusIndicatorTitles: true,
      statusIndicatorInputs: false,
      statusIndicatorValues: true,
      statusIndicatorBg: true,
      statusIndicatorBgColor: 'rgba(30, 34, 45, 0.6)'
    };

    if (!activeData) return null;

    const rawO = activeData.open;
    const rawH = activeData.high;
    const rawL = activeData.low;
    const rawC = activeData.close;
    const rawV = activeData.volume;

    const isValidNumber = (val: any): val is number => typeof val === 'number' && !isNaN(val);

    if (!isValidNumber(rawO) || !isValidNumber(rawH) || !isValidNumber(rawL) || !isValidNumber(rawC)) {
      return null;
    }

    const o = rawO;
    const h = rawH;
    const l = rawL;
    const c = rawC;
    const v = isValidNumber(rawV) ? rawV : 0;

    const change = c - o;
    const changePercent = o !== 0 ? (change / o) * 100 : 0;
    const isUp = change >= 0;
    const changeColor = isUp ? '#089981' : '#f23645';

    const getPrevDayClose = () => {
      try {
        const coreChart = getCoreChart();
        if (!coreChart || typeof coreChart.getDataList !== 'function') return null;
        const dataList = coreChart.getDataList();
        if (!dataList || dataList.length === 0) return null;

        const currentIndex = (isActive && lastHoveredIndexRef.current !== null)
          ? lastHoveredIndexRef.current
          : (coreChart && typeof (coreChart as any).__last_hovered_data_index__ === 'number')
            ? (coreChart as any).__last_hovered_data_index__
            : dataList.length - 1;

        if (currentIndex < 0 || currentIndex >= dataList.length) return null;
        const currentCandle = dataList[currentIndex];
        if (!currentCandle || !currentCandle.timestamp) return null;

        const getUTCDayKey = (ts: number) => {
          const d = new Date(ts);
          return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
        };

        const currentDayKey = getUTCDayKey(currentCandle.timestamp);

        for (let i = currentIndex - 1; i >= 0; i--) {
          const item = dataList[i];
          if (item && item.timestamp && isValidNumber(item.close)) {
            if (getUTCDayKey(item.timestamp) !== currentDayKey) {
              return Number(item.close);
            }
          }
        }
        return isValidNumber(dataList[0]?.open) ? Number(dataList[0].open) : null;
      } catch (e) {
        console.warn('Error calculating prev day close:', e);
      }
      return null;
    };

    const prevClose = getPrevDayClose();
    let lastDayChangeText = '';
    let lastDayChangeColor = mutedTextColor;
    if (prevClose !== null && prevClose > 0) {
      const lastDayChange = c - prevClose;
      const lastDayChangePct = (lastDayChange / prevClose) * 100;
      const lastDayIsUp = lastDayChange >= 0;
      lastDayChangeColor = lastDayIsUp ? '#089981' : '#f23645';
      lastDayChangeText = `${lastDayIsUp ? '+' : ''}${lastDayChange.toFixed(precision)} (${lastDayIsUp ? '+' : ''}${lastDayChangePct.toFixed(2)}%)`;
    }

    const formatVol = (val: number) => {
      if (val >= 1000000000) return (val / 1000000000).toFixed(2) + 'B';
      if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
      if (val >= 1000) return (val / 1000).toFixed(2) + 'K';
      return val.toFixed(2);
    };
    const periodText = chartInstanceRef.current?.getPeriod()?.text ?? 'D';

    return (
      <div
        className="custom-chart-top-left-overlay"
        style={{
          position: 'absolute',
          top: '4px',
          left: styles?.scalesPlacement === 'left' ? '70px' : '8px',
          zIndex: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '4px',
          pointerEvents: 'none',
          boxSizing: 'border-box',
          maxWidth: 'calc(100% - 16px)'
        }}
      >
        {/* Main Instrument OHLC Heading */}
        <div
          className="custom-chart-status-line-instrument"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: statusLine.statusIndicatorBg ? statusLine.statusIndicatorBgColor : 'transparent',
            fontFamily: 'var(--font-sans)',
            color: parentTextColor,
            fontSize: '12px',
            fontWeight: 500,
            userSelect: 'none',
            boxSizing: 'border-box',
            pointerEvents: 'none'
          }}
        >
          {(() => {
            const baseSymbol = symbol.toUpperCase().replace('USDT', '').replace('-', '').replace('/', '');
            const logoUrl = `https://assets.coincap.io/assets/icons/${baseSymbol.toLowerCase()}@2x.png`;
            const COIN_NAMES: Record<string, string> = {
              BTC: 'Bitcoin',
              ETH: 'Ethereum',
              SOL: 'Solana',
              BNB: 'Binance Coin',
              XRP: 'Ripple',
              ADA: 'Cardano',
              DOGE: 'Dogecoin',
              DOT: 'Polkadot',
              AVAX: 'Avalanche',
              LINK: 'Chainlink',
              SHIB: 'Shiba Inu',
              PEPE: 'Pepe',
              MATIC: 'Polygon',
              UNI: 'Uniswap'
            };

            const assetFullName = COIN_NAMES[baseSymbol] || getAssetName(baseSymbol);
            let titleText = '';
            if (statusLine.statusTitleType === 'name') {
              titleText = assetFullName;
            } else if (statusLine.statusTitleType === 'symbol') {
              titleText = `${baseSymbol}/USDT`;
            } else {
              titleText = `${baseSymbol}/USDT (${assetFullName})`;
            }

            return (
              <>
                {statusLine.statusLogo && (
                  logoError ? (
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#2979ff',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      flexShrink: 0
                    }}>
                      {baseSymbol.charAt(0)}
                    </div>
                  ) : (
                    <img
                      src={logoUrl}
                      alt={`${baseSymbol} logo`}
                      onError={() => setLogoError(true)}
                      style={{ width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0 }}
                    />
                  )
                )}

                {statusLine.statusTitle && (
                  <span style={{ fontWeight: 600, color: symbolTextColor, fontSize: '14.5px', marginRight: '2px' }}>
                    {titleText}
                  </span>
                )}
              </>
            );
          })()}

          <span style={{ color: mutedTextColor, fontWeight: 500 }}>{periodText}</span>
          <span style={{ color: mutedTextColor, fontSize: '10px', backgroundColor: isLight ? '#f0f3fa' : '#2a2e39', padding: '1px 4px', borderRadius: '2px' }}>Binance</span>

          {statusLine.statusMarketStatus && (() => {
            const marketType = currentSymbol?.market || 'crypto';
            const isOpen = checkIsMarketOpen(marketType);
            const solidColor = isOpen ? '#089981' : '#f23645';
            const lightColor = isOpen ? 'rgba(8, 153, 129, 0.15)' : 'rgba(242, 54, 69, 0.15)';

            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  backgroundColor: lightColor,
                  boxSizing: 'border-box'
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: solidColor
                  }}
                ></span>
              </div>
            );
          })()}

          {statusLine.statusValues && (
            <div style={{ display: 'flex', gap: '8px', marginLeft: '4px' }}>
              <span>O<span style={{ color: changeColor, marginLeft: '2px' }}>{o.toFixed(precision)}</span></span>
              <span>H<span style={{ color: changeColor, marginLeft: '2px' }}>{h.toFixed(precision)}</span></span>
              <span>L<span style={{ color: changeColor, marginLeft: '2px' }}>{l.toFixed(precision)}</span></span>
              <span>C<span style={{ color: changeColor, marginLeft: '2px' }}>{c.toFixed(precision)}</span></span>
            </div>
          )}

          {statusLine.statusBarChange && (
            <span style={{ color: changeColor, marginLeft: '2px' }}>
              {isUp ? '+' : ''}{change.toFixed(precision)} ({isUp ? '+' : ''}{changePercent.toFixed(2)}%)
            </span>
          )}

          {statusLine.statusVolume && (
            <span style={{ marginLeft: '4px' }}>
              Vol <span style={{ color: changeColor }}>{formatVol(v ?? 0)}</span>
            </span>
          )}

          {statusLine.statusLastDayChange && lastDayChangeText && (
            <span style={{ color: lastDayChangeColor, marginLeft: '4px' }}>
              {lastDayChangeText}
            </span>
          )}


        </div>

        {/* Indicator Dropdown Arrow & Indicator Values */}
        {activeIndicators.length > 0 && (
          <div
            className="custom-chart-indicators-legend-list"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              color: '#d1d4dc',
              userSelect: 'none',
              pointerEvents: 'auto',
              width: '100%',
              paddingLeft: '1px'
            }}
          >
            {/* Arrow Dropdown Button */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setIndicatorsExpanded(!indicatorsExpanded);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '25px',
                height: '16px',
                background: statusLine.statusIndicatorBg ? statusLine.statusIndicatorBgColor : 'transparent',
                border: 'none',
                borderRadius: '2px',
                cursor: 'pointer',
                color: '#d1d4dc',
                transition: 'all 0.2s'
              }}
              title={indicatorsExpanded ? "Collapse Indicator Values" : "Show Indicator Values"}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.background = statusLine.statusIndicatorBg ? statusLine.statusIndicatorBgColor : 'rgba(255, 255, 255, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#d1d4dc';
                e.currentTarget.style.background = statusLine.statusIndicatorBg ? statusLine.statusIndicatorBgColor : 'transparent';
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#2979ff"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transition: 'transform 0.2s',
                  transform: indicatorsExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                }}
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>

            {/* Indicator Value Lines (shown when expanded, under the arrow) */}
            {indicatorsExpanded && activeIndicators.map((ind, index) => {
              const coreChart = getCoreChart();
              const dataList = coreChart && typeof coreChart.getDataList === 'function' ? coreChart.getDataList() : [];
              const targetIdx = (lastHoveredIndexRef.current !== null && lastHoveredIndexRef.current >= 0 && lastHoveredIndexRef.current < dataList.length)
                ? lastHoveredIndexRef.current
                : (dataList.length - 1);
              const getNativeIndicatorValues = () => {
                const cc = getCoreChart();
                if (!cc) return [];
                try {
                  const indicators = cc.getIndicators({ paneId: ind.paneId });
                  const nativeInd = Array.isArray(indicators)
                    ? (indicators.find((x: any) => x.id === ind.id) || indicators.find((x: any) => x.name === ind.name) || indicators[0])
                    : indicators;
                  if (!nativeInd || !nativeInd.result) return [];

                  const result = nativeInd.result;
                  const dataIndex = targetIdx;
                  const indData = result[dataIndex] || {};
                  const figures = nativeInd.figures || [];
                  const activePrec = (cc.getSymbol?.()?.pricePrecision) ?? 2;
                  const precision = nativeInd.precision ?? activePrec;

                  const chartStyles = cc.getStyles?.() || {};
                  const defaultIndicatorStyles = chartStyles.indicator || {};

                  const indStyles = nativeInd.styles || {};
                  const circleStyles = indStyles.circles || defaultIndicatorStyles.circles || [];
                  const barStyles = indStyles.bars || defaultIndicatorStyles.bars || [];
                  const lineStyles = indStyles.lines || defaultIndicatorStyles.lines || [];

                  let circleCount = 0;
                  let barCount = 0;
                  let lineCount = 0;

                  const tooltipStyles = chartStyles.indicator?.tooltip || {};
                  const defaultValue = tooltipStyles.defaultValue ?? '-';

                  return figures.map((fig: any, figIdx: number) => {
                    if (!fig || typeof fig.key !== 'string') return null;
                    const val = indData[fig.key];
                    let valText = defaultValue;
                    if (typeof val === 'number') {
                      valText = val.toLocaleString('en-US', {
                        minimumFractionDigits: precision,
                        maximumFractionDigits: precision
                      });
                    }

                    let defaultFigureStyles: any = {};
                    switch (fig.type) {
                      case 'circle': {
                        const styleObj = circleStyles[circleCount % circleStyles.length] || {};
                        defaultFigureStyles = { ...styleObj, color: styleObj.noChangeColor || '#d1d4dc' };
                        circleCount++;
                        break;
                      }
                      case 'bar': {
                        const styleObj = barStyles[barCount % barStyles.length] || {};
                        let color = styleObj.noChangeColor || '#d1d4dc';
                        if (typeof val === 'number') {
                          if (val > 0) color = styleObj.upColor || color;
                          else if (val < 0) color = styleObj.downColor || color;
                        }
                        defaultFigureStyles = { ...styleObj, color };
                        barCount++;
                        break;
                      }
                      case 'line': {
                        const styleObj = lineStyles[lineCount % lineStyles.length] || {};
                        defaultFigureStyles = styleObj;
                        lineCount++;
                        break;
                      }
                    }

                    let ss: any = {};
                    if (typeof fig.styles === 'function') {
                      try {
                        const cbData = {
                          prev: { tickerPenData: dataList[targetIdx - 1], indicatorData: result[targetIdx - 1] },
                          current: { tickerPenData: dataList[targetIdx], indicatorData: result[targetIdx] },
                          next: { tickerPenData: dataList[targetIdx + 1], indicatorData: result[targetIdx + 1] }
                        };
                        ss = fig.styles(cbData, nativeInd, defaultIndicatorStyles) || {};
                      } catch (err) { }
                    }

                    const resolvedColor = ss.color || defaultFigureStyles.color || '#d1d4dc';

                    let label = (fig.title || '').trim();
                    if (label.endsWith(':')) label = label.slice(0, -1).trim();
                    if (label.endsWith('：')) label = label.slice(0, -1).trim();

                    return {
                      label: label,
                      value: valText,
                      color: resolvedColor
                    };
                  }).filter(Boolean);
                } catch (err) {
                  console.error("Failed to get native indicator values:", err);
                  return [];
                }
              };

              let values = getNativeIndicatorValues();
              if (ind.name === 'VOL OVERLAY') {
                const tickerPenDataList = coreChart && typeof coreChart.getDataList === 'function' ? coreChart.getDataList() : [];
                const dataIndex = (targetIdx >= 0 && targetIdx < tickerPenDataList.length) ? targetIdx : (tickerPenDataList.length - 1);
                const k = tickerPenDataList[dataIndex];
                const volume = k ? k.volume : 0;
                let formattedVolume = '-';
                if (typeof volume === 'number') {
                  if (volume >= 1e9) {
                    formattedVolume = (volume / 1e9).toFixed(2) + 'B';
                  } else if (volume >= 1e6) {
                    formattedVolume = (volume / 1e6).toFixed(2) + 'M';
                  } else if (volume >= 1e3) {
                    formattedVolume = (volume / 1e3).toFixed(2) + 'K';
                  } else {
                    formattedVolume = volume.toFixed(0);
                  }
                }
                const color = k ? (k.close >= k.open ? '#089981' : '#f23645') : '#d1d4dc';
                values = [{ label: 'Volume', value: formattedVolume, color }];
              }

              const getLegacyHeading = (n: string) => {
                const u = n.toUpperCase();
                const cc = getCoreChart();
                let nativeInd: any = null;
                if (cc) {
                  try {
                    const indicators = cc.getIndicators({ paneId: ind.paneId });
                    nativeInd = Array.isArray(indicators)
                      ? (indicators.find((x: any) => x.id === ind.id) || indicators.find((x: any) => x.name === ind.name) || indicators[0])
                      : indicators;
                  } catch (e) { }
                }
                const calcParams = nativeInd?.calcParams;
                if (u === 'MA' || u === 'SMA') return (calcParams && calcParams.length > 0) ? `MA(${calcParams.join(',')})` : 'MA(9)';
                if (u === 'EMA') return (calcParams && calcParams.length > 0) ? `EMA(${calcParams.join(',')})` : 'EMA(9)';
                if (u === 'BOLL') return (calcParams && calcParams.length > 0) ? `BOLL(${calcParams.join(',')})` : 'BOLL(20,2)';
                if (u === 'VOL') return `VOL · ${symbol.toUpperCase().replace('USDT', '').replace('-', '').replace('/', '')}`;
                if (u === 'VOL OVERLAY') {
                  const paramVal = (calcParams && calcParams[0] !== undefined) ? calcParams[0] : 0.24;
                  return `VOL OVERLAY(${paramVal}) · ${symbol.toUpperCase().replace('USDT', '').replace('-', '').replace('/', '')}`;
                }
                if (u === 'RSI') return (calcParams && calcParams.length > 0) ? `RSI(${calcParams.join(',')})` : 'RSI(14)';
                if (u === 'MACD') return (calcParams && calcParams.length > 0) ? `MACD(${calcParams.join(',')})` : 'MACD(12,26,9)';
                if (u === 'KDJ') return (calcParams && calcParams.length > 0) ? `KDJ(${calcParams.join(',')})` : 'KDJ(9,3,3)';
                if (u === 'WMA') return (calcParams && calcParams.length > 0) ? `WMA(${calcParams.join(',')})` : 'WMA(9)';
                if (u === 'DEMA') return (calcParams && calcParams.length > 0) ? `DEMA(${calcParams.join(',')})` : 'DEMA(9)';
                if (u === 'TEMA') return (calcParams && calcParams.length > 0) ? `TEMA(${calcParams.join(',')})` : 'TEMA(9)';
                if (u === 'KAMA') return (calcParams && calcParams.length > 0) ? `KAMA(${calcParams.join(',')})` : 'KAMA(10,2,30)';
                if (u === 'MFI') return (calcParams && calcParams.length > 0) ? `MFI(${calcParams.join(',')})` : 'MFI(14)';
                if (u === 'VWAP') return 'VWAP';
                if (u === 'STOCH') return (calcParams && calcParams.length > 0) ? `STOCH(${calcParams.join(',')})` : 'STOCH(14,3,3)';
                if (u === 'STOCHRSI') return (calcParams && calcParams.length > 0) ? `STOCHRSI(${calcParams.join(',')})` : 'STOCHRSI(14,14,3,3)';
                if (u === 'AROON') return (calcParams && calcParams.length > 0) ? `AROON(${calcParams.join(',')})` : 'AROON(25)';
                if (u === 'AROONOSC') return (calcParams && calcParams.length > 0) ? `AROONOSC(${calcParams.join(',')})` : 'AROONOSC(25)';
                if (u === 'CMO') return (calcParams && calcParams.length > 0) ? `CMO(${calcParams.join(',')})` : 'CMO(14)';
                if (u === 'BOP') return 'BOP';
                if (u === 'AD') return 'A/D';
                if (u === 'ADOSC') return (calcParams && calcParams.length > 0) ? `ADOSC(${calcParams.join(',')})` : 'ADOSC(3,10)';
                if (u === 'NATR') return (calcParams && calcParams.length > 0) ? `NATR(${calcParams.join(',')})` : 'NATR(14)';
                if (u === 'STDDEV') return (calcParams && calcParams.length > 0) ? `STDDEV(${calcParams.join(',')})` : 'STDDEV(20)';
                if (u === 'ATR') return (calcParams && calcParams.length > 0) ? `ATR(${calcParams.join(',')})` : 'ATR(14)';
                return n;
              };

              return (
                <div
                  key={ind.id || `${ind.paneId}-${ind.name}`}
                  className="custom-indicator-legend-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 6px',
                    borderRadius: '4px',
                    position: 'relative',
                    cursor: 'pointer',
                    minHeight: '22px',
                    boxSizing: 'border-box',
                    overflow: 'hidden'
                  }}
                >
                  {/* Separate Action Toolbar (Heading, Eye, Settings, Delete) - Shown in front of values on hover */}
                  <div
                    className="indicator-actions custom-indicator-actions-toolbar"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: 'rgba(20, 22, 30, 0.98)',
                      padding: '0 8px',
                      zIndex: 10,
                      borderRight: '1px solid #2a2e39',
                      borderRadius: '4px 0 0 4px'
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#ffffff', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                      {getLegacyHeading(ind.name)}
                    </span>

                    {/* Eye Icon */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const cc = getCoreChart();
                        if (cc) {
                          const newVis = !ind.visible;
                          if (ind.paneId === 'candle_pane') {
                            cc.overrideIndicator({ id: ind.id, name: ind.name, paneId: 'candle_pane', visible: newVis });
                          } else {
                            if (!newVis) {
                              hiddenIndicatorsRef.current.add(`${ind.paneId}-${ind.name}`);
                              cc.removeIndicator({ paneId: ind.paneId, id: ind.id, name: ind.name });
                            } else {
                              hiddenIndicatorsRef.current.delete(`${ind.paneId}-${ind.name}`);
                              cc.createIndicator({ name: ind.name, id: ind.id, paneId: ind.paneId }, true);
                            }
                          }
                          setActiveIndicators(prev => prev.map(x => x.id === ind.id ? { ...x, visible: newVis } : x));
                        }
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        color: ind.visible ? '#868993' : '#646569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '3px',
                        transition: 'color 0.12s'
                      }}
                      title={ind.visible ? "Hide" : "Show"}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = ind.visible ? '#868993' : '#646569'; }}
                    >
                      {ind.visible ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none', display: 'block' }}>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none', display: 'block' }}>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      )}
                    </button>

                    {/* Settings Icon */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const cc = getCoreChart();
                        if (cc) {
                          try {
                            const indicators = cc.getIndicators({ paneId: ind.paneId });
                            const nativeInd = Array.isArray(indicators)
                              ? (indicators.find((x: any) => x.id === ind.id) || indicators.find((x: any) => x.name === ind.name) || indicators[0])
                              : indicators;
                            if (nativeInd) {
                              const calcParams = [...(nativeInd.calcParams || [])];
                              const figures = [...(nativeInd.figures || [])];

                              const chartStyles = cc.getStyles() || {};
                              const defaultIndicatorStyles = chartStyles.indicator || {};
                              const indStyles = nativeInd.styles || {};

                              const lineStyles = indStyles.lines || defaultIndicatorStyles.lines || [];
                              const barStyles = indStyles.bars || defaultIndicatorStyles.bars || [];
                              const circleStyles = indStyles.circles || defaultIndicatorStyles.circles || [];

                              let lineIdx = 0;
                              let barIdx = 0;
                              let circleIdx = 0;

                              const lineStyleObjects: any[] = [];
                              const colors = figures.map((fig: any) => {
                                const fType = fig.type || 'line';
                                if (fType === 'line') {
                                  const styleObj = { ...(lineStyles[lineIdx % lineStyles.length] || {}) };
                                  lineStyleObjects.push({ type: 'line', index: lineIdx, original: styleObj });
                                  lineIdx++;
                                  return styleObj.color || '#2979ff';
                                } else if (fType === 'bar') {
                                  const styleObj = { ...(barStyles[barIdx % barStyles.length] || {}) };
                                  lineStyleObjects.push({ type: 'bar', index: barIdx, original: styleObj });
                                  barIdx++;
                                  return styleObj.color || '#2979ff';
                                } else if (fType === 'circle') {
                                  const styleObj = { ...(circleStyles[circleIdx % circleStyles.length] || {}) };
                                  lineStyleObjects.push({ type: 'circle', index: circleIdx, original: styleObj });
                                  circleIdx++;
                                  return styleObj.color || '#2979ff';
                                }
                                return '#2979ff';
                              });

                              setSettingsTab('inputs');
                              setEditingIndicator({
                                id: ind.id,
                                name: ind.name,
                                paneId: ind.paneId,
                                calcParams,
                                colors,
                                figures,
                                lineStyleObjects
                              });
                            }
                          } catch (err) {
                            console.error("Failed to load indicator settings:", err);
                          }
                        }
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        color: '#868993',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '3px',
                        transition: 'color 0.12s'
                      }}
                      title="Settings"
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#868993'; }}
                    >
                      {(() => {
                        const SettingIcon = sidebarIcons['settingBtn'];
                        return SettingIcon ? (
                          <SettingIcon width={13} height={13} style={{ display: 'block', pointerEvents: 'none' }} />
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none', display: 'block' }}>
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                          </svg>
                        );
                      })()}
                    </button>

                    {/* Delete Icon */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const cc = getCoreChart();
                        if (cc) {
                          hiddenIndicatorsRef.current.delete(`${ind.paneId}-${ind.name}`);
                          cc.removeIndicator({ paneId: ind.paneId, id: ind.id, name: ind.name });
                          setActiveIndicators(prev => prev.filter(x => x.id !== ind.id));
                        }
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        color: '#868993',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '3px',
                        transition: 'color 0.12s'
                      }}
                      title="Delete"
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#f23645'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#868993'; }}
                    >
                      {(() => {
                        const DeleteIcon = sidebarIcons['deleteBtn'];
                        return DeleteIcon ? (
                          <DeleteIcon width={13} height={14.4} strokeWidth={0} style={{ display: 'block', pointerEvents: 'none' }} />
                        ) : (
                          <svg width="13" height="14.4" viewBox="0 0 18 20" fill="currentColor" style={{ display: 'block', pointerEvents: 'none' }}>
                            <path d="M13,3h5v1h-2.01l-1.33,14.64c-0.072,0.773-0.723,1.363-1.5,1.36H4.84c-0.773-0.002-1.418-0.591-1.49-1.36L2.01,4H0V3h5V2c0-1.1,0.9-2,2-2h4c1.105,0,2,0.895,2,2V3z M7,1C6.448,1,6,1.448,6,2v1h6V2c0-0.552-0.448-1-1-1H7z M3.02,4l1.32,14.54c0.021,0.26,0.239,0.461,0.5,0.46h8.33c0.261,0.001,0.479-0.2,0.5-0.46L14.99,4H3.02z"/>
                          </svg>
                        );
                      })()}
                    </button>
                  </div>

                  {/* Indicator Values (always visible under hover panel) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', width: '100%' }}>
                    {values.length > 0 ? (
                      values.map((vItem: any, vIdx: number) => {
                        const displayLabel = vItem.label ? vItem.label.replace(/[:：\s]+$/, '') : '';
                        return (
                          <span key={vIdx} style={{ fontSize: '12px', fontWeight: 500, color: vItem.color, whiteSpace: 'nowrap' }}>
                            {displayLabel ? `${displayLabel}: ` : ''}{vItem.value}
                          </span>
                        );
                      })
                    ) : (
                      <span style={{ color: '#868993', fontSize: '11px', fontStyle: 'italic' }}>No data</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Synchronize active chart instance and widget globally whenever selection status changes
  useEffect(() => {
    if (isActive && chartInstanceRef.current && containerRef.current) {
      let myCoreChart: any = null;
      for (const coreChart of globalCoreCharts) {
        if (coreChart && typeof coreChart.getContainer === 'function') {
          const chartContainer = coreChart.getContainer();
          if (containerRef.current.contains(chartContainer)) {
            myCoreChart = coreChart;
            break;
          }
        }
      }
      if (myCoreChart) {
        myCoreChart.__zoom_history_stack__ = zoomHistoryRef.current;
        (window as any).__active_chart_instance__ = myCoreChart;
        if (typeof myCoreChart.resize === 'function') {
          myCoreChart.resize();
        }
      }
      (window as any).__active_chart_widget__ = chartInstanceRef.current;
      // Expose this widget's zoom history to the bridge (like undo/redo per layout)
      (window as any).__active_zoom_stack__ = zoomHistoryRef.current;
      // Notify SideToolPanel to update zoom count badge for this panel's zoom history
      window.dispatchEvent(new CustomEvent('zoom-history-change', { detail: zoomHistoryRef.current.length }));

      // Sync active chart's period to state immediately
      try {
        const activePeriod = chartInstanceRef.current?.getPeriod();
        if (activePeriod) {
          const parsed = parsePeriod(activePeriod);
          if (parsed) {
            setCurrentPeriod(parsed);
          }
        }
      } catch (e) { }
    }
  }, [isActive]);

  // Manage chart interactions: sync active chart and maintain active cursor mode
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getCanvases = () => container.querySelectorAll('canvas');

    const getEffectiveCursor = () => {
      const mode = (typeof window !== 'undefined' && (window as any).__active_cursor_mode__) || customCursorMode || 'cross';
      if (mode === 'dot' || mode === 'demonstration') return 'none';
      if (mode === 'arrowCursor') return 'default';
      return 'crosshair';
    };

    const handleMouseDown = (_e: MouseEvent) => {
      const activeCoreChart = coreChartRef.current;
      if (activeCoreChart) {
        activeCoreChart.__zoom_history_stack__ = zoomHistoryRef.current;
        (window as any).__active_chart_instance__ = activeCoreChart;
        (window as any).__active_chart_widget__ = chartInstanceRef.current;
        (window as any).__active_zoom_stack__ = zoomHistoryRef.current;
        window.dispatchEvent(new CustomEvent('zoom-history-change', { detail: zoomHistoryRef.current.length }));

        // Sync active chart's period to state immediately
        try {
          const activePeriod = chartInstanceRef.current?.getPeriod();
          if (activePeriod) {
            const parsed = parsePeriod(activePeriod);
            if (parsed) {
              setCurrentPeriod(parsed);
            }
          }
        } catch (err) { }
      }
      const cur = getEffectiveCursor();
      getCanvases().forEach(canvas => {
        (canvas as HTMLElement).style.setProperty('cursor', cur, 'important');
      });
    };

    const handleMouseUp = () => {
      const cur = getEffectiveCursor();
      getCanvases().forEach(canvas => {
        (canvas as HTMLElement).style.setProperty('cursor', cur, 'important');
      });
    };

    const handleMouseEnter = () => {
      const cur = getEffectiveCursor();
      getCanvases().forEach(canvas => {
        (canvas as HTMLElement).style.setProperty('cursor', cur, 'important');
      });
    };

    // Apply the effective cursor initially and on dependencies update
    const timer = setTimeout(() => {
      const cur = getEffectiveCursor();
      getCanvases().forEach(canvas => {
        (canvas as HTMLElement).style.setProperty('cursor', cur, 'important');
      });
    }, 150);

    container.addEventListener('mousedown', handleMouseDown, { capture: true });
    container.addEventListener('mouseup', handleMouseUp, { capture: true });
    container.addEventListener('mouseleave', handleMouseUp, { capture: true });
    container.addEventListener('mouseenter', handleMouseEnter, { capture: true });

    return () => {
      clearTimeout(timer);
      container.removeEventListener('mousedown', handleMouseDown, { capture: true });
      container.removeEventListener('mouseup', handleMouseUp, { capture: true });
      container.removeEventListener('mouseleave', handleMouseUp, { capture: true });
      container.removeEventListener('mouseenter', handleMouseEnter, { capture: true });
    };
  }, [styles?.crosshairShow, customCursorMode]);

  // Update the layout button trigger icon reactively when the layout changes
  useEffect(() => {
    if ((window as any).__addChartLog__) {
      (window as any).__addChartLog__(`[LAYOUT CHANGE] Layout changed to: ${layout}`);
    }
    // Update all layout trigger button icons page-wide to keep them in sync
    const layoutButtons = document.querySelectorAll<HTMLButtonElement>('.custom-layout-main-btn');
    layoutButtons.forEach(button => {
      button.innerHTML = getLayoutIcon(layout || '1');
      button.setAttribute('data-current-layout', layout || '1');
    });

    // Update selected state of option items inside all layout dropdown menus page-wide
    const dropdownMenus = document.querySelectorAll('.custom-layout-dropdown-menu');
    dropdownMenus.forEach(dropdownMenu => {
      dropdownMenu.setAttribute('data-current-layout', layout || '1');
      const isLight = document.documentElement.getAttribute('data-chrome-theme') === 'light';
      const defaultLineColor = isLight ? '#50535e' : '#434651';
      const defaultCellBorder = isLight ? '#50535e' : '#868993';

      const optionItems = dropdownMenu.querySelectorAll('[data-layout-key]');
      optionItems.forEach(item => {
        const optionItem = item as HTMLElement;
        const layKey = optionItem.getAttribute('data-layout-key');
        const isSelected = (layout || '1') === layKey;
        optionItem.classList.toggle('selected', isSelected);
        optionItem.style.borderColor = isSelected ? '#2962ff' : defaultLineColor;
        optionItem.style.backgroundColor = isSelected ? (isLight ? 'rgba(41, 98, 255, 0.12)' : 'rgba(41, 98, 255, 0.15)') : 'transparent';

        const cells = optionItem.querySelectorAll('.layout-cell');
        cells.forEach(cell => {
          const cellElement = cell as HTMLElement;
          cellElement.style.borderColor = isSelected ? '#2962ff' : defaultCellBorder;
          cellElement.style.backgroundColor = isSelected ? '#2962ff' : 'transparent';
        });
      });
    });

  }, [layout]);

  // NOTE: Second ResizeObserver REMOVED. The main ResizeObserver (in the init effect)
  // now handles resetYAxes + adjustPaneHeights + resize with debouncing.
  // Having two observers on the same container caused resize cascades and chart freezes.

  // Track user drag/wheel interactions so live price updates know when user is manually scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let wheelTimer: any = null;

    const handlePointerDown = (e: Event) => {
      if ((window as any).__is_position_dragging__) return;
      const target = (e as any)?.target as HTMLElement | null;
      if (target && target.closest('[class*="tv-position-"], [class*="tv-sl-"], [class*="tv-tp-"], [class*="tv-ep-"], .tv-position-overlay-container')) return;
      (window as any).__is_user_scrolling_chart__ = true;
      setIsChartInteracting(true);
    };

    const handlePointerUp = () => {
      setTimeout(() => {
        (window as any).__is_user_scrolling_chart__ = false;
      }, 400);
      setIsChartInteracting(false);
    };

    const handleWheel = () => {
      (window as any).__is_user_scrolling_chart__ = true;
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        (window as any).__is_user_scrolling_chart__ = false;
      }, 400);
    };

    container.addEventListener('mousedown', handlePointerDown);
    container.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchend', handlePointerUp);
    container.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      container.removeEventListener('mousedown', handlePointerDown);
      container.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchend', handlePointerUp);
      container.removeEventListener('wheel', handleWheel);
      if (wheelTimer) clearTimeout(wheelTimer);
    };
  }, []);

  // Manage visibility of the period bar dynamically based on active status
  useEffect(() => {
    if (periodBarRef.current) {
      if (isActive) {
        periodBarRef.current.style.setProperty('display', 'flex', 'important');
      } else {
        periodBarRef.current.style.setProperty('display', 'none', 'important');
      }
    }
  }, [isActive]);

  // Automatically enforce minimum heights on all sub-indicator panes to prevent them from collapsing
  useEffect(() => {
    const coreChart = coreChartRef.current;
    if (coreChart) {
      const timer = setTimeout(() => {
        adjustPaneHeights(coreChart);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeIndicators, isActive, layout]);

  // Listen to '/' keypress to open symbol search for the active chart
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' || e.keyCode === 191) {
        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.hasAttribute('contenteditable'));
        if (isInput) return;

        e.preventDefault();
        const symbolBtn = periodBarRef.current?.querySelector('.symbol') as HTMLElement;
        if (symbolBtn) {
          symbolBtn.click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive]);

  const scrollAutoTimerRef = useRef<any>(null);
  const scrollHoldTimeoutRef = useRef<any>(null);

  const stopAutoScroll = () => {
    if (scrollHoldTimeoutRef.current) {
      clearTimeout(scrollHoldTimeoutRef.current);
      scrollHoldTimeoutRef.current = null;
    }
    if (scrollAutoTimerRef.current) {
      clearInterval(scrollAutoTimerRef.current);
      scrollAutoTimerRef.current = null;
    }
  };

  const startAutoScroll = (direction: 'left' | 'right') => {
    stopAutoScroll();

    // 1. Move exactly 1 candle immediately on single click
    if (direction === 'left') {
      scrollLeft();
    } else {
      scrollRight();
    }

    // 2. If held down for more than 300ms, start continuous auto-scrolling
    scrollHoldTimeoutRef.current = setTimeout(() => {
      scrollAutoTimerRef.current = setInterval(() => {
        if (direction === 'left') {
          scrollLeft();
        } else {
          scrollRight();
        }
      }, 50);
    }, 300);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => stopAutoScroll();
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
      stopAutoScroll();
    };
  }, []);

  const scrollLeft = () => {
    const coreChart = getCoreChart();
    if (!coreChart) return;
    try {
      const timeScaleStore = coreChart._chartStore.getTimeScaleStore();
      const visibleRange = typeof timeScaleStore.getVisibleRange === 'function' ? timeScaleStore.getVisibleRange() : null;

      // Stop panning left when the creation candle (index 0) reaches the left edge
      if (visibleRange && typeof visibleRange.from === 'number' && visibleRange.from <= 0) {
        stopAutoScroll();
        return;
      }

      // Use the same barCount API that TickerPen uses for native mouse drag.
      // This avoids the desync between _offsetRightDistance and _lastBarRightSideDiffBarCount.
      const currentBarCount = timeScaleStore.getLastBarRightSideDiffBarCount();
      timeScaleStore.setLastBarRightSideDiffBarCount(currentBarCount + 1);

      // Cache barCount per-chart for applyNewData/applyMoreData restore
      coreChart.__user_panned_bar_count__ = currentBarCount + 1;

      // Recalculate visible range and re-render (same as native scroll())
      timeScaleStore._adjustVisibleRange();
      timeScaleStore.setCrosshair(timeScaleStore._crosshair, { notInvalidate: true });
      coreChart.layout({
        measureWidth: true,
        update: true,
        buildYAxisTick: true,
        cacheYAxisWidth: true
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const performRightToLeftZoom = (coreChart: any, isZoomIn: boolean) => {
    if (!coreChart) return;
    const chartStore = coreChart._chartStore || (coreChart as any).chartStore;
    const timeScaleStore = typeof chartStore?.getTimeScaleStore === 'function' ? chartStore.getTimeScaleStore() : chartStore?._timeScaleStore;

    if (!timeScaleStore) return;

    try {
      if (navZoomRafRef.current !== null) {
        cancelAnimationFrame(navZoomRafRef.current);
        navZoomRafRef.current = null;
      }

      // Use TickerPen's internal _totalBarSpace to anchor zoom on the right edge of the visible chart area (right-to-left zoom)
      const totalBarSpace = (timeScaleStore as any)._totalBarSpace || 1000;
      const x = totalBarSpace;

      const startBarSpace = typeof timeScaleStore.getBarSpace === 'function'
        ? (timeScaleStore.getBarSpace().bar || 6)
        : (typeof coreChart.getBarSpace === 'function' ? coreChart.getBarSpace() : 6);

      if (!startBarSpace || startBarSpace <= 0) return;

      const factor = isZoomIn ? 1.10 : (1 / 1.10);
      const targetBarSpace = Math.max(0.05, Math.min(300, startBarSpace * factor));

      const durationMs = 180;
      const startTime = performance.now();
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const frame = (now: number) => {
        try {
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / durationMs);
          const ease = easeOutCubic(progress);

          const currentBarSpace = startBarSpace + (targetBarSpace - startBarSpace) * ease;

          if (typeof timeScaleStore.coordinateToFloatIndex === 'function' && typeof timeScaleStore.setBarSpace === 'function') {
            const floatIndex = timeScaleStore.coordinateToFloatIndex(x);
            timeScaleStore.setBarSpace(currentBarSpace, () => {
              timeScaleStore._lastBarRightSideDiffBarCount += floatIndex - timeScaleStore.coordinateToFloatIndex(x);
            });
          } else if (typeof timeScaleStore.setBarSpace === 'function') {
            timeScaleStore.setBarSpace(currentBarSpace);
          } else if (typeof coreChart.setBarSpace === 'function') {
            coreChart.setBarSpace(currentBarSpace);
          }

          coreChart.__user_panned_bar_count__ = timeScaleStore.getLastBarRightSideDiffBarCount();

          if (typeof timeScaleStore._adjustVisibleRange === 'function') {
            timeScaleStore._adjustVisibleRange();
          }

          if (typeof coreChart.layout === 'function') {
            coreChart.layout({
              measureWidth: false,
              update: true,
              buildYAxisTick: true,
              cacheYAxisWidth: true
            });
          } else if (typeof coreChart.updatePane === 'function') {
            coreChart.updatePane(1);
          }

          resetYAxes();

          if (progress < 1) {
            navZoomRafRef.current = requestAnimationFrame(frame);
          } else {
            navZoomRafRef.current = null;
          }
        } catch (err) {
          navZoomRafRef.current = null;
        }
      };

      navZoomRafRef.current = requestAnimationFrame(frame);
    } catch (e) {
      console.warn(e);
    }
  };

  const zoomOut = () => {
    const coreChart = getCoreChart();
    performRightToLeftZoom(coreChart, false);
  };

  const resetScale = () => {
    const coreChart = getCoreChart();
    if (coreChart) {
      try {
        const timeScaleStore = coreChart._chartStore.getTimeScaleStore();
        coreChart.setBarSpace(6);
        // Reset barCount to settings margin position
        const globalStyles = (typeof window !== 'undefined' ? (window as any).__chart_styles__ : null) || {};
        const defaultBarCount = globalStyles.marginRight !== undefined ? globalStyles.marginRight : 10;
        timeScaleStore.setLastBarRightSideDiffBarCount(defaultBarCount);
        coreChart.__user_panned_bar_count__ = undefined;
        timeScaleStore._adjustVisibleRange();
        coreChart.layout({ measureWidth: true, update: true, buildYAxisTick: true, cacheYAxisWidth: true });
        resetYAxes();
      } catch (e) {
        console.warn(e);
      }
    }
  };

  const zoomIn = () => {
    const coreChart = getCoreChart();
    performRightToLeftZoom(coreChart, true);
  };

  const scrollRight = () => {
    const coreChart = getCoreChart();
    if (!coreChart) return;
    try {
      const timeScaleStore = coreChart._chartStore.getTimeScaleStore();

      // Use the same barCount API that TickerPen uses for native mouse drag.
      const currentBarCount = timeScaleStore.getLastBarRightSideDiffBarCount();
      timeScaleStore.setLastBarRightSideDiffBarCount(currentBarCount - 1);

      // Cache barCount per-chart for applyNewData/applyMoreData restore
      coreChart.__user_panned_bar_count__ = currentBarCount - 1;

      // Recalculate visible range and re-render (same as native scroll())
      timeScaleStore._adjustVisibleRange();
      timeScaleStore.setCrosshair(timeScaleStore._crosshair, { notInvalidate: true });
      coreChart.layout({
        measureWidth: true,
        update: true,
        buildYAxisTick: true,
        cacheYAxisWidth: true
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const renderWatermark = () => {
    if (styles?.watermarkType === 'none') return null;

    const baseSymbol = symbol.toUpperCase().replace('USDT', '').replace('-', '').replace('/', '');
    const periodText = chartInstanceRef.current?.getPeriod()?.text ?? 'D';

    const firstLineParts: string[] = [];
    if (styles?.watermarkShowTicker !== false) {
      firstLineParts.push(`${baseSymbol}/USDT`);
    }
    if (styles?.watermarkShowInterval !== false) {
      firstLineParts.push(periodText);
    }

    const secondLineParts: string[] = [];
    if (styles?.watermarkShowDescription !== false) {
      secondLineParts.push(getAssetName(baseSymbol));
    }
    if (styles?.watermarkShowReplay !== false) {
      secondLineParts.push("REPLAY");
    }

    const firstLine = firstLineParts.join(', ');
    const secondLine = secondLineParts.join(', ');

    if (!firstLine && !secondLine) return null;
    const color = applyColorOpacity(styles?.watermarkColor || '#ffffff', styles?.watermarkOpacity ?? 0.04);

    return (
      <div
        className="custom-chart-watermark"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 0,
          textAlign: 'center',
          fontFamily: 'var(--font-sans)',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          letterSpacing: '-0.02em',
          textTransform: 'uppercase',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
      >
        {firstLine && (
          <div style={{ fontSize: '4.5rem', fontWeight: 800, color: color, lineHeight: 1.1 }}>
            {firstLine}
          </div>
        )}
        {secondLine && (
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: color, lineHeight: 1.1 }}>
            {secondLine}
          </div>
        )}
      </div>
    );
  };

  const [isControlBarHovered, setIsControlBarHovered] = useState(false);
  const [activeDrawingTool, setActiveDrawingTool] = useState<string>('cross');
  const [isChartInteracting, setIsChartInteracting] = useState<boolean>(false);

  useEffect(() => {
    const handleToolChange = (e: Event) => {
      const tool = (e as CustomEvent).detail?.tool || 'cross';
      setActiveDrawingTool(tool);
    };
    window.addEventListener('tickerpen-tool-change', handleToolChange);
    return () => {
      window.removeEventListener('tickerpen-tool-change', handleToolChange);
    };
  }, []);

  // ─── Currency Conversion Dropdown ───
  const handleCurrencyChange = async (code: string) => {
    setShowCurrencyDropdown(false);
    setSelectedCurrency(code);

    if (code === 'NATIVE') {
      // Reset to native (no conversion)
      (window as any).__currency_conversion_rate__ = 1;
      (window as any).__currency_symbol__ = '';
      (window as any).__currency_code__ = 'NATIVE';
    } else {
      const rates = await fetchConversionRates();
      const rate = rates[code] ?? 1;

      // Check if it already exists in state
      let opt = currencyOptions.find(o => o.code === code);
      if (!opt) {
        // Build new currency option
        const symbol = CURRENCY_SYMBOLS[code] || '';
        opt = { code, symbol, label: code };
        setCurrencyOptions(prev => {
          if (prev.some(o => o.code === code)) return prev;
          return [...prev, opt!];
        });
      }

      (window as any).__currency_conversion_rate__ = rate;
      (window as any).__currency_symbol__ = opt?.symbol || '';
      (window as any).__currency_code__ = code;
    }

    // Force chart repaint to apply new conversion
    const coreChart = getCoreChart();
    if (coreChart) {
      if (typeof coreChart.resize === 'function') coreChart.resize();
      resetYAxes();
    }
  };

  // ─── Custom Screenshot Modal & Options ───
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  const handleCopyScreenshot = async () => {
    if (!screenshotUrl) return;
    try {
      const response = await fetch(screenshotUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      showToast('✓ Screenshot copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      showToast('❌ Clipboard copy failed.');
    }
  };

  const handleSaveScreenshot = () => {
    if (!screenshotUrl) return;
    try {
      const link = document.createElement('a');
      link.href = screenshotUrl;
      link.download = `Chart-${symbol.toUpperCase()}-${new Date().toISOString().split('T')[0]}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('✓ Screenshot saved successfully!');
    } catch (err) {
      console.error('Failed to save image:', err);
      showToast('❌ Failed to save screenshot.');
    }
  };

  // ─── Custom Advanced Symbol Search Modal ───
  const handleSelectSymbol = (selectedSymbol: SymbolInfo) => {
    // Add to recents
    const updated = [
      selectedSymbol,
      ...recentSymbols.filter(s => s.ticker !== selectedSymbol.ticker)
    ].slice(0, 10);
    setRecentSymbols(updated);
    try {
      localStorage.setItem('__recent_symbols__', JSON.stringify(updated));
    } catch (e) { }

    if (onSymbolChange) {
      onSymbolChange(selectedSymbol.ticker);
    }
    if (chartInstanceRef.current) {
      chartInstanceRef.current.setSymbol(selectedSymbol);
      resetYAxes();
    }
    setShowSymbolSearchModal(false);
  };

  const renderSymbolSearchModal = () => {
    if (!showSymbolSearchModal) return null;

    // Get filter list based on active category
    let list: SymbolInfo[] = [];
    if (activeSearchTab === 'CRYPTO') {
      list = (cachedBinanceSymbols && cachedBinanceSymbols.length > 0)
        ? cachedBinanceSymbols
        : DEFAULT_SYMBOLS.filter(item => item.market === 'crypto');
    } else if (activeSearchTab === 'FOREX') {
      list = DEFAULT_SYMBOLS.filter(item => item.market === 'forex' || item.exchange === 'FOREX');
    } else if (activeSearchTab === 'STOCK') {
      list = DEFAULT_SYMBOLS.filter(item => item.market === 'stock' || item.exchange === 'NASDAQ');
    } else if (activeSearchTab === 'COMMODITY') {
      list = DEFAULT_SYMBOLS.filter(item => item.market === 'commodity' || item.exchange === 'COMEX' || item.exchange === 'NYMEX');
    } else if (activeSearchTab === 'INDICES') {
      list = DEFAULT_SYMBOLS.filter(item => item.market === 'indices' || item.exchange === 'INDEX');
    } else {
      // ALL tab
      const nonCrypto = DEFAULT_SYMBOLS.filter(item => item.market !== 'crypto');
      const crypto = (cachedBinanceSymbols && cachedBinanceSymbols.length > 0)
        ? cachedBinanceSymbols
        : DEFAULT_SYMBOLS.filter(i => i.market === 'crypto');
      list = [...crypto.slice(0, 30), ...nonCrypto];
    }

    // Apply search filter
    if (symbolSearchQuery) {
      const q = symbolSearchQuery.toLowerCase().trim();
      list = list.filter(item =>
        item.ticker.toLowerCase().includes(q) ||
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.shortName && item.shortName.toLowerCase().includes(q))
      );
    }

    const itemsToShow = list.slice(0, 50);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSearchIndex(prev => Math.min(prev + 1, itemsToShow.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSearchIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (itemsToShow[selectedSearchIndex]) {
          handleSelectSymbol(itemsToShow[selectedSearchIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSymbolSearchModal(false);
      }
    };

    const symbolModalPos = modalPosMap['symbolSearchModal'] || {
      x: Math.max(10, Math.round(window.innerWidth / 2 - 320)),
      y: Math.max(10, Math.round(window.innerHeight / 2 - 310))
    };

    return createPortal(
      <div
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(10, 12, 22, 0.4)',
          backdropFilter: 'blur(10px)',
          zIndex: 99999,
          fontFamily: 'var(--font-sans)',
        }}
        onClick={() => setShowSymbolSearchModal(false)}
      >
        <div
          style={{
            position: 'fixed',
            left: `${symbolModalPos.x}px`,
            top: `${symbolModalPos.y}px`,
            background: 'rgba(24, 26, 38, 0.96)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            width: '640px',
            maxWidth: '92vw',
            height: '80vh',
            maxHeight: '620px',
            padding: '0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Search Input Area */}
          <div
            onMouseDown={(e) => handleModalHeaderMouseDown('symbolSearchModal', e, 640, 620)}
            style={{
              padding: '20px 20px 12px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              cursor: 'move',
              userSelect: 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#ffffff', fontSize: '15px', fontWeight: 600 }}>Symbol Search</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowMarketConnectionModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: 'rgba(41, 98, 255, 0.15)',
                    border: '1px solid rgba(41, 98, 255, 0.35)',
                    color: '#2962ff',
                    padding: '3px 10px',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  title="Configure separate market connections or unified API"
                >
                  ⚡ Feeds & Webhooks
                </button>
                <span style={{ color: '#929aa5', fontSize: '11px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>ESC to Close</span>
              </div>
            </div>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#929aa5"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ position: 'absolute', left: '12px' }}
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                autoFocus
                type="text"
                placeholder="Search ticker, asset name, or market..."
                value={symbolSearchQuery}
                onChange={e => {
                  setSymbolSearchQuery(e.target.value);
                  setSelectedSearchIndex(0);
                }}
                onKeyDown={handleKeyDown}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '12px 16px 12px 40px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'all 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(33, 150, 243, 0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'}
              />
              {symbolSearchQuery && (
                <button
                  onClick={() => setSymbolSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#929aa5',
                    fontSize: '18px',
                    cursor: 'pointer',
                    padding: '0',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  &times;
                </button>
              )}
            </div>
          </div>

          {/* Filter Tabs */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 20px',
              background: 'rgba(0,0,0,0.1)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
            }}
          >
            {(['ALL', 'CRYPTO', 'FOREX', 'STOCK', 'COMMODITY', 'INDICES'] as const).map(tab => {
              const active = activeSearchTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveSearchTab(tab);
                    setSelectedSearchIndex(0);
                  }}
                  style={{
                    background: active ? 'rgba(33, 150, 243, 0.12)' : 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    color: active ? '#2196F3' : '#929aa5',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab}
                </button>
              );
            })}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setShowMarketConnectionModal(true)}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  color: '#929aa5',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>{marketDatafeedManager.getMode() === 'separate' ? '⚡ Separate Feeds' : '🌐 Unified Gateway'}</span>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#089981' }} />
              </button>
            </div>
          </div>

          {/* Search Result List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '10px 0',
            }}
          >
            {itemsToShow.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#929aa5',
                  gap: '12px',
                  padding: '40px',
                  textAlign: 'center',
                }}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <span style={{ fontSize: '13px' }}>No symbols match your search.</span>
              </div>
            ) : (
              itemsToShow.map((item, index) => {
                const isCurrentActive = symbol && typeof symbol === 'string' && symbol.toUpperCase().replace('-', '').replace('/', '') === item.ticker.toUpperCase();
                const isSelected = index === selectedSearchIndex;
                return (
                  <div
                    key={item.ticker + '-' + index}
                    onClick={() => handleSelectSymbol(item)}
                    onMouseEnter={() => setSelectedSearchIndex(index)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 20px',
                      background: isSelected ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                      borderLeft: isSelected ? '3px solid #2196F3' : '3px solid transparent',
                    }}
                  >
                    {/* Left side info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {item.logo && !logoLoadErrors[item.ticker] ? (
                        <img
                          src={item.logo}
                          alt=""
                          onError={() => {
                            setLogoLoadErrors(prev => ({ ...prev, [item.ticker]: true }));
                          }}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            display: 'block',
                            flexShrink: 0
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.04)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxSizing: 'border-box',
                            flexShrink: 0
                          }}
                        >
                          <span style={{ fontSize: '9px', fontWeight: 600, color: '#929aa5', textTransform: 'uppercase' }}>
                            {item.ticker.slice(0, 2)}
                          </span>
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: isCurrentActive ? '#2196F3' : '#ffffff', fontSize: '13px', fontWeight: 600 }}>
                            {item.ticker}
                          </span>
                          {isCurrentActive && (
                            <span style={{ color: '#2196F3', fontSize: '10px', background: 'rgba(33, 150, 243, 0.12)', padding: '1px 4px', borderRadius: '4px', fontWeight: 500 }}>Active</span>
                          )}
                        </div>
                        <span style={{ color: '#929aa5', fontSize: '11px' }}>
                          {item.name || item.shortName}
                        </span>
                      </div>
                    </div>

                    {/* Right side badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          color: '#ffb11a',
                          background: 'rgba(255, 177, 26, 0.08)',
                          border: '1px solid rgba(255, 177, 26, 0.15)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {item.exchange}
                      </span>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          color: '#2196F3',
                          background: 'rgba(33, 150, 243, 0.08)',
                          border: '1px solid rgba(33, 150, 243, 0.15)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {item.market || 'crypto'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderScreenshotModal = () => {
    if (!showScreenshotModal || !screenshotUrl) return null;

    const screenshotModalPos = modalPosMap['screenshotModal'] || {
      x: Math.max(10, Math.round(window.innerWidth / 2 - 390)),
      y: Math.max(10, Math.round(window.innerHeight / 2 - 250))
    };

    return createPortal(
      <div
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(10, 12, 22, 0.4)',
          backdropFilter: 'blur(10px)',
          zIndex: 99999,
          fontFamily: 'var(--font-sans)',
        }}
      >
        <div
          style={{
            position: 'fixed',
            left: `${screenshotModalPos.x}px`,
            top: `${screenshotModalPos.y}px`,
            background: 'rgba(24, 26, 38, 0.96)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            width: '780px',
            maxWidth: '92vw',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Header */}
          <div
            onMouseDown={(e) => handleModalHeaderMouseDown('screenshotModal', e, 780, 500)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'move', userSelect: 'none' }}
          >
            <div>
              <h3 style={{ margin: 0, color: '#ffffff', fontSize: '16px', fontWeight: 600, letterSpacing: '-0.01em' }}>
                Chart Screenshot Captured
              </h3>
              <p style={{ margin: '2px 0 0', color: '#929aa5', fontSize: '11px' }}>
                Ultra high-quality export ({symbol.toUpperCase()})
              </p>
            </div>
            <button
              onClick={() => setShowScreenshotModal(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#929aa5',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#929aa5';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* Image Container / Preview */}
          <div
            style={{
              background: '#0d0e15',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '12px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxHeight: '44vh',
              padding: '12px',
              boxSizing: 'border-box',
              boxShadow: 'inset 0 0 20px rgba(0,0,0,0.6)',
              position: 'relative',
            }}
          >
            <img
              src={screenshotUrl}
              alt="High Quality Chart Screenshot"
              style={{
                maxWidth: '100%',
                maxHeight: '40vh',
                objectFit: 'contain',
                display: 'block',
                borderRadius: '6px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            />
          </div>

          {/* Buttons/Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '4px' }}>
            <button
              onClick={() => setShowScreenshotModal(false)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                color: '#d1d4dc',
                padding: '10px 20px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
              }}
            >
              Cancel
            </button>

            <button
              onClick={handleCopyScreenshot}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                color: '#ffffff',
                padding: '10px 20px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy to Clipboard
            </button>

            <button
              onClick={handleSaveScreenshot}
              style={{
                background: '#2196F3',
                border: 'none',
                borderRadius: '8px',
                color: '#ffffff',
                padding: '10px 24px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s',
                boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#1e88e5';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(33, 150, 243, 0.45)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#2196F3';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.3)';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Save Image
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderToast = () => {
    if (!toastMessage) return null;
    return (
      <div
        style={{
          position: 'fixed',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(28, 30, 43, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px',
          padding: '12px 24px',
          color: '#ffffff',
          fontSize: '13px',
          fontWeight: 600,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <span>{toastMessage}</span>
      </div>
    );
  };
  const currencyBtnRef = useRef<HTMLButtonElement>(null);

  const renderCurrencyDropdown = () => {
    if (styles?.scalesCurrencyUnit === 'hidden') return null;
    if (!yAxisContainer) return null;

    const currOpt = CURRENCY_OPTIONS.find(o => o.code === selectedCurrency);
    const displayLabel = currOpt?.code === 'NATIVE' ? 'NAT' : currOpt?.code || 'NAT';

    // Button portaled into Y-axis container
    const buttonPortal = createPortal(
      <div
        className="custom-currency-dropdown"
        style={{
          position: 'absolute',
          top: '4px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          userSelect: 'none',
        }}
      >
        <button
          ref={currencyBtnRef}
          onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
          title="Change display currency"
          style={{
            background: showCurrencyDropdown ? 'rgba(255,255,255,0.12)' : 'rgba(20, 24, 38, 0.85)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '4px',
            color: selectedCurrency === 'NATIVE' ? '#868993' : '#2196F3',
            cursor: 'pointer',
            padding: '1px 4px',
            fontSize: '10px',
            fontWeight: 700,
            fontFamily: 'var(--font-sans)',
            letterSpacing: '0.03em',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
          }}
          onMouseLeave={(e) => {
            if (!showCurrencyDropdown) {
              e.currentTarget.style.background = 'rgba(20, 24, 38, 0.85)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
            }
          }}
        >
          <span>{displayLabel}</span>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>,
      yAxisContainer
    );

    // Dropdown menu portaled to document.body (fixed position) to avoid Y-axis overflow clipping
    let menuPortal = null;
    if (showCurrencyDropdown) {
      const btnRect = currencyBtnRef.current?.getBoundingClientRect();
      const menuRight = btnRect ? window.innerWidth - btnRect.right : 10;
      const availableCodes = Object.keys((window as any).__currency_rates__ || {});
      const filteredOptions = currencySearchQuery.trim() === ''
        ? currencyOptions
        : availableCodes
          .filter(code => code.toLowerCase().includes(currencySearchQuery.toLowerCase()) && code !== 'NATIVE')
          .map(code => {
            const symbol = CURRENCY_SYMBOLS[code] || '';
            const existing = currencyOptions.find(o => o.code === code);
            return {
              code,
              symbol,
              label: existing?.label || code
            };
          });

      const estHeight = Math.min(340, filteredOptions.length * 28 + 48);
      const currencyOpenUp = btnRect && (window.innerHeight - btnRect.bottom < estHeight) && (btnRect.top > estHeight);
      const menuTop = btnRect ? (currencyOpenUp ? btnRect.top - estHeight - 4 : btnRect.bottom + 4) : 80;

      menuPortal = createPortal(
        <>
          {/* Invisible backdrop */}
          <div
            onClick={() => {
              setShowCurrencyDropdown(false);
              setCurrencySearchQuery('');
            }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 9998,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: menuTop,
              ...(styles?.scalesPlacement === 'left'
                ? { left: btnRect ? btnRect.left : 10 }
                : { right: menuRight }),
              background: 'rgba(24, 28, 41, 0.98)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              padding: '6px 0',
              zIndex: 9999,
              minWidth: '200px',
              maxHeight: '340px',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
            }}
          >
            {/* Search Input Box */}
            <div style={{ padding: '4px 10px 8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <input
                type="text"
                placeholder="Search currency..."
                value={currencySearchQuery}
                onChange={(e) => setCurrencySearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(20, 24, 38, 0.6)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '4px',
                  color: '#ffffff',
                  padding: '5px 8px',
                  fontSize: '11px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'var(--font-sans)',
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#2196F3';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                }}
              />
            </div>

            {/* Scrollable list */}
            <div
              style={{
                overflowY: 'auto',
                flex: 1,
                maxHeight: '260px',
                padding: '2px 0'
              }}
            >
              {filteredOptions.length === 0 ? (
                <div style={{ padding: '16px', fontSize: '11px', color: '#868993', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
                  No currencies found
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isActive = opt.code === selectedCurrency;
                  return (
                    <button
                      key={opt.code}
                      onClick={() => {
                        handleCurrencyChange(opt.code);
                        setCurrencySearchQuery('');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '7px 12px',
                        background: isActive ? 'rgba(33, 150, 243, 0.12)' : 'transparent',
                        border: 'none',
                        color: isActive ? '#2196F3' : '#d1d4dc',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontFamily: 'var(--font-sans)',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                          e.currentTarget.style.color = '#ffffff';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isActive ? 'rgba(33, 150, 243, 0.12)' : 'transparent';
                        e.currentTarget.style.color = isActive ? '#2196F3' : '#d1d4dc';
                      }}
                    >
                      <span style={{ fontWeight: isActive ? 600 : 400 }}>
                        {opt.code === 'NATIVE' ? 'NAT — Native (pair default)' : `${opt.code} — ${opt.label}`}
                      </span>
                      {isActive && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2196F3" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>,
        document.body
      );
    }

    return (
      <>
        {buttonPortal}
        {menuPortal}
      </>
    );
  };

  const renderFloatingControls = () => {
    const navVis = styles?.navigationVisibility ?? 'hover';
    if (navVis === 'hidden') return null;

    const isDrawingTool = activeDrawingTool && !['cross', 'dot', 'arrowCursor', 'demonstration', 'crosshair', 'default', 'pointer'].includes(activeDrawingTool);
    if (isChartInteracting || isDrawingTool) {
      return null;
    }

    const opacityVal = navVis === 'always' ? 1 : (isControlBarHovered ? 1 : 0);

    return (
      <div
        className="custom-chart-floating-controls-wrapper"
        onMouseEnter={() => setIsControlBarHovered(true)}
        onMouseLeave={() => setIsControlBarHovered(false)}
        style={{
          position: 'absolute',
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '16px 24px',
          zIndex: 100,
          pointerEvents: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <div
          className="custom-chart-floating-controls"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'rgba(20, 24, 38, 0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '6px',
            padding: '4px 8px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            userSelect: 'none',
            opacity: opacityVal,
            pointerEvents: opacityVal > 0 ? 'auto' : 'none',
            transition: 'opacity 0.2s ease-in-out, background-color 0.2s ease-in-out, border-color 0.2s ease-in-out'
          }}
        >
          {/* Zoom Out (-) */}
          <button
            onClick={zoomOut}
            title="Zoom Out"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#868993',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#868993'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>

          {/* Zoom In (+) */}
          <button
            onClick={zoomIn}
            title="Zoom In"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#868993',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#868993'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>

          {/* Scroll Left (<) */}
          <button
            onMouseDown={(e) => { if (e.button !== 0) return; e.preventDefault(); startAutoScroll('left'); }}
            onMouseUp={(e) => { e.preventDefault(); stopAutoScroll(); }}
            onTouchStart={(e) => { e.preventDefault(); startAutoScroll('left'); }}
            onTouchEnd={(e) => { e.preventDefault(); stopAutoScroll(); }}
            title="Scroll Left (1 candle, hold to auto-scroll)"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#868993',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={(e) => { stopAutoScroll(); e.currentTarget.style.color = '#868993'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>

          {/* Scroll Right (>) */}
          <button
            onMouseDown={(e) => { if (e.button !== 0) return; e.preventDefault(); startAutoScroll('right'); }}
            onMouseUp={(e) => { e.preventDefault(); stopAutoScroll(); }}
            onTouchStart={(e) => { e.preventDefault(); startAutoScroll('right'); }}
            onTouchEnd={(e) => { e.preventDefault(); stopAutoScroll(); }}
            title="Scroll Right (1 candle, hold to auto-scroll)"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#868993',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={(e) => { stopAutoScroll(); e.currentTarget.style.color = '#868993'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>

          {/* Reset Scale (Auto Fit) Icon Button */}
          <button
            onClick={resetScale}
            title="Reset Scale / Auto Fit"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#2979ff',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = '#2979ff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#2979ff'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          {/* Divider line */}
          <div style={{ width: '1px', height: '14px', backgroundColor: 'rgba(255, 255, 255, 0.15)', margin: '0 2px' }} />

          {/* Refresh Chart Data Button */}
          <button
            onClick={handleRefreshChart}
            title="Refresh Chart Data"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#868993',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#868993'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: isRefreshing ? 'rotate(360deg)' : 'rotate(0deg)',
                transition: isRefreshing ? 'transform 0.6s ease-in-out' : 'none'
              }}
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6" />
              <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M2.5 16l1.2 0.8A10 10 0 0 0 22 12.5" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  const renderIndicatorSettingsModal = () => {
    if (!editingIndicator) return null;

    const getParameterLabel = (indicatorName: string, index: number): string => {
      const name = indicatorName.toUpperCase();
      if (name === 'MA' || name === 'EMA' || name === 'SMA' || name === 'WMA' || name === 'DEMA' || name === 'TEMA' || name === 'BBI' || name === 'OBV') {
        return `Period ${index + 1}`;
      }
      if (name === 'BOLL') {
        return index === 0 ? 'Period' : 'Standard Deviation';
      }
      if (name === 'KAMA') {
        return index === 0 ? 'Efficiency Period' : index === 1 ? 'Fast Period' : 'Slow Period';
      }
      if (name === 'VOL') {
        return `Period ${index + 1}`;
      }
      if (name === 'MACD') {
        return index === 0 ? 'Fast Period' : index === 1 ? 'Slow Period' : 'Signal Period';
      }
      if (name === 'RSI' || name === 'MFI' || name === 'CMO' || name === 'NATR' || name === 'STDDEV' || name === 'ATR') {
        return 'Period';
      }
      if (name === 'STOCH') {
        return index === 0 ? '%K Period' : index === 1 ? '%K Slowing' : '%D Period';
      }
      if (name === 'STOCHRSI') {
        return index === 0 ? 'RSI Period' : index === 1 ? 'Stochastic Period' : index === 2 ? '%K Slowing' : '%D Period';
      }
      if (name === 'AROON' || name === 'AROONOSC') {
        return 'Period';
      }
      if (name === 'ADOSC') {
        return index === 0 ? 'Fast EMA Period' : 'Slow EMA Period';
      }
      if (name === 'VOL OVERLAY') {
        return 'Opacity';
      }
      return `Parameter ${index + 1}`;
    };

    const getLegacyHeading = (n: string) => {
      const u = n.toUpperCase();
      if (u === 'MA' || u === 'SMA') return 'MA';
      if (u === 'EMA') return 'EMA';
      if (u === 'BOLL') return 'BOLL';
      if (u === 'VOL') return 'VOL';
      if (u === 'VOL OVERLAY') return 'Volume Overlay';
      if (u === 'RSI') return 'RSI';
      if (u === 'MACD') return 'MACD';
      if (u === 'KDJ') return 'KDJ';
      if (u === 'WMA') return 'WMA';
      if (u === 'DEMA') return 'DEMA';
      if (u === 'TEMA') return 'TEMA';
      if (u === 'KAMA') return 'KAMA';
      if (u === 'MFI') return 'MFI';
      if (u === 'VWAP') return 'VWAP';
      if (u === 'STOCH') return 'Stochastic';
      if (u === 'STOCHRSI') return 'StochRSI';
      if (u === 'AROON') return 'Aroon';
      if (u === 'AROONOSC') return 'Aroon Osc';
      if (u === 'CMO') return 'CMO';
      if (u === 'BOP') return 'BOP';
      if (u === 'AD') return 'A/D';
      if (u === 'ADOSC') return 'ADOSC';
      if (u === 'NATR') return 'NATR';
      if (u === 'STDDEV') return 'StdDev';
      if (u === 'ATR') return 'ATR';
      return n;
    };

    const handleSave = () => {
      const cc = getCoreChart();
      if (cc) {
        try {
          const newLines: any[] = [];
          const newBars: any[] = [];
          const newCircles: any[] = [];

          editingIndicator.figures.forEach((fig, idx) => {
            const styleMeta = editingIndicator.lineStyleObjects[idx];
            if (!styleMeta) return;

            const updatedStyle = {
              ...styleMeta.original,
              color: editingIndicator.colors[idx]
            };

            if (styleMeta.type === 'line') {
              newLines[styleMeta.index] = updatedStyle;
            } else if (styleMeta.type === 'bar') {
              newBars[styleMeta.index] = updatedStyle;
            } else if (styleMeta.type === 'circle') {
              newCircles[styleMeta.index] = updatedStyle;
            }
          });

          const cleanLines = Array.from(newLines).filter(Boolean);
          const cleanBars = Array.from(newBars).filter(Boolean);
          const cleanCircles = Array.from(newCircles).filter(Boolean);

          cc.overrideIndicator({
            id: editingIndicator.id,
            name: editingIndicator.name,
            paneId: editingIndicator.paneId,
            calcParams: editingIndicator.calcParams,
            styles: {
              ...(cleanLines.length > 0 ? { lines: cleanLines } : {}),
              ...(cleanBars.length > 0 ? { bars: cleanBars } : {}),
              ...(cleanCircles.length > 0 ? { circles: cleanCircles } : {})
            }
          });
        } catch (err) {
          console.error("Failed to save indicator settings:", err);
        }
      }
      setEditingIndicator(null);
    };

    const indicatorModalPos = modalPosMap['indicatorModal'] || {
      x: Math.max(10, Math.round(window.innerWidth / 2 - 190)),
      y: Math.max(10, Math.round(window.innerHeight / 2 - 220))
    };

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          zIndex: 200000,
          userSelect: 'none',
          pointerEvents: 'auto'
        }}
        onClick={() => setEditingIndicator(null)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: `${indicatorModalPos.x}px`,
            top: `${indicatorModalPos.y}px`,
            width: '380px',
            backgroundColor: '#161720',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.75)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxSizing: 'border-box',
            fontFamily: "'Rubik', sans-serif"
          }}
        >
          {/* Modal Header */}
          <div
            onMouseDown={(e) => handleModalHeaderMouseDown('indicatorModal', e, 380, 440)}
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'move',
              userSelect: 'none',
              backgroundColor: '#11131a'
            }}
          >
            <span style={{ fontWeight: 600, color: '#ffffff', fontSize: '15px', letterSpacing: '0.3px' }}>
              {getLegacyHeading(editingIndicator.name)} Settings
            </span>
            <button
              onClick={() => setEditingIndicator(null)}
              title="Close"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#868993',
                cursor: 'pointer',
                borderRadius: '6px',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.backgroundColor = 'rgba(242, 54, 69, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(242, 54, 69, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#868993';
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* Modal Tabs */}
          <div
            style={{
              display: 'flex',
              backgroundColor: '#101217',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '0 12px'
            }}
          >
            <button
              onClick={() => setSettingsTab('inputs')}
              style={{
                padding: '12px 18px',
                background: settingsTab === 'inputs' ? 'rgba(41, 98, 255, 0.08)' : 'transparent',
                border: 'none',
                color: settingsTab === 'inputs' ? '#2962ff' : '#868993',
                borderBottom: settingsTab === 'inputs' ? '2px solid #2962ff' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: settingsTab === 'inputs' ? 600 : 500,
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (settingsTab !== 'inputs') {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                }
              }}
              onMouseLeave={(e) => {
                if (settingsTab !== 'inputs') {
                  e.currentTarget.style.color = '#868993';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              Inputs
            </button>
            <button
              onClick={() => setSettingsTab('style')}
              style={{
                padding: '12px 18px',
                background: settingsTab === 'style' ? 'rgba(41, 98, 255, 0.08)' : 'transparent',
                border: 'none',
                color: settingsTab === 'style' ? '#2962ff' : '#868993',
                borderBottom: settingsTab === 'style' ? '2px solid #2962ff' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: settingsTab === 'style' ? 600 : 500,
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (settingsTab !== 'style') {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                }
              }}
              onMouseLeave={(e) => {
                if (settingsTab !== 'style') {
                  e.currentTarget.style.color = '#868993';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              Style
            </button>
          </div>

          {/* Modal Content */}
          <div
            style={{
              padding: '20px',
              maxHeight: '300px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              backgroundColor: '#161720'
            }}
          >
            {settingsTab === 'inputs' ? (
              editingIndicator.calcParams.length > 0 ? (
                editingIndicator.calcParams.map((param, index) => {
                  const labelText = getParameterLabel(editingIndicator.name, index);
                  const isOverlayOpacity = editingIndicator.name === 'VOL OVERLAY' && index === 0;
                  return (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', color: '#d1d4dc', fontWeight: 500 }}>
                        {labelText}
                      </span>
                      <CustomNumberAdjuster
                        step={isOverlayOpacity ? 0.01 : 1}
                        min={isOverlayOpacity ? 0 : 1}
                        max={isOverlayOpacity ? 1 : undefined}
                        value={param}
                        onChange={(val) => {
                          const newParams = [...editingIndicator.calcParams];
                          newParams[index] = val;
                          setEditingIndicator({ ...editingIndicator, calcParams: newParams });
                        }}
                      />
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', color: '#868993', fontSize: '13px', padding: '10px 0' }}>
                  No inputs to configure.
                </div>
              )
            ) : (
              // Style settings
              editingIndicator.figures.length > 0 ? (
                editingIndicator.figures.map((fig, index) => {
                  const labelText = (fig.title || fig.key || '').replace(/[:：\s]+$/, '');
                  return (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', color: '#d1d4dc', fontWeight: 500 }}>
                        {labelText || 'Plot'}
                      </span>
                      <ColorPicker
                        color={editingIndicator.colors[index]}
                        onChange={(newColor) => {
                          const newColors = [...editingIndicator.colors];
                          newColors[index] = newColor;
                          setEditingIndicator({ ...editingIndicator, colors: newColors });
                        }}
                      />
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', color: '#868993', fontSize: '13px', padding: '10px 0' }}>
                  No colors to configure.
                </div>
              )
            )}
          </div>

          {/* Modal Actions */}
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              backgroundColor: '#11131a'
            }}
          >
            <button
              onClick={() => setEditingIndicator(null)}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#d1d4dc',
                borderRadius: '6px',
                padding: '6px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#d1d4dc';
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                backgroundColor: '#2962ff',
                border: 'none',
                color: '#ffffff',
                borderRadius: '6px',
                padding: '6px 20px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1a56ff'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2962ff'}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderTextSettingsModal = () => {
    if (!editingTextOverlay) return null;

    // Helper to immediately push changes to the active chart overlay
    const updateOverlaySetting = (updatedData: any) => {
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        const overlays = activeChart.getOverlays() || [];
        const found = overlays.find((o: any) => o.id === editingTextOverlay.overlayId);
        if (found) {
          if (updatedData.locked !== undefined) {
            found.lock = updatedData.locked;
          }
          activeChart.overrideOverlay({
            id: editingTextOverlay.overlayId,
            lock: updatedData.locked !== undefined ? updatedData.locked : found.lock,
            extendData: {
              ...(found.extendData || {}),
              ...updatedData
            }
          });
          if (typeof activeChart.updatePane === 'function') {
            activeChart.updatePane(1);
          }
          if (typeof activeChart.invalidate === 'function') {
            activeChart.invalidate();
          }
        }
      }
    };

    const updateAndSave = (key: string, value: any) => {
      const nextOverlayState = {
        ...editingTextOverlay,
        [key]: value
      };
      setEditingTextOverlay(nextOverlayState);
      updateOverlaySetting({
        [key]: value
      });
    };

    const handleTrashOverlay = () => {
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        activeChart.removeOverlay({ id: editingTextOverlay.overlayId });
      }
      setEditingTextOverlay(null);
    };

    const parseRgba = (colorStr: string): { hex: string; opacity: number } => {
      if (!colorStr || colorStr === 'transparent') {
        return { hex: '#ffffff', opacity: 0 };
      }
      if (colorStr.startsWith('rgba')) {
        const parts = colorStr.match(/[\d.]+/g);
        if (parts && parts.length >= 4) {
          const r = parseInt(parts[0]);
          const g = parseInt(parts[1]);
          const b = parseInt(parts[2]);
          const hexStr = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
          const op = parseFloat(parts[3]);
          return { hex: hexStr, opacity: op };
        }
      } else if (colorStr.startsWith('rgb')) {
        const parts = colorStr.match(/\d+/g);
        if (parts && parts.length >= 3) {
          const r = parseInt(parts[0]);
          const g = parseInt(parts[1]);
          const b = parseInt(parts[2]);
          const hexStr = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
          return { hex: hexStr, opacity: 1.0 };
        }
      } else if (colorStr.startsWith('#')) {
        return { hex: colorStr, opacity: 1.0 };
      }
      return { hex: '#ffffff', opacity: 1.0 };
    };

    const hexToRgb = (hex: string) => {
      let cleanHex = hex.replace('#', '');
      if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(char => char + char).join('');
      }
      const num = parseInt(cleanHex, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    };

    const isLocked = editingTextOverlay.locked ?? false;
    const isBold = editingTextOverlay.fontWeight === 'bold';
    const isItalic = editingTextOverlay.fontStyle === 'italic';
    const isUnderline = editingTextOverlay.underline === true;
    const hasBackground = editingTextOverlay.backgroundColor && editingTextOverlay.backgroundColor !== 'transparent';
    const hasBorder = editingTextOverlay.borderColor && editingTextOverlay.borderColor !== 'transparent';

    const bgParsed = parseRgba(editingTextOverlay.backgroundColor || 'transparent');
    const borderParsed = parseRgba(editingTextOverlay.borderColor || 'transparent');

    return (
      <div
        style={{
          position: 'fixed',
          left: `${panelPos.x}px`,
          top: `${panelPos.y}px`,
          backgroundColor: '#1e222d',
          border: '1px solid #2a2e39',
          borderRadius: '6px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          zIndex: 10000,
          userSelect: 'none',
          pointerEvents: 'auto',
          color: '#d1d4dc',
          fontFamily: "'Rubik', 'Rubik', sans-serif",
          boxSizing: 'border-box',
          gap: '6px',
          height: '38px'
        }}
      >
        {/* Drag Handle */}
        <div
          onMouseDown={handlePanelDragStart}
          title="Drag Toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isPanelDragging ? 'grabbing' : 'grab',
            padding: '4px 2px',
            color: '#787b86',
            borderRadius: '4px',
            transition: 'color 0.12s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#d1d4dc'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#787b86'}
        >
          <GripVertical size={16} />
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Text Color Picker (ColorStylePicker with "A" indicator) */}
        <ColorStylePicker
          color={editingTextOverlay.textColor || '#ffffff'}
          opacity={1.0}
          hideStyleSelector={true}
          isTextColorPicker={true}
          onChange={(newColor, newOpacity) => {
            const { r, g, b } = hexToRgb(newColor);
            updateAndSave('textColor', `rgba(${r}, ${g}, ${b}, ${newOpacity})`);
          }}
        />

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Font Size Selector (Custom Dropdown) */}
        <div style={{ position: 'relative' }} title="Text Size">
          <button
            ref={sizeBtnRef}
            onClick={(e) => {
              e.stopPropagation();
              setIsSizeDropdownOpen(prev => !prev);
            }}
            style={{
              background: isSizeDropdownOpen ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: isSizeDropdownOpen ? '#2979ff' : '#d1d4dc',
              padding: '0 6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '26px',
              boxSizing: 'border-box'
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: '500', minWidth: '14px', textAlign: 'center' }}>
              {editingTextOverlay.fontSize}
            </span>
            <ChevronDown size={12} color="#787b86" />
          </button>

          {isSizeDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '32px',
                left: '0',
                backgroundColor: '#1e222d',
                border: '1px solid #2a2e39',
                borderRadius: '6px',
                boxShadow: '0 6px 18px rgba(0, 0, 0, 0.7)',
                padding: '4px 0',
                minWidth: '75px',
                zIndex: 160000
              }}
              onClick={e => e.stopPropagation()}
            >
              {[10, 11, 12, 14, 16, 20, 24, 32, 40].map(sz => (
                <div
                  key={sz}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateAndSave('fontSize', sz);
                    setIsSizeDropdownOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: editingTextOverlay.fontSize === sz ? '#2979ff' : '#d1d4dc',
                    backgroundColor: editingTextOverlay.fontSize === sz ? 'rgba(41, 98, 255, 0.12)' : 'transparent',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = editingTextOverlay.fontSize === sz ? 'rgba(41, 98, 255, 0.12)' : 'transparent'}
                >
                  <span>{sz}</span>
                  {editingTextOverlay.fontSize === sz && <Check size={12} color="#2979ff" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Styles: B, I, U */}
        <div style={{ display: 'flex', gap: '3px' }}>
          <button
            onClick={() => updateAndSave('fontWeight', isBold ? 'normal' : 'bold')}
            style={{
              width: '26px',
              height: '26px',
              backgroundColor: isBold ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
              border: isBold ? '1px solid #2962ff' : '1px solid transparent',
              borderRadius: '4px',
              color: isBold ? '#2979ff' : '#d1d4dc',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { if (!isBold) { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#ffffff'; } }}
            onMouseLeave={(e) => { if (!isBold) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#d1d4dc'; } }}
            title="Bold"
          >
            B
          </button>

          <button
            onClick={() => updateAndSave('fontStyle', isItalic ? 'normal' : 'italic')}
            style={{
              width: '26px',
              height: '26px',
              backgroundColor: isItalic ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
              border: isItalic ? '1px solid #2962ff' : '1px solid transparent',
              borderRadius: '4px',
              color: isItalic ? '#2979ff' : '#d1d4dc',
              cursor: 'pointer',
              fontStyle: 'italic',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { if (!isItalic) { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#ffffff'; } }}
            onMouseLeave={(e) => { if (!isItalic) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#d1d4dc'; } }}
            title="Italic"
          >
            I
          </button>

          <button
            onClick={() => updateAndSave('underline', !isUnderline)}
            style={{
              width: '26px',
              height: '26px',
              backgroundColor: isUnderline ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
              border: isUnderline ? '1px solid #2962ff' : '1px solid transparent',
              borderRadius: '4px',
              color: isUnderline ? '#2979ff' : '#d1d4dc',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { if (!isUnderline) { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#ffffff'; } }}
            onMouseLeave={(e) => { if (!isUnderline) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#d1d4dc'; } }}
            title="Underline"
          >
            U
          </button>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Background ColorStylePicker Panel */}
        <ColorStylePicker
          color={bgParsed.hex}
          opacity={bgParsed.opacity}
          hideStyleSelector={true}
          onChange={(newColor, newOpacity) => {
            if (newColor === 'transparent') {
              updateAndSave('backgroundColor', 'transparent');
            } else {
              const { r, g, b } = hexToRgb(newColor);
              updateAndSave('backgroundColor', `rgba(${r}, ${g}, ${b}, ${newOpacity})`);
            }
          }}
        />

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Border ColorStylePicker Panel */}
        <ColorStylePicker
          color={borderParsed.hex}
          opacity={borderParsed.opacity}
          hideStyleSelector={true}
          onChange={(newColor, newOpacity) => {
            if (newColor === 'transparent') {
              updateAndSave('borderColor', 'transparent');
            } else {
              const { r, g, b } = hexToRgb(newColor);
              updateAndSave('borderColor', `rgba(${r}, ${g}, ${b}, ${newOpacity})`);
            }
          }}
        />

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Lock Button */}
        <button
          onClick={() => updateAndSave('locked', !isLocked)}
          title={isLocked ? 'Unlock Text' : 'Lock Text'}
          style={{
            background: isLocked ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
            border: isLocked ? '1px solid #2962ff' : 'none',
            color: isLocked ? '#2979ff' : '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { if (!isLocked) { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; } }}
          onMouseLeave={e => { if (!isLocked) { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
        >
          {isLocked ? <LockbtnIcon width={16} height={16} /> : <UnlockbtnIcon width={16} height={16} />}
        </button>

        {/* Hide / Visibility (Eye) Button */}
        <button
          onClick={() => {
            const activeChart = (window as any).__active_chart_instance__;
            if (activeChart && typeof activeChart.overrideOverlay === 'function') {
              activeChart.overrideOverlay({
                id: editingTextOverlay.overlayId,
                visible: false
              });
              if (typeof activeChart.invalidate === 'function') activeChart.invalidate();
            }
            setEditingTextOverlay(null);
            window.dispatchEvent(new CustomEvent('update-layer-panel'));
            window.dispatchEvent(new CustomEvent('save-history-state'));
          }}
          title="Hide"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <Eye size={15} />
        </button>

        {/* Duplicate Button */}
        <button
          onClick={() => cloneOverlayInStack(editingTextOverlay.overlayId)}
          title="Duplicate"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <Copy size={15} />
        </button>

        {/* Visual Order / Layers Dropdown Button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsTextLayersDropdownOpen(prev => !prev);
              setIsSizeDropdownOpen(false);
            }}
            title="Visual Order (Layers)"
            style={{
              background: isTextLayersDropdownOpen ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
              border: isTextLayersDropdownOpen ? '1px solid #2962ff' : 'none',
              color: isTextLayersDropdownOpen ? '#2979ff' : '#787b86',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '26px',
              width: '26px',
              boxSizing: 'border-box'
            }}
            onMouseEnter={e => { if (!isTextLayersDropdownOpen) { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; } }}
            onMouseLeave={e => { if (!isTextLayersDropdownOpen) { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
          >
            <Layers size={15} />
          </button>

          {isTextLayersDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '32px',
                left: '0',
                backgroundColor: '#1e222d',
                border: '1px solid #2a2e39',
                borderRadius: '6px',
                boxShadow: '0 6px 18px rgba(0,0,0,0.7)',
                padding: '4px 0',
                minWidth: '150px',
                zIndex: 160000
              }}
              onClick={e => e.stopPropagation()}
            >
              {[
                { action: 'front', label: 'Bring to Front', icon: ChevronsUp },
                { action: 'forward', label: 'Bring Forward', icon: ChevronUp },
                { action: 'backward', label: 'Send Backward', icon: ChevronDown },
                { action: 'back', label: 'Send to Back', icon: ChevronsDown }
              ].map(item => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={item.action}
                    onClick={() => {
                      reorderOverlayInStack(editingTextOverlay.overlayId, item.action as any);
                      setIsTextLayersDropdownOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 12px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: '#d1d4dc'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#d1d4dc';
                    }}
                  >
                    <IconComponent size={14} color="#787b86" />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Trash/Delete Button */}
        <button
          onClick={handleTrashOverlay}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            height: '26px',
            width: '26px',
            padding: 0,
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            outline: 'none',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#787b86';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="Delete text"
        >
          <DeletebtnIcon width={16} height={16} />
        </button>
      </div>
    );
  };

  const renderFibSettingsPanel = () => {
    if (!editingFibOverlay || isFibFullModalOpen) return null;

    const isCustomFibTool =
      editingFibOverlay.overlayName === 'fib-retracement' ||
      editingFibOverlay.overlayName === 'fibonacciLine' ||
      editingFibOverlay.overlayName === 'fib-extension' ||
      editingFibOverlay.overlayName === 'fib-time-zone' ||
      editingFibOverlay.overlayName === 'timeZone' ||
      editingFibOverlay.overlayName === 'fib-time-extension' ||
      editingFibOverlay.overlayName === 'timeExtension' ||
      editingFibOverlay.overlayName === 'fib-channel' ||
      editingFibOverlay.overlayName === 'fibChannel' ||
      editingFibOverlay.overlayName === 'fib-circles' ||
      editingFibOverlay.overlayName === 'fibCircles' ||
      editingFibOverlay.overlayName === 'fib-arcs' ||
      editingFibOverlay.overlayName === 'fibArcs' ||
      editingFibOverlay.overlayName === 'fib-wedge' ||
      editingFibOverlay.overlayName === 'fibWedge' ||
      editingFibOverlay.overlayName === 'pitchfan' ||
      editingFibOverlay.overlayName === 'pitchFan' ||
      editingFibOverlay.overlayName === 'fib-spiral' ||
      editingFibOverlay.overlayName === 'fibSpiral' ||
      editingFibOverlay.overlayName === 'fib-speed-fan' ||
      editingFibOverlay.overlayName === 'fibSpeedFan' ||
      editingFibOverlay.overlayName === 'speedFan' ||
      editingFibOverlay.overlayName === 'andrews-pitchfork' ||
      editingFibOverlay.overlayName === 'andrewsPitchfork' ||
      editingFibOverlay.overlayName === 'andrews' ||
      editingFibOverlay.overlayName === 'parallelStraightLine' ||
      editingFibOverlay.overlayName === 'schiff-pitchfork' ||
      editingFibOverlay.overlayName === 'schiffPitchfork' ||
      editingFibOverlay.overlayName === 'schiff' ||
      editingFibOverlay.overlayName === 'modified-schiff-pitchfork' ||
      editingFibOverlay.overlayName === 'modifiedSchiffPitchfork' ||
      editingFibOverlay.overlayName === 'modifiedSchiff' ||
      editingFibOverlay.overlayName === 'inside-pitchfork' ||
      editingFibOverlay.overlayName === 'insidePitchfork' ||
      editingFibOverlay.overlayName === 'inside';

    if (!isCustomFibTool) return null;

    const updateFibOverlaySetting = (updatedData: any) => {
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        const overlays = activeChart.getOverlays() || [];
        const found = overlays.find((o: any) => o.id === editingFibOverlay.overlayId);
        if (found) {
          const newSize = updatedData.lineWidth || updatedData.trendlineWidth || updatedData.levelLineWidth || found.styles?.size || 1;
          const newStyle = updatedData.lineStyle || updatedData.trendlineStyle || found.styles?.lineStyle || 'solid';
          const lineDash = newStyle === 'dashed' ? [6, 6] : newStyle === 'dotted' ? [2, 4] : [];
          if (updatedData.locked !== undefined) {
            found.lock = updatedData.locked;
          }
          activeChart.overrideOverlay({
            id: editingFibOverlay.overlayId,
            lock: updatedData.locked !== undefined ? updatedData.locked : found.lock,
            styles: {
              ...(found.styles || {}),
              color: updatedData.lineColor || found.styles?.color || '#2962ff',
              size: newSize,
              lineWidth: newSize,
              lineStyle: newStyle,
              lineDash
            },
            extendData: {
              ...(found.extendData || {}),
              ...updatedData,
              lineWidth: newSize,
              trendlineWidth: newSize,
              levelLineWidth: newSize,
              lineStyle: newStyle,
              locked: updatedData.locked !== undefined ? updatedData.locked : (found.extendData?.locked ?? found.lock)
            }
          });
          if (typeof activeChart.updatePane === 'function') {
            activeChart.updatePane(1);
          }
          if (typeof activeChart.invalidate === 'function') {
            activeChart.invalidate();
          }
        }
      }
    };

    const updateAndSaveFib = (keyOrObj: string | Record<string, any>, value?: any) => {
      const patch = typeof keyOrObj === 'string' ? { [keyOrObj]: value } : keyOrObj;
      setEditingFibOverlay((prev: any) => {
        if (!prev) return null;
        const nextState = {
          ...prev,
          ...patch
        };
        updateFibOverlaySetting(nextState);
        return nextState;
      });
    };

    const handleTrashFibOverlay = () => {
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        activeChart.removeOverlay({ id: editingFibOverlay.overlayId });
      }
      setEditingFibOverlay(null);
      setIsFibFullModalOpen(false);
    };

    const hexToRgb = (hex: string) => {
      let cleanHex = hex.replace('#', '');
      if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(char => char + char).join('');
      }
      const num = parseInt(cleanHex, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    };

    const isFibLocked = editingFibOverlay.locked ?? false;
    const trendWidth = editingFibOverlay.lineWidth ?? editingFibOverlay.trendlineWidth ?? editingFibOverlay.levelLineWidth ?? 1;
    const levelWidth = editingFibOverlay.levelLineWidth ?? editingFibOverlay.lineWidth ?? 1;
    const currentLineColor = editingFibOverlay.oneColor || editingFibOverlay.lineColor || '#2962ff';
    const currentLineStyle = editingFibOverlay.lineStyle || editingFibOverlay.trendlineStyle || 'solid';

    return (
      <div
        style={{
          position: 'fixed',
          left: `${panelPos.x}px`,
          top: `${panelPos.y}px`,
          backgroundColor: '#1e222d',
          border: '1px solid #2a2e39',
          borderRadius: '6px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          zIndex: 10000,
          userSelect: 'none',
          pointerEvents: 'auto',
          color: '#d1d4dc',
          fontFamily: "'Rubik', 'Rubik', sans-serif",
          boxSizing: 'border-box',
          gap: '6px',
          height: '38px'
        }}
      >
        {/* Drag Handle */}
        <div
          onMouseDown={handlePanelDragStart}
          title="Drag Toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isPanelDragging ? 'grabbing' : 'grab',
            padding: '4px 2px',
            color: '#787b86',
            borderRadius: '4px',
            transition: 'color 0.12s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#d1d4dc'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#787b86'}
        >
          <GripVertical size={16} />
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Main Line / One Color & Style Picker */}
        <ColorStylePicker
          color={currentLineColor}
          opacity={1.0}
          style={currentLineStyle}
          hideStyleSelector={false}
          onChange={(newColor, newOpacity, newStyle) => {
            const finalColor = newOpacity < 1 ? `rgba(${hexToRgb(newColor).r}, ${hexToRgb(newColor).g}, ${hexToRgb(newColor).b}, ${newOpacity})` : newColor;

            const rawLevels = editingFibOverlay.levels;
            const nextLevels = Array.isArray(rawLevels)
              ? rawLevels.map((lvl: any) => (typeof lvl === 'object' && lvl !== null ? { ...lvl, color: finalColor, lineStyle: newStyle } : { value: lvl, color: finalColor, lineStyle: newStyle, enabled: true }))
              : undefined;

            const rawIntervals = editingFibOverlay.intervals;
            const nextIntervals = Array.isArray(rawIntervals)
              ? rawIntervals.map((lvl: any) => (typeof lvl === 'object' && lvl !== null ? { ...lvl, color: finalColor, lineStyle: newStyle } : { value: lvl, color: finalColor, lineStyle: newStyle, enabled: true }))
              : undefined;

            const rawPriceLevels = editingFibOverlay.priceLevels;
            const nextPriceLevels = Array.isArray(rawPriceLevels)
              ? rawPriceLevels.map((lvl: any) => (typeof lvl === 'object' && lvl !== null ? { ...lvl, color: finalColor, lineStyle: newStyle } : { value: lvl, color: finalColor, lineStyle: newStyle, enabled: true }))
              : undefined;

            const rawTimeLevels = editingFibOverlay.timeLevels;
            const nextTimeLevels = Array.isArray(rawTimeLevels)
              ? rawTimeLevels.map((lvl: any) => (typeof lvl === 'object' && lvl !== null ? { ...lvl, color: finalColor, lineStyle: newStyle } : { value: lvl, color: finalColor, lineStyle: newStyle, enabled: true }))
              : undefined;

            const patch: Record<string, any> = {
              useOneColor: true,
              oneColor: finalColor,
              lineColor: finalColor,
              trendlineColor: finalColor,
              medianColor: finalColor,
              lineStyle: newStyle,
              trendlineStyle: newStyle
            };

            if (nextLevels) patch.levels = nextLevels;
            if (nextIntervals) patch.intervals = nextIntervals;
            if (nextPriceLevels) patch.priceLevels = nextPriceLevels;
            if (nextTimeLevels) patch.timeLevels = nextTimeLevels;

            updateAndSaveFib(patch);
          }}
        />

        {/* Line Width (px) Dropdown */}
        <div style={{ position: 'relative' }} title="Line Width">
          <button
            ref={trendWidthBtnRef}
            onClick={(e) => {
              e.stopPropagation();
              setIsTrendWidthDropdownOpen(prev => !prev);
              setIsLevelWidthDropdownOpen(false);
            }}
            style={{
              background: isTrendWidthDropdownOpen ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: isTrendWidthDropdownOpen ? '#2979ff' : '#d1d4dc',
              padding: '0 6px',
              cursor: 'pointer',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '26px',
              boxSizing: 'border-box'
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: '500', minWidth: '14px', textAlign: 'center' }}>
              {trendWidth}px
            </span>
            <ChevronDown size={12} color="#787b86" />
          </button>

          {isTrendWidthDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '32px',
                left: '0',
                backgroundColor: '#1e222d',
                border: '1px solid #2a2e39',
                borderRadius: '6px',
                boxShadow: '0 6px 18px rgba(0,0,0,0.7)',
                padding: '4px 0',
                minWidth: '85px',
                zIndex: 160000
              }}
              onClick={e => e.stopPropagation()}
            >
              {[1, 2, 3, 4].map((px) => (
                <div
                  key={px}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateAndSaveFib({
                      trendlineWidth: px,
                      levelLineWidth: px,
                      lineWidth: px
                    });
                    setIsTrendWidthDropdownOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: trendWidth === px ? '#2979ff' : '#d1d4dc',
                    backgroundColor: trendWidth === px ? 'rgba(41, 98, 255, 0.12)' : 'transparent'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = trendWidth === px ? 'rgba(41, 98, 255, 0.12)' : 'transparent'}
                >
                  <span>{px}px</span>
                  {trendWidth === px && <Check size={12} color="#2979ff" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Settings Gear Button (Using Top Panel New Icon) */}
        <button
          onClick={() => setIsFibFullModalOpen(true)}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: '#868993',
            cursor: 'pointer',
            height: '26px',
            width: '26px',
            padding: 0,
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            outline: 'none',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#868993';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 33.136 28.412" style={{ pointerEvents: 'none' }}>
            <g id="Setting">
              <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" stroke="currentColor" strokeWidth="0.5" strokeMiterlimit="10" d="M22.77,14.206c0,3.426-2.777,6.203-6.203,6.203s-6.203-2.777-6.203-6.203s2.777-6.203,6.203-6.203S22.77,10.78,22.77,14.206z M21.22,14.206c0,2.569-2.083,4.652-4.652,4.652s-4.652-2.083-4.652-4.652s2.083-4.652,4.652-4.652S21.22,11.637,21.22,14.206z" />
              <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" stroke="currentColor" strokeWidth="0.5" strokeMiterlimit="10" d="M8.039,0.25h17.057l7.753,13.956l-7.753,13.956H8.039L0.286,14.206L8.039,0.25z M2.054,14.206L8.97,1.801h15.227l6.9,12.405 l-6.9,12.405H8.97l-6.9-12.405H2.054z" />
            </g>
          </svg>
        </button>

        {/* Lock Button */}
        <button
          onClick={() => updateAndSaveFib('locked', !isFibLocked)}
          title={isFibLocked ? 'Unlock' : 'Lock'}
          style={{
            background: isFibLocked ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
            border: isFibLocked ? '1px solid #2962ff' : 'none',
            color: isFibLocked ? '#2979ff' : '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { if (!isFibLocked) { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; } }}
          onMouseLeave={e => { if (!isFibLocked) { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
        >
          {isFibLocked ? <LockbtnIcon width={16} height={16} /> : <UnlockbtnIcon width={16} height={16} />}
        </button>

        {/* Hide / Visibility (Eye) Button */}
        <button
          onClick={() => {
            const activeChart = (window as any).__active_chart_instance__;
            if (activeChart && typeof activeChart.overrideOverlay === 'function') {
              activeChart.overrideOverlay({
                id: editingFibOverlay.overlayId,
                visible: false
              });
              if (typeof activeChart.invalidate === 'function') activeChart.invalidate();
            }
            setEditingFibOverlay(null);
            setIsFibFullModalOpen(false);
            window.dispatchEvent(new CustomEvent('update-layer-panel'));
            window.dispatchEvent(new CustomEvent('save-history-state'));
          }}
          title="Hide"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <Eye size={15} />
        </button>

        {/* Duplicate Button */}
        <button
          onClick={() => cloneOverlayInStack(editingFibOverlay.overlayId)}
          title="Duplicate"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <Copy size={15} />
        </button>

        {/* Visual Order / Layers Dropdown Button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsFibLayersDropdownOpen(prev => !prev);
              setIsTrendWidthDropdownOpen(false);
              setIsLevelWidthDropdownOpen(false);
            }}
            title="Visual Order (Layers)"
            style={{
              background: isFibLayersDropdownOpen ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
              border: isFibLayersDropdownOpen ? '1px solid #2962ff' : 'none',
              color: isFibLayersDropdownOpen ? '#2979ff' : '#787b86',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '26px',
              width: '26px',
              boxSizing: 'border-box'
            }}
            onMouseEnter={e => { if (!isFibLayersDropdownOpen) { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; } }}
            onMouseLeave={e => { if (!isFibLayersDropdownOpen) { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
          >
            <Layers size={15} />
          </button>

          {isFibLayersDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '32px',
                left: '0',
                backgroundColor: '#1e222d',
                border: '1px solid #2a2e39',
                borderRadius: '6px',
                boxShadow: '0 6px 18px rgba(0,0,0,0.7)',
                padding: '4px 0',
                minWidth: '150px',
                zIndex: 160000
              }}
              onClick={e => e.stopPropagation()}
            >
              {[
                { action: 'front', label: 'Bring to Front', icon: ChevronsUp },
                { action: 'forward', label: 'Bring Forward', icon: ChevronUp },
                { action: 'backward', label: 'Send Backward', icon: ChevronDown },
                { action: 'back', label: 'Send to Back', icon: ChevronsDown }
              ].map(item => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={item.action}
                    onClick={() => {
                      reorderOverlayInStack(editingFibOverlay.overlayId, item.action as any);
                      setIsFibLayersDropdownOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 12px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: '#d1d4dc'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#d1d4dc';
                    }}
                  >
                    <IconComponent size={14} color="#787b86" />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Delete Button */}
        <button
          onClick={handleTrashFibOverlay}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            height: '26px',
            width: '26px',
            padding: 0,
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            outline: 'none',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#787b86';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="Remove"
        >
          <DeletebtnIcon width={16} height={16} />
        </button>
      </div>
    );
  };

  const CustomCheckbox = ({ checked, onChange, label }: { checked: boolean; onChange: (val: boolean) => void; label?: React.ReactNode }) => (
    <label
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
        userSelect: 'none'
      }}
    >
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '4px',
          border: checked ? '1px solid #ffffff' : '2px solid #868993',
          backgroundColor: checked ? '#ffffff' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s',
          boxSizing: 'border-box',
          flexShrink: 0
        }}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" style={{ display: 'block' }}>
            <path
              d="M1.5 4L4 6.5L8.5 1.5"
              stroke="#131722"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      {label && <span style={{ fontSize: '13px', color: '#d1d4dc', fontWeight: 500 }}>{label}</span>}
    </label>
  );

  const renderFibFullSettingsModal = () => {
    if (!isFibFullModalOpen || !editingFibOverlay) return null;

    const updateFibOverlaySetting = (updatedData: any) => {
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        const overlays = activeChart.getOverlays() || [];
        const found = overlays.find((o: any) => o.id === editingFibOverlay.overlayId);
        if (found) {
          const newSize = updatedData.lineWidth || updatedData.trendlineWidth || updatedData.levelLineWidth || found.styles?.size || 1;
          activeChart.overrideOverlay({
            id: editingFibOverlay.overlayId,
            styles: {
              ...(found.styles || {}),
              color: updatedData.lineColor || found.styles?.color || '#2962ff',
              size: newSize,
              lineWidth: newSize
            },
            extendData: {
              ...(found.extendData || {}),
              ...updatedData,
              lineWidth: newSize,
              trendlineWidth: updatedData.trendlineWidth ?? newSize,
              levelLineWidth: updatedData.levelLineWidth ?? newSize
            }
          });
          if (typeof activeChart.updatePane === 'function') {
            activeChart.updatePane(1);
          }
          if (typeof activeChart.invalidate === 'function') {
            activeChart.invalidate();
          }
        }
      }
    };

    const updateAndSaveFib = (keyOrObj: string | Record<string, any>, value?: any) => {
      const patch = typeof keyOrObj === 'string' ? { [keyOrObj]: value } : keyOrObj;
      setEditingFibOverlay((prev: any) => {
        if (!prev) return null;
        const nextState = {
          ...prev,
          ...patch
        };
        updateFibOverlaySetting(nextState);
        return nextState;
      });
    };

    const handleCancelFib = () => {
      if (initialFibBackupRef.current) {
        setEditingFibOverlay(initialFibBackupRef.current);
        updateFibOverlaySetting(initialFibBackupRef.current);
      }
      setIsFibFullModalOpen(false);
    };

    const isTimeZone = editingFibOverlay.overlayName === 'fib-time-zone' || editingFibOverlay.overlayName === 'timeZone';
    const isTimeExtension = editingFibOverlay.overlayName === 'fib-time-extension' || editingFibOverlay.overlayName === 'timeExtension';
    const isFibChannel = editingFibOverlay.overlayName === 'fib-channel' || editingFibOverlay.overlayName === 'fibChannel';
    const isFibCircles = editingFibOverlay.overlayName === 'fib-circles' || editingFibOverlay.overlayName === 'fibCircles';
    const isFibArcs = editingFibOverlay.overlayName === 'fib-arcs' || editingFibOverlay.overlayName === 'fibArcs';
    const isFibWedge = editingFibOverlay.overlayName === 'fib-wedge' || editingFibOverlay.overlayName === 'fibWedge';
    const isPitchfan = editingFibOverlay.overlayName === 'pitchfan' || editingFibOverlay.overlayName === 'pitchFan';
    const isFibSpiral = editingFibOverlay.overlayName === 'fib-spiral' || editingFibOverlay.overlayName === 'fibSpiral';
    const isFibSpeedFan = editingFibOverlay.overlayName === 'fib-speed-fan' || editingFibOverlay.overlayName === 'fibSpeedFan' || editingFibOverlay.overlayName === 'speedFan';
    const isAndrewsPitchfork = editingFibOverlay.overlayName === 'andrews-pitchfork' || editingFibOverlay.overlayName === 'andrewsPitchfork' || editingFibOverlay.overlayName === 'andrews' || editingFibOverlay.overlayName === 'parallelStraightLine';
    const isSchiffPitchfork = editingFibOverlay.overlayName === 'schiff-pitchfork' || editingFibOverlay.overlayName === 'schiffPitchfork' || editingFibOverlay.overlayName === 'schiff';
    const isModifiedSchiffPitchfork = editingFibOverlay.overlayName === 'modified-schiff-pitchfork' || editingFibOverlay.overlayName === 'modifiedSchiffPitchfork' || editingFibOverlay.overlayName === 'modifiedSchiff';
    const isInsidePitchfork = editingFibOverlay.overlayName === 'inside-pitchfork' || editingFibOverlay.overlayName === 'insidePitchfork' || editingFibOverlay.overlayName === 'inside';
    const isAnyPitchfork = isAndrewsPitchfork || isSchiffPitchfork || isModifiedSchiffPitchfork || isInsidePitchfork;

    const isFibExtension = editingFibOverlay.overlayName === 'fib-extension' || editingFibOverlay.overlayName === 'fibExtension';

    const handleDefaultsFib = () => {
      const defaultsObj = isAnyPitchfork ? {
        levels: JSON.parse(JSON.stringify(DEFAULT_PITCHFORK_LEVELS)),
        extendLines: false,
        showMedian: true,
        medianColor: '#F23645',
        medianStyle: 'solid',
        medianWidth: 1,
        filled: true,
        backgroundOpacity: 0.15,
        useOneColor: false,
        oneColor: '#2962FF',
        lineWidth: 1,
        lineColor: '#2962FF'
      } : isFibSpeedFan ? {
        priceLevels: JSON.parse(JSON.stringify(DEFAULT_SPEED_FAN_PRICE_LEVELS)),
        timeLevels: JSON.parse(JSON.stringify(DEFAULT_SPEED_FAN_TIME_LEVELS)),
        showLeftLabels: true,
        showRightLabels: true,
        showTopLabels: true,
        showBottomLabels: true,
        useOneColor: false,
        oneColor: '#2962ff',
        filled: true,
        backgroundOpacity: 0.15,
        showGrid: true,
        gridColor: '#2962FF',
        gridStyle: 'solid',
        gridWidth: 1,
        reverse: false,
        lineColor: '#2962ff',
        lineWidth: 1
      } : isFibSpiral ? {
        showTrendline: true,
        trendlineColor: '#787B86',
        trendlineWidth: 1,
        trendlineStyle: 'dashed',
        counterclockwise: false,
        lineColor: '#2962ff',
        lineWidth: 2,
        lineStyle: 'solid'
      } : isPitchfan ? {
        levels: JSON.parse(JSON.stringify(DEFAULT_PITCHFAN_LEVELS)),
        showMedian: true,
        medianColor: '#F23645',
        medianWidth: 1,
        medianStyle: 'solid',
        showBaseline: true,
        baselineColor: '#787B86',
        baselineWidth: 1,
        baselineStyle: 'dashed',
        filled: true,
        backgroundOpacity: 0.15,
        showLabels: true,
        useOneColor: false,
        oneColor: '#2962ff',
        lineColor: '#2962ff',
        lineWidth: 1
      } : isFibWedge ? {
        levels: JSON.parse(JSON.stringify(DEFAULT_FIB_WEDGE_LEVELS)),
        showTrendline: true,
        trendlineColor: '#787B86',
        trendlineWidth: 1,
        trendlineStyle: 'solid',
        filled: true,
        backgroundOpacity: 0.15,
        showLabels: true,
        useOneColor: false,
        oneColor: '#2962ff',
        lineColor: '#2962ff',
        lineWidth: 1
      } : isFibArcs ? {
        levels: JSON.parse(JSON.stringify(DEFAULT_FIB_ARCS_LEVELS)),
        showTrendline: true,
        trendlineColor: '#787B86',
        trendlineWidth: 1,
        trendlineStyle: 'dashed',
        filled: true,
        backgroundOpacity: 0.15,
        showLabels: true,
        fullCircles: false,
        useOneColor: false,
        oneColor: '#2962ff',
        lineColor: '#2962ff',
        lineWidth: 1
      } : isFibCircles ? {
        levels: JSON.parse(JSON.stringify(DEFAULT_FIB_CIRCLES_LEVELS)),
        showTrendline: true,
        trendlineColor: '#787B86',
        trendlineWidth: 1,
        trendlineStyle: 'dashed',
        filled: true,
        backgroundOpacity: 0.15,
        showLabels: true,
        coeffsAsPercents: false,
        useOneColor: false,
        oneColor: '#2962ff',
        lineColor: '#2962ff',
        lineWidth: 1
      } : isTimeZone ? {
        levels: JSON.parse(JSON.stringify(DEFAULT_FIB_TIME_ZONE_LEVELS)),
        filled: true,
        backgroundOpacity: 0.15,
        showLabels: true,
        labelsAlign: 'left',
        labelsVerticalAlign: 'bottom',
        useOneColor: false,
        oneColor: '#2962ff',
        lineColor: '#2962ff',
        lineWidth: 1
      } : isTimeExtension ? {
        levels: JSON.parse(JSON.stringify(DEFAULT_FIB_TIME_EXTENSION_LEVELS)),
        showTrendline: true,
        trendlineColor: '#787B86',
        trendlineWidth: 1,
        trendlineStyle: 'dashed',
        filled: true,
        backgroundOpacity: 0.15,
        showLabels: true,
        labelsAlign: 'right',
        labelsVerticalAlign: 'bottom',
        useOneColor: false,
        oneColor: '#2962ff',
        lineColor: '#2962ff',
        lineWidth: 1
      } : isFibChannel ? {
        levels: JSON.parse(JSON.stringify(DEFAULT_FIB_CHANNEL_LEVELS)),
        levelLineStyle: 'solid',
        levelLineWidth: 1,
        lineWidth: 1,
        extendMode: 'none',
        extendLines: false,
        useOneColor: false,
        oneColor: '#2962ff',
        lineColor: '#2962ff',
        filled: true,
        backgroundOpacity: 0.15,
        showPrices: true,
        showPercentages: true,
        showLevels: true,
        levelsFormat: 'values',
        labelsAlign: 'left',
        labelsVerticalAlign: 'middle',
        fontSize: 12,
      } : isFibExtension ? {
        levels: JSON.parse(JSON.stringify(FIB_EXTENSION_LEVELS)),
        showTrendline: true,
        trendlineColor: '#787B86',
        trendlineWidth: 1,
        trendlineStyle: 'dashed',
        extendMode: 'none',
        extendLines: false,
        showPrices: true,
        showPercentages: true,
        levelsFormat: 'values',
        labelsAlign: 'right',
        labelsVerticalAlign: 'middle',
        fontSize: 12,
        filled: true,
        backgroundOpacity: 0.15,
        useOneColor: false,
        oneColor: '#2962ff',
        lineColor: '#2962ff',
        levelLineWidth: 1
      } : {
        levels: JSON.parse(JSON.stringify(DEFAULT_FIB_RETRACEMENT_LEVELS)),
        showTrendline: true,
        trendlineColor: '#787B86',
        trendlineWidth: 1,
        trendlineStyle: 'dashed',
        extendMode: 'none',
        extendLines: false,
        showPrices: true,
        showPercentages: true,
        levelsFormat: 'values',
        labelsAlign: 'right',
        labelsVerticalAlign: 'middle',
        fontSize: 12,
        filled: true,
        backgroundOpacity: 0.15,
        reverseDirection: false,
        logScale: false,
        useOneColor: false,
        oneColor: '#2962ff',
        lineColor: '#2962ff',
        levelLineWidth: 1
      };
      const nextState = {
        ...editingFibOverlay,
        ...defaultsObj
      };
      setEditingFibOverlay(nextState);
      updateFibOverlaySetting(defaultsObj);
    };

    const titleName = isAndrewsPitchfork
      ? "Pitchfork"
      : isSchiffPitchfork
        ? 'Schiff Pitchfork'
        : isModifiedSchiffPitchfork
          ? 'Modified Schiff Pitchfork'
          : isInsidePitchfork
            ? 'Inside Pitchfork'
            : isFibSpeedFan
              ? 'Speed Resistance Fan'
              : isFibSpiral
                ? 'Fib Spiral'
                : isPitchfan
                  ? 'Pitchfan'
                  : isFibWedge
                    ? 'Fib Wedge'
                    : isFibArcs
                      ? 'Fib Speed Resistance Arcs'
                      : isFibCircles
                        ? 'Fib Circles'
                        : isTimeZone
                          ? 'Fib Time Zone'
                          : isTimeExtension
                            ? 'Trend-Based Fib Time'
                            : isFibChannel
                              ? 'Fib Channel'
                              : editingFibOverlay.overlayName === 'fib-extension'
                                ? 'Fib Extension'
                                : 'Fib Retracement';

    const defaultLevels = isAnyPitchfork
      ? DEFAULT_PITCHFORK_LEVELS
      : isPitchfan
        ? DEFAULT_PITCHFAN_LEVELS
        : isFibWedge
          ? DEFAULT_FIB_WEDGE_LEVELS
          : isFibArcs
            ? DEFAULT_FIB_ARCS_LEVELS
            : isFibCircles
              ? DEFAULT_FIB_CIRCLES_LEVELS
              : isTimeZone
                ? DEFAULT_FIB_TIME_ZONE_LEVELS
                : isTimeExtension
                  ? DEFAULT_FIB_TIME_EXTENSION_LEVELS
                  : isFibChannel
                    ? DEFAULT_FIB_CHANNEL_LEVELS
                    : DEFAULT_FIB_RETRACEMENT_LEVELS;

    const rawLevels = editingFibOverlay.levels ?? defaultLevels;
    const levelsList: any[] = rawLevels.map((item: any) => {
      if (typeof item === 'number') {
        const found = defaultLevels.find((d: any) => d.value === item);
        return found ? { ...found } : { value: item, color: (isTimeZone || isTimeExtension) && item !== 0 ? '#2962FF' : '#787B86', enabled: true };
      }
      return { ...item };
    });

    const updateLevelItem = (index: number, changes: Partial<any>) => {
      const nextLevels = [...levelsList];
      nextLevels[index] = { ...nextLevels[index], ...changes };
      updateAndSaveFib({
        levels: nextLevels,
        intervals: nextLevels
      });
    };

    // Speed Fan specific Price and Time levels
    const rawPriceLevels = editingFibOverlay.priceLevels ?? DEFAULT_SPEED_FAN_PRICE_LEVELS;
    const priceLevelsList: any[] = rawPriceLevels.map((item: any, idx: number) => {
      if (typeof item === 'number') {
        const found = DEFAULT_SPEED_FAN_PRICE_LEVELS[idx] || { value: item, color: '#787B86', enabled: true };
        return { ...found };
      }
      return { ...item };
    });

    const updatePriceLevelItem = (index: number, changes: Partial<any>) => {
      const next = [...priceLevelsList];
      next[index] = { ...next[index], ...changes };
      updateAndSaveFib('priceLevels', next);
    };

    const rawTimeLevels = editingFibOverlay.timeLevels ?? DEFAULT_SPEED_FAN_TIME_LEVELS;
    const timeLevelsList: any[] = rawTimeLevels.map((item: any, idx: number) => {
      if (typeof item === 'number') {
        const found = DEFAULT_SPEED_FAN_TIME_LEVELS[idx] || { value: item, color: '#787B86', enabled: true };
        return { ...found };
      }
      return { ...item };
    });

    const updateTimeLevelItem = (index: number, changes: Partial<any>) => {
      const next = [...timeLevelsList];
      next[index] = { ...next[index], ...changes };
      updateAndSaveFib('timeLevels', next);
    };

    const leftColumnIndices = isFibChannel
      ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      : [0, 2, 4, 6, 8, 11, 12, 14, 15, 17, 19, 21];
    const rightColumnIndices = isFibChannel
      ? [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
      : [1, 3, 5, 7, 9, 10, 13, 16, 18, 20, 22, 23];

    const extendMode = editingFibOverlay.extendMode ?? (editingFibOverlay.extendLines ? 'both' : 'none');

    const modalWidth = (isTimeZone || isTimeExtension || isFibCircles || isFibArcs || isFibWedge || isPitchfan || isFibSpiral || isAnyPitchfork) ? 320 : isFibSpeedFan ? 350 : 430;
    const fibFullModalPos = modalPosMap['fibFullModal'] || {
      x: Math.max(10, Math.round(window.innerWidth / 2 - modalWidth / 2)),
      y: Math.max(10, Math.round(window.innerHeight / 2 - 250))
    };

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          zIndex: 200000,
          userSelect: 'none',
          pointerEvents: 'auto'
        }}
        onClick={handleCancelFib}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: `${fibFullModalPos.x}px`,
            top: `${fibFullModalPos.y}px`,
            width: `${modalWidth}px`,
            maxHeight: '90vh',
            backgroundColor: '#161720',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
            color: '#d1d4dc',
            fontFamily: "'Rubik', sans-serif",
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            onMouseDown={(e) => handleModalHeaderMouseDown('fibFullModal', e, modalWidth, 500)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: '#11131a',
              cursor: 'move',
              userSelect: 'none'
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '15px', color: '#ffffff', letterSpacing: '0.3px' }}>{titleName}</span>
            <button
              onClick={handleCancelFib}
              title="Close"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#868993',
                cursor: 'pointer',
                borderRadius: '6px',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.backgroundColor = 'rgba(242, 54, 69, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(242, 54, 69, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#868993';
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* Body for Pitchforks (Andrews, Schiff, Modified Schiff, Inside) */}
          {isAnyPitchfork ? (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '78vh', overflowY: 'auto', backgroundColor: '#161720' }}>
              {/* Extend lines checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', paddingBottom: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.extendLines ?? false}
                  onChange={(val) => updateAndSaveFib('extendLines', val)}
                  label="Extend lines"
                />
              </div>

              {/* Median row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span style={{ fontSize: '13px', color: '#d1d4dc', fontWeight: 500 }}>Median</span>
                <ColorStylePicker
                  color={editingFibOverlay.medianColor || '#F23645'}
                  opacity={1.0}
                  style={editingFibOverlay.medianStyle || 'solid'}
                  hideStyleSelector={false}
                  onChange={(newColor, _op, newStyle) => {
                    updateAndSaveFib({
                      medianColor: newColor,
                      medianStyle: newStyle
                    });
                  }}
                />
              </div>

              {/* 9 Level rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {levelsList.map((item: any, idx: number) => {
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CustomCheckbox
                          checked={item.enabled !== false}
                          onChange={(val) => updateLevelItem(idx, { enabled: val })}
                        />
                        <input
                          type="number"
                          step="any"
                          value={item.value}
                          onChange={(e) => updateLevelItem(idx, { value: parseFloat(e.target.value) || 0 })}
                          style={{
                            width: '56px',
                            backgroundColor: '#161922',
                            border: '1px solid #2a2e39',
                            borderRadius: '6px',
                            color: item.enabled !== false ? '#d1d4dc' : '#6b7280',
                            fontSize: '12px',
                            padding: '3px 6px',
                            outline: 'none'
                          }}
                        />
                      </div>
                      <ColorStylePicker
                        color={item.color || '#2962FF'}
                        opacity={1.0}
                        style={item.style || 'solid'}
                        hideStyleSelector={false}
                        onChange={(newColor, _op, newStyle) => {
                          updateLevelItem(idx, { color: newColor, style: newStyle });
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Use one color */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px' }}>
                <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Use one color</span>
                <ColorStylePicker
                  color={editingFibOverlay.oneColor || '#2962FF'}
                  opacity={1.0}
                  hideStyleSelector={true}
                  onChange={(newColor) => {
                    const next = levelsList.map((lvl: any) => ({ ...lvl, color: newColor }));
                    updateAndSaveFib({
                      useOneColor: true,
                      oneColor: newColor,
                      lineColor: newColor,
                      levels: next,
                      intervals: next
                    });
                  }}
                />
              </div>

              {/* Background */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.filled ?? true}
                  onChange={(val) => updateAndSaveFib('filled', val)}
                  label="Background"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: (editingFibOverlay.filled ?? true) ? 1 : 0.4 }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    disabled={!(editingFibOverlay.filled ?? true)}
                    value={Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}
                    onChange={(e) => updateAndSaveFib('backgroundOpacity', parseFloat((parseInt(e.target.value) / 100).toFixed(2)))}
                    style={{
                      width: '90px',
                      accentColor: '#2962ff',
                      cursor: 'pointer'
                    }}
                  />
                </div>
              </div>
            </div>
          ) : isFibSpeedFan ? (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '78vh', overflowY: 'auto', backgroundColor: '#161720' }}>
              {/* PRICE LEVELS Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#787B86', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                  Price Levels
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
                  {/* Left Col: 0, 0.382, 0.618, 1 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[0, 2, 4, 6].map((idx) => {
                      const item = priceLevelsList[idx];
                      if (!item) return null;
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CustomCheckbox
                              checked={item.enabled !== false}
                              onChange={(val) => updatePriceLevelItem(idx, { enabled: val })}
                            />
                            <input
                              type="number"
                              step="any"
                              value={item.value}
                              onChange={(e) => updatePriceLevelItem(idx, { value: parseFloat(e.target.value) || 0 })}
                              style={{
                                width: '56px',
                                backgroundColor: '#161922',
                                border: '1px solid #2a2e39',
                                borderRadius: '6px',
                                color: item.enabled !== false ? '#d1d4dc' : '#6b7280',
                                fontSize: '12px',
                                padding: '3px 6px',
                                outline: 'none'
                              }}
                            />
                          </div>
                          <ColorStylePicker
                            color={item.color || '#787B86'}
                            opacity={1.0}
                            hideStyleSelector={true}
                            onChange={(newColor) => {
                              updatePriceLevelItem(idx, { color: newColor });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Right Col: 0.25, 0.5, 0.75 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[1, 3, 5].map((idx) => {
                      const item = priceLevelsList[idx];
                      if (!item) return null;
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CustomCheckbox
                              checked={item.enabled !== false}
                              onChange={(val) => updatePriceLevelItem(idx, { enabled: val })}
                            />
                            <input
                              type="number"
                              step="any"
                              value={item.value}
                              onChange={(e) => updatePriceLevelItem(idx, { value: parseFloat(e.target.value) || 0 })}
                              style={{
                                width: '56px',
                                backgroundColor: '#161922',
                                border: '1px solid #2a2e39',
                                borderRadius: '6px',
                                color: item.enabled !== false ? '#d1d4dc' : '#6b7280',
                                fontSize: '12px',
                                padding: '3px 6px',
                                outline: 'none'
                              }}
                            />
                          </div>
                          <ColorStylePicker
                            color={item.color || '#787B86'}
                            opacity={1.0}
                            hideStyleSelector={true}
                            onChange={(newColor) => {
                              updatePriceLevelItem(idx, { color: newColor });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Left labels & Right labels */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
                  <CustomCheckbox
                    checked={editingFibOverlay.showLeftLabels ?? true}
                    onChange={(val) => updateAndSaveFib('showLeftLabels', val)}
                    label="Left labels"
                  />
                  <CustomCheckbox
                    checked={editingFibOverlay.showRightLabels ?? true}
                    onChange={(val) => updateAndSaveFib('showRightLabels', val)}
                    label="Right labels"
                  />
                </div>
              </div>

              {/* TIME LEVELS Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#787B86', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                  Time Levels
                </span>
                <div style={{ gridTemplateColumns: '1fr 1fr', display: 'grid', gap: '8px 14px' }}>
                  {/* Left Col: 0, 0.382, 0.618, 1 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[0, 2, 4, 6].map((idx) => {
                      const item = timeLevelsList[idx];
                      if (!item) return null;
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CustomCheckbox
                              checked={item.enabled !== false}
                              onChange={(val) => updateTimeLevelItem(idx, { enabled: val })}
                            />
                            <input
                              type="number"
                              step="any"
                              value={item.value}
                              onChange={(e) => updateTimeLevelItem(idx, { value: parseFloat(e.target.value) || 0 })}
                              style={{
                                width: '56px',
                                backgroundColor: '#161922',
                                border: '1px solid #2a2e39',
                                borderRadius: '6px',
                                color: item.enabled !== false ? '#d1d4dc' : '#6b7280',
                                fontSize: '12px',
                                padding: '3px 6px',
                                outline: 'none'
                              }}
                            />
                          </div>
                          <ColorStylePicker
                            color={item.color || '#787B86'}
                            opacity={1.0}
                            hideStyleSelector={true}
                            onChange={(newColor) => {
                              updateTimeLevelItem(idx, { color: newColor });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Right Col: 0.25, 0.5, 0.75 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[1, 3, 5].map((idx) => {
                      const item = timeLevelsList[idx];
                      if (!item) return null;
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CustomCheckbox
                              checked={item.enabled !== false}
                              onChange={(val) => updateTimeLevelItem(idx, { enabled: val })}
                            />
                            <input
                              type="number"
                              step="any"
                              value={item.value}
                              onChange={(e) => updateTimeLevelItem(idx, { value: parseFloat(e.target.value) || 0 })}
                              style={{
                                width: '56px',
                                backgroundColor: '#161922',
                                border: '1px solid #2a2e39',
                                borderRadius: '6px',
                                color: item.enabled !== false ? '#d1d4dc' : '#6b7280',
                                fontSize: '12px',
                                padding: '3px 6px',
                                outline: 'none'
                              }}
                            />
                          </div>
                          <ColorStylePicker
                            color={item.color || '#787B86'}
                            opacity={1.0}
                            hideStyleSelector={true}
                            onChange={(newColor) => {
                              updateTimeLevelItem(idx, { color: newColor });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top labels & Bottom labels */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
                  <CustomCheckbox
                    checked={editingFibOverlay.showTopLabels ?? true}
                    onChange={(val) => updateAndSaveFib('showTopLabels', val)}
                    label="Top labels"
                  />
                  <CustomCheckbox
                    checked={editingFibOverlay.showBottomLabels ?? true}
                    onChange={(val) => updateAndSaveFib('showBottomLabels', val)}
                    label="Bottom labels"
                  />
                </div>
              </div>

              {/* Use one color */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px' }}>
                <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Use one color</span>
                <ColorStylePicker
                  color={editingFibOverlay.oneColor || '#2962ff'}
                  opacity={1.0}
                  hideStyleSelector={true}
                  onChange={(newColor) => {
                    const nextPrice = priceLevelsList.map((lvl: any) => ({ ...lvl, color: newColor }));
                    const nextTime = timeLevelsList.map((lvl: any) => ({ ...lvl, color: newColor }));
                    updateAndSaveFib({
                      useOneColor: true,
                      oneColor: newColor,
                      lineColor: newColor,
                      priceLevels: nextPrice,
                      timeLevels: nextTime
                    });
                  }}
                />
              </div>

              {/* Background */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.filled ?? true}
                  onChange={(val) => updateAndSaveFib('filled', val)}
                  label="Background"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: (editingFibOverlay.filled ?? true) ? 1 : 0.4 }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    disabled={!(editingFibOverlay.filled ?? true)}
                    value={Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}
                    onChange={(e) => updateAndSaveFib('backgroundOpacity', parseFloat((parseInt(e.target.value) / 100).toFixed(2)))}
                    style={{
                      width: '90px',
                      accentColor: '#2962ff',
                      cursor: 'pointer'
                    }}
                  />
                </div>
              </div>

              {/* Grid */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.showGrid ?? true}
                  onChange={(val) => updateAndSaveFib('showGrid', val)}
                  label="Grid"
                />
                <ColorStylePicker
                  color={editingFibOverlay.gridColor || '#2962FF'}
                  opacity={1.0}
                  style={editingFibOverlay.gridStyle || 'solid'}
                  hideStyleSelector={false}
                  onChange={(newColor, _op, newStyle) => {
                    updateAndSaveFib({
                      gridColor: newColor,
                      gridStyle: newStyle
                    });
                  }}
                />
              </div>

              {/* Reverse */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.reverse ?? false}
                  onChange={(val) => updateAndSaveFib('reverse', val)}
                  label="Reverse"
                />
              </div>
            </div>
          ) : isFibSpiral ? (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#161720' }}>
              {/* Spiral Line row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span style={{ fontSize: '13px', color: '#d1d4dc', fontWeight: 500 }}>Line</span>
                <ColorStylePicker
                  color={editingFibOverlay.lineColor || '#2962ff'}
                  opacity={1.0}
                  style={editingFibOverlay.lineStyle || 'solid'}
                  hideStyleSelector={false}
                  onChange={(newColor, _op, newStyle) => {
                    updateAndSaveFib({
                      lineColor: newColor,
                      lineStyle: newStyle
                    });
                  }}
                />
              </div>

              {/* Trend line row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.showTrendline ?? true}
                  onChange={(val) => updateAndSaveFib('showTrendline', val)}
                  label="Trend line"
                />
                <ColorStylePicker
                  color={editingFibOverlay.trendlineColor || '#787B86'}
                  opacity={1.0}
                  style={editingFibOverlay.trendlineStyle || 'dashed'}
                  hideStyleSelector={false}
                  onChange={(newColor, _op, newStyle) => {
                    updateAndSaveFib({
                      trendlineColor: newColor,
                      trendlineStyle: newStyle
                    });
                  }}
                />
              </div>

              {/* Counterclockwise checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', marginTop: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.counterclockwise ?? false}
                  onChange={(val) => updateAndSaveFib({ counterclockwise: val, clockwise: !val })}
                  label="Counterclockwise"
                />
              </div>
            </div>
          ) : isPitchfan ? (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', backgroundColor: '#161720' }}>
              {/* Median line row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span style={{ fontSize: '13px', color: '#d1d4dc', fontWeight: 500 }}>Median</span>
                <ColorStylePicker
                  color={editingFibOverlay.medianColor || '#F23645'}
                  opacity={1.0}
                  style={editingFibOverlay.medianStyle || 'solid'}
                  hideStyleSelector={false}
                  onChange={(newColor, _op, newStyle) => {
                    updateAndSaveFib({
                      medianColor: newColor,
                      medianStyle: newStyle
                    });
                  }}
                />
              </div>

              {/* Vertical list of Pitchfan levels */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '340px',
                  overflowY: 'auto',
                  paddingRight: '4px'
                }}
              >
                {levelsList.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CustomCheckbox
                        checked={item.enabled !== false}
                        onChange={(val) => updateLevelItem(idx, { enabled: val })}
                      />
                      <input
                        type="number"
                        step="any"
                        value={item.value}
                        onChange={(e) => updateLevelItem(idx, { value: parseFloat(e.target.value) || 0 })}
                        style={{
                          width: '74px',
                          backgroundColor: '#161922',
                          border: '1px solid #2a2e39',
                          borderRadius: '6px',
                          color: item.enabled !== false ? '#d1d4dc' : '#6b7280',
                          fontSize: '13px',
                          padding: '4px 8px',
                          outline: 'none'
                        }}
                      />
                    </div>
                    <ColorStylePicker
                      color={item.color || '#2962FF'}
                      opacity={1.0}
                      style={item.lineStyle || 'solid'}
                      hideStyleSelector={false}
                      onChange={(newColor, _op, newStyle) => {
                        updateLevelItem(idx, { color: newColor, lineStyle: newStyle });
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Use one color */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Use one color</span>
                <ColorStylePicker
                  color={editingFibOverlay.oneColor || '#2962ff'}
                  opacity={1.0}
                  hideStyleSelector={true}
                  onChange={(newColor) => {
                    const nextLevels = levelsList.map((lvl: any) => ({ ...lvl, color: newColor }));
                    updateAndSaveFib({
                      useOneColor: true,
                      oneColor: newColor,
                      lineColor: newColor,
                      levels: nextLevels,
                      intervals: nextLevels
                    });
                  }}
                />
              </div>

              {/* Background & Opacity Slider */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.filled ?? true}
                  onChange={(val) => updateAndSaveFib('filled', val)}
                  label="Background"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: (editingFibOverlay.filled ?? true) ? 1 : 0.4 }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    disabled={!(editingFibOverlay.filled ?? true)}
                    value={Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}
                    onChange={(e) => updateAndSaveFib('backgroundOpacity', parseFloat((parseInt(e.target.value) / 100).toFixed(2)))}
                    style={{
                      width: '100px',
                      accentColor: '#2962ff',
                      cursor: 'pointer'
                    }}
                  />
                  <span style={{ fontSize: '12px', minWidth: '32px', textAlign: 'right', color: '#9db2ce', fontWeight: 500 }}>
                    {Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}%
                  </span>
                </div>
              </div>

              {/* Levels (labels) */}
              <div style={{ display: 'flex', alignItems: 'center', marginTop: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.showLabels ?? true}
                  onChange={(val) => updateAndSaveFib('showLabels', val)}
                  label="Labels"
                />
              </div>
            </div>
          ) : isFibWedge ? (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', backgroundColor: '#161720' }}>
              {/* Trend line row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.showTrendline ?? true}
                  onChange={(val) => updateAndSaveFib('showTrendline', val)}
                  label="Trend line"
                />
                <ColorStylePicker
                  color={editingFibOverlay.trendlineColor || '#787B86'}
                  opacity={1.0}
                  style={editingFibOverlay.trendlineStyle || 'solid'}
                  hideStyleSelector={false}
                  onChange={(newColor, _op, newStyle) => {
                    updateAndSaveFib({
                      trendlineColor: newColor,
                      trendlineStyle: newStyle
                    });
                  }}
                />
              </div>

              {/* Vertical list of Fibonacci wedge levels */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '340px',
                  overflowY: 'auto',
                  paddingRight: '4px'
                }}
              >
                {levelsList.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CustomCheckbox
                        checked={item.enabled !== false}
                        onChange={(val) => updateLevelItem(idx, { enabled: val })}
                      />
                      <input
                        type="number"
                        step="any"
                        value={item.value}
                        onChange={(e) => updateLevelItem(idx, { value: parseFloat(e.target.value) || 0 })}
                        style={{
                          width: '74px',
                          backgroundColor: '#161922',
                          border: '1px solid #2a2e39',
                          borderRadius: '6px',
                          color: item.enabled !== false ? '#d1d4dc' : '#6b7280',
                          fontSize: '13px',
                          padding: '4px 8px',
                          outline: 'none'
                        }}
                      />
                    </div>
                    <ColorStylePicker
                      color={item.color || '#2962FF'}
                      opacity={1.0}
                      style={item.lineStyle || 'solid'}
                      hideStyleSelector={false}
                      onChange={(newColor, _op, newStyle) => {
                        updateLevelItem(idx, { color: newColor, lineStyle: newStyle });
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Use one color */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Use one color</span>
                <ColorStylePicker
                  color={editingFibOverlay.oneColor || '#2962ff'}
                  opacity={1.0}
                  hideStyleSelector={true}
                  onChange={(newColor) => {
                    const nextLevels = levelsList.map((lvl: any) => ({ ...lvl, color: newColor }));
                    updateAndSaveFib({
                      useOneColor: true,
                      oneColor: newColor,
                      lineColor: newColor,
                      levels: nextLevels,
                      intervals: nextLevels
                    });
                  }}
                />
              </div>

              {/* Background & Opacity Slider */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.filled ?? true}
                  onChange={(val) => updateAndSaveFib('filled', val)}
                  label="Background"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: (editingFibOverlay.filled ?? true) ? 1 : 0.4 }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    disabled={!(editingFibOverlay.filled ?? true)}
                    value={Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}
                    onChange={(e) => updateAndSaveFib('backgroundOpacity', parseFloat((parseInt(e.target.value) / 100).toFixed(2)))}
                    style={{
                      width: '100px',
                      accentColor: '#2962ff',
                      cursor: 'pointer'
                    }}
                  />
                  <span style={{ fontSize: '12px', minWidth: '32px', textAlign: 'right', color: '#9db2ce', fontWeight: 500 }}>
                    {Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}%
                  </span>
                </div>
              </div>

              {/* Levels (labels) */}
              <div style={{ display: 'flex', alignItems: 'center', marginTop: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.showLabels ?? true}
                  onChange={(val) => updateAndSaveFib('showLabels', val)}
                  label="Levels"
                />
              </div>
            </div>
          ) : isFibArcs ? (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', backgroundColor: '#161720' }}>
              {/* Trend line row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.showTrendline ?? true}
                  onChange={(val) => updateAndSaveFib('showTrendline', val)}
                  label="Trend line"
                />
                <ColorStylePicker
                  color={editingFibOverlay.trendlineColor || '#787B86'}
                  opacity={1.0}
                  style={editingFibOverlay.trendlineStyle || 'dashed'}
                  hideStyleSelector={false}
                  onChange={(newColor, _op, newStyle) => {
                    updateAndSaveFib({
                      trendlineColor: newColor,
                      trendlineStyle: newStyle
                    });
                  }}
                />
              </div>

              {/* Vertical list of Fibonacci arc levels */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '340px',
                  overflowY: 'auto',
                  paddingRight: '4px'
                }}
              >
                {levelsList.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CustomCheckbox
                        checked={item.enabled !== false}
                        onChange={(val) => updateLevelItem(idx, { enabled: val })}
                      />
                      <input
                        type="number"
                        step="any"
                        value={item.value}
                        onChange={(e) => updateLevelItem(idx, { value: parseFloat(e.target.value) || 0 })}
                        style={{
                          width: '74px',
                          backgroundColor: '#161922',
                          border: '1px solid #2a2e39',
                          borderRadius: '6px',
                          color: item.enabled !== false ? '#d1d4dc' : '#6b7280',
                          fontSize: '13px',
                          padding: '4px 8px',
                          outline: 'none'
                        }}
                      />
                    </div>
                    <ColorStylePicker
                      color={item.color || '#2962FF'}
                      opacity={1.0}
                      style={item.lineStyle || 'solid'}
                      hideStyleSelector={false}
                      onChange={(newColor, _op, newStyle) => {
                        updateLevelItem(idx, { color: newColor, lineStyle: newStyle });
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Use one color */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Use one color</span>
                <ColorStylePicker
                  color={editingFibOverlay.oneColor || '#2962ff'}
                  opacity={1.0}
                  hideStyleSelector={true}
                  onChange={(newColor) => {
                    const nextLevels = levelsList.map((lvl: any) => ({ ...lvl, color: newColor }));
                    updateAndSaveFib({
                      useOneColor: true,
                      oneColor: newColor,
                      lineColor: newColor,
                      levels: nextLevels,
                      intervals: nextLevels
                    });
                  }}
                />
              </div>

              {/* Background & Opacity Slider */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.filled ?? true}
                  onChange={(val) => updateAndSaveFib('filled', val)}
                  label="Background"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: (editingFibOverlay.filled ?? true) ? 1 : 0.4 }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    disabled={!(editingFibOverlay.filled ?? true)}
                    value={Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}
                    onChange={(e) => updateAndSaveFib('backgroundOpacity', parseFloat((parseInt(e.target.value) / 100).toFixed(2)))}
                    style={{
                      width: '100px',
                      accentColor: '#2962ff',
                      cursor: 'pointer'
                    }}
                  />
                  <span style={{ fontSize: '12px', minWidth: '32px', textAlign: 'right', color: '#9db2ce', fontWeight: 500 }}>
                    {Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}%
                  </span>
                </div>
              </div>

              {/* Levels (labels) */}
              <div style={{ display: 'flex', alignItems: 'center', marginTop: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.showLabels ?? true}
                  onChange={(val) => updateAndSaveFib('showLabels', val)}
                  label="Levels"
                />
              </div>

              {/* Full circles */}
              <div style={{ display: 'flex', alignItems: 'center', marginTop: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.fullCircles ?? editingFibOverlay.fullCircle ?? false}
                  onChange={(val) => updateAndSaveFib({ fullCircles: val, fullCircle: val })}
                  label="Full circles"
                />
              </div>
            </div>
          ) : isFibCircles ? (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', backgroundColor: '#161720' }}>
              {/* Trend line row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.showTrendline ?? true}
                  onChange={(val) => updateAndSaveFib('showTrendline', val)}
                  label="Trend line"
                />
                <ColorStylePicker
                  color={editingFibOverlay.trendlineColor || '#787B86'}
                  opacity={1.0}
                  style={editingFibOverlay.trendlineStyle || 'dashed'}
                  hideStyleSelector={false}
                  onChange={(newColor, _op, newStyle) => {
                    updateAndSaveFib({
                      trendlineColor: newColor,
                      trendlineStyle: newStyle
                    });
                  }}
                />
              </div>

              {/* Vertical list of Fibonacci circle levels */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '340px',
                  overflowY: 'auto',
                  paddingRight: '4px'
                }}
              >
                {levelsList.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CustomCheckbox
                        checked={item.enabled !== false}
                        onChange={(val) => updateLevelItem(idx, { enabled: val })}
                      />
                      <input
                        type="number"
                        step="any"
                        value={item.value}
                        onChange={(e) => updateLevelItem(idx, { value: parseFloat(e.target.value) || 0 })}
                        style={{
                          width: '74px',
                          backgroundColor: '#161922',
                          border: '1px solid #2a2e39',
                          borderRadius: '6px',
                          color: item.enabled !== false ? '#d1d4dc' : '#6b7280',
                          fontSize: '13px',
                          padding: '4px 8px',
                          outline: 'none'
                        }}
                      />
                    </div>
                    <ColorStylePicker
                      color={item.color || '#2962FF'}
                      opacity={1.0}
                      style={item.lineStyle || 'solid'}
                      hideStyleSelector={false}
                      onChange={(newColor, _op, newStyle) => {
                        updateLevelItem(idx, { color: newColor, lineStyle: newStyle });
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Use one color */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Use one color</span>
                <ColorStylePicker
                  color={editingFibOverlay.oneColor || '#2962ff'}
                  opacity={1.0}
                  hideStyleSelector={true}
                  onChange={(newColor) => {
                    const nextLevels = levelsList.map((lvl: any) => ({ ...lvl, color: newColor }));
                    updateAndSaveFib({
                      useOneColor: true,
                      oneColor: newColor,
                      lineColor: newColor,
                      levels: nextLevels,
                      intervals: nextLevels
                    });
                  }}
                />
              </div>

              {/* Background & Opacity Slider */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.filled ?? true}
                  onChange={(val) => updateAndSaveFib('filled', val)}
                  label="Background"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: (editingFibOverlay.filled ?? true) ? 1 : 0.4 }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    disabled={!(editingFibOverlay.filled ?? true)}
                    value={Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}
                    onChange={(e) => updateAndSaveFib('backgroundOpacity', parseFloat((parseInt(e.target.value) / 100).toFixed(2)))}
                    style={{
                      width: '100px',
                      accentColor: '#2962ff',
                      cursor: 'pointer'
                    }}
                  />
                  <span style={{ fontSize: '12px', minWidth: '32px', textAlign: 'right', color: '#9db2ce', fontWeight: 500 }}>
                    {Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}%
                  </span>
                </div>
              </div>

              {/* Levels (labels) */}
              <div style={{ display: 'flex', alignItems: 'center', marginTop: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.showLabels ?? true}
                  onChange={(val) => updateAndSaveFib('showLabels', val)}
                  label="Levels"
                />
              </div>

              {/* Coeffs as percents */}
              <div style={{ display: 'flex', alignItems: 'center', marginTop: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.coeffsAsPercents ?? false}
                  onChange={(val) => updateAndSaveFib('coeffsAsPercents', val)}
                  label="Coeffs as percents"
                />
              </div>
            </div>
          ) : isTimeZone || isTimeExtension ? (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', backgroundColor: '#161720' }}>
              {/* Trend line row (for Trend-Based Fib Time) */}
              {isTimeExtension && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <CustomCheckbox
                    checked={editingFibOverlay.showTrendline ?? true}
                    onChange={(val) => updateAndSaveFib('showTrendline', val)}
                    label="Trend line"
                  />
                  <ColorStylePicker
                    color={editingFibOverlay.trendlineColor || '#787B86'}
                    opacity={1.0}
                    style={editingFibOverlay.trendlineStyle || 'dashed'}
                    hideStyleSelector={false}
                    onChange={(newColor, _op, newStyle) => {
                      updateAndSaveFib({
                        trendlineColor: newColor,
                        trendlineStyle: newStyle
                      });
                    }}
                  />
                </div>
              )}

              {/* Vertical list of Fibonacci time levels */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '340px',
                  overflowY: 'auto',
                  paddingRight: '4px'
                }}
              >
                {levelsList.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CustomCheckbox
                        checked={item.enabled !== false}
                        onChange={(val) => updateLevelItem(idx, { enabled: val })}
                      />
                      <input
                        type="number"
                        step="any"
                        value={item.value}
                        onChange={(e) => updateLevelItem(idx, { value: parseFloat(e.target.value) || 0 })}
                        style={{
                          width: '74px',
                          backgroundColor: '#161922',
                          border: '1px solid #2a2e39',
                          borderRadius: '6px',
                          color: item.enabled !== false ? '#d1d4dc' : '#6b7280',
                          fontSize: '13px',
                          padding: '4px 8px',
                          outline: 'none'
                        }}
                      />
                    </div>
                    <ColorStylePicker
                      color={item.color || (idx === 0 ? '#787B86' : '#2962FF')}
                      opacity={1.0}
                      style={item.lineStyle || 'solid'}
                      hideStyleSelector={false}
                      onChange={(newColor, _op, newStyle) => {
                        updateLevelItem(idx, { color: newColor, lineStyle: newStyle });
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Use one color */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Use one color</span>
                <ColorStylePicker
                  color={editingFibOverlay.oneColor || '#2962ff'}
                  opacity={1.0}
                  hideStyleSelector={true}
                  onChange={(newColor) => {
                    const nextLevels = levelsList.map((lvl: any) => ({ ...lvl, color: newColor }));
                    updateAndSaveFib({
                      useOneColor: true,
                      oneColor: newColor,
                      lineColor: newColor,
                      levels: nextLevels,
                      intervals: nextLevels
                    });
                  }}
                />
              </div>

              {/* Background & Opacity Slider */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.filled ?? true}
                  onChange={(val) => updateAndSaveFib('filled', val)}
                  label="Background"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: (editingFibOverlay.filled ?? true) ? 1 : 0.4 }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    disabled={!(editingFibOverlay.filled ?? true)}
                    value={Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}
                    onChange={(e) => updateAndSaveFib('backgroundOpacity', parseFloat((parseInt(e.target.value) / 100).toFixed(2)))}
                    style={{
                      width: '100px',
                      accentColor: '#2962ff',
                      cursor: 'pointer'
                    }}
                  />
                  <span style={{ fontSize: '12px', minWidth: '32px', textAlign: 'right', color: '#9db2ce', fontWeight: 500 }}>
                    {Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}%
                  </span>
                </div>
              </div>

              {/* Labels & Alignments */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.showLabels ?? true}
                  onChange={(val) => updateAndSaveFib('showLabels', val)}
                  label="Labels"
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <CustomDropdown
                    value={editingFibOverlay.labelsAlign ?? (isTimeExtension ? 'right' : 'left')}
                    options={[
                      { value: 'left', label: 'Left' },
                      { value: 'center', label: 'Center' },
                      { value: 'right', label: 'Right' }
                    ]}
                    onChange={(val) => updateAndSaveFib('labelsAlign', val)}
                    width={85}
                    height={28}
                  />
                  <CustomDropdown
                    value={editingFibOverlay.labelsVerticalAlign ?? 'bottom'}
                    options={[
                      { value: 'top', label: 'Top' },
                      { value: 'middle', label: 'Middle' },
                      { value: 'bottom', label: 'Bottom' }
                    ]}
                    onChange={(val) => updateAndSaveFib('labelsVerticalAlign', val)}
                    width={90}
                    height={28}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Body for standard Retracement / Extension / Channel */
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', backgroundColor: '#161720' }}>
              {/* 1. Trend line (Hidden for Fib Channel) */}
              {!isFibChannel && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <CustomCheckbox
                    checked={editingFibOverlay.showTrendline ?? true}
                    onChange={(val) => updateAndSaveFib('showTrendline', val)}
                    label="Trend line"
                  />

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ColorStylePicker
                      color={editingFibOverlay.trendlineColor || editingFibOverlay.lineColor || '#787B86'}
                      opacity={1.0}
                      hideStyleSelector={true}
                      onChange={(newColor) => updateAndSaveFib('trendlineColor', newColor)}
                    />
                    <CustomDropdown
                      value={editingFibOverlay.trendlineWidth ?? 1}
                      options={[
                        { value: 1, label: '1px' },
                        { value: 2, label: '2px' },
                        { value: 3, label: '3px' },
                        { value: 4, label: '4px' }
                      ]}
                      onChange={(val) => updateAndSaveFib('trendlineWidth', Number(val))}
                      width={72}
                      height={28}
                    />
                    <CustomDropdown
                      value={editingFibOverlay.trendlineStyle ?? 'dashed'}
                      options={[
                        { value: 'solid', label: '—— Solid' },
                        { value: 'dashed', label: '---- Dashed' },
                        { value: 'dotted', label: '.... Dotted' }
                      ]}
                      onChange={(val) => updateAndSaveFib('trendlineStyle', val)}
                      width={116}
                      height={28}
                    />
                  </div>
                </div>
              )}

              {/* 2. Levels line */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px' }}>Levels line</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CustomDropdown
                    value={editingFibOverlay.levelLineStyle ?? 'solid'}
                    options={[
                      { value: 'solid', label: '—— Solid' },
                      { value: 'dashed', label: '---- Dashed' },
                      { value: 'dotted', label: '.... Dotted' }
                    ]}
                    onChange={(val) => updateAndSaveFib('levelLineStyle', val)}
                    width={116}
                    height={28}
                  />
                  <CustomDropdown
                    value={editingFibOverlay.levelLineWidth ?? 1}
                    options={[
                      { value: 1, label: '1px' },
                      { value: 2, label: '2px' },
                      { value: 3, label: '3px' },
                      { value: 4, label: '4px' }
                    ]}
                    onChange={(val) => updateAndSaveFib('levelLineWidth', Number(val))}
                    width={72}
                    height={28}
                  />
                </div>
              </div>

              {/* 3. Extend */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px' }}>Extend</span>
                <CustomDropdown
                  value={extendMode}
                  options={[
                    { value: 'none', label: "Don't extend" },
                    { value: 'right', label: 'Extend lines right' },
                    { value: 'left', label: 'Extend lines left' },
                    { value: 'both', label: isFibChannel ? 'Extend lines both' : 'Extend lines' }
                  ]}
                  onChange={(val) => {
                    updateAndSaveFib({
                      extendMode: val,
                      extendLines: val !== 'none'
                    });
                  }}
                  width={150}
                  height={28}
                />
              </div>

              {/* 4. 2-Column Fibonacci Levels Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px 14px',
                  padding: '10px 0',
                  borderTop: '1px solid #2a2e39',
                  borderBottom: '1px solid #2a2e39'
                }}
              >
                {/* Left Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {leftColumnIndices.map((idx) => {
                    const item = levelsList[idx];
                    if (!item) return null;
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CustomCheckbox
                            checked={item.enabled !== false}
                            onChange={(val) => updateLevelItem(idx, { enabled: val })}
                          />
                          <input
                            type="text"
                            value={item.value}
                            onChange={(e) => updateLevelItem(idx, { value: parseFloat(e.target.value) || 0 })}
                            style={{
                              width: '64px',
                              backgroundColor: '#1c2030',
                              border: '1px solid #2a2e39',
                              borderRadius: '4px',
                              color: item.enabled !== false ? '#d1d4dc' : '#6b7280',
                              fontSize: '12px',
                              padding: '3px 6px',
                              outline: 'none'
                            }}
                          />
                        </div>
                        <ColorStylePicker
                          color={item.color}
                          opacity={1.0}
                          hideStyleSelector={true}
                          onChange={(newColor) => updateLevelItem(idx, { color: newColor })}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Right Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {rightColumnIndices.map((idx) => {
                    const item = levelsList[idx];
                    if (!item) return null;
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CustomCheckbox
                            checked={item.enabled !== false}
                            onChange={(val) => updateLevelItem(idx, { enabled: val })}
                          />
                          <input
                            type="text"
                            value={item.value}
                            onChange={(e) => updateLevelItem(idx, { value: parseFloat(e.target.value) || 0 })}
                            style={{
                              width: '64px',
                              backgroundColor: '#1c2030',
                              border: '1px solid #2a2e39',
                              borderRadius: '4px',
                              color: item.enabled !== false ? '#d1d4dc' : '#6b7280',
                              fontSize: '12px',
                              padding: '3px 6px',
                              outline: 'none'
                            }}
                          />
                        </div>
                        <ColorStylePicker
                          color={item.color}
                          opacity={1.0}
                          hideStyleSelector={true}
                          onChange={(newColor) => updateLevelItem(idx, { color: newColor })}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Use one color */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                <span style={{ fontSize: '13px' }}>Use one color</span>
                <ColorStylePicker
                  color={editingFibOverlay.oneColor || '#2962ff'}
                  opacity={1.0}
                  hideStyleSelector={true}
                  onChange={(newColor) => {
                    const nextLevels = levelsList.map((lvl: any) => ({ ...lvl, color: newColor }));
                    updateAndSaveFib({
                      useOneColor: true,
                      oneColor: newColor,
                      lineColor: newColor,
                      levels: nextLevels
                    });
                  }}
                />
              </div>

              {/* 5. Background & Opacity Slider */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.filled ?? true}
                  onChange={(val) => updateAndSaveFib('filled', val)}
                  label="Background"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: (editingFibOverlay.filled ?? true) ? 1 : 0.4 }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    disabled={!(editingFibOverlay.filled ?? true)}
                    value={Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}
                    onChange={(e) => updateAndSaveFib('backgroundOpacity', parseFloat((parseInt(e.target.value) / 100).toFixed(2)))}
                    style={{ width: '100px', accentColor: '#2962ff', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '12px', minWidth: '32px', textAlign: 'right', color: '#9db2ce' }}>
                    {Math.round((editingFibOverlay.backgroundOpacity ?? 0.15) * 100)}%
                  </span>
                </div>
              </div>

              {/* 6. Reverse (Hidden for Fib Extension & Fib Channel) */}
              {editingFibOverlay.overlayName !== 'fib-extension' && !isFibChannel && (
                <CustomCheckbox
                  checked={editingFibOverlay.reverseDirection ?? false}
                  onChange={(val) => updateAndSaveFib('reverseDirection', val)}
                  label="Reverse"
                />
              )}

              {/* 7. Prices */}
              <CustomCheckbox
                checked={editingFibOverlay.showPrices ?? (isFibChannel ? false : true)}
                onChange={(val) => updateAndSaveFib('showPrices', val)}
                label="Prices"
              />

              {/* 8. Levels & Format */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <CustomCheckbox
                  checked={editingFibOverlay.showPercentages ?? true}
                  onChange={(val) => updateAndSaveFib('showPercentages', val)}
                  label="Levels"
                />
                <CustomDropdown
                  value={editingFibOverlay.levelsFormat ?? 'values'}
                  options={[
                    { value: 'values', label: 'Values' },
                    { value: 'percentages', label: 'Percentages' }
                  ]}
                  onChange={(val) => updateAndSaveFib('levelsFormat', val)}
                  width={120}
                  height={28}
                />
              </div>

              {/* 9. Labels Alignment */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px' }}>Labels</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <CustomDropdown
                    value={editingFibOverlay.labelsAlign ?? (isFibChannel ? 'left' : 'right')}
                    options={[
                      { value: 'left', label: 'Left' },
                      { value: 'center', label: 'Center' },
                      { value: 'right', label: 'Right' }
                    ]}
                    onChange={(val) => updateAndSaveFib('labelsAlign', val)}
                    width={85}
                    height={28}
                  />
                  <CustomDropdown
                    value={editingFibOverlay.labelsVerticalAlign ?? 'middle'}
                    options={[
                      { value: 'top', label: 'Top' },
                      { value: 'middle', label: 'Middle' },
                      { value: 'bottom', label: 'Bottom' }
                    ]}
                    onChange={(val) => updateAndSaveFib('labelsVerticalAlign', val)}
                    width={90}
                    height={28}
                  />
                </div>
              </div>

              {/* 10. Font size */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px' }}>Font size</span>
                <CustomDropdown
                  value={editingFibOverlay.fontSize ?? 12}
                  options={[10, 11, 12, 14, 16, 20, 24]}
                  onChange={(val) => updateAndSaveFib('fontSize', Number(val))}
                  width={80}
                  height={28}
                />
              </div>

              {/* 11. Fib levels based on log scale (Hidden for Fib Channel) */}
              {!isFibChannel && (
                <CustomCheckbox
                  checked={editingFibOverlay.logScale ?? false}
                  onChange={(val) => updateAndSaveFib('logScale', val)}
                  label="Fib levels based on log scale"
                />
              )}
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#11131a'
            }}
          >
            <button
              type="button"
              onClick={handleDefaultsFib}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                color: '#d1d4dc',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)'; e.currentTarget.style.color = '#ffffff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#d1d4dc'; }}
            >
              Defaults
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={handleCancelFib}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#d1d4dc',
                  padding: '6px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)'; e.currentTarget.style.color = '#ffffff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#d1d4dc'; }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setIsFibFullModalOpen(false)}
                style={{
                  padding: '6px 18px',
                  fontSize: '12px',
                  fontWeight: '600',
                  borderRadius: '4px',
                  backgroundColor: '#2962ff',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1e53e5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2962ff'; }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPositionSettingsPanel = () => {
    if (!editingPositionOverlay || isPositionFullModalOpen) return null;

    const updateOverlaySetting = (updatedData: any) => {
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        const overlays = activeChart.getOverlays() || [];
        const found = overlays.find((o: any) => o.id === editingPositionOverlay.overlayId);
        if (found) {
          let points = [...(found.points || [])];
          if (updatedData.entryPrice !== undefined && points[0]) {
            points[0].value = updatedData.entryPrice;
            if (points[3]) points[3].value = updatedData.entryPrice;
          }
          if (updatedData.stopPrice !== undefined && points[1]) {
            points[1].value = updatedData.stopPrice;
          }
          if (updatedData.profitPrice !== undefined && points[2]) {
            points[2].value = updatedData.profitPrice;
          }

          const precision = (window as any).__active_price_precision__ ?? 2;
          const tickSize = Math.pow(10, -precision);

          const currentEntryPrice = updatedData.entryPrice !== undefined ? updatedData.entryPrice : (points[0]?.value ?? 0);
          const isLong = found.name === 'long-position';

          if (updatedData.stopTicks !== undefined && points[1]) {
            const stopPriceVal = isLong
              ? currentEntryPrice - updatedData.stopTicks * tickSize
              : currentEntryPrice + updatedData.stopTicks * tickSize;
            points[1].value = stopPriceVal;
            updatedData.stopPrice = stopPriceVal;
          }
          if (updatedData.profitTicks !== undefined && points[2]) {
            const profitPriceVal = isLong
              ? currentEntryPrice + updatedData.profitTicks * tickSize
              : currentEntryPrice - updatedData.profitTicks * tickSize;
            points[2].value = profitPriceVal;
            updatedData.profitPrice = profitPriceVal;
          }

          if (updatedData.stopPrice !== undefined && updatedData.stopTicks === undefined) {
            const diff = Math.abs(currentEntryPrice - updatedData.stopPrice);
            updatedData.stopTicks = Math.round(diff / tickSize);
          }
          if (updatedData.profitPrice !== undefined && updatedData.profitTicks === undefined) {
            const diff = Math.abs(currentEntryPrice - updatedData.profitPrice);
            updatedData.profitTicks = Math.round(diff / tickSize);
          }

          activeChart.overrideOverlay({
            id: editingPositionOverlay.overlayId,
            points: points,
            styles: {
              ...(found.styles || {}),
              takeProfitColor: updatedData.targetColor !== undefined ? updatedData.targetColor : (updatedData.profitColor !== undefined ? updatedData.profitColor : (found.styles?.takeProfitColor || found.styles?.takeProfit?.color)),
              stopLossColor: updatedData.stopColor !== undefined ? updatedData.stopColor : (updatedData.lossColor !== undefined ? updatedData.lossColor : (found.styles?.stopLossColor || found.styles?.stopLoss?.color)),
              lineColor: updatedData.linesColor !== undefined ? updatedData.linesColor : (found.styles?.lineColor || '#2962ff'),
              textColor: updatedData.textColor !== undefined ? updatedData.textColor : (found.styles?.textColor || '#ffffff'),
              textSize: updatedData.textSize !== undefined ? updatedData.textSize : (found.styles?.textSize || 11)
            },
            extendData: {
              ...(found.extendData || {}),
              ...updatedData
            }
          });
          if (typeof activeChart.updatePane === 'function') {
            activeChart.updatePane(1);
          }
        }
      }
    };

    const updateAndSave = (keyOrObj: string | Record<string, any>, value?: any) => {
      const patch = typeof keyOrObj === 'string' ? { [keyOrObj]: value } : keyOrObj;
      setEditingPositionOverlay((prev: any) => {
        if (!prev) return null;
        const nextState = {
          ...prev,
          ...patch
        };
        updateOverlaySetting(nextState);
        return nextState;
      });
    };

    const handleTrashOverlay = () => {
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        activeChart.removeOverlay({ id: editingPositionOverlay.overlayId });
      }
      setEditingPositionOverlay(null);
    };

    const parseRgba = (colorStr: string): { hex: string; opacity: number } => {
      if (!colorStr || colorStr === 'transparent') {
        return { hex: '#ffffff', opacity: 0 };
      }
      if (colorStr.startsWith('rgba')) {
        const parts = colorStr.match(/[\d.]+/g);
        if (parts && parts.length >= 4) {
          const r = parseInt(parts[0]);
          const g = parseInt(parts[1]);
          const b = parseInt(parts[2]);
          const hexStr = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
          const op = parseFloat(parts[3]);
          return { hex: hexStr, opacity: op };
        }
      } else if (colorStr.startsWith('rgb')) {
        const parts = colorStr.match(/\d+/g);
        if (parts && parts.length >= 3) {
          const r = parseInt(parts[0]);
          const g = parseInt(parts[1]);
          const b = parseInt(parts[2]);
          const hexStr = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
          return { hex: hexStr, opacity: 1.0 };
        }
      } else if (colorStr.startsWith('#')) {
        return { hex: colorStr, opacity: 1.0 };
      }
      return { hex: '#ffffff', opacity: 1.0 };
    };

    const hexToRgb = (hex: string) => {
      let cleanHex = hex.replace('#', '');
      if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(char => char + char).join('');
      }
      const num = parseInt(cleanHex, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    };

    const profitColorParsed = parseRgba(editingPositionOverlay.profitColor || '#26a69a');
    const lossColorParsed = parseRgba(editingPositionOverlay.lossColor || '#ef5350');

    return (
      <div
        style={{
          position: 'fixed',
          left: `${panelPos.x}px`,
          top: `${panelPos.y}px`,
          backgroundColor: '#1e222d',
          border: '1px solid #2a2e39',
          borderRadius: '6px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          zIndex: 10000,
          userSelect: 'none',
          pointerEvents: 'auto',
          color: '#d1d4dc',
          fontFamily: "'Rubik', 'Rubik', sans-serif",
          boxSizing: 'border-box',
          gap: '6px',
          height: '38px'
        }}
      >
        {/* Drag Handle */}
        <div
          onMouseDown={handlePanelDragStart}
          title="Drag Toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isPanelDragging ? 'grabbing' : 'grab',
            padding: '4px 2px',
            color: '#787b86',
            borderRadius: '4px',
            transition: 'color 0.12s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#d1d4dc'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#787b86'}
        >
          <GripVertical size={16} />
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Target Profit Color Picker */}
        <ColorStylePicker
          color={profitColorParsed.hex}
          opacity={profitColorParsed.opacity}
          hideStyleSelector={true}
          isFillColorPicker={true}
          onChange={(newColor, newOpacity) => {
            const { r, g, b } = hexToRgb(newColor);
            updateAndSave('profitColor', `rgba(${r}, ${g}, ${b}, ${newOpacity})`);
          }}
        />

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Stop Loss Color Picker */}
        <ColorStylePicker
          color={lossColorParsed.hex}
          opacity={lossColorParsed.opacity}
          hideStyleSelector={true}
          isFillColorPicker={true}
          onChange={(newColor, newOpacity) => {
            const { r, g, b } = hexToRgb(newColor);
            updateAndSave('lossColor', `rgba(${r}, ${g}, ${b}, ${newOpacity})`);
          }}
        />

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Settings Gear Button */}
        <button
          onClick={() => setIsPositionFullModalOpen(true)}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid transparent',
            color: '#868993',
            cursor: 'pointer',
            height: '26px',
            width: '26px',
            padding: 0,
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            outline: 'none',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#868993';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="Detailed Settings"
        >
          <svg width="16" height="16" viewBox="0 0 33.136 28.412" style={{ pointerEvents: 'none' }}>
            <g id="Setting">
              <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" stroke="currentColor" strokeWidth="0.5" strokeMiterlimit="10" d="M22.77,14.206c0,3.426-2.777,6.203-6.203,6.203s-6.203-2.777-6.203-6.203s2.777-6.203,6.203-6.203S22.77,10.78,22.77,14.206z M21.22,14.206c0,2.569-2.083,4.652-4.652,4.652s-4.652-2.083-4.652-4.652s2.083-4.652,4.652-4.652S21.22,11.637,21.22,14.206z" />
              <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" stroke="currentColor" strokeWidth="0.5" strokeMiterlimit="10" d="M8.039,0.25h17.057l7.753,13.956l-7.753,13.956H8.039L0.286,14.206L8.039,0.25z M2.054,14.206L8.97,1.801h15.227l6.9,12.405 l-6.9,12.405H8.97l-6.9-12.405H2.054z" />
            </g>
          </svg>
        </button>

        {/* Hide / Visibility (Eye) Button */}
        <button
          onClick={() => {
            const activeChart = (window as any).__active_chart_instance__;
            if (activeChart && typeof activeChart.overrideOverlay === 'function') {
              activeChart.overrideOverlay({
                id: editingPositionOverlay.overlayId,
                visible: false
              });
              if (typeof activeChart.invalidate === 'function') activeChart.invalidate();
            }
            setEditingPositionOverlay(null);
            setIsPositionFullModalOpen(false);
            window.dispatchEvent(new CustomEvent('update-layer-panel'));
            window.dispatchEvent(new CustomEvent('save-history-state'));
          }}
          title="Hide"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <Eye size={15} />
        </button>

        {/* Clone / Duplicate Button */}
        <button
          onClick={() => cloneOverlayInStack(editingPositionOverlay.overlayId)}
          title="Duplicate"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <Copy size={15} />
        </button>

        {/* Visual Order / Layers Dropdown Button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsPositionLayersDropdownOpen(prev => !prev);
            }}
            title="Visual Order (Layers)"
            style={{
              background: isPositionLayersDropdownOpen ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
              border: isPositionLayersDropdownOpen ? '1px solid #2962ff' : 'none',
              color: isPositionLayersDropdownOpen ? '#2979ff' : '#787b86',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '26px',
              width: '26px',
              boxSizing: 'border-box'
            }}
            onMouseEnter={e => { if (!isPositionLayersDropdownOpen) { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; } }}
            onMouseLeave={e => { if (!isPositionLayersDropdownOpen) { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
          >
            <Layers size={15} />
          </button>

          {isPositionLayersDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '32px',
                left: '0',
                backgroundColor: '#1e222d',
                border: '1px solid #2a2e39',
                borderRadius: '6px',
                boxShadow: '0 6px 18px rgba(0,0,0,0.7)',
                padding: '4px 0',
                minWidth: '150px',
                zIndex: 160000
              }}
              onClick={e => e.stopPropagation()}
            >
              {[
                { action: 'front', label: 'Bring to Front', icon: ChevronsUp },
                { action: 'forward', label: 'Bring Forward', icon: ChevronUp },
                { action: 'backward', label: 'Send Backward', icon: ChevronDown },
                { action: 'back', label: 'Send to Back', icon: ChevronsDown }
              ].map(item => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={item.action}
                    onClick={() => {
                      reorderOverlayInStack(editingPositionOverlay.overlayId, item.action as any);
                      setIsPositionLayersDropdownOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 12px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: '#d1d4dc'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#d1d4dc';
                    }}
                  >
                    <IconComponent size={14} />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Trash/Delete Button */}
        <button
          onClick={handleTrashOverlay}
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            color: '#868993',
            cursor: 'pointer',
            height: '26px',
            width: '26px',
            padding: 0,
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            outline: 'none',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#868993';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="Delete position tool"
        >
          <svg width="15" height="16" viewBox="0 0 18 20" style={{ pointerEvents: 'none' }}>
            <g id="Delete">
              <path fill="currentColor" d="M13,3h5v1h-2.01l-1.33,14.64c-0.072,0.773-0.723,1.363-1.5,1.36H4.84c-0.773-0.002-1.418-0.591-1.49-1.36L2.01,4H0V3h5V2c0-1.1,0.9-2,2-2h4c1.105,0,2,0.895,2,2V3z M7,1C6.448,1,6,1.448,6,2v1h6V2c0-0.552-0.448-1-1-1H7z M3.02,4l1.32,14.54c0.021,0.26,0.239,0.461,0.5,0.46h8.33c0.261,0.001,0.479-0.2,0.5-0.46L14.99,4H3.02z" />
            </g>
          </svg>
        </button>
      </div>
    );
  };

  const renderPositionSettingsModal = () => {
    if (!isPositionFullModalOpen || !editingPositionOverlay) return null;

    const renderNumericInput = (
      key: string,
      value: number,
      step: number = 1,
      min: number = 0,
      activePrecisionLocal: number = 2,
      useConversion: boolean = false,
      width: string = '118px'
    ) => {
      return (
        <CustomPositionNumericAdjuster
          value={value}
          min={min}
          step={step}
          onChange={(newVal) => updateAndSave(key, newVal)}
          activePrecisionLocal={activePrecisionLocal}
          useConversion={useConversion}
          width={width}
        />
      );
    };

    const updateOverlaySetting = (updatedData: any, patch?: any) => {
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        const overlays = activeChart.getOverlays() || [];
        const found = overlays.find((o: any) => o.id === editingPositionOverlay.overlayId);
        if (found) {
          let points = [...(found.points || [])];
          let precision = 2;
          try {
            const symbolInfo = activeChart.getSymbol();
            if (symbolInfo && typeof symbolInfo.pricePrecision === 'number') {
              precision = symbolInfo.pricePrecision;
            } else if ((window as any).__active_price_precision__ !== undefined) {
              precision = (window as any).__active_price_precision__;
            }
          } catch (e) { }
          const tickSize = Math.pow(10, -precision);
          const isLong = found.name === 'long-position';

          // Resolve currentEntryPrice
          let currentEntryPrice = points[0]?.value ?? 0;
          if (patch && patch.entryPrice !== undefined) {
            currentEntryPrice = parseFloat(patch.entryPrice.toFixed(precision));
            if (points[0]) points[0].value = currentEntryPrice;
            if (points[3]) points[3].value = currentEntryPrice;
            updatedData.entryPrice = currentEntryPrice;

            // Recalculate ticks for existing stop and profit prices
            const currentStopPrice = points[1]?.value ?? (updatedData.stopPrice ?? 0);
            const diffStop = Math.abs(currentEntryPrice - currentStopPrice);
            updatedData.stopTicks = Math.round(diffStop / tickSize);
            updatedData.stopPrice = currentStopPrice;

            const currentProfitPrice = points[2]?.value ?? (updatedData.profitPrice ?? 0);
            const diffProfit = Math.abs(currentEntryPrice - currentProfitPrice);
            updatedData.profitTicks = Math.round(diffProfit / tickSize);
            updatedData.profitPrice = currentProfitPrice;
          } else if (updatedData.entryPrice !== undefined) {
            currentEntryPrice = parseFloat(updatedData.entryPrice.toFixed(precision));
            if (points[0]) points[0].value = currentEntryPrice;
            if (points[3]) points[3].value = currentEntryPrice;
          }

          // Stop Loss resolution
          if (patch && patch.stopTicks !== undefined) {
            const rawVal = isLong
              ? currentEntryPrice - patch.stopTicks * tickSize
              : currentEntryPrice + patch.stopTicks * tickSize;
            const stopPriceVal = parseFloat(rawVal.toFixed(precision));
            if (points[1]) points[1].value = stopPriceVal;
            updatedData.stopPrice = stopPriceVal;
            updatedData.stopTicks = patch.stopTicks;
          } else if (patch && patch.stopPrice !== undefined) {
            const stopPriceVal = parseFloat(patch.stopPrice.toFixed(precision));
            if (points[1]) points[1].value = stopPriceVal;
            updatedData.stopPrice = stopPriceVal;
            const diff = Math.abs(currentEntryPrice - stopPriceVal);
            updatedData.stopTicks = Math.round(diff / tickSize);
          } else if (points[1]) {
            const stopPriceVal = parseFloat((points[1].value ?? 0).toFixed(precision));
            updatedData.stopPrice = stopPriceVal;
            const diff = Math.abs(currentEntryPrice - stopPriceVal);
            updatedData.stopTicks = Math.round(diff / tickSize);
          }

          // Take Profit resolution
          if (patch && patch.profitTicks !== undefined) {
            const rawVal = isLong
              ? currentEntryPrice + patch.profitTicks * tickSize
              : currentEntryPrice - patch.profitTicks * tickSize;
            const profitPriceVal = parseFloat(rawVal.toFixed(precision));
            if (points[2]) points[2].value = profitPriceVal;
            updatedData.profitPrice = profitPriceVal;
            updatedData.profitTicks = patch.profitTicks;
          } else if (patch && patch.profitPrice !== undefined) {
            const profitPriceVal = parseFloat(patch.profitPrice.toFixed(precision));
            if (points[2]) points[2].value = profitPriceVal;
            updatedData.profitPrice = profitPriceVal;
            const diff = Math.abs(currentEntryPrice - profitPriceVal);
            updatedData.profitTicks = Math.round(diff / tickSize);
          } else if (points[2]) {
            const profitPriceVal = parseFloat((points[2].value ?? 0).toFixed(precision));
            updatedData.profitPrice = profitPriceVal;
            const diff = Math.abs(currentEntryPrice - profitPriceVal);
            updatedData.profitTicks = Math.round(diff / tickSize);
          }

          activeChart.overrideOverlay({
            id: editingPositionOverlay.overlayId,
            points: points,
            styles: {
              ...(found.styles || {}),
              takeProfit: {
                ...(found.styles?.takeProfit || {}),
                color: updatedData.targetColor !== undefined ? updatedData.targetColor : (updatedData.profitColor !== undefined ? updatedData.profitColor : (found.styles?.takeProfit?.color || 'rgba(38, 166, 154, 0.2)'))
              },
              stopLoss: {
                ...(found.styles?.stopLoss || {}),
                color: updatedData.stopColor !== undefined ? updatedData.stopColor : (updatedData.lossColor !== undefined ? updatedData.lossColor : (found.styles?.stopLoss?.color || 'rgba(239, 83, 80, 0.2)'))
              },
              takeProfitColor: updatedData.targetColor !== undefined ? updatedData.targetColor : (updatedData.profitColor !== undefined ? updatedData.profitColor : (found.styles?.takeProfitColor || found.styles?.takeProfit?.color)),
              stopLossColor: updatedData.stopColor !== undefined ? updatedData.stopColor : (updatedData.lossColor !== undefined ? updatedData.lossColor : (found.styles?.stopLossColor || found.styles?.stopLoss?.color)),
              lineColor: updatedData.linesColor !== undefined ? updatedData.linesColor : (found.styles?.lineColor || '#2962ff'),
              textColor: updatedData.textColor !== undefined ? updatedData.textColor : (found.styles?.textColor || '#ffffff'),
              textSize: updatedData.textSize !== undefined ? updatedData.textSize : (found.styles?.textSize || 11)
            },
            extendData: {
              ...(found.extendData || {}),
              ...updatedData
            }
          });
          if (typeof activeChart.updatePane === 'function') {
            activeChart.updatePane(1);
          }
        }
      }
    };

    const updateAndSave = (keyOrObj: string | Record<string, any>, value?: any) => {
      const patch = typeof keyOrObj === 'string' ? { [keyOrObj]: value } : keyOrObj;
      setEditingPositionOverlay((prev: any) => {
        if (!prev) return null;
        const nextState = {
          ...prev,
          ...patch
        };
        updateOverlaySetting(nextState, patch);
        return { ...nextState };
      });
    };


    const handleCancel = () => {
      setIsPositionFullModalOpen(false);
    };

    const handleDefaults = () => {
      const activeChart = (window as any).__active_chart_instance__;
      let ep = editingPositionOverlay.entryPrice ?? 0;
      let sp = editingPositionOverlay.stopPrice ?? 0;
      let tp = editingPositionOverlay.profitPrice ?? 0;
      let st = editingPositionOverlay.stopTicks ?? 0;
      let pt = editingPositionOverlay.profitTicks ?? 0;
      if (activeChart) {
        const overlays = activeChart.getOverlays() || [];
        const found = overlays.find((o: any) => o.id === editingPositionOverlay.overlayId);
        if (found && found.points) {
          ep = found.points[0]?.value ?? ep;
          sp = found.points[1]?.value ?? sp;
          tp = found.points[2]?.value ?? tp;
          let precision = 2;
          try {
            const symbolInfo = activeChart.getSymbol();
            if (symbolInfo && typeof symbolInfo.pricePrecision === 'number') {
              precision = symbolInfo.pricePrecision;
            } else if ((window as any).__active_price_precision__ !== undefined) {
              precision = (window as any).__active_price_precision__;
            }
          } catch (e) { }
          const tickSize = Math.pow(10, -precision);
          st = Math.round(Math.abs(ep - sp) / tickSize);
          pt = Math.round(Math.abs(tp - ep) / tickSize);
        }
      }
      const defaultsObj = {
        showPrices: true,
        showPercentage: true,
        showRiskReward: true,
        showPnL: true,
        quantity: 1,
        accountSize: 10000,
        riskPercent: 1,

        // Advanced defaults
        accountSizeCurrency: 'Default',
        lotSize: 1,
        riskType: 'percent',
        risk: 10.00,
        entryPrice: ep,
        stopPrice: sp,
        profitPrice: tp,
        stopTicks: st,
        profitTicks: pt,
        leverage: 1,
        qtyPrecision: 'Default',

        linesColor: 'rgba(255, 255, 255, 0.4)',
        stopColor: 'rgba(239, 83, 80, 0.2)',
        targetColor: 'rgba(38, 166, 154, 0.2)',
        textColor: '#ffffff',
        textSize: 11,
        showPriceLabels: true,
        compactStats: false,
        alwaysShowStats: false,

        showTpPriceOffset: true,
        showTpPercentOffset: true,
        showTpTickOffset: true,
        showTpAmount: true,
        showTpPL: true,
        showOpenClosedPL: true,
        showQty: true,
        showSlPriceOffset: true,
        showSlPercentOffset: true,
        showSlTickOffset: true,
        showSlAmount: true,
        showSlPL: true,
      };
      updateAndSave(defaultsObj);
    };

    const titleName = editingPositionOverlay.overlayName === 'long-position' ? 'Long Position Settings' : 'Short Position Settings';

    const modalPos = modalPosMap['positionModal'] || {
      x: Math.max(10, Math.round(window.innerWidth / 2 - 200)),
      y: Math.max(10, Math.round(window.innerHeight / 2 - 220))
    };

    const parseRgba = (colorStr: string): { hex: string; opacity: number } => {
      if (!colorStr || colorStr === 'transparent') {
        return { hex: '#ffffff', opacity: 0 };
      }
      if (colorStr.startsWith('rgba')) {
        const parts = colorStr.match(/[\d.]+/g);
        if (parts && parts.length >= 4) {
          const r = parseInt(parts[0]);
          const g = parseInt(parts[1]);
          const b = parseInt(parts[2]);
          const hexStr = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
          const op = parseFloat(parts[3]);
          return { hex: hexStr, opacity: op };
        }
      } else if (colorStr.startsWith('rgb')) {
        const parts = colorStr.match(/\d+/g);
        if (parts && parts.length >= 3) {
          const r = parseInt(parts[0]);
          const g = parseInt(parts[1]);
          const b = parseInt(parts[2]);
          const hexStr = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
          return { hex: hexStr, opacity: 1.0 };
        }
      } else if (colorStr.startsWith('#')) {
        return { hex: colorStr, opacity: 1.0 };
      }
      return { hex: '#ffffff', opacity: 1.0 };
    };

    const hexToRgb = (hex: string) => {
      let cleanHex = hex.replace('#', '');
      if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(char => char + char).join('');
      }
      const num = parseInt(cleanHex, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    };

    const activeChart = (window as any).__active_chart_instance__;
    let activePrecision = 2;
    try {
      const symbolInfo = activeChart?.getSymbol?.();
      if (symbolInfo && typeof symbolInfo.pricePrecision === 'number') {
        activePrecision = symbolInfo.pricePrecision;
      } else if (typeof window !== 'undefined' && typeof (window as any).__active_price_precision__ === 'number') {
        activePrecision = (window as any).__active_price_precision__;
      }
    } catch (e) { }
    const priceTickSize = Math.pow(10, -activePrecision);
    const currentSymbolShort = activeChart?.getSymbol()?.shortName || '';
    const nativeSymbolQuote = (currentSymbolShort.split('/')?.[1] || activeChart?.getSymbol()?.priceCurrency || 'USD').toUpperCase();
    const activeCurrencyCode = (typeof window !== 'undefined' && (window as any).__currency_code__ && (window as any).__currency_code__ !== 'NATIVE')
      ? (window as any).__currency_code__
      : nativeSymbolQuote;

    const selectedCurrencyCode = editingPositionOverlay.accountSizeCurrency ?? 'Default';
    const displayCurrencyCode = selectedCurrencyCode === 'Default' ? activeCurrencyCode : selectedCurrencyCode;
    const displayCurrencySymbol = CURRENCY_OPTIONS.find(o => o.code === displayCurrencyCode)?.symbol
      || (displayCurrencyCode === 'USDT' ? '$' : '');

    const profitColorParsed = parseRgba(editingPositionOverlay.profitColor || '#26a69a');
    const lossColorParsed = parseRgba(editingPositionOverlay.lossColor || '#ef5350');

    const CustomCheckbox = ({ checked, onChange, label }: { checked: boolean; onChange: (val: boolean) => void; label?: React.ReactNode }) => (
      <label 
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '10px', 
          cursor: 'pointer', 
          userSelect: 'none' 
        }}
      >
        <div 
          onClick={() => onChange(!checked)}
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '4px',
            border: checked ? '1px solid #ffffff' : '2px solid #868993',
            backgroundColor: checked ? '#ffffff' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
            boxSizing: 'border-box'
          }}
        >
          {checked && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none" style={{ display: 'block' }}>
              <path 
                d="M1.5 4L4 6.5L8.5 1.5" 
                stroke="#131722" 
                strokeWidth="2.2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
            </svg>
          )}
        </div>
        {label && <span style={{ fontSize: '13px', color: '#d1d4dc', fontWeight: 500 }}>{label}</span>}
      </label>
    );

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          zIndex: 200000,
          userSelect: 'none',
          pointerEvents: 'auto'
        }}
        onClick={handleCancel}
      >
        <div
          className="settings-modal-box"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: `${modalPos.x}px`,
            top: `${modalPos.y}px`,
            width: '380px',
            backgroundColor: '#161720',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
            color: '#d1d4dc',
            fontFamily: "'Rubik', sans-serif",
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            onMouseDown={(e) => handleModalHeaderMouseDown('positionModal', e, 380, 480)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: '#11131a',
              cursor: 'move',
              userSelect: 'none'
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#ffffff', letterSpacing: '0.3px' }}>{titleName}</span>
            <button
              onClick={handleCancel}
              title="Close"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#868993',
                cursor: 'pointer',
                borderRadius: '6px',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.backgroundColor = 'rgba(242, 54, 69, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(242, 54, 69, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#868993';
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              backgroundColor: '#101217',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '0 8px'
            }}
          >
            <button
              onClick={() => setSettingsTab('inputs')}
              style={{
                padding: '8px 14px',
                background: settingsTab === 'inputs' ? 'rgba(41, 98, 255, 0.08)' : 'transparent',
                border: 'none',
                color: settingsTab === 'inputs' ? '#2962ff' : '#868993',
                borderBottom: settingsTab === 'inputs' ? '2px solid #2962ff' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: settingsTab === 'inputs' ? 600 : 500,
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (settingsTab !== 'inputs') {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                }
              }}
              onMouseLeave={(e) => {
                if (settingsTab !== 'inputs') {
                  e.currentTarget.style.color = '#868993';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              Inputs
            </button>
            <button
              onClick={() => setSettingsTab('style')}
              style={{
                padding: '8px 14px',
                background: settingsTab === 'style' ? 'rgba(41, 98, 255, 0.08)' : 'transparent',
                border: 'none',
                color: settingsTab === 'style' ? '#2962ff' : '#868993',
                borderBottom: settingsTab === 'style' ? '2px solid #2962ff' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: settingsTab === 'style' ? 600 : 500,
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (settingsTab !== 'style') {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                }
              }}
              onMouseLeave={(e) => {
                if (settingsTab !== 'style') {
                  e.currentTarget.style.color = '#868993';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              Style
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '340px', overflowY: 'auto', backgroundColor: '#161720' }}>
            {settingsTab === 'inputs' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                {/* Account Size */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc', width: '120px', flexShrink: 0 }}>
                    Account size {displayCurrencySymbol ? `(${displayCurrencySymbol})` : `(${displayCurrencyCode})`}
                  </span>
                  <div style={{ display: 'flex', gap: '6px', width: '192px', justifyContent: 'flex-start' }}>
                    {renderNumericInput('accountSize', editingPositionOverlay.accountSize ?? 10000, 100, 0, 0, false, '118px')}
                    <CustomDropdown
                      value={editingPositionOverlay.accountSizeCurrency ?? 'Default'}
                      options={[
                        { value: 'Default', label: 'Default' },
                        ...currencyOptions.filter(o => o.code !== 'NATIVE').map(opt => ({ value: opt.code, label: opt.code }))
                      ]}
                      onChange={(val) => updateAndSave('accountSizeCurrency', val)}
                      width={68}
                      height={26}
                    />
                  </div>
                </div>

                {/* Lot size */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc', width: '120px', flexShrink: 0 }}>Lot size</span>
                  <div style={{ display: 'flex', width: '192px', justifyContent: 'flex-start' }}>
                    {renderNumericInput('lotSize', editingPositionOverlay.lotSize ?? 1, 1, 1, 0, false, '118px')}
                  </div>
                </div>

                {/* Risk */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc', width: '120px', flexShrink: 0 }}>Risk</span>
                  <div style={{ display: 'flex', gap: '6px', width: '192px', justifyContent: 'flex-start' }}>
                    {renderNumericInput('risk', editingPositionOverlay.risk ?? 10.00, 0.01, 0.01, 2, false, '118px')}
                    <CustomDropdown
                      value={editingPositionOverlay.riskType ?? 'percent'}
                      options={[
                        { value: 'percent', label: '%' },
                        { value: 'absolute', label: displayCurrencyCode }
                      ]}
                      onChange={(val) => updateAndSave('riskType', val)}
                      width={68}
                      height={26}
                    />
                  </div>
                </div>

                {/* Entry price */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc', width: '120px', flexShrink: 0 }}>Entry price</span>
                  <div style={{ display: 'flex', width: '192px', justifyContent: 'flex-start' }}>
                    {renderNumericInput('entryPrice', editingPositionOverlay.entryPrice ?? 0, priceTickSize, 0, activePrecision, true, '118px')}
                  </div>
                </div>

                {/* Leverage */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc', width: '120px', flexShrink: 0 }}>Leverage</span>
                  <div style={{ display: 'flex', width: '192px', justifyContent: 'flex-start' }}>
                    {renderNumericInput('leverage', editingPositionOverlay.leverage ?? 1.0, 0.1, 0.1, 1, false, '118px')}
                  </div>
                </div>

                <div style={{ height: '1px', backgroundColor: '#2a2e39', margin: '2px 0' }} />
                <span style={{ fontSize: '11px', color: '#868993', fontWeight: 'bold', textTransform: 'uppercase' }}>Profit Level</span>

                {/* Profit Ticks */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc', width: '120px', flexShrink: 0 }}>Ticks</span>
                  <div style={{ display: 'flex', width: '192px', justifyContent: 'flex-start' }}>
                    {renderNumericInput('profitTicks', editingPositionOverlay.profitTicks ?? 0, 1, 0, 0, false, '118px')}
                  </div>
                </div>

                {/* Profit Price */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc', width: '120px', flexShrink: 0 }}>Price</span>
                  <div style={{ display: 'flex', width: '192px', justifyContent: 'flex-start' }}>
                    {renderNumericInput('profitPrice', editingPositionOverlay.profitPrice ?? 0, priceTickSize, 0, activePrecision, true, '118px')}
                  </div>
                </div>

                <div style={{ height: '1px', backgroundColor: '#2a2e39', margin: '2px 0' }} />
                <span style={{ fontSize: '11px', color: '#868993', fontWeight: 'bold', textTransform: 'uppercase' }}>Stop Level</span>

                {/* Stop Ticks */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc', width: '120px', flexShrink: 0 }}>Ticks</span>
                  <div style={{ display: 'flex', width: '192px', justifyContent: 'flex-start' }}>
                    {renderNumericInput('stopTicks', editingPositionOverlay.stopTicks ?? 0, 1, 0, 0, false, '118px')}
                  </div>
                </div>

                {/* Stop Price */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc', width: '120px', flexShrink: 0 }}>Price</span>
                  <div style={{ display: 'flex', width: '192px', justifyContent: 'flex-start' }}>
                    {renderNumericInput('stopPrice', editingPositionOverlay.stopPrice ?? 0, priceTickSize, 0, activePrecision, true, '118px')}
                  </div>
                </div>

                <div style={{ height: '1px', backgroundColor: '#2a2e39', margin: '2px 0' }} />

                {/* QTY Precision */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc', width: '120px', flexShrink: 0 }}>QTY precision</span>
                  <div style={{ display: 'flex', width: '192px', justifyContent: 'flex-start' }}>
                    <CustomDropdown
                      value={editingPositionOverlay.qtyPrecision ?? 'Default'}
                      options={[
                        { value: 'Default', label: 'Default' },
                        { value: '0', label: 'Integer' },
                        { value: '1', label: '1 decimal' },
                        { value: '2', label: '2 decimals' },
                        { value: '3', label: '3 decimals' },
                        { value: '4', label: '4 decimals' },
                        { value: '5', label: '5 decimals' },
                        { value: '6', label: '6 decimals' },
                        { value: '7', label: '7 decimals' },
                        { value: '8', label: '8 decimals' },
                        { value: '9', label: '9 decimals' },
                        { value: '10', label: '10 decimals' }
                      ]}
                      onChange={(val) => updateAndSave('qtyPrecision', val)}
                      width={118}
                      height={26}
                    />
                  </div>
                </div>

              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Lines Color Picker */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Lines</span>
                  <ColorStylePicker
                    color={parseRgba(editingPositionOverlay.linesColor || 'rgba(255,255,255,0.4)').hex}
                    opacity={parseRgba(editingPositionOverlay.linesColor || 'rgba(255,255,255,0.4)').opacity}
                    hideStyleSelector={true}
                    onChange={(newColor, newOpacity) => {
                      const { r, g, b } = hexToRgb(newColor);
                      updateAndSave('linesColor', `rgba(${r}, ${g}, ${b}, ${newOpacity})`);
                    }}
                  />
                </div>

                {/* Stop Color */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Stop color</span>
                  <ColorStylePicker
                    color={lossColorParsed.hex}
                    opacity={lossColorParsed.opacity}
                    hideStyleSelector={true}
                    onChange={(newColor, newOpacity) => {
                      const { r, g, b } = hexToRgb(newColor);
                      updateAndSave('stopColor', `rgba(${r}, ${g}, ${b}, ${newOpacity})`);
                      updateAndSave('lossColor', `rgba(${r}, ${g}, ${b}, ${newOpacity})`);
                    }}
                  />
                </div>

                {/* Target Color */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Target color</span>
                  <ColorStylePicker
                    color={profitColorParsed.hex}
                    opacity={profitColorParsed.opacity}
                    hideStyleSelector={true}
                    onChange={(newColor, newOpacity) => {
                      const { r, g, b } = hexToRgb(newColor);
                      updateAndSave('targetColor', `rgba(${r}, ${g}, ${b}, ${newOpacity})`);
                      updateAndSave('profitColor', `rgba(${r}, ${g}, ${b}, ${newOpacity})`);
                    }}
                  />
                </div>

                {/* Text Color & Size */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Text</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <ColorStylePicker
                      color={parseRgba(editingPositionOverlay.textColor || '#ffffff').hex}
                      opacity={parseRgba(editingPositionOverlay.textColor || '#ffffff').opacity}
                      hideStyleSelector={true}
                      onChange={(newColor, newOpacity) => {
                        const { r, g, b } = hexToRgb(newColor);
                        updateAndSave('textColor', `rgba(${r}, ${g}, ${b}, ${newOpacity})`);
                      }}
                    />
                    <CustomDropdown
                      value={editingPositionOverlay.textSize ?? 11}
                      options={[9, 10, 11, 12, 14, 16, 20, 24]}
                      onChange={(val) => updateAndSave('textSize', Number(val))}
                      width={65}
                      height={26}
                    />
                  </div>
                </div>

                <div style={{ width: '100%', height: '1px', backgroundColor: '#2a2e39', margin: '2px 0' }} />

                {/* Price labels checkbox */}
                <CustomCheckbox
                  checked={editingPositionOverlay.showPriceLabels ?? true}
                  onChange={(val) => updateAndSave('showPriceLabels', val)}
                  label="Price labels"
                />

                <span style={{ fontSize: '11px', color: '#868993', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '4px' }}>Info</span>

                {/* Compact Stats */}
                <CustomCheckbox
                  checked={editingPositionOverlay.compactStats ?? false}
                  onChange={(val) => updateAndSave('compactStats', val)}
                  label="Compact stats"
                />

                {/* Always Show Stats */}
                <CustomCheckbox
                  checked={editingPositionOverlay.alwaysShowStats ?? false}
                  onChange={(val) => updateAndSave('alwaysShowStats', val)}
                  label="Always show stats"
                />

                {/* Stats Checklist Dropdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Stats</span>
                  <button
                    ref={statsBtnRef}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsStatsDropdownOpen(!isStatsDropdownOpen); }}
                    style={{
                      backgroundColor: '#1c2030',
                      border: '1px solid #2a2e39',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '5px 10px',
                      fontSize: '12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      outline: 'none'
                    }}
                  >
                    <span>Select Stats Options</span>
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ marginLeft: '8px', color: '#868993' }}>
                      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {isStatsDropdownOpen && (
                    <>
                      <div
                        onClick={() => setIsStatsDropdownOpen(false)}
                        style={{
                          position: 'fixed',
                          top: 0, left: 0, right: 0, bottom: 0,
                          zIndex: 209999
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '100%',
                          marginBottom: '4px',
                          left: 0,
                          right: 0,
                          backgroundColor: '#1c2030',
                          border: '1px solid #2a2e39',
                          borderRadius: '4px',
                          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                          zIndex: 210000,
                          maxHeight: '200px',
                          overflowY: 'auto',
                          padding: '8px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          boxSizing: 'border-box'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {[
                          { key: 'showTpPriceOffset', label: 'TP price offset' },
                          { key: 'showTpPercentOffset', label: 'TP percent offset' },
                          { key: 'showTpTickOffset', label: 'TP tick offset' },
                          { key: 'showTpAmount', label: 'TP amount' },
                          { key: 'showTpPL', label: 'TP PL' },
                          { key: 'showOpenClosedPL', label: 'Open/closed PL' },
                          { key: 'showQty', label: 'Qty' },
                          { key: 'showRiskReward', label: 'Risk/reward ratio' },
                          { key: 'showSlPriceOffset', label: 'SL price offset' },
                          { key: 'showSlPercentOffset', label: 'SL percent offset' },
                          { key: 'showSlTickOffset', label: 'SL tick offset' },
                          { key: 'showSlAmount', label: 'SL amount' },
                          { key: 'showSlPL', label: 'SL PL' }
                        ].map((item) => (
                          <CustomCheckbox
                            key={item.key}
                            checked={editingPositionOverlay[item.key] ?? true}
                            onChange={(val) => updateAndSave(item.key, val)}
                            label={item.label}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>

              </div>
            )}
          </div>

          {/* Footer / Buttons */}
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#11131a'
            }}
          >
            <button
              onClick={handleDefaults}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                color: '#d1d4dc',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)'; e.currentTarget.style.color = '#ffffff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#d1d4dc'; }}
            >
              Defaults
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleCancel}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#d1d4dc',
                  padding: '6px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)'; e.currentTarget.style.color = '#ffffff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#d1d4dc'; }}
              >
                Cancel
              </button>
              <button
                onClick={() => setIsPositionFullModalOpen(false)}
                style={{
                  backgroundColor: '#2962ff',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  padding: '8px 24px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a56ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2962ff'; }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPinFlagSettingsPanel = () => {
    if (!editingPinFlagOverlay) return null;

    const isPin = editingPinFlagOverlay.overlayName === 'pin';
    const isFlag = editingPinFlagOverlay.overlayName === 'flag-mark' || editingPinFlagOverlay.overlayName === 'flag';
    if (!isPin && !isFlag) return null;

    const hexToRgb = (hex: string) => {
      let cleanHex = hex.replace('#', '');
      if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(char => char + char).join('');
      }
      const num = parseInt(cleanHex, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    };

    const updatePinFlagOverlaySetting = (updatedData: any) => {
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        const overlays = activeChart.getOverlays() || [];
        const found = overlays.find((o: any) => o.id === editingPinFlagOverlay.overlayId);
        if (found) {
          if (updatedData.locked !== undefined) {
            found.lock = updatedData.locked;
          }
          activeChart.overrideOverlay({
            id: editingPinFlagOverlay.overlayId,
            lock: updatedData.locked !== undefined ? updatedData.locked : found.lock,
            extendData: {
              ...(found.extendData || {}),
              ...updatedData,
              locked: updatedData.locked !== undefined ? updatedData.locked : (found.extendData?.locked ?? found.lock)
            }
          });
          if (typeof activeChart.updatePane === 'function') {
            activeChart.updatePane(1);
          }
          if (typeof activeChart.invalidate === 'function') {
            activeChart.invalidate();
          }
        }
      }
    };

    const updateAndSavePinFlag = (key: string, value: any) => {
      const nextOverlayState = {
        ...editingPinFlagOverlay,
        [key]: value
      };
      setEditingPinFlagOverlay(nextOverlayState);
      updatePinFlagOverlaySetting({
        [key]: value
      });
    };

    const handleTrashPinFlag = () => {
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        activeChart.removeOverlay({ id: editingPinFlagOverlay.overlayId });
      }
      setEditingPinFlagOverlay(null);
    };

    const isPinFlagLocked = editingPinFlagOverlay.locked ?? false;
    const currentColor = editingPinFlagOverlay.color || (isPin ? '#0488DB' : '#ef5350');

    return (
      <div
        style={{
          position: 'fixed',
          left: `${panelPos.x}px`,
          top: `${panelPos.y}px`,
          backgroundColor: '#1e222d',
          border: '1px solid #2a2e39',
          borderRadius: '6px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          zIndex: 10000,
          userSelect: 'none',
          pointerEvents: 'auto',
          color: '#d1d4dc',
          fontFamily: "'Rubik', 'Rubik', sans-serif",
          boxSizing: 'border-box',
          gap: '6px',
          height: '38px'
        }}
      >
        {/* Drag Handle */}
        <div
          onMouseDown={handlePanelDragStart}
          title="Drag Toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isPanelDragging ? 'grabbing' : 'grab',
            padding: '4px 2px',
            color: '#787b86',
            borderRadius: '4px',
            transition: 'color 0.12s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#d1d4dc'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#787b86'}
        >
          <GripVertical size={16} />
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* ColorStylePicker for Flag/Pin color */}
        <ColorStylePicker
          color={currentColor}
          opacity={1.0}
          hideStyleSelector={true}
          onChange={(newColor, newOpacity) => {
            const finalColor = newOpacity < 1 ? `rgba(${hexToRgb(newColor).r}, ${hexToRgb(newColor).g}, ${hexToRgb(newColor).b}, ${newOpacity})` : newColor;
            updateAndSavePinFlag('color', finalColor);
          }}
        />

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Lock Button */}
        <button
          onClick={() => updateAndSavePinFlag('locked', !isPinFlagLocked)}
          title={isPinFlagLocked ? 'Unlock' : 'Lock'}
          style={{
            background: isPinFlagLocked ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
            border: isPinFlagLocked ? '1px solid #2962ff' : 'none',
            color: isPinFlagLocked ? '#2979ff' : '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { if (!isPinFlagLocked) { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; } }}
          onMouseLeave={e => { if (!isPinFlagLocked) { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
        >
          {isPinFlagLocked ? <LockbtnIcon width={16} height={16} /> : <UnlockbtnIcon width={16} height={16} />}
        </button>

        {/* Hide / Visibility (Eye) Button */}
        <button
          onClick={() => {
            const activeChart = (window as any).__active_chart_instance__;
            if (activeChart && typeof activeChart.overrideOverlay === 'function') {
              activeChart.overrideOverlay({
                id: editingPinFlagOverlay.overlayId,
                visible: false
              });
              if (typeof activeChart.invalidate === 'function') activeChart.invalidate();
            }
            setEditingPinFlagOverlay(null);
            window.dispatchEvent(new CustomEvent('update-layer-panel'));
            window.dispatchEvent(new CustomEvent('save-history-state'));
          }}
          title="Hide"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <Eye size={15} />
        </button>

        {/* Duplicate Button */}
        <button
          onClick={() => cloneOverlayInStack(editingPinFlagOverlay.overlayId)}
          title="Duplicate"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <Copy size={15} />
        </button>

        {/* Visual Order / Layers Dropdown Button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsPinFlagLayersDropdownOpen(prev => !prev);
            }}
            title="Visual Order (Layers)"
            style={{
              background: isPinFlagLayersDropdownOpen ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
              border: isPinFlagLayersDropdownOpen ? '1px solid #2962ff' : 'none',
              color: isPinFlagLayersDropdownOpen ? '#2979ff' : '#787b86',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '26px',
              width: '26px',
              boxSizing: 'border-box'
            }}
            onMouseEnter={e => { if (!isPinFlagLayersDropdownOpen) { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; } }}
            onMouseLeave={e => { if (!isPinFlagLayersDropdownOpen) { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
          >
            <Layers size={15} />
          </button>

          {isPinFlagLayersDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '32px',
                left: '0',
                backgroundColor: '#1e222d',
                border: '1px solid #2a2e39',
                borderRadius: '6px',
                boxShadow: '0 6px 18px rgba(0,0,0,0.7)',
                padding: '4px 0',
                minWidth: '150px',
                zIndex: 160000
              }}
              onClick={e => e.stopPropagation()}
            >
              {[
                { action: 'front', label: 'Bring to Front', icon: ChevronsUp },
                { action: 'forward', label: 'Bring Forward', icon: ChevronUp },
                { action: 'backward', label: 'Send Backward', icon: ChevronDown },
                { action: 'back', label: 'Send to Back', icon: ChevronsDown }
              ].map(item => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={item.action}
                    onClick={() => {
                      reorderOverlayInStack(editingPinFlagOverlay.overlayId, item.action as any);
                      setIsPinFlagLayersDropdownOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 12px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: '#d1d4dc'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#d1d4dc';
                    }}
                  >
                    <IconComponent size={14} color="#787b86" />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Trash/Delete Button */}
        <button
          onClick={handleTrashPinFlag}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            height: '26px',
            width: '26px',
            padding: 0,
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            outline: 'none',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#787b86';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title={isPin ? 'Delete Pin' : 'Delete Flag'}
        >
          <DeletebtnIcon width={16} height={16} />
        </button>
      </div>
    );
  };

  const renderElliottFloatingToolbar = () => {
    if (!editingElliottOverlay) return null;

    const hexToRgb = (hex: string) => {
      let cleanHex = hex.replace('#', '');
      if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(char => char + char).join('');
      }
      const num = parseInt(cleanHex, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    };

    const updateAndSaveElliott = (keyOrObj: string | Record<string, any>, value?: any) => {
      const patch = typeof keyOrObj === 'string' ? { [keyOrObj]: value } : keyOrObj;
      const nextOverlayState = {
        ...editingElliottOverlay,
        ...patch
      };
      setEditingElliottOverlay(nextOverlayState);
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        const overlays = typeof activeChart.getOverlays === 'function' ? activeChart.getOverlays() : [];
        const target = overlays.find((o: any) => o.id === editingElliottOverlay.overlayId);
        if (target) {
          if (patch.locked !== undefined) {
            target.lock = patch.locked;
          }
          target.extendData = {
            ...(target.extendData || {}),
            ...patch,
            locked: patch.locked !== undefined ? patch.locked : (target.extendData?.locked ?? target.lock)
          };
          if (!target.styles) target.styles = {};
          if (!target.styles.line) target.styles.line = {};
          if (patch.color) {
            target.styles.line.color = patch.color;
          }
          if (patch.size) {
            target.styles.line.size = patch.size;
          }
          activeChart.overrideOverlay({
            id: editingElliottOverlay.overlayId,
            lock: patch.locked !== undefined ? patch.locked : target.lock,
            styles: target.styles,
            extendData: target.extendData
          });
          if (typeof activeChart.updatePane === 'function') {
            activeChart.updatePane(1);
          }
          if (typeof activeChart.invalidate === 'function') {
            activeChart.invalidate();
          }
        }
      }
    };

    const handleDeleteElliott = () => {
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart && typeof activeChart.removeOverlay === 'function') {
        try {
          activeChart.removeOverlay({ id: editingElliottOverlay.overlayId });
        } catch (e) {}
        if (typeof activeChart.updatePane === 'function') {
          activeChart.updatePane(1);
        }
        if (typeof activeChart.invalidate === 'function') {
          activeChart.invalidate();
        }
      }
      setEditingElliottOverlay(null);
      setIsElliottSizeDropdownOpen(false);
    };

    const isElliottLocked = editingElliottOverlay.locked ?? false;
    const currentColor = editingElliottOverlay.color || '#2979ff';
    const currentSize = editingElliottOverlay.size || 1;

    return (
      <div
        className="tradingview-elliott-drag-toolbar"
        style={{
          position: 'fixed',
          left: `${panelPos.x}px`,
          top: `${panelPos.y}px`,
          backgroundColor: '#1e222d',
          border: '1px solid #2a2e39',
          borderRadius: '6px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          zIndex: 10000,
          userSelect: 'none',
          pointerEvents: 'auto',
          color: '#d1d4dc',
          fontFamily: "'Rubik', 'Rubik', sans-serif",
          boxSizing: 'border-box',
          gap: '6px',
          height: '38px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div
          onMouseDown={handlePanelDragStart}
          title="Drag Toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isPanelDragging ? 'grabbing' : 'grab',
            padding: '4px 2px',
            color: '#787b86',
            borderRadius: '4px',
            transition: 'color 0.12s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#d1d4dc'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#787b86'}
        >
          <GripVertical size={16} />
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Line Color Selection (ColorStylePicker) */}
        <ColorStylePicker
          color={currentColor}
          opacity={1.0}
          hideStyleSelector={true}
          onChange={(newColor, newOpacity) => {
            const finalColor = newOpacity < 1 ? `rgba(${hexToRgb(newColor).r}, ${hexToRgb(newColor).g}, ${hexToRgb(newColor).b}, ${newOpacity})` : newColor;
            updateAndSaveElliott('color', finalColor);
          }}
        />

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Line px size selector dropdown */}
        <div style={{ position: 'relative' }} title="Line Width">
          <button
            ref={elliottSizeBtnRef}
            onClick={(e) => {
              e.stopPropagation();
              setIsElliottSizeDropdownOpen(prev => !prev);
            }}
            style={{
              background: isElliottSizeDropdownOpen ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: isElliottSizeDropdownOpen ? '#2979ff' : '#d1d4dc',
              padding: '0 6px',
              cursor: 'pointer',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '26px',
              boxSizing: 'border-box'
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: '500', minWidth: '14px', textAlign: 'center' }}>
              {currentSize}px
            </span>
            <ChevronDown size={12} color="#787b86" />
          </button>

          {isElliottSizeDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '32px',
                left: '0',
                backgroundColor: '#1e222d',
                border: '1px solid #2a2e39',
                borderRadius: '6px',
                boxShadow: '0 6px 18px rgba(0,0,0,0.7)',
                padding: '4px 0',
                minWidth: '85px',
                zIndex: 160000
              }}
              onClick={e => e.stopPropagation()}
            >
              {[1, 2, 3, 4].map((px) => (
                <div
                  key={px}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateAndSaveElliott('size', px);
                    setIsElliottSizeDropdownOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: currentSize === px ? '#2979ff' : '#d1d4dc',
                    backgroundColor: currentSize === px ? 'rgba(41, 98, 255, 0.12)' : 'transparent'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = currentSize === px ? 'rgba(41, 98, 255, 0.12)' : 'transparent'}
                >
                  <span>{px}px</span>
                  {currentSize === px && <Check size={12} color="#2979ff" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Lock Button */}
        <button
          onClick={() => updateAndSaveElliott('locked', !isElliottLocked)}
          title={isElliottLocked ? 'Unlock' : 'Lock'}
          style={{
            background: isElliottLocked ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
            border: isElliottLocked ? '1px solid #2962ff' : 'none',
            color: isElliottLocked ? '#2979ff' : '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { if (!isElliottLocked) { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; } }}
          onMouseLeave={e => { if (!isElliottLocked) { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
        >
          {isElliottLocked ? <LockbtnIcon width={16} height={16} /> : <UnlockbtnIcon width={16} height={16} />}
        </button>

        {/* Hide / Visibility (Eye) Button */}
        <button
          onClick={() => {
            const activeChart = (window as any).__active_chart_instance__;
            if (activeChart && typeof activeChart.overrideOverlay === 'function') {
              activeChart.overrideOverlay({
                id: editingElliottOverlay.overlayId,
                visible: false
              });
              if (typeof activeChart.invalidate === 'function') activeChart.invalidate();
            }
            setEditingElliottOverlay(null);
            setIsElliottSizeDropdownOpen(false);
            window.dispatchEvent(new CustomEvent('update-layer-panel'));
            window.dispatchEvent(new CustomEvent('save-history-state'));
          }}
          title="Hide"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <Eye size={15} />
        </button>

        {/* Duplicate Button */}
        <button
          onClick={() => cloneOverlayInStack(editingElliottOverlay.overlayId)}
          title="Duplicate"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <Copy size={15} />
        </button>

        {/* Visual Order / Layers Dropdown Button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsElliottLayersDropdownOpen(prev => !prev);
              setIsElliottSizeDropdownOpen(false);
            }}
            title="Visual Order (Layers)"
            style={{
              background: isElliottLayersDropdownOpen ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
              border: isElliottLayersDropdownOpen ? '1px solid #2962ff' : 'none',
              color: isElliottLayersDropdownOpen ? '#2979ff' : '#787b86',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '26px',
              width: '26px',
              boxSizing: 'border-box'
            }}
            onMouseEnter={e => { if (!isElliottLayersDropdownOpen) { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; } }}
            onMouseLeave={e => { if (!isElliottLayersDropdownOpen) { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
          >
            <Layers size={15} />
          </button>

          {isElliottLayersDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '32px',
                left: '0',
                backgroundColor: '#1e222d',
                border: '1px solid #2a2e39',
                borderRadius: '6px',
                boxShadow: '0 6px 18px rgba(0,0,0,0.7)',
                padding: '4px 0',
                minWidth: '150px',
                zIndex: 160000
              }}
              onClick={e => e.stopPropagation()}
            >
              {[
                { action: 'front', label: 'Bring to Front', icon: ChevronsUp },
                { action: 'forward', label: 'Bring Forward', icon: ChevronUp },
                { action: 'backward', label: 'Send Backward', icon: ChevronDown },
                { action: 'back', label: 'Send to Back', icon: ChevronsDown }
              ].map(item => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={item.action}
                    onClick={() => {
                      reorderOverlayInStack(editingElliottOverlay.overlayId, item.action as any);
                      setIsElliottLayersDropdownOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 12px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: '#d1d4dc'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#d1d4dc';
                    }}
                  >
                    <IconComponent size={14} color="#787b86" />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

        {/* Trash/Delete Button */}
        <button
          onClick={handleDeleteElliott}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#787b86',
            cursor: 'pointer',
            height: '26px',
            width: '26px',
            padding: 0,
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            outline: 'none',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#787b86';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="Delete Elliott Wave"
        >
          <DeletebtnIcon width={16} height={16} />
        </button>
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: styles?.bgType === 'gradient'
          ? `linear-gradient(to bottom, ${applyColorOpacity(styles.bgColor, styles.bgOpacity ?? 1.0)}, ${applyColorOpacity(styles.bgColor2 || styles.bgColor, styles.bgOpacity ?? 1.0)})`
          : applyColorOpacity(styles?.bgColor || '#131722', styles?.bgOpacity ?? 1.0)
      }}
    >
      <style>{`
        /* Force enlarged top panel height, icon size and vertical alignment */
        .ticker-pen-pro-period-bar {
          gap: 4px !important;
          padding: 2px 8px !important;
          align-items: center !important;
          height: 38px !important;
          max-height: 38px !important;
          min-height: 38px !important;
          border: none !important;
          border-bottom: 1px solid #2a2e39 !important;
          background-color: #000000 !important;
          box-sizing: border-box !important;
        }

        .ticker-pen-pro-drawing-bar {
          width: 52px !important;
          max-width: 52px !important;
          min-width: 52px !important;
          border: none !important;
          border-right: 1px solid #2a2e39 !important;
          border-radius: 0 !important;
          background-color: #000000 !important;
          box-sizing: border-box !important;
        }

        .ticker-pen-pro-widget,
        .ticker-pen-pro-content,
        .ticker-pen-pro-pane {
          border: none !important;
          border-radius: 0 !important;
          background: transparent !important;
          background-color: transparent !important;
          box-sizing: border-box !important;
        }

        .ticker-pen-pro-period-bar .item,
        .ticker-pen-pro-period-bar .period,
        .ticker-pen-pro-period-bar .tools,
        .ticker-pen-pro-period-bar .symbol,
        .ticker-pen-pro-period-bar button {
          height: 32px !important;
          max-height: 32px !important;
          min-height: 32px !important;
          box-sizing: border-box !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          margin: 0 !important;
          font-size: 13px !important;
          min-width: unset !important;
          transition: background-color 0.15s, color 0.15s !important;
        }

        /* Ensure custom top bar buttons are visible while hiding all built-in legacy tools */
        .ticker-pen-pro-period-bar .tools {
          display: none !important;
        }

        .custom-indicators-container,
        .custom-top-settings-btn,
        .custom-screenshot-btn,
        .custom-fullscreen-btn {
          display: inline-flex !important;
        }

        /* Hide bottom-right corner settings gear icon */
        .custom-chart-settings-icon {
          display: none !important;
        }

        /* Hide built-in price unit currency indicator */
        .ticker-pen-pro-price-unit {
          display: none !important;
        }

        /* Standalone buttons & containers border-radius */
        .ticker-pen-pro-period-bar .item:not(.custom-indicators-btn):not(.custom-indicators-arrow-btn):not(.custom-charttype-main-btn):not(.custom-charttype-arrow-btn),
        .ticker-pen-pro-period-bar .period,
        .ticker-pen-pro-period-bar .symbol,
        .ticker-pen-pro-period-bar .custom-layout-main-btn,
        .ticker-pen-pro-period-bar .custom-timeframes-arrow-btn {
          border-radius: 6px !important;
        }

        /* Split button left side */
        .custom-charttype-main-btn,
        .custom-indicators-btn {
          border-radius: 6px 0 0 6px !important;
        }

        /* Split button right side */
        .custom-charttype-arrow-btn,
        .custom-indicators-arrow-btn {
          border-radius: 0 6px 6px 0 !important;
        }

        /* Period bar selected item background shade matching design */
        :not([data-chrome-theme="light"]) .ticker-pen-pro-period-bar .item.period.selected,
        :not([data-chrome-theme="light"]) .ticker-pen-pro-period-bar .item.selected,
        :not([data-chrome-theme="light"]) .ticker-pen-pro-period-bar .period.selected,
        :not([data-chrome-theme="light"]) .ticker-pen-pro-period-bar .item[data-selected="true"],
        :not([data-chrome-theme="light"]) .ticker-pen-pro-period-bar .period[data-selected="true"] {
          background-color: rgba(255, 255, 255, 0.18) !important;
          color: #ffffff !important;
          border-radius: 6px !important;
          font-weight: 600 !important;
          padding: 4px 10px !important;
          height: 28px !important;
        }

        :not([data-chrome-theme="light"]) .ticker-pen-pro-period-bar .item.period:hover:not(.selected),
        :not([data-chrome-theme="light"]) .ticker-pen-pro-period-bar .item:hover:not(.selected),
        :not([data-chrome-theme="light"]) .ticker-pen-pro-period-bar .period:hover:not(.selected),
        :not([data-chrome-theme="light"]) .ticker-pen-pro-period-bar .tools:hover {
          background-color: rgba(255, 255, 255, 0.08) !important;
          color: #ffffff !important;
        }

        /* Light mode selected period items - crisp black text with subtle background */
        [data-chrome-theme="light"] .ticker-pen-pro-period-bar .item.period.selected,
        [data-chrome-theme="light"] .ticker-pen-pro-period-bar .item.selected,
        [data-chrome-theme="light"] .ticker-pen-pro-period-bar .period.selected,
        [data-chrome-theme="light"] .ticker-pen-pro-period-bar .item[data-selected="true"],
        [data-chrome-theme="light"] .ticker-pen-pro-period-bar .period[data-selected="true"] {
          background-color: rgba(0, 0, 0, 0.08) !important;
          color: #000000 !important;
          border-radius: 6px !important;
          font-weight: 700 !important;
          padding: 4px 10px !important;
          height: 28px !important;
        }

        [data-chrome-theme="light"] .ticker-pen-pro-period-bar .item.period:hover:not(.selected),
        [data-chrome-theme="light"] .ticker-pen-pro-period-bar .item:hover:not(.selected),
        [data-chrome-theme="light"] .ticker-pen-pro-period-bar .period:hover:not(.selected) {
          background-color: rgba(0, 0, 0, 0.05) !important;
          color: #000000 !important;
        }
        
        /* Make sure the default SVG icon in the first tools button (Indicators) is visible and styled */
        .ticker-pen-pro-period-bar .tools:not(.tools ~ .tools) svg {
          display: inline-block !important;
          vertical-align: middle !important;
          margin-right: 4px !important;
        }
        /* Customize the text inside the first tools button and force it to be visible even on small/split screens */
        .ticker-pen-pro-period-bar .tools:not(.tools ~ .tools) span {
          display: inline-block !important;
          color: inherit !important;
          font-size: 11px !important;
          font-weight: 500 !important;
        }
        /* Style the Indicators button */
        .ticker-pen-pro-period-bar .tools:not(.tools ~ .tools) {
          display: inline-flex !important;
          align-items: center !important;
        }

        /* Screenshot Modal & Toast Animations */
        @keyframes modalFadeIn {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes toastSlideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -10px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .hide-native-cursor canvas {
          cursor: none !important;
        }
      `}</style>
      <div
        ref={containerRef}
        className={customCursorMode === 'dot' ? 'hide-native-cursor' : ''}
        onPointerMove={(e) => {
          if (customCursorMode !== 'demonstration' && customCursorMode !== 'dot') {
            return;
          }
          const target = e.target as HTMLElement | null;
          if (target && target.closest('button, input, select, textarea, a, [role="button"], .custom-side-tool-panel, .custom-tool-popover-menu, .ticker-pen-pro-period-bar, [class*="modal"], [class*="dialog"], [class*="popover"], [class*="dropdown"], [class*="toolbar"], [class*="settings"], [class*="floating"]')) {
            if (customCursorPos !== null) setCustomCursorPos(null);
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          setCustomCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onPointerLeave={() => {
          if (customCursorPos !== null) setCustomCursorPos(null);
        }}
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
        }}
      />
      {/* Custom Demonstration Cursor (Red translucent circle centered on crosshair) */}
      {customCursorMode === 'demonstration' && customCursorPos && (
        <div
          style={{
            position: 'absolute',
            left: customCursorPos.x,
            top: customCursorPos.y,
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: 'rgba(220, 50, 50, 0.45)',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 45,
          }}
        />
      )}
      {/* Custom Dot Cursor */}
      {customCursorMode === 'dot' && customCursorPos && (
        <div
          style={{
            position: 'absolute',
            left: customCursorPos.x,
            top: customCursorPos.y,
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: '#131722',
            border: '1.5px solid #ffffff',
            boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.4)',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 45,
          }}
        />
      )}
      {renderWatermark()}
      {renderStatusLine()}
      {renderCurrencyDropdown()}
      {renderFloatingControls()}
      {renderIndicatorSettingsModal()}
      {renderScreenshotModal()}
      {renderToast()}
      {renderSymbolSearchModal()}
      {renderTextSettingsModal()}
      {renderFibSettingsPanel()}
      {renderFibFullSettingsModal()}
      {renderPositionSettingsPanel()}
      {renderPositionSettingsModal()}
      {renderPinFlagSettingsPanel()}
      {renderElliottFloatingToolbar()}
      <TableToolbarAndModal />
      <DrawingDragToolbar />
      <TradingPositionOverlay
        coreChart={coreChartRef.current}
        container={containerRef.current}
        positions={positions}
        executions={executions}
        onPositionClose={onPositionClose}
        onPositionReverse={onPositionReverse}
        onModifyTP={onModifyTP}
        onModifySL={onModifySL}
      />
      {/* Network Connection Error Overlay */}
      {networkError?.isError && (
        <div className="chart-network-error-overlay">
          <div className="chart-network-error-card">
            <div className="chart-network-error-icon-wrapper">
              <svg
                className="chart-network-error-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
              <span className="chart-network-error-pulse" />
            </div>

            <h3 className="chart-network-error-title">Network Unavailable</h3>
            <p className="chart-network-error-desc">
              {networkError.message || 'Unable to connect to market servers. Please check your network connection and try again.'}
            </p>

            <div className="chart-network-error-actions">
              <button
                type="button"
                className="chart-network-retry-btn"
                onClick={async () => {
                  if (isRetryingNetwork) return;
                  setIsRetryingNetwork(true);
                  try {
                    if (typeof navigator !== 'undefined' && !navigator.onLine) {
                      setNetworkError({
                        isError: true,
                        message: 'Still offline. Please check your internet connection and try again.'
                      });
                      return;
                    }
                    await handleRefreshChart();
                  } finally {
                    setIsRetryingNetwork(false);
                  }
                }}
                disabled={isRetryingNetwork}
              >
                {isRetryingNetwork ? (
                  <>
                    <span className="chart-network-btn-spinner" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    <span>Try Again</span>
                  </>
                )}
              </button>
            </div>

            <div className="chart-network-status-hint">
              <span className="chart-network-status-dot" />
              <span>Auto-reconnecting when network is restored</span>
            </div>
          </div>
        </div>
      )}
      <MarketConnectionModal
        isOpen={showMarketConnectionModal}
        onClose={() => setShowMarketConnectionModal(false)}
      />
    </div>
  );
}
