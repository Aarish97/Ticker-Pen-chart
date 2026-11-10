import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, ControlPoint, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { type Geometry, type ArcGeometry, distanceBetweenPoints, distanceToLineSegment } from '../../core/geometry';
import { FibWedgePaneView } from './fib-wedge-pane-view';

/**
 * Level item definition for Fib Wedge
 */
export interface FibWedgeLevelItem {
  value: number;
  color: string;
  enabled?: boolean;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
}

/**
 * Default Fibonacci wedge levels matching TradingView standards
 */
export const DEFAULT_FIB_WEDGE_LEVELS: FibWedgeLevelItem[] = [
  { value: 0.236, color: '#F23645', enabled: true },
  { value: 0.382, color: '#FF9800', enabled: true },
  { value: 0.5, color: '#4CAF50', enabled: true },
  { value: 0.618, color: '#00897B', enabled: true },
  { value: 0.786, color: '#00BCD4', enabled: true },
  { value: 1, color: '#787B86', enabled: true },
  { value: 1.618, color: '#2962FF', enabled: false },
  { value: 2.618, color: '#9C27B0', enabled: false },
  { value: 3.618, color: '#673AB7', enabled: false },
  { value: 4.236, color: '#880E4F', enabled: false },
  { value: 4.618, color: '#880E4F', enabled: false },
];

export const FIB_WEDGE_LEVELS = DEFAULT_FIB_WEDGE_LEVELS.map(l => l.value);

/**
 * FibWedge options
 */
export interface FibWedgeOptions extends DrawingOptions {
  levels?: (number | FibWedgeLevelItem)[];
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
}

/**
 * FibWedge - Wedge pattern with Fibonacci level arcs.
 */
export class FibWedge extends Drawing {
  readonly type = 'fib-wedge';

  protected static readonly REQUIRED_ANCHORS = 3;
  protected static readonly HIT_THRESHOLD = 6;

  private _fibOptions: FibWedgeOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<FibWedgeOptions> = {}
  ) {
    const { levels, showLabels, filled, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    const lineWidth = options.lineWidth ?? (options as any)?.levelLineWidth ?? options.trendlineWidth ?? (style as any)?.lineWidth ?? (style as any)?.size ?? 1;
    this._style.lineWidth = lineWidth;

    this._fibOptions = {
      ...this._options,
      levels: levels ?? DEFAULT_FIB_WEDGE_LEVELS,
      showTrendline: options.showTrendline ?? true,
      trendlineColor: options.trendlineColor ?? '#787B86',
      trendlineStyle: options.trendlineStyle ?? 'solid',
      trendlineWidth: options.trendlineWidth ?? (options as any)?.lineWidth ?? lineWidth,
      lineWidth: options.lineWidth ?? (options as any)?.levelLineWidth ?? lineWidth,
      useOneColor: options.useOneColor ?? false,
      oneColor: options.oneColor ?? '#2962FF',
      showLabels: showLabels ?? true,
      filled: filled ?? true,
      backgroundOpacity: options.backgroundOpacity ?? 0.15,
    };
  }

  get fibOptions(): FibWedgeOptions {
    return this._fibOptions;
  }

  setFibOptions(options: Partial<FibWedgeOptions>): void {
    this._fibOptions = { ...this._fibOptions, ...options };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= FibWedge.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new FibWedgePaneView(this)];
  }

  getControlPoints(viewport: Viewport): (Point | ControlPoint)[] {
    if (!this.isValid()) return [];
    const apex = this.anchorToPixel(this._anchors[0], viewport);
    const p1 = this.anchorToPixel(this._anchors[1], viewport);
    const p2 = this.anchorToPixel(this._anchors[2], viewport);
    if (!apex) return [];

    const cps: Point[] = [{ x: apex.x, y: apex.y, index: 0 } as any];
    const r1 = p1 ? distanceBetweenPoints(apex, p1) : 0;
    const r2 = p2 ? distanceBetweenPoints(apex, p2) : 0;
    const baseRadius = Math.max(r1, r2);

    if (p1) {
      const angle1 = Math.atan2(p1.y - apex.y, p1.x - apex.x);
      cps.push({
        x: apex.x + (baseRadius > 0 ? baseRadius : r1) * Math.cos(angle1),
        y: apex.y + (baseRadius > 0 ? baseRadius : r1) * Math.sin(angle1),
        index: 1
      } as any);
    }
    if (p2) {
      const angle2 = Math.atan2(p2.y - apex.y, p2.x - apex.x);
      cps.push({
        x: apex.x + (baseRadius > 0 ? baseRadius : r2) * Math.cos(angle2),
        y: apex.y + (baseRadius > 0 ? baseRadius : r2) * Math.sin(angle2),
        index: 2
      } as any);
    }
    return cps;
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const apex = this.anchorToPixel(this._anchors[0], viewport);
    const p1 = this.anchorToPixel(this._anchors[1], viewport);
    const p2 = this.anchorToPixel(this._anchors[2], viewport);

    if (!apex || !p1 || !p2) return [];

    const geometries: Geometry[] = [];
    const rawLevels = this._fibOptions.levels ?? DEFAULT_FIB_WEDGE_LEVELS;
    const r1 = distanceBetweenPoints(apex, p1);
    const r2 = distanceBetweenPoints(apex, p2);
    const baseRadius = Math.max(r1, r2);
    if (baseRadius <= 0) return [];

    const angle1 = Math.atan2(p1.y - apex.y, p1.x - apex.x);
    const angle2 = Math.atan2(p2.y - apex.y, p2.x - apex.x);

    for (const item of rawLevels) {
      const isEnabled = typeof item === 'object' && item !== null ? item.enabled !== false : true;
      if (!isEnabled) continue;
      const val = typeof item === 'number' ? item : item.value;
      const radius = baseRadius * val;

      geometries.push({
        type: 'arc',
        center: apex,
        radius,
        startAngle: angle1,
        endAngle: angle2,
      } as ArcGeometry);
    }

    return geometries;
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const apex = this.anchorToPixel(this._anchors[0], viewport);
    const p1 = this.anchorToPixel(this._anchors[1], viewport);
    const p2 = this.anchorToPixel(this._anchors[2], viewport);

    if (!apex || !p1 || !p2) return false;

    // Check hit on control points first
    for (const cp of this.getControlPoints(viewport)) {
      if (Math.hypot(point.x - cp.x, point.y - cp.y) <= 12) return true;
    }

    const r1 = distanceBetweenPoints(apex, p1);
    const r2 = distanceBetweenPoints(apex, p2);
    const baseRadius = Math.max(r1, r2);
    if (baseRadius <= 0) return false;

    const angle1 = Math.atan2(p1.y - apex.y, p1.x - apex.x);
    const angle2 = Math.atan2(p2.y - apex.y, p2.x - apex.x);

    const p1Adj = { x: apex.x + baseRadius * Math.cos(angle1), y: apex.y + baseRadius * Math.sin(angle1) };
    const p2Adj = { x: apex.x + baseRadius * Math.cos(angle2), y: apex.y + baseRadius * Math.sin(angle2) };

    // Check boundary lines: apex to p1Adj and apex to p2Adj
    if (this._fibOptions.showTrendline !== false) {
      if (distanceToLineSegment(point, apex, p1Adj) <= FibWedge.HIT_THRESHOLD) return true;
      if (distanceToLineSegment(point, apex, p2Adj) <= FibWedge.HIT_THRESHOLD) return true;
    }

    // Check arcs
    let diff = angle2 - angle1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) < 1e-4) return false;

    const distFromCenter = distanceBetweenPoints(point, apex);
    const pointAngle = Math.atan2(point.y - apex.y, point.x - apex.x);

    let pDiff = pointAngle - angle1;
    while (pDiff > Math.PI) pDiff -= 2 * Math.PI;
    while (pDiff < -Math.PI) pDiff += 2 * Math.PI;

    const t = pDiff / diff;
    if (t >= -0.05 && t <= 1.05) {
      const rawLevels = this._fibOptions.levels ?? DEFAULT_FIB_WEDGE_LEVELS;
      for (const item of rawLevels) {
        const isEnabled = typeof item === 'object' && item !== null ? item.enabled !== false : true;
        if (!isEnabled) continue;
        const val = typeof item === 'number' ? item : item.value;
        const radius = baseRadius * val;
        if (Math.abs(distFromCenter - radius) <= FibWedge.HIT_THRESHOLD) return true;
      }
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new FibWedge(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._fibOptions }
    );
  }

  static create(
    id: string,
    apex: Anchor,
    boundary1: Anchor,
    boundary2: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<FibWedgeOptions>
  ): FibWedge {
    return new FibWedge(id, [apex, boundary1, boundary2], style, options);
  }
}

