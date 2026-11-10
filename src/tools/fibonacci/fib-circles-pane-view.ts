import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import { type FibCircles, type FibCircleLevelItem, DEFAULT_FIB_CIRCLES_LEVELS } from './fib-circles';
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

export class FibCirclesPaneView implements IPrimitivePaneView {
  private _renderer: FibCirclesPaneRenderer;

  constructor(drawing: FibCircles) {
    this._renderer = new FibCirclesPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class FibCirclesPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: FibCircles;

  constructor(drawing: FibCircles) {
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
    const p1 = this._drawing.anchorToPixel(anchors[0], viewport); // Center
    const p2 = this._drawing.anchorToPixel(anchors[1], viewport); // Radius point

    if (!p1) return;

    const state = this._drawing.state;
    const shouldDrawControl = state === 'selected' || state === 'editing' || state === 'hovered';

    if (!p2) {
      if (shouldDrawControl) {
        const controlPoints = this._drawing.getControlPoints(viewport);
        drawControlPoints(ctx, controlPoints, null, pixelRatio);
      }
      return;
    }

    const baseRadius = distanceBetweenPoints(p1, p2);
    if (baseRadius <= 0) {
      if (shouldDrawControl) {
        const controlPoints = this._drawing.getControlPoints(viewport);
        drawControlPoints(ctx, controlPoints, null, pixelRatio);
      }
      return;
    }

    const options = this._drawing.fibOptions;
    const rawLevels = options.levels ?? DEFAULT_FIB_CIRCLES_LEVELS;

    // Normalize levels to objects
    const levelsList: FibCircleLevelItem[] = rawLevels.map((item: any) => {
      if (typeof item === 'number') {
        const found = DEFAULT_FIB_CIRCLES_LEVELS.find(d => d.value === item);
        return found ? { ...found } : { value: item, color: '#787B86', enabled: true };
      }
      return { ...item };
    });

    const activeLevels = levelsList.filter(l => l.enabled !== false);
    const sortedLevels = [...activeLevels].sort((a, b) => a.value - b.value);

    // 1. Draw Ring Background Fills
    if (options.filled !== false && sortedLevels.length > 0) {
      const bgOpacity = options.backgroundOpacity ?? 0.15;

      // Innermost circle
      const first = sortedLevels[0];
      const r0 = baseRadius * first.value * pixelRatio;
      const c0 = options.useOneColor && options.oneColor ? options.oneColor : first.color;
      ctx.fillStyle = hexToRgba(c0, bgOpacity);
      ctx.beginPath();
      ctx.arc(p1.x * pixelRatio, p1.y * pixelRatio, r0, 0, Math.PI * 2);
      ctx.fill();

      // Rings between consecutive levels
      for (let i = 0; i < sortedLevels.length - 1; i++) {
        const inner = sortedLevels[i];
        const outer = sortedLevels[i + 1];
        const rInner = baseRadius * inner.value * pixelRatio;
        const rOuter = baseRadius * outer.value * pixelRatio;
        const ringColor = options.useOneColor && options.oneColor ? options.oneColor : outer.color;

        ctx.fillStyle = hexToRgba(ringColor, bgOpacity);
        ctx.beginPath();
        ctx.arc(p1.x * pixelRatio, p1.y * pixelRatio, rOuter, 0, Math.PI * 2, false);
        ctx.arc(p1.x * pixelRatio, p1.y * pixelRatio, rInner, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 2. Draw Circle Level Outlines
    for (const item of activeLevels) {
      const radius = baseRadius * item.value;
      const circleColor = options.useOneColor && options.oneColor ? options.oneColor : item.color;
      const lineW = (item.lineWidth ?? (options as any).levelLineWidth ?? options.lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;

      ctx.save();
      ctx.strokeStyle = circleColor;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (item.lineStyle === 'dashed') {
        ctx.setLineDash(getDashPattern(lineW, 1));
      } else if (item.lineStyle === 'dotted') {
        ctx.setLineDash(getDotPattern(lineW, 1));
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.arc(p1.x * pixelRatio, p1.y * pixelRatio, radius * pixelRatio, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw Trend Line (Center to Radius endpoint)
    if (options.showTrendline !== false) {
      const trendColor = options.trendlineColor || '#787B86';
      const trendW = (options.trendlineWidth ?? options.lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;
      const trendStyle = options.trendlineStyle || 'dashed';

      ctx.save();
      ctx.strokeStyle = trendColor;
      ctx.lineWidth = trendW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (trendStyle === 'dashed') {
        ctx.setLineDash(getDashPattern(trendW, 1));
      } else if (trendStyle === 'dotted') {
        ctx.setLineDash(getDotPattern(trendW, 1));
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(p1.x * pixelRatio, p1.y * pixelRatio);
      ctx.lineTo(p2.x * pixelRatio, p2.y * pixelRatio);
      ctx.stroke();
      ctx.restore();
    }

    // 4. Draw Level Labels (positioned cleanly outside the circle line)
    if (options.showLabels !== false) {
      for (const item of activeLevels) {
        const radius = baseRadius * item.value;
        const text = options.coeffsAsPercents
          ? `${(item.value * 100).toFixed(1)}%`
          : String(item.value);
        const labelColor = options.useOneColor && options.oneColor ? options.oneColor : item.color;
        const labelPos = { x: p1.x + 4, y: p1.y + radius + 3 };
        drawText(
          ctx,
          text,
          labelPos,
          "11px 'Rubik', sans-serif",
          labelColor,
          'left',
          'top',
          pixelRatio
        );
      }
    }

    // 5. Draw Control Points
    if (shouldDrawControl) {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}

