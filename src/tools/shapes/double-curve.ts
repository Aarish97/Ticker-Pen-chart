import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, ControlPoint, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { type Geometry, type PolygonGeometry, distanceBetweenPoints } from '../../core/geometry';
import { DoubleCurvePaneView } from './double-curve-pane-view';

/**
 * Double Curve options
 */
export interface DoubleCurveOptions extends DrawingOptions {
  showControlPoints?: boolean;
  resolution?: number;
}

/**
 * DoubleCurve - S-curve with two control points creating an S-shape.
 *
 * Features:
 * - Four anchor points: start, end, control1, control2
 * - Smooth S-curve using cubic bezier interpolation
 */
export class DoubleCurve extends Drawing {
  readonly type = 'double-curve';

  protected static readonly REQUIRED_ANCHORS = 4;
  protected static readonly HIT_THRESHOLD = 5;

  private _doubleCurveOptions: DoubleCurveOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<DoubleCurveOptions> = {}
  ) {
    const { showControlPoints, resolution, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._doubleCurveOptions = {
      ...this._options,
      showControlPoints: showControlPoints ?? false,
      resolution: resolution ?? 50,
    };
  }

  get doubleCurveOptions(): DoubleCurveOptions {
    return this._doubleCurveOptions;
  }

  setDoubleCurveOptions(options: Partial<DoubleCurveOptions>): void {
    this._doubleCurveOptions = { ...this._doubleCurveOptions, ...options };
    this.requestUpdate();
  }

  override setAnchors(anchors: Anchor[]): void {
    super.setAnchors(anchors);
  }

  getControlPoints(viewport: Viewport): (Point | ControlPoint)[] {
    if (!this.isValid()) return [];
    if (this._anchors.length >= 4) {
      const cps: Point[] = [];
      this._anchors.forEach((anchor, idx) => {
        const pt = this.anchorToPixel(anchor, viewport);
        if (pt) {
          cps.push({ x: pt.x, y: pt.y, index: idx } as any);
        }
      });
      return cps;
    }
    const anchorPts = this.getAnchorPointsPixels(viewport);
    if (!anchorPts) return [];
    return [
      { x: anchorPts.start.x, y: anchorPts.start.y, index: 0 } as any,
      { x: anchorPts.end.x, y: anchorPts.end.y, index: 1 } as any,
      { x: anchorPts.through1.x, y: anchorPts.through1.y, index: 2 } as any,
      { x: anchorPts.through2.x, y: anchorPts.through2.y, index: 3 } as any,
    ];
  }

  isValid(): boolean {
    return this._anchors.length >= 2;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new DoubleCurvePaneView(this)];
  }

  /**
   * Get the control points for visualization
   */
  getControlPointsPixels(viewport: Viewport): { start: Point; control1: Point; control2: Point; end: Point } | null {
    if (!this.isValid()) return null;

    const start = this.anchorToPixel(this._anchors[0], viewport);
    const end = this.anchorToPixel(this._anchors[1], viewport);
    if (!start || !end) return null;

    let control1: Point | null = null;
    let control2: Point | null = null;

    if (this._anchors.length >= 4) {
      const controls = this.getBezierControls(viewport);
      if (controls) {
        control1 = controls.control1;
        control2 = controls.control2;
      }
    } else if (this._anchors.length === 3) {
      const through1 = this.anchorToPixel(this._anchors[2], viewport);
      if (through1) {
        const dx = through1.x - (start.x * 2 + end.x) / 3;
        const dy = through1.y - (start.y * 2 + end.y) / 3;
        const through2 = {
          x: (start.x + end.x * 2) / 3 - dx,
          y: (start.y + end.y * 2) / 3 - dy,
        };
        const a = {
          x: (27 * through1.x - 8 * start.x - end.x) / 6,
          y: (27 * through1.y - 8 * start.y - end.y) / 6,
        };
        const b = {
          x: (27 * through2.x - start.x - 8 * end.x) / 6,
          y: (27 * through2.y - start.y - 8 * end.y) / 6,
        };
        control1 = { x: (2 * a.x - b.x) / 3, y: (2 * a.y - b.y) / 3 };
        control2 = { x: (2 * b.x - a.x) / 3, y: (2 * b.y - a.y) / 3 };
      }
    } else {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const t1 = { x: start.x + dx / 3, y: start.y + dy / 3 + dy * 0.25 };
      const t2 = { x: start.x + 2 * dx / 3, y: start.y + 2 * dy / 3 - dy * 0.25 };
      const a = {
        x: (27 * t1.x - 8 * start.x - end.x) / 6,
        y: (27 * t1.y - 8 * start.y - end.y) / 6,
      };
      const b = {
        x: (27 * t2.x - start.x - 8 * end.x) / 6,
        y: (27 * t2.y - start.y - 8 * end.y) / 6,
      };
      control1 = { x: (2 * a.x - b.x) / 3, y: (2 * a.y - b.y) / 3 };
      control2 = { x: (2 * b.x - a.x) / 3, y: (2 * b.y - a.y) / 3 };
    }

    if (!control1 || !control2) return null;

    return { start, control1, control2, end };
  }

  /** Convert the two visible through-points (at 1/3 and 2/3) into cubic controls. */
  private getBezierControls(viewport: Viewport): { control1: Point; control2: Point } | null {
    const start = this.anchorToPixel(this._anchors[0], viewport);
    const end = this.anchorToPixel(this._anchors[1], viewport);
    const through1 = this.anchorToPixel(this._anchors[2], viewport);
    const through2 = this.anchorToPixel(this._anchors[3], viewport);
    if (!start || !end || !through1 || !through2) return null;

    const a = {
      x: (27 * through1.x - 8 * start.x - end.x) / 6,
      y: (27 * through1.y - 8 * start.y - end.y) / 6,
    };
    const b = {
      x: (27 * through2.x - start.x - 8 * end.x) / 6,
      y: (27 * through2.y - start.y - 8 * end.y) / 6,
    };
    return {
      control1: { x: (2 * a.x - b.x) / 3, y: (2 * a.y - b.y) / 3 },
      control2: { x: (2 * b.x - a.x) / 3, y: (2 * b.y - a.y) / 3 },
    };
  }

  getAnchorPointsPixels(viewport: Viewport): { start: Point; through1: Point; through2: Point; end: Point } | null {
    if (!this.isValid()) return null;
    const start = this.anchorToPixel(this._anchors[0], viewport);
    const end = this.anchorToPixel(this._anchors[1], viewport);
    if (!start || !end) return null;

    let through1 = this._anchors[2] ? this.anchorToPixel(this._anchors[2], viewport) : null;
    let through2 = this._anchors[3] ? this.anchorToPixel(this._anchors[3], viewport) : null;

    if (!through1 || !through2) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (!through1) through1 = { x: start.x + dx / 3, y: start.y + dy / 3 + dy * 0.25 };
      if (!through2) through2 = { x: start.x + 2 * dx / 3, y: start.y + 2 * dy / 3 - dy * 0.25 };
    }

    return { start, through1, through2, end };
  }

  /**
   * Get points along the S-curve
   */
  getCurvePoints(viewport: Viewport): Point[] | null {
    if (!this.isValid()) return null;

    const controlPts = this.getControlPointsPixels(viewport);
    if (!controlPts) return null;

    const { start, control1, control2, end } = controlPts;

    if (this._anchors.length === 2) {
      return [start, end];
    }

    const resolution = this._doubleCurveOptions.resolution ?? 50;
    const points: Point[] = [];

    for (let i = 0; i <= resolution; i++) {
      const t = i / resolution;
      points.push(this.cubicBezier(start, control1, control2, end, t));
    }

    return points;
  }

  private cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    return {
      x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
      y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
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
      if (dist <= DoubleCurve.HIT_THRESHOLD) {
        return true;
      }
    }

    // Check main anchor points
    const mainPts = this.getControlPointsPixels(viewport);
    if (mainPts) {
      if (distanceBetweenPoints(point, mainPts.start) <= DoubleCurve.HIT_THRESHOLD * 2) return true;
      const anchorPts = this.getAnchorPointsPixels(viewport);
      if (anchorPts && distanceBetweenPoints(point, anchorPts.through1) <= DoubleCurve.HIT_THRESHOLD * 2) return true;
      if (anchorPts && distanceBetweenPoints(point, anchorPts.through2) <= DoubleCurve.HIT_THRESHOLD * 2) return true;
      if (distanceBetweenPoints(point, mainPts.end) <= DoubleCurve.HIT_THRESHOLD * 2) return true;
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
    return new DoubleCurve(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._doubleCurveOptions }
    );
  }

  static create(
    id: string,
    start: Anchor,
    end: Anchor,
    control1: Anchor,
    control2: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<DoubleCurveOptions>
  ): DoubleCurve {
    return new DoubleCurve(id, [start, end, control1, control2], style, options);
  }
}
