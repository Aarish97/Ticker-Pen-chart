import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { DatePriceRange } from './date-price-range';
import { applyStyle, drawLine, drawControlPoints, drawText, getDashPattern } from '../../rendering/canvas-utils';

function formatDuration(startTime: any, endTime: any, days: number): string {
  let ms = 0;
  if (typeof startTime === 'number' && typeof endTime === 'number') {
    ms = Math.abs(endTime - startTime);
  } else if (typeof startTime === 'string' && typeof endTime === 'string') {
    ms = Math.abs(new Date(endTime).getTime() - new Date(startTime).getTime());
  }

  if (ms <= 0) return `${days}d`;

  const totalMinutes = Math.floor(ms / (1000 * 60));
  const d = Math.floor(totalMinutes / (60 * 24));
  const h = Math.floor((totalMinutes % (60 * 24)) / 60);
  const m = totalMinutes % 60;

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || (d === 0 && h === 0)) parts.push(`${m}m`);

  return parts.join(' ');
}

function formatVolume(vol: number): string {
  if (vol >= 1e9) {
    return (vol / 1e9).toFixed(2) + 'B';
  }
  if (vol >= 1e6) {
    return (vol / 1e6).toFixed(2) + 'M';
  }
  if (vol >= 1e3) {
    return (vol / 1e3).toFixed(2) + 'K';
  }
  return vol > 0 ? vol.toLocaleString('en-US') : '0';
}

function formatLine1(priceChange: number, priceChangePercent: number): string {
  const isNeg = priceChange < 0;
  const sign = isNeg ? '−' : '+';
  const absVal = Math.abs(priceChange);

  let formattedShort = '';
  if (absVal >= 1e9) {
    formattedShort = (absVal / 1e9).toFixed(2) + ' B';
  } else if (absVal >= 1e6) {
    formattedShort = (absVal / 1e6).toFixed(2) + ' M';
  } else if (absVal >= 1e3) {
    formattedShort = (absVal / 1e3).toFixed(2) + ' K';
  } else {
    formattedShort = absVal.toFixed(2);
  }

  const pctStr = `(${sign}${Math.abs(priceChangePercent).toFixed(2)}%)`;
  const rawAbsStr = `${sign}${Math.round(absVal).toLocaleString('en-US')}`;

  return `${sign}${formattedShort} ${pctStr} ${rawAbsStr}`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

export class DatePriceRangePaneView implements IPrimitivePaneView {
  private _renderer: DatePriceRangePaneRenderer;

  constructor(drawing: DatePriceRange) {
    this._renderer = new DatePriceRangePaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class DatePriceRangePaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: DatePriceRange;

  constructor(drawing: DatePriceRange) {
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

    if (!p1 || !p2) return;

    const options = this._drawing.measureOptions;
    const info = this._drawing.getMeasureInfo();

    const left = Math.min(p1.x, p2.x);
    const right = Math.max(p1.x, p2.x);
    const top = Math.min(p1.y, p2.y);
    const bottom = Math.max(p1.y, p2.y);
    const width = right - left;
    const height = bottom - top;

    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;

    const isUp = info.isUp;
    const mainColor = isUp ? '#089981' : '#f23645';
    const cardBgColor = isUp ? '#089981' : '#ff4961';
    const fillColor = isUp ? 'rgba(8, 153, 129, 0.22)' : 'rgba(242, 54, 69, 0.22)';

    // 1. Draw filled rectangle background
    if (options.filled) {
      ctx.fillStyle = fillColor;
      ctx.fillRect(left * pixelRatio, top * pixelRatio, width * pixelRatio, height * pixelRatio);
    }

    // 2. Center horizontal and vertical axis lines with dashed styling
    ctx.strokeStyle = mainColor;
    ctx.fillStyle = mainColor;
    ctx.lineWidth = 1 * pixelRatio;
    ctx.setLineDash([4 * pixelRatio, 4 * pixelRatio]);

    // Horizontal axis line through center
    ctx.beginPath();
    ctx.moveTo(left * pixelRatio, centerY * pixelRatio);
    ctx.lineTo(right * pixelRatio, centerY * pixelRatio);
    ctx.stroke();

    // Reset line dash before filling arrowhead
    ctx.setLineDash([]);

    // Upgraded Horizontal Arrowhead on the dragged side
    const isDraggedRight = p2.x >= p1.x;
    ctx.beginPath();
    if (isDraggedRight) {
      const tipX = right * pixelRatio;
      const tipY = centerY * pixelRatio;
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - 8 * pixelRatio, tipY - 4 * pixelRatio);
      ctx.lineTo(tipX - 5.5 * pixelRatio, tipY);
      ctx.lineTo(tipX - 8 * pixelRatio, tipY + 4 * pixelRatio);
    } else {
      const tipX = left * pixelRatio;
      const tipY = centerY * pixelRatio;
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + 8 * pixelRatio, tipY - 4 * pixelRatio);
      ctx.lineTo(tipX + 5.5 * pixelRatio, tipY);
      ctx.lineTo(tipX + 8 * pixelRatio, tipY + 4 * pixelRatio);
    }
    ctx.closePath();
    ctx.fill();

    // Vertical axis line through center (dashed)
    ctx.setLineDash([4 * pixelRatio, 4 * pixelRatio]);
    ctx.beginPath();
    ctx.moveTo(centerX * pixelRatio, top * pixelRatio);
    ctx.lineTo(centerX * pixelRatio, bottom * pixelRatio);
    ctx.stroke();

    // Reset line dash before filling vertical arrowhead
    ctx.setLineDash([]);

    // Upgraded Vertical Arrowhead on the dragged side
    const isDraggedUp = p2.y <= p1.y;
    ctx.beginPath();
    if (isDraggedUp) {
      const tipX = centerX * pixelRatio;
      const tipY = top * pixelRatio;
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - 4 * pixelRatio, tipY + 8 * pixelRatio);
      ctx.lineTo(tipX, tipY + 5.5 * pixelRatio);
      ctx.lineTo(tipX + 4 * pixelRatio, tipY + 8 * pixelRatio);
    } else {
      const tipX = centerX * pixelRatio;
      const tipY = bottom * pixelRatio;
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - 4 * pixelRatio, tipY - 8 * pixelRatio);
      ctx.lineTo(tipX, tipY - 5.5 * pixelRatio);
      ctx.lineTo(tipX + 4 * pixelRatio, tipY - 8 * pixelRatio);
    }
    ctx.closePath();
    ctx.fill();

    // 4. Volume and Bar Count calculation
    let barCount = info.bars;
    let totalVolume = 0;
    try {
      const charts = Array.from((window as any).globalCoreCharts || []).filter((c: any) => {
        try {
          const container = typeof c?.getContainer === 'function' ? c.getContainer() : null;
          return container && document.body.contains(container);
        } catch (e) {
          return false;
        }
      });
      const chart = charts.find((c: any) => {
        try {
          return c.getOverlays({ id: this._drawing.id }).length > 0;
        } catch (err) {
          return false;
        }
      }) || (globalThis as any).__active_chart_instance__ || charts[0];

      if (chart && typeof chart.getDataList === 'function') {
        const dataList = chart.getDataList();
        let startIndex = (anchors[0] as any).dataIndex;
        let endIndex = (anchors[1] as any).dataIndex;
        if ((startIndex === undefined || !Number.isFinite(startIndex)) && anchors[0]?.time && Array.isArray(dataList)) {
          const t = Number(anchors[0].time);
          const idx = dataList.findIndex((item: any) => item && Number(item.timestamp) === t);
          if (idx !== -1) startIndex = idx;
        }
        if ((endIndex === undefined || !Number.isFinite(endIndex)) && anchors[1]?.time && Array.isArray(dataList)) {
          const t = Number(anchors[1].time);
          const idx = dataList.findIndex((item: any) => item && Number(item.timestamp) === t);
          if (idx !== -1) endIndex = idx;
        }

        if (startIndex !== undefined && endIndex !== undefined && Number.isFinite(startIndex) && Number.isFinite(endIndex)) {
          const sIdx = Math.round(Number(startIndex));
          const eIdx = Math.round(Number(endIndex));
          barCount = Math.abs(eIdx - sIdx) + 1;

          if (Array.isArray(dataList) && dataList.length > 0) {
            const minIdx = Math.max(0, Math.min(sIdx, eIdx));
            const maxIdx = Math.min(dataList.length - 1, Math.max(sIdx, eIdx));
            for (let i = minIdx; i <= maxIdx; i++) {
              const v = Number(dataList[i]?.volume ?? dataList[i]?.vol ?? 0);
              if (Number.isFinite(v)) totalVolume += v;
            }
          }
        }
      }
    } catch (e) {}

    // Format 3 text lines
    const line1 = formatLine1(info.priceChange, info.priceChangePercent);
    const durationStr = formatDuration(info.startTime, info.endTime, info.days);
    const line2 = `${barCount} ${barCount === 1 ? 'bar' : 'bars'}, ${durationStr}`;
    const volStr = formatVolume(totalVolume);
    const line3 = `Vol ${volStr}`;

    const lines = [line1, line2, line3];

    // 5. Tooltip Card dimensions and text
    const fontSize = 12;
    const fontSmallSize = 11;
    const lineHeight = 16;
    const paddingX = 16;
    const paddingY = 8;

    let maxTextWidth = 0;
    for (let i = 0; i < lines.length; i++) {
      ctx.font = i === 0 ? `600 ${fontSize * pixelRatio}px 'Rubik', sans-serif` : `400 ${fontSmallSize * pixelRatio}px 'Rubik', sans-serif`;
      const w = ctx.measureText(lines[i]).width / pixelRatio;
      if (w > maxTextWidth) maxTextWidth = w;
    }

    const cardWidth = maxTextWidth + paddingX * 2;
    const cardHeight = lines.length * lineHeight + paddingY * 2;

    const cardX = centerX - cardWidth / 2;
    let cardY = bottom + 12;
    if (cardY + cardHeight > viewport.height - 10) {
      cardY = top - cardHeight - 12;
    }

    const cornerRadius = 6 * pixelRatio;
    const cX = cardX * pixelRatio;
    const cY = cardY * pixelRatio;
    const cW = cardWidth * pixelRatio;
    const cH = cardHeight * pixelRatio;

    // Background Card
    ctx.fillStyle = cardBgColor;
    drawRoundedRect(ctx, cX, cY, cW, cH, cornerRadius);
    ctx.fill();

    // Card Text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < lines.length; i++) {
      ctx.font = i === 0 ? `600 ${fontSize * pixelRatio}px 'Rubik', sans-serif` : `400 ${fontSmallSize * pixelRatio}px 'Rubik', sans-serif`;
      const textY = cardY + paddingY + (i + 0.5) * lineHeight;
      ctx.fillText(lines[i], centerX * pixelRatio, textY * pixelRatio);
    }


    // Control points when selected/editing
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
