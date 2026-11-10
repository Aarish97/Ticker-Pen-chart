import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import type { Geometry } from '../../core/geometry';
import { SignpostPaneView } from './signpost-pane-view';

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
 * Signpost options
 */
export interface SignpostOptions extends DrawingOptions {
  text?: string;
  fontSize?: number;
  backgroundColor?: string;
  textColor?: string;
  direction?: 'left' | 'right';
  upsideDown?: boolean;
  extraPoleHeight?: number;
}

/**
 * Signpost - A directional signpost marker.
 *
 * Features:
 * - Single anchor point
 * - Directional arrow-shaped sign (left/right)
 * - Text label on the sign
 */
export class Signpost extends Drawing {
  readonly type = 'signpost';

  protected static readonly REQUIRED_ANCHORS = 1;
  protected static readonly HIT_THRESHOLD = 15;

  private _signpostOptions: SignpostOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<SignpostOptions> = {}
  ) {
    const { text, fontSize, backgroundColor, textColor, direction, upsideDown, extraPoleHeight, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._signpostOptions = {
      ...this._options,
      text: wrapTextTo40Chars(text && text.trim() ? text : 'Add text'),
      fontSize: fontSize ?? 11,
      backgroundColor: backgroundColor ?? '#FF9800',
      textColor: textColor ?? '#000000',
      direction: direction ?? 'right',
      upsideDown: upsideDown ?? false,
      extraPoleHeight: extraPoleHeight ?? 0,
    };
  }

  get signpostOptions(): SignpostOptions {
    return this._signpostOptions;
  }

  setSignpostOptions(options: Partial<SignpostOptions>): void {
    this._signpostOptions = { ...this._signpostOptions, ...options };
    this.requestUpdate();
  }

  setText(text: string): void {
    this._signpostOptions.text = wrapTextTo40Chars(text && text.trim() ? text : 'Add text');
    this.requestUpdate();
  }

  getText(): string {
    return this._signpostOptions.text && this._signpostOptions.text.trim() ? this._signpostOptions.text : 'Add text';
  }

  isValid(): boolean {
    return this._anchors.length >= Signpost.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new SignpostPaneView(this)];
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

    const text = this._signpostOptions.text ?? '';
    const fontSize = this._signpostOptions.fontSize ?? 11;
    const paddingX = 12;
    const paddingY = 6;
    const poleHeight = 40;

    const lines = text.split('\n');
    const maxLineLen = Math.max(...lines.map(line => line.length));
    const estimatedTextWidth = maxLineLen * (fontSize * 0.6);
    const boardWidth = Math.max(36, estimatedTextWidth + paddingX * 2);
    const boardHeight = (fontSize * lines.length) + (lines.length - 1) * 4 + paddingY * 2;

    const baseBoardHeight = fontSize + paddingY * 2;
    const scaleTop = baseBoardHeight / 13.17;
    const upsideDown = this._signpostOptions.upsideDown ?? false;

    const extraPoleHeight = this._signpostOptions.extraPoleHeight ?? 0;
    const actualPoleHeight = poleHeight + extraPoleHeight;
    let ringCenterY: number;
    let boardTopY: number;
    let boardBottomY: number;
    let poleTopY: number;
    let poleBottomY: number;

    if (!upsideDown) {
      ringCenterY = p.y;
      boardTopY = p.y + 8.886 * scaleTop;
      boardBottomY = boardTopY + boardHeight;
      poleTopY = boardBottomY;
      poleBottomY = boardBottomY + actualPoleHeight;
    } else {
      ringCenterY = p.y;
      boardBottomY = p.y - 8.886 * scaleTop;
      boardTopY = boardBottomY - boardHeight;
      poleBottomY = boardTopY;
      poleTopY = boardTopY - actualPoleHeight;
    }

    // 1. Check top ring (burgundy ring)
    const ringRadius = 3.31 * scaleTop;
    const dx = point.x - p.x;
    const dy = point.y - ringCenterY;
    if (dx * dx + dy * dy <= ringRadius * ringRadius) {
      return true;
    }

    // 2. Check pole and hanger (with a 6px horizontal buffer)
    if (Math.abs(point.x - p.x) <= 6) {
      if (!upsideDown) {
        if (point.y >= p.y && point.y <= poleBottomY) {
          return true;
        }
      } else {
        if (point.y >= poleTopY && point.y <= p.y) {
          return true;
        }
      }
    }

    // 3. Check board
    if (point.y >= boardTopY && point.y <= boardBottomY && Math.abs(point.x - p.x) <= boardWidth / 2) {
      return true;
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new Signpost(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._signpostOptions }
    );
  }

  static create(
    id: string,
    position: Anchor,
    text: string,
    style?: Partial<DrawingStyle>,
    options?: Partial<SignpostOptions>
  ): Signpost {
    return new Signpost(id, [position], style, { ...options, text });
  }
}
