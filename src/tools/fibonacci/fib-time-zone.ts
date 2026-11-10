import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { distanceToLineSegment, type Geometry, type LineGeometry } from '../../core/geometry';
import { FibTimeZonePaneView } from './fib-time-zone-pane-view';

/**
 * Fibonacci time zone intervals (0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610...)
 */
export const FIB_TIME_INTERVALS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610];

export interface FibTimeZoneLevelItem {
  value: number;
  color: string;
  enabled: boolean;
}

export const DEFAULT_FIB_TIME_ZONE_LEVELS: FibTimeZoneLevelItem[] = [
  { value: 0, color: '#787B86', enabled: true },
  { value: 1, color: '#2962FF', enabled: true },
  { value: 2, color: '#2962FF', enabled: true },
  { value: 3, color: '#2962FF', enabled: true },
  { value: 5, color: '#2962FF', enabled: true },
  { value: 8, color: '#2962FF', enabled: true },
  { value: 13, color: '#2962FF', enabled: true },
  { value: 21, color: '#2962FF', enabled: true },
  { value: 34, color: '#2962FF', enabled: true },
  { value: 55, color: '#2962FF', enabled: true },
  { value: 89, color: '#2962FF', enabled: true },
  { value: 144, color: '#2962FF', enabled: false },
  { value: 233, color: '#2962FF', enabled: false },
  { value: 377, color: '#2962FF', enabled: false },
  { value: 610, color: '#2962FF', enabled: false },
];

/**
 * FibTimeZone options
 */
export interface FibTimeZoneOptions extends DrawingOptions {
  intervals?: (number | FibTimeZoneLevelItem)[];
  levels?: (number | FibTimeZoneLevelItem)[];
  showLabels?: boolean;
  labelsAlign?: 'left' | 'center' | 'right';
  labelsVerticalAlign?: 'top' | 'middle' | 'bottom';
  useOneColor?: boolean;
  oneColor?: string;
  showTrendline?: boolean;
  trendlineColor?: string;
  trendlineWidth?: number;
  trendlineStyle?: 'solid' | 'dashed' | 'dotted';
  filled?: boolean;
  backgroundOpacity?: number;
  lineColor?: string;
  lineWidth?: number;
  levelLineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

/**
 * FibTimeZone - Vertical lines at Fibonacci time intervals.
 *
 * Features:
 * - Two anchor points define the unit interval
 * - Vertical lines at Fibonacci sequence positions
 * - Optional labels showing interval number
 * - Optional fill between zones
 */
export class FibTimeZone extends Drawing {
  readonly type = 'fib-time-zone';

  protected static readonly REQUIRED_ANCHORS = 2;
  protected static readonly HIT_THRESHOLD = 5;

  private _fibOptions: FibTimeZoneOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<FibTimeZoneOptions> = {}
  ) {
    const { levels, intervals, showLabels, filled, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    const activeLevels = levels ?? intervals ?? DEFAULT_FIB_TIME_ZONE_LEVELS;
    const lineWidth = options.lineWidth ?? (options as any).levelLineWidth ?? (style as any)?.lineWidth ?? (style as any)?.size ?? 1;
    this._style.lineWidth = lineWidth;
    this._fibOptions = {
      ...this._options,
      ...options,
      lineWidth,
      levels: activeLevels,
      intervals: activeLevels,
      showLabels: showLabels ?? (options as any).showLabels ?? true,
      labelsVerticalAlign: options.labelsVerticalAlign ?? 'bottom',
      labelsAlign: options.labelsAlign ?? 'left',
      filled: filled ?? (options as any).filled ?? true,
      backgroundOpacity: options.backgroundOpacity ?? 0.15,
    };
  }

  get fibOptions(): FibTimeZoneOptions {
    return this._fibOptions;
  }

  setFibOptions(options: Partial<FibTimeZoneOptions>): void {
    const activeLevels = options.levels ?? options.intervals;
    const lineWidth = options.lineWidth ?? (options as any)?.levelLineWidth ?? (options as any)?.size;
    if (lineWidth) {
      this._style.lineWidth = lineWidth;
    }
    this._fibOptions = {
      ...this._fibOptions,
      ...options,
      ...(lineWidth ? { lineWidth } : {}),
      ...(activeLevels ? { levels: activeLevels, intervals: activeLevels } : {})
    };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= FibTimeZone.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new FibTimeZonePaneView(this)];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);

    if (!p1 || !p2) return [];

    const geometries: Geometry[] = [];
    const rawIntervals = this._fibOptions.intervals ?? this._fibOptions.levels ?? FIB_TIME_INTERVALS;
    const intervals: number[] = rawIntervals
      .map((item: any) => (typeof item === 'number' ? item : item?.enabled !== false ? item?.value : null))
      .filter((val): val is number => typeof val === 'number');
    const unitWidth = p2.x - p1.x;

    for (const interval of intervals) {
      const x = p1.x + unitWidth * interval;

      geometries.push({
        type: 'line',
        start: { x, y: 0 },
        end: { x, y: viewport.height },
      } as LineGeometry);
    }

    return geometries;
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);

    if (!p1 || !p2) return false;

    // Check hit on control points
    for (const cp of this.getControlPoints(viewport)) {
      if (Math.hypot(point.x - cp.x, point.y - cp.y) <= 10) return true;
    }

    // Baseline trendline hit
    if (distanceToLineSegment(point, p1, p2) <= FibTimeZone.HIT_THRESHOLD) {
      return true;
    }

    const rawIntervals = this._fibOptions.intervals ?? this._fibOptions.levels ?? FIB_TIME_INTERVALS;
    const intervals: number[] = rawIntervals
      .map((item: any) => (typeof item === 'number' ? item : item?.enabled !== false ? item?.value : null))
      .filter((val): val is number => typeof val === 'number');
    const unitWidth = p2.x - p1.x;

    for (const interval of intervals) {
      const x = p1.x + unitWidth * interval;
      if (Math.abs(point.x - x) <= FibTimeZone.HIT_THRESHOLD) {
        return true;
      }
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new FibTimeZone(
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
    options?: Partial<FibTimeZoneOptions>
  ): FibTimeZone {
    return new FibTimeZone(id, [start, end], style, options);
  }
}
