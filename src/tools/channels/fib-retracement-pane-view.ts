import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import { type FibRetracement, FIBONACCI_LEVELS, DEFAULT_FIB_RETRACEMENT_LEVELS, type FibLevelItem } from './fib-retracement';
import { applyStyle, drawLine, drawControlPoints, drawText, getDashPattern, getDotPattern } from '../../rendering/canvas-utils';

function formatFibPrice(price: number): string {
  const abs = Math.abs(price);
  let prec = 2;
  if (typeof window !== 'undefined' && typeof (window as any).__active_price_precision__ === 'number') {
    prec = (window as any).__active_price_precision__;
  } else if (abs < 0.01) {
    prec = 4;
  }
  const parts = price.toFixed(prec).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

// Colors for different Fib levels
const FIB_COLORS: Record<number, string> = {
  0: '#787B86',
  0.236: '#F7525F',
  0.382: '#FF9800',
  0.5: '#4CAF50',
  0.618: '#00897B',
  0.786: '#00BCD4',
  1: '#787B86',
  1.618: '#2962FF',
  2.618: '#F7525F',
};

export class FibRetracementPaneView implements IPrimitivePaneView {
  private _renderer: FibRetracementPaneRenderer;

  constructor(drawing: FibRetracement) {
    this._renderer = new FibRetracementPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class FibRetracementPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: FibRetracement;

  constructor(drawing: FibRetracement) {
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
    const p1 = this._drawing.anchorToPixel(anchors[0], viewport);
    const p2 = this._drawing.anchorToPixel(anchors[1], viewport);
    const p3 = this._drawing.anchorToPixel(anchors[2], viewport);

    if (!p1 || !p2 || !p3) return;

    const options = this._drawing.fibOptions;
    const rawLevels = options.levels ?? DEFAULT_FIB_RETRACEMENT_LEVELS;
    const levelItems: FibLevelItem[] = rawLevels.map((lvl: any) => {
      if (typeof lvl === 'number') {
        return { value: lvl, color: FIB_COLORS[lvl] ?? '#787B86', enabled: true };
      }
      return lvl;
    });

    const activeLevels = levelItems.filter(item => item.enabled !== false);
    const price1 = anchors[0].price;
    const price2 = anchors[1].price;
    const priceRange = price2 - price1;

    const extendMode = options.extendMode ?? (options.extendLines ? 'both' : 'none');
    let minX = Math.min(p1.x, p2.x);
    let maxX = Math.max(p1.x, p2.x, p3.x);
    if (extendMode === 'left' || extendMode === 'both') minX = 0;
    if (extendMode === 'right' || extendMode === 'both') maxX = viewport.width;

    // Draw fill between levels if enabled
    if ((options.filled ?? true) && activeLevels.length >= 2) {
      const sorted = [...activeLevels].sort((a, b) => a.value - b.value);
      const bgOpacity = options.backgroundOpacity ?? 0.15;
      for (let i = 0; i < sorted.length - 1; i++) {
        const item1 = sorted[i];
        const item2 = sorted[i + 1];

        const levelPrice1 = options.reverseDirection
          ? price2 - priceRange * item1.value
          : price1 + priceRange * item1.value;
        const levelPrice2 = options.reverseDirection
          ? price2 - priceRange * item2.value
          : price1 + priceRange * item2.value;

        const y1 = viewport.priceScale.priceToCoordinate(levelPrice1);
        const y2 = viewport.priceScale.priceToCoordinate(levelPrice2);

        if (y1 === null || y2 === null) continue;

        ctx.fillStyle = (options.useOneColor && options.oneColor) ? options.oneColor : (item1.color || '#2962ff');
        ctx.globalAlpha = bgOpacity;
        ctx.fillRect(
          minX * pixelRatio,
          Math.min(y1, y2) * pixelRatio,
          (maxX - minX) * pixelRatio,
          Math.abs(y2 - y1) * pixelRatio
        );
        ctx.globalAlpha = 1;
      }
    }

    // Draw level lines
    ctx.save();
    for (const item of activeLevels) {
      const price = options.reverseDirection
        ? price2 - priceRange * item.value
        : price1 + priceRange * item.value;

      const y = viewport.priceScale.priceToCoordinate(price);
      if (y === null) continue;

      const color = (options.useOneColor && options.oneColor)
        ? options.oneColor
        : (item.color || options.lineColor || this._drawing.style.lineColor || '#787B86');
      ctx.strokeStyle = color;
      const levelW = options.levelLineWidth ?? (options as any).lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1;
      ctx.lineWidth = levelW * pixelRatio;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (options.levelLineStyle === 'dashed') {
        ctx.setLineDash(getDashPattern(levelW, pixelRatio));
      } else if (options.levelLineStyle === 'dotted') {
        ctx.setLineDash(getDotPattern(levelW, pixelRatio));
      } else {
        ctx.setLineDash([]);
      }

      // Prepare label text
      const showPrices = options.showPrices ?? true;
      const showPercentages = options.showPercentages ?? true;
      const isValuesFormat = options.levelsFormat !== 'percentages';

      const levelValStr = isValuesFormat ? `${item.value}` : `${(item.value * 100).toFixed(1)}%`;
      const formattedPriceStr = formatFibPrice(price);

      let labelText = '';
      if (showPercentages && showPrices) {
        labelText = `${levelValStr} (${formattedPriceStr})`;
      } else if (showPercentages) {
        labelText = levelValStr;
      } else if (showPrices) {
        labelText = formattedPriceStr;
      }

      const fontSz = options.fontSize ?? 12;
      const vAlign = options.labelsVerticalAlign || 'middle';
      const alignMode = options.labelsAlign || 'right';

      let alignX: number;
      let textAlign: CanvasTextAlign;

      if (alignMode === 'left') {
        if (minX > 10) {
          alignX = minX - 6;
          textAlign = 'right';
        } else {
          alignX = 8;
          textAlign = 'left';
        }
      } else if (alignMode === 'center') {
        alignX = (minX + maxX) / 2;
        textAlign = 'center';
      } else {
        if (maxX < viewport.width - 10) {
          alignX = maxX + 6;
          textAlign = 'left';
        } else {
          alignX = viewport.width - 8;
          textAlign = 'right';
        }
      }

      if (labelText && vAlign === 'middle') {
        ctx.font = `${fontSz}px 'Rubik', sans-serif`;
        const textWidth = ctx.measureText(labelText).width;
        const paddingX = 5;
        const paddingY = 3;
        const boxW = textWidth + paddingX * 2;
        const boxH = fontSz + paddingY * 2;

        let boxCenterX = alignX;
        if (textAlign === 'left') {
          boxCenterX = alignX + textWidth / 2;
        } else if (textAlign === 'right') {
          boxCenterX = alignX - textWidth / 2;
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, viewport.width * pixelRatio, viewport.height * pixelRatio);
        const boxX = (boxCenterX - boxW / 2) * pixelRatio;
        const boxY = (y - boxH / 2) * pixelRatio;
        ctx.rect(boxX, boxY, boxW * pixelRatio, boxH * pixelRatio);
        ctx.clip('evenodd');

        drawLine(ctx, { x: minX, y }, { x: maxX, y }, pixelRatio);
        ctx.restore();
      } else {
        drawLine(ctx, { x: minX, y }, { x: maxX, y }, pixelRatio);
      }
      ctx.setLineDash([]);

      // Draw label text
      if (labelText) {
        const labelY = vAlign === 'bottom' ? y + 3 : vAlign === 'middle' ? y : y - 3;
        const baseline: CanvasTextBaseline = vAlign === 'bottom' ? 'top' : vAlign === 'middle' ? 'middle' : 'bottom';

        drawText(
          ctx,
          labelText,
          { x: alignX, y: labelY },
          `${fontSz}px 'Rubik', sans-serif`,
          color,
          textAlign,
          baseline,
          pixelRatio
        );
      }
    }
    ctx.restore();

    // Draw main trend line connecting anchors if enabled
    if (options.showTrendline ?? true) {
      applyStyle(ctx, this._drawing.style, pixelRatio);
      ctx.strokeStyle = options.trendlineColor || options.lineColor || this._drawing.style.lineColor || '#787B86';
      const trendW = options.trendlineWidth ?? (options as any).lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1;
      ctx.lineWidth = trendW * pixelRatio;
      if (options.trendlineStyle === 'solid') {
        ctx.setLineDash([]);
      } else if (options.trendlineStyle === 'dotted') {
        ctx.setLineDash(getDotPattern(trendW, pixelRatio));
      } else {
        ctx.setLineDash(getDashPattern(trendW, pixelRatio));
      }
      drawLine(ctx, p1, p2, pixelRatio);
      ctx.setLineDash([]);
    }

    // Draw control points if selected
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
