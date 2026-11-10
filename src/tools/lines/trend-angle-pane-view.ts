import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { TrendAngle } from './trend-angle';
import { midpoint } from '../../core/geometry';
import { applyStyle, drawLine, drawControlPoints, drawLabel } from '../../rendering/canvas-utils';

export class TrendAnglePaneView implements IPrimitivePaneView {
  private _renderer: TrendAnglePaneRenderer;

  constructor(drawing: TrendAngle) {
    this._renderer = new TrendAnglePaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class TrendAnglePaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: TrendAngle;

  constructor(drawing: TrendAngle) {
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
    const start = this._drawing.anchorToPixel(anchors[0], viewport);
    const end = this._drawing.anchorToPixel(anchors[1], viewport);

    if (!start || !end) return;

    applyStyle(ctx, this._drawing.style, pixelRatio);

    // Draw main line
    drawLine(ctx, start, end, pixelRatio);

    const options = this._drawing.trendAngleOptions;

    // Draw angle arc
    if (options.showArc) {
      const arcRadius = (options.arcRadius ?? 40) * pixelRatio;
      const angle = Math.atan2(start.y - end.y, end.x - start.x);

      // Draw horizontal reference line (dashed)
      ctx.save();
      ctx.setLineDash([4 * pixelRatio, 4 * pixelRatio]);
      ctx.strokeStyle = this._drawing.style.lineColor + '80';
      ctx.lineWidth = 1 * pixelRatio;
      ctx.beginPath();
      ctx.moveTo(start.x * pixelRatio, start.y * pixelRatio);
      ctx.lineTo((start.x + arcRadius / pixelRatio + 20) * pixelRatio, start.y * pixelRatio);
      ctx.stroke();
      ctx.restore();

      // Draw arc
      ctx.beginPath();
      ctx.strokeStyle = this._drawing.style.lineColor;
      ctx.lineWidth = 2 * pixelRatio;

      // Arc from 0 (horizontal right) to the angle
      if (angle >= 0) {
        ctx.arc(start.x * pixelRatio, start.y * pixelRatio, arcRadius, 0, -angle, true);
      } else {
        ctx.arc(start.x * pixelRatio, start.y * pixelRatio, arcRadius, 0, -angle, false);
      }
      ctx.stroke();

      // Fill arc area with semi-transparent color
      ctx.beginPath();
      ctx.fillStyle = 'rgba(41, 98, 255, 0.12)';
      ctx.moveTo(start.x * pixelRatio, start.y * pixelRatio);
      if (angle >= 0) {
        ctx.arc(start.x * pixelRatio, start.y * pixelRatio, arcRadius, 0, -angle, true);
      } else {
        ctx.arc(start.x * pixelRatio, start.y * pixelRatio, arcRadius, 0, -angle, false);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Draw angle label
    if (options.showDegrees) {
      // Chart prices increase upward, while canvas y increases downward.
      // Invert the canvas y component so an upward trend reports a positive
      // angle instead of a negative one.
      const angleDeg = Math.atan2(start.y - end.y, end.x - start.x) * (180 / Math.PI);
      
      const mid = midpoint(start, end);
      const isUpside = end.y < start.y;
      const labelY = isUpside ? (mid.y + 15) : (mid.y - 15);

      drawLabel(
        ctx,
        `${angleDeg.toFixed(1)}°`,
        { x: mid.x, y: labelY },
        {
          font: this._drawing.style.labelFont || "12px 'Rubik', sans-serif",
          textColor: '#ffffff',
          backgroundColor: '#1e222d',
          padding: 4,
          borderRadius: 3,
          textAlign: 'center',
        },
        pixelRatio
      );
    }

    // Draw control points if selected
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
