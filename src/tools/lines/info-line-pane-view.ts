import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { InfoLine } from './info-line';
import { getLineAngleDegrees, midpoint, distanceBetweenPoints } from '../../core/geometry';
import { applyStyle, drawLine, drawControlPoints, drawLabel, formatPrice } from '../../rendering/canvas-utils';

export class InfoLinePaneView implements IPrimitivePaneView {
  private _renderer: InfoLinePaneRenderer;

  constructor(drawing: InfoLine) {
    this._renderer = new InfoLinePaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class InfoLinePaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: InfoLine;

  constructor(drawing: InfoLine) {
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
    const start = this._drawing.anchorToPixel(anchors[0], viewport);
    const end = this._drawing.anchorToPixel(anchors[1], viewport);

    if (!start || !end) return;

    applyStyle(ctx, this._drawing.style, pixelRatio);

    // Draw line
    drawLine(ctx, start, end, pixelRatio);



    // Build info label
    const options = this._drawing.infoLineOptions;
    const labelParts: string[] = [];

    if (options.showDistance) {
      const distance = distanceBetweenPoints(start, end);
      labelParts.push(`${distance.toFixed(0)}px`);
    }

    if (options.showAngle) {
      const angle = getLineAngleDegrees(start, end);
      labelParts.push(`${angle.toFixed(1)}°`);
    }

    if (options.showPriceChange) {
      const priceChange = this._drawing.getPriceChange();
      const sign = priceChange.absolute >= 0 ? '+' : '';
      labelParts.push(`${sign}${formatPrice(priceChange.absolute)}`);
    }

    if (options.showPercentChange) {
      const priceChange = this._drawing.getPriceChange();
      const sign = priceChange.percentage >= 0 ? '+' : '';
      labelParts.push(`${sign}${priceChange.percentage.toFixed(2)}%`);
    }

    if (options.showBars) {
      const bars = this._drawing.getBarCount();
      labelParts.push(`${bars} ${bars === 1 ? 'bar' : 'bars'}`);
    }

    if (options.showTime) {
      const days = this._drawing.getTimeSpan();
      labelParts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    }

    // Draw info label
    if (labelParts.length > 0) {
      const labelPos = midpoint(start, end);
      drawLabel(
        ctx,
        labelParts.join(' | '),
        { x: labelPos.x, y: labelPos.y },
        {
          font: this._drawing.style.labelFont || "11px 'Rubik', sans-serif",
          textColor: '#ffffff',
          backgroundColor: '#1e222d',
          padding: 6,
          borderRadius: 6,
          textAlign: 'center',
        },
        pixelRatio
      );
    }

    // Draw control points if selected
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
