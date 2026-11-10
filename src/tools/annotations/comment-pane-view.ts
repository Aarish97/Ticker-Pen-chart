import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { Comment } from './comment';
import { drawControlPoints } from '../../rendering/canvas-utils';

export class CommentPaneView implements IPrimitivePaneView {
  private _renderer: CommentPaneRenderer;

  constructor(drawing: Comment) {
    this._renderer = new CommentPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class CommentPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: Comment;

  constructor(drawing: Comment) {
    this._drawing = drawing;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
      this.drawImpl(scope);
    });
  }

  drawImpl(scope: BitmapCoordinatesRenderingScope): void {
    const { context: ctx, horizontalPixelRatio } = scope;
    const pixelRatio = horizontalPixelRatio;

    const viewport = this._drawing.getViewport();
    if (!viewport) return;
    if (!this._drawing.options.visible) return;
    if (!this._drawing.isValid()) return;

    const anchor = this._drawing.anchors[0];
    const p = this._drawing.anchorToPixel(anchor, viewport);
    if (!p) return;

    const options = this._drawing.commentOptions;
    const text = options.text && options.text.trim() ? options.text.trim() : 'Add text';
    const fontSize = (options.fontSize ?? 11) * pixelRatio;
    const bgColor = options.backgroundColor ?? 'rgba(37, 37, 38, 0.95)';
    const textColor = options.textColor ?? '#C5C6A6';

    const x = p.x * pixelRatio;
    const y = p.y * pixelRatio;

    ctx.save();

    // Measure text (multiline support)
    ctx.font = `bold ${fontSize}px 'Rubik', sans-serif`;
    const lines = text.split('\n');
    const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width));

    const paddingX = 14 * pixelRatio;
    const paddingY = 8 * pixelRatio;
    const boxWidth = Math.max(80 * pixelRatio, maxLineWidth + paddingX * 2);
    const boxHeight = (fontSize * lines.length) + (lines.length - 1) * 4 * pixelRatio + paddingY * 2;

    // Constant proportions for tail and corners to prevent distortion when height expands
    const cornerRadius = 6 * pixelRatio;
    const tailHeight = 8 * pixelRatio;
    const tailWidth = 10 * pixelRatio;

    // Box positioned above anchor, tail points down-left to anchor point
    const boxX = x;
    const boxY = y - tailHeight - boxHeight;

    // Draw the comment box shape (matching comment box.svg)
    ctx.fillStyle = bgColor;

    // Shadow for premium look (matching pin text box)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 8 * pixelRatio;
    ctx.shadowOffsetY = 2 * pixelRatio;

    ctx.beginPath();

    // Start at top-left corner (after radius)
    ctx.moveTo(boxX + cornerRadius, boxY);

    // Top edge
    ctx.lineTo(boxX + boxWidth - cornerRadius, boxY);

    // Top-right corner
    ctx.arcTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + cornerRadius, cornerRadius);

    // Right edge
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight - cornerRadius);

    // Bottom-right corner
    ctx.arcTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - cornerRadius, boxY + boxHeight, cornerRadius);

    // Bottom edge to the start of the tail slope
    ctx.lineTo(boxX + tailWidth, boxY + boxHeight);

    // Tail right slope (diagonal down-left to tail tip at x, y)
    ctx.lineTo(x, y);

    // Left edge goes straight up from tail tip (x, y) to top-left corner start
    ctx.lineTo(boxX, boxY + cornerRadius);

    // Top-left corner
    ctx.arcTo(boxX, boxY, boxX + cornerRadius, boxY, cornerRadius);

    ctx.closePath();
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Draw text inside the box (multiline centered like pin)
    ctx.fillStyle = textColor;
    ctx.font = `bold ${fontSize}px 'Rubik', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this._drawing.state !== 'editing') {
      const startTextY = boxY + paddingY + fontSize / 2;
      lines.forEach((line, index) => {
        ctx.fillText(line, boxX + boxWidth / 2, startTextY + index * (fontSize + 4 * pixelRatio));
      });
    }

    ctx.restore();

    // Draw control points if selected
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
