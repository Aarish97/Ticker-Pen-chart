import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import type { Geometry, LineGeometry } from '../../core/geometry';
import { FibExtensionPaneView } from './fib-extension-pane-view';

/**
 * Standard Fibonacci extension levels
 */
export const FIB_EXTENSION_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2, 2.618, 3.618, 4.236];

/**
 * FibExtension options
 */
export interface FibExtensionOptions extends DrawingOptions {
  levels?: (number | any)[];
  showTrendline?: boolean;
  trendlineColor?: string;
  trendlineStyle?: 'solid' | 'dashed' | 'dotted';
  trendlineWidth?: number;
  levelLineWidth?: number;
  levelLineStyle?: 'solid' | 'dashed' | 'dotted';
  extendMode?: 'none' | 'left' | 'right' | 'both';
  extendLines?: boolean;
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
 * FibExtension - Fibonacci extension levels based on three points.
 *
 * Features:
 * - Four anchor points (A, B, C define prices; D defines line length)
 * - Extension levels projected from point C
 * - Optional price and percentage labels
 */
export class FibExtension extends Drawing {
  readonly type = 'fib-extension';

  protected static readonly REQUIRED_ANCHORS = 4;
  protected static readonly HIT_THRESHOLD = 5;

  private _fibOptions: FibExtensionOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<FibExtensionOptions> = {}
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
      levels: levels ?? FIB_EXTENSION_LEVELS,
      showTrendline: showTrendline ?? true,
      trendlineColor: trendlineColor ?? '#787B86',
      trendlineStyle: trendlineStyle ?? 'dashed',
      trendlineWidth: trendlineWidth ?? (options as any)?.lineWidth ?? lineWidth,
      levelLineWidth: levelLineWidth ?? (options as any)?.lineWidth ?? lineWidth,
      levelLineStyle: levelLineStyle ?? 'solid',
      extendMode: extendMode ?? (extendLines ? 'both' : 'none'),
      extendLines: extendLines ?? false,
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
    if (anchors.length >= 4) {
      if (anchors[2] && anchors[3]) {
        const a2 = anchors[2] as any;
        const a3 = anchors[3] as any;
        if (a3.timestamp !== undefined && a2.timestamp !== undefined) {
          if (a3.timestamp < a2.timestamp + 1) {
            a3.timestamp = a2.timestamp + 1;
          }
        }
        if (a3.index !== undefined && a2.index !== undefined) {
          if (a3.index < a2.index + 1) {
            a3.index = a2.index + 1;
          }
        }
        if (typeof a3.time === 'number' && typeof a2.time === 'number') {
          if (a3.time < a2.time + 1) {
            a3.time = a2.time + 1;
          }
        }
      }

      const priceA = anchors[0].price;
      const priceB = anchors[1].price;
      const priceC = anchors[2].price;
      const range = priceB - priceA;
      const levels = this._fibOptions?.levels ?? FIB_EXTENSION_LEVELS;
      const level0 = levels[0] ?? 0;
      anchors[3].price = priceC + range * level0;
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

  get fibOptions(): FibExtensionOptions {
    return this._fibOptions;
  }

  setFibOptions(options: Partial<FibExtensionOptions>): void {
    this._fibOptions = { ...this._fibOptions, ...options };
    this._syncLastAnchorPrice(this._anchors);
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= FibExtension.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new FibExtensionPaneView(this)];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const pA = this.anchorToPixel(this._anchors[0], viewport);
    const pB = this.anchorToPixel(this._anchors[1], viewport);
    const pC = this.anchorToPixel(this._anchors[2], viewport);
    const pD = this.anchorToPixel(this._anchors[3], viewport);

    if (!pA || !pB || !pC || !pD) return [];

    const geometries: Geometry[] = [];
    const levels = this._fibOptions.levels ?? FIB_EXTENSION_LEVELS;

    // Price range from A to B
    const priceA = this._anchors[0].price;
    const priceB = this._anchors[1].price;
    const priceC = this._anchors[2].price;
    const range = priceB - priceA;

    for (const level of levels) {
      // Extension from C
      const price = priceC + range * level;
      const y = viewport.priceScale.priceToCoordinate(price);
      if (y === null) continue;

      const startX = this._fibOptions.extendLines ? 0 : pC.x;
      const endX = this._fibOptions.extendLines ? viewport.width : pD.x;

      geometries.push({
        type: 'line',
        start: { x: startX, y },
        end: { x: endX, y },
      } as LineGeometry);
    }

    return geometries;
  }

  /**
   * Get price at a specific extension level
   */
  getPriceAtLevel(level: number): number {
    if (!this.isValid()) return 0;

    const priceA = this._anchors[0].price;
    const priceB = this._anchors[1].price;
    const priceC = this._anchors[2].price;
    const range = priceB - priceA;

    return priceC + range * level;
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const pA = this.anchorToPixel(this._anchors[0], viewport);
    const pB = this.anchorToPixel(this._anchors[1], viewport);
    const pC = this.anchorToPixel(this._anchors[2], viewport);
    const pD = this._anchors[3] ? this.anchorToPixel(this._anchors[3], viewport) : null;

    if (!pA || !pB || !pC) return false;

    const threshold = 8;

    // 1. Check trendlines between anchors A->B and B->C
    const distToSeg = (p: Point, a: Point, b: Point) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };

    if (distToSeg(point, pA, pB) <= threshold || distToSeg(point, pB, pC) <= threshold) {
      return true;
    }

    // 2. Check level lines from C to D
    const extendMode = this._fibOptions.extendMode ?? (this._fibOptions.extendLines ? 'both' : 'none');
    let minX = pC.x;
    let maxX = pD ? pD.x : pC.x;
    if (extendMode === 'left' || extendMode === 'both' || this._fibOptions.extendLines) minX = 0;
    if (extendMode === 'right' || extendMode === 'both' || this._fibOptions.extendLines) maxX = viewport.width;

    const left = Math.min(minX, maxX);
    const right = Math.max(minX, maxX);

    const levels = this._fibOptions.levels ?? FIB_EXTENSION_LEVELS;
    const priceA = this._anchors[0].price;
    const priceB = this._anchors[1].price;
    const priceC = this._anchors[2].price;
    const range = priceB - priceA;

    for (const level of levels) {
      const isEnabled = typeof level === 'object' && level !== null ? (level as any).enabled !== false : true;
      if (!isEnabled) continue;
      const levelVal = typeof level === 'number' ? level : ((level as any).value ?? 0);
      const price = priceC + range * levelVal;
      const y = viewport.priceScale.priceToCoordinate(price);
      if (y === null) continue;

      if (point.x >= left - threshold && point.x <= right + threshold && Math.abs(point.y - y) <= threshold) {
        return true;
      }
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new FibExtension(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._fibOptions }
    );
  }

  static create(
    id: string,
    pointA: Anchor,
    pointB: Anchor,
    pointC: Anchor,
    end: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<FibExtensionOptions>
  ): FibExtension {
    return new FibExtension(id, [pointA, pointB, pointC, end], style, options);
  }
}
