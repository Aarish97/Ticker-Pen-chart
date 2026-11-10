import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { Signpost } from './signpost';
import { drawControlPoints } from '../../rendering/canvas-utils';

export class SignpostPaneView implements IPrimitivePaneView {
  private _renderer: SignpostPaneRenderer;

  constructor(drawing: Signpost) {
    this._renderer = new SignpostPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class SignpostPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: Signpost;

  constructor(drawing: Signpost) {
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
    const p = this._drawing.anchorToPixel(anchor, viewport);
    if (!p) return;

    const options = this._drawing.signpostOptions;
    const text = options.text && options.text.trim() ? options.text.trim() : 'Add text';
    const fontSize = (options.fontSize ?? 11) * pixelRatio;
    const textColor = options.textColor ?? '#000000';
    const paddingX = 12 * pixelRatio;
    const paddingY = 6 * pixelRatio;
    const basePoleHeight = 40 * pixelRatio;

    const x = p.x * pixelRatio;
    const y = p.y * pixelRatio; // y is now the center of the top ring (anchor point)

    ctx.save();
    ctx.setLineDash([]);

    // Measure text (supporting multiline)
    ctx.font = `bold ${fontSize}px 'Rubik', sans-serif`;
    const lines = text.split('\n');
    const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    const boardWidth = Math.max(36 * pixelRatio, maxLineWidth + paddingX * 2);
    const boardHeight = (fontSize * lines.length) + (lines.length - 1) * 4 * pixelRatio + paddingY * 2;

    const baseBoardHeight = fontSize + paddingY * 2; // base single-line board height
    const scaleTop = baseBoardHeight / 13.17;
    const upsideDown = options.upsideDown ?? false;
    const extraPoleHeight = (options.extraPoleHeight ?? 0) * pixelRatio;
    const poleHeight = Math.max(8 * pixelRatio, basePoleHeight + extraPoleHeight);

    let ringCenterY: number;
    let boardTopY: number;
    let boardBottomY: number;
    let poleTopY: number;
    let _poleBottomY: number;

    if (!upsideDown) {
      ringCenterY = y;
      boardTopY = y + 8.886 * scaleTop;
      boardBottomY = boardTopY + boardHeight;
      poleTopY = boardBottomY;
      _poleBottomY = boardBottomY + poleHeight;
    } else {
      ringCenterY = y;
      boardBottomY = y - 8.886 * scaleTop;
      boardTopY = boardBottomY - boardHeight;
      _poleBottomY = boardTopY;
      poleTopY = boardTopY - poleHeight;
    }

    // Design Colors from sign post.svg
    const frameColor = '#FFFFFF';
    const ringColor = '#B3303B';

    // 1. Draw pole line (matching candle wick line thickness and crispness)
    const wickWidth = Math.max(1, Math.round(1 * pixelRatio));
    const wickX = Math.round(x) - Math.floor(wickWidth / 2);
    ctx.fillStyle = frameColor;
    const startY = Math.min(poleTopY, poleTopY + poleHeight);
    const h = Math.abs(poleHeight);
    ctx.fillRect(wickX, startY, wickWidth, h);

    // 2. Draw hanger line (matching candle wick line thickness and crispness)
    const hangerHeight = 6.21 * scaleTop;
    if (!upsideDown) {
      ctx.fillRect(wickX, boardTopY - hangerHeight, wickWidth, hangerHeight);
    } else {
      ctx.fillRect(wickX, boardBottomY, wickWidth, hangerHeight);
    }

    // 3. Draw top ring (Path from SVG) - centered at ringCenterY
    ctx.fillStyle = ringColor;
    ctx.beginPath();
    ctx.arc(x, ringCenterY, 3.31 * scaleTop, 0, Math.PI * 2);
    ctx.arc(x, ringCenterY, 2.31 * scaleTop, 0, Math.PI * 2, true);
    ctx.fill();

    // 4. Draw board background (solid white) with shadow for premium look
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 4 * pixelRatio;
    ctx.shadowOffsetY = 1 * pixelRatio;

    ctx.fillStyle = frameColor;
    ctx.beginPath();
    ctx.roundRect(
      x - boardWidth / 2,
      boardTopY,
      boardWidth,
      boardHeight,
      1.79 * scaleTop
    );
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 5. Draw a thin border around the board to give it the frame look
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1 * pixelRatio;
    ctx.beginPath();
    ctx.roundRect(
      x - boardWidth / 2,
      boardTopY,
      boardWidth,
      boardHeight,
      1.79 * scaleTop
    );
    ctx.stroke();

    // 6. Draw text inside the board (multiline)
    if (this._drawing.state !== 'editing') {
      ctx.fillStyle = textColor;
      ctx.font = `bold ${fontSize}px 'Rubik', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const startTextY = boardTopY + paddingY + fontSize / 2;
      lines.forEach((line, index) => {
        ctx.fillText(line, x, startTextY + index * (fontSize + 4 * pixelRatio));
      });
    }

    // 7. Draw base circle at anchor (center of top ring)
    ctx.fillStyle = ringColor;
    ctx.beginPath();
    ctx.arc(x, y, 3 * pixelRatio, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Draw control points if selected
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
