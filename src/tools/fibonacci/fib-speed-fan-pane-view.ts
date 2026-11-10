import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import { type FibSpeedFan, DEFAULT_SPEED_FAN_PRICE_LEVELS, DEFAULT_SPEED_FAN_TIME_LEVELS } from './fib-speed-fan';
import { distanceBetweenPoints } from '../../core/geometry';
import type { Point } from '../../core/types';
import { drawControlPoints, drawText, getDashPattern, getDotPattern } from '../../rendering/canvas-utils';

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

function extendRayToViewport(O: Point, T: Point, width: number, height: number): Point {
  const vx = T.x - O.x;
  const vy = T.y - O.y;

  if (Math.abs(vx) < 1e-6 && Math.abs(vy) < 1e-6) {
    return { x: T.x, y: T.y };
  }

  let tx = Infinity;
  if (vx > 1e-6) {
    tx = (width - O.x) / vx;
  } else if (vx < -1e-6) {
    tx = (0 - O.x) / vx;
  }

  let ty = Infinity;
  if (vy > 1e-6) {
    ty = (height - O.y) / vy;
  } else if (vy < -1e-6) {
    ty = (0 - O.y) / vy;
  }

  const t = Math.min(tx, ty);
  if (!isFinite(t) || t <= 0) {
    return { x: T.x, y: T.y };
  }

  return {
    x: O.x + t * vx,
    y: O.y + t * vy
  };
}

export class FibSpeedFanPaneView implements IPrimitivePaneView {
  private _renderer: FibSpeedFanPaneRenderer;

  constructor(drawing: FibSpeedFan) {
    this._renderer = new FibSpeedFanPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class FibSpeedFanPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: FibSpeedFan;

  constructor(drawing: FibSpeedFan) {
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
    const p1 = this._drawing.anchorToPixel(anchors[0], viewport); // Origin (1, 1)
    const p2 = this._drawing.anchorToPixel(anchors[1], viewport); // Target (0, 0)

    if (!p1) return;

    const state = this._drawing.state;
    const shouldDrawControl = state === 'selected' || state === 'editing' || state === 'hovered';

    // Step 1: Only point 1 placed
    if (!p2 || distanceBetweenPoints(p1, p2) <= 1) {
      if (shouldDrawControl) {
        const controlPoints = this._drawing.getControlPoints(viewport);
        drawControlPoints(ctx, controlPoints, null, pixelRatio);
      }
      return;
    }

    const options = this._drawing.fibOptions;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const rev = options.reverse ?? false;
    const bgOpacity = options.backgroundOpacity ?? 0.15;
    const lineW = (options.lineWidth ?? (options as any).levelLineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;

    // 1. Process Price Levels (distance measured from Anchor 2: k = rev ? item.value : (1 - item.value))
    const rawPriceLevels = options.priceLevels ?? DEFAULT_SPEED_FAN_PRICE_LEVELS;
    const activePrice = rawPriceLevels.filter(l => l.enabled !== false);
    const sortedPrice = [...activePrice].sort((a, b) => a.value - b.value);

    const priceRays = sortedPrice.map(item => {
      const k = rev ? item.value : 1 - item.value;
      const target = { x: p2.x, y: p1.y + k * dy };
      const extEnd = extendRayToViewport(p1, target, viewport.width, viewport.height);
      const color = options.useOneColor && options.oneColor ? options.oneColor : item.color;
      return { item, k, target, extEnd, color };
    });

    // 2. Process Time Levels (distance measured from Anchor 2: k = rev ? item.value : (1 - item.value))
    const rawTimeLevels = options.timeLevels ?? DEFAULT_SPEED_FAN_TIME_LEVELS;
    const activeTime = rawTimeLevels.filter(l => l.enabled !== false);
    const sortedTime = [...activeTime].sort((a, b) => a.value - b.value);

    const timeRays = sortedTime.map(item => {
      const k = rev ? item.value : 1 - item.value;
      const target = { x: p1.x + k * dx, y: p2.y };
      const extEnd = extendRayToViewport(p1, target, viewport.width, viewport.height);
      const color = options.useOneColor && options.oneColor ? options.oneColor : item.color;
      return { item, k, target, extEnd, color };
    });

    // 3. Draw Background Fills (between consecutive active levels)
    if (options.filled !== false) {
      // Fill Price sectors (from level 0 outward to 0.25 -> 0.382 -> 0.5 -> 0.618 -> 0.75)
      for (let i = 0; i < priceRays.length - 1; i++) {
        const r1 = priceRays[i];
        const r2 = priceRays[i + 1];
        ctx.fillStyle = hexToRgba(r2.color, bgOpacity);
        ctx.beginPath();
        ctx.moveTo(p1.x * pixelRatio, p1.y * pixelRatio);
        ctx.lineTo(r1.extEnd.x * pixelRatio, r1.extEnd.y * pixelRatio);
        ctx.lineTo(r2.extEnd.x * pixelRatio, r2.extEnd.y * pixelRatio);
        ctx.closePath();
        ctx.fill();
      }

      // Fill Time sectors
      for (let i = 0; i < timeRays.length - 1; i++) {
        const r1 = timeRays[i];
        const r2 = timeRays[i + 1];
        ctx.fillStyle = hexToRgba(r2.color, bgOpacity);
        ctx.beginPath();
        ctx.moveTo(p1.x * pixelRatio, p1.y * pixelRatio);
        ctx.lineTo(r1.extEnd.x * pixelRatio, r1.extEnd.y * pixelRatio);
        ctx.lineTo(r2.extEnd.x * pixelRatio, r2.extEnd.y * pixelRatio);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 4. Draw Grid Box & Internal Grid Lines
    if (options.showGrid !== false) {
      const gridColor = options.gridColor || '#2962FF';
      const gridW = (options.gridWidth ?? options.lineWidth ?? this._drawing.style.lineWidth ?? 1) * pixelRatio;
      const gridStyle = options.gridStyle || 'solid';

      ctx.save();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = gridW;
      if (gridStyle === 'dashed') {
        ctx.setLineDash(getDashPattern(gridW, 1));
      } else if (gridStyle === 'dotted') {
        ctx.setLineDash(getDotPattern(gridW, 1));
      } else {
        ctx.setLineDash([]);
      }

      // Outer Bounding Rectangle [p1, p2]
      ctx.beginPath();
      ctx.moveTo(p1.x * pixelRatio, p1.y * pixelRatio);
      ctx.lineTo(p2.x * pixelRatio, p1.y * pixelRatio);
      ctx.lineTo(p2.x * pixelRatio, p2.y * pixelRatio);
      ctx.lineTo(p1.x * pixelRatio, p2.y * pixelRatio);
      ctx.closePath();
      ctx.stroke();

      // Internal Vertical Grid Lines at Time divisions
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (const ray of timeRays) {
        if (ray.k > 0.01 && ray.k < 0.99) {
          ctx.beginPath();
          ctx.moveTo(ray.target.x * pixelRatio, p1.y * pixelRatio);
          ctx.lineTo(ray.target.x * pixelRatio, p2.y * pixelRatio);
          ctx.stroke();
        }
      }

      // Internal Horizontal Grid Lines at Price divisions
      for (const ray of priceRays) {
        if (ray.k > 0.01 && ray.k < 0.99) {
          ctx.beginPath();
          ctx.moveTo(p1.x * pixelRatio, ray.target.y * pixelRatio);
          ctx.lineTo(p2.x * pixelRatio, ray.target.y * pixelRatio);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Diagonal Trendline p1 -> p2
      ctx.beginPath();
      ctx.moveTo(p1.x * pixelRatio, p1.y * pixelRatio);
      ctx.lineTo(p2.x * pixelRatio, p2.y * pixelRatio);
      ctx.stroke();

      ctx.restore();
    }

    // 5. Draw Price Rays
    for (const ray of priceRays) {
      ctx.save();
      ctx.strokeStyle = ray.color;
      ctx.lineWidth = lineW;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(p1.x * pixelRatio, p1.y * pixelRatio);
      ctx.lineTo(ray.extEnd.x * pixelRatio, ray.extEnd.y * pixelRatio);
      ctx.stroke();
      ctx.restore();
    }

    // 6. Draw Time Rays
    for (const ray of timeRays) {
      ctx.save();
      ctx.strokeStyle = ray.color;
      ctx.lineWidth = lineW;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(p1.x * pixelRatio, p1.y * pixelRatio);
      ctx.lineTo(ray.extEnd.x * pixelRatio, ray.extEnd.y * pixelRatio);
      ctx.stroke();
      ctx.restore();
    }

    // 7. Draw Labels
    // Price Labels: Right labels at x = p2.x, Left labels at x = p1.x
    for (const ray of priceRays) {
      const text = String(ray.item.value);
      if (options.showRightLabels !== false) {
        drawText(
          ctx,
          text,
          { x: p2.x + 6, y: ray.target.y },
          "11px 'Rubik', sans-serif",
          ray.color,
          'left',
          'middle',
          pixelRatio
        );
      }
      if (options.showLeftLabels !== false) {
        drawText(
          ctx,
          text,
          { x: p1.x - 6, y: ray.target.y },
          "11px 'Rubik', sans-serif",
          ray.color,
          'right',
          'middle',
          pixelRatio
        );
      }
    }

    // Time Labels: Top labels at y = p2.y, Bottom labels at y = p1.y
    for (const ray of timeRays) {
      const text = String(ray.item.value);
      if (options.showTopLabels !== false) {
        drawText(
          ctx,
          text,
          { x: ray.target.x, y: p2.y - 6 },
          "11px 'Rubik', sans-serif",
          ray.color,
          'center',
          'bottom',
          pixelRatio
        );
      }
      if (options.showBottomLabels !== false) {
        drawText(
          ctx,
          text,
          { x: ray.target.x, y: p1.y + 6 },
          "11px 'Rubik', sans-serif",
          ray.color,
          'center',
          'top',
          pixelRatio
        );
      }
    }

    // 8. Draw Control Points
    if (shouldDrawControl) {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
