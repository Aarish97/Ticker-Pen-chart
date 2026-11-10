import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { DisjointChannel } from './disjoint-channel';
import type { Point } from '../../core/types';
import { extendLineToViewport } from '../../core/geometry';
import { applyStyle, drawLine, drawControlPoints, drawDashedLine } from '../../rendering/canvas-utils';

export class DisjointChannelPaneView implements IPrimitivePaneView {
  private _renderer: DisjointChannelPaneRenderer;

  constructor(drawing: DisjointChannel) {
    this._renderer = new DisjointChannelPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class DisjointChannelPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: DisjointChannel;

  constructor(drawing: DisjointChannel) {
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

    const options = this._drawing.channelOptions;
    applyStyle(ctx, this._drawing.style, pixelRatio);

    const isDrawingEarly = (this._drawing as any)._isDrawingEarly === true;
    let p3: Point | null = null;
    let p4: Point | null = null;
    let hasSecondLine = false;

    if (!isDrawingEarly) {
      if (anchors.length >= 4) {
        p3 = this._drawing.anchorToPixel(anchors[3], viewport);
        p4 = this._drawing.anchorToPixel(anchors[2], viewport);
        hasSecondLine = p3 !== null && p4 !== null;
      } else if (anchors.length === 3) {
        // Preview mode during placement of 3rd point (cursor point is anchors[2])
        const p2End = this._drawing.anchorToPixel(anchors[2], viewport); // cursor
        if (p2End) {
          p3 = { // p3 is second line end (P4)
            x: p2.x,
            y: p2End.y
          };
          p4 = { // p4 is second line start (P3)
            x: p1.x,
            y: p3.y + (p2.y - p1.y)
          };
          hasSecondLine = true;
        }
      }
    }

    // Handle extensions
    let drawP1 = p1, drawP2 = p2;
    let drawP3 = p3, drawP4 = p4;

    if (options.extendLines) {
      const extended1 = extendLineToViewport(p1, p2, viewport.width, viewport.height, true, true);
      drawP1 = extended1.start;
      drawP2 = extended1.end;

      if (hasSecondLine && p3 && p4) {
        const extended2 = extendLineToViewport(p3, p4, viewport.width, viewport.height, true, true);
        drawP3 = extended2.start;
        drawP4 = extended2.end;
      }
    }

    // Draw fill if enabled
    if (hasSecondLine && drawP3 && drawP4 && options.filled && this._drawing.style.fillColor) {
      ctx.fillStyle = this._drawing.style.fillColor;
      ctx.beginPath();
      ctx.moveTo(drawP1.x * pixelRatio, drawP1.y * pixelRatio);
      ctx.lineTo(drawP2.x * pixelRatio, drawP2.y * pixelRatio);
      ctx.lineTo(drawP3.x * pixelRatio, drawP3.y * pixelRatio);
      ctx.lineTo(drawP4.x * pixelRatio, drawP4.y * pixelRatio);
      ctx.closePath();
      ctx.fill();
    }

    // Draw first line
    drawLine(ctx, drawP1, drawP2, pixelRatio);

    // Draw second line
    if (hasSecondLine && drawP3 && drawP4) {
      drawLine(ctx, drawP3, drawP4, pixelRatio);
    }


    // Draw middle line if enabled
    if (hasSecondLine && p3 && p4 && options.showMiddleLine) {
      const midStart = {
        x: (p1.x + p3.x) / 2,
        y: (p1.y + p3.y) / 2,
      };
      const midEnd = {
        x: (p2.x + p4.x) / 2,
        y: (p2.y + p4.y) / 2,
      };

      let drawMidStart = midStart, drawMidEnd = midEnd;
      if (options.extendLines) {
        const extendedM = extendLineToViewport(midStart, midEnd, viewport.width, viewport.height, true, true);
        drawMidStart = extendedM.start;
        drawMidEnd = extendedM.end;
      }

      drawDashedLine(ctx, drawMidStart, drawMidEnd, [5, 5], pixelRatio);
    }

    // Draw control handles using standard drawing style if selected/editing
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio, this._drawing.style.lineColor || '#2962FF');
    }
  }
}
