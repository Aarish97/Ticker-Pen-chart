import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import { type FibArcs, type FibArcLevelItem, DEFAULT_FIB_ARCS_LEVELS } from './fib-arcs';
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

export class FibArcsPaneView implements IPrimitivePaneView {
  private _renderer: FibArcsPaneRenderer;

  constructor(drawing: FibArcs) {
    this._renderer = new FibArcsPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class FibArcsPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: FibArcs;

  constructor(drawing: FibArcs) {
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
    const p1 = this._drawing.anchorToPixel(anchors[0], viewport);
    const p2 = this._drawing.anchorToPixel(anchors[1], viewport);

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
    const isFull = options.fullCircles ?? options.fullCircle ?? false;
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const startAngle = isFull ? 0 : angle - Math.PI / 2;
    const endAngle = isFull ? Math.PI * 2 : angle + Math.PI / 2;

    const rawLevels = options.levels ?? DEFAULT_FIB_ARCS_LEVELS;
    const levelsList: FibArcLevelItem[] = rawLevels.map((item: any) => {
      if (typeof item === 'number') {
        const found = DEFAULT_FIB_ARCS_LEVELS.find(d => d.value === item);
        return found ? { ...found } : { value: item, color: '#787B86', enabled: true };
      }
      return { ...item };
    });

    const activeLevels = levelsList.filter(l => l.enabled !== false);
    const sortedLevels = [...activeLevels].sort((a, b) => a.value - b.value);

    // 1. Draw Ring / Arc Background Fills
    if (options.filled !== false && sortedLevels.length > 0) {
      const bgOpacity = options.backgroundOpacity ?? 0.15;

      if (isFull) {
        // Full circular rings
        const first = sortedLevels[0];
        const r0 = baseRadius * first.value * pixelRatio;
        const c0 = options.useOneColor && options.oneColor ? options.oneColor : first.color;
        ctx.fillStyle = hexToRgba(c0, bgOpacity);
        ctx.beginPath();
        ctx.arc(p1.x * pixelRatio, p1.y * pixelRatio, r0, 0, Math.PI * 2);
        ctx.fill();

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
      } else {
        // Semicircular arc bands
        const first = sortedLevels[0];
        const r0 = baseRadius * first.value * pixelRatio;
        const c0 = options.useOneColor && options.oneColor ? options.oneColor : first.color;
        ctx.fillStyle = hexToRgba(c0, bgOpacity);
        ctx.beginPath();
        ctx.moveTo(p1.x * pixelRatio, p1.y * pixelRatio);
        ctx.arc(p1.x * pixelRatio, p1.y * pixelRatio, r0, startAngle, endAngle, false);
        ctx.closePath();
        ctx.fill();

        for (let i = 0; i < sortedLevels.length - 1; i++) {
          const inner = sortedLevels[i];
          const outer = sortedLevels[i + 1];
          const rInner = baseRadius * inner.value * pixelRatio;
          const rOuter = baseRadius * outer.value * pixelRatio;
          const ringColor = options.useOneColor && options.oneColor ? options.oneColor : outer.color;

          ctx.fillStyle = hexToRgba(ringColor, bgOpacity);
          ctx.beginPath();
          ctx.arc(p1.x * pixelRatio, p1.y * pixelRatio, rOuter, startAngle, endAngle, false);
          ctx.arc(p1.x * pixelRatio, p1.y * pixelRatio, rInner, endAngle, startAngle, true);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // 2. Draw Arc Outlines
    for (const item of activeLevels) {
      const radius = baseRadius * item.value;
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
      ctx.arc(p1.x * pixelRatio, p1.y * pixelRatio, radius * pixelRatio, startAngle, endAngle);
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

    // 4. Draw Level Labels (positioned cleanly outside the arc curve)
    if (options.showLabels !== false) {
      for (const item of activeLevels) {
        const radius = baseRadius * item.value;
        const text = String(item.value);
        const labelColor = options.useOneColor && options.oneColor ? options.oneColor : item.color;
        const labelRadius = radius + 7;
        const labelPos = {
          x: p1.x + labelRadius * Math.cos(angle),
          y: p1.y + labelRadius * Math.sin(angle)
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

    // 5. Draw Control Points
    if (shouldDrawControl) {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}

