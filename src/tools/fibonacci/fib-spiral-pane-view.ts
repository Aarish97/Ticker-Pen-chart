import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { FibSpiral } from './fib-spiral';
import { distanceBetweenPoints, extendLineToViewport } from '../../core/geometry';
import { drawControlPoints, getDashPattern, getDotPattern } from '../../rendering/canvas-utils';

export class FibSpiralPaneView implements IPrimitivePaneView {
  private _renderer: FibSpiralPaneRenderer;

  constructor(drawing: FibSpiral) {
    this._renderer = new FibSpiralPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class FibSpiralPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: FibSpiral;

  constructor(drawing: FibSpiral) {
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
    const p1 = this._drawing.anchorToPixel(anchors[0], viewport); // Center / Inner Eye
    const p2 = this._drawing.anchorToPixel(anchors[1], viewport); // Reference Point

    if (!p1) return;

    const state = this._drawing.state;
    const shouldDrawControl = state === 'selected' || state === 'editing' || state === 'hovered';

    // Step 1: Only center placed (or p2 identical to p1)
    if (!p2 || distanceBetweenPoints(p1, p2) <= 1) {
      if (shouldDrawControl) {
        const controlPoints = this._drawing.getControlPoints(viewport);
        drawControlPoints(ctx, controlPoints, null, pixelRatio);
      }
      return;
    }

    const options = this._drawing.fibOptions;
    const startRadius = distanceBetweenPoints(p1, p2);

    // 1. Draw Trendline / Reference Line (Ray starting from Anchor 1 through Anchor 2)
    if (options.showTrendline !== false) {
      const trendColor = options.trendlineColor || options.lineColor || this._drawing.style.lineColor || '#00BCD4';
      const trendW = (options.trendlineWidth ?? options.lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;
      const trendStyle = options.trendlineStyle || 'solid';

      ctx.save();
      ctx.strokeStyle = trendColor;
      ctx.lineWidth = trendW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (trendStyle === 'dashed') {
        ctx.setLineDash(getDashPattern(trendW, 1));
      } else if (trendStyle === 'dotted') {
        ctx.setLineDash(getDotPattern(trendW, 1));
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      if (options.extendTrendline !== false) {
        const extended = extendLineToViewport(p1, p2, viewport.width, viewport.height, false, true);
        ctx.moveTo(p1.x * pixelRatio, p1.y * pixelRatio);
        ctx.lineTo(extended.end.x * pixelRatio, extended.end.y * pixelRatio);
      } else {
        ctx.moveTo(p1.x * pixelRatio, p1.y * pixelRatio);
        ctx.lineTo(p2.x * pixelRatio, p2.y * pixelRatio);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 2. Draw Golden Spiral Curve (Starting at inner eye p1, wrapping through p2, expanding outward across chart)
    const isCounter = options.counterclockwise ?? (options.clockwise !== undefined ? !options.clockwise : false);
    const maxViewportRadius = Math.hypot(viewport.width, viewport.height) * 2;
    const spiralPoints = this._drawing.getSpiralPoints(
      p1,
      p2,
      options.rotations ?? 8,
      isCounter,
      maxViewportRadius
    );

    if (spiralPoints.length > 1 && startRadius > 0) {
      const lineColor = options.lineColor || this._drawing.style.lineColor || (this._drawing.style as any)?.color || '#2962FF';
      const lineW = (options.lineWidth ?? (options as any).levelLineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 2) * pixelRatio;
      const lineStyle = options.lineStyle || this._drawing.style.lineStyle || 'solid';

      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (lineStyle === 'dashed') {
        ctx.setLineDash(getDashPattern(lineW, 1));
      } else if (lineStyle === 'dotted') {
        ctx.setLineDash(getDotPattern(lineW, 1));
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(spiralPoints[0].x * pixelRatio, spiralPoints[0].y * pixelRatio);
      for (let i = 1; i < spiralPoints.length; i++) {
        ctx.lineTo(spiralPoints[i].x * pixelRatio, spiralPoints[i].y * pixelRatio);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw Control Points (Inner Eye Anchor 1 and Reference Anchor 2)
    if (shouldDrawControl) {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
