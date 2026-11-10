import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { type Geometry, type ArcGeometry, distanceBetweenPoints, distanceToLineSegment } from '../../core/geometry';
import { FibArcsPaneView } from './fib-arcs-pane-view';

/**
 * Level item definition for Fib Arcs
 */
export interface FibArcLevelItem {
  value: number;
  color: string;
  enabled?: boolean;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
}

/**
 * Default Fibonacci arc levels matching TradingView standards
 */
export const DEFAULT_FIB_ARCS_LEVELS: FibArcLevelItem[] = [
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

export const FIB_ARC_LEVELS = DEFAULT_FIB_ARCS_LEVELS.map(l => l.value);

/**
 * FibArcs options
 */
export interface FibArcsOptions extends DrawingOptions {
  levels?: (number | FibArcLevelItem)[];
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
  fullCircles?: boolean;
  fullCircle?: boolean;
}

/**
 * FibArcs - Speed/Resistance arcs at Fibonacci ratios.
 */
export class FibArcs extends Drawing {
  readonly type = 'fib-arcs';

  protected static readonly REQUIRED_ANCHORS = 2;
  protected static readonly HIT_THRESHOLD = 6;

  private _fibOptions: FibArcsOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<FibArcsOptions> = {}
  ) {
    const { levels, showLabels, fullCircles, fullCircle, filled, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    const isFull = fullCircles ?? fullCircle ?? false;
    const lineWidth = options.lineWidth ?? (options as any)?.levelLineWidth ?? options.trendlineWidth ?? (style as any)?.lineWidth ?? (style as any)?.size ?? 1;
    this._style.lineWidth = lineWidth;

    this._fibOptions = {
      ...this._options,
      levels: levels ?? DEFAULT_FIB_ARCS_LEVELS,
      showTrendline: options.showTrendline ?? true,
      trendlineColor: options.trendlineColor ?? '#787B86',
      trendlineStyle: options.trendlineStyle ?? 'dashed',
      trendlineWidth: options.trendlineWidth ?? (options as any)?.lineWidth ?? lineWidth,
      lineWidth: options.lineWidth ?? (options as any)?.levelLineWidth ?? lineWidth,
      useOneColor: options.useOneColor ?? false,
      oneColor: options.oneColor ?? '#2962FF',
      showLabels: showLabels ?? true,
      fullCircles: isFull,
      fullCircle: isFull,
      filled: filled ?? true,
      backgroundOpacity: options.backgroundOpacity ?? 0.15,
    };
  }

  get fibOptions(): FibArcsOptions {
    return this._fibOptions;
  }

  setFibOptions(options: Partial<FibArcsOptions>): void {
    this._fibOptions = { ...this._fibOptions, ...options };
    if (options.fullCircles !== undefined) this._fibOptions.fullCircle = options.fullCircles;
    if (options.fullCircle !== undefined) this._fibOptions.fullCircles = options.fullCircle;
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= FibArcs.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new FibArcsPaneView(this)];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);

    if (!p1 || !p2) return [];

    const geometries: Geometry[] = [];
    const rawLevels = this._fibOptions.levels ?? DEFAULT_FIB_ARCS_LEVELS;
    const baseRadius = distanceBetweenPoints(p1, p2);

    // Calculate arc direction based on anchor positions
    const isFull = this._fibOptions.fullCircles ?? this._fibOptions.fullCircle ?? false;
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const startAngle = isFull ? 0 : angle - Math.PI / 2;
    const endAngle = isFull ? Math.PI * 2 : angle + Math.PI / 2;

    for (const item of rawLevels) {
      const isEnabled = typeof item === 'object' && item !== null ? item.enabled !== false : true;
      if (!isEnabled) continue;
      const val = typeof item === 'number' ? item : item.value;
      const radius = baseRadius * val;

      geometries.push({
        type: 'arc',
        center: p1,
        radius,
        startAngle,
        endAngle,
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
      if (distanceToLineSegment(point, p1, p2) <= FibArcs.HIT_THRESHOLD) {
        return true;
      }
    }

    const rawLevels = this._fibOptions.levels ?? DEFAULT_FIB_ARCS_LEVELS;
    const baseRadius = distanceBetweenPoints(p1, p2);
    const distFromCenter = distanceBetweenPoints(point, p1);
    const isFull = this._fibOptions.fullCircles ?? this._fibOptions.fullCircle ?? false;

    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const pointAngle = Math.atan2(point.y - p1.y, point.x - p1.x);

    let angleDiff = Math.abs(pointAngle - angle);
    while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - 2 * Math.PI);

    const isWithinArc = isFull || angleDiff <= (Math.PI / 2 + 0.1);

    if (isWithinArc) {
      for (const item of rawLevels) {
        const isEnabled = typeof item === 'object' && item !== null ? item.enabled !== false : true;
        if (!isEnabled) continue;
        const val = typeof item === 'number' ? item : item.value;
        const radius = baseRadius * val;
        if (Math.abs(distFromCenter - radius) <= FibArcs.HIT_THRESHOLD) {
          return true;
        }
      }
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new FibArcs(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._fibOptions }
    );
  }

  static create(
    id: string,
    pivot: Anchor,
    extent: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<FibArcsOptions>
  ): FibArcs {
    return new FibArcs(id, [pivot, extent], style, options);
  }
}

