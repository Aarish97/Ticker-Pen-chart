import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing, ControlPoint } from '../../core/types';
import { type Geometry, type LineGeometry, distanceToLineSegment } from '../../core/geometry';
import { FlatTopBottomPaneView } from './flat-top-bottom-pane-view';

/**
 * FlatTopBottom options
 */
export interface FlatTopBottomOptions extends DrawingOptions {
  filled?: boolean;
  extendLines?: boolean;
  flatPosition?: 'top' | 'bottom'; // Which line is flat (horizontal)
}

/**
 * FlatTopBottom - A channel where one side is flat (horizontal) and the other follows a trend.
 *
 * Features:
 * - Four anchor points: two for the trend line, two side anchor points for the flat line level
 * - One horizontal line (flat)
 * - One diagonal line (trend)
 * - Optional fill between lines
 * - Optional line extensions
 */
export class FlatTopBottom extends Drawing {
  readonly type = 'flat-top-bottom';

  protected static readonly REQUIRED_ANCHORS = 3;
  protected static readonly HIT_THRESHOLD = 5;

  private _channelOptions: FlatTopBottomOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<FlatTopBottomOptions> = {}
  ) {
    const { filled, extendLines, flatPosition, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._channelOptions = {
      ...this._options,
      filled: filled ?? true,
      extendLines: extendLines ?? false,
      flatPosition: flatPosition ?? 'top',
    };
  }

  get channelOptions(): FlatTopBottomOptions {
    return this._channelOptions;
  }

  setChannelOptions(options: Partial<FlatTopBottomOptions>): void {
    this._channelOptions = { ...this._channelOptions, ...options };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= FlatTopBottom.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new FlatTopBottomPaneView(this)];
  }

  override getControlPoints(viewport: Viewport): ControlPoint[] {
    if (this._anchors.length < 2) return [];

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);
    if (!p1 || !p2) return [];

    // Trend line (first line) 2 endpoints
    const points: ControlPoint[] = [
      { index: 0, x: p1.x, y: p1.y, radius: 5 },
      { index: 1, x: p2.x, y: p2.y, radius: 5 },
    ];

    if ((this as any)._isDrawingEarly === true || this._anchors.length < 4) {
      return points;
    }

    // Flat line (second line) 2 side anchor points
    let flatY: number | null = null;
    let flatStartX = p1.x;
    let flatEndX = p2.x;

    if (this._anchors.length >= 4) {
      const p3 = this.anchorToPixel(this._anchors[2], viewport);
      const p4 = this.anchorToPixel(this._anchors[3], viewport);
      flatY = p3?.y ?? p4?.y ?? null;
      if (p3) flatStartX = p3.x;
      if (p4) flatEndX = p4.x;
    } else if (this._anchors.length >= 3) {
      const p3 = this.anchorToPixel(this._anchors[2], viewport);
      flatY = p3?.y ?? null;
      if (p3) flatStartX = p3.x;
    }

    if (flatY !== null && Number.isFinite(flatY)) {
      // Left side anchor on second line
      points.push({ index: 2, x: flatStartX, y: flatY, radius: 5 });
      // Right side anchor on second line
      points.push({ index: 3, x: flatEndX, y: flatY, radius: 5 });
    }

    return points;
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);
    const p3 = this._anchors.length >= 3 ? this.anchorToPixel(this._anchors[2], viewport) : null;
    const p4 = this._anchors.length >= 4 ? this.anchorToPixel(this._anchors[3], viewport) : null;

    if (!p1 || !p2 || (!p3 && !p4)) return [];

    const geometries: Geometry[] = [];

    // Trend line (p1 to p2)
    geometries.push({
      type: 'line',
      start: p1,
      end: p2,
      extendLeft: this._channelOptions.extendLines,
      extendRight: this._channelOptions.extendLines,
    } as LineGeometry);

    // Flat line (horizontal at flatY, spanning from flatStartX to flatEndX)
    const flatY = p3?.y ?? p4?.y ?? p1.y;
    const flatStartX = p4 ? (p3 ? p3.x : p1.x) : p1.x;
    const flatEndX = p4 ? p4.x : p2.x;
    const flatStart = { x: flatStartX, y: flatY };
    const flatEnd = { x: flatEndX, y: flatY };

    geometries.push({
      type: 'line',
      start: flatStart,
      end: flatEnd,
      extendLeft: this._channelOptions.extendLines,
      extendRight: this._channelOptions.extendLines,
    } as LineGeometry);

    return geometries;
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);
    const p3 = this._anchors.length >= 3 ? this.anchorToPixel(this._anchors[2], viewport) : null;
    const p4 = this._anchors.length >= 4 ? this.anchorToPixel(this._anchors[3], viewport) : null;

    if (!p1 || !p2 || (!p3 && !p4)) return false;

    // Check hit on control points first
    for (const cp of this.getControlPoints(viewport)) {
      if (Math.hypot(point.x - cp.x, point.y - cp.y) <= 12) return true;
    }

    // Check trend line
    if (distanceToLineSegment(point, p1, p2) <= FlatTopBottom.HIT_THRESHOLD) return true;

    // Check flat line
    const flatY = p3?.y ?? p4?.y ?? p1.y;
    const flatStartX = p4 ? (p3 ? p3.x : p1.x) : p1.x;
    const flatEndX = p4 ? p4.x : p2.x;
    const flatStart = { x: flatStartX, y: flatY };
    const flatEnd = { x: flatEndX, y: flatY };
    if (distanceToLineSegment(point, flatStart, flatEnd) <= FlatTopBottom.HIT_THRESHOLD) return true;

    return false;
  }

  clone(newId: string): IDrawing {
    return new FlatTopBottom(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._channelOptions }
    );
  }

  static create(
    id: string,
    start: Anchor,
    end: Anchor,
    flatLevel: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<FlatTopBottomOptions>
  ): FlatTopBottom {
    return new FlatTopBottom(id, [start, end, flatLevel], style, options);
  }
}

