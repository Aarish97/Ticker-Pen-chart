import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import { type FibWedge, type FibWedgeLevelItem, DEFAULT_FIB_WEDGE_LEVELS } from './fib-wedge';
import { distanceBetweenPoints } from '../../core/geometry';
import { drawControlPoints, drawText, getDashPattern, getDotPattern } from '../../rendering/canvas-utils';

function hexToRgba(color: string, opacity: number): string {
  if (color.startsWith('rgba')) return color;
  if (color.startsWith('rgb')) {
    return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
  }
  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16) || 120;
  const g = parseInt(hex.substring(2, 4), 16) || 123;
  const b = parseInt(hex.substring(4, 6), 16) || 134;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function getArcPoint(
  apex: { x: number; y: number },
  angle1: number,
  diff: number,
  r1: number,
  r2: number,
  val: number,
  t: number
): { x: number; y: number } {
  const angle = angle1 + diff * t;
  const r = (r1 + (r2 - r1) * t) * val;
  return {
    x: apex.x + r * Math.cos(angle),
    y: apex.y + r * Math.sin(angle)
  };
}

export class FibWedgePaneView implements IPrimitivePaneView {
  private _renderer: FibWedgePaneRenderer;

  constructor(drawing: FibWedge) {
    this._renderer = new FibWedgePaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class FibWedgePaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: FibWedge;

  constructor(drawing: FibWedge) {
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
    const apex = this._drawing.anchorToPixel(anchors[0], viewport);
    const p1 = this._drawing.anchorToPixel(anchors[1], viewport);
    const p2 = this._drawing.anchorToPixel(anchors[2], viewport);

    if (!apex) return;

    const state = this._drawing.state;
    const shouldDrawControl = state === 'selected' || state === 'editing' || state === 'hovered';

    if (!p1 || !p2) {
      if (shouldDrawControl) {
        const controlPoints = this._drawing.getControlPoints(viewport);
        drawControlPoints(ctx, controlPoints, null, pixelRatio);
      }
      return;
    }

    const r1 = distanceBetweenPoints(apex, p1);
    const r2 = distanceBetweenPoints(apex, p2);
    const options = this._drawing.fibOptions;

    // If no distance yet (placing 1st point)
    if (r1 <= 0 && r2 <= 0) {
      if (shouldDrawControl) {
        const controlPoints = this._drawing.getControlPoints(viewport);
        drawControlPoints(ctx, controlPoints, null, pixelRatio);
      }
      return;
    }

    const angle1 = Math.atan2(p1.y - apex.y, p1.x - apex.x);
    const angle2 = Math.atan2(p2.y - apex.y, p2.x - apex.x);

    let diff = angle2 - angle1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const anticlockwise = diff < 0;

    // Synchronized circular fan radius
    const baseRadius = Math.max(r1, r2);

    // If placing 2nd point or rays are collinear, draw ray 1 and control points
    if (r2 <= 0 || Math.abs(diff) < 1e-4) {
      if (options.showTrendline !== false && r1 > 0) {
        const trendColor = options.trendlineColor || '#787B86';
        const trendW = (options.trendlineWidth ?? options.lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;
        const trendStyle = options.trendlineStyle || 'solid';
        ctx.save();
        ctx.strokeStyle = trendColor;
        ctx.lineWidth = trendW;
        if (trendStyle === 'dashed') {
          ctx.setLineDash(getDashPattern(trendW, 1));
        } else if (trendStyle === 'dotted') {
          ctx.setLineDash(getDotPattern(trendW, 1));
        } else {
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(apex.x * pixelRatio, apex.y * pixelRatio);
        ctx.lineTo(p1.x * pixelRatio, p1.y * pixelRatio);
        ctx.stroke();
        ctx.restore();
      }
      if (shouldDrawControl) {
        const controlPoints = this._drawing.getControlPoints(viewport);
        drawControlPoints(ctx, controlPoints, null, pixelRatio);
      }
      return;
    }

    const p1Adj = { x: apex.x + baseRadius * Math.cos(angle1), y: apex.y + baseRadius * Math.sin(angle1) };
    const p2Adj = { x: apex.x + baseRadius * Math.cos(angle2), y: apex.y + baseRadius * Math.sin(angle2) };

    const rawLevels = options.levels ?? DEFAULT_FIB_WEDGE_LEVELS;

    const levelsList: FibWedgeLevelItem[] = rawLevels.map((item: any) => {
      if (typeof item === 'number') {
        const found = DEFAULT_FIB_WEDGE_LEVELS.find(d => d.value === item);
        return found ? { ...found } : { value: item, color: '#787B86', enabled: true };
      }
      return { ...item };
    });

    const activeLevels = levelsList.filter(l => l.enabled !== false);
    const sortedLevels = [...activeLevels].sort((a, b) => a.value - b.value);

    // 1. Draw Concentric Wedge Arc Background Fills
    if (options.filled !== false && sortedLevels.length > 0) {
      const bgOpacity = options.backgroundOpacity ?? 0.15;

      // Innermost wedge sector
      const first = sortedLevels[0];
      const c0 = options.useOneColor && options.oneColor ? options.oneColor : first.color;
      ctx.fillStyle = hexToRgba(c0, bgOpacity);
      ctx.beginPath();
      ctx.moveTo(apex.x * pixelRatio, apex.y * pixelRatio);
      ctx.arc(
        apex.x * pixelRatio,
        apex.y * pixelRatio,
        (baseRadius * first.value) * pixelRatio,
        angle1,
        angle2,
        anticlockwise
      );
      ctx.closePath();
      ctx.fill();

      // Concentric arc bands
      for (let i = 0; i < sortedLevels.length - 1; i++) {
        const inner = sortedLevels[i];
        const outer = sortedLevels[i + 1];
        const ringColor = options.useOneColor && options.oneColor ? options.oneColor : outer.color;

        ctx.fillStyle = hexToRgba(ringColor, bgOpacity);
        ctx.beginPath();
        // Outer arc forward
        ctx.arc(
          apex.x * pixelRatio,
          apex.y * pixelRatio,
          (baseRadius * outer.value) * pixelRatio,
          angle1,
          angle2,
          anticlockwise
        );
        // Inner arc backward
        ctx.arc(
          apex.x * pixelRatio,
          apex.y * pixelRatio,
          (baseRadius * inner.value) * pixelRatio,
          angle2,
          angle1,
          !anticlockwise
        );
        ctx.closePath();
        ctx.fill();
      }
    }

    // 2. Draw Arc Outlines (for level 1, starts at p1Adj and ends at p2Adj)
    for (const item of activeLevels) {
      const arcColor = options.useOneColor && options.oneColor ? options.oneColor : item.color;
      const lineW = (item.lineWidth ?? (options as any).levelLineWidth ?? options.lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;

      ctx.save();
      ctx.strokeStyle = arcColor;
      ctx.lineWidth = lineW;
      if (item.lineStyle === 'dashed') {
        ctx.setLineDash(getDashPattern(lineW, 1));
      } else if (item.lineStyle === 'dotted') {
        ctx.setLineDash(getDotPattern(lineW, 1));
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.arc(
        apex.x * pixelRatio,
        apex.y * pixelRatio,
        (baseRadius * item.value) * pixelRatio,
        angle1,
        angle2,
        anticlockwise
      );
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw Boundary Trendlines: Ray 1 (apex -> p1Adj) and Ray 2 (apex -> p2Adj)
    if (options.showTrendline !== false) {
      const trendColor = options.trendlineColor || '#787B86';
      const trendW = (options.trendlineWidth ?? options.lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;
      const trendStyle = options.trendlineStyle || 'solid';

      ctx.save();
      ctx.strokeStyle = trendColor;
      ctx.lineWidth = trendW;
      if (trendStyle === 'dashed') {
        ctx.setLineDash(getDashPattern(trendW, 1));
      } else if (trendStyle === 'dotted') {
        ctx.setLineDash(getDotPattern(trendW, 1));
      } else {
        ctx.setLineDash([]);
      }

      // Ray 1: from apex to p1Adj (Anchor 2 on level 1)
      ctx.beginPath();
      ctx.moveTo(apex.x * pixelRatio, apex.y * pixelRatio);
      ctx.lineTo(p1Adj.x * pixelRatio, p1Adj.y * pixelRatio);
      ctx.stroke();

      // Ray 2: from apex to p2Adj (Anchor 3 on level 1)
      ctx.beginPath();
      ctx.moveTo(apex.x * pixelRatio, apex.y * pixelRatio);
      ctx.lineTo(p2Adj.x * pixelRatio, p2Adj.y * pixelRatio);
      ctx.stroke();

      ctx.restore();
    }

    // 4. Draw Level Labels (positioned cleanly outside the arc curve)
    if (options.showLabels !== false) {
      const labelAngle = angle1 + diff * 0.35;
      for (const item of activeLevels) {
        const text = String(item.value);
        const labelColor = options.useOneColor && options.oneColor ? options.oneColor : item.color;
        const labelR = baseRadius * item.value + 7;
        const labelPos = {
          x: apex.x + labelR * Math.cos(labelAngle),
          y: apex.y + labelR * Math.sin(labelAngle)
        };
        drawText(
          ctx,
          text,
          labelPos,
          "11px 'Rubik', sans-serif",
          labelColor,
          'center',
          'middle',
          pixelRatio
        );
      }
    }

    // 5. Draw Control Points (Apex, p1 on level 1, p2 on level 1)
    if (shouldDrawControl) {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}


