import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { FlatTopBottom } from './flat-top-bottom';
import { extendLineToViewport } from '../../core/geometry';
import { applyStyle, drawLine, drawControlPoints } from '../../rendering/canvas-utils';

export class FlatTopBottomPaneView implements IPrimitivePaneView {
  private _renderer: FlatTopBottomPaneRenderer;

  constructor(drawing: FlatTopBottom) {
    this._renderer = new FlatTopBottomPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class FlatTopBottomPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: FlatTopBottom;

  constructor(drawing: FlatTopBottom) {
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
    if (!this._drawing.isValid() && this._drawing.state !== 'selected') return;

    const anchors = this._drawing.anchors;
    if (anchors.length === 0) return;

    const p1 = this._drawing.anchorToPixel(anchors[0], viewport);
    if (!p1) return;

    const p2 = anchors.length >= 2 ? this._drawing.anchorToPixel(anchors[1], viewport) : null;
    const p3 = anchors.length >= 3 ? this._drawing.anchorToPixel(anchors[2], viewport) : null;
    const p4 = anchors.length >= 4 ? this._drawing.anchorToPixel(anchors[3], viewport) : null;

    const options = this._drawing.channelOptions;
    applyStyle(ctx, this._drawing.style, pixelRatio);

    if (p2) {
      // Draw trend line
      let drawP1 = p1, drawP2 = p2;
      if (options.extendLines) {
        const extendedTrend = extendLineToViewport(p1, p2, viewport.width, viewport.height, true, true);
        drawP1 = extendedTrend.start;
        drawP2 = extendedTrend.end;
      }
      drawLine(ctx, drawP1, drawP2, pixelRatio);

      const isDrawingEarly = (this._drawing as any)._isDrawingEarly === true;
      const flatY = !isDrawingEarly ? (p3?.y ?? p4?.y) : undefined;
      if (flatY !== undefined) {
        // Calculate flat line points: span from p1.x to p2.x during preview
        const flatStartX = p4 ? (p3 ? p3.x : p1.x) : p1.x;
        const flatEndX = p4 ? p4.x : p2.x;
        const flatStart = { x: flatStartX, y: flatY };
        const flatEnd = { x: flatEndX, y: flatY };

        let drawFlatStart = flatStart, drawFlatEnd = flatEnd;
        if (options.extendLines) {
          const extendedFlat = extendLineToViewport(flatStart, flatEnd, viewport.width, viewport.height, true, true);
          drawFlatStart = extendedFlat.start;
          drawFlatEnd = extendedFlat.end;
        }

        // Draw fill if enabled
        if (options.filled && this._drawing.style.fillColor) {
          ctx.fillStyle = this._drawing.style.fillColor;
          ctx.beginPath();
          ctx.moveTo(drawP1.x * pixelRatio, drawP1.y * pixelRatio);
          ctx.lineTo(drawP2.x * pixelRatio, drawP2.y * pixelRatio);
          ctx.lineTo(drawFlatEnd.x * pixelRatio, drawFlatEnd.y * pixelRatio);
          ctx.lineTo(drawFlatStart.x * pixelRatio, drawFlatStart.y * pixelRatio);
          ctx.closePath();
          ctx.fill();
        }

        // Draw flat line
        drawLine(ctx, drawFlatStart, drawFlatEnd, pixelRatio);
      }
    }

    // Draw control points if selected
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio, this._drawing.style.lineColor || '#2962FF');
    }
  }
}
