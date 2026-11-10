import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { RegressionTrend } from './regression-trend';
import { extendLineToViewport } from '../../core/geometry';
import { applyStyle, drawLine, drawControlPoints } from '../../rendering/canvas-utils';

export class RegressionTrendPaneView implements IPrimitivePaneView {
  private _renderer: RegressionTrendPaneRenderer;

  constructor(drawing: RegressionTrend) {
    this._renderer = new RegressionTrendPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class RegressionTrendPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: RegressionTrend;

  constructor(drawing: RegressionTrend) {
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

    if (!p1 || !p2) return;

    const options = this._drawing.channelOptions;
    const { slope, intercept, stdDev } = this._drawing.calculateRegression(p1, p2);
    const baseP1 = { x: p1.x, y: slope * p1.x + intercept };
    const baseP2 = { x: p2.x, y: slope * p2.x + intercept };
    const upperOffset = stdDev * (options.upperDeviation ?? options.standardDeviations ?? 2);
    const lowerOffset = stdDev * (options.lowerDeviation ?? options.standardDeviations ?? 2);

    // Calculate perpendicular offset
    const upperOffsetX = 0;
    const upperOffsetY = -upperOffset;
    const lowerOffsetX = 0;
    const lowerOffsetY = lowerOffset;

    // Calculate channel points
    const p1Upper = { x: baseP1.x + upperOffsetX, y: baseP1.y + upperOffsetY };
    const p2Upper = { x: baseP2.x + upperOffsetX, y: baseP2.y + upperOffsetY };
    const p1Lower = { x: baseP1.x - lowerOffsetX, y: baseP1.y - lowerOffsetY };
    const p2Lower = { x: baseP2.x - lowerOffsetX, y: baseP2.y - lowerOffsetY };

    applyStyle(ctx, this._drawing.style, pixelRatio);

    // Handle extensions
    let drawP1U = p1Upper, drawP2U = p2Upper;
    let drawP1L = p1Lower, drawP2L = p2Lower;

    if (options.extendLines) {
      const extendedUpper = extendLineToViewport(p1Upper, p2Upper, viewport.width, viewport.height, true, true);
      const extendedLower = extendLineToViewport(p1Lower, p2Lower, viewport.width, viewport.height, true, true);
      drawP1U = extendedUpper.start;
      drawP2U = extendedUpper.end;
      drawP1L = extendedLower.start;
      drawP2L = extendedLower.end;
    }

    const centerStart = {
      x: (drawP1U.x + drawP1L.x) / 2,
      y: (drawP1U.y + drawP1L.y) / 2,
    };
    const centerEnd = {
      x: (drawP2U.x + drawP2L.x) / 2,
      y: (drawP2U.y + drawP2L.y) / 2,
    };

    // Draw upper and lower shade fills if enabled
    if (options.filled !== false) {
      const upShade = options.upFillColor || options.upperFillColor || 'rgba(0, 150, 136, 0.18)';
      const downShade = options.downFillColor || options.lowerFillColor || 'rgba(239, 83, 80, 0.16)';

      if (options.useUpperDeviation !== false && upShade !== 'transparent') {
        ctx.fillStyle = upShade;
        ctx.beginPath();
        ctx.moveTo(drawP1U.x * pixelRatio, drawP1U.y * pixelRatio);
        ctx.lineTo(drawP2U.x * pixelRatio, drawP2U.y * pixelRatio);
        ctx.lineTo(centerEnd.x * pixelRatio, centerEnd.y * pixelRatio);
        ctx.lineTo(centerStart.x * pixelRatio, centerStart.y * pixelRatio);
        ctx.closePath();
        ctx.fill();
      }

      if (options.useLowerDeviation !== false && downShade !== 'transparent') {
        ctx.fillStyle = downShade;
        ctx.beginPath();
        ctx.moveTo(centerStart.x * pixelRatio, centerStart.y * pixelRatio);
        ctx.lineTo(centerEnd.x * pixelRatio, centerEnd.y * pixelRatio);
        ctx.lineTo(drawP2L.x * pixelRatio, drawP2L.y * pixelRatio);
        ctx.lineTo(drawP1L.x * pixelRatio, drawP1L.y * pixelRatio);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Draw upper and lower bands
    const lineColor = this._drawing.style.lineColor || '#2962FF';
    const lw = this._drawing.style.lineWidth || 1;
    const lineWidth = lw * pixelRatio;
    const lineStyle = this._drawing.style.lineStyle || 'solid';

    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    if (lineStyle === 'solid') {
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
    } else if (lineStyle === 'dotted') {
      ctx.lineCap = 'round';
      ctx.setLineDash([0, Math.max(5, lw * 3 + 2) * pixelRatio]);
    } else {
      ctx.lineCap = 'butt';
      ctx.setLineDash([Math.max(6, lw * 3 + 3) * pixelRatio, Math.max(4, lw * 2 + 2) * pixelRatio]);
    }

    if (options.useUpperDeviation !== false) drawLine(ctx, drawP1U, drawP2U, pixelRatio);
    if (options.useLowerDeviation !== false) drawLine(ctx, drawP1L, drawP2L, pixelRatio);
    ctx.restore();

    // Draw middle line (regression line) - fixed original dashed style in ash color
    {
      ctx.save();
      ctx.strokeStyle = '#787B86';
      ctx.lineWidth = 1 * pixelRatio;
      // True dotted center line in ash; it is independent from the top and bottom bands.
      ctx.lineCap = 'round';
      ctx.setLineDash([2 * pixelRatio, 5 * pixelRatio]);
      ctx.beginPath();
      ctx.moveTo(centerStart.x * pixelRatio, centerStart.y * pixelRatio);
      ctx.lineTo(centerEnd.x * pixelRatio, centerEnd.y * pixelRatio);
      ctx.stroke();
      ctx.restore();
    }

    // Draw control points if selected
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      drawControlPoints(ctx, [
        { index: 0, x: baseP1.x, y: baseP1.y, radius: 6 },
        { index: 1, x: baseP2.x, y: baseP2.y, radius: 6 },
      ], null, pixelRatio, this._drawing.style.lineColor || '#2962FF');
    }
  }
}
