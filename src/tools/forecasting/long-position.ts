import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing, ControlPoint } from '../../core/types';
import type { Geometry, RectangleGeometry } from '../../core/geometry';
import { LongPositionPaneView } from './long-position-pane-view';

/**
 * LongPosition options
 */
export interface LongPositionOptions extends DrawingOptions {
  showPrices?: boolean;
  showPercentage?: boolean;
  showRiskReward?: boolean;
  showPnL?: boolean;
  quantity?: number;
  accountSize?: number;
  riskPercent?: number;
  sizeMode?: 'risk' | 'quantity';
  profitColor?: string;
  lossColor?: string;

  // Advanced Inputs
  accountSizeCurrency?: string;
  lotSize?: number;
  riskType?: 'percent' | 'absolute';
  risk?: number;
  entryPrice?: number;
  leverage?: number;
  profitTicks?: number;
  profitPrice?: number;
  stopTicks?: number;
  stopPrice?: number;
  qtyPrecision?: string;

  // Advanced Styles & Stats
  linesColor?: string;
  stopColor?: string;
  targetColor?: string;
  textColor?: string;
  textSize?: number;
  showPriceLabels?: boolean;
  compactStats?: boolean;
  alwaysShowStats?: boolean;
  showTpPriceOffset?: boolean;
  showTpPercentOffset?: boolean;
  showTpTickOffset?: boolean;
  showTpAmount?: boolean;
  showTpPL?: boolean;
  showOpenClosedPL?: boolean;
  showQty?: boolean;
  showSlPriceOffset?: boolean;
  showSlPercentOffset?: boolean;
  showSlTickOffset?: boolean;
  showSlAmount?: boolean;
  showSlPL?: boolean;
}

/**
 * LongPosition - Trade visualization for long positions.
 */
export class LongPosition extends Drawing {
  readonly type = 'long-position';
  public isDragging = false;

  protected static readonly REQUIRED_ANCHORS = 4;
  protected static readonly HIT_THRESHOLD = 5;

  private _positionOptions: LongPositionOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<LongPositionOptions> = {}
  ) {
    const {
      showPrices, showPercentage, showRiskReward, showPnL, quantity, accountSize, riskPercent, sizeMode, profitColor, lossColor,
      accountSizeCurrency, lotSize, riskType, risk, entryPrice, leverage, profitTicks, profitPrice, stopTicks, stopPrice, qtyPrecision,
      linesColor, stopColor, targetColor, textColor, textSize, showPriceLabels, compactStats, alwaysShowStats,
      showTpPriceOffset, showTpPercentOffset, showTpTickOffset, showTpAmount, showTpPL, showOpenClosedPL, showQty,
      showSlPriceOffset, showSlPercentOffset, showSlTickOffset, showSlAmount, showSlPL,
      ...baseOptions
    } = options;
    super(id, anchors, style, baseOptions);

    this._positionOptions = {
      ...this._options,
      showPrices: showPrices ?? true,
      showPercentage: showPercentage ?? true,
      showRiskReward: showRiskReward ?? true,
      showPnL: showPnL ?? true,
      quantity: quantity ?? 1,
      accountSize: accountSize ?? 10000,
      riskPercent: riskPercent ?? 1,
      sizeMode: sizeMode ?? 'risk',
      profitColor,
      lossColor,

      // Advanced Inputs mapping
      accountSizeCurrency: accountSizeCurrency ?? 'Default',
      lotSize: lotSize ?? 1,
      riskType: riskType ?? 'percent',
      risk: risk ?? 10.00,
      entryPrice: entryPrice ?? 0,
      leverage: leverage ?? 1,
      profitTicks: profitTicks ?? 0,
      profitPrice: profitPrice ?? 0,
      stopTicks: stopTicks ?? 0,
      stopPrice: stopPrice ?? 0,
      qtyPrecision: qtyPrecision ?? 'Default',

      // Advanced Styles mapping
      linesColor: linesColor ?? 'rgba(255, 255, 255, 0.4)',
      stopColor: stopColor ?? 'rgba(239, 83, 80, 0.2)',
      targetColor: targetColor ?? 'rgba(38, 166, 154, 0.2)',
      textColor: textColor ?? '#ffffff',
      textSize: textSize ?? 11,
      showPriceLabels: showPriceLabels ?? true,
      compactStats: compactStats ?? false,
      alwaysShowStats: alwaysShowStats ?? false,
      showTpPriceOffset: showTpPriceOffset ?? true,
      showTpPercentOffset: showTpPercentOffset ?? true,
      showTpTickOffset: showTpTickOffset ?? true,
      showTpAmount: showTpAmount ?? true,
      showTpPL: showTpPL ?? true,
      showOpenClosedPL: showOpenClosedPL ?? true,
      showQty: showQty ?? true,
      showSlPriceOffset: showSlPriceOffset ?? true,
      showSlPercentOffset: showSlPercentOffset ?? true,
      showSlTickOffset: showSlTickOffset ?? true,
      showSlAmount: showSlAmount ?? true,
      showSlPL: showSlPL ?? true,
    };
  }

  get positionOptions(): LongPositionOptions {
    return this._positionOptions;
  }

  setPositionOptions(options: Partial<LongPositionOptions>): void {
    this._positionOptions = { ...this._positionOptions, ...options };
    this.requestUpdate();
  }

  override setAnchors(anchors: Anchor[]): void {
    if (anchors.length >= 3) {
      const leftTime = anchors[1]?.time ?? anchors[0].time;
      anchors[0].time = leftTime;
      anchors[1].time = leftTime;
      anchors[2].time = leftTime;
    }
    super.setAnchors(anchors);
  }

  override updateAnchor(index: number, anchor: Anchor): void {
    if (index === 1 || index === 2) {
      const lockedTime = this._anchors[0]?.time ?? anchor.time;
      super.updateAnchor(index, { time: lockedTime, price: anchor.price });
    } else if (index === 0) {
      super.updateAnchor(0, anchor);
      if (this._anchors[1]) this._anchors[1].time = anchor.time;
      if (this._anchors[2]) this._anchors[2].time = anchor.time;
    } else {
      super.updateAnchor(index, anchor);
    }
  }

  override getControlPoints(viewport: Viewport): ControlPoint[] {
    const points: ControlPoint[] = [];
    for (let i = 0; i < this._anchors.length; i++) {
      const anchor = this._anchors[i];
      const pixel = this.anchorToPixel(anchor, viewport);
      if (pixel) {
        points.push({
          index: i,
          x: pixel.x,
          y: pixel.y,
          radius: (i === 0) ? 6 : 5,
          shape: (i === 0) ? 'circle' : 'rect',
        });
      }
    }
    return points;
  }

  override isValid(): boolean {
    return this._anchors.length >= LongPosition.REQUIRED_ANCHORS;
  }

  override paneViews(): IPrimitivePaneView[] {
    return [new LongPositionPaneView(this)];
  }

  /**
   * Get position info
   * Anchors: [0] = Entry Left, [1] = Stop Loss Left, [2] = Take Profit Left, [3] = Entry Right
   */
  getPositionInfo(): {
    entry: number;
    stopLoss: number;
    takeProfit: number;
    risk: number;
    reward: number;
    riskRewardRatio: number;
    riskPercent: number;
    rewardPercent: number;
  } {
    if (!this.isValid()) {
      return {
        entry: 0,
        stopLoss: 0,
        takeProfit: 0,
        risk: 0,
        reward: 0,
        riskRewardRatio: 0,
        riskPercent: 0,
        rewardPercent: 0,
      };
    }

    const entry = this._anchors[0].price;
    const stopLoss = this._anchors[1].price;
    const takeProfit = this._anchors[2].price;

    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(takeProfit - entry);
    const riskRewardRatio = risk !== 0 ? reward / risk : 0;
    const riskPercent = entry !== 0 ? (risk / entry) * 100 : 0;
    const rewardPercent = entry !== 0 ? (reward / entry) * 100 : 0;

    return {
      entry,
      stopLoss,
      takeProfit,
      risk,
      reward,
      riskRewardRatio,
      riskPercent,
      rewardPercent,
    };
  }

  override computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p1 = this.anchorToPixel(this._anchors[0], viewport); // Entry Left
    const p2 = this.anchorToPixel(this._anchors[1], viewport); // Stop loss Left
    const p3 = this.anchorToPixel(this._anchors[2], viewport); // Take profit Left
    const p4 = this.anchorToPixel(this._anchors[3], viewport); // Entry Right (width)

    if (!p1 || !p2 || !p3 || !p4) return [];

    const geometries: Geometry[] = [];
    const left = p1.x;
    const right = p4.x;
    const width = Math.max(1, right - left);

    // Risk zone (entry to stop loss)
    const riskTop = Math.min(p1.y, p2.y);
    const riskHeight = Math.abs(p2.y - p1.y);
    geometries.push({
      type: 'rectangle',
      topLeft: { x: left, y: riskTop },
      width,
      height: riskHeight,
    } as RectangleGeometry);

    // Reward zone (entry to take profit)
    const rewardTop = Math.min(p1.y, p3.y);
    const rewardHeight = Math.abs(p3.y - p1.y);
    geometries.push({
      type: 'rectangle',
      topLeft: { x: left, y: rewardTop },
      width,
      height: rewardHeight,
    } as RectangleGeometry);

    return geometries;
  }

  override testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);
    const p3 = this.anchorToPixel(this._anchors[2], viewport);
    const p4 = this.anchorToPixel(this._anchors[3], viewport);

    if (!p1 || !p2 || !p3 || !p4) return false;

    const left = p1.x;
    const right = p4.x;
    const top = Math.min(p1.y, p2.y, p3.y);
    const bottom = Math.max(p1.y, p2.y, p3.y);

    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  }

  override clone(newId: string): IDrawing {
    return new LongPosition(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._positionOptions }
    );
  }

  static create(
    id: string,
    entry: Anchor,
    stopLoss: Anchor,
    takeProfit: Anchor,
    entryRight?: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<LongPositionOptions>
  ): LongPosition {
    const anchors = [entry, stopLoss, takeProfit];
    if (entryRight) {
      anchors.push(entryRight);
    } else {
      let rightTime = entry.time;
      if (typeof rightTime === 'number') {
        rightTime = (rightTime + 2 * 24 * 60 * 60 * 1000) as any;
      }
      anchors.push({
        time: rightTime,
        price: entry.price,
      });
    }
    return new LongPosition(id, anchors, style, options);
  }
}
