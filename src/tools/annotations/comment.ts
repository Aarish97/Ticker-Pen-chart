import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import type { Geometry } from '../../core/geometry';
import { CommentPaneView } from './comment-pane-view';

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
 * Comment options
 */
export interface CommentOptions extends DrawingOptions {
  text?: string;
  fontSize?: number;
  backgroundColor?: string;
  textColor?: string;
}

/**
 * Comment - A speech-bubble style comment marker.
 *
 * Features:
 * - Single anchor point
 * - Speech bubble with text (from comment box.svg design)
 * - Customizable colors
 */
export class Comment extends Drawing {
  readonly type = 'comment';

  protected static readonly REQUIRED_ANCHORS = 1;
  protected static readonly HIT_THRESHOLD = 15;

  private _commentOptions: CommentOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<CommentOptions> = {}
  ) {
    const { text, fontSize, backgroundColor, textColor, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._commentOptions = {
      ...this._options,
      text: wrapTextTo40Chars(text && text.trim() ? text : 'Add text'),
      fontSize: fontSize ?? 11,
      backgroundColor: backgroundColor ?? '#234E9C',
      textColor: textColor ?? '#FFFFFF',
    };
  }

  get commentOptions(): CommentOptions {
    return this._commentOptions;
  }

  setCommentOptions(options: Partial<CommentOptions>): void {
    this._commentOptions = { ...this._commentOptions, ...options };
    this.requestUpdate();
  }

  setText(text: string): void {
    this._commentOptions.text = wrapTextTo40Chars(text && text.trim() ? text : 'Add text');
    this.requestUpdate();
  }

  getText(): string {
    return this._commentOptions.text && this._commentOptions.text.trim() ? this._commentOptions.text : 'Add text';
  }

  isValid(): boolean {
    return this._anchors.length >= Comment.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new CommentPaneView(this)];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p = this.anchorToPixel(this._anchors[0], viewport);
    if (!p) return [];

    return [{
      type: 'polygon',
      points: [p],
      closed: false,
    }];
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const p = this.anchorToPixel(this._anchors[0], viewport);
    if (!p) return false;

    const text = this._commentOptions.text ?? 'Add text';
    const fontSize = this._commentOptions.fontSize ?? 11;
    const lines = text.split('\n');
    const maxLineLen = Math.max(...lines.map(line => line.length));
    const estimatedTextWidth = maxLineLen * (fontSize * 0.6);
    const paddingX = 14;
    const paddingY = 8;
    const boxWidth = Math.max(80, estimatedTextWidth + paddingX * 2);
    const boxHeight = (fontSize * lines.length) + (lines.length - 1) * 4 + paddingY * 2;
    const tailHeight = 8;

    // Box sits above the anchor point (tail points down-left to anchor)
    const boxX = p.x;
    const boxY = p.y - tailHeight - boxHeight;

    return (
      point.x >= boxX &&
      point.x <= boxX + boxWidth &&
      point.y >= boxY &&
      point.y <= p.y
    );
  }

  clone(newId: string): IDrawing {
    return new Comment(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._commentOptions }
    );
  }

  static create(
    id: string,
    position: Anchor,
    text: string,
    style?: Partial<DrawingStyle>,
    options?: Partial<CommentOptions>
  ): Comment {
    return new Comment(id, [position], style, { ...options, text });
  }
}
