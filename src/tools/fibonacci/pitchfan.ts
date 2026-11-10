import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, ControlPoint, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { type Geometry, type LineGeometry, distanceToLineSegment, midpoint, extendLineToViewport } from '../../core/geometry';
import { PitchfanPaneView } from './pitchfan-pane-view';

export interface PitchfanLevelItem {
  value: number;
  color: string;
  enabled: boolean;
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

/**
 * Standard Pitchfan levels matching TradingView
 */
export const DEFAULT_PITCHFAN_LEVELS: PitchfanLevelItem[] = [
  { value: 0.25, color: '#9C6D38', enabled: false },
  { value: 0.382, color: '#5B8A61', enabled: false },
  { value: 0.5, color: '#00BCD4', enabled: true },
  { value: 0.618, color: '#2E7D68', enabled: false },
  { value: 0.75, color: '#1B858B', enabled: false },
  { value: 1, color: '#2962FF', enabled: true },
  { value: 1.5, color: '#6A1B9A', enabled: false },
  { value: 1.75, color: '#AD1457', enabled: false },
  { value: 2, color: '#A05252', enabled: false },
];

/**
 * Pitchfan options matching TradingView settings
 */
export interface PitchfanOptions extends DrawingOptions {
  levels?: PitchfanLevelItem[] | number[];
  lineWidth?: number;
  showMedian?: boolean;
  medianColor?: string;
  medianWidth?: number;
  medianStyle?: 'solid' | 'dashed' | 'dotted';
  showBaseline?: boolean;
  baselineColor?: string;
  baselineWidth?: number;
  baselineStyle?: 'solid' | 'dashed' | 'dotted';
  useOneColor?: boolean;
  oneColor?: string;
  filled?: boolean;
  backgroundOpacity?: number;
  showLabels?: boolean;
  extendLines?: boolean;
}

/**
 * Pitchfan - Fan lines radiating from pivot through Fibonacci divisions of the baseline.
 */
export class Pitchfan extends Drawing {
  readonly type = 'pitchfan';

  protected static readonly REQUIRED_ANCHORS = 3;
  protected static readonly HIT_THRESHOLD = 6;

  private _fibOptions: PitchfanOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<PitchfanOptions> = {}
  ) {
    const {
      levels,
      showMedian,
      medianColor,
      medianWidth,
      medianStyle,
      showBaseline,
      baselineColor,
      baselineWidth,
      baselineStyle,
      useOneColor,
      oneColor,
      filled,
      backgroundOpacity,
      showLabels,
      extendLines,
      ...baseOptions
    } = options;

    super(id, anchors, style, baseOptions);

    const lw = (options as any)?.lineWidth ?? (options as any)?.levelLineWidth ?? (style as any)?.lineWidth ?? (style as any)?.size ?? 1;
    this._style.lineWidth = lw;

    this._fibOptions = {
      ...this._options,
      levels: levels ?? DEFAULT_PITCHFAN_LEVELS.map(l => ({ ...l })),
      showMedian: showMedian ?? true,
      medianColor: medianColor ?? '#F23645',
      medianWidth: medianWidth ?? (options as any)?.lineWidth ?? lw,
      medianStyle: medianStyle ?? 'solid',
      showBaseline: showBaseline ?? true,
      baselineColor: baselineColor ?? '#787B86',
      baselineWidth: baselineWidth ?? (options as any)?.lineWidth ?? lw,
      baselineStyle: baselineStyle ?? 'dashed',
      useOneColor: useOneColor ?? false,
      oneColor: oneColor ?? '#2962FF',
      filled: filled ?? true,
      backgroundOpacity: backgroundOpacity ?? 0.15,
      showLabels: showLabels ?? true,
      extendLines: extendLines ?? true,
      lineWidth: lw,
    };
  }

  get fibOptions(): PitchfanOptions {
    return this._fibOptions;
  }

  setFibOptions(options: Partial<PitchfanOptions>): void {
    this._fibOptions = { ...this._fibOptions, ...options };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= Pitchfan.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new PitchfanPaneView(this)];
  }

  getControlPoints(viewport: Viewport): (Point | ControlPoint)[] {
    if (!this.isValid()) return [];
    const p0 = this.anchorToPixel(this._anchors[0], viewport);
    const p1 = this.anchorToPixel(this._anchors[1], viewport);
    const p2 = this.anchorToPixel(this._anchors[2], viewport);
    const cps: Point[] = [];
    if (p0) cps.push({ x: p0.x, y: p0.y, index: 0 } as any);
    if (p1) cps.push({ x: p1.x, y: p1.y, index: 1 } as any);
    if (p2) cps.push({ x: p2.x, y: p2.y, index: 2 } as any);
    return cps;
  }

  /**
   * Get the fan line ray target point for a given side and level
   */
  getFanTarget(p1: Point, p2: Point, level: number, side: 'upper' | 'lower'): Point {
    const mid = midpoint(p1, p2);
    const vx = (p2.x - p1.x) / 2;
    const vy = (p2.y - p1.y) / 2;

    if (side === 'upper') {
      return {
        x: mid.x + vx * level,
        y: mid.y + vy * level,
      };
    } else {
      return {
        x: mid.x - vx * level,
        y: mid.y - vy * level,
      };
    }
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p0 = this.anchorToPixel(this._anchors[0], viewport);
    const p1 = this.anchorToPixel(this._anchors[1], viewport);
    const p2 = this.anchorToPixel(this._anchors[2], viewport);

    if (!p0 || !p1 || !p2) return [];

    const geometries: Geometry[] = [];
    const mid = midpoint(p1, p2);

    // Median line
    if (this._fibOptions.showMedian !== false) {
      const extMed = extendLineToViewport(p0, mid, viewport.width, viewport.height, false, true);
      geometries.push({
        type: 'line',
        start: p0,
        end: extMed.end,
        extendRight: true,
      } as LineGeometry);
    }

    const rawLevels = this._fibOptions.levels ?? DEFAULT_PITCHFAN_LEVELS;
    for (const item of rawLevels) {
      const isEnabled = typeof item === 'object' && item !== null ? item.enabled !== false : true;
      if (!isEnabled) continue;
      const val = typeof item === 'number' ? item : item.value;

      const upperT = this.getFanTarget(p1, p2, val, 'upper');
      const lowerT = this.getFanTarget(p1, p2, val, 'lower');

      const extUpper = extendLineToViewport(p0, upperT, viewport.width, viewport.height, false, true);
      const extLower = extendLineToViewport(p0, lowerT, viewport.width, viewport.height, false, true);

      geometries.push({
        type: 'line',
        start: p0,
        end: extUpper.end,
        extendRight: true,
      } as LineGeometry);

      geometries.push({
        type: 'line',
        start: p0,
        end: extLower.end,
        extendRight: true,
      } as LineGeometry);
    }

    return geometries;
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const p0 = this.anchorToPixel(this._anchors[0], viewport);
    const p1 = this.anchorToPixel(this._anchors[1], viewport);
    const p2 = this.anchorToPixel(this._anchors[2], viewport);

    if (!p0 || !p1 || !p2) return false;

    // Check hit on control points first
    for (const cp of this.getControlPoints(viewport)) {
      if (Math.hypot(point.x - cp.x, point.y - cp.y) <= 12) return true;
    }

    // Baseline hit
    if (this._fibOptions.showBaseline !== false) {
      if (distanceToLineSegment(point, p1, p2) <= Pitchfan.HIT_THRESHOLD) return true;
    }

    // Median line hit
    const mid = midpoint(p1, p2);
    if (this._fibOptions.showMedian !== false) {
      const extMed = extendLineToViewport(p0, mid, viewport.width, viewport.height, false, true);
      if (distanceToLineSegment(point, p0, extMed.end) <= Pitchfan.HIT_THRESHOLD) return true;
    }

    // Fan lines hit
    const rawLevels = this._fibOptions.levels ?? DEFAULT_PITCHFAN_LEVELS;
    for (const item of rawLevels) {
      const isEnabled = typeof item === 'object' && item !== null ? item.enabled !== false : true;
      if (!isEnabled) continue;
      const val = typeof item === 'number' ? item : item.value;

      const upperT = this.getFanTarget(p1, p2, val, 'upper');
      const lowerT = this.getFanTarget(p1, p2, val, 'lower');

      const extUpper = extendLineToViewport(p0, upperT, viewport.width, viewport.height, false, true);
      const extLower = extendLineToViewport(p0, lowerT, viewport.width, viewport.height, false, true);

      if (distanceToLineSegment(point, p0, extUpper.end) <= Pitchfan.HIT_THRESHOLD) return true;
      if (distanceToLineSegment(point, p0, extLower.end) <= Pitchfan.HIT_THRESHOLD) return true;
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new Pitchfan(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._fibOptions }
    );
  }

  static create(
    id: string,
    pivot: Anchor,
    swing1: Anchor,
    swing2: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<PitchfanOptions>
  ): Pitchfan {
    return new Pitchfan(id, [pivot, swing1, swing2], style, options);
  }
}
