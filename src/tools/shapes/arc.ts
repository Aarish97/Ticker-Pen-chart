import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { type Geometry, distanceToLineSegment } from '../../core/geometry';
import { ArcPaneView } from './arc-pane-view';

/**
 * Arc options
 */
export interface ArcOptions extends DrawingOptions {
  filled?: boolean;
}

/**
 * Arc - A circular arc defined by three points.
 *
 * Features:
 * - Three anchor points: Start Point, End Point, and Curvature Point (lies on the arc)
 * - Optional fill (pie slice)
 * - Falls back to a straight line if points are collinear
 */
export class Arc extends Drawing {
  readonly type = 'arc';

  protected static readonly REQUIRED_ANCHORS = 3;
  protected static readonly HIT_THRESHOLD = 5;

  private _arcOptions: ArcOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<ArcOptions> = {}
  ) {
    const { filled, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._arcOptions = {
      ...this._options,
      filled: filled ?? true,
    };
  }

  get arcOptions(): ArcOptions {
    return this._arcOptions;
  }

  setArcOptions(options: Partial<ArcOptions>): void {
    this._arcOptions = { ...this._arcOptions, ...options };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= 2;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new ArcPaneView(this)];
  }

  /**
   * Get arc parameters from the three anchor points
   */
  getArcParams(viewport: Viewport): {
    center: Point;
    radius: number;
    startAngle: number;
    endAngle: number;
    anticlockwise: boolean;
    isCollinear?: boolean;
  } | null {
    if (!this.isValid()) return null;

    const startPoint = this.anchorToPixel(this._anchors[0], viewport);
    const endPoint = this.anchorToPixel(this._anchors[1], viewport);

    if (!startPoint || !endPoint) return null;

    if (this._anchors.length === 2) {
      return {
        center: startPoint,
        radius: 0,
        startAngle: 0,
        endAngle: 0,
        anticlockwise: false,
        isCollinear: true,
      };
    }

    const midPoint = this.anchorToPixel(this._anchors[2], viewport);
    if (!midPoint) return null;

    const x1 = startPoint.x, y1 = startPoint.y;
    const x2 = endPoint.x, y2 = endPoint.y;
    const x3 = midPoint.x, y3 = midPoint.y;

    const det = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
    if (Math.abs(det) < 0.001) {
      return {
        center: startPoint,
        radius: 0,
        startAngle: 0,
        endAngle: 0,
        anticlockwise: false,
        isCollinear: true,
      };
    }

    const sq1 = x1 * x1 + y1 * y1;
    const sq2 = x2 * x2 + y2 * y2;
    const sq3 = x3 * x3 + y3 * y3;

    const cx = ((sq2 - sq1) * (y3 - y1) - (y2 - y1) * (sq3 - sq1)) / (2 * det);
    const cy = ((x2 - x1) * (sq3 - sq1) - (sq2 - sq1) * (x3 - x1)) / (2 * det);
    const center = { x: cx, y: cy };

    const dx = x1 - cx;
    const dy = y1 - cy;
    const radius = Math.sqrt(dx * dx + dy * dy);

    const startAngle = Math.atan2(y1 - cy, x1 - cx);
    const endAngle = Math.atan2(y2 - cy, x2 - cx);
    const midAngle = Math.atan2(y3 - cy, x3 - cx);

    // Determine direction
    let diffB = (endAngle - startAngle) % (Math.PI * 2);
    if (diffB < 0) diffB += Math.PI * 2;

    let diffC = (midAngle - startAngle) % (Math.PI * 2);
    if (diffC < 0) diffC += Math.PI * 2;

    const anticlockwise = diffC > diffB;

    return { center, radius, startAngle, endAngle, anticlockwise };
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    const params = this.getArcParams(viewport);
    if (!params) return [];

    if (params.isCollinear) {
      const startPoint = this.anchorToPixel(this._anchors[0], viewport);
      const endPoint = this.anchorToPixel(this._anchors[1], viewport);
      if (!startPoint || !endPoint) return [];
      return [{
        type: 'line',
        start: startPoint,
        end: endPoint,
      } as any];
    }

    return [{
      type: 'arc',
      center: params.center,
      radius: params.radius,
      startAngle: params.startAngle,
      endAngle: params.endAngle,
      counterClockwise: params.anticlockwise,
    }];
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const params = this.getArcParams(viewport);
    if (!params) return false;

    const startPoint = this.anchorToPixel(this._anchors[0], viewport);
    const endPoint = this.anchorToPixel(this._anchors[1], viewport);
    if (!startPoint || !endPoint) return false;

    if (params.isCollinear) {
      const dist = distanceToLineSegment(point, startPoint, endPoint);
      return dist <= Arc.HIT_THRESHOLD;
    }

    const { center, radius, startAngle, endAngle, anticlockwise } = params;

    // Check distance from center
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Check if within radius range
    const innerRadius = radius - Arc.HIT_THRESHOLD;
    const outerRadius = radius + Arc.HIT_THRESHOLD;

    if (this._arcOptions.filled) {
      // For filled arc (pie slice), check if within the sector
      if (dist > radius + Arc.HIT_THRESHOLD) return false;
    } else {
      // For unfilled arc, check if near the arc line
      if (dist < innerRadius || dist > outerRadius) return false;
    }

    // Check if angle is within arc range
    const angle = Math.atan2(dy, dx);

    let diffB = (endAngle - startAngle) % (Math.PI * 2);
    if (diffB < 0) diffB += Math.PI * 2;

    let diffAngle = (angle - startAngle) % (Math.PI * 2);
    if (diffAngle < 0) diffAngle += Math.PI * 2;

    if (anticlockwise) {
      return diffAngle >= diffB;
    } else {
      return diffAngle <= diffB;
    }
  }

  clone(newId: string): IDrawing {
    return new Arc(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._arcOptions }
    );
  }

  static create(
    id: string,
    start: Anchor,
    end: Anchor,
    curvature: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<ArcOptions>
  ): Arc {
    return new Arc(id, [start, end, curvature], style, options);
  }
}
