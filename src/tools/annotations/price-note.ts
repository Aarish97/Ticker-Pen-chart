import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import type { Geometry } from '../../core/geometry';
import { PriceNotePaneView } from './price-note-pane-view';
import { formatPrice } from '../../rendering/canvas-utils';

/**
 * Price Note options
 */
export interface PriceNoteOptions extends DrawingOptions {
  note?: string;
  showPrice?: boolean;
  showTime?: boolean;
  fontSize?: number;
  backgroundColor?: string;
  priceColor?: string;
  noteColor?: string;
}

/**
 * Price Note - Displays price and optional note at a specific point.
 *
 * Features:
 * - Single anchor point
 * - Shows price value
 * - Optional note text
 * - Customizable colors
 */
export class PriceNote extends Drawing {
  readonly type = 'price-note';

  protected static readonly REQUIRED_ANCHORS = 2;
  protected static readonly HIT_THRESHOLD = 10;

  private _noteOptions: PriceNoteOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<PriceNoteOptions> = {}
  ) {
    const { note, showPrice, showTime, fontSize, backgroundColor, priceColor, noteColor, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._noteOptions = {
      ...this._options,
      note: note ?? '',
      showPrice: showPrice ?? true,
      showTime: showTime ?? false,
      fontSize: fontSize ?? 11,
      backgroundColor: backgroundColor ?? 'rgba(30, 34, 45, 0.95)',
      priceColor: priceColor ?? '#26a69a',
      noteColor: noteColor ?? '#d1d4dc',
    };
  }

  get noteOptions(): PriceNoteOptions {
    return this._noteOptions;
  }

  setNoteOptions(options: Partial<PriceNoteOptions>): void {
    this._noteOptions = { ...this._noteOptions, ...options };
    this.requestUpdate();
  }

  setNote(note: string): void {
    this._noteOptions.note = note;
    this.requestUpdate();
  }

  getNote(): string {
    return this._noteOptions.note ?? '';
  }

  setText(text: string): void {
    this.setNote(text);
  }

  getText(): string {
    return this.getNote();
  }

  getPrice(): number {
    return this._anchors[0]?.price ?? 0;
  }

  isValid(): boolean {
    return this._anchors.length >= PriceNote.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new PriceNotePaneView(this)];
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

    // 1. Check start anchor point (hollow circle)
    const p0 = this.anchorToPixel(this._anchors[0], viewport);
    if (p0) {
      const dx = point.x - p0.x;
      const dy = point.y - p0.y;
      if (Math.sqrt(dx * dx + dy * dy) <= PriceNote.HIT_THRESHOLD) {
        return true;
      }
    }

    // 2. Check end anchor point (solid black circle)
    const p1 = this.anchorToPixel(this._anchors[1], viewport);
    if (!p1) return false;

    const dx2 = point.x - p1.x;
    const dy2 = point.y - p1.y;
    if (Math.sqrt(dx2 * dx2 + dy2 * dy2) <= PriceNote.HIT_THRESHOLD) {
      return true;
    }

    // 3. Check badge rectangle hit
    const options = this._noteOptions;
    const text = options.note || `$${formatPrice(this._anchors[0].price)}`;
    const fontSize = options.fontSize ?? 11;
    const estimatedTextWidth = text.length * (fontSize * 0.6);
    
    const paddingX = 10;
    const paddingY = 6;
    const boxWidth = Math.max(80, estimatedTextWidth + paddingX * 2);
    const boxHeight = fontSize + paddingY * 2;
    const endRadius = 4;

    const boxLeft = p1.x + endRadius - 2;
    const boxTop = p1.y - boxHeight / 2;

    return (
      point.x >= boxLeft &&
      point.x <= boxLeft + boxWidth &&
      point.y >= boxTop &&
      point.y <= boxTop + boxHeight
    );
  }

  clone(newId: string): IDrawing {
    return new PriceNote(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._noteOptions }
    );
  }

  static create(
    id: string,
    position: Anchor,
    note?: string,
    style?: Partial<DrawingStyle>,
    options?: Partial<PriceNoteOptions>
  ): PriceNote {
    return new PriceNote(id, [position], style, { ...options, note });
  }
}
