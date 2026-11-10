import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { DoubleCurve } from './double-curve';
import { applyStyle, drawControlPoints } from '../../rendering/canvas-utils';

export class DoubleCurvePaneView implements IPrimitivePaneView {
  private _renderer: DoubleCurvePaneRenderer;

  constructor(drawing: DoubleCurve) {
    this._renderer = new DoubleCurvePaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class DoubleCurvePaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: DoubleCurve;

  constructor(drawing: DoubleCurve) {
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

    const { start, control1, control2, end } = controlPts;
    const options = this._drawing.doubleCurveOptions;

    applyStyle(ctx, this._drawing.style, pixelRatio);

    // Draw control lines if enabled
    if (options.showControlPoints) {
      ctx.save();
      ctx.strokeStyle = this._drawing.style.lineColor || '#2962FF';
      ctx.globalAlpha = 0.3;
      ctx.setLineDash([4 * pixelRatio, 4 * pixelRatio]);
      ctx.lineWidth = 1 * pixelRatio;

      if (this._drawing.anchors.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(start.x * pixelRatio, start.y * pixelRatio);
        ctx.lineTo(control1.x * pixelRatio, control1.y * pixelRatio);
        ctx.stroke();
      }

      if (this._drawing.anchors.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(end.x * pixelRatio, end.y * pixelRatio);
        ctx.lineTo(control2.x * pixelRatio, control2.y * pixelRatio);
        ctx.stroke();
      }

      ctx.restore();

      // Draw control point markers if enabled
      const markerRadius = 4 * pixelRatio;
      ctx.fillStyle = this._drawing.style.lineColor || '#2962FF';

      if (this._drawing.anchors.length >= 3) {
        ctx.beginPath();
        ctx.arc(control1.x * pixelRatio, control1.y * pixelRatio, markerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = this._drawing.style.lineColor || '#2962FF';
        ctx.lineWidth = 2 * pixelRatio;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }

      if (this._drawing.anchors.length >= 4) {
        ctx.beginPath();
        ctx.arc(control2.x * pixelRatio, control2.y * pixelRatio, markerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = this._drawing.style.lineColor || '#2962FF';
        ctx.lineWidth = 2 * pixelRatio;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }

    // Draw the Bezier curve
    applyStyle(ctx, this._drawing.style, pixelRatio);
    ctx.beginPath();
    ctx.moveTo(start.x * pixelRatio, start.y * pixelRatio);

    if (this._drawing.anchors.length >= 3) {
      ctx.bezierCurveTo(
        control1.x * pixelRatio,
        control1.y * pixelRatio,
        control2.x * pixelRatio,
        control2.y * pixelRatio,
        end.x * pixelRatio,
        end.y * pixelRatio
      );
    } else {
      ctx.lineTo(end.x * pixelRatio, end.y * pixelRatio);
    }

    ctx.stroke();

    // Draw control points if selected
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const start = this._drawing.anchorToPixel(this._drawing.anchors[0], viewport);
      const end = this._drawing.anchors[1] ? this._drawing.anchorToPixel(this._drawing.anchors[1], viewport) : null;
      const through1 = this._drawing.anchors[2] ? this._drawing.anchorToPixel(this._drawing.anchors[2], viewport) : null;
      const through2 = this._drawing.anchors[3] ? this._drawing.anchorToPixel(this._drawing.anchors[3], viewport) : null;

      const controlPoints = [];
      if (start) controlPoints.push({ index: 0, x: start.x, y: start.y, radius: 6 });
      if (end) controlPoints.push({ index: 1, x: end.x, y: end.y, radius: 6 });
      if (through1) controlPoints.push({ index: 2, x: through1.x, y: through1.y, radius: 6 });
      if (through2) controlPoints.push({ index: 3, x: through2.x, y: through2.y, radius: 6 });

      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
