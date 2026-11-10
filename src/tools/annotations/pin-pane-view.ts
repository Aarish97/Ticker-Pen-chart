import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { Pin } from './pin';
import { drawControlPoints } from '../../rendering/canvas-utils';

export class PinPaneView implements IPrimitivePaneView {
  private _renderer: PinPaneRenderer;

  constructor(drawing: Pin) {
    this._renderer = new PinPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class PinPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: Pin;

  constructor(drawing: Pin) {
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

    const state: string = this._drawing.state;

    const anchor = this._drawing.anchors[0];
    const p = this._drawing.anchorToPixel(anchor, viewport);
    if (!p) return;

    const options = this._drawing.pinOptions;
    // Default color from pin.svg is rgb(4,136,219) -> #0488DB
    const color = options.color ?? '#0488DB';
    const size = (options.size ?? 24) * pixelRatio;

    const x = p.x * pixelRatio;
    const y = p.y * pixelRatio;

    ctx.save();

    // 1. Draw SVG Path for Pin (Always Visible)
    ctx.translate(x, y);
    ctx.scale(size / 90, size / 90);
    ctx.translate(-45, -90);

    // Draw pin body
    ctx.fillStyle = color;
    const pinPath = new Path2D("M 45 90 c -1.415 0 -2.725 -0.748 -3.444 -1.966 l -4.385 -7.417 C 28.167 65.396 19.664 51.02 16.759 45.189 c -2.112 -4.331 -3.175 -8.955 -3.175 -13.773 C 13.584 14.093 27.677 0 45 0 c 17.323 0 31.416 14.093 31.416 31.416 c 0 4.815 -1.063 9.438 -3.157 13.741 c -0.025 0.052 -0.053 0.104 -0.08 0.155 c -2.961 5.909 -11.41 20.193 -20.353 35.309 l -4.382 7.413 C 47.725 89.252 46.415 90 45 90 z");
    ctx.fill(pinPath);

    // Draw inner circle (hole)
    ctx.fillStyle = "#FFFFFF";
    const holePath = new Path2D("M 45 45.678 c -8.474 0 -15.369 -6.894 -15.369 -15.368 S 36.526 14.941 45 14.941 c 8.474 0 15.368 6.895 15.368 15.369 S 53.474 45.678 45 45.678 z");
    ctx.fill(holePath);

    ctx.restore();

    // 2. Draw text panel above the pin (Only when hovered/selected/editing)
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
      const panelY = y - size - 8 * pixelRatio - panelHeight;

      // Draw beak
      ctx.fillStyle = 'rgba(37, 37, 38, 0.95)'; // Dark gray panel background
      ctx.beginPath();
      ctx.moveTo(x, y - size - 2 * pixelRatio);
      ctx.lineTo(x - 5 * pixelRatio, y - size - 8 * pixelRatio);
      ctx.lineTo(x + 5 * pixelRatio, y - size - 8 * pixelRatio);
      ctx.closePath();
      ctx.fill();

      // Draw rounded panel with a thin border and shadow
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
