import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import type { Geometry } from '../../core/geometry';
import { PinPaneView } from './pin-pane-view';

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
 * Pin options
 */
export interface PinOptions extends DrawingOptions {
  color?: string;
  size?: number;
  label?: string;
}

/**
 * Pin - A simple pin/map marker annotation.
 *
 * Features:
 * - Single anchor point
 * - Teardrop/pin shape
 * - Optional short label
 */
export class Pin extends Drawing {
  readonly type = 'pin';

  protected static readonly REQUIRED_ANCHORS = 1;
  protected static readonly HIT_THRESHOLD = 15;

  private _pinOptions: PinOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<PinOptions> = {}
  ) {
    const { color, size, label, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._pinOptions = {
      ...this._options,
      color: color ?? '#0488DB',
      size: size ?? 30,
      label: wrapTextTo40Chars(label && label.trim() ? label : 'Add text'),
    };
  }

  get pinOptions(): PinOptions {
    return this._pinOptions;
  }

  setPinOptions(options: Partial<PinOptions>): void {
    this._pinOptions = { ...this._pinOptions, ...options };
    this.requestUpdate();
  }

  setLabel(label: string): void {
    this._pinOptions.label = wrapTextTo40Chars(label && label.trim() ? label : 'Add text');
    this.requestUpdate();
  }

  getLabel(): string {
    return this._pinOptions.label && this._pinOptions.label.trim() ? this._pinOptions.label : 'Add text';
  }

  isValid(): boolean {
    return this._anchors.length >= Pin.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new PinPaneView(this)];
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

    const size = this._pinOptions.size ?? 30;

    // 1. Check if hit is within the pin body itself
    const hitPin = (
      point.x >= p.x - size / 2 - 2 &&
      point.x <= p.x + size / 2 + 2 &&
      point.y >= p.y - size - 2 &&
      point.y <= p.y + 2
    );
    if (hitPin) return true;

    // 2. Check if hit is within the tooltip panel above the pin ONLY when visible
    if (this.state === 'hovered' || this.state === 'selected' || this.state === 'editing') {
      const text = this._pinOptions.label ?? '';
      const lines = text.split('\n');
      const fontSize = 11;
      const maxLineLen = Math.max(...lines.map(line => line.length));
      const estimatedTextWidth = maxLineLen * (fontSize * 0.6);
      const panelWidth = Math.max(80, estimatedTextWidth + 28);
      const panelHeight = (fontSize * lines.length) + (lines.length - 1) * 4 + 16;
      const panelY = p.y - size - 8 - panelHeight;

      const hitTooltip = (
        point.x >= p.x - panelWidth / 2 &&
        point.x <= p.x + panelWidth / 2 &&
        point.y >= panelY &&
        point.y <= p.y - size
      );
      if (hitTooltip) return true;
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new Pin(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._pinOptions }
    );
  }

  static create(
    id: string,
    position: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<PinOptions>
  ): Pin {
    return new Pin(id, [position], style, options);
  }
}
