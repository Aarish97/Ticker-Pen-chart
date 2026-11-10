import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import type { Geometry, LineGeometry } from '../../core/geometry';
import { FibTimeExtensionPaneView } from './fib-time-extension-pane-view';

/**
 * Fibonacci time extension levels
 */
export interface FibTimeExtensionLevelItem {
  value: number;
  color: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  enabled: boolean;
}

export const FIB_TIME_EXTENSION_LEVELS = [0, 0.382, 0.5, 0.618, 1, 1.382, 1.618, 2, 2.382, 2.618, 3, 3.618, 4.236];

export const DEFAULT_FIB_TIME_EXTENSION_LEVELS: FibTimeExtensionLevelItem[] = [
  { value: 0, color: '#787B86', enabled: true },
  { value: 0.382, color: '#F7525F', enabled: true },
  { value: 0.5, color: '#4CAF50', enabled: false },
  { value: 0.618, color: '#00BCD4', enabled: true },
  { value: 1, color: '#00897B', enabled: true },
  { value: 1.382, color: '#00BCD4', enabled: true },
  { value: 1.618, color: '#787B86', enabled: true },
  { value: 2, color: '#2962FF', enabled: true },
  { value: 2.382, color: '#E91E63', enabled: true },
  { value: 2.618, color: '#9C27B0', enabled: true },
  { value: 3, color: '#673AB7', enabled: true },
  { value: 3.618, color: '#787B86', enabled: false },
  { value: 4.236, color: '#2962FF', enabled: false },
];

/**
 * FibTimeExtension options
 */
export interface FibTimeExtensionOptions extends DrawingOptions {
  levels?: (number | FibTimeExtensionLevelItem)[];
  intervals?: (number | FibTimeExtensionLevelItem)[];
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
 * FibTimeExtension - Trend-Based Fibonacci Time extension.
 *
 * Features:
 * - Three anchor points (start, end of trend, extension point)
 * - Vertical lines at Fibonacci time projections
 * - Optional labels showing level
 * - Optional fill between zones
 */
export class FibTimeExtension extends Drawing {
  readonly type = 'fib-time-extension';

  protected static readonly REQUIRED_ANCHORS = 3;
  protected static readonly HIT_THRESHOLD = 5;

  private _fibOptions: FibTimeExtensionOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<FibTimeExtensionOptions> = {}
  ) {
    const { levels, intervals, showLabels, filled, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    const activeLevels = levels ?? intervals ?? DEFAULT_FIB_TIME_EXTENSION_LEVELS;
    const lineWidth = options.lineWidth ?? options.levelLineWidth ?? (style as any)?.lineWidth ?? (style as any)?.size ?? 1;
    this._style.lineWidth = lineWidth;
    this._fibOptions = {
      ...this._options,
      ...options,
      lineWidth,
      levels: activeLevels,
      intervals: activeLevels,
      showLabels: showLabels ?? (options as any).showLabels ?? true,
      labelsVerticalAlign: options.labelsVerticalAlign ?? 'bottom',
      labelsAlign: options.labelsAlign ?? 'right',
      showTrendline: options.showTrendline ?? true,
      trendlineColor: options.trendlineColor ?? '#787B86',
      trendlineWidth: options.trendlineWidth ?? (options as any)?.lineWidth ?? lineWidth,
      levelLineWidth: (options as any)?.levelLineWidth ?? (options as any)?.lineWidth ?? lineWidth,
      trendlineStyle: options.trendlineStyle ?? 'dashed',
      filled: filled ?? (options as any).filled ?? true,
      backgroundOpacity: options.backgroundOpacity ?? 0.08,
    };
  }

  get fibOptions(): FibTimeExtensionOptions {
    return this._fibOptions;
  }

  setFibOptions(options: Partial<FibTimeExtensionOptions>): void {
    const activeLevels = options.levels ?? options.intervals;
    const lineWidth = options.lineWidth ?? options.levelLineWidth ?? (options as any)?.size;
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
    return this._anchors.length >= FibTimeExtension.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new FibTimeExtensionPaneView(this)];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);
    const p3 = this.anchorToPixel(this._anchors[2], viewport);

    if (!p1 || !p2 || !p3) return [];

    const geometries: Geometry[] = [];
    const levels = this._fibOptions.levels ?? FIB_TIME_EXTENSION_LEVELS;

    // Base time distance (from p1 to p2)
    const baseTimeWidth = p2.x - p1.x;

    for (const level of levels) {
      // Project from p3 using the base time width
      const val = typeof level === 'number' ? level : level.value;
      const x = p3.x + baseTimeWidth * val;

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
    const p3 = this.anchorToPixel(this._anchors[2], viewport);

    if (!p1 || !p2 || !p3) return false;

    // Check hit on control points first
    for (const cp of this.getControlPoints(viewport)) {
      if (Math.hypot(point.x - cp.x, point.y - cp.y) <= 12) return true;
    }

    const levels = this._fibOptions.levels ?? FIB_TIME_EXTENSION_LEVELS;
    const baseTimeWidth = p2.x - p1.x;

    for (const level of levels) {
      const val = typeof level === 'number' ? level : level.value;
      const x = p3.x + baseTimeWidth * val;
      if (Math.abs(point.x - x) <= FibTimeExtension.HIT_THRESHOLD) {
        return true;
      }
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new FibTimeExtension(
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
    extension: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<FibTimeExtensionOptions>
  ): FibTimeExtension {
    return new FibTimeExtension(id, [start, end, extension], style, options);
  }
}
