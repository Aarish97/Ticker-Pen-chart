import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import { type Pitchfan, type PitchfanLevelItem, DEFAULT_PITCHFAN_LEVELS } from './pitchfan';
import type { Point } from '../../core/types';
import { midpoint } from '../../core/geometry';
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

export class PitchfanPaneView implements IPrimitivePaneView {
  private _renderer: PitchfanPaneRenderer;

  constructor(drawing: Pitchfan) {
    this._renderer = new PitchfanPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class PitchfanPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: Pitchfan;

  constructor(drawing: Pitchfan) {
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
    const p0 = this._drawing.anchorToPixel(anchors[0], viewport);
    const p1 = this._drawing.anchorToPixel(anchors[1], viewport);
    const p2 = this._drawing.anchorToPixel(anchors[2], viewport);

    if (!p0) return;

    const state = this._drawing.state;
    const shouldDrawControl = state === 'selected' || state === 'editing' || state === 'hovered';

    // Step 1: Only pivot placed
    if (!p1 || !p2) {
      if (shouldDrawControl) {
        const controlPoints = this._drawing.getControlPoints(viewport);
        drawControlPoints(ctx, controlPoints, null, pixelRatio);
      }
      return;
    }

    const options = this._drawing.fibOptions;

    // Step 2: p0 and p1 placed, p2 not yet placed (drawing placement)
    const isP2Placed = Math.hypot(p2.x - p0.x, p2.y - p0.y) > 1 && Math.hypot(p2.x - p1.x, p2.y - p1.y) > 1;
    if (!isP2Placed) {
      // Draw guide line between p0 and p1
      ctx.save();
      ctx.strokeStyle = '#787B86';
      ctx.lineWidth = 1 * pixelRatio;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(p0.x * pixelRatio, p0.y * pixelRatio);
      ctx.lineTo(p1.x * pixelRatio, p1.y * pixelRatio);
      ctx.stroke();
      ctx.restore();

      if (shouldDrawControl) {
        const controlPoints = this._drawing.getControlPoints(viewport);
        drawControlPoints(ctx, controlPoints, null, pixelRatio);
      }
      return;
    }

    const mid = midpoint(p1, p2);
    const vx = (p2.x - p1.x) / 2;
    const vy = (p2.y - p1.y) / 2;

    const rawLevels = options.levels ?? DEFAULT_PITCHFAN_LEVELS;
    const levelsList: PitchfanLevelItem[] = rawLevels.map((item: any) => {
      if (typeof item === 'number') {
        const found = DEFAULT_PITCHFAN_LEVELS.find(d => d.value === item);
        return found ? { ...found } : { value: item, color: '#787B86', enabled: true };
      }
      return { ...item };
    });

    const activeLevels = levelsList.filter(l => l.enabled !== false);
    const sortedLevels = [...activeLevels].sort((a, b) => a.value - b.value);

    const R = Math.hypot(viewport.width, viewport.height) * 4;
    const shouldExtend = options.extendLines !== false;

    // Helper to calculate ray endpoint
    const calcRayEndpoint = (target: Point): Point => {
      if (!shouldExtend) return { x: target.x, y: target.y };
      const rdx = target.x - p0.x;
      const rdy = target.y - p0.y;
      const len = Math.hypot(rdx, rdy) || 1;
      return {
        x: p0.x + (rdx / len) * R,
        y: p0.y + (rdy / len) * R
      };
    };

    // Median ray endpoint
    const extMed = calcRayEndpoint(mid);

    // Compute ray endpoints for all active levels
    const levelRays = sortedLevels.map(item => {
      const upperT = { x: mid.x + vx * item.value, y: mid.y + vy * item.value };
      const lowerT = { x: mid.x - vx * item.value, y: mid.y - vy * item.value };

      const extUpper = calcRayEndpoint(upperT);
      const extLower = calcRayEndpoint(lowerT);

      return {
        item,
        upperT,
        lowerT,
        extUpper,
        extLower,
      };
    });

    // 1. Draw Background Fills (Clean infinite sector wedges clipped to viewport)
    if (options.filled !== false && levelRays.length > 0) {
      const bgOpacity = options.backgroundOpacity ?? 0.15;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, viewport.width * pixelRatio, viewport.height * pixelRatio);
      ctx.clip();

      // Sector 0: between Median line and first active level
      const first = levelRays[0];
      const color0 = options.useOneColor && options.oneColor ? options.oneColor : first.item.color;
      ctx.fillStyle = hexToRgba(color0, bgOpacity);

      // Upper Sector 0
      ctx.beginPath();
      ctx.moveTo(p0.x * pixelRatio, p0.y * pixelRatio);
      ctx.lineTo(extMed.x * pixelRatio, extMed.y * pixelRatio);
      ctx.lineTo(first.extUpper.x * pixelRatio, first.extUpper.y * pixelRatio);
      ctx.closePath();
      ctx.fill();

      // Lower Sector 0
      ctx.beginPath();
      ctx.moveTo(p0.x * pixelRatio, p0.y * pixelRatio);
      ctx.lineTo(extMed.x * pixelRatio, extMed.y * pixelRatio);
      ctx.lineTo(first.extLower.x * pixelRatio, first.extLower.y * pixelRatio);
      ctx.closePath();
      ctx.fill();

      // Subsequent concentric fan sectors
      for (let i = 0; i < levelRays.length - 1; i++) {
        const inner = levelRays[i];
        const outer = levelRays[i + 1];
        const ringColor = options.useOneColor && options.oneColor ? options.oneColor : outer.item.color;
        ctx.fillStyle = hexToRgba(ringColor, bgOpacity);

        // Upper sector
        ctx.beginPath();
        ctx.moveTo(p0.x * pixelRatio, p0.y * pixelRatio);
        ctx.lineTo(inner.extUpper.x * pixelRatio, inner.extUpper.y * pixelRatio);
        ctx.lineTo(outer.extUpper.x * pixelRatio, outer.extUpper.y * pixelRatio);
        ctx.closePath();
        ctx.fill();

        // Lower sector
        ctx.beginPath();
        ctx.moveTo(p0.x * pixelRatio, p0.y * pixelRatio);
        ctx.lineTo(inner.extLower.x * pixelRatio, inner.extLower.y * pixelRatio);
        ctx.lineTo(outer.extLower.x * pixelRatio, outer.extLower.y * pixelRatio);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }

    // 2. Draw Fan Ray Lines
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, viewport.width * pixelRatio, viewport.height * pixelRatio);
    ctx.clip();

    for (const ray of levelRays) {
      const rayColor = options.useOneColor && options.oneColor ? options.oneColor : ray.item.color;
      const lineW = (ray.item.lineWidth ?? (options as any).levelLineWidth ?? options.lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;
      const lineStyle = ray.item.lineStyle || 'solid';

      ctx.save();
      ctx.strokeStyle = rayColor;
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

      // Upper ray
      ctx.beginPath();
      ctx.moveTo(p0.x * pixelRatio, p0.y * pixelRatio);
      ctx.lineTo(ray.extUpper.x * pixelRatio, ray.extUpper.y * pixelRatio);
      ctx.stroke();

      // Lower ray
      ctx.beginPath();
      ctx.moveTo(p0.x * pixelRatio, p0.y * pixelRatio);
      ctx.lineTo(ray.extLower.x * pixelRatio, ray.extLower.y * pixelRatio);
      ctx.stroke();

      ctx.restore();
    }

    // 3. Draw Median Line
    if (options.showMedian !== false) {
      const medColor = options.useOneColor && options.oneColor ? options.oneColor : (options.medianColor || '#F23645');
      const medW = (options.medianWidth ?? options.lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;
      const medStyle = options.medianStyle || 'solid';

      ctx.save();
      ctx.strokeStyle = medColor;
      ctx.lineWidth = medW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (medStyle === 'dashed') {
        ctx.setLineDash(getDashPattern(medW, 1));
      } else if (medStyle === 'dotted') {
        ctx.setLineDash(getDotPattern(medW, 1));
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(p0.x * pixelRatio, p0.y * pixelRatio);
      ctx.lineTo(extMed.x * pixelRatio, extMed.y * pixelRatio);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    // 4. Draw Baseline (connecting swing 1 and swing 2)
    if (options.showBaseline !== false) {
      const baseColor = options.baselineColor || '#787B86';
      const baseW = (options.baselineWidth ?? options.lineWidth ?? this._drawing.style.lineWidth ?? (this._drawing.style as any)?.size ?? 1) * pixelRatio;
      const baseStyle = options.baselineStyle || 'dashed';

      ctx.save();
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = baseW;
      if (baseStyle === 'dashed') {
        ctx.setLineDash(getDashPattern(baseW, 1));
      } else if (baseStyle === 'dotted') {
        ctx.setLineDash(getDotPattern(baseW, 1));
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(p1.x * pixelRatio, p1.y * pixelRatio);
      ctx.lineTo(p2.x * pixelRatio, p2.y * pixelRatio);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Draw Level Labels (positioned cleanly offset from ray and baseline lines)
    if (options.showLabels !== false) {
      for (const ray of levelRays) {
        const text = String(ray.item.value);
        const labelColor = options.useOneColor && options.oneColor ? options.oneColor : ray.item.color;

        // Position on upper ray offset perpendicularly from the ray line
        const rUpperX = ray.upperT.x - p0.x;
        const rUpperY = ray.upperT.y - p0.y;
        const lenUpper = Math.hypot(rUpperX, rUpperY) || 1;
        const nUpperX = -rUpperY / lenUpper;
        const nUpperY = rUpperX / lenUpper;
        const upperOffsetSign = nUpperY < 0 ? 1 : -1;
        const posUpper = {
          x: ray.upperT.x + nUpperX * 8 * upperOffsetSign,
          y: ray.upperT.y + nUpperY * 8 * upperOffsetSign
        };

        drawText(
          ctx,
          text,
          posUpper,
          "11px 'Rubik', sans-serif",
          labelColor,
          'center',
          'middle',
          pixelRatio
        );

        // Position on lower ray offset perpendicularly from the ray line
        const rLowerX = ray.lowerT.x - p0.x;
        const rLowerY = ray.lowerT.y - p0.y;
        const lenLower = Math.hypot(rLowerX, rLowerY) || 1;
        const nLowerX = -rLowerY / lenLower;
        const nLowerY = rLowerX / lenLower;
        const lowerOffsetSign = nLowerY > 0 ? 1 : -1;
        const posLower = {
          x: ray.lowerT.x + nLowerX * 8 * lowerOffsetSign,
          y: ray.lowerT.y + nLowerY * 8 * lowerOffsetSign
        };

        drawText(
          ctx,
          text,
          posLower,
          "11px 'Rubik', sans-serif",
          labelColor,
          'center',
          'middle',
          pixelRatio
        );
      }
    }

    // 6. Draw Control Points (Pivot, Swing 1, Swing 2)
    if (shouldDrawControl) {
      const controlPoints = this._drawing.getControlPoints(viewport);
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }
}
