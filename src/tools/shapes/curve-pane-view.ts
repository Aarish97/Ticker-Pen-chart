import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { Curve } from './curve';
import { applyStyle, drawControlPoints } from '../../rendering/canvas-utils';

export class CurvePaneView implements IPrimitivePaneView {
  private _renderer: CurvePaneRenderer;

  constructor(drawing: Curve) {
    this._renderer = new CurvePaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class CurvePaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: Curve;

  constructor(drawing: Curve) {
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

    const controlPts = this._drawing.getControlPointsPixels(viewport);
    if (!controlPts) return;

    const { start, control, end } = controlPts;
    const options = this._drawing.curveOptions;

    applyStyle(ctx, this._drawing.style, pixelRatio);

    // Draw control lines if enabled (before the curve)
    if (options.showControlLines && this._drawing.anchors.length >= 3) {
      ctx.save();
      ctx.strokeStyle = this._drawing.style.lineColor || '#2962FF';
      ctx.globalAlpha = 0.3;
      ctx.setLineDash([4 * pixelRatio, 4 * pixelRatio]);
      ctx.lineWidth = 1 * pixelRatio;

      // Start to control
      ctx.beginPath();
      ctx.moveTo(start.x * pixelRatio, start.y * pixelRatio);
      ctx.lineTo(control.x * pixelRatio, control.y * pixelRatio);
      ctx.stroke();

      // Control to end
      ctx.beginPath();
      ctx.moveTo(control.x * pixelRatio, control.y * pixelRatio);
      ctx.lineTo(end.x * pixelRatio, end.y * pixelRatio);
      ctx.stroke();

      ctx.restore();
    }

    // Draw the quadratic Bezier curve
    applyStyle(ctx, this._drawing.style, pixelRatio);
    ctx.beginPath();
    ctx.moveTo(start.x * pixelRatio, start.y * pixelRatio);
    if (this._drawing.anchors.length >= 3) {
      ctx.quadraticCurveTo(
        control.x * pixelRatio,
        control.y * pixelRatio,
        end.x * pixelRatio,
        end.y * pixelRatio
      );
    } else {
      ctx.lineTo(end.x * pixelRatio, end.y * pixelRatio);
    }
    ctx.stroke();

    // Draw control point marker if showing control lines
    if (options.showControlLines && this._drawing.anchors.length >= 3) {
      const markerRadius = 4 * pixelRatio;
      ctx.fillStyle = this._drawing.style.lineColor || '#2962FF';

      // Control point (hollow)
      ctx.beginPath();
      ctx.arc(control.x * pixelRatio, control.y * pixelRatio, markerRadius, 0, Math.PI * 2);
      ctx.strokeStyle = this._drawing.style.lineColor || '#2962FF';
      ctx.lineWidth = 2 * pixelRatio;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    // Draw control points if selected
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const start = this._drawing.anchorToPixel(this._drawing.anchors[0], viewport);
      const end = this._drawing.anchors[1] ? this._drawing.anchorToPixel(this._drawing.anchors[1], viewport) : null;
      const through = this._drawing.anchors[2] ? this._drawing.anchorToPixel(this._drawing.anchors[2], viewport) : null;

      const controlPoints = [];
      if (start) controlPoints.push({ index: 0, x: start.x, y: start.y, radius: 6 });
      if (end) controlPoints.push({ index: 1, x: end.x, y: end.y, radius: 6 });
      if (through) controlPoints.push({ index: 2, x: through.x, y: through.y, radius: 6 });

      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
