import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { Arc } from './arc';
import { drawControlPoints } from '../../rendering/canvas-utils';

export class ArcPaneView implements IPrimitivePaneView {
  private _renderer: ArcPaneRenderer;

  constructor(drawing: Arc) {
    this._renderer = new ArcPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class ArcPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: Arc;

  constructor(drawing: Arc) {
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

    const params = this._drawing.getArcParams(viewport);
    if (!params) return;

    const startPoint = this._drawing.anchorToPixel(this._drawing.anchors[0], viewport);
    const endPoint = this._drawing.anchorToPixel(this._drawing.anchors[1], viewport);
    if (!startPoint || !endPoint) return;

    const style = this._drawing.style;

    ctx.save();
    ctx.setLineDash([]);

    // Draw stroke style configuration
    ctx.strokeStyle = style.lineColor;
    ctx.lineWidth = style.lineWidth * pixelRatio;

    if (params.isCollinear) {
      ctx.beginPath();
      ctx.moveTo(startPoint.x * pixelRatio, startPoint.y * pixelRatio);
      ctx.lineTo(endPoint.x * pixelRatio, endPoint.y * pixelRatio);
      ctx.stroke();
      ctx.restore();

      // Draw control points if selected
      const state = this._drawing.state;
      if (state === 'selected' || state === 'editing' || state === 'hovered') {
        const controlPoints = this._drawing.getControlPoints(viewport);
        drawControlPoints(ctx, controlPoints, null, pixelRatio);
      }
      return;
    }

    const { center, radius, startAngle, endAngle, anticlockwise } = params;
    const options = this._drawing.arcOptions;

    // Draw fill if enabled (circular segment)
    if (options.filled && style.fillColor) {
      ctx.fillStyle = style.fillColor;
      ctx.beginPath();
      ctx.arc(
        center.x * pixelRatio,
        center.y * pixelRatio,
        radius * pixelRatio,
        startAngle,
        endAngle,
        anticlockwise
      );
      ctx.closePath();
      ctx.fill();
    }

    // Draw arc stroke
    ctx.beginPath();
    ctx.arc(
      center.x * pixelRatio,
      center.y * pixelRatio,
      radius * pixelRatio,
      startAngle,
      endAngle,
      anticlockwise
    );
    ctx.stroke();

    ctx.restore();

    // Draw control points if selected
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
