import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { HorizontalRay } from './horizontal-ray';
import type { Point } from '../../core/types';
import { applyStyle, drawLine, drawControlPoints, drawLabel, formatPrice } from '../../rendering/canvas-utils';

export class HorizontalRayPaneView implements IPrimitivePaneView {
  private _renderer: HorizontalRayPaneRenderer;

  constructor(drawing: HorizontalRay) {
    this._renderer = new HorizontalRayPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class HorizontalRayPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: HorizontalRay;

  constructor(drawing: HorizontalRay) {
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

    const anchor = this._drawing.anchors[0];
    const anchorPoint = this._drawing.anchorToPixel(anchor, viewport);
    const x = anchorPoint?.x ?? null;
    const y = anchorPoint?.y ?? null;

    if (x === null || y === null) return;

    applyStyle(ctx, this._drawing.style, pixelRatio);

    const options = this._drawing.horizontalRayOptions;
    const direction = options.direction ?? 'right';

    // Draw horizontal ray
    const start: Point = { x, y };
    const end: Point = {
      x: direction === 'right' ? viewport.width : 0,
      y,
    };

    drawLine(ctx, start, end, pixelRatio);



    // Draw arrow indicator at the extending end
    const arrowSize = 8 * pixelRatio;
    const arrowX = direction === 'right'
      ? (viewport.width - 1) * pixelRatio
      : 1 * pixelRatio;

    if (!(this._drawing.horizontalRayOptions as any).showArrowOnScale) {
      ctx.beginPath();
      if (direction === 'right') {
        ctx.moveTo(arrowX, y * pixelRatio);
        ctx.lineTo(arrowX - arrowSize, y * pixelRatio - arrowSize / 2);
        ctx.lineTo(arrowX - arrowSize, y * pixelRatio + arrowSize / 2);
      } else {
        ctx.moveTo(arrowX, y * pixelRatio);
        ctx.lineTo(arrowX + arrowSize, y * pixelRatio - arrowSize / 2);
        ctx.lineTo(arrowX + arrowSize, y * pixelRatio + arrowSize / 2);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Draw price label
    if (options.showPrice) {
      const labelX = direction === 'right' ? viewport.width - 10 : 10;
      drawLabel(
        ctx,
        formatPrice(anchor.price),
        { x: labelX, y },
        {
          font: this._drawing.style.labelFont || "12px 'Rubik', sans-serif",
          textColor: '#ffffff',
          backgroundColor: this._drawing.style.lineColor + 'CC',
          padding: 4,
          borderRadius: 3,
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
