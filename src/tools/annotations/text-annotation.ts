import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import type { Geometry, TextGeometry } from '../../core/geometry';
import { TextAnnotationPaneView } from './text-annotation-pane-view';

/**
 * TextAnnotation options
 */
export interface TextAnnotationOptions extends DrawingOptions {
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  underline?: boolean;
  textColor?: string;
  textAlign?: CanvasTextAlign;
  backgroundColor?: string;
  borderColor?: string;
  padding?: number;
}

/**
 * TextAnnotation - A text label placed on the chart.
 *
 * Features:
 * - Single anchor point (position)
 * - Customizable text, font, alignment
 * - Optional background and border
 */
export class TextAnnotation extends Drawing {
  readonly type = 'text-annotation';

  protected static readonly REQUIRED_ANCHORS = 1;
  protected static readonly HIT_THRESHOLD = 10;

  private _textOptions: TextAnnotationOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<TextAnnotationOptions> = {}
  ) {
    const { text, fontSize, fontFamily, fontWeight, fontStyle, underline, textColor, textAlign, backgroundColor, borderColor, padding, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._textOptions = {
      ...this._options,
      text: text ?? 'Add text',
      fontSize: fontSize ?? 14,
      fontFamily: fontFamily ?? "'Rubik', sans-serif",
      fontWeight: fontWeight ?? 'normal',
      fontStyle: fontStyle ?? 'normal',
      underline: underline ?? false,
      textColor: textColor ?? undefined,
      textAlign: textAlign ?? 'left',
      backgroundColor: backgroundColor ?? 'transparent',
      borderColor: borderColor ?? 'transparent',
      padding: padding ?? 8,
    };
  }

  get textOptions(): TextAnnotationOptions {
    return this._textOptions;
  }

  setTextOptions(options: Partial<TextAnnotationOptions>): void {
    this._textOptions = { ...this._textOptions, ...options };
    this.requestUpdate();
  }

  setText(text: string): void {
    this._textOptions.text = text;
    this.requestUpdate();
  }

  getText(): string {
    return this._textOptions.text ?? '';
  }

  isValid(): boolean {
    return this._anchors.length >= TextAnnotation.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new TextAnnotationPaneView(this)];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p = this.anchorToPixel(this._anchors[0], viewport);
    if (!p) return [];

    const textGeometry: TextGeometry = {
      type: 'text',
      position: p,
      text: this._textOptions.text ?? '',
      font: `${this._textOptions.fontStyle ?? 'normal'} ${this._textOptions.fontWeight ?? 'normal'} ${this._textOptions.fontSize ?? 14}px ${this._textOptions.fontFamily}`,
      color: this._textOptions.textColor ?? this._style.labelColor ?? '#ffffff',
      align: this._textOptions.textAlign,
      baseline: 'middle',
    };

    return [textGeometry];
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const p = this.anchorToPixel(this._anchors[0], viewport);
    if (!p) return false;

    const text = this._textOptions.text ?? '';
    const lines = text.split('\n');
    const fontSize = this._textOptions.fontSize ?? 14;
    const lineSpacing = 1.25;
    const lineHeight = fontSize * lineSpacing;
    const totalTextHeight = lines.length * lineHeight;
    
    // Approximate hit box based on text dimensions
    const maxLineLength = Math.max(...lines.map(line => line.length), 1);
    const estimatedWidth = maxLineLength * fontSize * 0.6;
    const padding = this._textOptions.padding ?? 8;

    const boxY = p.y - totalTextHeight / 2;

    let boxX = p.x;
    if (this._textOptions.textAlign === 'center') {
      boxX = p.x - estimatedWidth / 2;
    } else if (this._textOptions.textAlign === 'right') {
      boxX = p.x - estimatedWidth;
    }

    return (
      point.x >= boxX - padding &&
      point.x <= boxX + estimatedWidth + padding &&
      point.y >= boxY - padding &&
      point.y <= boxY + totalTextHeight + padding
    );
  }

  clone(newId: string): IDrawing {
    return new TextAnnotation(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._textOptions }
    );
  }

  static create(
    id: string,
    position: Anchor,
    text: string,
    style?: Partial<DrawingStyle>,
    options?: Partial<TextAnnotationOptions>
  ): TextAnnotation {
    return new TextAnnotation(id, [position], style, { ...options, text });
  }
}
