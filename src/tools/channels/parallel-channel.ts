import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing, ControlPoint } from '../../core/types';
import { type Geometry, type LineGeometry, distanceToLineSegment } from '../../core/geometry';
import { ParallelChannelPaneView } from './parallel-channel-pane-view';

/**
 * ParallelChannel options
 */
export interface ParallelChannelOptions extends DrawingOptions {
  filled?: boolean;
  showMiddleLine?: boolean;
  showMedianLine?: boolean;
  extendLines?: boolean;
}

/**
 * ParallelChannel - Two parallel lines forming a channel.
 *
 * Supports both 3-anchor lightweight-charts and 6-anchor Ticker Pen modes.
 *
 * Anchors in 6-anchor mode:
 * - anchors[0] (P1): Baseline start point
 * - anchors[1] (P2): Baseline end point
 * - anchors[2] (P3): Parallel line midpoint / width point
 * - anchors[3] (P4): Parallel line start point
 * - anchors[4] (P5): Parallel line end point
 * - anchors[5] (P6): Baseline midpoint
 */
export class ParallelChannel extends Drawing {
  readonly type = 'parallel-channel';

  protected static readonly REQUIRED_ANCHORS = 3;
  protected static readonly HIT_THRESHOLD = 6;

  private _channelOptions: ParallelChannelOptions;
  private _dragOffsetDist: number | null = null;

  setState(state: any): void {
    super.setState(state);
    if (state !== 'editing') {
      this._dragOffsetDist = null;
    }
  }

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<ParallelChannelOptions> = {}
  ) {
    const { filled, showMiddleLine, extendLines, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._channelOptions = {
      ...this._options,
      filled: filled ?? true,
      showMiddleLine: showMiddleLine ?? true,
      extendLines: extendLines ?? false,
    };
  }

  get channelOptions(): ParallelChannelOptions {
    return this._channelOptions;
  }

  setChannelOptions(options: Partial<ParallelChannelOptions>): void {
    this._channelOptions = { ...this._channelOptions, ...options };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= 3;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new ParallelChannelPaneView(this)];
  }

  getControlPoints(viewport: Viewport): ControlPoint[] {
    if (this._anchors.length < 2) return [];

    const points: ControlPoint[] = [];
    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);

    if (!p1 || !p2) return [];

    points.push({ index: 0, x: p1.x, y: p1.y, radius: 6 });
    points.push({ index: 1, x: p2.x, y: p2.y, radius: 6 });

    let p1Parallel: Point | null = null;
    let p2Parallel: Point | null = null;

    if (this._anchors.length >= 6) {
      p1Parallel = this.anchorToPixel(this._anchors[3], viewport);
      p2Parallel = this.anchorToPixel(this._anchors[4], viewport);
    } else if (this._anchors.length >= 3) {
      const p3 = this.anchorToPixel(this._anchors[2], viewport);
      if (p3) {
        const offset = this.calculateOffset(p1, p2, p3);
        p1Parallel = { x: p1.x + offset.x, y: p1.y + offset.y };
        p2Parallel = { x: p2.x + offset.x, y: p2.y + offset.y };
      }
    }

    if (p1Parallel && p2Parallel) {
      points.push({ index: 3, x: p1Parallel.x, y: p1Parallel.y, radius: 6 });
      points.push({ index: 4, x: p2Parallel.x, y: p2Parallel.y, radius: 6 });
    }

    // Baseline midpoint: exactly on the baseline, in box shape
    const baselineMidX = (p1.x + p2.x) / 2;
    const baselineMidY = (p1.y + p2.y) / 2;
    points.push({ index: 5, x: baselineMidX, y: baselineMidY, radius: 6, shape: 'rect' });

    // Parallel line midpoint: exactly on the parallel line, in box shape
    if (p1Parallel && p2Parallel) {
      const parallelMidX = (p1Parallel.x + p2Parallel.x) / 2;
      const parallelMidY = (p1Parallel.y + p2Parallel.y) / 2;
      points.push({ index: 2, x: parallelMidX, y: parallelMidY, radius: 6, shape: 'rect' });
    }

    return points;
  }

  private updateParallelAnchors(viewport: Viewport, dist: number): void {
    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);
    if (!p1 || !p2) return;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const ny = dx / len;

    const p1P_y = p1.y + ny * dist;
    const p2P_y = p2.y + ny * dist;

    const p1PPrice = viewport.priceScale.coordinateToPrice(p1P_y);
    const p2PPrice = viewport.priceScale.coordinateToPrice(p2P_y);

    if (p1PPrice !== null && p2PPrice !== null) {
      this._anchors[3] = { time: this._anchors[0].time, price: p1PPrice };
      this._anchors[4] = { time: this._anchors[1].time, price: p2PPrice };
      
      const midTime = viewport.timeScale.coordinateToTime((p1.x + p2.x) / 2);
      if (midTime !== null) {
        this._anchors[2] = { time: midTime, price: (p1PPrice + p2PPrice) / 2 };
      }
    }
  }

  updateAnchor(index: number, anchor: Anchor): void {
    const viewport = this.getViewport();
    if (!viewport) {
      super.updateAnchor(index, anchor);
      return;
    }

    if (this._anchors.length >= 6) {
      const p1 = this.anchorToPixel(this._anchors[0], viewport);
      const p2 = this.anchorToPixel(this._anchors[1], viewport);
      const mousePixel = this.anchorToPixel(anchor, viewport);

      // 1. Dragging baseline midpoint (index 5) to adjust height
      if (index === 5) {
        const p1P = this.anchorToPixel(this._anchors[3], viewport);
        const p2P = this.anchorToPixel(this._anchors[4], viewport);
        const p1_current = this.anchorToPixel(this._anchors[0], viewport);
        const p2_current = this.anchorToPixel(this._anchors[1], viewport);

        if (p1P && p2P && p1_current && p2_current && mousePixel) {
          const dx = p2P.x - p1P.x;
          const dy = p2P.y - p1P.y;
          const len = Math.sqrt(dx * dx + dy * dy);

          if (len > 0) {
            const nx = -dy / len;
            const ny = dx / len;

            // Perpendicular distance from parallel line to mouse
            const vx = mousePixel.x - p1P.x;
            const vy = mousePixel.y - p1P.y;
            const dist = vx * nx + vy * ny;

            // Calculate new baseline coordinates: p1_new and p2_new
            const p1_new_y = p1P.y + ny * dist;
            const p2_new_y = p2P.y + ny * dist;

            const p1Price = viewport.priceScale.coordinateToPrice(p1_new_y);
            const p2Price = viewport.priceScale.coordinateToPrice(p2_new_y);

            if (p1Price !== null && p2Price !== null) {
              this._anchors[0] = { time: this._anchors[0].time, price: p1Price };
              this._anchors[1] = { time: this._anchors[1].time, price: p2Price };

              // Update baseline midpoint (anchors[5])
              const midX = (p1_current.x + p2_current.x) / 2;
              const midY = (p1_new_y + p2_new_y) / 2;
              const midTime = viewport.timeScale.coordinateToTime(midX);
              const midPrice = viewport.priceScale.coordinateToPrice(midY);
              if (midTime !== null && midPrice !== null) {
                this._anchors[5] = { time: midTime, price: midPrice };
              }
            }
            this.requestUpdate();
          }
        }
        return;
      }

      // 2. Dragging baseline end points (index 0 or 1): keep width constant
      if (index === 0 || index === 1) {
        if (p1 && p2 && mousePixel) {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.sqrt(dx * dx + dy * dy);

          if (len > 0 && this._anchors[3] && this._anchors[4]) {
            const p1P = this.anchorToPixel(this._anchors[3], viewport);
            if (p1P) {
              const nx = -dy / len;
              const ny = dx / len;
              const vx = p1P.x - p1.x;
              const vy = p1P.y - p1.y;
              const dist = vx * nx + vy * ny;

              super.updateAnchor(index, anchor);

              const p1_new = this.anchorToPixel(this._anchors[0], viewport);
              const p2_new = this.anchorToPixel(this._anchors[1], viewport);
              if (p1_new && p2_new) {
                this.updateParallelAnchors(viewport, dist);

                const midX = (p1_new.x + p2_new.x) / 2;
                const midY = (p1_new.y + p2_new.y) / 2;
                const midTime = viewport.timeScale.coordinateToTime(midX);
                const midPrice = viewport.priceScale.coordinateToPrice(midY);
                if (midTime !== null && midPrice !== null) {
                  this._anchors[5] = { time: midTime, price: midPrice };
                }
              }
              this.requestUpdate();
            }
          }
        }
        return;
      }

      // 3. Dragging parallel points (index 2, 3, or 4) to adjust height
      if (index === 2 || index === 3 || index === 4) {
        if (p1 && p2 && mousePixel) {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.sqrt(dx * dx + dy * dy);

          if (len > 0) {
            const nx = -dy / len;
            const ny = dx / len;

            const vx = mousePixel.x - p1.x;
            const vy = mousePixel.y - p1.y;
            const dist = vx * nx + vy * ny;

            this.updateParallelAnchors(viewport, dist);
            this.requestUpdate();
          }
        }
        return;
      }
    }

    // 3-anchor fallback for lightweight-charts view
    super.updateAnchor(index, anchor);
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (this._anchors.length < 2) return [];

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);

    if (!p1 || !p2) return [];

    const geometries: Geometry[] = [];

    // Baseline (p1 to p2)
    geometries.push({
      type: 'line',
      start: p1,
      end: p2,
      extendLeft: this._channelOptions.extendLines,
      extendRight: this._channelOptions.extendLines,
    } as LineGeometry);

    if (this._anchors.length >= 6) {
      const p1Parallel = this.anchorToPixel(this._anchors[3], viewport);
      const p2Parallel = this.anchorToPixel(this._anchors[4], viewport);

      if (p1Parallel && p2Parallel) {
        // Parallel Line
        geometries.push({
          type: 'line',
          start: p1Parallel,
          end: p2Parallel,
          extendLeft: this._channelOptions.extendLines,
          extendRight: this._channelOptions.extendLines,
        } as LineGeometry);

        // Middle Line
        if (this._channelOptions.showMiddleLine) {
          const p1Middle = { x: (p1.x + p1Parallel.x) / 2, y: (p1.y + p1Parallel.y) / 2 };
          const p2Middle = { x: (p2.x + p2Parallel.x) / 2, y: (p2.y + p2Parallel.y) / 2 };

          geometries.push({
            type: 'line',
            start: p1Middle,
            end: p2Middle,
            extendLeft: this._channelOptions.extendLines,
            extendRight: this._channelOptions.extendLines,
          } as LineGeometry);
        }
      }
    } else if (this._anchors[2]) {
      const p3 = this.anchorToPixel(this._anchors[2], viewport);
      if (p3) {
        const offset = this.calculateOffset(p1, p2, p3);
        const p1Parallel = { x: p1.x + offset.x, y: p1.y + offset.y };
        const p2Parallel = { x: p2.x + offset.x, y: p2.y + offset.y };

        geometries.push({
          type: 'line',
          start: p1Parallel,
          end: p2Parallel,
          extendLeft: this._channelOptions.extendLines,
          extendRight: this._channelOptions.extendLines,
        } as LineGeometry);

        if (this._channelOptions.showMiddleLine) {
          const p1Middle = { x: p1.x + offset.x / 2, y: p1.y + offset.y / 2 };
          const p2Middle = { x: p2.x + offset.x / 2, y: p2.y + offset.y / 2 };

          geometries.push({
            type: 'line',
            start: p1Middle,
            end: p2Middle,
            extendLeft: this._channelOptions.extendLines,
            extendRight: this._channelOptions.extendLines,
          } as LineGeometry);
        }
      }
    }

    return geometries;
  }

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

  testHit(point: Point, viewport: Viewport): boolean {
    if (this._anchors.length < 2) return false;

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);
    if (!p1 || !p2) return false;

    // Check hit on control points first
    for (const cp of this.getControlPoints(viewport)) {
      if (Math.hypot(point.x - cp.x, point.y - cp.y) <= 12) return true;
    }

    if (distanceToLineSegment(point, p1, p2) <= ParallelChannel.HIT_THRESHOLD) return true;

    if (this._anchors.length >= 6) {
      const p1Parallel = this.anchorToPixel(this._anchors[3], viewport);
      const p2Parallel = this.anchorToPixel(this._anchors[4], viewport);

      if (p1Parallel && p2Parallel) {
        if (distanceToLineSegment(point, p1Parallel, p2Parallel) <= ParallelChannel.HIT_THRESHOLD) return true;

        // Also check median line if showMedianLine is enabled
        if (this._channelOptions.showMedianLine !== false) {
          const p1Mid = { x: (p1.x + p1Parallel.x) / 2, y: (p1.y + p1Parallel.y) / 2 };
          const p2Mid = { x: (p2.x + p2Parallel.x) / 2, y: (p2.y + p2Parallel.y) / 2 };
          if (distanceToLineSegment(point, p1Mid, p2Mid) <= ParallelChannel.HIT_THRESHOLD) return true;
        }
      }
    } else if (this._anchors[2]) {
      const p3 = this.anchorToPixel(this._anchors[2], viewport);
      if (p3) {
        const offset = this.calculateOffset(p1, p2, p3);
        const p1Parallel = { x: p1.x + offset.x, y: p1.y + offset.y };
        const p2Parallel = { x: p2.x + offset.x, y: p2.y + offset.y };

        if (distanceToLineSegment(point, p1Parallel, p2Parallel) <= ParallelChannel.HIT_THRESHOLD) return true;

        // Also check median line if showMedianLine is enabled
        if (this._channelOptions.showMedianLine !== false) {
          const p1Mid = { x: (p1.x + p1Parallel.x) / 2, y: (p1.y + p1Parallel.y) / 2 };
          const p2Mid = { x: (p2.x + p2Parallel.x) / 2, y: (p2.y + p2Parallel.y) / 2 };
          if (distanceToLineSegment(point, p1Mid, p2Mid) <= ParallelChannel.HIT_THRESHOLD) return true;
        }
      }
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new ParallelChannel(
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
    width: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<ParallelChannelOptions>
  ): ParallelChannel {
    return new ParallelChannel(id, [start, end, width], style, options);
  }
}
