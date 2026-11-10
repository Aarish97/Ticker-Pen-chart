import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import { type Geometry, type LineGeometry, distanceToLineSegment, midpoint } from '../../core/geometry';
import { ModifiedSchiffPitchforkPaneView } from './modified-schiff-pitchfork-pane-view';
import { type PitchforkLevelItem, DEFAULT_PITCHFORK_LEVELS } from './pitchfork-levels';

/**
 * ModifiedSchiffPitchfork options
 */
export interface ModifiedSchiffPitchforkOptions extends DrawingOptions {
  showMedianLine?: boolean;
  medianColor?: string;
  medianStyle?: 'solid' | 'dashed' | 'dotted';
  medianWidth?: number;
  showOuterLines?: boolean;
  extendLines?: boolean;
  filled?: boolean;
  backgroundOpacity?: number;
  levels?: PitchforkLevelItem[];
  useOneColor?: boolean;
  oneColor?: string;
  lineWidth?: number;
  lineColor?: string;
}

/**
 * ModifiedSchiffPitchfork - Modified Schiff Pitchfork variant.
 *
 * The Modified Schiff Pitchfork places the virtual pivot at the midpoint
 * between the anchor pivot (p0) and the first swing point (p1).
 *
 * Features:
 * - Three anchor points (pivot, and two swing points)
 * - Median line from midpoint(p0,p1) through midpoint of swings
 * - Parallel outer lines through swing points
 * - Optional fill between lines
 */
export class ModifiedSchiffPitchfork extends Drawing {
  readonly type = 'modified-schiff-pitchfork';

  protected static readonly REQUIRED_ANCHORS = 3;
  protected static readonly HIT_THRESHOLD = 5;

  private _pitchforkOptions: ModifiedSchiffPitchforkOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<ModifiedSchiffPitchforkOptions> = {}
  ) {
    const {
      showMedianLine,
      medianColor,
      medianStyle,
      medianWidth,
      showOuterLines,
      extendLines,
      filled,
      backgroundOpacity,
      levels,
      useOneColor,
      oneColor,
      lineWidth,
      lineColor,
      ...baseOptions
    } = options;
    super(id, anchors, style, baseOptions);

    this._pitchforkOptions = {
      ...this._options,
      showMedianLine: showMedianLine ?? true,
      medianColor: medianColor ?? '#F23645',
      medianStyle: medianStyle ?? 'solid',
      medianWidth: medianWidth ?? 1,
      showOuterLines: showOuterLines ?? true,
      extendLines: extendLines ?? false,
      filled: filled ?? true,
      backgroundOpacity: backgroundOpacity ?? 0.15,
      levels: levels ?? DEFAULT_PITCHFORK_LEVELS,
      useOneColor: useOneColor ?? false,
      oneColor: oneColor ?? '#2962FF',
      lineWidth: lineWidth ?? 1,
      lineColor: lineColor ?? '#2962FF'
    };
  }

  get pitchforkOptions(): ModifiedSchiffPitchforkOptions {
    return this._pitchforkOptions;
  }

  setPitchforkOptions(options: Partial<ModifiedSchiffPitchforkOptions>): void {
    this._pitchforkOptions = { ...this._pitchforkOptions, ...options };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= 1;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new ModifiedSchiffPitchforkPaneView(this)];
  }

  /**
   * Calculate the Modified Schiff pivot point (midpoint between p0 and p1)
   */
  getModifiedSchiffPivot(p0: Point, p1: Point): Point {
    return midpoint(p0, p1);
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p0 = this.anchorToPixel(this._anchors[0], viewport); // Pivot
    const p1 = this.anchorToPixel(this._anchors[1], viewport); // Swing 1
    const p2 = this.anchorToPixel(this._anchors[2], viewport); // Swing 2

    if (!p0 || !p1 || !p2) return [];

    const geometries: Geometry[] = [];

    // Modified Schiff pivot: midpoint between p0 and p1
    const modifiedPivot = this.getModifiedSchiffPivot(p0, p1);

    // Midpoint of p1 and p2
    const mid = midpoint(p1, p2);

    // Median line: from modifiedPivot through mid
    if (this._pitchforkOptions.showMedianLine) {
      geometries.push({
        type: 'line',
        start: modifiedPivot,
        end: mid,
        extendRight: this._pitchforkOptions.extendLines,
      } as LineGeometry);
    }

    // Calculate direction vector for median line
    const dx = mid.x - modifiedPivot.x;
    const dy = mid.y - modifiedPivot.y;

    // Outer lines parallel to median, through p1 and p2
    if (this._pitchforkOptions.showOuterLines) {
      const p1End = { x: p1.x + dx * 2, y: p1.y + dy * 2 };
      geometries.push({
        type: 'line',
        start: p1,
        end: p1End,
        extendRight: this._pitchforkOptions.extendLines,
      } as LineGeometry);

      const p2End = { x: p2.x + dx * 2, y: p2.y + dy * 2 };
      geometries.push({
        type: 'line',
        start: p2,
        end: p2End,
        extendRight: this._pitchforkOptions.extendLines,
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

    const threshold = 8;
    const distToPoint = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

    // 1. Check anchor points directly
    if (distToPoint(point, p0) <= threshold) return true;
    if (distToPoint(point, p1) <= threshold) return true;
    if (distToPoint(point, p2) <= threshold) return true;

    // 2. Check handle (p0 to p1) and bracket (p1 to p2)
    if (distanceToLineSegment(point, p0, p1) <= threshold) return true;
    if (distanceToLineSegment(point, p1, p2) <= threshold) return true;

    const modifiedPivot = this.getModifiedSchiffPivot(p0, p1);
    const mid = midpoint(p1, p2);

    // Direction vector: from modifiedPivot through mid
    const dir = { x: mid.x - modifiedPivot.x, y: mid.y - modifiedPivot.y };
    const dirLen = Math.hypot(dir.x, dir.y);
    if (dirLen < 1e-6) return false;

    const maxDim = Math.max(viewport.width, viewport.height) * 4;
    const uDir = { x: dir.x / dirLen, y: dir.y / dirLen };
    const extendBack = this._pitchforkOptions.extendLines ?? false;

    const checkLine = (origin: Point): boolean => {
      const start = extendBack
        ? { x: origin.x - uDir.x * maxDim, y: origin.y - uDir.y * maxDim }
        : origin;
      const end = { x: origin.x + uDir.x * maxDim, y: origin.y + uDir.y * maxDim };
      return distanceToLineSegment(point, start, end) <= threshold;
    };

    // 3. Check median line
    if (this._pitchforkOptions.showMedianLine !== false) {
      if (checkLine(mid)) return true;
    }

    // 4. Check all active upper & lower level tines
    const rawLevels = this._pitchforkOptions.levels ?? DEFAULT_PITCHFORK_LEVELS;
    const activeLevels = rawLevels.filter(l => l.enabled !== false);
    const halfSpan = { x: p1.x - mid.x, y: p1.y - mid.y };

    for (const lvl of activeLevels) {
      const upperOrigin = { x: mid.x + lvl.value * halfSpan.x, y: mid.y + lvl.value * halfSpan.y };
      if (checkLine(upperOrigin)) return true;

      const lowerOrigin = { x: mid.x - lvl.value * halfSpan.x, y: mid.y - lvl.value * halfSpan.y };
      if (checkLine(lowerOrigin)) return true;
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new ModifiedSchiffPitchfork(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._pitchforkOptions }
    );
  }

  static create(
    id: string,
    pivot: Anchor,
    swing1: Anchor,
    swing2: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<ModifiedSchiffPitchforkOptions>
  ): ModifiedSchiffPitchfork {
    return new ModifiedSchiffPitchfork(id, [pivot, swing1, swing2], style, options);
  }
}
