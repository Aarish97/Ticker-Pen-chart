import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import { type FibChannel, FIB_CHANNEL_LEVELS, DEFAULT_FIB_CHANNEL_LEVELS } from './fib-channel';
import type { Point } from '../../core/types';
import { extendLineToViewport } from '../../core/geometry';
import { drawLine, drawDashedLine, drawControlPoints, drawText, getDashPattern, getDotPattern } from '../../rendering/canvas-utils';

function hexToRgba(color: string, opacity: number): string {
  if (color.startsWith('rgba')) return color;
  if (color.startsWith('rgb')) {
    return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
  }
  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16) || 120;
  const g = parseInt(hex.substring(2, 4), 16) || 123;
  const b = parseInt(hex.substring(4, 6), 16) || 134;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function formatFibPrice(price: number): string {
  if (typeof price !== 'number' || isNaN(price)) return '';
  if (Math.abs(price) >= 1000) return price.toFixed(2);
  if (Math.abs(price) >= 1) return price.toFixed(2);
  if (Math.abs(price) >= 0.001) return price.toFixed(4);
  return price.toFixed(6);
}

export class FibChannelPaneView implements IPrimitivePaneView {
  private _renderer: FibChannelPaneRenderer;

  constructor(drawing: FibChannel) {
    this._renderer = new FibChannelPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class FibChannelPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: FibChannel;

  constructor(drawing: FibChannel) {
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
    const rawLevels = options.levels ?? DEFAULT_FIB_CHANNEL_LEVELS;

    const items = (rawLevels
      .map((item: any) => {
        if (typeof item === 'number') {
          const itemColor = options.useOneColor && options.oneColor
            ? options.oneColor
            : (options.lineColor ?? this._drawing.style.lineColor ?? '#787B86');
          return {
            value: item,
            color: itemColor,
            lineStyle: (options as any).levelLineStyle || options.lineStyle || 'solid',
            enabled: true,
          };
        }
        if (item && typeof item.value === 'number') {
          const itemColor = options.useOneColor && options.oneColor
            ? options.oneColor
            : (item.color || options.lineColor || this._drawing.style.lineColor || '#787B86');
          return {
            value: item.value,
            color: itemColor,
            lineStyle: item.lineStyle || (options as any).levelLineStyle || options.lineStyle || 'solid',
            enabled: item.enabled !== false,
          };
        }
        return null;
      })
      .filter((item: any) => item !== null && item.enabled !== false)) as Array<{ value: number; color: string; lineStyle?: 'solid' | 'dashed' | 'dotted'; enabled: boolean }>;

    // Sort items by value for proper fill rendering
    const sortedItems = [...items].sort((a, b) => a.value - b.value);
    const offset = this._drawing.calculateOffset(p1, p2, p3);

    const extendMode = options.extendMode ?? (options.extendLines ? 'both' : 'none');
    const extendLeft = extendMode === 'left' || extendMode === 'both';
    const extendRight = extendMode === 'right' || extendMode === 'both';

    // Draw fill between levels if enabled
    if (options.filled !== false) {
      const bgOpacity = options.backgroundOpacity ?? 0.15;
      for (let i = 0; i < sortedItems.length - 1; i++) {
        const item1 = sortedItems[i];
        const item2 = sortedItems[i + 1];

        let start1 = { x: p1.x + offset.x * item1.value, y: p1.y + offset.y * item1.value };
        let end1 = { x: p2.x + offset.x * item1.value, y: p2.y + offset.y * item1.value };
        let start2 = { x: p1.x + offset.x * item2.value, y: p1.y + offset.y * item2.value };
        let end2 = { x: p2.x + offset.x * item2.value, y: p2.y + offset.y * item2.value };

        if (extendLeft || extendRight) {
          const ext1 = extendLineToViewport(start1, end1, viewport.width, viewport.height, extendLeft, extendRight);
          start1 = ext1.start;
          end1 = ext1.end;

          const ext2 = extendLineToViewport(start2, end2, viewport.width, viewport.height, extendLeft, extendRight);
          start2 = ext2.start;
          end2 = ext2.end;
        }

        ctx.fillStyle = hexToRgba(item1.color, bgOpacity);
        ctx.beginPath();
        ctx.moveTo(start1.x * pixelRatio, start1.y * pixelRatio);
        ctx.lineTo(end1.x * pixelRatio, end1.y * pixelRatio);
        ctx.lineTo(end2.x * pixelRatio, end2.y * pixelRatio);
        ctx.lineTo(start2.x * pixelRatio, start2.y * pixelRatio);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Line and text style setup
    const lineW = (options.levelLineWidth ?? options.lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;
    const fontSize = options.fontSize ?? 12;
    const font = `${fontSize}px 'Rubik', sans-serif`;
    const hAlign = options.labelsAlign || 'left';
    const vAlign = options.labelsVerticalAlign || 'middle';

    const showPrices = options.showPrices ?? true;
    const showLevels = options.showLevels ?? options.showPercentages ?? true;
    const levelsFormat: string = options.levelsFormat ?? 'values';

    // Draw level lines and labels
    for (const item of items) {
      const offsetX = offset.x * item.value;
      const offsetY = offset.y * item.value;

      let start = { x: p1.x + offsetX, y: p1.y + offsetY };
      let end = { x: p2.x + offsetX, y: p2.y + offsetY };

      const baseStart = { ...start };
      const baseEnd = { ...end };

      if (extendLeft || extendRight) {
        const extended = extendLineToViewport(start, end, viewport.width, viewport.height, extendLeft, extendRight);
        start = extended.start;
        end = extended.end;
      }

      // Build label text
      let text = '';
      if (showLevels || showPrices) {
        const parts: string[] = [];
        if (showLevels) {
          if (levelsFormat === 'percent' || levelsFormat === 'percentages') {
            parts.push(`${(item.value * 100).toFixed(1)}%`);
          } else {
            parts.push(String(item.value));
          }
        }
        if (showPrices) {
          // Estimate price if coordinate conversion is available
          const priceScale = viewport.priceScale;
          const midY = (baseStart.y + baseEnd.y) / 2;
          if (priceScale && typeof priceScale.coordinateToPrice === 'function') {
            const priceVal = priceScale.coordinateToPrice(midY);
            if (priceVal !== null && !isNaN(priceVal)) {
              parts.push(`(${formatFibPrice(priceVal)})`);
            }
          }
        }
        text = parts.join(' ');
      }

      const isLabelsVisible = (showLevels || showPrices) && text.trim().length > 0;
      // Text crosses the line when vertical alignment is 'middle'
      const isTextCrossingLine = isLabelsVisible && vAlign === 'middle';

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy);

      let labelCenter: Point = { x: (baseStart.x + baseEnd.x) / 2, y: (baseStart.y + baseEnd.y) / 2 };
      let boxW = 0;
      let boxH = 0;

      if (isLabelsVisible && len > 0) {
        ctx.font = font;
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width;
        const textHeight = fontSize;
        const paddingX = 5;
        const paddingY = 3;

        boxW = textWidth + paddingX * 2;
        boxH = textHeight + paddingY * 2;

        const uX = dx / len;
        const uY = dy / len;

        if (hAlign === 'center') {
          labelCenter = { x: (baseStart.x + baseEnd.x) / 2, y: (baseStart.y + baseEnd.y) / 2 };
        } else if (hAlign === 'left') {
          labelCenter = { x: baseStart.x + uX * (boxW / 2 + 6), y: baseStart.y + uY * (boxW / 2 + 6) };
        } else if (hAlign === 'right') {
          labelCenter = { x: baseEnd.x - uX * (boxW / 2 + 6), y: baseEnd.y - uY * (boxW / 2 + 6) };
        }
      }

      ctx.save();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = lineW;
      let dashPattern: number[] = [];
      const activeLineStyle = item.lineStyle || options.levelLineStyle || options.lineStyle || 'solid';
      if (activeLineStyle === 'dashed') {
        dashPattern = getDashPattern(lineW, 1);
      } else if (activeLineStyle === 'dotted') {
        dashPattern = getDotPattern(lineW, 1);
      }
      ctx.setLineDash(dashPattern);

      if (isLabelsVisible && isTextCrossingLine && boxW > 0 && boxH > 0) {
        // Transparent exclusion box around text to mask out the line underneath
        ctx.beginPath();
        ctx.rect(0, 0, viewport.width * pixelRatio, viewport.height * pixelRatio);
        const boxX = (labelCenter.x - boxW / 2) * pixelRatio;
        const boxY = (labelCenter.y - boxH / 2) * pixelRatio;
        ctx.rect(boxX, boxY, boxW * pixelRatio, boxH * pixelRatio);
        ctx.clip('evenodd');
      }

      drawLine(ctx, start, end, pixelRatio);
      ctx.restore();

      // Draw label
      if (isLabelsVisible) {
        let labelX = labelCenter.x;
        let labelY = labelCenter.y;
        let textBaseline: CanvasTextBaseline = 'middle';

        if (vAlign === 'top') {
          textBaseline = 'bottom';
          labelY -= 4;
        } else if (vAlign === 'bottom') {
          textBaseline = 'top';
          labelY += 4;
        }

        drawText(
          ctx,
          text,
          { x: labelX, y: labelY },
          font,
          item.color,
          'center',
          textBaseline,
          pixelRatio
        );
      }
    }

    // Draw control points if selected
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
