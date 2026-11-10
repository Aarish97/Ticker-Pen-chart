import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { PriceRange } from './price-range';
import { applyStyle, drawLine, drawControlPoints, drawText, getDashPattern } from '../../rendering/canvas-utils';

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

function formatPriceChangeText(priceChange: number, priceChangePercent: number): string {
  const absVal = Math.abs(priceChange);

  let formattedShort = '';
  if (absVal >= 1e9) {
    formattedShort = (absVal / 1e9).toFixed(2) + ' B';
  } else if (absVal >= 1e6) {
    formattedShort = (absVal / 1e6).toFixed(2) + ' M';
  } else if (absVal >= 1e3) {
    formattedShort = (absVal / 1e3).toFixed(2) + ' K';
  } else {
    formattedShort = absVal.toFixed(2);
  }

  const pctStr = `(${Math.abs(priceChangePercent).toFixed(2)}%)`;
  const rawAbsStr = Math.round(absVal).toLocaleString('en-US');

  return `${formattedShort} ${pctStr} ${rawAbsStr}`;
}

export class PriceRangePaneView implements IPrimitivePaneView {
  private _renderer: PriceRangePaneRenderer;

  constructor(drawing: PriceRange) {
    this._renderer = new PriceRangePaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class PriceRangePaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: PriceRange;

  constructor(drawing: PriceRange) {
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
    const p1 = (this._drawing as any).anchorToPixel ? (this._drawing as any).anchorToPixel(anchors[0], viewport) : null;
    const p2 = (this._drawing as any).anchorToPixel ? (this._drawing as any).anchorToPixel(anchors[1], viewport) : null;

    const y1 = viewport.priceScale.priceToCoordinate(anchors[0].price);
    const y2 = viewport.priceScale.priceToCoordinate(anchors[1].price);

    if (y1 === null || y2 === null) return;

    const left = p1 && p2 ? Math.min(p1.x, p2.x) : 0;
    const right = p1 && p2 ? Math.max(p1.x, p2.x) : viewport.width;
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);
    const width = right - left;
    const height = bottom - top;

    const centerX = (left + right) / 2;
    const lineColor = '#2962ff';
    const fillColor = 'rgba(41, 98, 255, 0.2)';

    // 1. Draw filled blue rectangle background
    ctx.fillStyle = fillColor;
    ctx.fillRect(left * pixelRatio, top * pixelRatio, width * pixelRatio, height * pixelRatio);

    // 2. Draw Top and Bottom horizontal border lines + Center vertical line with dashed styling
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1 * pixelRatio;
    ctx.setLineDash([4 * pixelRatio, 4 * pixelRatio]);

    // Top border line
    ctx.beginPath();
    ctx.moveTo(left * pixelRatio, top * pixelRatio);
    ctx.lineTo(right * pixelRatio, top * pixelRatio);
    ctx.stroke();

    // Bottom border line
    ctx.beginPath();
    ctx.moveTo(left * pixelRatio, bottom * pixelRatio);
    ctx.lineTo(right * pixelRatio, bottom * pixelRatio);
    ctx.stroke();

    // 3. Center vertical line
    ctx.beginPath();
    ctx.moveTo(centerX * pixelRatio, bottom * pixelRatio);
    ctx.lineTo(centerX * pixelRatio, top * pixelRatio);
    ctx.stroke();

    // Reset line dash for arrowheads, cards, and control points
    ctx.setLineDash([]);

    // 4. Upgraded Flared Arrowhead on vertical line at dragged direction
    const isDraggedUp = p2 ? p2.y <= p1.y : y2 <= y1;
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    if (isDraggedUp) {
      // Pointing Up (▲) at top line
      const tipX = centerX * pixelRatio;
      const tipY = top * pixelRatio;
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - 4 * pixelRatio, tipY + 8 * pixelRatio);
      ctx.lineTo(tipX, tipY + 5.5 * pixelRatio);
      ctx.lineTo(tipX + 4 * pixelRatio, tipY + 8 * pixelRatio);
    } else {
      // Pointing Down (▼) at bottom line
      const tipX = centerX * pixelRatio;
      const tipY = bottom * pixelRatio;
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - 4 * pixelRatio, tipY - 8 * pixelRatio);
      ctx.lineTo(tipX, tipY - 5.5 * pixelRatio);
      ctx.lineTo(tipX + 4 * pixelRatio, tipY - 8 * pixelRatio);
    }
    ctx.closePath();
    ctx.fill();

    // 5. Dark header card matching TradingView format
    const rangeInfo = this._drawing.getRangeInfo();
    const cardText = formatPriceChangeText(rangeInfo.range, rangeInfo.percentage);

    ctx.font = `600 ${12 * pixelRatio}px 'Rubik', sans-serif`;
    const textMetrics = ctx.measureText(cardText);
    const textWidth = textMetrics.width / pixelRatio;
    const paddingX = 12;
    const cardWidth = textWidth + paddingX * 2;
    const cardHeight = 24;

    const cardX = centerX - cardWidth / 2;
    let cardY = top - cardHeight - 8;
    if (cardY < 10) {
      cardY = bottom + 8;
    }

    const cX = cardX * pixelRatio;
    const cY = cardY * pixelRatio;
    const cW = cardWidth * pixelRatio;
    const cH = cardHeight * pixelRatio;

    // Background Card
    ctx.fillStyle = '#1e222d';
    drawRoundedRect(ctx, cX, cY, cW, cH, 4 * pixelRatio);
    ctx.fill();

    // Card Text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cardText, centerX * pixelRatio, (cardY + cardHeight / 2) * pixelRatio);

    // Control points when selected/editing
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
