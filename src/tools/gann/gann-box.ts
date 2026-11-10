import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { distanceToLineSegment, type Geometry, type LineGeometry, type RectangleGeometry } from '../../core/geometry';
import { GannBoxPaneView } from './gann-box-pane-view';

/**
 * Gann price levels
 */
export const GANN_LEVELS = [0, 0.25, 0.333, 0.5, 0.667, 0.75, 1];
export const GANN_BOX_PRICE_LEVELS = GANN_LEVELS;
export const GANN_BOX_TIME_LEVELS = GANN_LEVELS;

/**
 * GannBox options
 */
export interface GannBoxOptions extends DrawingOptions {
  priceLevels?: number[];
  timeLevels?: number[];
  showDiagonals?: boolean;
  showFanLines?: boolean;
  filled?: boolean;
}

/**
 * GannBox - Gann grid/box for price and time analysis.
 *
 * Features:
 * - Two anchor points (corners)
 * - Horizontal price levels
 * - Vertical time levels
 * - Optional diagonal lines
 */
export class GannBox extends Drawing {
  readonly type = 'gann-box';

  protected static readonly REQUIRED_ANCHORS = 2;
  protected static readonly HIT_THRESHOLD = 5;

  private _gannOptions: GannBoxOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<GannBoxOptions> = {}
  ) {
    const { priceLevels, timeLevels, showDiagonals, filled, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._gannOptions = {
      ...this._options,
      priceLevels: priceLevels ?? GANN_LEVELS,
      timeLevels: timeLevels ?? GANN_LEVELS,
      showDiagonals: showDiagonals ?? true,
      filled: filled ?? false,
    };
  }

  get gannOptions(): GannBoxOptions {
    return this._gannOptions;
  }

  setGannOptions(options: Partial<GannBoxOptions>): void {
    this._gannOptions = { ...this._gannOptions, ...options };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= GannBox.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new GannBoxPaneView(this)];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);

    if (!p1 || !p2) return [];

    const geometries: Geometry[] = [];
    const priceLevels = this._gannOptions.priceLevels ?? GANN_LEVELS;
    const timeLevels = this._gannOptions.timeLevels ?? GANN_LEVELS;

    const left = Math.min(p1.x, p2.x);
    const right = Math.max(p1.x, p2.x);
    const top = Math.min(p1.y, p2.y);
    const bottom = Math.max(p1.y, p2.y);
    const width = right - left;
    const height = bottom - top;

    // Outer rectangle
    geometries.push({
      type: 'rectangle',
      topLeft: { x: left, y: top },
      width,
      height,
    } as RectangleGeometry);

    // Horizontal lines (price levels)
    for (const level of priceLevels) {
      if (level === 0 || level === 1) continue;
      const y = top + height * level;
      geometries.push({
        type: 'line',
        start: { x: left, y },
        end: { x: right, y },
      } as LineGeometry);
    }

    // Vertical lines (time levels)
    for (const level of timeLevels) {
      if (level === 0 || level === 1) continue;
      const x = left + width * level;
      geometries.push({
        type: 'line',
        start: { x, y: top },
        end: { x, y: bottom },
      } as LineGeometry);
    }

    // Diagonal lines
    if (this._gannOptions.showDiagonals) {
      // Main diagonals
      geometries.push({
        type: 'line',
        start: { x: left, y: top },
        end: { x: right, y: bottom },
      } as LineGeometry);

      geometries.push({
        type: 'line',
        start: { x: left, y: bottom },
        end: { x: right, y: top },
      } as LineGeometry);
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

    const left = Math.min(p1.x, p2.x);
    const right = Math.max(p1.x, p2.x);
    const top = Math.min(p1.y, p2.y);
    const bottom = Math.max(p1.y, p2.y);
    const threshold = GannBox.HIT_THRESHOLD;

    // Check perimeter lines
    if (point.x >= left - threshold && point.x <= right + threshold) {
      if (Math.abs(point.y - top) <= threshold || Math.abs(point.y - bottom) <= threshold) return true;
    }
    if (point.y >= top - threshold && point.y <= bottom + threshold) {
      if (Math.abs(point.x - left) <= threshold || Math.abs(point.x - right) <= threshold) return true;
    }

    // Check diagonal fan lines if enabled
    if (this._gannOptions.showFanLines ?? true) {
      if (distanceToLineSegment(point, { x: left, y: top }, { x: right, y: bottom }) <= threshold) return true;
      if (distanceToLineSegment(point, { x: left, y: bottom }, { x: right, y: top }) <= threshold) return true;
    }

    // Check price level lines
    const priceLevels = this._gannOptions.priceLevels ?? GANN_BOX_PRICE_LEVELS;
    for (const level of priceLevels) {
      const isEnabled = typeof level === 'object' && level !== null ? (level as any).enabled !== false : true;
      if (!isEnabled) continue;
      const val = typeof level === 'number' ? level : ((level as any).value ?? 0);
      const y = top + (bottom - top) * val;
      if (point.x >= left - threshold && point.x <= right + threshold && Math.abs(point.y - y) <= threshold) {
        return true;
      }
    }

    // Check time level lines
    const timeLevels = this._gannOptions.timeLevels ?? GANN_BOX_TIME_LEVELS;
    for (const level of timeLevels) {
      const isEnabled = typeof level === 'object' && level !== null ? (level as any).enabled !== false : true;
      if (!isEnabled) continue;
      const val = typeof level === 'number' ? level : ((level as any).value ?? 0);
      const x = left + (right - left) * val;
      if (point.y >= top - threshold && point.y <= bottom + threshold && Math.abs(point.x - x) <= threshold) {
        return true;
      }
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new GannBox(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._gannOptions }
    );
  }

  static create(
    id: string,
    corner1: Anchor,
    corner2: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<GannBoxOptions>
  ): GannBox {
    return new GannBox(id, [corner1, corner2], style, options);
  }
}
