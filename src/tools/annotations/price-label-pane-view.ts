import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { PriceLabel } from './price-label';
import { drawControlPoints, formatPrice } from '../../rendering/canvas-utils';

export class PriceLabelPaneView implements IPrimitivePaneView {
  private _renderer: PriceLabelPaneRenderer;

  constructor(drawing: PriceLabel) {
    this._renderer = new PriceLabelPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class PriceLabelPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: PriceLabel;

  constructor(drawing: PriceLabel) {
    this._drawing = drawing;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
      this.drawImpl(scope);
    });
  }

  private drawImpl(scope: BitmapCoordinatesRenderingScope): void {
    const { context: ctx, horizontalPixelRatio, bitmapSize } = scope;
    const pixelRatio = horizontalPixelRatio;

    const viewport = this._drawing.getViewport();
    if (!viewport) return;
    if (!this._drawing.options.visible) return;
    if (!this._drawing.isValid()) return;

    const anchor = this._drawing.anchors[0];
    const p = this._drawing.anchorToPixel(anchor, viewport);
    if (!p) return;

    const options = this._drawing.labelOptions;
    const fontSize = (options.fontSize ?? 11) * pixelRatio;
    const backgroundColor = options.backgroundColor ?? '#2962FF';
    const textColor = options.textColor ?? '#FFFFFF';
    const decimals = options.decimals;
    const x = p.x * pixelRatio;
    const y = p.y * pixelRatio;

    const state = this._drawing.state;
    const isSelected = state === 'selected' || state === 'editing' || state === 'hovered';

    const priceText = `$${formatPrice(anchor.price, decimals)}`;
    ctx.font = `bold ${fontSize}px 'Rubik', sans-serif`;
    const textMetrics = ctx.measureText(priceText);
    const textWidth = textMetrics.width;

    const paddingX = 12 * pixelRatio;
    const paddingY = 8 * pixelRatio;
    const boxWidth = Math.max(70 * pixelRatio, textWidth + paddingX * 2);
    const boxHeight = fontSize + paddingY * 2;

    const tailDx = 22 * pixelRatio;
    const tailDy = -20 * pixelRatio;
    const boxLeft = x + tailDx;
    const boxTop = y + tailDy - boxHeight;

    ctx.save();

    // 1. Draw pointer tail (solid filled polygon matching badge color)
    ctx.fillStyle = backgroundColor;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(boxLeft, y + tailDy - 4 * pixelRatio);
    ctx.lineTo(boxLeft + 12 * pixelRatio, y + tailDy);
    ctx.closePath();
    ctx.fill();

    // 2. Draw Price Badge
    ctx.beginPath();
    ctx.roundRect(boxLeft, boxTop, boxWidth, boxHeight, 6 * pixelRatio);
    ctx.fill();

    // 3. Draw Price Text
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(priceText, boxLeft + boxWidth / 2, boxTop + boxHeight / 2);

    // 4. Draw Anchor Point: hollow blue circle (only when selected/editing)
    if (isSelected) {
      const circleRadius = 5 * pixelRatio;
      ctx.strokeStyle = backgroundColor;
      ctx.lineWidth = 2 * pixelRatio;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, y, circleRadius - pixelRatio / 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    // Draw control points if selected
    if (isSelected) {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
