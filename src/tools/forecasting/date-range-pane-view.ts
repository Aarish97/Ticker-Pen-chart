import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { DateRange } from './date-range';
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
    return (vol / 1e9).toFixed(2) + ' B';
  }
  if (vol >= 1e6) {
    return (vol / 1e6).toFixed(2) + ' M';
  }
  if (vol >= 1e3) {
    return (vol / 1e3).toFixed(2) + ' K';
  }
  return vol > 0 ? vol.toLocaleString('en-US') : '0';
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

export class DateRangePaneView implements IPrimitivePaneView {
  private _renderer: DateRangePaneRenderer;

  constructor(drawing: DateRange) {
    this._renderer = new DateRangePaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class DateRangePaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: DateRange;

  constructor(drawing: DateRange) {
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

    const info = this._drawing.getDateRangeInfo();
    const lineColor = '#2962ff';
    const fillColor = 'rgba(41, 98, 255, 0.18)';

    const left = Math.min(p1.x, p2.x);
    const right = Math.max(p1.x, p2.x);
    const width = right - left;

    let top = Math.min(p1.y, p2.y);
    let bottom = Math.max(p1.y, p2.y);
    if (bottom - top < 20) {
      const midY = (p1.y + p2.y) / 2;
      top = midY - 60;
      bottom = midY + 60;
    }
    const height = bottom - top;
    const centerY = (top + bottom) / 2;
    const centerX = (left + right) / 2;

    // 1. Draw filled shaded background band
    ctx.fillStyle = fillColor;
    ctx.fillRect(left * pixelRatio, top * pixelRatio, width * pixelRatio, height * pixelRatio);

    // 2. Draw left and right vertical border lines + Center horizontal line with dashed styling
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1 * pixelRatio;
    ctx.setLineDash([4 * pixelRatio, 4 * pixelRatio]);

    // Left vertical border line
    ctx.beginPath();
    ctx.moveTo(left * pixelRatio, top * pixelRatio);
    ctx.lineTo(left * pixelRatio, bottom * pixelRatio);
    ctx.stroke();

    // Right vertical border line
    ctx.beginPath();
    ctx.moveTo(right * pixelRatio, top * pixelRatio);
    ctx.lineTo(right * pixelRatio, bottom * pixelRatio);
    ctx.stroke();

    // 3. Horizontal center line
    ctx.beginPath();
    ctx.moveTo(left * pixelRatio, centerY * pixelRatio);
    ctx.lineTo(right * pixelRatio, centerY * pixelRatio);
    ctx.stroke();

    // Reset line dash for arrowheads, cards, and control points
    ctx.setLineDash([]);

    // 4. Upgraded Flared Arrowhead on horizontal line at dragged direction
    const isDraggedRight = p2.x >= p1.x;
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    if (isDraggedRight) {
      // Pointing Right (►) at right vertical line
      const tipX = right * pixelRatio;
      const tipY = centerY * pixelRatio;
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - 8 * pixelRatio, tipY - 4 * pixelRatio);
      ctx.lineTo(tipX - 5.5 * pixelRatio, tipY);
      ctx.lineTo(tipX - 8 * pixelRatio, tipY + 4 * pixelRatio);
    } else {
      // Pointing Left (◄) at left vertical line
      const tipX = left * pixelRatio;
      const tipY = centerY * pixelRatio;
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + 8 * pixelRatio, tipY - 4 * pixelRatio);
      ctx.lineTo(tipX + 5.5 * pixelRatio, tipY);
      ctx.lineTo(tipX + 8 * pixelRatio, tipY + 4 * pixelRatio);
    }
    ctx.closePath();
    ctx.fill();


    // 6. Volume and Bar Count calculation
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

    // 7. Dark Tooltip Card below bottom line
    const durationStr = formatDuration(info.startTime, info.endTime, info.days);
    const line1 = `${barCount} ${barCount === 1 ? 'bar' : 'bars'}, ${durationStr}`;
    const volStr = formatVolume(totalVolume);
    const line2 = `Vol ${volStr}`;

    const fontSize1 = 12;
    const fontSize2 = 11;
    ctx.font = `600 ${fontSize1 * pixelRatio}px 'Rubik', sans-serif`;
    const w1 = ctx.measureText(line1).width / pixelRatio;
    ctx.font = `400 ${fontSize2 * pixelRatio}px 'Rubik', sans-serif`;
    const w2 = ctx.measureText(line2).width / pixelRatio;

    const maxTextWidth = Math.max(w1, w2);
    const paddingX = 14;
    const cardWidth = maxTextWidth + paddingX * 2;
    const cardHeight = 36;

    const cardX = centerX - cardWidth / 2;
    let cardY = bottom + 10;
    if (cardY + cardHeight > viewport.height - 10) {
      cardY = top - cardHeight - 10;
    }

    const cX = cardX * pixelRatio;
    const cY = cardY * pixelRatio;
    const cW = cardWidth * pixelRatio;
    const cH = cardHeight * pixelRatio;

    // Background Card
    ctx.fillStyle = '#1e222d';
    drawRoundedRect(ctx, cX, cY, cW, cH, 6 * pixelRatio);
    ctx.fill();

    // Text inside Card
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `600 ${fontSize1 * pixelRatio}px 'Rubik', sans-serif`;
    ctx.fillText(line1, centerX * pixelRatio, (cardY + 11) * pixelRatio);

    ctx.font = `400 ${fontSize2 * pixelRatio}px 'Rubik', sans-serif`;
    ctx.fillText(line2, centerX * pixelRatio, (cardY + 26) * pixelRatio);

    // Control points when selected/editing
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing' || state === 'hovered') {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
