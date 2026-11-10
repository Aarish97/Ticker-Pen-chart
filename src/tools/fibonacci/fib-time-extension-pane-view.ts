import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import { type FibTimeExtension, FIB_TIME_EXTENSION_LEVELS, DEFAULT_FIB_TIME_EXTENSION_LEVELS } from './fib-time-extension';
import { FIB_TIME_COLORS } from './fib-time-zone-pane-view';
import { applyStyle, drawLine, drawDashedLine, drawControlPoints, drawText, getDashPattern, getDotPattern } from '../../rendering/canvas-utils';

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

export class FibTimeExtensionPaneView implements IPrimitivePaneView {
  private _renderer: FibTimeExtensionPaneRenderer;

  constructor(drawing: FibTimeExtension) {
    this._renderer = new FibTimeExtensionPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class FibTimeExtensionPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: FibTimeExtension;

  constructor(drawing: FibTimeExtension) {
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
    const rawLevels = options.levels ?? options.intervals ?? DEFAULT_FIB_TIME_EXTENSION_LEVELS;
    const items = (rawLevels
      .map((item: any) => {
        if (typeof item === 'number') {
          const itemColor = options.useOneColor && options.oneColor
            ? options.oneColor
            : (FIB_TIME_COLORS[item] ?? options.lineColor ?? this._drawing.style.lineColor ?? '#787B86');
          return {
            value: item,
            color: itemColor,
            lineStyle: options.lineStyle || 'solid',
            enabled: true,
          };
        }
        if (item && typeof item.value === 'number') {
          const itemColor = options.useOneColor && options.oneColor
            ? options.oneColor
            : (item.color || (FIB_TIME_COLORS[item.value] ?? options.lineColor ?? this._drawing.style.lineColor ?? '#787B86'));
          return {
            value: item.value,
            color: itemColor,
            lineStyle: item.lineStyle || options.lineStyle || 'solid',
            enabled: item.enabled !== false,
          };
        }
        return null;
      })
      .filter((item: any) => item !== null && item.enabled !== false)) as Array<{ value: number; color: string; lineStyle?: 'solid' | 'dashed' | 'dotted'; enabled: boolean }>;

    const baseTimeWidth = p2.x - p1.x;

    // Draw fill between zones if enabled
    if (options.filled !== false) {
      const bgOpacity = options.backgroundOpacity ?? 0.08;
      for (let i = 0; i < items.length - 1; i++) {
        const x1 = p3.x + baseTimeWidth * items[i].value;
        const x2 = p3.x + baseTimeWidth * items[i + 1].value;
        const leftX = Math.min(x1, x2);
        const rightX = Math.max(x1, x2);

        if (rightX < 0 || leftX > viewport.width) continue;

        ctx.fillStyle = hexToRgba(items[i].color, bgOpacity);
        ctx.fillRect(
          Math.max(0, leftX) * pixelRatio,
          0,
          (Math.min(viewport.width, rightX) - Math.max(0, leftX)) * pixelRatio,
          viewport.height * pixelRatio
        );
      }
    }

    // Draw trendline between anchor points (p1 -> p2 -> p3)
    if (options.showTrendline ?? true) {
      ctx.save();
      applyStyle(ctx, this._drawing.style, pixelRatio);
      ctx.strokeStyle = options.trendlineColor || this._drawing.style.lineColor || '#787B86';
      const trendWidth = (options.trendlineWidth ?? options.lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;
      ctx.lineWidth = trendWidth;
      let dashPattern: number[] = [];
      if (options.trendlineStyle === 'solid') {
        dashPattern = [];
      } else if (options.trendlineStyle === 'dotted') {
        dashPattern = getDotPattern(trendWidth, 1);
      } else {
        dashPattern = getDashPattern(trendWidth, 1);
      }
      drawDashedLine(ctx, p1, p2, dashPattern, pixelRatio);
      drawDashedLine(ctx, p2, p3, dashPattern, pixelRatio);
      ctx.restore();
    }

    // Draw vertical Fibonacci time extension lines
    const lineW = (options.lineWidth ?? options.levelLineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;
    const vAlign = options.labelsVerticalAlign || 'bottom';
    const hAlign = options.labelsAlign || 'right';
    const fontSize = (options as any).fontSize ?? 12;
    const font = `${fontSize}px 'Rubik', sans-serif`;

    let labelY = viewport.height - 20;
    if (vAlign === 'top') labelY = 22;
    else if (vAlign === 'middle') labelY = viewport.height / 2;

    for (const item of items) {
      const x = p3.x + baseTimeWidth * item.value;

      if (x < -10 || x > viewport.width + 10) continue;

      const isLabelsVisible = options.showLabels ?? true;
      const text = String(item.value);
      let labelX = x + 6;
      let alignType: CanvasTextAlign = 'left';
      if (hAlign === 'center') {
        labelX = x;
        alignType = 'center';
      } else if (hAlign === 'right') {
        labelX = x - 6;
        alignType = 'right';
      }

      // Leave a gap when the number is placed in the center directly on the line
      const shouldLeaveGap = isLabelsVisible && hAlign === 'center';

      ctx.save();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = lineW;
      let dashPattern: number[] = [];
      if (item.lineStyle === 'dashed' || options.lineStyle === 'dashed') {
        dashPattern = getDashPattern(lineW, 1);
      } else if (item.lineStyle === 'dotted' || options.lineStyle === 'dotted') {
        dashPattern = getDotPattern(lineW, 1);
      }
      ctx.setLineDash(dashPattern);

      if (shouldLeaveGap) {
        ctx.font = font;
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width;
        const paddingX = 5;
        const paddingY = 3;
        const boxW = textWidth + paddingX * 2;
        const boxH = fontSize + paddingY * 2;

        ctx.beginPath();
        ctx.rect(0, 0, viewport.width * pixelRatio, viewport.height * pixelRatio);
        const boxX = (labelX - boxW / 2) * pixelRatio;
        const boxY = (labelY - boxH / 2) * pixelRatio;
        ctx.rect(boxX, boxY, boxW * pixelRatio, boxH * pixelRatio);
        ctx.clip('evenodd');

        drawLine(ctx, { x, y: 0 }, { x, y: viewport.height }, pixelRatio);
      } else {
        drawLine(ctx, { x, y: 0 }, { x, y: viewport.height }, pixelRatio);
      }
      ctx.restore();

      // Draw label
      if (isLabelsVisible) {
        drawText(
          ctx,
          text,
          { x: labelX, y: labelY },
          font,
          item.color,
          alignType,
          'middle',
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
