import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { ModifiedSchiffPitchfork } from './modified-schiff-pitchfork';
import { DEFAULT_PITCHFORK_LEVELS } from './pitchfork-levels';
import { midpoint } from '../../core/geometry';
import type { Point } from '../../core/types';
import { drawLine, drawControlPoints, getDashPattern, getDotPattern } from '../../rendering/canvas-utils';

function hexToRgba(color: string, opacity: number): string {
  if (color.startsWith('rgba')) return color;
  if (color.startsWith('rgb')) {
    return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
  }
  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16) || 41;
  const g = parseInt(hex.substring(2, 4), 16) || 98;
  const b = parseInt(hex.substring(4, 6), 16) || 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Computes the line segment endpoints.
 * Front side: always projects forward to the viewport edge.
 * Back side: only extends backward past the bracket/pivot when extendLines is true.
 */
function getLineEndpoints(
  origin: Point,
  dir: { x: number; y: number },
  width: number,
  height: number,
  extendBackSide: boolean,
  finiteStart: Point = origin
): { start: Point; end: Point } {
  const dx = dir.x;
  const dy = dir.y;

  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
    return { start: finiteStart, end: { x: finiteStart.x + 100, y: finiteStart.y } };
  }

  // Front side: always extends forward to the viewport edge
  let txFwd = Infinity;
  if (dx > 1e-6) txFwd = (width - origin.x) / dx;
  else if (dx < -1e-6) txFwd = (0 - origin.x) / dx;

  let tyFwd = Infinity;
  if (dy > 1e-6) tyFwd = (height - origin.y) / dy;
  else if (dy < -1e-6) tyFwd = (0 - origin.y) / dy;

  const tFwd = Math.min(txFwd, tyFwd);
  const end = (isFinite(tFwd) && tFwd > 0)
    ? { x: origin.x + tFwd * dx, y: origin.y + tFwd * dy }
    : { x: finiteStart.x + dx * 3, y: finiteStart.y + dy * 3 };

  // Back side: only extends backward when extendBackSide is true
  if (extendBackSide) {
    let txBwd = Infinity;
    if (dx > 1e-6) txBwd = origin.x / dx;
    else if (dx < -1e-6) txBwd = (origin.x - width) / dx;

    let tyBwd = Infinity;
    if (dy > 1e-6) tyBwd = origin.y / dy;
    else if (dy < -1e-6) tyBwd = (origin.y - height) / dy;

    const tBwd = Math.min(txBwd, tyBwd);
    const start = (isFinite(tBwd) && tBwd > 0)
      ? { x: origin.x - tBwd * dx, y: origin.y - tBwd * dy }
      : finiteStart;

    return { start, end };
  }

  return { start: finiteStart, end };
}

export class ModifiedSchiffPitchforkPaneView implements IPrimitivePaneView {
  private _renderer: ModifiedSchiffPitchforkPaneRenderer;

  constructor(drawing: ModifiedSchiffPitchfork) {
    this._renderer = new ModifiedSchiffPitchforkPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class ModifiedSchiffPitchforkPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: ModifiedSchiffPitchfork;

  constructor(drawing: ModifiedSchiffPitchfork) {
    this._drawing = drawing;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
      this.drawImpl(scope);
    });
  }

  private drawImpl(scope: BitmapCoordinatesRenderingScope): void {
    const { context: ctx, horizontalPixelRatio } = scope;
    const pixelRatio = horizontalPixelRatio;

    const viewport = this._drawing.getViewport();
    if (!viewport) return;
    if (!this._drawing.options.visible) return;
    if (!this._drawing.isValid()) return;

    const anchors = this._drawing.anchors;
    const p0 = this._drawing.anchorToPixel(anchors[0], viewport);
    const p1 = anchors.length >= 2 ? this._drawing.anchorToPixel(anchors[1], viewport) : null;
    const p2 = anchors.length >= 3 ? this._drawing.anchorToPixel(anchors[2], viewport) : null;

    if (!p0) return;

    const state = this._drawing.state;
    const shouldDrawControl = state === 'selected' || state === 'editing' || state === 'hovered';
    const options = this._drawing.pitchforkOptions;

    // Step 1: Only 1 point placed
    if (!p1) {
      if (shouldDrawControl) {
        const controlPoints = this._drawing.getControlPoints(viewport);
        drawControlPoints(ctx, controlPoints, null, pixelRatio);
      }
      return;
    }

    // Step 2: Points p0 and p1 placed, p2 not yet placed or coincident
    const isP2Placed = p2 && Math.hypot(p2.x - p1.x, p2.y - p1.y) > 2 && Math.hypot(p2.x - p0.x, p2.y - p0.y) > 2;
    if (!isP2Placed) {
      ctx.save();
      ctx.strokeStyle = options.useOneColor && options.oneColor ? options.oneColor : (options.medianColor || '#ef5350');
      ctx.lineWidth = (options.medianWidth ?? options.lineWidth ?? 1.5) * pixelRatio;
      ctx.setLineDash([]);
      drawLine(ctx, p0, p1, pixelRatio);
      ctx.restore();

      if (shouldDrawControl) {
        const controlPoints = this._drawing.getControlPoints(viewport);
        drawControlPoints(ctx, controlPoints, null, pixelRatio);
      }
      return;
    }

    // Modified Schiff pivot: midpoint(p0, p1)
    const modifiedPivot = this._drawing.getModifiedSchiffPivot(p0, p1);
    const mid = midpoint(p1, p2);

    // Direction vector: from modifiedPivot through mid
    const dir = { x: mid.x - modifiedPivot.x, y: mid.y - modifiedPivot.y };

    const lineW = (options.lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;
    const bgOpacity = options.backgroundOpacity ?? 0.15;
    const extendBack = options.extendLines ?? false;

    // Median line calculation (starts at modifiedPivot forward, extends backward from mid if extendBack is true)
    const medianLine = getLineEndpoints(mid, dir, viewport.width, viewport.height, extendBack, modifiedPivot);

    // Active Levels
    const rawLevels = options.levels ?? DEFAULT_PITCHFORK_LEVELS;
    const activeLevels = rawLevels.filter(l => l.enabled !== false);
    const sortedLevels = [...activeLevels].sort((a, b) => a.value - b.value);

    // Vector from mid to p1
    const halfSpan = { x: p1.x - mid.x, y: p1.y - mid.y };

    // Calculate upper and lower tines
    const upperTines = sortedLevels.map(lvl => {
      const bracketStart = { x: mid.x + lvl.value * halfSpan.x, y: mid.y + lvl.value * halfSpan.y };
      const pts = getLineEndpoints(bracketStart, dir, viewport.width, viewport.height, extendBack, bracketStart);
      const color = options.useOneColor && options.oneColor ? options.oneColor : lvl.color;
      return { lvl, bracketStart, start: pts.start, end: pts.end, color };
    });

    const lowerTines = sortedLevels.map(lvl => {
      const bracketStart = { x: mid.x - lvl.value * halfSpan.x, y: mid.y - lvl.value * halfSpan.y };
      const pts = getLineEndpoints(bracketStart, dir, viewport.width, viewport.height, extendBack, bracketStart);
      const color = options.useOneColor && options.oneColor ? options.oneColor : lvl.color;
      return { lvl, bracketStart, start: pts.start, end: pts.end, color };
    });

    // Draw Background Fills with canvas viewport clipping for seamless coverage
    if (options.filled !== false) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, viewport.width * pixelRatio, viewport.height * pixelRatio);
      ctx.clip();

      const drawPolygonFill = (pts: { x: number; y: number }[], fillColor: string) => {
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.moveTo(pts[0].x * pixelRatio, pts[0].y * pixelRatio);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x * pixelRatio, pts[i].y * pixelRatio);
        }
        ctx.closePath();
        ctx.fill();
      };

      const maxDim = Math.max(viewport.width, viewport.height) * 4;
      const dirLen = Math.hypot(dir.x, dir.y);
      const uDir = dirLen > 1e-6 ? { x: dir.x / dirLen, y: dir.y / dirLen } : { x: 1, y: 0 };

      const getChannelLine = (bracketPt: Point) => {
        const start = extendBack
          ? { x: bracketPt.x - uDir.x * maxDim, y: bracketPt.y - uDir.y * maxDim }
          : bracketPt;
        const end = { x: bracketPt.x + uDir.x * maxDim, y: bracketPt.y + uDir.y * maxDim };
        return { start, end };
      };

      const medLine = getChannelLine(mid);

      // Fill upper sectors
      let prevUpper = medLine;
      for (const tine of upperTines) {
        const curr = getChannelLine(tine.bracketStart);
        drawPolygonFill([prevUpper.start, prevUpper.end, curr.end, curr.start], hexToRgba(tine.color, bgOpacity));
        prevUpper = curr;
      }

      // Fill lower sectors
      let prevLower = medLine;
      for (const tine of lowerTines) {
        const curr = getChannelLine(tine.bracketStart);
        drawPolygonFill([prevLower.start, prevLower.end, curr.end, curr.start], hexToRgba(tine.color, bgOpacity));
        prevLower = curr;
      }

      ctx.restore();
    }

    // 1. Draw Median Line & Handle/Bracket
    const medColor = options.useOneColor && options.oneColor ? options.oneColor : (options.medianColor || '#F23645');
    const medStyle = options.medianStyle || 'solid';
    const medW = (options.medianWidth ?? options.lineWidth ?? 1.5) * pixelRatio;

    ctx.save();
    ctx.strokeStyle = medColor;
    ctx.lineWidth = medW;
    if (medStyle === 'dashed') ctx.setLineDash(getDashPattern(medW, 1));
    else if (medStyle === 'dotted') ctx.setLineDash(getDotPattern(medW, 1));
    else ctx.setLineDash([]);

    if (options.showMedianLine !== false) {
      drawLine(ctx, medianLine.start, medianLine.end, pixelRatio);
    }
    // Bracket connections: p0→p1 and p1→p2
    drawLine(ctx, p0, p1, pixelRatio);
    drawLine(ctx, p1, p2, pixelRatio);
    ctx.restore();

    // 2. Draw Upper & Lower Tines
    for (const tine of upperTines) {
      ctx.save();
      ctx.strokeStyle = tine.color;
      ctx.lineWidth = lineW;
      const st = tine.lvl.style || 'solid';
      if (st === 'dashed') ctx.setLineDash(getDashPattern(lineW, 1));
      else if (st === 'dotted') ctx.setLineDash(getDotPattern(lineW, 1));
      else ctx.setLineDash([]);
      drawLine(ctx, tine.start, tine.end, pixelRatio);
      ctx.restore();
    }

    for (const tine of lowerTines) {
      ctx.save();
      ctx.strokeStyle = tine.color;
      ctx.lineWidth = lineW;
      const st = tine.lvl.style || 'solid';
      if (st === 'dashed') ctx.setLineDash(getDashPattern(lineW, 1));
      else if (st === 'dotted') ctx.setLineDash(getDotPattern(lineW, 1));
      else ctx.setLineDash([]);
      drawLine(ctx, tine.start, tine.end, pixelRatio);
      ctx.restore();
    }

    // Draw control points if selected
    if (shouldDrawControl) {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
