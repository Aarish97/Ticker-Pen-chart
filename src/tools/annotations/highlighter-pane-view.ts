import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { Highlighter } from './highlighter';
import type { Point } from '../../core/types';
import { drawControlPoints } from '../../rendering/canvas-utils';

export class HighlighterPaneView implements IPrimitivePaneView {
  private _renderer: HighlighterPaneRenderer;

  constructor(drawing: Highlighter) {
    this._renderer = new HighlighterPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class HighlighterPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: Highlighter;

  constructor(drawing: Highlighter) {
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

    const options = this._drawing.highlighterOptions;
    const highlighterWidth = options.highlighterWidth ?? 20;
    const opacity = options.opacity ?? 0.4;

    // Get all points
    const points: Point[] = [];
    for (const anchor of this._drawing.anchors) {
      const p = this._drawing.anchorToPixel(anchor, viewport);
      if (p) points.push(p);
    }

    if (points.length < 2) return;

    // Draw the highlighter stroke
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = this._drawing.style.lineColor || '#2962FF';
    ctx.lineWidth = highlighterWidth * pixelRatio;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(points[0].x * pixelRatio, points[0].y * pixelRatio);

    // Use quadratic curves for smoother lines (like brush tool)
    for (let i = 1; i < points.length - 1; i++) {
      ctx.quadraticCurveTo(
        points[i].x * pixelRatio,
        points[i].y * pixelRatio,
        ((points[i].x + points[i + 1].x) / 2) * pixelRatio,
        ((points[i].y + points[i + 1].y) / 2) * pixelRatio
      );
    }

    // Last point
    if (points.length > 1) {
      ctx.lineTo(
        points[points.length - 1].x * pixelRatio,
        points[points.length - 1].y * pixelRatio
      );
    }

    ctx.stroke();
    ctx.restore();

    // Draw control points if selected (only first and last like brush tool)
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = [
        { index: 0, x: points[0].x, y: points[0].y, radius: 6 },
        { index: points.length - 1, x: points[points.length - 1].x, y: points[points.length - 1].y, radius: 6 },
      ];
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
