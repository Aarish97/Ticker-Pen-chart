import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { FlagMark } from './flag-mark';
import { drawControlPoints } from '../../rendering/canvas-utils';

export class FlagMarkPaneView implements IPrimitivePaneView {
  private _renderer: FlagMarkPaneRenderer;

  constructor(drawing: FlagMark) {
    this._renderer = new FlagMarkPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class FlagMarkPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: FlagMark;

  constructor(drawing: FlagMark) {
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

    const options = this._drawing.flagOptions;
    const color = this._drawing.getFlagColor();
    const size = (options.size ?? 30) * pixelRatio;
    const poleHeight = size * 1.5;

    const x = p.x * pixelRatio;
    const y = p.y * pixelRatio;

    ctx.save();

    const wickWidth = Math.max(1, Math.round(1 * pixelRatio));
    const wickX = Math.round(x) - Math.floor(wickWidth / 2);

    // 1. Draw pole line (matching candle wick 1px rect thickness and crispness)
    ctx.fillStyle = "#40403F";
    ctx.fillRect(wickX, y - poleHeight, wickWidth, poleHeight);

    // 2. Draw flag banner attached to the pole
    ctx.save();
    ctx.translate(wickX, y - poleHeight);
    const scaleFactor = poleHeight / 40.106;
    ctx.scale(scaleFactor, scaleFactor);
    ctx.fillStyle = color;
    const flagPath = new Path2D("M13.406,6.666c-0.203,0.162-0.203,0.471,0,0.633l6.969,5.576c0.206,0.129,0.115,0.447-0.128,0.447H0.733V0.633h19.515c0.243,0,0.334,0.318,0.128,0.447L13.406,6.666z");
    ctx.fill(flagPath);
    ctx.restore();

    ctx.restore();

    // 2. Draw text panel above the flag (Only when hovered/selected/editing)
    const state: string = this._drawing.state;
    const isVisible = state === 'hovered' || state === 'selected' || state === 'editing' || state === 'hovered';
    if (isVisible) {
      const labelText = options.label && options.label.trim() ? options.label.trim() : 'Add text';
      const fontSize = 11 * pixelRatio;
      ctx.font = `bold ${fontSize}px 'Rubik', sans-serif`;
      
      const lines = labelText.split('\n');
      const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
      const panelHeight = (fontSize * lines.length) + (lines.length - 1) * 4 * pixelRatio + 16 * pixelRatio;
      const panelWidth = Math.max(80 * pixelRatio, maxLineWidth + 28 * pixelRatio);
      const panelX = x - panelWidth / 2;
      const panelY = y - poleHeight - 8 * pixelRatio - panelHeight;

      // Draw beak
      ctx.fillStyle = 'rgba(37, 37, 38, 0.95)'; // Dark gray panel background
      ctx.beginPath();
      ctx.moveTo(x, y - poleHeight - 2 * pixelRatio);
      ctx.lineTo(x - 5 * pixelRatio, y - poleHeight - 8 * pixelRatio);
      ctx.lineTo(x + 5 * pixelRatio, y - poleHeight - 8 * pixelRatio);
      ctx.closePath();
      ctx.fill();

      // Draw rounded panel with shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 8 * pixelRatio;
      ctx.shadowOffsetY = 2 * pixelRatio;
      
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 6 * pixelRatio);
      ctx.fill();

      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Draw text inside the panel (multiline)
      if (state !== 'editing') {
        ctx.fillStyle = '#C5C6A6'; // Symmetrical text color matching the design
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const startTextY = panelY + 8 * pixelRatio + fontSize / 2;
        lines.forEach((line, index) => {
          ctx.fillText(line, x, startTextY + index * (fontSize + 4 * pixelRatio));
        });
      }
    }

    // Draw control points if selected
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
