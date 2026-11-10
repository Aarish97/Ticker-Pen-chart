import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { ParallelChannel } from './parallel-channel';
import { extendLineToViewport } from '../../core/geometry';
import { applyStyle, drawLine, drawControlPoints, drawDashedLine } from '../../rendering/canvas-utils';

export class ParallelChannelPaneView implements IPrimitivePaneView {
  private _renderer: ParallelChannelPaneRenderer;

  constructor(drawing: ParallelChannel) {
    this._renderer = new ParallelChannelPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class ParallelChannelPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: ParallelChannel;

  constructor(drawing: ParallelChannel) {
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
    if (this._drawing.anchors.length < 2) return;

    const anchors = this._drawing.anchors;
    const p1 = this._drawing.anchorToPixel(anchors[0], viewport);
    const p2 = this._drawing.anchorToPixel(anchors[1], viewport);

    if (!p1 || !p2) return;

    applyStyle(ctx, this._drawing.style, pixelRatio);

    const options = this._drawing.channelOptions;

    const isDrawingEarly = (this._drawing as any)._isDrawingEarly === true;
    // Calculate parallel points
    let p1Parallel = p1;
    let p2Parallel = p2;
    let hasParallel = false;

    if (!isDrawingEarly) {
      if (anchors.length >= 6) {
        const p1P = this._drawing.anchorToPixel(anchors[3], viewport);
        const p2P = this._drawing.anchorToPixel(anchors[4], viewport);
        if (p1P && p2P) {
          p1Parallel = p1P;
          p2Parallel = p2P;
          hasParallel = true;
        }
      } else if (anchors.length >= 3) {
        const p3 = this._drawing.anchorToPixel(anchors[2], viewport);
        if (p3) {
          const offset = this._drawing.calculateOffset(p1, p2, p3);
          p1Parallel = { x: p1.x + offset.x, y: p1.y + offset.y };
          p2Parallel = { x: p2.x + offset.x, y: p2.y + offset.y };
          hasParallel = true;
        }
      }
    }

    // Handle line extensions
    let drawP1 = p1, drawP2 = p2;
    let drawP1P = p1Parallel, drawP2P = p2Parallel;

    if (options.extendLines) {
      const extended1 = extendLineToViewport(p1, p2, viewport.width, viewport.height, true, true);
      drawP1 = extended1.start;
      drawP2 = extended1.end;

      if (hasParallel) {
        const extended2 = extendLineToViewport(p1Parallel, p2Parallel, viewport.width, viewport.height, true, true);
        drawP1P = extended2.start;
        drawP2P = extended2.end;
      }
    }

    // Draw background fill if channel is completed and filled option is enabled
    if (hasParallel && options.filled && this._drawing.style.fillColor) {
      ctx.fillStyle = this._drawing.style.fillColor;
      ctx.beginPath();
      ctx.moveTo(drawP1.x * pixelRatio, drawP1.y * pixelRatio);
      ctx.lineTo(drawP2.x * pixelRatio, drawP2.y * pixelRatio);
      ctx.lineTo(drawP2P.x * pixelRatio, drawP2P.y * pixelRatio);
      ctx.lineTo(drawP1P.x * pixelRatio, drawP1P.y * pixelRatio);
      ctx.closePath();
      ctx.fill();
    }

    // Draw baseline
    drawLine(ctx, drawP1, drawP2, pixelRatio);

    if (hasParallel) {
      // Draw parallel line
      drawLine(ctx, drawP1P, drawP2P, pixelRatio);

      // Draw middle line if enabled
      if (options.showMiddleLine) {
        const p1Middle = { x: (p1.x + p1Parallel.x) / 2, y: (p1.y + p1Parallel.y) / 2 };
        const p2Middle = { x: (p2.x + p2Parallel.x) / 2, y: (p2.y + p2Parallel.y) / 2 };

        let drawP1M = p1Middle, drawP2M = p2Middle;
        if (options.extendLines) {
          const extendedM = extendLineToViewport(p1Middle, p2Middle, viewport.width, viewport.height, true, true);
          drawP1M = extendedM.start;
          drawP2M = extendedM.end;
        }

        drawDashedLine(ctx, drawP1M, drawP2M, [5, 5], pixelRatio);
      }
    }

    // Draw control handles using standard drawing style if selected/editing (and not overridden by adapter)
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio, this._drawing.style.lineColor || '#2962FF');
    }
  }
}
