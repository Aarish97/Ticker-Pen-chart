import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { ShortPosition } from './short-position';
import { drawLine, getGlobalActiveDragAnchor } from '../../rendering/canvas-utils';

export class ShortPositionPaneView implements IPrimitivePaneView {
  private _renderer: ShortPositionPaneRenderer;

  constructor(drawing: ShortPosition) {
    this._renderer = new ShortPositionPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class ShortPositionPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: ShortPosition;

  constructor(drawing: ShortPosition) {
    this._drawing = drawing;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
      this.drawImpl(scope);
    });
  }

  private drawImpl(scope: BitmapCoordinatesRenderingScope): void {
    const { context: ctx, horizontalPixelRatio } = scope;
    const pixelRatio = horizontalPixelRatio;

    const viewport = this._drawing.getViewport();
    if (!viewport) return;
    if (!this._drawing.options.visible) return;
    if (!this._drawing.isValid()) return;

    const anchors = this._drawing.anchors;
    const entry = this._drawing.anchorToPixel(anchors[0], viewport); // Entry Left
    const stopLoss = this._drawing.anchorToPixel(anchors[1], viewport); // Stop Loss Left
    const takeProfit = this._drawing.anchorToPixel(anchors[2], viewport); // Take Profit Left
    const entryRight = this._drawing.anchorToPixel(anchors[3], viewport); // Entry Right (width)

    if (!entry || !stopLoss || !takeProfit || !entryRight) return;

    // Isolate canvas state to prevent inherited styles (e.g. dashed lines) from other overlays
    ctx.save();
    ctx.setLineDash([]);

    const options = { ...this._drawing.positionOptions, ...(this._drawing as any).extendData };
    const info = this._drawing.getPositionInfo();
    
    // Resolve the specific TickerPen instance dynamically by overlay ID
    let chart: any = null;
    try {
      const charts = Array.from((window as any).globalCoreCharts || []).filter((c: any) => {
        try {
          const container = typeof c?.getContainer === 'function' ? c.getContainer() : null;
          return container && document.body.contains(container);
        } catch (e) {
          return false;
        }
      });
      chart = charts.find((c: any) => {
        try {
          return c.getOverlays({ id: this._drawing.id }).length > 0;
        } catch (err) {
          return false;
        }
      }) || (globalThis as any).__active_chart_instance__ || charts[0];
    } catch (e) {}

    // Detect asset decimal precision dynamically from symbol info or candle close prices
    let precision = 2;
    try {
      const activeChart = chart || (typeof window !== 'undefined' && (window as any).__active_chart_instance__);
      const symbolInfo = activeChart?.getSymbol?.();
      if (symbolInfo && typeof symbolInfo.pricePrecision === 'number') {
        precision = symbolInfo.pricePrecision;
      } else if (typeof window !== 'undefined' && typeof (window as any).__active_price_precision__ === 'number') {
        precision = (window as any).__active_price_precision__;
      } else if (chart) {
        const dataList = chart.getDataList();
        if (dataList && dataList.length > 0) {
          const sampleCount = Math.min(10, dataList.length);
          let maxDecimals = 0;
          for (let i = dataList.length - sampleCount; i < dataList.length; i++) {
            const closeVal = Number(dataList[i].close);
            if (isFinite(closeVal)) {
              const closeStr = closeVal.toString();
              const dot = closeStr.indexOf('.');
              if (dot >= 0) {
                maxDecimals = Math.max(maxDecimals, closeStr.length - dot - 1);
              }
            }
          }
          precision = Math.max(2, maxDecimals);
        }
      }
    } catch (e) {
      // Ignore
    }

    // Helper to format prices with exact precision
    function formatDynamicPrice(val: number, _entryVal?: number): string {
      return val.toFixed(precision);
    }

    const left = entry.x;
    const right = entryRight.x;
    const width = Math.max(10, right - left);

    function formatYAxisPrice(val: number): string {
      const convRate = (typeof window !== 'undefined' && (window as any).__currency_conversion_rate__) || 1;
      let convertedVal = val * convRate;

      const absVal = Math.abs(convertedVal);

      // Large value abbreviation
      if (absVal >= 1_000_000_000_000) return (convertedVal / 1_000_000_000_000).toFixed(2) + 'T';
      if (absVal >= 1_000_000_000) return (convertedVal / 1_000_000_000).toFixed(2) + 'B';
      if (absVal >= 1_000_000) return (convertedVal / 1_000_000).toFixed(2) + 'M';

      let effectivePrecision = precision;
      if (convRate !== 1) {
        if (absVal >= 1000) effectivePrecision = Math.min(precision, 2);
        else if (absVal >= 1) effectivePrecision = Math.min(precision, 4);
        else if (absVal >= 0.001) effectivePrecision = Math.max(precision, 6);
        else effectivePrecision = Math.max(precision, 8);
      }

      let str = convertedVal.toFixed(effectivePrecision);
      const thousandsSeparator = (typeof window !== 'undefined' && (window as any).__thousands_separator__) ?? ',';
      if (thousandsSeparator) {
        const parts = str.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
        str = parts.join('.');
      }
      const decimalFoldThreshold = (typeof window !== 'undefined' && typeof (window as any).__decimal_fold_threshold__ === 'number') 
        ? (window as any).__decimal_fold_threshold__ 
        : 3;
      if (decimalFoldThreshold > 0) {
        const reg = new RegExp('\\.0{' + decimalFoldThreshold + ',}[1-9][0-9]*$');
        if (reg.test(str)) {
          const result = str.split('.');
          const v = result[result.length - 1];
          const match = v.match(/0*/);
          if (match) {
            const count = match[0].length;
            result[result.length - 1] = v.replace(/0*/, `0{${count}}`);
            str = result.join('.');
          }
        }
      }
      return str;
    }

    // Helper to calculate ticks
    function getTicks(diff: number, _entryVal?: number): number {
      const tickSize = Math.pow(10, -precision);
      return Math.round(diff / tickSize);
    }

    // Get chart data list
    let dataList: any[] = [];
    try {
      if (chart) {
        dataList = chart.getDataList() || [];
      }
    } catch (e) {
      // Ignore
    }

    // Resolve index range of the box
    let boxStartIndex = -1;
    let boxEndIndex = -1;
    if (dataList.length > 0 && anchors[0] && anchors[3]) {
      const entryTime = Number(anchors[0].time);
      const entryIdxAnchor = (anchors[0] as any).dataIndex !== undefined ? Number((anchors[0] as any).dataIndex) : undefined;
      
      if (entryTime > 0) {
        boxStartIndex = dataList.findIndex((item: any) => item && Number(item.timestamp) === entryTime);
        if (boxStartIndex === -1) {
          let minDiff = Infinity;
          for (let i = 0; i < dataList.length; i++) {
            const diff = Math.abs(Number(dataList[i].timestamp) - entryTime);
            if (diff < minDiff) {
              minDiff = diff;
              boxStartIndex = i;
            }
          }
        }
      }
      if (boxStartIndex === -1 && entryIdxAnchor !== undefined && Number.isFinite(entryIdxAnchor)) {
        boxStartIndex = Math.round(entryIdxAnchor);
      }

      const exitTime = Number(anchors[3].time);
      const exitIdxAnchor = (anchors[3] as any).dataIndex !== undefined ? Number((anchors[3] as any).dataIndex) : undefined;
      if (exitTime > 0) {
        boxEndIndex = dataList.findIndex((item: any) => item && Number(item.timestamp) === exitTime);
        if (boxEndIndex === -1) {
          let minDiff = Infinity;
          for (let i = 0; i < dataList.length; i++) {
            const diff = Math.abs(Number(dataList[i].timestamp) - exitTime);
            if (diff < minDiff) {
              minDiff = diff;
              boxEndIndex = i;
            }
          }
        }
      }
      if (boxEndIndex === -1 && exitIdxAnchor !== undefined && Number.isFinite(exitIdxAnchor)) {
        boxEndIndex = Math.round(exitIdxAnchor);
      }
    }

    if (boxStartIndex === -1) boxStartIndex = 0;
    if (boxEndIndex === -1) boxEndIndex = dataList.length - 1;

    boxStartIndex = Math.max(0, Math.min(dataList.length - 1, Math.round(boxStartIndex)));
    boxEndIndex = Math.max(boxStartIndex, Math.min(dataList.length - 1, Math.round(boxEndIndex)));

    // Determine the active end index (clamp to right edge of the box)
    const lastDataIndex = dataList.length - 1;
    let activeEndIndex = lastDataIndex;
    if (boxEndIndex >= 0 && boxEndIndex < lastDataIndex) {
      activeEndIndex = boxEndIndex;
    }

    // Resolve current price inside the box
    let currentPrice = info.entry;
    if (activeEndIndex >= 0 && activeEndIndex < dataList.length && dataList[activeEndIndex]) {
      currentPrice = Number(dataList[activeEndIndex].close ?? info.entry);
    }

    // Search for first entry touch candle within the active range of the box
    let entryTouchIndex = -1;
    if (dataList.length > 0 && boxStartIndex >= 0) {
      const searchEndIndex = Math.min(activeEndIndex, dataList.length - 1);
      for (let i = boxStartIndex; i <= searchEndIndex; i++) {
        const item = dataList[i];
        if (!item) continue;
        const low = Number(item.low);
        const high = Number(item.high);
        if (!isNaN(low) && !isNaN(high) && low <= info.entry && high >= info.entry) {
          entryTouchIndex = i;
          break;
        }
      }
    }

    // Helper to get candle pixel X accurately
    const getCandlePixelX = (idx: number): number => {
      try {
        if (chart) {
          const chartStore = chart._chartStore || chart.chartStore;
          if (chartStore && typeof chartStore.dataIndexToCoordinate === 'function') {
            const cx = chartStore.dataIndexToCoordinate(idx);
            if (typeof cx === 'number' && Number.isFinite(cx)) return cx;
          }
          if (typeof chart.convertToPixel === 'function') {
            const res = chart.convertToPixel([{ dataIndex: idx }], { paneId: 'candle_pane' });
            if (res && res[0] && Number.isFinite(res[0].x)) return res[0].x;
          }
        }
        if (idx >= 0 && idx < dataList.length && dataList[idx]) {
          const cx = viewport.timeScale.timeToCoordinate(dataList[idx].timestamp);
          if (typeof cx === 'number' && Number.isFinite(cx) && cx >= left - 50 && cx <= right + 500) {
            return cx;
          }
        }
      } catch (e) {}

      if (boxEndIndex > boxStartIndex) {
        const ratio = (idx - boxStartIndex) / (boxEndIndex - boxStartIndex);
        return left + (right - left) * ratio;
      }
      return left;
    };

    let entryIndex = entryTouchIndex !== -1 ? entryTouchIndex : boxStartIndex;
    let entryCandleX: number = entryTouchIndex !== -1 ? getCandlePixelX(entryTouchIndex) : entry.x;

    let exitIndex = -1;
    let exitPrice = currentPrice;
    if (entryTouchIndex !== -1 && entryIndex >= 0 && entryIndex <= activeEndIndex) {
      for (let i = entryIndex; i <= activeEndIndex; i++) {
        const item = dataList[i];
        if (!item) continue;
        const low = Number(item.low);
        const high = Number(item.high);
        if (isNaN(low) || isNaN(high)) continue;
        const targetHit = low <= info.takeProfit;
        const stopHit = high >= info.stopLoss;
        if (targetHit || stopHit) {
          exitIndex = i;
          if (targetHit && stopHit) {
            exitPrice = info.stopLoss; // Conservative fallback
          } else if (targetHit) {
            exitPrice = info.takeProfit;
          } else {
            exitPrice = info.stopLoss;
          }
          break;
        }
      }
    }

    // If exit is found, freeze the trade's end coordinate and price at the exit candle
    if (exitIndex !== -1) {
      activeEndIndex = exitIndex;
      currentPrice = exitPrice;
    }

    let currentPriceX: number = Math.min(right, Math.max(entryCandleX, getCandlePixelX(activeEndIndex)));
    const currentPriceY = viewport.priceScale.priceToCoordinate(currentPrice) ?? entry.y;

    // Clamp currentPriceY to the vertical bounds of the box
    const minY = Math.min(takeProfit.y, stopLoss.y);
    const maxY = Math.max(takeProfit.y, stopLoss.y);
    const clampedPriceY = Math.max(minY, Math.min(maxY, currentPriceY));

    // Calculations
    const activeChart = (window as any).__active_chart_instance__;
    const currentSymbolShort = activeChart?.getSymbol()?.shortName || '';
    const nativeSymbolQuote = (currentSymbolShort.split('/')?.[1] || activeChart?.getSymbol()?.priceCurrency || 'USD').toUpperCase();
    const activeCurrencyCode = (typeof window !== 'undefined' && (window as any).__currency_code__ && (window as any).__currency_code__ !== 'NATIVE')
      ? (window as any).__currency_code__
      : nativeSymbolQuote;

    const selectedCurrencyCode = options.accountSizeCurrency ?? 'Default';
    const displayCurrencyCode = selectedCurrencyCode === 'Default' ? activeCurrencyCode : selectedCurrencyCode;

    function getCurrencySymbol(code: string): string {
      const symbols: Record<string, string> = {
        USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹', AUD: 'A$', CAD: 'C$', CHF: 'Fr', CNY: '¥', BTC: '₿', ETH: 'Ξ', USDT: '$'
      };
      return symbols[code] || '';
    }
    const currencySymbol = getCurrencySymbol(displayCurrencyCode);

    function convertCurrency(value: number, fromCurr: string, toCurr: string): number {
      const rates = (window as any).__currency_rates__ || { USD: 1 };
      const cleanFrom = fromCurr.toUpperCase();
      const cleanTo = toCurr.toUpperCase();
      if (cleanFrom === cleanTo) return value;
      const getRate = (code: string) => {
        if (code === 'USDT' || code === 'USDC' || code === 'NATIVE') return 1.0;
        return rates[code] || 1.0;
      };
      const rateFrom = getRate(cleanFrom);
      const rateTo = getRate(cleanTo);
      return value * (rateTo / rateFrom);
    }

    const accountSize = options.accountSize ?? 10000;
    const lotSize = options.lotSize ?? 1;
    const riskType = options.riskType ?? 'percent';
    const riskVal = options.risk ?? 10.00;
    const leverage = options.leverage ?? 1;
    const qtyPrecision = options.qtyPrecision ?? 'Default';

    let riskAmount = 0;
    if (riskType === 'percent') {
      riskAmount = accountSize * (riskVal / 100);
    } else {
      riskAmount = riskVal;
    }

    const stopDistance = Math.abs(info.stopLoss - info.entry);
    const targetDistance = Math.abs(info.entry - info.takeProfit);

    const riskInSymbolQuote = convertCurrency(riskAmount, displayCurrencyCode, nativeSymbolQuote);
    const accountSizeInSymbolQuote = convertCurrency(accountSize, displayCurrencyCode, nativeSymbolQuote);

    const maxQty = info.entry > 0 && lotSize > 0 ? (accountSizeInSymbolQuote * leverage) / (info.entry * lotSize) : 0;
    let Qty = 0;
    if (stopDistance !== 0 && lotSize !== 0) {
      Qty = riskInSymbolQuote / (lotSize * stopDistance);
    }
    if (maxQty > 0) {
      Qty = Math.min(Qty, maxQty);
    }

    let qtyStr = '';
    if (qtyPrecision === 'Default') {
      qtyStr = Qty.toFixed(3);
    } else {
      const precisionInt = parseInt(qtyPrecision, 10);
      Qty = parseFloat(Qty.toFixed(precisionInt));
      qtyStr = Qty.toFixed(precisionInt);
    }

    const stopPnLVal = Qty * lotSize * stopDistance;
    const targetPnLVal = Qty * lotSize * targetDistance;

    const stopPnLValInAccount = convertCurrency(stopPnLVal, nativeSymbolQuote, displayCurrencyCode);
    const targetPnLValInAccount = convertCurrency(targetPnLVal, nativeSymbolQuote, displayCurrencyCode);

    const stopAmount = accountSize - stopPnLValInAccount;
    const targetAmount = accountSize + targetPnLValInAccount;

    const stopAmountStr = stopAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const targetAmountStr = targetAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const pnlDiff = info.entry - currentPrice;
    const pnlDiffStr = (pnlDiff >= 0 ? '+' : '-') + currencySymbol + Math.abs(pnlDiff).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const openPnlStr = (pnlDiff >= 0 ? '' : '-') + Math.abs(pnlDiff).toFixed(precision);

    const drawingStyle = (this._drawing.style || {}) as any;
    const getStyleColor = (styleObj: any, key: string, fallback: string) => {
      if (styleObj) {
        if (styleObj[key] && typeof styleObj[key].color === 'string') return styleObj[key].color;
        if (typeof styleObj[key] === 'string') return styleObj[key];
        if (typeof styleObj[`${key}Color`] === 'string') return styleObj[`${key}Color`];
      }
      return fallback;
    };
    const profitColor = options.profitColor ?? options.targetColor ?? getStyleColor(drawingStyle, 'takeProfit', '#26a69a');
    const lossColor = options.lossColor ?? options.stopColor ?? getStyleColor(drawingStyle, 'stopLoss', '#ef5350');

    const hexToRgba = (colorStr: string, opacity: number): string => {
      if (!colorStr) return `rgba(0, 0, 0, ${opacity})`;
      if (colorStr.startsWith('rgba')) {
        return colorStr.replace(/[\d.]+\)$/, `${opacity})`);
      }
      if (colorStr.startsWith('rgb')) {
        return colorStr.replace('rgb', 'rgba').replace(/\)$/, `, ${opacity})`);
      }
      if (colorStr.startsWith('#')) {
        let cleanHex = colorStr.replace('#', '');
        if (cleanHex.length === 3) {
          cleanHex = cleanHex.split('').map(char => char + char).join('');
        }
        const num = parseInt(cleanHex, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
      return colorStr;
    };

    const getOpacity = (colorStr: string, fallback: number): number => {
      if (!colorStr) return fallback;
      if (colorStr.startsWith('rgba')) {
        const parts = colorStr.match(/[\d.]+/g);
        if (parts && parts.length >= 4) {
          const val = parseFloat(parts[3]);
          return isNaN(val) ? fallback : val;
        }
      }
      if (colorStr.startsWith('#') || colorStr.startsWith('rgb')) {
        return 1.0;
      }
      return fallback;
    };

    const profitOpacity = getOpacity(profitColor, 0.2);
    const lossOpacity = getOpacity(lossColor, 0.2);

    // 1. Draw base reward zone (entry to take profit, below entry) - Green background
    const rewardTop = Math.min(entry.y, takeProfit.y);
    const rewardHeight = Math.abs(takeProfit.y - entry.y);
    ctx.fillStyle = hexToRgba(profitColor, profitOpacity);
    ctx.fillRect(left * pixelRatio, rewardTop * pixelRatio, width * pixelRatio, rewardHeight * pixelRatio);

    // 2. Draw base risk zone (entry to stop loss, above entry) - Red background
    const riskTop = Math.min(entry.y, stopLoss.y);
    const riskHeight = Math.abs(stopLoss.y - entry.y);
    ctx.fillStyle = hexToRgba(lossColor, lossOpacity);
    ctx.fillRect(left * pixelRatio, riskTop * pixelRatio, width * pixelRatio, riskHeight * pixelRatio);

    // Draw trade direction arrow (DOWN for Short)
    const arrowTipY = Math.min(takeProfit.y - 4, entry.y + 12);
    const arrowStartY = Math.max(stopLoss.y + 4, entry.y - 10);
    if (arrowTipY - arrowStartY >= 8) {
      ctx.save();
      ctx.setLineDash([3 * pixelRatio, 3 * pixelRatio]); // Dashed stem
      ctx.fillStyle = hexToRgba(lossColor, 0.4);
      ctx.strokeStyle = hexToRgba(lossColor, 0.4);
      ctx.lineWidth = 2 * pixelRatio;
      ctx.beginPath();
      // Stem
      ctx.moveTo((left + 10) * pixelRatio, arrowStartY * pixelRatio);
      ctx.lineTo((left + 10) * pixelRatio, (arrowTipY - 4) * pixelRatio);
      ctx.stroke();
      // Arrowhead
      ctx.beginPath();
      ctx.moveTo((left + 10) * pixelRatio, arrowTipY * pixelRatio);
      ctx.lineTo((left + 5) * pixelRatio, (arrowTipY - 6) * pixelRatio);
      ctx.lineTo((left + 15) * pixelRatio, (arrowTipY - 6) * pixelRatio);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 3. Draw active progress overlay (only from entryCandleX to currentPriceX, when entry is touched)
    if (entryTouchIndex !== -1) {
      const activeLeft = Math.max(left, entryCandleX);
      const activeRight = Math.min(right, Math.max(activeLeft + 6, currentPriceX));
      const activeWidth = activeRight - activeLeft;

      if (activeWidth > 0) {
        // Draw active reward zone overlay (Green)
        if (clampedPriceY > entry.y) {
          const activeBottom = Math.min(takeProfit.y, clampedPriceY);
          const activeHeight = activeBottom - entry.y;
          if (activeHeight > 0) {
            ctx.fillStyle = hexToRgba(profitColor, Math.min(0.35, profitOpacity * 1.4)); // Subtler additive green overlay
            ctx.fillRect(activeLeft * pixelRatio, entry.y * pixelRatio, activeWidth * pixelRatio, activeHeight * pixelRatio);
          }
        }

        // Draw active risk zone overlay (Red)
        if (clampedPriceY < entry.y) {
          const activeTop = Math.max(stopLoss.y, clampedPriceY);
          const activeHeight = entry.y - activeTop;
          if (activeHeight > 0) {
            ctx.fillStyle = hexToRgba(lossColor, Math.min(0.35, lossOpacity * 1.4)); // Subtler additive red overlay
            ctx.fillRect(activeLeft * pixelRatio, activeTop * pixelRatio, activeWidth * pixelRatio, activeHeight * pixelRatio);
          }
        }
      }
    }

    // Draw boundary lines with user styling (only show the middle line, outer box border removed)
    const linesColor = options.linesColor ?? 'rgba(255, 255, 255, 0.4)';
    ctx.save();
    ctx.strokeStyle = linesColor;
    ctx.lineWidth = 0.5 * pixelRatio;
    drawLine(ctx, { x: left, y: entry.y }, { x: right, y: entry.y }, pixelRatio);
    ctx.restore();

    const state = this._drawing.state;
    const alwaysShowStats = options.alwaysShowStats ?? false;
    const showPills = alwaysShowStats || state === 'selected' || state === 'editing' || state === 'hovered';

    if (showPills) {
      const boxWidth = Math.abs(right - left);
      const isCompact = options.compactStats === true;

      // Draw rounded pill helper
      function drawRoundedPill(
        x: number,
        y: number,
        textLines: string[],
        bgColor: string,
        borderColor: string | null
      ) {
        const defaultFontSize = isCompact ? 9.5 : 11;
        const fontSize = options.textSize ?? defaultFontSize;
        ctx.font = `600 ${fontSize * pixelRatio}px 'Rubik', sans-serif`;
        
        let maxLineWidth = 0;
        for (const line of textLines) {
          maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width);
        }
        
        const paddingX = (isCompact ? 6 : 10) * pixelRatio;
        const paddingY = (isCompact ? 3.5 : 5.5) * pixelRatio;
        const lineHeight = (isCompact ? 11 : 14) * pixelRatio;
        
        const rectWidth = maxLineWidth + paddingX * 2;
        const rectHeight = textLines.length * lineHeight + paddingY * 2;
        
        const rx = x - rectWidth / 2;
        const ry = y - rectHeight / 2;
        
        ctx.fillStyle = bgColor;
        const radius = 5 * pixelRatio;
        ctx.beginPath();
        ctx.moveTo(rx + radius, ry);
        ctx.lineTo(rx + rectWidth - radius, ry);
        ctx.quadraticCurveTo(rx + rectWidth, ry, rx + rectWidth, ry + radius);
        ctx.lineTo(rx + rectWidth, ry + rectHeight - radius);
        ctx.quadraticCurveTo(rx + rectWidth, ry + rectHeight, rx + rectWidth - radius, ry + rectHeight);
        ctx.lineTo(rx + radius, ry + rectHeight);
        ctx.quadraticCurveTo(rx, ry + rectHeight, rx, ry + rectHeight - radius);
        ctx.lineTo(rx, ry + radius);
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
        ctx.closePath();
        ctx.fill();
        
        if (borderColor) {
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1 * pixelRatio;
          ctx.stroke();
        }
        
        ctx.fillStyle = options.textColor ?? '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        textLines.forEach((line, idx) => {
          const lineY = ry + paddingY + idx * lineHeight + lineHeight / 2;
          ctx.fillText(line, x, lineY);
        });
      }

      const midX = (left + right) / 2;

      // Stop Loss Pill
      const stopPercentStr = info.riskPercent.toFixed(3);
      const stopTicks = getTicks(Math.abs(info.stopLoss - info.entry), info.entry);
      
      let stopParts: string[] = [];
      if (options.showSlPriceOffset !== false) {
        const valStr = formatYAxisPrice(Math.abs(info.stopLoss - info.entry));
        stopParts.push(isCompact ? valStr : `Stop: ${valStr}`);
      }
      if (options.showSlPercentOffset !== false) {
        stopParts.push(`(${stopPercentStr}%)`);
      }
      if (options.showSlTickOffset !== false) {
        stopParts.push(stopTicks.toLocaleString('en-US'));
      }
      
      let stopText = stopParts.join(' ');
      if (options.showSlAmount !== false) {
        if (stopText) stopText += `, ${isCompact ? '' : 'Amount: '}${stopAmountStr}`;
        else stopText = `${isCompact ? '' : 'Amount: '}${stopAmountStr}`;
      }
      if (options.showSlPL !== false) {
        const stopPnLValStr = stopPnLValInAccount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (stopText) stopText += `, ${isCompact ? '-' : 'PnL: -'}${stopPnLValStr}`;
        else stopText = `PnL: -${stopPnLValStr}`;
      }

      const shouldDrawStop = (options.showSlPriceOffset !== false || options.showSlPercentOffset !== false || options.showSlTickOffset !== false || options.showSlAmount !== false || options.showSlPL !== false);
      if (shouldDrawStop && stopText) {
        const defaultLossColor = '#ef5350';
        drawRoundedPill(midX, stopLoss.y - (isCompact ? 18 : 22), [stopText], defaultLossColor, null);
      }

      // Take Profit Pill
      const targetPercentStr = info.rewardPercent.toFixed(3);
      const targetTicks = getTicks(Math.abs(info.entry - info.takeProfit), info.entry);
      
      let targetParts: string[] = [];
      if (options.showTpPriceOffset !== false) {
        const valStr = formatYAxisPrice(Math.abs(info.entry - info.takeProfit));
        targetParts.push(isCompact ? valStr : `Target: ${valStr}`);
      }
      if (options.showTpPercentOffset !== false) {
        targetParts.push(`(${targetPercentStr}%)`);
      }
      if (options.showTpTickOffset !== false) {
        targetParts.push(targetTicks.toLocaleString('en-US'));
      }

      let targetText = targetParts.join(' ');
      if (options.showTpAmount !== false) {
        if (targetText) targetText += `, ${isCompact ? '' : 'Amount: '}${targetAmountStr}`;
        else targetText = `${isCompact ? '' : 'Amount: '}${targetAmountStr}`;
      }
      if (options.showTpPL !== false) {
        const targetPnLValStr = targetPnLValInAccount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (targetText) targetText += `, ${isCompact ? '' : 'PnL: '}${targetPnLValStr}`;
        else targetText = `PnL: ${targetPnLValStr}`;
      }

      const shouldDrawTarget = (options.showTpPriceOffset !== false || options.showTpPercentOffset !== false || options.showTpTickOffset !== false || options.showTpAmount !== false || options.showTpPL !== false);
      if (shouldDrawTarget && targetText) {
        const defaultProfitColor = '#26a69a';
        drawRoundedPill(midX, takeProfit.y + (isCompact ? 18 : 22), [targetText], defaultProfitColor, null);
      }

      // Middle Pill
      const middleLines: string[] = [];
      let pnlParts: string[] = [];
      if (options.showOpenClosedPL !== false) {
        const isClosed = exitIndex !== -1;
        pnlParts.push(isCompact ? openPnlStr : `${isClosed ? 'Closed' : 'Open'} PnL: ${openPnlStr}`);
      }
      if (options.showQty !== false) {
        pnlParts.push(isCompact ? qtyStr : `Qty: ${qtyStr}`);
      }
      if (pnlParts.length > 0) {
        middleLines.push(pnlParts.join(', '));
      }
      if (options.showRiskReward !== false) {
        middleLines.push(isCompact ? info.riskRewardRatio.toFixed(2) : `Risk/reward ratio: ${info.riskRewardRatio.toFixed(2)}`);
      }

      const defaultProfitColor = '#26a69a';
      const defaultLossColor = '#ef5350';
      const middleBg = pnlDiff >= 0 ? defaultProfitColor : defaultLossColor;
      const upperBoundaryY = Math.min(takeProfit.y, stopLoss.y);
      const lowerBoundaryY = Math.max(takeProfit.y, stopLoss.y);
      const spaceAbove = entry.y - upperBoundaryY;
      const spaceBelow = lowerBoundaryY - entry.y;

      let middleY = entry.y - (isCompact ? 22 : 30);
      if (spaceAbove < 40 && spaceBelow > spaceAbove) {
        middleY = entry.y + (isCompact ? 22 : 30);
      }
      
      if (middleLines.length > 0) {
        drawRoundedPill(midX, middleY, middleLines, middleBg, '#ffffff');
      }
    }



    // Arrow indication: starts at first candle touching entry level and tracks the current price
    if (entryTouchIndex !== -1) {
      const guideStartX = Math.max(left, entryCandleX);
      const guideStartY = entry.y;
      let guideEndX = Math.min(right, currentPriceX);
      let guideEndY = clampedPriceY;

      if (guideEndX <= guideStartX + 4) {
        guideEndX = Math.min(right, guideStartX + 12);
      }

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.2 * pixelRatio;
      ctx.setLineDash([4 * pixelRatio, 3 * pixelRatio]);
      ctx.beginPath();
      ctx.moveTo(guideStartX * pixelRatio, guideStartY * pixelRatio);
      ctx.lineTo(guideEndX * pixelRatio, guideEndY * pixelRatio);
      ctx.stroke();

      // Draw V-shaped arrowhead at the end of the dashed line pointing in the direction of price movement
      const dx = (guideEndX - guideStartX) * pixelRatio;
      const dy = (guideEndY - guideStartY) * pixelRatio;
      if (dx !== 0 || dy !== 0) {
        const angle = Math.atan2(dy, dx);
        const arrowLength = 8 * pixelRatio;
        const arrowWidth = 5 * pixelRatio;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5 * pixelRatio;
        ctx.beginPath();
        // Left wing of V
        ctx.moveTo(
          (guideEndX * pixelRatio) - arrowLength * Math.cos(angle) + arrowWidth * Math.sin(angle),
          (guideEndY * pixelRatio) - arrowLength * Math.sin(angle) - arrowWidth * Math.cos(angle)
        );
        ctx.lineTo(guideEndX * pixelRatio, guideEndY * pixelRatio);
        // Right wing of V
        ctx.lineTo(
          (guideEndX * pixelRatio) - arrowLength * Math.cos(angle) - arrowWidth * Math.sin(angle),
          (guideEndY * pixelRatio) - arrowLength * Math.sin(angle) + arrowWidth * Math.cos(angle)
        );
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }

    // Draw TradingView-style custom rounded-square blue control points
    if (showPills) {
      const drawCircleAnchor = (x: number, y: number) => {
        const radius = 5 * pixelRatio;
        const ringWidth = 1.5 * pixelRatio;
        ctx.beginPath();
        ctx.arc(x * pixelRatio, y * pixelRatio, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#131722';
        ctx.fill();
        ctx.strokeStyle = '#2962FF';
        ctx.lineWidth = ringWidth;
        ctx.stroke();
      };

      const drawSquareAnchor = (x: number, y: number) => {
        const size = 10 * pixelRatio;
        const radius = 2 * pixelRatio;
        const ringWidth = 1.5 * pixelRatio;
        const rx = (x * pixelRatio) - size / 2;
        const ry = (y * pixelRatio) - size / 2;
        
        ctx.beginPath();
        ctx.moveTo(rx + radius, ry);
        ctx.lineTo(rx + size - radius, ry);
        ctx.quadraticCurveTo(rx + size, ry, rx + size, ry + radius);
        ctx.lineTo(rx + size, ry + size - radius);
        ctx.quadraticCurveTo(rx + size, ry + size, rx + size - radius, ry + size);
        ctx.lineTo(rx + radius, ry + size);
        ctx.quadraticCurveTo(rx, ry + size, rx, ry + size - radius);
        ctx.lineTo(rx, ry + radius);
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
        ctx.closePath();
        
        ctx.fillStyle = '#131722';
        ctx.fill();
        ctx.strokeStyle = '#2962FF';
        ctx.lineWidth = ringWidth;
        ctx.stroke();
      };

      const activeDrag = getGlobalActiveDragAnchor();
      const activeAnchorIdx = activeDrag.index !== null && (!activeDrag.overlayId || activeDrag.overlayId === this._drawing.id)
        ? activeDrag.index
        : ((this._drawing as any)?._activeDragAnchorIndex ?? null);

      if (activeAnchorIdx !== 0) drawCircleAnchor(left, entry.y);
      if (activeAnchorIdx !== 1) drawSquareAnchor(left, stopLoss.y);
      if (activeAnchorIdx !== 2) drawSquareAnchor(left, takeProfit.y);
      if (activeAnchorIdx !== 3) drawSquareAnchor(right, entry.y);
    }

    // Restore canvas state to prevent leaking our styles to subsequent overlays
    ctx.restore();
  }
}
