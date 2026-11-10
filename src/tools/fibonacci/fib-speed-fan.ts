import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, ControlPoint, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { type Geometry, distanceToLineSegment, extendLineToViewport } from '../../core/geometry';
import { FibSpeedFanPaneView } from './fib-speed-fan-pane-view';

export interface SpeedFanLevelItem {
  value: number;
  color: string;
  enabled: boolean;
}

export const DEFAULT_SPEED_FAN_PRICE_LEVELS: SpeedFanLevelItem[] = [
  { value: 0, color: '#787B86', enabled: true },
  { value: 0.25, color: '#FF9800', enabled: true },
  { value: 0.382, color: '#00BCD4', enabled: true },
  { value: 0.5, color: '#4CAF50', enabled: true },
  { value: 0.618, color: '#089981', enabled: true },
  { value: 0.75, color: '#2962FF', enabled: true },
  { value: 1, color: '#787B86', enabled: true },
];

export const DEFAULT_SPEED_FAN_TIME_LEVELS: SpeedFanLevelItem[] = [
  { value: 0, color: '#787B86', enabled: true },
  { value: 0.25, color: '#FF9800', enabled: true },
  { value: 0.382, color: '#00BCD4', enabled: true },
  { value: 0.5, color: '#4CAF50', enabled: true },
  { value: 0.618, color: '#089981', enabled: true },
  { value: 0.75, color: '#2962FF', enabled: true },
  { value: 1, color: '#787B86', enabled: true },
];

export const FIB_SPEED_RATIOS = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1];

/**
 * FibSpeedFan options matching TradingView Speed Resistance Fan
 */
export interface FibSpeedFanOptions extends DrawingOptions {
  priceLevels?: SpeedFanLevelItem[];
  timeLevels?: SpeedFanLevelItem[];
  showLeftLabels?: boolean;
  showRightLabels?: boolean;
  showTopLabels?: boolean;
  showBottomLabels?: boolean;
  useOneColor?: boolean;
  oneColor?: string;
  filled?: boolean;
  backgroundOpacity?: number;
  showGrid?: boolean;
  gridColor?: string;
  gridStyle?: 'solid' | 'dashed' | 'dotted';
  gridWidth?: number;
  reverse?: boolean;
  extendLines?: boolean;
  lineWidth?: number;
}

/**
 * FibSpeedFan - Speed Resistance Fan based on price and time ratios.
 *
 * Anchor 1: Origin/Pivot point
 * Anchor 2: Target point defining time (dX) and price (dY) bounds
 */
export class FibSpeedFan extends Drawing {
  readonly type = 'fib-speed-fan';

  protected static readonly REQUIRED_ANCHORS = 2;
  protected static readonly HIT_THRESHOLD = 6;

  private _fibOptions: FibSpeedFanOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<FibSpeedFanOptions> = {}
  ) {
    const {
      priceLevels,
      timeLevels,
      showLeftLabels,
      showRightLabels,
      showTopLabels,
      showBottomLabels,
      useOneColor,
      oneColor,
      filled,
      backgroundOpacity,
      showGrid,
      gridColor,
      gridStyle,
      gridWidth,
      reverse,
      extendLines,
      lineWidth,
      ...baseOptions
    } = options;

    super(id, anchors, style, baseOptions);

    const lw = lineWidth ?? (options as any)?.levelLineWidth ?? (style as any)?.lineWidth ?? (style as any)?.size ?? 1;
    this._style.lineWidth = lw;

    this._fibOptions = {
      ...this._options,
      priceLevels: priceLevels ?? DEFAULT_SPEED_FAN_PRICE_LEVELS.map(l => ({ ...l })),
      timeLevels: timeLevels ?? DEFAULT_SPEED_FAN_TIME_LEVELS.map(l => ({ ...l })),
      showLeftLabels: showLeftLabels ?? true,
      showRightLabels: showRightLabels ?? true,
      showTopLabels: showTopLabels ?? true,
      showBottomLabels: showBottomLabels ?? true,
      useOneColor: useOneColor ?? false,
      oneColor: oneColor ?? '#2962FF',
      filled: filled ?? true,
      backgroundOpacity: backgroundOpacity ?? 0.15,
      showGrid: showGrid ?? true,
      gridColor: gridColor ?? '#2962FF',
      gridStyle: gridStyle ?? 'solid',
      gridWidth: gridWidth ?? (options as any)?.lineWidth ?? lw,
      reverse: reverse ?? false,
      extendLines: extendLines ?? true,
      lineWidth: lw,
    };
  }

  get fibOptions(): FibSpeedFanOptions {
    return this._fibOptions;
  }

  setFibOptions(options: Partial<FibSpeedFanOptions>): void {
    this._fibOptions = { ...this._fibOptions, ...options };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= FibSpeedFan.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new FibSpeedFanPaneView(this)];
  }

  getControlPoints(viewport: Viewport): (Point | ControlPoint)[] {
    if (!this.isValid()) return [];
    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);
    const cps: Point[] = [];
    if (p1) cps.push({ x: p1.x, y: p1.y, index: 0 } as any);
    if (p2) cps.push({ x: p2.x, y: p2.y, index: 1 } as any);
    return cps;
  }

  computeGeometry(_viewport: Viewport): Geometry[] {
    return [];
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

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const rev = this._fibOptions.reverse ?? false;

    // Price rays
    const priceLevels = this._fibOptions.priceLevels ?? DEFAULT_SPEED_FAN_PRICE_LEVELS;
    for (const item of priceLevels) {
      if (item.enabled === false) continue;
      const v = rev ? 1 - item.value : item.value;
      const target = { x: p2.x, y: p1.y + v * dy };
      const extended = extendLineToViewport(p1, target, viewport.width, viewport.height, false, true);
      if (distanceToLineSegment(point, p1, extended.end) <= FibSpeedFan.HIT_THRESHOLD) {
        return true;
      }
    }

    // Time rays
    const timeLevels = this._fibOptions.timeLevels ?? DEFAULT_SPEED_FAN_TIME_LEVELS;
    for (const item of timeLevels) {
      if (item.enabled === false) continue;
      const v = rev ? 1 - item.value : item.value;
      const target = { x: p1.x + v * dx, y: p2.y };
      const extended = extendLineToViewport(p1, target, viewport.width, viewport.height, false, true);
      if (distanceToLineSegment(point, p1, extended.end) <= FibSpeedFan.HIT_THRESHOLD) {
        return true;
      }
    }

    // Main grid line p1 -> p2
    if (distanceToLineSegment(point, p1, p2) <= FibSpeedFan.HIT_THRESHOLD) return true;

    return false;
  }

  clone(newId: string): IDrawing {
    return new FibSpeedFan(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._fibOptions }
    );
  }

  static create(
    id: string,
    p1: Anchor,
    p2: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<FibSpeedFanOptions>
  ): FibSpeedFan {
    return new FibSpeedFan(id, [p1, p2], style, options);
  }
}
