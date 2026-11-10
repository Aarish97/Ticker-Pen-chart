import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { AnchoredText } from './anchored-text';
import { drawControlPoints } from '../../rendering/canvas-utils';

export class AnchoredTextPaneView implements IPrimitivePaneView {
  private _renderer: AnchoredTextPaneRenderer;

  constructor(drawing: AnchoredText) {
    this._renderer = new AnchoredTextPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class AnchoredTextPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: AnchoredText;

  constructor(drawing: AnchoredText) {
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
    const anchorPos = this._drawing.anchorToPixel(anchors[0], viewport);
    const textPos = this._drawing.anchorToPixel(anchors[1], viewport);

    if (!anchorPos || !textPos) return;

    const options = this._drawing.textOptions;
    const style = this._drawing.style;
    const text = options.text ?? '';
    const fontSize = (options.fontSize ?? 12) * pixelRatio;

    ctx.save();

    const state = this._drawing.state;
    const isSelected = state === 'selected' || state === 'editing' || state === 'hovered';
    const circleRadius = 5 * pixelRatio;
    const ax = anchorPos.x * pixelRatio;
    const ay = anchorPos.y * pixelRatio;
    const tx = textPos.x * pixelRatio;
    const ty = textPos.y * pixelRatio;

    // 1. Draw connector line (clipped between the two circles if selected)
    if (options.showConnector) {
      const dx = tx - ax;
      const dy = ty - ay;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      ctx.strokeStyle = style.lineColor ?? '#0488DB';
      ctx.lineWidth = 1 * pixelRatio;
      ctx.setLineDash([]); // Reset line dash to solid line
      ctx.beginPath();
      
      if (isSelected && dist > circleRadius * 2) {
        const ux = dx / dist;
        const uy = dy / dist;
        ctx.moveTo(ax + ux * circleRadius, ay + uy * circleRadius);
        ctx.lineTo(tx - ux * circleRadius, ty - uy * circleRadius);
      } else {
        ctx.moveTo(ax, ay);
        ctx.lineTo(tx, ty);
      }
      ctx.stroke();
    }

    // 2. Draw both anchor points as hollow blue circles (only when selected/editing)
    if (isSelected) {
      ctx.strokeStyle = style.lineColor ?? '#0488DB';
      ctx.lineWidth = 2 * pixelRatio;
      ctx.setLineDash([]);

      // Anchor Circle 1
      ctx.beginPath();
      ctx.arc(ax, ay, circleRadius - pixelRatio / 2, 0, Math.PI * 2);
      ctx.stroke();

      // Anchor Circle 2 (text position)
      ctx.beginPath();
      ctx.arc(tx, ty, circleRadius - pixelRatio / 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Draw text box (sits to the right of Circle 2)
    const labelText = text && text.trim() ? text.trim() : 'Add text';
    const textFontSize = 11 * pixelRatio;
    ctx.font = `bold ${textFontSize}px 'Rubik', sans-serif`;
    const lines = labelText.split('\n');
    const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    
    const panelWidth = Math.max(80 * pixelRatio, maxLineWidth + 28 * pixelRatio);
    const panelHeight = (textFontSize * lines.length) + (lines.length - 1) * 4 * pixelRatio + 16 * pixelRatio;

    const boxLeft = tx + circleRadius + 4 * pixelRatio;
    const boxTop = ty - panelHeight / 2;

    // Draw dark rounded panel with shadow (matching pin text box)
    ctx.fillStyle = 'rgba(37, 37, 38, 0.95)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 8 * pixelRatio;
    ctx.shadowOffsetY = 2 * pixelRatio;

    ctx.beginPath();
    ctx.roundRect(boxLeft, boxTop, panelWidth, panelHeight, 6 * pixelRatio);
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Draw multiline text inside box
    if (this._drawing.state !== 'editing') {
      ctx.fillStyle = '#C5C6A6';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const startTextY = boxTop + 8 * pixelRatio + textFontSize / 2;
      lines.forEach((line, index) => {
        ctx.fillText(line, boxLeft + panelWidth / 2, startTextY + index * (textFontSize + 4 * pixelRatio));
      });
    }

    ctx.restore();

    // Draw control points if selected
    if (isSelected) {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
