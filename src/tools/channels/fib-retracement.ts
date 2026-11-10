import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import type { Geometry, LineGeometry } from '../../core/geometry';
import { FibRetracementPaneView } from './fib-retracement-pane-view';

/**
 * Standard Fibonacci ratios
 */
export const FIBONACCI_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618];

export interface FibLevelItem {
  value: number;
  color: string;
  enabled: boolean;
}

export const DEFAULT_FIB_RETRACEMENT_LEVELS: FibLevelItem[] = [
  { value: 0, color: '#787B86', enabled: true },
  { value: 0.236, color: '#F7525F', enabled: true },
  { value: 0.382, color: '#FF9800', enabled: true },
  { value: 0.5, color: '#4CAF50', enabled: true },
  { value: 0.618, color: '#00897B', enabled: true },
  { value: 0.786, color: '#00BCD4', enabled: true },
  { value: 1, color: '#787B86', enabled: true },
  { value: 1.618, color: '#2962FF', enabled: true },
  { value: 2.618, color: '#F7525F', enabled: true },
  { value: 3.618, color: '#9C27B0', enabled: true },
  { value: 1.272, color: '#FF9800', enabled: true },
  { value: 4.236, color: '#880E4F', enabled: false },
  { value: 1.414, color: '#B71C1C', enabled: false },
  { value: 2.272, color: '#A04000', enabled: false },
  { value: 2.414, color: '#2E7D32', enabled: false },
  { value: 2, color: '#00695C', enabled: false },
  { value: 3, color: '#00838F', enabled: false },
  { value: 3.272, color: '#424242', enabled: false },
  { value: 3.414, color: '#1565C0', enabled: false },
  { value: 4, color: '#C62828', enabled: false },
  { value: 4.272, color: '#6A1B9A', enabled: false },
  { value: 4.414, color: '#AD1457', enabled: false },
  { value: 4.618, color: '#D35400', enabled: false },
  { value: 4.764, color: '#004D40', enabled: false }
];

/**
 * FibRetracement options
 */
export interface FibRetracementOptions extends DrawingOptions {
  levels?: (number | FibLevelItem)[];
  showTrendline?: boolean;
  trendlineColor?: string;
  trendlineStyle?: 'solid' | 'dashed' | 'dotted';
  trendlineWidth?: number;
  levelLineWidth?: number;
  levelLineStyle?: 'solid' | 'dashed' | 'dotted';
  extendMode?: 'none' | 'left' | 'right' | 'both';
  extendLines?: boolean;
  reverseDirection?: boolean;
  showPrices?: boolean;
  showPercentages?: boolean;
  levelsFormat?: 'values' | 'percentages';
  labelsAlign?: 'left' | 'center' | 'right';
  labelsVerticalAlign?: 'top' | 'middle' | 'bottom';
  fontSize?: number;
  filled?: boolean;
  fillColor?: string;
  backgroundOpacity?: number;
  lineColor?: string;
  useOneColor?: boolean;
  oneColor?: string;
}

/**
 * FibRetracement - Fibonacci retracement levels between two price points.
 *
 * Features:
 * - Two anchor points (high and low)
 * - Multiple Fibonacci level lines
 * - Optional price and percentage labels
 * - Optional line extensions
 * - Customizable levels
 */
export class FibRetracement extends Drawing {
  readonly type = 'fib-retracement';

  protected static readonly REQUIRED_ANCHORS = 3;
  protected static readonly HIT_THRESHOLD = 5;

  private _fibOptions: FibRetracementOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<FibRetracementOptions> = {}
  ) {
    const {
      levels,
      showTrendline,
      trendlineColor,
      trendlineStyle,
      trendlineWidth,
      levelLineWidth,
      levelLineStyle,
      extendMode,
      extendLines,
      reverseDirection,
      showPrices,
      showPercentages,
      levelsFormat,
      labelsAlign,
      labelsVerticalAlign,
      fontSize,
      filled,
      fillColor,
      backgroundOpacity,
      lineColor,
      useOneColor,
      oneColor,
      ...baseOptions
    } = options;
    super(id, anchors, style, baseOptions);

    const lineWidth = (options as any)?.lineWidth ?? (options as any)?.levelLineWidth ?? (style as any)?.lineWidth ?? (style as any)?.size ?? 1;
    this._style.lineWidth = lineWidth;

    this._fibOptions = {
      ...this._options,
      levels: levels ?? DEFAULT_FIB_RETRACEMENT_LEVELS,
      showTrendline: showTrendline ?? true,
      trendlineColor: trendlineColor ?? '#787B86',
      trendlineStyle: trendlineStyle ?? 'dashed',
      trendlineWidth: trendlineWidth ?? (options as any)?.lineWidth ?? lineWidth,
      levelLineWidth: levelLineWidth ?? (options as any)?.lineWidth ?? lineWidth,
      levelLineStyle: levelLineStyle ?? 'solid',
      extendMode: extendMode ?? (extendLines ? 'both' : 'none'),
      extendLines: extendLines ?? false,
      reverseDirection: reverseDirection ?? false,
      showPrices: showPrices ?? true,
      showPercentages: showPercentages ?? true,
      levelsFormat: levelsFormat ?? 'values',
      labelsAlign: labelsAlign ?? 'right',
      labelsVerticalAlign: labelsVerticalAlign ?? 'middle',
      fontSize: fontSize ?? 12,
      filled: filled ?? true,
      fillColor: fillColor ?? style.fillColor,
      backgroundOpacity: backgroundOpacity ?? 0.15,
      lineColor: lineColor ?? style.lineColor,
      useOneColor: useOneColor ?? false,
      oneColor: oneColor ?? '#2962ff'
    };

    this._syncLastAnchorPrice(this._anchors);
  }

  private _syncLastAnchorPrice(anchors: Anchor[]): void {
    if (anchors.length >= 3) {
      if (anchors[1] && anchors[2]) {
        const a1 = anchors[1] as any;
        const a2 = anchors[2] as any;
        if (a2.timestamp !== undefined && a1.timestamp !== undefined) {
          if (a2.timestamp < a1.timestamp + 1) {
            a2.timestamp = a1.timestamp + 1;
          }
        }
        if (a2.index !== undefined && a1.index !== undefined) {
          if (a2.index < a1.index + 1) {
            a2.index = a1.index + 1;
          }
        }
        if (typeof a2.time === 'number' && typeof a1.time === 'number') {
          if (a2.time < a1.time + 1) {
            a2.time = a1.time + 1;
          }
        }
      }

      const price1 = anchors[0].price;
      const price2 = anchors[1].price;
      const priceRange = price2 - price1;
      const levels = this._fibOptions?.levels ?? FIBONACCI_LEVELS;
      const firstLvl: any = levels[0] ?? 0;
      const level0 = typeof firstLvl === 'number' ? firstLvl : (firstLvl.value ?? 0);
      anchors[2].price = this._fibOptions?.reverseDirection
        ? price2 - priceRange * level0
        : price1 + priceRange * level0;
    }
  }

  override setAnchors(anchors: Anchor[]): void {
    this._syncLastAnchorPrice(anchors);
    super.setAnchors(anchors);
  }

  override updateAnchor(index: number, anchor: Anchor): void {
    super.updateAnchor(index, anchor);
    this._syncLastAnchorPrice(this._anchors);
  }

  get fibOptions(): FibRetracementOptions {
    return this._fibOptions;
  }

  setFibOptions(options: Partial<FibRetracementOptions>): void {
    this._fibOptions = { ...this._fibOptions, ...options };
    this._syncLastAnchorPrice(this._anchors);
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= FibRetracement.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new FibRetracementPaneView(this)];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);
    const p3 = this.anchorToPixel(this._anchors[2], viewport);

    if (!p1 || !p2 || !p3) return [];

    const geometries: Geometry[] = [];
    const levels = this._fibOptions.levels ?? FIBONACCI_LEVELS;
    const price1 = this._anchors[0].price;
    const price2 = this._anchors[1].price;
    const priceRange = price2 - price1;

    const extendMode = this._fibOptions.extendMode ?? (this._fibOptions.extendLines ? 'both' : 'none');
    let startX = p1.x;
    let endX = p3.x;
    if (extendMode === 'left' || extendMode === 'both') startX = 0;
    if (extendMode === 'right' || extendMode === 'both') endX = viewport.width;

    for (const level of levels) {
      const levelVal = typeof level === 'number' ? level : (level.value ?? 0);
      const price = this._fibOptions.reverseDirection
        ? price2 - priceRange * levelVal
        : price1 + priceRange * levelVal;

      const y = viewport.priceScale.priceToCoordinate(price);
      if (y === null) continue;

      geometries.push({
        type: 'line',
        start: { x: startX, y },
        end: { x: endX, y },
      } as LineGeometry);
    }

    return geometries;
  }

  /**
   * Calculate price at a specific Fibonacci level
   */
  getPriceAtLevel(level: number): number {
    if (!this.isValid()) return 0;

    const price1 = this._anchors[0].price;
    const price2 = this._anchors[1].price;
    const priceRange = price2 - price1;

    return this._fibOptions.reverseDirection
      ? price2 - priceRange * level
      : price1 + priceRange * level;
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);
    const p3 = this._anchors[2] ? this.anchorToPixel(this._anchors[2], viewport) : null;

    if (!p1 || !p2) return false;

    const extendMode = this._fibOptions.extendMode ?? (this._fibOptions.extendLines ? 'both' : 'none');
    let minX = Math.min(p1.x, p2.x, p3 ? p3.x : p1.x);
    let maxX = Math.max(p1.x, p2.x, p3 ? p3.x : p2.x);

    if (extendMode === 'left' || extendMode === 'both' || this._fibOptions.extendLines) minX = 0;
    if (extendMode === 'right' || extendMode === 'both' || this._fibOptions.extendLines) maxX = viewport.width;

    const threshold = 8;

    // 1. Check if near main trend line connecting p1 and p2
    if (this._fibOptions.showTrendline ?? true) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq > 0) {
        let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;
        if (Math.hypot(point.x - projX, point.y - projY) <= threshold) {
          return true;
        }
      }
    }

    // 2. Check if near any active level line (including between 2nd and 3rd anchors)
    const rawLevels = this._fibOptions.levels ?? FIBONACCI_LEVELS;
    const price1 = this._anchors[0].price;
    const price2 = this._anchors[1].price;
    const priceRange = price2 - price1;

    for (const level of rawLevels) {
      const isEnabled = typeof level === 'object' && level !== null ? (level as any).enabled !== false : true;
      if (!isEnabled) continue;
      const levelVal = typeof level === 'number' ? level : ((level as any).value ?? 0);
      const price = this._fibOptions.reverseDirection
        ? price2 - priceRange * levelVal
        : price1 + priceRange * levelVal;

      const y = viewport.priceScale.priceToCoordinate(price);
      if (y === null) continue;

      if (point.x >= minX - threshold && point.x <= maxX + threshold && Math.abs(point.y - y) <= threshold) {
        return true;
      }
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new FibRetracement(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._fibOptions }
    );
  }

  static create(
    id: string,
    start: Anchor,
    end: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<FibRetracementOptions>
  ): FibRetracement {
    return new FibRetracement(id, [start, end], style, options);
  }
}
