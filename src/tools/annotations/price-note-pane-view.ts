import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { PriceNote } from './price-note';
import { drawControlPoints, formatPrice } from '../../rendering/canvas-utils';

export class PriceNotePaneView implements IPrimitivePaneView {
  private _renderer: PriceNotePaneRenderer;

  constructor(drawing: PriceNote) {
    this._renderer = new PriceNotePaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class PriceNotePaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: PriceNote;

  constructor(drawing: PriceNote) {
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
    const p0 = this._drawing.anchorToPixel(anchors[0], viewport);
    const p1 = this._drawing.anchorToPixel(anchors[1], viewport);
    if (!p0 || !p1) return;

    const options = this._drawing.noteOptions;
    const style = this._drawing.style;
    const fontSize = (options.fontSize ?? 11) * pixelRatio;
    const badgeBgColor = style.lineColor ?? '#0488DB';
    const text = `$${formatPrice(anchors[0].price)}`;

    const x0 = p0.x * pixelRatio;
    const y0 = p0.y * pixelRatio;
    const x1 = p1.x * pixelRatio;
    const y1 = p1.y * pixelRatio;

    const startRadius = 5 * pixelRatio;
    const endRadius = 4 * pixelRatio;

    ctx.save();

    const state = this._drawing.state;
    const isSelected = state === 'selected' || state === 'editing' || state === 'hovered';

    // 1. Draw connector line (clipped between the two circles if selected)
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);

    ctx.strokeStyle = style.lineColor ?? '#0488DB';
    ctx.lineWidth = 1 * pixelRatio;
    ctx.setLineDash([]); // Reset line dash to solid line
    ctx.beginPath();
    
    if (isSelected && dist > (startRadius + endRadius)) {
      const ux = dx / dist;
      const uy = dy / dist;
      ctx.moveTo(x0 + ux * startRadius, y0 + uy * startRadius);
      ctx.lineTo(x1 - ux * endRadius, y1 - uy * endRadius);
    } else {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();

    // 2. Draw Start and End Point circles (only when selected/editing)
    if (isSelected) {
      // Draw Start Point: hollow blue circle
      ctx.strokeStyle = style.lineColor ?? '#0488DB';
      ctx.lineWidth = 2 * pixelRatio;
      ctx.beginPath();
      ctx.arc(x0, y0, startRadius - pixelRatio / 2, 0, Math.PI * 2);
      ctx.stroke();

      // Draw End Point: solid black circle with outline
      ctx.fillStyle = '#000000'; // Black fill inside end circle
      ctx.beginPath();
      ctx.arc(x1, y1, endRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = style.lineColor ?? '#0488DB';
      ctx.lineWidth = 1.5 * pixelRatio;
      ctx.stroke();
    }

    // 4. Draw Price Badge (sits immediately to the right of Circle 2)
    ctx.font = `bold ${fontSize}px 'Rubik', sans-serif`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    
    const paddingX = 10 * pixelRatio;
    const paddingY = 6 * pixelRatio;
    const boxWidth = Math.max(80 * pixelRatio, textWidth + paddingX * 2);
    const boxHeight = fontSize + paddingY * 2;

    // Badge overlaps the solid circle slightly (2px overlap)
    const boxLeft = x1 + endRadius - 2 * pixelRatio;
    const boxTop = y1 - boxHeight / 2;

    ctx.fillStyle = badgeBgColor;
    ctx.beginPath();
    ctx.roundRect(boxLeft, boxTop, boxWidth, boxHeight, 6 * pixelRatio);
    ctx.fill();

    // 5. Draw Price text inside badge
    ctx.fillStyle = '#FFFFFF'; // White text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, boxLeft + boxWidth / 2, y1);

    ctx.restore();

    // Draw control points if selected
    if (isSelected) {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
