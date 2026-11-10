import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, ControlPoint, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { type Geometry, distanceBetweenPoints, distanceToLineSegment } from '../../core/geometry';
import { FibSpiralPaneView } from './fib-spiral-pane-view';

/**
 * Golden ratio for spiral: (1 + sqrt(5)) / 2
 */
export const GOLDEN_RATIO = 1.618033988749895;

/**
 * FibSpiral options matching TradingView settings
 */
export interface FibSpiralOptions extends DrawingOptions {
  rotations?: number;
  counterclockwise?: boolean;
  clockwise?: boolean;
  showTrendline?: boolean;
  trendlineColor?: string;
  trendlineWidth?: number;
  trendlineStyle?: 'solid' | 'dashed' | 'dotted';
  extendTrendline?: boolean;
  lineColor?: string;
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

/**
 * FibSpiral - Golden logarithmic spiral based on Fibonacci ratio.
 *
 * Anchor 1: Center/Origin of the spiral
 * Anchor 2: Reference point on the spiral (reached after 1 full 360-degree rotation)
 */
export class FibSpiral extends Drawing {
  readonly type = 'fib-spiral';

  protected static readonly REQUIRED_ANCHORS = 2;
  protected static readonly HIT_THRESHOLD = 8;

  private _fibOptions: FibSpiralOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<FibSpiralOptions> = {}
  ) {
    const {
      rotations,
      counterclockwise,
      clockwise,
      showTrendline,
      trendlineColor,
      trendlineWidth,
      trendlineStyle,
      extendTrendline,
      lineColor,
      lineWidth,
      lineStyle,
      ...baseOptions
    } = options;

    super(id, anchors, style, baseOptions);

    const isCounter = counterclockwise ?? (clockwise !== undefined ? !clockwise : false);
    const lw = options.lineWidth ?? options.trendlineWidth ?? (style as any)?.lineWidth ?? (style as any)?.size ?? 2;
    this._style.lineWidth = lw;

    this._fibOptions = {
      ...this._options,
      showTrendline: showTrendline ?? options.showTrendline ?? true,
      trendlineColor: options.trendlineColor ?? '#787B86',
      trendlineWidth: options.trendlineWidth ?? (options as any)?.lineWidth ?? lw,
      trendlineStyle: options.trendlineStyle ?? 'dashed',
      extendTrendline: options.extendTrendline ?? true,
      counterclockwise: options.counterclockwise ?? false,
      clockwise: options.clockwise ?? true,
      rotations: options.rotations ?? 8,
      lineColor: lineColor ?? options.lineColor ?? (style as any)?.lineColor ?? (style as any)?.color ?? '#2962FF',
      lineWidth: lw,
      lineStyle: options.lineStyle ?? 'solid',
    };
  }

  get fibOptions(): FibSpiralOptions {
    return this._fibOptions;
  }

  setFibOptions(options: Partial<FibSpiralOptions>): void {
    if (options.counterclockwise !== undefined) {
      options.clockwise = !options.counterclockwise;
    } else if (options.clockwise !== undefined) {
      options.counterclockwise = !options.clockwise;
    }
    this._fibOptions = { ...this._fibOptions, ...options };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= FibSpiral.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new FibSpiralPaneView(this)];
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

  /**
   * Generate points along the Golden Logarithmic Spiral matching TradingView.
   * Originates smoothly out of the center Anchor 1, sweeps through Anchor 2 at theta = 2*pi,
   * and expands outwards across the chart for full rotations.
   */
  getSpiralPoints(
    startPoint: Point,
    referencePoint: Point,
    rotations: number = 8,
    counterclockwise: boolean = false,
    maxRadius?: number
  ): Point[] {
    const points: Point[] = [];
    const L = distanceBetweenPoints(startPoint, referencePoint);
    if (L <= 0) return points;

    const baseAngle = Math.atan2(referencePoint.y - startPoint.y, referencePoint.x - startPoint.x);
    // Growth factor b per radian: ln(Phi) / (pi / 2)
    const b = Math.log(GOLDEN_RATIO) / (Math.PI / 2);

    const insideTheta = 4 * Math.PI; // Inward decay to sub-pixel radius at center
    const targetRotations = Math.max(rotations, 8);
    const totalTheta = targetRotations * 2 * Math.PI + insideTheta;
    const segments = Math.max(800, Math.ceil((targetRotations + 2) * 150));

    for (let i = 0; i <= segments; i++) {
      const theta = -insideTheta + (i / segments) * totalTheta;
      const r = L * Math.exp(b * (theta - 2 * Math.PI));

      if (maxRadius && r > maxRadius) {
        const angle = baseAngle + (counterclockwise ? -theta : theta);
        points.push({
          x: startPoint.x + r * Math.cos(angle),
          y: startPoint.y + r * Math.sin(angle),
        });
        break;
      }

      // In HTML5 Canvas coords: angle increases downward (+theta), so for standard clockwise/counterclockwise:
      const angle = baseAngle + (counterclockwise ? -theta : theta);
      points.push({
        x: startPoint.x + r * Math.cos(angle),
        y: startPoint.y + r * Math.sin(angle),
      });
    }

    return points;
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
      if (Math.hypot(point.x - cp.x, point.y - cp.y) <= 12) return true;
    }

    // Check trendline
    if (this._fibOptions.showTrendline !== false) {
      if (distanceToLineSegment(point, p1, p2) <= FibSpiral.HIT_THRESHOLD) return true;
    }

    const counter = this._fibOptions.counterclockwise ?? false;
    const spiralPoints = this.getSpiralPoints(
      p1,
      p2,
      this._fibOptions.rotations ?? 4,
      counter
    );

    // Check distance to spiral segments
    for (let i = 0; i < spiralPoints.length - 1; i++) {
      if (distanceToLineSegment(point, spiralPoints[i], spiralPoints[i + 1]) <= FibSpiral.HIT_THRESHOLD) {
        return true;
      }
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new FibSpiral(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._fibOptions }
    );
  }

  static create(
    id: string,
    center: Anchor,
    reference: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<FibSpiralOptions>
  ): FibSpiral {
    return new FibSpiral(id, [center, reference], style, options);
  }
}
