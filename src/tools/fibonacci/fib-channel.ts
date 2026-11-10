import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing, ControlPoint } from '../../core/types';
import { type Geometry, type LineGeometry, distanceToLineSegment, extendLineToViewport } from '../../core/geometry';
import { FibChannelPaneView } from './fib-channel-pane-view';

/**
 * Standard Fibonacci channel levels
 */
export interface FibChannelLevelItem {
  value: number;
  color: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  enabled: boolean;
}

export const FIB_CHANNEL_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618];

export const DEFAULT_FIB_CHANNEL_LEVELS: FibChannelLevelItem[] = [
  { value: 0, color: '#787B86', enabled: true },
  { value: 0.382, color: '#FF9800', enabled: true },
  { value: 0.618, color: '#00897B', enabled: true },
  { value: 1, color: '#787B86', enabled: true },
  { value: 2.618, color: '#EF5350', enabled: true },
  { value: 4.236, color: '#E91E63', enabled: true },
  { value: 1.414, color: '#B71C1C', enabled: false },
  { value: 2.414, color: '#388E3C', enabled: false },
  { value: 3, color: '#0097A7', enabled: false },
  { value: 3.414, color: '#2962FF', enabled: false },
  { value: 4.272, color: '#7B1FA2', enabled: false },
  { value: 4.618, color: '#AF601A', enabled: false },
  { value: 0.236, color: '#EF5350', enabled: true },
  { value: 0.5, color: '#4CAF50', enabled: true },
  { value: 0.786, color: '#00BCD4', enabled: true },
  { value: 1.618, color: '#2962FF', enabled: true },
  { value: 3.618, color: '#9C27B0', enabled: true },
  { value: 1.272, color: '#B9770E', enabled: false },
  { value: 2.272, color: '#B9770E', enabled: false },
  { value: 2, color: '#00796B', enabled: false },
  { value: 3.272, color: '#616161', enabled: false },
  { value: 4, color: '#C0392B', enabled: false },
  { value: 4.414, color: '#AD1457', enabled: false },
  { value: 4.764, color: '#00695C', enabled: false },
];

/**
 * FibChannel options
 */
export const DEFAULT_FIB_CHANNEL_OPTIONS: FibChannelOptions = {
  levels: DEFAULT_FIB_CHANNEL_LEVELS,
  showPrices: true,
  showPercentages: true,
  showLevels: true,
  levelsFormat: 'values',
  extendMode: 'none',
  extendLines: false,
  filled: true,
  backgroundOpacity: 0.15,
  labelsAlign: 'left',
  labelsVerticalAlign: 'middle',
  fontSize: 12,
  levelLineWidth: 1,
  levelLineStyle: 'solid',
};

export interface FibChannelOptions extends DrawingOptions {
  levels?: (number | FibChannelLevelItem)[];
  showPrices?: boolean;
  showPercentages?: boolean;
  showLevels?: boolean;
  levelsFormat?: 'values' | 'percent';
  extendMode?: 'none' | 'left' | 'right' | 'both';
  extendLines?: boolean;
  filled?: boolean;
  backgroundOpacity?: number;
  useOneColor?: boolean;
  oneColor?: string;
  lineColor?: string;
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  levelLineWidth?: number;
  levelLineStyle?: 'solid' | 'dashed' | 'dotted';
  labelsAlign?: 'left' | 'center' | 'right';
  labelsVerticalAlign?: 'top' | 'middle' | 'bottom';
  fontSize?: number;
}

/**
 * FibChannel - Fibonacci Channel with parallel trend lines at Fibonacci ratios.
 *
 * Features:
 * - Three anchor points (two for baseline, one for channel width)
 * - Multiple parallel lines at Fibonacci levels
 * - Optional fill between levels
 * - Optional line extensions
 */
export class FibChannel extends Drawing {
  readonly type = 'fib-channel';

  protected static readonly REQUIRED_ANCHORS = 3;
  protected static readonly HIT_THRESHOLD = 5;

  private _fibOptions: FibChannelOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<FibChannelOptions> = {}
  ) {
    const { levels, showPrices, showPercentages, extendLines, filled, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    const activeLevels = levels ?? DEFAULT_FIB_CHANNEL_LEVELS;
    const lineWidth = options.lineWidth ?? options.levelLineWidth ?? (style as any)?.lineWidth ?? (style as any)?.size ?? 1;
    this._style.lineWidth = lineWidth;
    this._fibOptions = {
      ...this._options,
      ...options,
      lineWidth,
      levels: activeLevels,
      showPrices: showPrices ?? (options as any).showPrices ?? (style as any)?.showPrices ?? (options as any)?.prices ?? true,
      showPercentages: showPercentages ?? true,
      showLevels: (options as any).showLevels ?? true,
      levelsFormat: options.levelsFormat ?? 'values',
      extendMode: options.extendMode ?? (extendLines ? 'both' : 'none'),
      extendLines: extendLines ?? false,
      filled: filled ?? (options as any).filled ?? true,
      backgroundOpacity: options.backgroundOpacity ?? 0.15,
      labelsAlign: options.labelsAlign ?? 'left',
      labelsVerticalAlign: options.labelsVerticalAlign ?? 'middle',
      fontSize: options.fontSize ?? 12,
      levelLineWidth: options.levelLineWidth ?? lineWidth,
      levelLineStyle: options.levelLineStyle ?? 'solid',
    };
  }

  get fibOptions(): FibChannelOptions {
    return this._fibOptions;
  }

  setFibOptions(options: Partial<FibChannelOptions>): void {
    const lineWidth = options.lineWidth ?? options.levelLineWidth ?? (options as any)?.size;
    if (lineWidth) {
      this._style.lineWidth = lineWidth;
    }
    this._fibOptions = {
      ...this._fibOptions,
      ...options,
      ...(lineWidth ? { lineWidth } : {})
    };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= FibChannel.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new FibChannelPaneView(this)];
  }

  getControlPoints(viewport: Viewport): ControlPoint[] {
    if (this._anchors.length < 2) return [];

    const points: ControlPoint[] = [];
    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);

    if (!p1 || !p2) return [];

    // Anchor 0: Baseline start point
    points.push({ index: 0, x: p1.x, y: p1.y, radius: 6 });
    // Anchor 1: Baseline end point
    points.push({ index: 1, x: p2.x, y: p2.y, radius: 6 });

    // Anchor 2: Third anchor point attached directly to the Level 1 channel line
    if (this._anchors.length >= 3) {
      const p3 = this.anchorToPixel(this._anchors[2], viewport);
      if (p3) {
        const offset = this.calculateOffset(p1, p2, p3);
        const p1Parallel = { x: p1.x + offset.x, y: p1.y + offset.y };

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lenSq = dx * dx + dy * dy;
        let u = 0.5;
        if (lenSq > 0) {
          const vx = p3.x - p1.x;
          const vy = p3.y - p1.y;
          u = Math.max(0, Math.min(1, (vx * dx + vy * dy) / lenSq));
        }

        const attachedX = p1Parallel.x + u * dx;
        const attachedY = p1Parallel.y + u * dy;

        points.push({ index: 2, x: attachedX, y: attachedY, radius: 6 });
      }
    }

    return points;
  }

  updateAnchor(index: number, anchor: Anchor): void {
    const viewport = this.getViewport();
    if (!viewport || index !== 2 || this._anchors.length < 3) {
      super.updateAnchor(index, anchor);
      return;
    }

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);
    const mousePixel = this.anchorToPixel(anchor, viewport);

    if (p1 && p2 && mousePixel) {
      const offset = this.calculateOffset(p1, p2, mousePixel);
      const p1Parallel = { x: p1.x + offset.x, y: p1.y + offset.y };

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      let u = 0.5;
      if (lenSq > 0) {
        const vx = mousePixel.x - p1.x;
        const vy = mousePixel.y - p1.y;
        u = Math.max(0, Math.min(1, (vx * dx + vy * dy) / lenSq));
      }

      const attachedX = p1Parallel.x + u * dx;
      const attachedY = p1Parallel.y + u * dy;

      const attachedTime = viewport.timeScale.coordinateToTime(attachedX);
      const attachedPrice = viewport.priceScale.coordinateToPrice(attachedY);

      if (attachedTime !== null && attachedPrice !== null) {
        this._anchors[2] = { time: attachedTime, price: attachedPrice };
      } else {
        super.updateAnchor(index, anchor);
      }
      this.requestUpdate();
      return;
    }

    super.updateAnchor(index, anchor);
  }

  /**
   * Calculate the perpendicular offset from baseline to p3
   */
  calculateOffset(p1: Point, p2: Point, p3: Point): Point {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) return { x: 0, y: p3.y - p1.y };

    const nx = -dy / len;
    const ny = dx / len;

    const vx = p3.x - p1.x;
    const vy = p3.y - p1.y;

    const dist = vx * nx + vy * ny;

    return { x: nx * dist, y: ny * dist };
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);
    const p3 = this.anchorToPixel(this._anchors[2], viewport);

    if (!p1 || !p2 || !p3) return [];

    const geometries: Geometry[] = [];
    const rawLevels = this._fibOptions.levels ?? DEFAULT_FIB_CHANNEL_LEVELS;
    const items: Array<{ value: number; enabled: boolean }> = rawLevels
      .map((item: any) => typeof item === 'number' ? { value: item, enabled: true } : item)
      .filter((item: any) => item && item.enabled !== false);

    const offset = this.calculateOffset(p1, p2, p3);
    const extendMode = this._fibOptions.extendMode ?? (this._fibOptions.extendLines ? 'both' : 'none');
    const extendLeft = extendMode === 'left' || extendMode === 'both';
    const extendRight = extendMode === 'right' || extendMode === 'both';

    for (const item of items) {
      const offsetX = offset.x * item.value;
      const offsetY = offset.y * item.value;

      const start = { x: p1.x + offsetX, y: p1.y + offsetY };
      const end = { x: p2.x + offsetX, y: p2.y + offsetY };

      geometries.push({
        type: 'line',
        start,
        end,
        extendLeft,
        extendRight,
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
    const controlPoints = this.getControlPoints(viewport);
    for (const cp of controlPoints) {
      if (Math.hypot(point.x - cp.x, point.y - cp.y) <= 12) {
        return true;
      }
    }

    const rawLevels = this._fibOptions.levels ?? DEFAULT_FIB_CHANNEL_LEVELS;
    const items: Array<{ value: number; enabled: boolean }> = rawLevels
      .map((item: any) => typeof item === 'number' ? { value: item, enabled: true } : item)
      .filter((item: any) => item && item.enabled !== false);

    const offset = this.calculateOffset(p1, p2, p3);
    const extendMode = this._fibOptions.extendMode ?? (this._fibOptions.extendLines ? 'both' : 'none');
    const extendLeft = extendMode === 'left' || extendMode === 'both';
    const extendRight = extendMode === 'right' || extendMode === 'both';

    // Test each active line
    for (const item of items) {
      const offsetX = offset.x * item.value;
      const offsetY = offset.y * item.value;

      let start = { x: p1.x + offsetX, y: p1.y + offsetY };
      let end = { x: p2.x + offsetX, y: p2.y + offsetY };

      if (extendLeft || extendRight) {
        const extended = extendLineToViewport(start, end, viewport.width, viewport.height, extendLeft, extendRight);
        start = extended.start;
        end = extended.end;
      }

      if (distanceToLineSegment(point, start, end) <= 8) {
        return true;
      }
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new FibChannel(
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
    width: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<FibChannelOptions>
  ): FibChannel {
    return new FibChannel(id, [start, end, width], style, options);
  }
}
