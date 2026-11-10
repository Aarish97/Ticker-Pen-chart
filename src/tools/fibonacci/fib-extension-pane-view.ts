import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import { type FibExtension, FIB_EXTENSION_LEVELS } from './fib-extension';
import { applyStyle, drawLine, drawDashedLine, drawControlPoints, drawText, getDashPattern, getDotPattern } from '../../rendering/canvas-utils';

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

const FIB_COLORS: Record<number, string> = {
  0: '#787B86',
  0.236: '#F7525F',
  0.382: '#FF9800',
  0.5: '#4CAF50',
  0.618: '#00897B',
  0.786: '#00BCD4',
  1: '#787B86',
  1.272: '#FF9800',
  1.618: '#2962FF',
  2: '#00695C',
  2.618: '#F7525F',
  3.618: '#9C27B0',
  4.236: '#880E4F',
};

export class FibExtensionPaneView implements IPrimitivePaneView {
  private _renderer: FibExtensionPaneRenderer;

  constructor(drawing: FibExtension) {
    this._renderer = new FibExtensionPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class FibExtensionPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: FibExtension;

  constructor(drawing: FibExtension) {
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
    const pA = this._drawing.anchorToPixel(anchors[0], viewport);
    const pB = this._drawing.anchorToPixel(anchors[1], viewport);
    const pC = this._drawing.anchorToPixel(anchors[2], viewport);
    const pD = this._drawing.anchorToPixel(anchors[3], viewport);

    if (!pA || !pB || !pC || !pD) return;

    const options = this._drawing.fibOptions;
    const rawLevels = options.levels ?? FIB_EXTENSION_LEVELS;
    const levelItems: any[] = rawLevels.map((lvl: any) => {
      if (typeof lvl === 'number') {
        return { value: lvl, color: FIB_COLORS[lvl] ?? '#787B86', enabled: true };
      }
      return lvl;
    });

    const activeLevels = levelItems.filter(item => item.enabled !== false);
    const priceA = anchors[0].price;
    const priceB = anchors[1].price;
    const priceC = anchors[2].price;
    const range = priceB - priceA;

    const extendMode = options.extendMode ?? (options.extendLines ? 'both' : 'none');
    let startX = Math.min(pC.x, pD.x);
    let endX = Math.max(pC.x, pD.x);
    if (extendMode === 'left' || extendMode === 'both') startX = 0;
    if (extendMode === 'right' || extendMode === 'both') endX = viewport.width;

    if (options.showTrendline ?? true) {
      applyStyle(ctx, this._drawing.style, pixelRatio);
      ctx.strokeStyle = options.trendlineColor || options.lineColor || this._drawing.style.lineColor || '#787B86';
      const trendW = options.trendlineWidth ?? (options as any).lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1;
      ctx.lineWidth = trendW * pixelRatio;
      let dashPat: number[] = [];
      if (options.trendlineStyle === 'solid') {
        dashPat = [];
      } else if (options.trendlineStyle === 'dotted') {
        dashPat = getDotPattern(trendW, 1);
      } else {
        dashPat = getDashPattern(trendW, 1);
      }
      drawDashedLine(ctx, pA, pB, dashPat, pixelRatio);
      drawDashedLine(ctx, pB, pC, dashPat, pixelRatio);
      ctx.setLineDash([]);
    }

    if ((options.filled ?? true) && activeLevels.length >= 2) {
      const sorted = [...activeLevels].sort((a, b) => a.value - b.value);
      const bgOpacity = options.backgroundOpacity ?? 0.15;
      for (let i = 0; i < sorted.length - 1; i++) {
        const item1 = sorted[i];
        const item2 = sorted[i + 1];

        const price1 = priceC + range * item1.value;
        const price2 = priceC + range * item2.value;

        const y1 = viewport.priceScale.priceToCoordinate(price1);
        const y2 = viewport.priceScale.priceToCoordinate(price2);

        if (y1 === null || y2 === null) continue;

        ctx.fillStyle = (options.useOneColor && options.oneColor) ? options.oneColor : (item1.color || '#2962ff');
        ctx.globalAlpha = bgOpacity;
        ctx.fillRect(
          startX * pixelRatio,
          Math.min(y1, y2) * pixelRatio,
          (endX - startX) * pixelRatio,
          Math.abs(y2 - y1) * pixelRatio
        );
        ctx.globalAlpha = 1;
      }
    }

    ctx.save();
    for (const item of activeLevels) {
      const price = priceC + range * item.value;
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
        if (startX > 10) {
          alignX = startX - 6;
          textAlign = 'right';
        } else {
          alignX = 8;
          textAlign = 'left';
        }
      } else if (alignMode === 'center') {
        alignX = (startX + endX) / 2;
        textAlign = 'center';
      } else {
        if (endX < viewport.width - 10) {
          alignX = endX + 6;
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

        drawLine(ctx, { x: startX, y }, { x: endX, y }, pixelRatio);
        ctx.restore();
      } else {
        drawLine(ctx, { x: startX, y }, { x: endX, y }, pixelRatio);
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

    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
