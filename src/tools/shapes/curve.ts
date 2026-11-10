import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { type Geometry, type PolygonGeometry, distanceBetweenPoints } from '../../core/geometry';
import { CurvePaneView } from './curve-pane-view';

/**
 * Curve options
 */
export interface CurveOptions extends DrawingOptions {
  showControlLines?: boolean;
  resolution?: number;
}

/**
 * Curve - Quadratic Bezier curve with two endpoints and one control point.
 *
 * Features:
 * - Three anchor points: start, end, control
 * - Smooth curve using quadratic bezier interpolation
 * - Optional control line visualization
 */
export class Curve extends Drawing {
  readonly type = 'curve';

  protected static readonly REQUIRED_ANCHORS = 3;
  protected static readonly HIT_THRESHOLD = 5;

  private _curveOptions: CurveOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<CurveOptions> = {}
  ) {
    const { showControlLines, resolution, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._curveOptions = {
      ...this._options,
      showControlLines: showControlLines ?? false,
      resolution: resolution ?? 50,
    };
  }

  get curveOptions(): CurveOptions {
    return this._curveOptions;
  }

  setCurveOptions(options: Partial<CurveOptions>): void {
    this._curveOptions = { ...this._curveOptions, ...options };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= 2;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new CurvePaneView(this)];
  }

  /**
   * Get points along the bezier curve
   */
  getCurvePoints(viewport: Viewport): Point[] | null {
    if (!this.isValid()) return null;

    const start = this.anchorToPixel(this._anchors[0], viewport);
    const end = this.anchorToPixel(this._anchors[1], viewport);
    if (!start || !end) return null;

    if (this._anchors.length === 2) {
      return [start, end];
    }

    const throughPoint = this.anchorToPixel(this._anchors[2], viewport);
    if (!throughPoint) return null;

    // The third anchor is a point on the curve at its midpoint, rather than
    // an invisible Bezier control point. Derive the real control point so the
    // curve passes exactly through the user's anchor.
    const control = {
      x: 2 * throughPoint.x - (start.x + end.x) / 2,
      y: 2 * throughPoint.y - (start.y + end.y) / 2,
    };

    const resolution = this._curveOptions.resolution ?? 50;
    const points: Point[] = [];

    for (let i = 0; i <= resolution; i++) {
      const t = i / resolution;
      points.push(this.quadraticBezier(start, control, end, t));
    }

    return points;
  }

  /**
   * Get the control points for visualization
   */
  getControlPointsPixels(viewport: Viewport): { start: Point; control: Point; end: Point } | null {
    if (!this.isValid()) return null;

    const start = this.anchorToPixel(this._anchors[0], viewport);
    const end = this.anchorToPixel(this._anchors[1], viewport);
    if (!start || !end) return null;

    const control = this._anchors.length >= 3
      ? (() => {
          const throughPoint = this.anchorToPixel(this._anchors[2], viewport);
          return throughPoint ? {
            x: 2 * throughPoint.x - (start.x + end.x) / 2,
            y: 2 * throughPoint.y - (start.y + end.y) / 2,
          } : null;
        })()
      : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

    if (!control) return null;

    return { start, control, end };
  }

  getAnchorPointsPixels(viewport: Viewport): { start: Point; through: Point; end: Point } | null {
    if (!this.isValid()) return null;
    const start = this.anchorToPixel(this._anchors[0], viewport);
    const end = this.anchorToPixel(this._anchors[1], viewport);
    const through = this.anchorToPixel(this._anchors[2], viewport);
    if (!start || !through || !end) return null;
    return { start, through, end };
  }

  private quadraticBezier(p0: Point, p1: Point, p2: Point, t: number): Point {
    const mt = 1 - t;
    return {
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    };
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    const curvePoints = this.getCurvePoints(viewport);
    if (!curvePoints || curvePoints.length < 2) return [];

    const polygonGeometry: PolygonGeometry = {
      type: 'polygon',
      points: curvePoints,
      closed: false,
    };

    return [polygonGeometry];
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const curvePoints = this.getCurvePoints(viewport);
    if (!curvePoints || curvePoints.length < 2) return false;

    // Check distance to curve segments
    for (let i = 0; i < curvePoints.length - 1; i++) {
      const p1 = curvePoints[i];
      const p2 = curvePoints[i + 1];
      const dist = this.distanceToSegment(point, p1, p2);
      if (dist <= Curve.HIT_THRESHOLD) {
        return true;
      }
    }

    // Check control points
    const controlPts = this.getControlPointsPixels(viewport);
    if (controlPts) {
      if (distanceBetweenPoints(point, controlPts.start) <= Curve.HIT_THRESHOLD * 2) return true;
      const anchorPts = this.getAnchorPointsPixels(viewport);
      if (anchorPts && distanceBetweenPoints(point, anchorPts.through) <= Curve.HIT_THRESHOLD * 2) return true;
      if (distanceBetweenPoints(point, controlPts.end) <= Curve.HIT_THRESHOLD * 2) return true;
    }

    return false;
  }

  private distanceToSegment(point: Point, p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      return distanceBetweenPoints(point, p1);
    }

    let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const projection: Point = {
      x: p1.x + t * dx,
      y: p1.y + t * dy,
    };

    return distanceBetweenPoints(point, projection);
  }

  clone(newId: string): IDrawing {
    return new Curve(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._curveOptions }
    );
  }

  static create(
    id: string,
    start: Anchor,
    end: Anchor,
    control: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<CurveOptions>
  ): Curve {
    return new Curve(id, [start, end, control], style, options);
  }
}
