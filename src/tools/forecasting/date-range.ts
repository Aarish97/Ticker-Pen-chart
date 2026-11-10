import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import type { Geometry, RectangleGeometry, LineGeometry } from '../../core/geometry';
import { DateRangePaneView } from './date-range-pane-view';

/**
 * DateRange options
 */
export interface DateRangeOptions extends DrawingOptions {
  showBars?: boolean;
  showDays?: boolean;
  showDates?: boolean;
  filled?: boolean;
}

/**
 * DateRange - Time measurement tool.
 *
 * Features:
 * - Two anchor points for start and end time
 * - Shows number of bars between points
 * - Shows number of calendar days
 * - Highlighted time zone
 */
export class DateRange extends Drawing {
  readonly type = 'date-range';

  protected static readonly REQUIRED_ANCHORS = 2;
  protected static readonly HIT_THRESHOLD = 5;

  private _dateRangeOptions: DateRangeOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<DateRangeOptions> = {}
  ) {
    const { showBars, showDays, showDates, filled, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._dateRangeOptions = {
      ...this._options,
      showBars: showBars ?? true,
      showDays: showDays ?? true,
      showDates: showDates ?? true,
      filled: filled ?? true,
    };
  }

  get dateRangeOptions(): DateRangeOptions {
    return this._dateRangeOptions;
  }

  setDateRangeOptions(options: Partial<DateRangeOptions>): void {
    this._dateRangeOptions = { ...this._dateRangeOptions, ...options };
    this.requestUpdate();
  }

  isValid(): boolean {
    return this._anchors.length >= DateRange.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new DateRangePaneView(this)];
  }

  /**
   * Get date range info
   */
  getDateRangeInfo(): {
    startTime: any;
    endTime: any;
    days: number;
    bars: number;
  } {
    if (!this.isValid()) {
      return { startTime: null, endTime: null, days: 0, bars: 0 };
    }

    const startTime = this._anchors[0].time;
    const endTime = this._anchors[1].time;

    // Calculate elapsed calendar days from the actual timestamps.
    let days = 0;
    if (typeof startTime === 'string' && typeof endTime === 'string') {
      const start = new Date(startTime);
      const end = new Date(endTime);
      days = Math.abs((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    } else if (typeof startTime === 'number' && typeof endTime === 'number') {
      // Ticker Pen timestamps are milliseconds; Lightweight Charts may use
      // seconds. Support both formats for the same drawing tool.
      const divisor = Math.max(Math.abs(startTime), Math.abs(endTime)) > 1e11
        ? 1000 * 60 * 60 * 24
        : 60 * 60 * 24;
      days = Math.abs((endTime - startTime) / divisor);
    }

    const startIndex = (this._anchors[0] as Anchor & { dataIndex?: number }).dataIndex;
    const endIndex = (this._anchors[1] as Anchor & { dataIndex?: number }).dataIndex;
    let bars = 0;
    if (startIndex !== undefined && endIndex !== undefined && Number.isFinite(startIndex) && Number.isFinite(endIndex)) {
      bars = Math.abs(Math.round(endIndex) - Math.round(startIndex)) + 1;
    } else {
      try {
        const chart = (globalThis as any).__active_chart_instance__ || (typeof window !== 'undefined' && (window as any).__active_chart_instance__);
        if (chart && typeof chart.getDataList === 'function') {
          const dataList = chart.getDataList() || [];
          const t0 = Number(startTime);
          const t1 = Number(endTime);
          const i0 = dataList.findIndex((d: any) => d && Number(d.timestamp) === t0);
          const i1 = dataList.findIndex((d: any) => d && Number(d.timestamp) === t1);
          if (i0 !== -1 && i1 !== -1) {
            bars = Math.abs(i1 - i0) + 1;
          }
        }
      } catch (e) {}
    }

    return { startTime, endTime, days, bars };
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);

    if (!p1 || !p2) return [];

    const geometries: Geometry[] = [];

    const left = Math.min(p1.x, p2.x);
    const width = Math.abs(p2.x - p1.x);

    // Full height rectangle
    geometries.push({
      type: 'rectangle',
      topLeft: { x: left, y: 0 },
      width,
      height: viewport.height,
    } as RectangleGeometry);

    // Vertical lines at start and end
    geometries.push({
      type: 'line',
      start: { x: p1.x, y: 0 },
      end: { x: p1.x, y: viewport.height },
    } as LineGeometry);

    geometries.push({
      type: 'line',
      start: { x: p2.x, y: 0 },
      end: { x: p2.x, y: viewport.height },
    } as LineGeometry);

    return geometries;
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const p1 = this.anchorToPixel(this._anchors[0], viewport);
    const p2 = this.anchorToPixel(this._anchors[1], viewport);

    if (!p1 || !p2) return false;

    const left = Math.min(p1.x, p2.x);
    const right = Math.max(p1.x, p2.x);
    let top = Math.min(p1.y, p2.y);
    let bottom = Math.max(p1.y, p2.y);
    if (bottom - top < 20) {
      const midY = (p1.y + p2.y) / 2;
      top = midY - 60;
      bottom = midY + 60;
    }

    // Check if cursor point is within the drawn shaded band (with 6px tolerance)
    const inRect = point.x >= left - 6 && point.x <= right + 6 && point.y >= top - 6 && point.y <= bottom + 6;
    if (inRect) return true;

    // Also check if cursor is on the info card
    const cardHeight = 28;
    const cardY = top - cardHeight - 8 < 10 ? bottom + 8 : top - cardHeight - 8;
    const centerX = (left + right) / 2;
    const inCard = point.x >= centerX - 90 && point.x <= centerX + 90 && point.y >= cardY - 4 && point.y <= cardY + cardHeight + 4;
    return inCard;
  }

  clone(newId: string): IDrawing {
    return new DateRange(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._dateRangeOptions }
    );
  }

  static create(
    id: string,
    start: Anchor,
    end: Anchor,
    style?: Partial<DrawingStyle>,
    options?: Partial<DateRangeOptions>
  ): DateRange {
    return new DateRange(id, [start, end], style, options);
  }
}
