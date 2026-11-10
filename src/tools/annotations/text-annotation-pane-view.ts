import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { TextAnnotation } from './text-annotation';

export class TextAnnotationPaneView implements IPrimitivePaneView {
  private _renderer: TextAnnotationPaneRenderer;

  constructor(drawing: TextAnnotation) {
    this._renderer = new TextAnnotationPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class TextAnnotationPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: TextAnnotation;

  constructor(drawing: TextAnnotation) {
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

    const anchor = this._drawing.anchors[0];
    const p = this._drawing.anchorToPixel(anchor, viewport);
    if (!p) return;

    const options = this._drawing.textOptions;
    const text = options.text ?? '';
    const fontSize = (options.fontSize ?? 14) * pixelRatio;
    const fontFamily = options.fontFamily ?? "'Rubik', sans-serif";
    const fontWeight = options.fontWeight ?? 'normal';
    const fontStyle = options.fontStyle ?? 'normal';
    const underline = options.underline ?? false;
    const textColor = options.textColor ?? this._drawing.style.labelColor ?? '#ffffff';
    const padding = (options.padding ?? 8) * pixelRatio;

    // Set up font
    ctx.setLineDash([]);
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = options.textAlign ?? 'left';
    ctx.textBaseline = 'top';

    // Split text into lines
    const lines = text.split('\n');
    const lineSpacing = 1.25;
    const lineHeight = fontSize * lineSpacing;
    
    // Measure all lines to find the maximum width
    const textWidths = lines.map(line => ctx.measureText(line).width);
    const textWidth = Math.max(...textWidths, 10);
    const totalTextHeight = lines.length * lineHeight - (lineSpacing - 1) * fontSize;

    const x = p.x * pixelRatio;
    const y = p.y * pixelRatio;

    // Calculate box position based on alignment
    let boxX = x;
    if (options.textAlign === 'center') {
      boxX = x - textWidth / 2;
    } else if (options.textAlign === 'right') {
      boxX = x - textWidth;
    }

    const boxY = y - totalTextHeight / 2;

    // Draw background
    if (options.backgroundColor && options.backgroundColor !== 'transparent') {
      ctx.fillStyle = options.backgroundColor;
      ctx.beginPath();
      ctx.roundRect(
        boxX - padding,
        boxY - padding,
        textWidth + padding * 2,
        totalTextHeight + padding * 2,
        4 * pixelRatio
      );
      ctx.fill();
    }

    // Draw border
    if (options.borderColor && options.borderColor !== 'transparent') {
      ctx.strokeStyle = options.borderColor;
      ctx.lineWidth = 1 * pixelRatio;
      ctx.beginPath();
      ctx.roundRect(
        boxX - padding,
        boxY - padding,
        textWidth + padding * 2,
        totalTextHeight + padding * 2,
        4 * pixelRatio
      );
      ctx.stroke();
    }

    // Draw text lines
    if (this._drawing.state !== 'editing') {
      ctx.fillStyle = textColor;
      lines.forEach((line, i) => {
        const lineY = boxY + i * lineHeight;
        const lineWidth = textWidths[i];
        let lineX = x;
        let lineUnderlineStartX = boxX;
        
        if (options.textAlign === 'center') {
          lineUnderlineStartX = x - lineWidth / 2;
        } else if (options.textAlign === 'right') {
          lineUnderlineStartX = x - lineWidth;
        }

        ctx.fillText(line, lineX, lineY);

        // Draw underline
        if (underline) {
          ctx.strokeStyle = textColor;
          ctx.lineWidth = Math.max(1, pixelRatio);
          ctx.beginPath();
          ctx.moveTo(lineUnderlineStartX, lineY + fontSize + 2 * pixelRatio);
          ctx.lineTo(lineUnderlineStartX + lineWidth, lineY + fontSize + 2 * pixelRatio);
          ctx.stroke();
        }
      });
    }
  }
}
