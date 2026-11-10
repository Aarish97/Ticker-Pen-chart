import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import type { Geometry } from '../../core/geometry';
import { PriceLabelPaneView } from './price-label-pane-view';
import { formatPrice } from '../../rendering/canvas-utils';

/**
 * Price Label options
 */
export interface PriceLabelOptions extends DrawingOptions {
  fontSize?: number;
  backgroundColor?: string;
  textColor?: string;
  showArrow?: boolean;
  arrowDirection?: 'left' | 'right';
  decimals?: number;
}

/**
 * Price Label - A simple price label with arrow pointer.
 *
 * Features:
 * - Single anchor point
 * - Shows price value in a badge
 * - Arrow pointer to the price level
 * - Extends to the right edge
 */
export class PriceLabel extends Drawing {
  readonly type = 'price-label';

  protected static readonly REQUIRED_ANCHORS = 1;
  protected static readonly HIT_THRESHOLD = 10;

  private _labelOptions: PriceLabelOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<PriceLabelOptions> = {}
  ) {
    const { fontSize, backgroundColor, textColor, showArrow, arrowDirection, decimals, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._labelOptions = {
      ...this._options,
      fontSize: fontSize ?? 11,
      backgroundColor: backgroundColor ?? '#2962FF',
      textColor: textColor ?? '#FFFFFF',
      showArrow: showArrow ?? true,
      arrowDirection: arrowDirection ?? 'left',
      decimals: decimals ?? 2,
    };
  }

  get labelOptions(): PriceLabelOptions {
    return this._labelOptions;
  }

  setLabelOptions(options: Partial<PriceLabelOptions>): void {
    this._labelOptions = { ...this._labelOptions, ...options };
    this.requestUpdate();
  }

  getPrice(): number {
    return this._anchors[0]?.price ?? 0;
  }

  isValid(): boolean {
    return this._anchors.length >= PriceLabel.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new PriceLabelPaneView(this)];
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

    // Check hit on the badge or the tail
    const decimals = this._labelOptions.decimals;
    const text = `$${formatPrice(this._anchors[0].price, decimals)}`;
    const fontSize = this._labelOptions.fontSize ?? 11;
    const estimatedTextWidth = text.length * (fontSize * 0.6);
    
    const paddingX = 12;
    const paddingY = 8;
    const boxWidth = Math.max(70, estimatedTextWidth + paddingX * 2);
    const boxHeight = fontSize + paddingY * 2;

    const tailDx = 22;
    const tailDy = -20;
    const boxLeft = p.x + tailDx;
    const boxTop = p.y + tailDy - boxHeight;

    // Bounding box hit check covering anchor to badge
    return (
      point.x >= p.x - 5 &&
      point.x <= boxLeft + boxWidth &&
      point.y >= boxTop &&
      point.y <= p.y + 5
    );
  }

  clone(newId: string): IDrawing {
    return new PriceLabel(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._labelOptions }
    );
  }

  static create(
    id: string,
    position: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<PriceLabelOptions>
  ): PriceLabel {
    return new PriceLabel(id, [position], style, options);
  }
}
