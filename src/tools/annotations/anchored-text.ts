import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import type { Geometry, TextGeometry } from '../../core/geometry';
import { AnchoredTextPaneView } from './anchored-text-pane-view';

function wrapTextTo40Chars(text: string): string {
  const lines = text.split('\n');
  const wrappedLines: string[] = [];
  
  for (const line of lines) {
    if (line.length <= 40) {
      wrappedLines.push(line);
    } else {
      let currentLine = line;
      while (currentLine.length > 40) {
        let wrapIndex = currentLine.lastIndexOf(' ', 40);
        if (wrapIndex === -1 || wrapIndex === 0) {
          wrapIndex = 40;
        }
        wrappedLines.push(currentLine.substring(0, wrapIndex).trim());
        currentLine = currentLine.substring(wrapIndex).trim();
      }
      if (currentLine.length > 0) {
        wrappedLines.push(currentLine);
      }
    }
  }
  return wrappedLines.join('\n');
}

/**
 * Anchored Text options
 */
export interface AnchoredTextOptions extends DrawingOptions {
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: CanvasTextAlign;
  showConnector?: boolean;
  connectorLength?: number;
}

/**
 * Anchored Text - Text anchored to a specific point with a connector line.
 *
 * Features:
 * - Two anchor points: anchor position and text position
 * - Connector line between anchor and text
 * - Customizable text styling
 */
export class AnchoredText extends Drawing {
  readonly type = 'anchored-text';

  protected static readonly REQUIRED_ANCHORS = 2;
  protected static readonly HIT_THRESHOLD = 10;

  private _textOptions: AnchoredTextOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<AnchoredTextOptions> = {}
  ) {
    const { text, fontSize, fontFamily, fontWeight, textAlign, showConnector, connectorLength, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._textOptions = {
      ...this._options,
      text: wrapTextTo40Chars(text && text.trim() ? text : 'Add text'),
      fontSize: fontSize ?? 12,
      fontFamily: fontFamily ?? "'Rubik', sans-serif",
      fontWeight: fontWeight ?? 'normal',
      textAlign: textAlign ?? 'left',
      showConnector: showConnector ?? true,
      connectorLength: connectorLength ?? 30,
    };
  }

  get textOptions(): AnchoredTextOptions {
    return this._textOptions;
  }

  setTextOptions(options: Partial<AnchoredTextOptions>): void {
    this._textOptions = { ...this._textOptions, ...options };
    this.requestUpdate();
  }

  setText(text: string): void {
    this._textOptions.text = wrapTextTo40Chars(text && text.trim() ? text : 'Add text');
    this.requestUpdate();
  }

  getText(): string {
    return this._textOptions.text && this._textOptions.text.trim() ? this._textOptions.text : 'Add text';
  }

  isValid(): boolean {
    return this._anchors.length >= AnchoredText.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new AnchoredTextPaneView(this)];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const textPos = this.anchorToPixel(this._anchors[1], viewport);
    if (!textPos) return [];

    const textGeometry: TextGeometry = {
      type: 'text',
      position: textPos,
      text: this._textOptions.text ?? '',
      font: `${this._textOptions.fontWeight} ${this._textOptions.fontSize}px ${this._textOptions.fontFamily}`,
      color: this._style.labelColor,
      align: this._textOptions.textAlign,
      baseline: 'middle',
    };

    return [textGeometry];
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    // 1. Check if near first anchor point
    const anchorPos = this.anchorToPixel(this._anchors[0], viewport);
    if (anchorPos) {
      const dx = point.x - anchorPos.x;
      const dy = point.y - anchorPos.y;
      if (Math.sqrt(dx * dx + dy * dy) <= AnchoredText.HIT_THRESHOLD + 2) {
        return true;
      }
    }

    // 2. Check if near second anchor point (text position)
    const textPos = this.anchorToPixel(this._anchors[1], viewport);
    if (!textPos) return false;

    const dx2 = point.x - textPos.x;
    const dy2 = point.y - textPos.y;
    if (Math.sqrt(dx2 * dx2 + dy2 * dy2) <= AnchoredText.HIT_THRESHOLD + 2) {
      return true;
    }

    // 3. Check if near text box
    const text = this.getText();
    const lines = text.split('\n');
    const fontSize = this._textOptions.fontSize ?? 12;
    const maxLineLen = Math.max(...lines.map(line => line.length));
    const estimatedTextWidth = maxLineLen * (fontSize * 0.6);
    
    const paddingX = 10;
    const paddingY = 6;
    const boxWidth = Math.max(80, estimatedTextWidth + paddingX * 2);
    const boxHeight = (fontSize * lines.length) + (lines.length - 1) * 4 + paddingY * 2;
    const circleRadius = 5;

    // box sits to the right of the second circle:
    const boxLeft = textPos.x + circleRadius + 4;
    const boxTop = textPos.y - boxHeight / 2;

    return (
      point.x >= boxLeft &&
      point.x <= boxLeft + boxWidth &&
      point.y >= boxTop &&
      point.y <= boxTop + boxHeight
    );
  }

  clone(newId: string): IDrawing {
    return new AnchoredText(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._textOptions }
    );
  }

  static create(
    id: string,
    anchorPoint: Anchor,
    textPoint: Anchor,
    text: string,
    style?: Partial<DrawingStyle>,
    options?: Partial<AnchoredTextOptions>
  ): AnchoredText {
    return new AnchoredText(id, [anchorPoint, textPoint], style, { ...options, text });
  }
}
