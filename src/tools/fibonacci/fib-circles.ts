import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { type Geometry, type ArcGeometry, distanceBetweenPoints, distanceToLineSegment } from '../../core/geometry';
import { FibCirclesPaneView } from './fib-circles-pane-view';

/**
 * Level item definition for Fib Circles
 */
export interface FibCircleLevelItem {
  value: number;
  color: string;
  enabled?: boolean;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
}

/**
 * Default Fibonacci circle levels matching TradingView standards
 */
export const DEFAULT_FIB_CIRCLES_LEVELS: FibCircleLevelItem[] = [
  { value: 0.236, color: '#F23645', enabled: true },
  { value: 0.382, color: '#FF9800', enabled: true },
  { value: 0.5, color: '#00897B', enabled: true },
  { value: 0.618, color: '#4CAF50', enabled: true },
  { value: 0.786, color: '#00BCD4', enabled: true },
  { value: 1, color: '#787B86', enabled: true },
  { value: 1.618, color: '#2962FF', enabled: true },
  { value: 2.618, color: '#E91E63', enabled: true },
  { value: 3.618, color: '#2962FF', enabled: true },
  { value: 4.236, color: '#E91E63', enabled: true },
  { value: 4.618, color: '#F23645', enabled: true },
];

export const FIB_CIRCLE_LEVELS = DEFAULT_FIB_CIRCLES_LEVELS.map(l => l.value);

/**
 * FibCircles options
 */
export interface FibCirclesOptions extends DrawingOptions {
  levels?: (number | FibCircleLevelItem)[];
  showTrendline?: boolean;
  trendlineColor?: string;
  trendlineStyle?: 'solid' | 'dashed' | 'dotted';
  trendlineWidth?: number;
  useOneColor?: boolean;
  oneColor?: string;
  lineColor?: string;
  lineWidth?: number;
  filled?: boolean;
  backgroundOpacity?: number;
  showLabels?: boolean;
  coeffsAsPercents?: boolean;
}

/**
 * FibCircles - Concentric circles at Fibonacci ratios.
 */
export class FibCircles extends Drawing {
  readonly type = 'fib-circles';

  protected static readonly REQUIRED_ANCHORS = 2;
  protected static readonly HIT_THRESHOLD = 6;

  private _fibOptions: FibCirclesOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<FibCirclesOptions> = {}
  ) {
    const { levels, showLabels, filled, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    const lineWidth = options.lineWidth ?? (options as any)?.levelLineWidth ?? options.trendlineWidth ?? (style as any)?.lineWidth ?? (style as any)?.size ?? 1;
    this._style.lineWidth = lineWidth;

    this._fibOptions = {
      ...this._options,
      levels: levels ?? DEFAULT_FIB_CIRCLES_LEVELS,
      showTrendline: options.showTrendline ?? true,
      trendlineColor: options.trendlineColor ?? '#787B86',
      trendlineStyle: options.trendlineStyle ?? 'dashed',
      trendlineWidth: options.trendlineWidth ?? (options as any)?.lineWidth ?? lineWidth,
      lineWidth: options.lineWidth ?? (options as any)?.levelLineWidth ?? lineWidth,
      useOneColor: options.useOneColor ?? false,
      oneColor: options.oneColor ?? '#2962FF',
      showLabels: showLabels ?? true,
      coeffsAsPercents: options.coeffsAsPercents ?? false,
      filled: filled ?? true,
      backgroundOpacity: options.backgroundOpacity ?? 0.15,
    };
  }

  get fibOptions(): FibCirclesOptions {
    return this._fibOptions;
  }

  setFibOptions(options: Partial<FibCirclesOptions>): void {
    this._fibOptions = { ...this._fibOptions, ...options };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= FibCircles.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new FibCirclesPaneView(this)];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p1 = this.anchorToPixel(this._anchors[0], viewport); // Center
    const p2 = this.anchorToPixel(this._anchors[1], viewport); // Radius point

    if (!p1 || !p2) return [];

    const geometries: Geometry[] = [];
    const rawLevels = this._fibOptions.levels ?? DEFAULT_FIB_CIRCLES_LEVELS;
    const baseRadius = distanceBetweenPoints(p1, p2);

    for (const item of rawLevels) {
      const isEnabled = typeof item === 'object' && item !== null ? item.enabled !== false : true;
      if (!isEnabled) continue;
      const val = typeof item === 'number' ? item : item.value;
      const radius = baseRadius * val;

      geometries.push({
        type: 'arc',
        center: p1,
        radius,
        startAngle: 0,
        endAngle: Math.PI * 2,
      } as ArcGeometry);
    }

    return geometries;
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);

    if (!p1 || !p2) return false;

    // Check hit on control points first
    for (const cp of this.getControlPoints(viewport)) {
      if (Math.hypot(point.x - cp.x, point.y - cp.y) <= 12) return true;
    }

    // Check hit on trend line
    if (this._fibOptions.showTrendline !== false) {
      if (distanceToLineSegment(point, p1, p2) <= FibCircles.HIT_THRESHOLD) {
        return true;
      }
    }

    // Check hit on circle level lines
    const rawLevels = this._fibOptions.levels ?? DEFAULT_FIB_CIRCLES_LEVELS;
    const baseRadius = distanceBetweenPoints(p1, p2);
    const distFromCenter = distanceBetweenPoints(point, p1);

    for (const item of rawLevels) {
      const isEnabled = typeof item === 'object' && item !== null ? item.enabled !== false : true;
      if (!isEnabled) continue;
      const val = typeof item === 'number' ? item : item.value;
      const radius = baseRadius * val;
      if (Math.abs(distFromCenter - radius) <= FibCircles.HIT_THRESHOLD) {
        return true;
      }
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new FibCircles(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._fibOptions }
    );
  }

  static create(
    id: string,
    center: Anchor,
    radiusPoint: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<FibCirclesOptions>
  ): FibCircles {
    return new FibCircles(id, [center, radiusPoint], style, options);
  }
}

