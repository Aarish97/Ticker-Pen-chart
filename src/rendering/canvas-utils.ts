import type { Point, DrawingStyle, ControlPoint } from '../core/types';

/**
 * Helper to compute dynamic dash pattern scaling with line width (px)
 */
export function getDashPattern(lineWidth: number = 1, pixelRatio: number = 1): number[] {
  const len = Math.max(6, lineWidth * 3.5);
  const gap = Math.max(5, lineWidth * 3.0);
  return [len * pixelRatio, gap * pixelRatio];
}

/**
 * Helper to compute dynamic dot pattern scaling with line width (px)
 * With ctx.lineCap = 'round', [0, gap] produces 100% mathematically perfect circular dots.
 */
export function getDotPattern(lineWidth: number = 1, pixelRatio: number = 1): number[] {
  const gap = Math.max(4, lineWidth * 2.5);
  return [0, gap * pixelRatio];
}

/**
 * Set up canvas context with drawing style
 */
export function applyStyle(
  ctx: CanvasRenderingContext2D,
  style: DrawingStyle,
  pixelRatio: number = 1
): void {
  const lw = style.lineWidth || 1;
  ctx.strokeStyle = style.lineColor;
  ctx.lineWidth = lw * pixelRatio;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if ((style as any).lineStyle === 'dotted' || (style as any).lineStyle === 2) {
    ctx.setLineDash(getDotPattern(lw, pixelRatio));
  } else if ((style as any).lineStyle === 'dashed' || (style as any).lineStyle === 1) {
    ctx.setLineDash(getDashPattern(lw, pixelRatio));
  } else if (style.lineDash && style.lineDash.length > 0) {
    if (style.lineDash[0] <= 2 && style.lineDash[1] <= 4) {
      ctx.setLineDash(getDotPattern(lw, pixelRatio));
    } else {
      const scale = lw > 1 ? (lw * 0.8) : 1;
      ctx.setLineDash(style.lineDash.map((d: number) => d * scale * pixelRatio));
    }
  } else {
    ctx.setLineDash([]);
  }

  if (style.fillColor) {
    ctx.fillStyle = style.fillColor;
  }
}

/**
 * Draw a line between two points
 */
export function drawLine(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  pixelRatio: number = 1
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(start.x * pixelRatio, start.y * pixelRatio);
  ctx.lineTo(end.x * pixelRatio, end.y * pixelRatio);
  ctx.stroke();
}

/**
 * Draw a dashed line between two points
 */
export function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  dashPattern: number[] = [5, 5],
  pixelRatio: number = 1
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(dashPattern.map((d) => d * pixelRatio));
  drawLine(ctx, start, end, pixelRatio);
  ctx.restore();
}

/**
 * Draw a control point (anchor handle) in TradingView style:
 * dark filled center with a colored ring.
 */
export function drawControlPoint(
  ctx: CanvasRenderingContext2D,
  point: ControlPoint,
  isActive: boolean = false,
  pixelRatio: number = 1,
  _lineColor: string = '#2962FF'
): void {
  const x = point.x * pixelRatio;
  const y = point.y * pixelRatio;
  const radius = 5 * pixelRatio;
  const ringWidth = 1.5 * pixelRatio;

  ctx.save();
  ctx.setLineDash([]);

  if (point.shape === 'rect') {
    const size = 10 * pixelRatio; // larger than circle anchors for center handles
    const rx = x - size / 2;
    const ry = y - size / 2;
    const cornerRadius = 2 * pixelRatio; // soft edges

    // Dark filled center
    ctx.beginPath();
    ctx.roundRect(rx, ry, size, size, cornerRadius);
    ctx.fillStyle = '#131722';
    ctx.fill();

    // Colored ring
    ctx.beginPath();
    ctx.roundRect(rx + ringWidth / 2, ry + ringWidth / 2, size - ringWidth, size - ringWidth, Math.max(0, cornerRadius - ringWidth / 2));
    ctx.strokeStyle = '#2962FF';
    ctx.lineWidth = ringWidth;
    ctx.stroke();
  } else {
    // Dark filled center
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#131722';
    ctx.fill();

    // Colored ring
    ctx.beginPath();
    ctx.arc(x, y, radius - ringWidth / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#2962FF';
    ctx.lineWidth = ringWidth;
    ctx.stroke();
  }

  ctx.restore();
}

export let globalActiveDragAnchorInfo: { overlayId?: string; index: number | null } = { index: null };

export function setGlobalActiveDragAnchor(index: number | null, overlayId?: string) {
  globalActiveDragAnchorInfo = { overlayId, index };
}

export function getGlobalActiveDragAnchor(): { overlayId?: string; index: number | null } {
  return globalActiveDragAnchorInfo;
}

export let globalDrawingPlacedCount: number | null = null;

export function setGlobalDrawingPlacedCount(count: number | null) {
  globalDrawingPlacedCount = count;
}

export function getGlobalDrawingPlacedCount(): number | null {
  return globalDrawingPlacedCount;
}

/**
 * Draw all control points for a drawing
 */
export function drawControlPoints(
  ctx: CanvasRenderingContext2D,
  points: (Point | ControlPoint)[],
  activeIndex: number | null = null,
  pixelRatio: number = 1,
  lineColor: string = '#2962FF',
  drawingId?: string
): void {
  const hiddenIdx = activeIndex ?? (
    globalActiveDragAnchorInfo.index !== null ? globalActiveDragAnchorInfo.index : null
  );

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const pointIndex = ('index' in point) ? (point as ControlPoint).index : i;
    if (hiddenIdx !== null && pointIndex === hiddenIdx) {
      continue; // Hide clicked/dragged anchor handle until released!
    }
    if ((point as any).hidden) continue;

    // During drawing placement, only show anchor points that have already been placed on the chart.
    // The anchor point currently being positioned by the cursor (index >= globalDrawingPlacedCount) must NOT show!
    if (globalDrawingPlacedCount !== null && typeof pointIndex === 'number' && pointIndex >= globalDrawingPlacedCount) {
      continue;
    }

    const cp: ControlPoint = ('index' in point)
      ? point as ControlPoint
      : { x: point.x, y: point.y, index: i, radius: 6 };
    drawControlPoint(ctx, cp, pointIndex === activeIndex, pixelRatio, lineColor);
  }
}

/**
 * Draw a filled arrow head
 */

export function drawFilledArrowHead(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  size: number = 10,
  pixelRatio: number = 1
): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const arrowSize = size * pixelRatio;

  const x = to.x * pixelRatio;
  const y = to.y * pixelRatio;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x - arrowSize * Math.cos(angle - Math.PI / 6),
    y - arrowSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x - arrowSize * Math.cos(angle + Math.PI / 6),
    y - arrowSize * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw a circle
 */
export function drawCircle(
  ctx: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  fill: boolean = false,
  pixelRatio: number = 1
): void {
  ctx.beginPath();
  ctx.arc(
    center.x * pixelRatio,
    center.y * pixelRatio,
    radius * pixelRatio,
    0,
    Math.PI * 2
  );

  if (fill) {
    ctx.fill();
  }
  ctx.stroke();
}

/**
 * Draw a rectangle
 */
export function drawRect(
  ctx: CanvasRenderingContext2D,
  topLeft: Point,
  width: number,
  height: number,
  fill: boolean = false,
  pixelRatio: number = 1
): void {
  const x = topLeft.x * pixelRatio;
  const y = topLeft.y * pixelRatio;
  const w = width * pixelRatio;
  const h = height * pixelRatio;

  if (fill) {
    ctx.fillRect(x, y, w, h);
  }
  ctx.strokeRect(x, y, w, h);
}

/**
 * Draw text at a position
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: Point,
  font: string = "12px 'Rubik', sans-serif",
  color: string = '#000000',
  align: CanvasTextAlign = 'left',
  baseline: CanvasTextBaseline = 'middle',
  pixelRatio: number = 1
): void {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, position.x * pixelRatio, position.y * pixelRatio);
  ctx.restore();
}

/**
 * Draw a label with background
 */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: Point,
  style: {
    font?: string;
    textColor?: string;
    backgroundColor?: string;
    padding?: number;
    borderRadius?: number;
    textAlign?: CanvasTextAlign;
  } = {},
  pixelRatio: number = 1
): void {
  const {
    font = "12px 'Rubik', sans-serif",
    textColor = '#ffffff',
    backgroundColor = 'rgba(0, 0, 0, 0.7)',
    padding = 4,
    borderRadius = 3,
    textAlign = 'left',
  } = style;

  ctx.save();
  ctx.font = font;

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = parseInt(font.match(/(\d+)px/)?.[1] ?? '12');
  const pad = padding * pixelRatio;
  const radius = borderRadius * pixelRatio;
  const boxWidth = textWidth + pad * 2;

  const rawX = position.x * pixelRatio;
  const y = position.y * pixelRatio;

  let x = rawX;
  let boxX = 0;

  if (textAlign === 'center') {
    const minBoxX = pad;
    const maxBoxX = ctx.canvas.width - boxWidth - pad;
    boxX = Math.max(minBoxX, Math.min(rawX - boxWidth / 2, maxBoxX));
    x = boxX + pad + textWidth / 2;
  } else {
    const minX = pad + pixelRatio;
    const maxX = ctx.canvas.width - textWidth - pad * 2 - 2 * pixelRatio;
    x = Math.max(minX, Math.min(rawX, maxX));
    boxX = x - pad;
  }

  // Draw background
  ctx.fillStyle = backgroundColor;
  ctx.beginPath();
  ctx.roundRect(
    boxX,
    y - textHeight / 2 - pad,
    boxWidth,
    textHeight + pad * 2,
    radius
  );
  ctx.fill();

  // Draw text
  ctx.fillStyle = textColor;
  ctx.textAlign = textAlign;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);

  ctx.restore();
}

/**
 * Format price for display. When precision is omitted, picks decimals based on
 * the price magnitude so sub-cent values don't render as "0.00".
 */
export function formatPrice(price: number, precision?: number): string {
  let prec = precision;
  if (prec === undefined && typeof window !== 'undefined' && typeof (window as any).__active_price_precision__ === 'number') {
    prec = (window as any).__active_price_precision__;
  }
  if (prec !== undefined) return price.toFixed(prec);
  const abs = Math.abs(price);
  if (abs === 0 || abs >= 1) return price.toFixed(2);
  if (abs >= 0.01) return price.toFixed(4);
  if (abs >= 0.0001) return price.toFixed(6);
  return price.toFixed(8);
}
