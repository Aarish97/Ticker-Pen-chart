import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { type Geometry, type LineGeometry, distanceToLineSegment } from '../../core/geometry';
import { RegressionTrendPaneView } from './regression-trend-pane-view';

/**
 * RegressionTrend options
 */
export interface RegressionTrendOptions extends DrawingOptions {
  filled?: boolean;
  showMiddleLine?: boolean;
  extendLines?: boolean;
  standardDeviations?: number; // Number of standard deviations for channel width
  upperDeviation?: number;
  lowerDeviation?: number;
  useUpperDeviation?: boolean;
  useLowerDeviation?: boolean;
  showPearsonR?: boolean;
  upFillColor?: string;
  upperFillColor?: string;
  downFillColor?: string;
  lowerFillColor?: string;
  regressionValues?: number[];
}

/**
 * RegressionTrend - Linear regression channel with standard deviation bands.
 *
 * Features:
 * - Two anchor points define the regression range
 * - Linear regression calculates the best-fit line
 * - Channel width based on standard deviation
 * - Optional fill between lines
 * - Optional line extensions
 */
export class RegressionTrend extends Drawing {
  readonly type = 'regression-trend';

  protected static readonly REQUIRED_ANCHORS = 2;
  protected static readonly HIT_THRESHOLD = 5;

  private _channelOptions: RegressionTrendOptions;
  private _regressionValues: number[];
  private _priceToPixel: ((price: number) => number | null) | null = null;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<RegressionTrendOptions> = {}
  ) {
    const { filled, showMiddleLine, extendLines, standardDeviations, upperDeviation, lowerDeviation, useUpperDeviation, useLowerDeviation, showPearsonR, upFillColor, upperFillColor, downFillColor, lowerFillColor, regressionValues, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._channelOptions = {
      ...this._options,
      filled: filled ?? true,
      showMiddleLine: showMiddleLine ?? true,
      // Keep the channel bounded by its selected anchors. It can still be
      // extended explicitly through the option, but placement must not
      // project lines across the whole chart.
      extendLines: extendLines ?? false,
      standardDeviations: standardDeviations ?? 2,
      upperDeviation: upperDeviation ?? standardDeviations ?? 2,
      lowerDeviation: lowerDeviation ?? standardDeviations ?? 2,
      useUpperDeviation: useUpperDeviation ?? true,
      useLowerDeviation: useLowerDeviation ?? true,
      showPearsonR: showPearsonR ?? false,
      upFillColor: upFillColor ?? upperFillColor ?? 'rgba(0, 150, 136, 0.18)',
      downFillColor: downFillColor ?? lowerFillColor ?? 'rgba(239, 83, 80, 0.16)',
    };
    this._regressionValues = regressionValues ?? [];
  }

  get channelOptions(): RegressionTrendOptions {
    return this._channelOptions;
  }

  setChannelOptions(options: Partial<RegressionTrendOptions>): void {
    this._channelOptions = { ...this._channelOptions, ...options };
    this.requestUpdate();
  }

  setRegressionValues(values: number[]): void {
    this._regressionValues = values.filter(Number.isFinite);
  }

  setRegressionContext(values: number[], priceToPixel: (price: number) => number | null): void {
    this._regressionValues = values.filter(Number.isFinite);
    this._priceToPixel = priceToPixel;
  }

  isValid(): boolean {
    return this._anchors.length >= RegressionTrend.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new RegressionTrendPaneView(this)];
  }

  /**
   * Calculate linear regression in price units directly from historical candle values.
   */
  calculatePriceRegression(): {
    slope: number;
    intercept: number;
    startPrice: number;
    endPrice: number;
    stdDev: number;
  } | null {
    if (this._regressionValues.length < 2) return null;
    const values = this._regressionValues;
    const count = values.length;
    const meanX = (count - 1) / 2;
    const meanY = values.reduce((sum, value) => sum + value, 0) / count;
    let num = 0;
    let den = 0;
    for (let i = 0; i < count; i++) {
      const dx = i - meanX;
      const dy = values[i] - meanY;
      num += dx * dy;
      den += dx * dx;
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = meanY - slope * meanX;
    const startPrice = intercept;
    const endPrice = slope * (count - 1) + intercept;
    let sumSqRes = 0;
    for (let i = 0; i < count; i++) {
      const fitted = slope * i + intercept;
      const res = values[i] - fitted;
      sumSqRes += res * res;
    }
    const stdDev = Math.sqrt(sumSqRes / count);
    return { slope, intercept, startPrice, endPrice, stdDev: Math.max(0.0001, stdDev) };
  }

  /**
   * Calculate linear regression parameters in pixel space
   */
  calculateRegression(p1: Point, p2: Point): { slope: number; intercept: number; stdDev: number } {
    const priceReg = this.calculatePriceRegression();
    if (priceReg && this._priceToPixel) {
      const y1 = this._priceToPixel(priceReg.startPrice);
      const y2 = this._priceToPixel(priceReg.endPrice);
      if (y1 !== null && y2 !== null && Number.isFinite(y1) && Number.isFinite(y2)) {
        const dx = p2.x - p1.x;
        const dy = y2 - y1;
        const slope = Math.abs(dx) > 1e-4 ? dy / dx : 0;
        const intercept = y1 - slope * p1.x;
        const yPlusStd = this._priceToPixel(priceReg.startPrice + priceReg.stdDev);
        const stdDevPixels = (yPlusStd !== null && Number.isFinite(yPlusStd))
          ? Math.abs(y1 - yPlusStd)
          : Math.max(6, Math.abs(y2 - y1) * 0.1);
        return { slope, intercept, stdDev: Math.max(6, stdDevPixels) };
      }
    }

    if (this._regressionValues.length >= 2) {
      const values = this._regressionValues;
      const count = values.length;
      const dx = p2.x - p1.x;
      const anchorPriceDelta = Number(this._anchors[1]?.price ?? 0) - Number(this._anchors[0]?.price ?? 0);
      const approximateScale = Math.abs(anchorPriceDelta) > 1e-9 ? (p2.y - p1.y) / anchorPriceDelta : 0;
      const ys = values.map((value) => {
        const converted = this._priceToPixel?.(value);
        return converted === null || converted === undefined
          ? p1.y + (value - Number(this._anchors[0]?.price ?? 0)) * approximateScale
          : converted;
      });
      const meanX = (p1.x + p2.x) / 2;
      const meanY = ys.reduce((sum, value) => sum + value, 0) / count;
      const denominator = values.reduce((sum, _value, index) => {
        const x = p1.x + dx * index / (count - 1);
        return sum + (x - meanX) ** 2;
      }, 0);
      const slope = denominator === 0 ? 0 : ys.reduce((sum, value, index) => {
        const x = p1.x + dx * index / (count - 1);
        return sum + (x - meanX) * (value - meanY);
      }, 0) / denominator;
      const intercept = meanY - slope * meanX;
      const residuals = ys.map((value, index) => {
        const x = p1.x + dx * index / (count - 1);
        return value - (slope * x + intercept);
      });
      const stdDev = Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / count);
      return { slope, intercept, stdDev: Math.max(6, stdDev) };
    }

    // Simple two-point linear regression
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    if (Math.abs(dx) < 0.001) {
      return { slope: 0, intercept: p1.y, stdDev: 20 }; // Default stdDev for vertical lines
    }

    const slope = dy / dx;
    const intercept = p1.y - slope * p1.x;

    // For a two-point line, we simulate a standard deviation based on the line length
    const lineLength = Math.sqrt(dx * dx + dy * dy);
    const stdDev = Math.max(10, lineLength * 0.1); // 10% of line length or minimum 10px

    return { slope, intercept, stdDev };
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);

    if (!p1 || !p2) return [];

    const geometries: Geometry[] = [];
    const { slope, stdDev } = this.calculateRegression(p1, p2);
    const baseP1 = { x: p1.x, y: slope * p1.x + (this.calculateRegression(p1, p2).intercept) };
    const baseP2 = { x: p2.x, y: slope * p2.x + (this.calculateRegression(p1, p2).intercept) };
    const upperOffset = stdDev * (this._channelOptions.upperDeviation ?? this._channelOptions.standardDeviations ?? 2);
    const lowerOffset = stdDev * (this._channelOptions.lowerDeviation ?? this._channelOptions.standardDeviations ?? 2);

    // Calculate perpendicular offset
    // Deviation is measured in price-space, so the bands shift vertically
    // on the chart while preserving the regression bar range.
    const upperOffsetX = 0;
    const upperOffsetY = -upperOffset;
    const lowerOffsetX = 0;
    const lowerOffsetY = lowerOffset;

    // Middle (regression) line
    geometries.push({
      type: 'line',
      start: baseP1,
      end: baseP2,
      extendLeft: this._channelOptions.extendLines,
      extendRight: this._channelOptions.extendLines,
    } as LineGeometry);

    // Upper band
    if (this._channelOptions.useUpperDeviation !== false) {
      geometries.push({
        type: 'line',
        start: { x: baseP1.x + upperOffsetX, y: baseP1.y + upperOffsetY },
        end: { x: baseP2.x + upperOffsetX, y: baseP2.y + upperOffsetY },
        extendLeft: this._channelOptions.extendLines,
        extendRight: this._channelOptions.extendLines,
      } as LineGeometry);
    }

    // Lower band
    const p1Lower = { x: baseP1.x - lowerOffsetX, y: baseP1.y - lowerOffsetY };
    const p2Lower = { x: baseP2.x - lowerOffsetX, y: baseP2.y - lowerOffsetY };
    if (this._channelOptions.useLowerDeviation !== false) {
      geometries.push({
        type: 'line',
        start: p1Lower,
        end: p2Lower,
        extendLeft: this._channelOptions.extendLines,
        extendRight: this._channelOptions.extendLines,
      } as LineGeometry);
    }

    return geometries;
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);

    if (!p1 || !p2) return false;

    // Check anchor points directly
    if (Math.hypot(point.x - p1.x, point.y - p1.y) <= 10) return true;
    if (Math.hypot(point.x - p2.x, point.y - p2.y) <= 10) return true;

    // Check middle line
    if (distanceToLineSegment(point, p1, p2) <= RegressionTrend.HIT_THRESHOLD) return true;

    const { stdDev } = this.calculateRegression(p1, p2);
    const upperOffset = stdDev * (this._channelOptions.upperDeviation ?? this._channelOptions.standardDeviations ?? 2);
    const lowerOffset = stdDev * (this._channelOptions.lowerDeviation ?? this._channelOptions.standardDeviations ?? 2);

    const upperOffsetX = 0;
    const upperOffsetY = -upperOffset;
    const lowerOffsetX = 0;
    const lowerOffsetY = lowerOffset;

    // Check upper band
    const p1Upper = { x: p1.x + upperOffsetX, y: p1.y + upperOffsetY };
    const p2Upper = { x: p2.x + upperOffsetX, y: p2.y + upperOffsetY };
    if (this._channelOptions.useUpperDeviation !== false && distanceToLineSegment(point, p1Upper, p2Upper) <= RegressionTrend.HIT_THRESHOLD) return true;

    // Check lower band
    const p1Lower = { x: p1.x - lowerOffsetX, y: p1.y - lowerOffsetY };
    const p2Lower = { x: p2.x - lowerOffsetX, y: p2.y - lowerOffsetY };
    if (this._channelOptions.useLowerDeviation !== false && distanceToLineSegment(point, p1Lower, p2Lower) <= RegressionTrend.HIT_THRESHOLD) return true;

    return false;
  }

  clone(newId: string): IDrawing {
    return new RegressionTrend(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._channelOptions }
    );
  }

  static create(
    id: string,
    start: Anchor,
    end: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<RegressionTrendOptions>
  ): RegressionTrend {
    return new RegressionTrend(id, [start, end], style, options);
  }
}
