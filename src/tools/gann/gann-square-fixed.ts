import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { distanceToLineSegment, type Geometry, type LineGeometry, type RectangleGeometry } from '../../core/geometry';
import { GannSquareFixedPaneView } from './gann-square-fixed-pane-view';

/**
 * Gann square levels (cardinal and ordinal)
 */
export const GANN_SQUARE_LEVELS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

/**
 * GannSquareFixed options
 */
export interface GannSquareFixedOptions extends DrawingOptions {
  squareSize?: number; // Size in price units
  levels?: number[];
  divisions?: number;
  showDiagonals?: boolean;
  showArcs?: boolean;
  showLabels?: boolean;
  showCardinalCross?: boolean;
  filled?: boolean;
}

/**
 * GannSquareFixed - Fixed-size Gann square for price/time analysis.
 *
 * Features:
 * - Single anchor point (center)
 * - Fixed square size based on price units
 * - Cardinal cross (vertical/horizontal)
 * - Ordinal cross (45-degree diagonals)
 * - Optional arcs at corners
 */
export class GannSquareFixed extends Drawing {
  readonly type = 'gann-square-fixed';

  protected static readonly REQUIRED_ANCHORS = 1;
  protected static readonly HIT_THRESHOLD = 5;

  private _gannOptions: GannSquareFixedOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<GannSquareFixedOptions> = {}
  ) {
    const { squareSize, levels, showDiagonals, showArcs, showLabels, filled, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._gannOptions = {
      ...this._options,
      squareSize: squareSize ?? 50, // Default 50 price units
      levels: levels ?? GANN_SQUARE_LEVELS,
      showDiagonals: showDiagonals ?? true,
      showArcs: showArcs ?? false,
      showLabels: showLabels ?? true,
      filled: filled ?? false,
    };
  }

  get gannOptions(): GannSquareFixedOptions {
    return this._gannOptions;
  }

  setGannOptions(options: Partial<GannSquareFixedOptions>): void {
    this._gannOptions = { ...this._gannOptions, ...options };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= GannSquareFixed.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new GannSquareFixedPaneView(this)];
  }

  /**
   * Get the square size based on price scale
   */
  getSquarePixelSize(viewport: Viewport): number {
    if (!this.isValid()) return 0;

    const center = this._anchors[0];
    const halfSize = (this._gannOptions.squareSize ?? 50) / 2;

    // Convert price range to pixels
    const topY = viewport.priceScale.priceToCoordinate(center.price + halfSize);
    const bottomY = viewport.priceScale.priceToCoordinate(center.price - halfSize);

    if (topY === null || topY === undefined || bottomY === null || bottomY === undefined) return 0;

    const size = Math.abs(bottomY - topY);
    return Number.isFinite(size) ? size : 0;
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const center = this.anchorToPixel(this._anchors[0], viewport);
    if (!center) return [];

    const geometries: Geometry[] = [];
    const halfSize = this.getSquarePixelSize(viewport) / 2;
    const levels = this._gannOptions.levels ?? GANN_SQUARE_LEVELS;

    const left = center.x - halfSize;
    const right = center.x + halfSize;
    const top = center.y - halfSize;
    const bottom = center.y + halfSize;
    const size = halfSize * 2;

    // Outer rectangle
    geometries.push({
      type: 'rectangle',
      topLeft: { x: left, y: top },
      width: size,
      height: size,
    } as RectangleGeometry);

    // Horizontal lines
    for (const level of levels) {
      if (level === 0 || level === 1) continue;
      const y = top + size * level;
      geometries.push({
        type: 'line',
        start: { x: left, y },
        end: { x: right, y },
      } as LineGeometry);
    }

    // Vertical lines
    for (const level of levels) {
      if (level === 0 || level === 1) continue;
      const x = left + size * level;
      geometries.push({
        type: 'line',
        start: { x, y: top },
        end: { x, y: bottom },
      } as LineGeometry);
    }

    // Diagonal lines (ordinal cross)
    if (this._gannOptions.showDiagonals) {
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

    const center = this.anchorToPixel(this._anchors[0], viewport);
    if (!center) return false;

    // Check hit on control points first
    for (const cp of this.getControlPoints(viewport)) {
      if (Math.hypot(point.x - cp.x, point.y - cp.y) <= 12) return true;
    }

    const halfSize = this.getSquarePixelSize(viewport) / 2;
    const threshold = GannSquareFixed.HIT_THRESHOLD;
    const divisions = this._gannOptions.divisions ?? 4;

    // Check perimeter square and concentric squares
    for (let i = 1; i <= divisions; i++) {
      const r = (halfSize * i) / divisions;
      const left = center.x - r;
      const right = center.x + r;
      const top = center.y - r;
      const bottom = center.y + r;

      if (point.x >= left - threshold && point.x <= right + threshold) {
        if (Math.abs(point.y - top) <= threshold || Math.abs(point.y - bottom) <= threshold) return true;
      }
      if (point.y >= top - threshold && point.y <= bottom + threshold) {
        if (Math.abs(point.x - left) <= threshold || Math.abs(point.x - right) <= threshold) return true;
      }
    }

    // Check cardinal cross (horizontal & vertical lines through center)
    if (this._gannOptions.showCardinalCross) {
      if (point.x >= center.x - halfSize - threshold && point.x <= center.x + halfSize + threshold && Math.abs(point.y - center.y) <= threshold) return true;
      if (point.y >= center.y - halfSize - threshold && point.y <= center.y + halfSize + threshold && Math.abs(point.x - center.x) <= threshold) return true;
    }

    // Check ordinal diagonals
    if (this._gannOptions.showDiagonals) {
      if (distanceToLineSegment(point, { x: center.x - halfSize, y: center.y - halfSize }, { x: center.x + halfSize, y: center.y + halfSize }) <= threshold) return true;
      if (distanceToLineSegment(point, { x: center.x - halfSize, y: center.y + halfSize }, { x: center.x + halfSize, y: center.y - halfSize }) <= threshold) return true;
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new GannSquareFixed(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._gannOptions }
    );
  }

  static create(
    id: string,
    center: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<GannSquareFixedOptions>
  ): GannSquareFixed {
    return new GannSquareFixed(id, [center], style, options);
  }
}
