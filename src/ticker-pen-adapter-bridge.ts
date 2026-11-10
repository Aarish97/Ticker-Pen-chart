import { registerFigure, type OverlayTemplate, type OverlayCreateFiguresCallbackParams } from 'tickerpen';
import { TOOL_DEFINITIONS } from './registry/tool-registry';
import { setGlobalActiveDragAnchor, getGlobalActiveDragAnchor, setGlobalDrawingPlacedCount } from './rendering/canvas-utils';
import { timestampToDataIndex } from './utils/drawingIndexedDB';

const positionDragSnapshots = new Map<string, any[]>();
const positionDragStartMouse = new Map<string, { x: number; y: number }>();
const regressionEndpoints = new Map<string, { baseFirst: any; baseSecond: any }>();
const regressionDragIndices = new Map<string, number>();
const regressionMoveSnapshots = new Map<string, any[]>();
const regressionEditingStates = new Map<string, boolean>();

/**
 * Convert a dataIndex to pixel X, supporting future indices beyond the last candle.
 * KLineCharts' xAxis.convertToPixel clamps to the last candle, so for indices
 * past the data list we extrapolate using barSpace.
 */
export function dataIndexToPixelX(dataIndex: number, xAxis: any): number {
  try {
    const charts = Array.from((window as any).globalCoreCharts || []);
    const chart = ((window as any).__active_chart_instance__ || charts[0]) as any;
    const chartStore = chart?._chartStore || chart?.chartStore;
    if (chartStore && typeof chartStore.dataIndexToCoordinate === 'function') {
      const coordX = chartStore.dataIndexToCoordinate(dataIndex);
      if (typeof coordX === 'number' && !isNaN(coordX)) {
        return coordX;
      }
    }
  } catch (e) {}

  const nativeX = xAxis?.convertToPixel?.(dataIndex);
  try {
    const charts = Array.from((window as any).globalCoreCharts || []);
    const chart = ((window as any).__active_chart_instance__ || charts[0]) as any;
    if (!chart) return nativeX;
    
    const dataList = typeof chart.getDataList === 'function' ? chart.getDataList() : [];
    if (dataList.length === 0) return nativeX;
    
    const lastIndex = dataList.length - 1;
    if (dataIndex <= lastIndex) return nativeX;
    
    const chartStore = chart._chartStore || chart.chartStore;
    const timeScaleStore = chartStore?.getTimeScaleStore?.() || chartStore?._timeScaleStore || chartStore?.timeScaleStore;
    const rawBarSpace = typeof chart.getBarSpace === 'function' ? chart.getBarSpace() : null;
    const barSpace = typeof rawBarSpace === 'object' && rawBarSpace !== null
      ? (rawBarSpace as any).bar
      : (typeof rawBarSpace === 'number' ? rawBarSpace : (timeScaleStore?.getBarSpace?.()?.bar || 6));
    
    const lastCandleX = xAxis?.convertToPixel?.(lastIndex);
    if (typeof lastCandleX === 'number' && !isNaN(lastCandleX) && barSpace > 0) {
      return lastCandleX + (dataIndex - lastIndex) * barSpace;
    }
  } catch (e) {}
  
  return nativeX;
}

export function pixelXToDataIndexAndTimestamp(pixelX: number, xAxis: any): { dataIndex: number; timestamp: number } {
  try {
    const charts = Array.from((window as any).globalCoreCharts || []);
    const chart = ((window as any).__active_chart_instance__ || charts[0]) as any;
    const chartStore = chart?._chartStore || chart?.chartStore;
    const dataList = chart && typeof chart.getDataList === 'function' ? chart.getDataList() : [];

    if (chartStore && typeof chartStore.coordinateToFloatIndex === 'function') {
      const floatIndex = chartStore.coordinateToFloatIndex(pixelX);
      if (typeof floatIndex === 'number' && !isNaN(floatIndex)) {
        let timestamp: number | undefined;
        if (typeof chartStore.floatIndexToTimestamp === 'function') {
          timestamp = chartStore.floatIndexToTimestamp(floatIndex);
        } else if (typeof chartStore.dataIndexToTimestamp === 'function') {
          timestamp = chartStore.dataIndexToTimestamp(Math.round(floatIndex));
        }
        if (!timestamp && dataList.length >= 2) {
          const lastIdx = dataList.length - 1;
          const lastTime = Number(dataList[lastIdx].timestamp);
          const secondLastTime = Number(dataList[lastIdx - 1].timestamp);
          const step = lastTime - secondLastTime;
          timestamp = Math.round(lastTime + (floatIndex - lastIdx) * step);
        }
        return {
          dataIndex: floatIndex,
          timestamp: timestamp || (dataList[dataList.length - 1]?.timestamp ?? 0)
        };
      }
    }
  } catch (e) {}

  const rawIdx = Number(xAxis?.convertFromPixel?.(pixelX) ?? 0);
  return { dataIndex: rawIdx, timestamp: 0 };
}

export function applyMagnetSnap(
  pixelX: number,
  pixelY: number,
  xAxis: any,
  yAxis: any,
  chart?: any
): { dataIndex: number; timestamp: number; value: number; snappedX?: number; snappedY?: number } {
  const magnetMode = (typeof window !== 'undefined' && (window as any).__magnet_mode__) || 'normal';

  const rawXInfo = pixelXToDataIndexAndTimestamp(pixelX, xAxis);
  const rawPrice = Number(yAxis?.convertFromPixel?.(pixelY) ?? 0);

  if (magnetMode === 'normal' || !xAxis || !yAxis) {
    return {
      dataIndex: rawXInfo.dataIndex,
      timestamp: rawXInfo.timestamp,
      value: rawPrice,
      snappedX: pixelX,
      snappedY: pixelY
    };
  }

  try {
    const charts = Array.from((window as any).globalCoreCharts || []);
    const activeChart = chart || ((window as any).__active_chart_instance__ || charts[0]) as any;
    const dataList = activeChart && typeof activeChart.getDataList === 'function' ? activeChart.getDataList() : [];

    if (!dataList || dataList.length === 0) {
      return {
        dataIndex: rawXInfo.dataIndex,
        timestamp: rawXInfo.timestamp,
        value: rawPrice,
        snappedX: pixelX,
        snappedY: pixelY
      };
    }

    // 1. Target candle closest to the mouse cursor X
    const candleIndex = Math.max(0, Math.min(dataList.length - 1, Math.round(rawXInfo.dataIndex)));
    const candle = dataList[candleIndex];
    if (!candle) {
      return {
        dataIndex: rawXInfo.dataIndex,
        timestamp: rawXInfo.timestamp,
        value: rawPrice,
        snappedX: pixelX,
        snappedY: pixelY
      };
    }

    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);

    // 2. Define OHLC target vertices with TradingView-style wick preference weighting
    const targets = [
      { type: 'high', price: high, weight: 1.25 }, // High wick peak has 1.25x magnetic pull
      { type: 'low', price: low, weight: 1.25 },   // Low wick trough has 1.25x magnetic pull
      { type: 'open', price: open, weight: 1.0 },
      { type: 'close', price: close, weight: 1.0 }
    ].filter(item => Number.isFinite(item.price));

    if (targets.length === 0) {
      return {
        dataIndex: rawXInfo.dataIndex,
        timestamp: rawXInfo.timestamp,
        value: rawPrice,
        snappedX: pixelX,
        snappedY: pixelY
      };
    }

    // 3. Exact candle centerline pixel X (aligns with vertical crosshair line)
    const candlePixelX = dataIndexToPixelX(candleIndex, xAxis);
    const candleTimestamp = Number(candle.timestamp) || rawXInfo.timestamp;

    // 4. Find closest vertex using weighted Euclidean 2D distance
    let bestTarget = targets[0];
    let bestTargetPixelY = Number(yAxis.convertToPixel(targets[0].price));
    let minWeightedDist = Number.POSITIVE_INFINITY;
    let actualPixelDist = Number.POSITIVE_INFINITY;

    for (const item of targets) {
      const ohlcPixelY = Number(yAxis.convertToPixel(item.price));
      if (Number.isFinite(ohlcPixelY)) {
        const dx = pixelX - candlePixelX;
        const dy = pixelY - ohlcPixelY;
        const rawDist = Math.hypot(dx, dy);
        const weightedDist = rawDist / item.weight;

        if (weightedDist < minWeightedDist) {
          minWeightedDist = weightedDist;
          actualPixelDist = rawDist;
          bestTarget = item;
          bestTargetPixelY = ohlcPixelY;
        }
      }
    }

    if (magnetMode === 'strong_magnet') {
      // Strong Magnet: Unconditionally snap to candle centerline + nearest OHLC vertex
      return {
        dataIndex: candleIndex,
        timestamp: candleTimestamp,
        value: bestTarget.price,
        snappedX: candlePixelX,
        snappedY: bestTargetPixelY
      };
    } else if (magnetMode === 'weak_magnet') {
      // Weak Magnet: 2D radial magnetic pull radius (28px)
      const SNAP_RADIUS = 28;

      if (actualPixelDist <= SNAP_RADIUS) {
        // Within magnetic radius: snap both X and Y atomically to candle center + vertex
        return {
          dataIndex: candleIndex,
          timestamp: candleTimestamp,
          value: bestTarget.price,
          snappedX: candlePixelX,
          snappedY: bestTargetPixelY
        };
      }

      // Outside radius: smoothly follow the crosshair center 1:1
      return {
        dataIndex: rawXInfo.dataIndex,
        timestamp: rawXInfo.timestamp,
        value: rawPrice,
        snappedX: pixelX,
        snappedY: pixelY
      };
    }
  } catch (e) {}

  return {
    dataIndex: rawXInfo.dataIndex,
    timestamp: rawXInfo.timestamp,
    value: rawPrice,
    snappedX: pixelX,
    snappedY: pixelY
  };
}

const overlayAxesMap = new Map<string, { xAxis: any; yAxis: any }>();

const autoDeleteMeasureOverlaysMap = new Map<string, number>();

export function registerAutoDeleteMeasureOverlay(id: string): void {
  if (!id) return;
  autoDeleteMeasureOverlaysMap.set(id, Date.now());
}

interface ZoomSnapshot {
  barSpace: number;
  offsetRightDistance: number;
  // This is the time-scale's actual horizontal viewport position. Pixel
  // offsets change when bar space changes, so they cannot restore a zoom.
  barCount: number;
  yRange: { min: number; max: number } | null;
  wasAutoCalc?: boolean;
}

// Per-widget zoom history: the active widget exposes its zoomHistoryRef.current
// as window.__active_zoom_stack__. This matches the undo/redo pattern where
// each layout panel owns its own history via useRef.

function getZoomStack(chart?: any): ZoomSnapshot[] {
  const chartStack = chart?.__zoom_history_stack__;
  if (Array.isArray(chartStack)) return chartStack;
  const stack = (window as any).__active_zoom_stack__;
  if (Array.isArray(stack)) return stack;
  // Fallback: create a default stack if widget hasn't set one yet
  if (!stack) {
    (window as any).__active_zoom_stack__ = [];
    return (window as any).__active_zoom_stack__;
  }
  return [];
}

export function getZoomHistoryCount(): number {
  return getZoomStack((window as any).__active_chart_instance__).length;
}

export function clearZoomHistory(): void {
  const stack = getZoomStack((window as any).__active_chart_instance__);
  stack.length = 0;
  window.dispatchEvent(new CustomEvent('zoom-history-change', { detail: 0 }));
}

export function checkAndClosePolyline(overlay: any) {
  if (overlay && (overlay.name === 'polyline' || overlay.type === 'polyline') && overlay.points && overlay.points.length > 2) {
    const first = overlay.points[0];
    const last = overlay.points[overlay.points.length - 1];
    if (first && last) {
      const valDiff = Math.abs(Number(first.value ?? 0) - Number(last.value ?? 0));
      const idxDiff = Math.abs(Number(first.dataIndex ?? 0) - Number(last.dataIndex ?? 0));
      if (overlay.extendData?.__polylineClosed || (idxDiff < 0.01 && valDiff < (Number(first.value) * 0.001 || 0.01))) {
        last.dataIndex = first.dataIndex;
        last.timestamp = first.timestamp;
        last.value = first.value;
        if (!overlay.extendData) overlay.extendData = {};
        overlay.extendData.__polylineClosed = true;
      }
    }
  }
}

export function getActiveGlobalCoreCharts(): any[] {
  return Array.from((window as any).globalCoreCharts || []).filter((c: any) => {
    try {
      const container = typeof c?.getContainer === 'function' ? c.getContainer() : null;
      return container && document.body.contains(container);
    } catch (e) {
      return false;
    }
  });
}

export function getYAxisComponent(coreChart: any): any {
  if (!coreChart) return null;

  // Query the YAxis directly via getYAxes (v10 API)
  if (typeof coreChart.getYAxes === 'function') {
    try {
      let yAxes = coreChart.getYAxes({ paneId: 'candle_pane' });
      if (!yAxes || yAxes.length === 0) {
        yAxes = coreChart.getYAxes({ paneId: 'candle' });
      }
      if (!yAxes || yAxes.length === 0) {
        yAxes = coreChart.getYAxes({});
      }
      if (yAxes && yAxes.length > 0) return yAxes[0];
    } catch (e) { }
  }

  return null;
}

function animateZoomTransition(
  coreChart: any,
  timeScaleStore: any,
  yAxis: any,
  startBarSpace: number,
  targetBarSpace: number,
  startOffset: number,
  targetOffset: number,
  startYRange: { min: number; max: number } | null,
  targetYRange: { min: number; max: number } | null,
  wasAutoCalc: boolean,
  durationMs: number = 220
): void {
  const startTime = performance.now();
  const nowTime = Date.now();
  if (coreChart) {
    coreChart.__zoom_animating__ = true;
    coreChart.__zoom_animating_time__ = nowTime;
    if (coreChart._chartApi) {
      coreChart._chartApi.__zoom_animating__ = true;
      coreChart._chartApi.__zoom_animating_time__ = nowTime;
    }
  }

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  function frame(now: number) {
    try {
      // Stale check: if coreChart container is no longer in DOM, stop animation immediately and clear flags
      const isChartStale = !coreChart || (typeof coreChart.getContainer === 'function' && !document.body.contains(coreChart.getContainer()));
      if (isChartStale) {
        if (coreChart) {
          coreChart.__zoom_animating__ = false;
          if (coreChart._chartApi) coreChart._chartApi.__zoom_animating__ = false;
        }
        return;
      }

      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const ease = easeOutCubic(progress);
      const isFinalFrame = progress === 1;

      // Smoothly interpolate bar space — use setBarSpace (lightweight, no layout)
      const currentBarSpace = startBarSpace + (targetBarSpace - startBarSpace) * ease;
      if (timeScaleStore && typeof timeScaleStore.setBarSpace === 'function') {
        timeScaleStore.setBarSpace(currentBarSpace);
      } else if (typeof coreChart.setBarSpace === 'function') {
        coreChart.setBarSpace(currentBarSpace);
      }

      // Smoothly interpolate offset — set internals directly to avoid full layout on every frame
      const currentOffset = startOffset + (targetOffset - startOffset) * ease;
      if (timeScaleStore) {
        // Keep the store's offset and visible-range caches synchronized through
        // its setter. Direct writes here were the source of the stuck chart.
        const currentBarCount = currentOffset / (currentBarSpace || 1);
        if (typeof timeScaleStore.setLastBarRightSideDiffBarCount === 'function') {
          timeScaleStore.setLastBarRightSideDiffBarCount(currentBarCount);
        } else {
          timeScaleStore._lastBarRightSideDiffBarCount = currentBarCount;
        }
        
        // Update intermediate bar count on every frame to prevent desync during active animation
        coreChart.__user_panned_bar_count__ = currentBarCount;
        if (coreChart._chartApi) {
          coreChart._chartApi.__user_panned_bar_count__ = currentBarCount;
        }

        if (typeof timeScaleStore._adjustVisibleRange === 'function') {
          timeScaleStore._adjustVisibleRange();
        }
      }

      // Smoothly interpolate Y-axis price range
      if (yAxis && startYRange && targetYRange) {
        const min = startYRange.min + (targetYRange.min - startYRange.min) * ease;
        const max = startYRange.max + (targetYRange.max - startYRange.max) * ease;
        if (typeof yAxis.setAutoCalcTickFlag === 'function') {
          yAxis.setAutoCalcTickFlag(false);
        }
        (yAxis as any)._autoCalcTickFlag = false;

        const baseRange = yAxis.getRange() || undefined;
        const realFrom = typeof yAxis.valueToRealValue === 'function' ? yAxis.valueToRealValue(min, baseRange ? { range: baseRange } : undefined) : min;
        const realTo = typeof yAxis.valueToRealValue === 'function' ? yAxis.valueToRealValue(max, baseRange ? { range: baseRange } : undefined) : max;
        const displayFrom = typeof yAxis.realValueToDisplayValue === 'function' ? yAxis.realValueToDisplayValue(realFrom, baseRange ? { range: baseRange } : undefined) : realFrom;
        const displayTo = typeof yAxis.realValueToDisplayValue === 'function' ? yAxis.realValueToDisplayValue(realTo, baseRange ? { range: baseRange } : undefined) : realTo;

        const rangeVal = {
          from: min,
          to: max,
          range: max - min,
          realFrom,
          realTo,
          realRange: realTo - realFrom,
          displayFrom,
          displayTo,
          displayRange: displayTo - displayFrom
        };

        if (typeof yAxis.setRange === 'function') {
          yAxis.setRange(rangeVal);
        }
        (yAxis as any)._range = rangeVal;
        (yAxis as any)._realRange = rangeVal;
      }

      // During animation: lightweight repaint only (updatePane). Full layout only on final frame.
      if (typeof coreChart.updatePane === 'function') {
        coreChart.updatePane(isFinalFrame ? 1 : 4);
      }

      if (isFinalFrame) {
        // Final frame: do a full layout to finalize everything
        if (typeof coreChart.layout === 'function') {
          coreChart.layout({ measureWidth: true, update: true, buildYAxisTick: true, cacheYAxisWidth: true });
        }
        // Restore Y-axis autoCalc
        if (yAxis) {
          if (typeof yAxis.setAutoCalcTickFlag === 'function') {
            yAxis.setAutoCalcTickFlag(wasAutoCalc);
          }
          (yAxis as any)._autoCalcTickFlag = wasAutoCalc;
        }
        if (wasAutoCalc && typeof coreChart.adjustPaneViewport === 'function') {
          coreChart.adjustPaneViewport(false, true, true, true);
        }
        // Sync barCount cache to prevent desync during live updates
        if (timeScaleStore && typeof timeScaleStore.getLastBarRightSideDiffBarCount === 'function') {
          coreChart.__user_panned_bar_count__ = timeScaleStore.getLastBarRightSideDiffBarCount();
          if (coreChart._chartApi) {
            coreChart._chartApi.__user_panned_bar_count__ = coreChart.__user_panned_bar_count__;
          }
        }
        if (coreChart) {
          coreChart.__zoom_animating__ = false;
          if (coreChart._chartApi) coreChart._chartApi.__zoom_animating__ = false;
        }
      }

      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    } catch (err) {
      console.warn("Error in zoom animation frame:", err);
      if (coreChart) {
        coreChart.__zoom_animating__ = false;
        if (coreChart._chartApi) coreChart._chartApi.__zoom_animating__ = false;
      }
    }
  }

  requestAnimationFrame(frame);
}

// Apply sidebar zoom as one complete time-scale update. The old animation
// repeatedly mixed private offset writes with bar-space changes, leaving the
// visible range invalid and freezing the chart.
function applyZoomViewport(
  coreChart: any,
  timeScaleStore: any,
  yAxis: any,
  targetBarSpace: number,
  targetOffset: number,
  wasAutoCalc: boolean
): void {
  try {
    const barSpace = Number.isFinite(targetBarSpace) ? Math.max(1, Math.min(800, targetBarSpace)) : 6;
    const barCount = targetOffset / barSpace;
    if (!Number.isFinite(barCount)) return;

    if (typeof timeScaleStore?.setBarSpace === 'function') {
      timeScaleStore.setBarSpace(barSpace);
    } else if (typeof coreChart?.setBarSpace === 'function') {
      coreChart.setBarSpace(barSpace);
    }
    if (typeof timeScaleStore?.setLastBarRightSideDiffBarCount === 'function') {
      timeScaleStore.setLastBarRightSideDiffBarCount(barCount);
    }
    coreChart.__user_panned_bar_count__ = barCount;
    if (typeof timeScaleStore?._adjustVisibleRange === 'function') {
      timeScaleStore._adjustVisibleRange();
    }

    if (yAxis) {
      if (typeof yAxis.setAutoCalcTickFlag === 'function') yAxis.setAutoCalcTickFlag(wasAutoCalc);
      (yAxis as any)._autoCalcTickFlag = wasAutoCalc;
    }
    if (wasAutoCalc && typeof coreChart?.adjustPaneViewport === 'function') {
      coreChart.adjustPaneViewport(false, true, true, true);
    }
    if (typeof coreChart?.layout === 'function') {
      coreChart.layout({ measureWidth: true, update: true, buildYAxisTick: true, cacheYAxisWidth: true });
    } else if (typeof coreChart?.updatePane === 'function') {
      coreChart.updatePane(1);
    }
  } catch (err) {
    console.warn('Error applying sidebar zoom:', err);
  }
}

let lastProcessedTime = 0;

export function performZoomInBox(overlay: any): void {
  try {
    const now = Date.now();
    if (now - lastProcessedTime < 100) return;
    lastProcessedTime = now;

    const points = overlay?.points;
    if ((window as any).__addChartLog__) {
      (window as any).__addChartLog__(`[ZOOM IN BOX] Triggered. pointsCount=${points ? points.length : 0}`);
    }
    if (!points || points.length < 2) {
      const charts = getActiveGlobalCoreCharts();
      const chart = (window as any).__active_chart_instance__ || (charts.length > 0 ? (charts[0] as any) : null);
      if (chart) {
        const coreChart = (chart as any)._chartApi || chart;
        if (typeof coreChart.removeOverlay === 'function') {
          coreChart.removeOverlay({ name: 'zoomInBox' });
          coreChart.removeOverlay({ name: 'zoom-in-box' });
          if (overlay && overlay.id) coreChart.removeOverlay({ id: overlay.id });
        }
        if (typeof chart.removeOverlay === 'function') {
          chart.removeOverlay({ name: 'zoomInBox' });
          chart.removeOverlay({ name: 'zoom-in-box' });
          if (overlay && overlay.id) chart.removeOverlay({ id: overlay.id });
        }
      }
      return;
    }

    const p1 = points[0];
    const p2 = points[1];

    const charts = getActiveGlobalCoreCharts();
    const chart = (window as any).__active_chart_instance__ || (charts.length > 0 ? (charts[0] as any) : null);
    if (!chart) return;

    const coreChart = (chart as any)._chartApi || chart;
    if (typeof coreChart.setMaxOffsetLeftDistance === 'function') {
      coreChart.setMaxOffsetLeftDistance(999999);
    }
    if (typeof coreChart.setMaxOffsetRightDistance === 'function') {
      coreChart.setMaxOffsetRightDistance(999999);
    }
    const chartStore = coreChart._chartStore || (chart as any)._chartStore;
    if (!chartStore) return;

    const timeScaleStore = typeof chartStore.getTimeScaleStore === 'function'
      ? chartStore.getTimeScaleStore()
      : chartStore._timeScaleStore || chartStore.timeScaleStore;

    const yAxis = getYAxisComponent(coreChart);

    // 1. Snapshot current zoom state before applying new zoom
    const rawBarSpace = typeof coreChart.getBarSpace === 'function' ? coreChart.getBarSpace() : null;
    const currentBarSpace = typeof rawBarSpace === 'object' && rawBarSpace !== null
      ? (rawBarSpace as any).bar
      : (typeof rawBarSpace === 'number' ? rawBarSpace : (timeScaleStore?.getBarSpace?.()?.bar || 6));
    const currentOffset = typeof timeScaleStore?.getOffsetRightDistance === 'function' ? timeScaleStore.getOffsetRightDistance() : 0;
    let currentYRange: { min: number; max: number } | null = null;
    if (yAxis) {
      const r = typeof yAxis.getRange === 'function' ? yAxis.getRange() : yAxis._range;
      if (r) {
        const fromVal = Number(r.from !== undefined ? r.from : r.min);
        const toVal = Number(r.to !== undefined ? r.to : r.max);
        if (Number.isFinite(fromVal) && Number.isFinite(toVal)) {
          currentYRange = { min: Math.min(fromVal, toVal), max: Math.max(fromVal, toVal) };
        }
      }
    }

    const wasAutoCalcSnapshot = yAxis
      ? (typeof yAxis.getAutoCalcTickFlag === 'function' ? yAxis.getAutoCalcTickFlag() : !!(yAxis as any)._autoCalcTickFlag)
      : true;

    const currentBarCount = typeof timeScaleStore?.getLastBarRightSideDiffBarCount === 'function'
      ? timeScaleStore.getLastBarRightSideDiffBarCount()
      : currentOffset / currentBarSpace;
    const stack = getZoomStack(coreChart);
    stack.push({
      barSpace: currentBarSpace,
      offsetRightDistance: currentOffset,
      barCount: currentBarCount,
      yRange: currentYRange,
      wasAutoCalc: wasAutoCalcSnapshot
    });
    window.dispatchEvent(new CustomEvent('zoom-history-change', { detail: stack.length }));

    // 2. Calculate target indices and prices
    const dataList = (typeof coreChart.getDataList === 'function' ? coreChart.getDataList() : typeof chart.getDataList === 'function' ? chart.getDataList() : []) || [];
    const totalBars = dataList.length;

    let idx1 = p1.dataIndex !== undefined && p1.dataIndex !== null ? Number(p1.dataIndex) : -1;
    let idx2 = p2.dataIndex !== undefined && p2.dataIndex !== null ? Number(p2.dataIndex) : -1;

    if ((idx1 < 0 || idx2 < 0 || idx1 === idx2) && totalBars > 0) {
      if (p1.timestamp && p2.timestamp) {
        const t1 = Number(p1.timestamp);
        const t2 = Number(p2.timestamp);
        const minT = Math.min(t1, t2);
        const maxT = Math.max(t1, t2);
        idx1 = dataList.findIndex((d: any) => Number(d.timestamp) >= minT);
        idx2 = dataList.findIndex((d: any) => Number(d.timestamp) >= maxT);
      }
    }

    if (idx1 < 0) idx1 = 0;
    if (idx2 < 0) idx2 = totalBars > 0 ? totalBars - 1 : 0;

    const startDataIndex = Math.min(idx1, idx2);
    const endDataIndex = Math.max(idx1, idx2);

    let paneWidth = 1000;
    if (typeof coreChart.getSize === 'function') {
      paneWidth = coreChart.getSize('candle_pane')?.width || coreChart.getSize('candle')?.width || 1000;
    } else if (typeof coreChart.getPaneSize === 'function') {
      paneWidth = coreChart.getPaneSize('candle_pane')?.width || coreChart.getPaneSize('candle')?.width || 1000;
    }

    // Use TickerPen's actual drawing width (excluding Y-axis) for exact calculations
    const drawingWidth = (timeScaleStore as any)._totalBarSpace || (paneWidth - 62);
    const selectedBarsCount = Math.max(1, endDataIndex - startDataIndex + 1);

    // Calculate and clamp targetBarSpace to range limits
    let targetBarSpace = drawingWidth / selectedBarsCount;
    targetBarSpace = Math.max(1, Math.min(800, targetBarSpace));

    const barsAfterBox = totalBars > 0 ? (totalBars - 1 - endDataIndex) : 0;
    // Align endDataIndex exactly at the right boundary of the drawing area
    const targetOffsetRightDistance = -(barsAfterBox * targetBarSpace) - (targetBarSpace * 0.5);

    let targetYRange: { min: number; max: number } | null = null;
    let targetMinPrice = Infinity;
    let targetMaxPrice = -Infinity;
    for (let i = startDataIndex; i <= endDataIndex; i++) {
      const d = dataList[i];
      if (d) {
        if (d.low !== undefined && d.low < targetMinPrice) targetMinPrice = d.low;
        if (d.high !== undefined && d.high > targetMaxPrice) targetMaxPrice = d.high;
      }
    }
    if (targetMinPrice < Infinity && targetMaxPrice > -Infinity && targetMaxPrice > targetMinPrice) {
      const padding = (targetMaxPrice - targetMinPrice) * 0.05; // 5% padding top and bottom
      targetYRange = { min: targetMinPrice - padding, max: targetMaxPrice + padding };
    }

    // Capture whether the chart Y-axis is currently auto-calculating its scale range
    const wasAutoCalc = yAxis
      ? (typeof yAxis.getAutoCalcTickFlag === 'function' ? yAxis.getAutoCalcTickFlag() : !!(yAxis as any)._autoCalcTickFlag)
      : true;

    // 3. Perform 60fps smooth animated zoom transition
    applyZoomViewport(
      coreChart,
      timeScaleStore,
      yAxis,
      targetBarSpace,
      targetOffsetRightDistance,
      wasAutoCalc
    );

    // 4. Remove the ZoomInBox selection overlay after applying zoom
    setTimeout(() => {
      try {
        if (typeof coreChart.removeOverlay === 'function') {
          coreChart.removeOverlay({ name: 'zoomInBox' });
          coreChart.removeOverlay({ name: 'zoom-in-box' });
          if (overlay?.id) coreChart.removeOverlay({ id: overlay.id });
        }
        if (typeof chart.removeOverlay === 'function') {
          chart.removeOverlay({ name: 'zoomInBox' });
          chart.removeOverlay({ name: 'zoom-in-box' });
          if (overlay?.id) chart.removeOverlay({ id: overlay.id });
        }
      } catch (e) { }
    }, 60);

  } catch (err) {
    console.warn('Error executing Zoom In Box:', err);
  }
}

if (typeof window !== 'undefined') {
  (window as any).performZoomInBox = performZoomInBox;

  window.addEventListener('tickerpen-draw-end', (e: any) => {
    try {
      const overlay = e.detail?.overlay || e.detail;
      if (overlay && (overlay.name === 'zoomInBox' || overlay.name === 'zoom-in-box')) {
        performZoomInBox(overlay);
        return;
      }

      // Fallback overlay search
      const charts = Array.from((window as any).globalCoreCharts || []);
      const activeChart = (window as any).__active_chart_instance__ || (charts.length > 0 ? (charts[0] as any) : null);
      if (activeChart && typeof activeChart.getOverlays === 'function') {
        const overlays = activeChart.getOverlays() || [];
        const zoomOverlay = overlays.find((o: any) => o.name === 'zoomInBox' || o.name === 'zoom-in-box');
        if (zoomOverlay && zoomOverlay.points && zoomOverlay.points.length >= 2) {
          performZoomInBox(zoomOverlay);
        }
      }
    } catch (err) { }
  }, true);
}

export function performZoomOutStep(): boolean {
  try {
    const charts = Array.from((window as any).globalCoreCharts || []);
    const chart = (window as any).__active_chart_instance__ || (charts.length > 0 ? (charts[0] as any) : null);
    if (!chart) return false;

    const coreChart = (chart as any)._chartApi || chart;
    if (typeof coreChart.setMaxOffsetLeftDistance === 'function') {
      coreChart.setMaxOffsetLeftDistance(999999);
    }
    if (typeof coreChart.setMaxOffsetRightDistance === 'function') {
      coreChart.setMaxOffsetRightDistance(999999);
    }
    const chartStore = coreChart._chartStore || (chart as any)._chartStore;
    if (!chartStore) return false;

    const timeScaleStore = typeof chartStore.getTimeScaleStore === 'function'
      ? chartStore.getTimeScaleStore()
      : chartStore._timeScaleStore || chartStore.timeScaleStore;

    const yAxis = getYAxisComponent(coreChart);

    const stack = getZoomStack(coreChart);

    if ((window as any).__addChartLog__) {
      (window as any).__addChartLog__(`[ZOOM OUT STEP] Triggered. stackLength=${stack.length}`);
    }

    if (stack.length > 0) {
      const snapshot = stack.pop()!;
      window.dispatchEvent(new CustomEvent('zoom-history-change', { detail: stack.length }));

      const rawBarSpace = typeof coreChart.getBarSpace === 'function' ? coreChart.getBarSpace() : null;
      const currentBarSpace = typeof rawBarSpace === 'object' && rawBarSpace !== null
        ? (rawBarSpace as any).bar
        : (typeof rawBarSpace === 'number' ? rawBarSpace : (timeScaleStore?.getBarSpace?.()?.bar || 6));
      const currentOffset = typeof timeScaleStore?.getOffsetRightDistance === 'function' ? timeScaleStore.getOffsetRightDistance() : 0;
      let currentYRange: { min: number; max: number } | null = null;
      if (yAxis) {
        const r = typeof yAxis.getRange === 'function' ? yAxis.getRange() : yAxis._range;
        if (r) {
          const fromVal = Number(r.from !== undefined ? r.from : r.min);
          const toVal = Number(r.to !== undefined ? r.to : r.max);
          if (Number.isFinite(fromVal) && Number.isFinite(toVal)) {
            currentYRange = { min: Math.min(fromVal, toVal), max: Math.max(fromVal, toVal) };
          }
        }
      }

      const targetBarSpace = snapshot.barSpace;
      // Restore the saved bar-count position, rather than its old pixel
      // offset. The latter represents a different position after bar-space
      // has changed during Zoom In.
      const targetBarCount = Number.isFinite(snapshot.barCount)
        ? snapshot.barCount
        : snapshot.offsetRightDistance / targetBarSpace;
      const targetOffset = targetBarCount * targetBarSpace;

      applyZoomViewport(
        coreChart,
        timeScaleStore,
        yAxis,
        targetBarSpace,
        targetOffset,
        snapshot.wasAutoCalc ?? true
      );
      return true;
    } else {
      if (typeof coreChart.setBarSpace === 'function') {
        coreChart.setBarSpace(6);
      }
      // Use barCount-based reset instead of setOffsetRightDistance
      if (timeScaleStore && typeof timeScaleStore.setLastBarRightSideDiffBarCount === 'function') {
        const globalStyles = (typeof window !== 'undefined' ? (window as any).__chart_styles__ : null) || {};
        const defaultBarCount = globalStyles.marginRight !== undefined ? globalStyles.marginRight : 10;
        timeScaleStore.setLastBarRightSideDiffBarCount(defaultBarCount);
        coreChart.__user_panned_bar_count__ = undefined;
        if (typeof timeScaleStore._adjustVisibleRange === 'function') {
          timeScaleStore._adjustVisibleRange();
        }
      }
      if (yAxis) {
        if (typeof yAxis.setAutoCalcTickFlag === 'function') {
          yAxis.setAutoCalcTickFlag(true);
        }
        (yAxis as any)._autoCalcTickFlag = true;
      }
      if (typeof coreChart.adjustPaneViewport === 'function') {
        coreChart.adjustPaneViewport(false, true, true, true);
      }
      if (typeof coreChart.updatePane === 'function') {
        coreChart.updatePane(1);
      }
      return false;
    }
  } catch (err) {
    console.warn('Error executing Zoom Out Step:', err);
    return false;
  }
}

if (typeof window !== 'undefined') {
  const handleChartClickForMeasureCleanup = (e: MouseEvent | PointerEvent) => {
    if (autoDeleteMeasureOverlaysMap.size === 0) return;

    const target = e.target as HTMLElement | null;
    const isChartClick = target && (
      target.tagName === 'CANVAS' ||
      !!target.closest('.ticker-pen-pro') ||
      !!target.closest('[class*="tickerpen"]') ||
      !!target.closest('[class*="chart"]')
    );

    if (!isChartClick) return;

    const now = Date.now();
    const charts = Array.from((window as any).globalCoreCharts || []);
    const activeChart = (window as any).__active_chart_instance__;
    const allCharts = Array.from(new Set([...charts, activeChart].filter(Boolean)));

    const toDelete: string[] = [];

    autoDeleteMeasureOverlaysMap.forEach((drawEndTime, overlayId) => {
      if (overlayId && now - drawEndTime > 150) {
        toDelete.push(overlayId);
      }
    });

    if (toDelete.length > 0) {
      toDelete.forEach((overlayId) => {
        if (!overlayId) return;
        autoDeleteMeasureOverlaysMap.delete(overlayId);
        allCharts.forEach((chart: any) => {
          try {
            if (typeof chart.removeOverlay === 'function') {
              chart.removeOverlay({ id: overlayId });
            }
          } catch (err) { }
        });
      });
    }
  };

  window.addEventListener('pointerdown', handleChartClickForMeasureCleanup, true);
}

function formatCustomDateStamp(timestamp: number): string {
  if (isNaN(timestamp)) return '';
  const showWeekday = (typeof window !== 'undefined' ? (window as any).__custom_date_show_weekday__ : true) ?? true;
  const datePattern = (typeof window !== 'undefined' ? (window as any).__custom_date_format__ : null) || "Mon 29 Sep '97";
  const timeFormatSetting = (typeof window !== 'undefined' ? (window as any).__custom_time_format__ : null) || '24h';
  const tz = (typeof window !== 'undefined' ? (window as any).__custom_timezone__ : undefined) || 'Asia/Kolkata';

  // Get timezone-adjusted parts
  let y: number, m: number, d: number, hour: number, minute: number, wday: string;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', weekday: 'short',
      hour12: false
    });
    const parts = fmt.formatToParts(new Date(timestamp));
    const pm: Record<string, string> = {};
    for (const p of parts) pm[p.type] = p.value;
    y = parseInt(pm.year, 10);
    m = parseInt(pm.month, 10) - 1;
    d = parseInt(pm.day, 10);
    hour = parseInt(pm.hour, 10);
    if (hour === 24) hour = 0;
    minute = parseInt(pm.minute, 10);
    wday = pm.weekday;
  } catch {
    const date = new Date(timestamp);
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    y = date.getFullYear(); m = date.getMonth(); d = date.getDate();
    hour = date.getHours(); minute = date.getMinutes(); wday = weekdays[date.getDay()];
  }

  const currentPeriod = typeof window !== 'undefined' ? (window as any).__last_chart_period__ : null;
  const isHigherTf = (timestamp % 86400000 === 0) || (currentPeriod && (
    currentPeriod.timespan === 'day' || currentPeriod.timespan === 'week' || currentPeriod.timespan === 'month' || currentPeriod.timespan === 'year' ||
    currentPeriod.text === '1D' || currentPeriod.text === '1W' || currentPeriod.text === '1M' || currentPeriod.text === '1Y' ||
    currentPeriod.text === 'D' || currentPeriod.text === 'W' || currentPeriod.text === 'M' || currentPeriod.text === 'Y'
  ));

  if (isHigherTf) {
    hour = 0;
    minute = 0;
  }

  const monthsAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yShort = y.toString().slice(-2);
  const yFull = y.toString();
  const mAbbr = monthsAbbr[m];
  const mNum = (m + 1).toString().padStart(2, '0');
  const dNum = d.toString().padStart(2, '0');
  const q = 'Q' + Math.floor(m / 3 + 1);

  // Format date portion using the selected pattern
  let formatted = datePattern;
  if (showWeekday) {
    formatted = formatted.replace(/Mon/g, wday);
  } else {
    formatted = formatted.replace(/Mon\s*/g, '');
  }
  // Tokenize with unique placeholders first to prevent sequential substitution collision (e.g. day 09 matching month 09)
  const datePart = formatted
    .replace(/1997/g, '\u0001')
    .replace(/97/g, '\u0002')
    .replace(/Sep/g, '\u0003')
    .replace(/09/g, '\u0004')
    .replace(/29/g, '\u0005')
    .replace(/Q3/g, '\u0006')
    .replace(/\u0001/g, yFull)
    .replace(/\u0002/g, yShort)
    .replace(/\u0003/g, mAbbr)
    .replace(/\u0004/g, mNum)
    .replace(/\u0005/g, dNum)
    .replace(/\u0006/g, q)
    .trim();

  // Format time portion
  const minutes = minute.toString().padStart(2, '0');
  let timePart: string;
  if (timeFormatSetting === '12h') {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHours = hour % 12 || 12;
    timePart = `${displayHours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
  } else {
    timePart = `${hour.toString().padStart(2, '0')}:${minutes}`;
  }

  return `${datePart} ${timePart}`;
}

/**
 * Renders time labels in the chart's right-side empty space without adding
 * synthetic candles to the data series.
 */
export const futureTimeScaleOverlay: OverlayTemplate = {
  name: 'future-time-scale',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  // The overlay points extend the native time scale into the future. Keep
  // rendering empty so Ticker Pen supplies its normal grid and date labels;
  // custom figures here caused duplicate grid lines and blue date tags.
  createPointFigures: () => [],
  createXAxisFigures: () => []
};

/**
 * Registers the custom Canvas figure required by adapted drawing tools.
 */
export function registerTickerPenDrawingAdapter(): void {
  try {
    registerFigure({
      name: 'customDrawingRenderer',
      draw: (ctx, attrs: any) => {
        if (attrs && typeof attrs.drawFn === 'function') {
          attrs.drawFn(ctx);
        }
      },
      checkEventOn: (coordinate, attrs: any) => {
        if (attrs && typeof attrs.checkEventFn === 'function') {
          return attrs.checkEventFn(coordinate);
        }
        return false;
      }
    });

    registerFigure({
      name: 'text',
      draw: (ctx: CanvasRenderingContext2D, attrs: any, styles: any) => {
        const texts = Array.isArray(attrs) ? attrs : [attrs];
        const color = styles?.color || 'currentColor';
        const size = styles?.size || 12;
        const family = styles?.family || "'Rubik', sans-serif";
        const baseWeight = styles?.weight || 'normal';
        const paddingLeft = styles?.paddingLeft || 0;
        const paddingTop = styles?.paddingTop || 0;
        const paddingRight = styles?.paddingRight || 0;
        const paddingBottom = styles?.paddingBottom || 0;

        texts.forEach((textItem: any) => {
          if (!textItem || textItem.text === undefined || textItem.text === null) return;
          const str = String(textItem.text);
          const isYear = /^(19|20)\d{2}$/.test(str.trim());
          const weight = isYear ? 'bold' : (textItem.weight || baseWeight);

          ctx.save();
          ctx.font = `${weight} ${size}px ${family}`;

          const textWidth = textItem.width != null ? textItem.width : ctx.measureText(str).width;
          const totalWidth = textWidth + paddingLeft + paddingRight;
          const totalHeight = (textItem.height != null ? textItem.height : size) + paddingTop + paddingBottom;

          let startX = textItem.x;
          const align = textItem.align || 'left';
          if (align === 'right' || align === 'end') {
            startX = textItem.x - totalWidth;
          } else if (align === 'center') {
            startX = textItem.x - totalWidth / 2;
          }

          let startY = textItem.y;
          const baseline = textItem.baseline || 'top';
          if (baseline === 'bottom' || baseline === 'alphabetic') {
            startY = textItem.y - totalHeight;
          } else if (baseline === 'middle') {
            startY = textItem.y - totalHeight / 2;
          }

          if (styles?.backgroundColor && styles.backgroundColor !== 'transparent' && styles.backgroundColor !== 'rgba(0,0,0,0)') {
            ctx.fillStyle = styles.backgroundColor;
            ctx.fillRect(startX, startY, totalWidth, totalHeight);
          }

          if (styles?.borderColor && styles.borderSize) {
            ctx.strokeStyle = styles.borderColor;
            ctx.lineWidth = styles.borderSize;
            ctx.strokeRect(startX, startY, totalWidth, totalHeight);
          }

          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillStyle = color;
          ctx.fillText(str, startX + paddingLeft, startY + paddingTop);
          ctx.restore();
        });
      },
      checkEventOn: (coordinate: any, attrs: any, styles: any) => {
        const texts = Array.isArray(attrs) ? attrs : [attrs];
        for (const textItem of texts) {
          if (!textItem) continue;
          const size = styles?.size || 12;
          const width = textItem.width || 50;
          const height = textItem.height || size;
          if (coordinate.x >= textItem.x && coordinate.x <= textItem.x + width &&
              coordinate.y >= textItem.y && coordinate.y <= textItem.y + height) {
            return true;
          }
        }
        return false;
      }
    });
  } catch (e) {
    console.warn('customDrawingRenderer figure registration skipped (already registered or unsupported):', e);
  }
}

function getOverlayState(overlay: any): { isSelected: boolean, isHovered: boolean, isDrawing: boolean } {
  let isSelected = false;
  let isHovered = false;
  let isDrawing = false;
  let clickInfo: any = null;
  let hoverInfo: any = null;
  let progressInfo: any = null;

  try {
    const charts = getActiveGlobalCoreCharts();
    const matchingChart = charts.find((c: any) => {
      try {
        return c.getOverlays({ id: overlay.id }).length > 0;
      } catch (e) {
        return false;
      }
    }) || (globalThis as any).__active_chart_instance__;

    if (matchingChart && matchingChart._chartStore) {
      const hoverInfo10 = matchingChart._chartStore.getHoverOverlayInfo();
      const clickInfo10 = matchingChart._chartStore.getClickOverlayInfo();
      const progressInfo10 = matchingChart._chartStore.getProgressOverlayInfo();
      const overlayId = overlay.id;
      isSelected = clickInfo10?.overlay?.id === overlayId;
      isHovered = hoverInfo10?.overlay?.id === overlayId;
      isDrawing = progressInfo10?.overlay?.id === overlayId;
    }
  } catch (e) {
    // silent
  }

  // Safe check for drawing state
  if (typeof overlay.isDrawing === 'function') {
    isDrawing = overlay.isDrawing();
  } else if (overlay.currentStep != null && overlay.totalStep != null) {
    isDrawing = overlay.currentStep >= 0 && overlay.currentStep < overlay.totalStep;
  }

  // State transition logger to help debug
  const cacheKey = `__state_${overlay.id}`;
  const lastState = (overlay as any)[cacheKey];
  const currentStateStr = `${isSelected}_${isHovered}_${isDrawing}`;
  if (lastState !== currentStateStr) {
    (overlay as any)[cacheKey] = currentStateStr;
  }

  return { isSelected, isHovered, isDrawing };
}

/**
 * Helper to check if a color is transparent (alpha = 0).
 */
function isColorTransparent(color: string): boolean {
  if (!color) return true;
  const cleaned = color.replace(/\s+/g, '').toLowerCase();
  if (cleaned === 'transparent' || cleaned === 'rgba(0,0,0,0)') return true;
  if (cleaned.startsWith('rgba(')) {
    const parts = cleaned.match(/[\d.]+/g);
    if (parts && parts.length >= 4) {
      return parseFloat(parts[3]) === 0;
    }
  }
  return false;
}

/**
 * Standard fixed translucent shade color for price and time scale range rects.
 * Does not change when tool line colors change.
 */
function getOverlayShadeColor(_overlay: any): string {
  return 'rgba(41, 98, 255, 0.2)';
}

export function dispatchOverlaySettings(overlay: any) {
  if (!overlay) return;
  const name = overlay.name || '';
  if (name === 'text-box' || name === 'text-annotation' || name === 'simpleAnnotation') {
    window.dispatchEvent(new CustomEvent('open-text-settings', {
      detail: {
        overlayId: overlay.id,
        overlayName: overlay.name,
        text: overlay.extendData?.text ?? 'Text',
        fontSize: overlay.extendData?.fontSize ?? 14,
        fontWeight: overlay.extendData?.fontWeight ?? 'normal',
        fontStyle: overlay.extendData?.fontStyle ?? 'normal',
        underline: overlay.extendData?.underline ?? false,
        backgroundColor: overlay.extendData?.backgroundColor ?? 'transparent',
        borderColor: overlay.extendData?.borderColor ?? (overlay.name === 'text-box' ? '#787b86' : 'transparent'),
        textColor: overlay.extendData?.textColor ?? '#ffffff'
      }
    }));
  } else if (name === 'pin' || name === 'flag-mark' || name === 'flag') {
    window.dispatchEvent(new CustomEvent('open-pin-flag-settings', {
      detail: {
        overlayId: overlay.id,
        overlayName: overlay.name,
        color: overlay.extendData?.color || overlay.styles?.color || (name === 'pin' ? '#0488DB' : '#ef5350')
      }
    }));
  } else if (
    name === 'fib-retracement' ||
    name === 'fibonacciLine' ||
    name === 'fib-extension' ||
    name === 'fib-time-zone' ||
    name === 'timeZone' ||
    name === 'fib-time-extension' ||
    name === 'timeExtension' ||
    name === 'fib-channel' ||
    name === 'fibChannel' ||
    name === 'fib-circles' ||
    name === 'fibCircles' ||
    name === 'fib-arcs' ||
    name === 'fibArcs' ||
    name === 'fib-wedge' ||
    name === 'fibWedge' ||
    name === 'pitchfan' ||
    name === 'pitchFan' ||
    name === 'fib-spiral' ||
    name === 'fibSpiral' ||
    name === 'fib-speed-fan' ||
    name === 'fibSpeedFan' ||
    name === 'speedFan' ||
    name === 'andrews-pitchfork' ||
    name === 'andrewsPitchfork' ||
    name === 'andrews' ||
    name === 'parallelStraightLine' ||
    name === 'schiff-pitchfork' ||
    name === 'schiffPitchfork' ||
    name === 'schiff' ||
    name === 'modified-schiff-pitchfork' ||
    name === 'modifiedSchiffPitchfork' ||
    name === 'modifiedSchiff' ||
    name === 'inside-pitchfork' ||
    name === 'insidePitchfork' ||
    name === 'inside'
  ) {
    const defaultFibWidth = (name === 'fib-spiral' || name === 'fibSpiral') ? 2 : 1;
    const fibWidth = overlay.extendData?.lineWidth ?? overlay.extendData?.trendlineWidth ?? overlay.extendData?.levelLineWidth ?? overlay.styles?.lineWidth ?? overlay.styles?.size ?? defaultFibWidth;

    window.dispatchEvent(new CustomEvent('open-fib-settings', {
      detail: {
        overlayId: overlay.id,
        overlayName: overlay.name,
        lineWidth: fibWidth,
        trendlineWidth: overlay.extendData?.trendlineWidth ?? fibWidth,
        levelLineWidth: overlay.extendData?.levelLineWidth ?? fibWidth,
        lineColor: overlay.extendData?.lineColor ?? (overlay.styles?.color || '#2962ff'),
        lineStyle: overlay.extendData?.lineStyle ?? overlay.styles?.lineStyle ?? 'solid',
        trendlineColor: overlay.extendData?.trendlineColor ?? (overlay.extendData?.lineColor || overlay.styles?.color || '#787B86'),
        trendlineStyle: overlay.extendData?.trendlineStyle ?? 'dashed',
        showTrendline: overlay.extendData?.showTrendline ?? true,
        showMedian: overlay.extendData?.showMedian ?? true,
        medianColor: overlay.extendData?.medianColor ?? '#F23645',
        medianStyle: overlay.extendData?.medianStyle ?? 'solid',
        medianWidth: overlay.extendData?.medianWidth ?? 1,
        showBaseline: overlay.extendData?.showBaseline ?? true,
        baselineColor: overlay.extendData?.baselineColor ?? '#787B86',
        baselineStyle: overlay.extendData?.baselineStyle ?? 'dashed',
        baselineWidth: overlay.extendData?.baselineWidth ?? 1,
        extendMode: overlay.extendData?.extendMode ?? (overlay.extendData?.extendLines ? 'both' : 'none'),
        extendLines: overlay.extendData?.extendLines ?? false,
        extendTrendline: overlay.extendData?.extendTrendline ?? true,
        counterclockwise: overlay.extendData?.counterclockwise ?? false,
        rotations: overlay.extendData?.rotations ?? 8,
        priceLevels: overlay.extendData?.priceLevels,
        timeLevels: overlay.extendData?.timeLevels,
        showLeftLabels: overlay.extendData?.showLeftLabels ?? true,
        showRightLabels: overlay.extendData?.showRightLabels ?? true,
        showTopLabels: overlay.extendData?.showTopLabels ?? true,
        showBottomLabels: overlay.extendData?.showBottomLabels ?? true,
        showGrid: overlay.extendData?.showGrid ?? true,
        gridColor: overlay.extendData?.gridColor ?? '#2962FF',
        gridStyle: overlay.extendData?.gridStyle ?? 'solid',
        gridWidth: overlay.extendData?.gridWidth ?? 1,
        reverse: overlay.extendData?.reverse ?? false,
        reverseDirection: overlay.extendData?.reverseDirection ?? false,
        showPrices: overlay.extendData?.showPrices ?? true,
        showPercentages: overlay.extendData?.showPercentages ?? true,
        showLabels: overlay.extendData?.showLabels ?? true,
        coeffsAsPercents: overlay.extendData?.coeffsAsPercents ?? false,
        fullCircles: overlay.extendData?.fullCircles ?? overlay.extendData?.fullCircle ?? false,
        useOneColor: overlay.extendData?.useOneColor ?? false,
        oneColor: overlay.extendData?.oneColor ?? '#2962FF',
        filled: overlay.extendData?.filled ?? true,
        levels: overlay.extendData?.levels,
        levelsFormat: overlay.extendData?.levelsFormat ?? 'values',
        labelsAlign: overlay.extendData?.labelsAlign ?? (name === 'fib-channel' || name === 'fibChannel' || name === 'fib-time-zone' || name === 'timeZone' ? 'left' : 'right'),
        labelsVerticalAlign: overlay.extendData?.labelsVerticalAlign ?? (name === 'fib-time-zone' || name === 'timeZone' || name === 'fib-time-extension' || name === 'timeExtension' ? 'bottom' : 'middle'),
        fontSize: overlay.extendData?.fontSize ?? 12,
        backgroundOpacity: overlay.extendData?.backgroundOpacity ?? 0.15,
        logScale: overlay.extendData?.logScale ?? false
      }
    }));
  } else if (name === 'short-position' || name === 'long-position') {
    const extData = overlay.extendData || {};
    const posOpts = overlay._positionOptions || {};
    const getOpt = (key: string, fallback: any) => extData[key] ?? posOpts[key] ?? fallback;
    window.dispatchEvent(new CustomEvent('open-position-settings', {
      detail: {
        overlayId: overlay.id,
        overlayName: overlay.name,
        showPrices: getOpt('showPrices', true),
        showPercentage: getOpt('showPercentage', true),
        showRiskReward: getOpt('showRiskReward', true),
        showPnL: getOpt('showPnL', true),
        quantity: getOpt('quantity', 1),
        accountSize: getOpt('accountSize', 10000),
        riskPercent: getOpt('riskPercent', 1),
        profitColor: overlay.styles?.takeProfit?.color ?? overlay.styles?.takeProfitColor ?? getOpt('profitColor', getOpt('targetColor', 'rgba(38, 166, 154, 0.2)')),
        lossColor: overlay.styles?.stopLoss?.color ?? overlay.styles?.stopLossColor ?? getOpt('lossColor', getOpt('stopColor', 'rgba(239, 83, 80, 0.2)')),
        accountSizeCurrency: getOpt('accountSizeCurrency', 'Default'),
        lotSize: getOpt('lotSize', 1),
        riskType: getOpt('riskType', 'percent'),
        risk: getOpt('risk', 10.00),
        leverage: getOpt('leverage', 1),
        qtyPrecision: getOpt('qtyPrecision', 'Default'),
        profitTicks: getOpt('profitTicks', undefined),
        profitPrice: getOpt('profitPrice', undefined),
        stopTicks: getOpt('stopTicks', undefined),
        stopPrice: getOpt('stopPrice', undefined),
        entryPrice: getOpt('entryPrice', undefined),
        linesColor: overlay.styles?.lineColor ?? getOpt('linesColor', 'rgba(255, 255, 255, 0.4)'),
        stopColor: overlay.styles?.stopLossColor ?? getOpt('stopColor', 'rgba(239, 83, 80, 0.2)'),
        targetColor: overlay.styles?.takeProfitColor ?? getOpt('targetColor', 'rgba(38, 166, 154, 0.2)'),
        textColor: overlay.styles?.textColor ?? getOpt('textColor', '#ffffff'),
        textSize: overlay.styles?.textSize ?? getOpt('textSize', 11),
        showPriceLabels: getOpt('showPriceLabels', true),
        compactStats: getOpt('compactStats', false),
        alwaysShowStats: getOpt('alwaysShowStats', false),
        showTpPriceOffset: getOpt('showTpPriceOffset', true),
        showTpPercentOffset: getOpt('showTpPercentOffset', true),
        showTpTickOffset: getOpt('showTpTickOffset', true),
        showTpAmount: getOpt('showTpAmount', true),
        showTpPL: getOpt('showTpPL', true),
        showOpenClosedPL: getOpt('showOpenClosedPL', true),
        showQty: getOpt('showQty', true),
        showSlPriceOffset: getOpt('showSlPriceOffset', true),
        showSlPercentOffset: getOpt('showSlPercentOffset', true),
        showSlTickOffset: getOpt('showSlTickOffset', true),
        showSlAmount: getOpt('showSlAmount', true),
        showSlPL: getOpt('showSlPL', true)
      }
    }));
  } else if (name === 'table') {
    window.dispatchEvent(new CustomEvent('close-text-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-fib-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-position-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-elliott-toolbar', { detail: {} }));
    const screenX = 64;
    const screenY = 140;
    window.dispatchEvent(new CustomEvent('open-table-toolbar', {
      detail: {
        overlayId: overlay.id,
        overlayName: overlay.name,
        rows: overlay.extendData?.rows ?? 3,
        cols: overlay.extendData?.cols ?? 3,
        tableData: overlay.extendData?.tableData ?? Array.from({ length: overlay.extendData?.rows ?? 3 }, () => Array(overlay.extendData?.cols ?? 3).fill('')),
        backgroundColor: overlay.extendData?.backgroundColor ?? '#3c404b',
        borderColor: overlay.extendData?.borderColor ?? '#2962ff',
        borderWidth: overlay.extendData?.borderWidth ?? 1,
        textColor: overlay.extendData?.textColor ?? '#ffffff',
        fontSize: overlay.extendData?.fontSize ?? 14,
        textAlign: overlay.extendData?.textAlign ?? 'left',
        screenX,
        screenY
      }
    }));
  } else if (
    name === 'elliott-impulse-wave' ||
    name === 'elliott-correction-wave' ||
    name === 'elliott-triangle-wave' ||
    name === 'elliott-triple-combo-wave' ||
    name === 'elliott-double-combo-wave' ||
    name === 'elliott-wave-path' ||
    name.startsWith('elliott')
  ) {
    window.dispatchEvent(new CustomEvent('close-text-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-fib-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-position-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-pin-flag-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-table-toolbar', { detail: {} }));

    const screenX = 64;
    const screenY = 140;
    const defaultColor = name === 'elliott-impulse-wave' ? '#2979ff'
      : name === 'elliott-correction-wave' ? '#ff9800'
      : name === 'elliott-triangle-wave' ? '#e91e63'
      : name === 'elliott-triple-combo-wave' ? '#9c27b0'
      : name === 'elliott-double-combo-wave' ? '#7e57c2'
      : '#089981';

    window.dispatchEvent(new CustomEvent('open-elliott-toolbar', {
      detail: {
        overlayId: overlay.id,
        overlayName: overlay.name,
        color: overlay.extendData?.color || overlay.styles?.line?.color || defaultColor,
        size: overlay.extendData?.size ?? overlay.styles?.line?.size ?? 1,
        screenX,
        screenY
      }
    }));
  } else if (
    // Lines
    name === 'trend-line' || name === 'trendLine' ||
    name === 'horizontal-line' || name === 'horizontalLine' || name === 'horizontalStraightLine' ||
    name === 'vertical-line' || name === 'verticalLine' || name === 'verticalStraightLine' ||
    name === 'ray' || name === 'arrow' ||
    name === 'extended-line' || name === 'extendedLine' ||
    name === 'cross-line' || name === 'crossLine' ||
    name === 'info-line' || name === 'infoLine' ||
    name === 'trend-angle' || name === 'trendAngle' ||
    name === 'horizontal-ray' || name === 'horizontalRay' || name === 'horizontalRayLine' ||
    // Channels
    name === 'parallel-channel' || name === 'parallelChannel' || name === 'parallelStraightLine' ||
    name === 'regression-trend' || name === 'regressionTrend' ||
    name === 'flat-top-bottom' || name === 'flatTopBottom' ||
    name === 'disjoint-channel' || name === 'disjointChannel' ||
    // Shapes
    name === 'rectangle' || name === 'rotated-rectangle' || name === 'rotatedRectangle' ||
    name === 'circle' || name === 'triangle' || name === 'ellipse' || name === 'arc' ||
    name === 'path' || name === 'polyline' || name === 'curve' || name === 'double-curve' || name === 'doubleCurve' ||
    // Brushes
    name === 'brush' || name === 'highlighter' ||
    // Arrow Markers
    name === 'arrow-mark-up' || name === 'arrowMarkUp' ||
    name === 'arrow-mark-down' || name === 'arrowMarkDown'
  ) {
    window.dispatchEvent(new CustomEvent('close-text-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-fib-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-position-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-pin-flag-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-table-toolbar', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-elliott-toolbar', { detail: {} }));

    const screenX = 64;
    const screenY = 140;

    const isBrush = name === 'brush' || name === 'highlighter';
    const isChannel = name.includes('channel') || name.includes('regression') || name.includes('flat-top');
    const isShape = name.includes('rect') || name.includes('circle') || name.includes('triangle') || name.includes('ellipse') || name.includes('arc') || name.includes('path') || name.includes('polyline') || name.includes('curve');
    const category = isBrush ? 'brush' : isChannel ? 'channel' : isShape ? 'shape' : 'line';

    const defaultColor = (name === 'arrow-mark-up' || name === 'arrowMarkUp')
      ? '#089981'
      : (name === 'arrow-mark-down' || name === 'arrowMarkDown')
      ? '#f23645'
      : '#2962ff';

    const isShapeOrChannel = category === 'shape' || category === 'channel';

    const extendLineColor = overlay.extendData?.lineColor ?? overlay.extendData?.strokeColor ?? overlay.extendData?.color;
    let rawColor = extendLineColor;
    if (rawColor === undefined) {
      const styleColor = [
        overlay.styles?.line?.color,
        overlay.styles?.lines?.[0]?.color,
        overlay.styles?.color,
        overlay.styles?.polygon?.borderColor,
        overlay.styles?.rect?.borderColor,
        overlay.styles?.circle?.borderColor,
        overlay.styles?.arc?.borderColor,
        overlay.styles?.arc?.color
      ].find(c => c && !isColorTransparent(c));
      rawColor = styleColor !== undefined ? styleColor : defaultColor;
    }

    const isLineNone = isColorTransparent(rawColor) || overlay.extendData?.lineOpacity === 0;

    const widthCandidates = [
      overlay.extendData?.lineWidth,
      overlay.extendData?.trendlineWidth,
      overlay.extendData?.levelLineWidth,
      overlay.extendData?.medianWidth,
      overlay.extendData?.gridLineWidth,
      overlay.extendData?.channelLineWidth,
      overlay.extendData?.brushSize,
      overlay.extendData?.highlighterWidth,
      overlay.extendData?.borderSize,
      overlay.styles?.line?.size,
      overlay.styles?.line?.lineWidth,
      overlay.styles?.lines?.[0]?.size,
      overlay.styles?.lines?.[0]?.lineWidth,
      overlay.styles?.polygon?.borderSize,
      overlay.styles?.rect?.borderSize,
      overlay.styles?.circle?.borderSize,
      overlay.styles?.arc?.borderSize,
      overlay.styles?.lineWidth,
      overlay.styles?.size,
      overlay.styles?.borderSize
    ];

    const rawWidth = widthCandidates.find(w => typeof w === 'number' && w > 0) || (name === 'highlighter' ? 20 : (isBrush ? 2 : 1));

    const rawStyle = overlay.extendData?.lineStyle || overlay.styles?.line?.style || 'solid';

    const extendFillColor = overlay.extendData?.fillColor;
    let rawFill = extendFillColor;
    if (rawFill === undefined) {
      const styleFill = [
        overlay.styles?.polygon?.color,
        overlay.styles?.polygon?.fillColor,
        overlay.styles?.rect?.fillColor,
        overlay.styles?.circle?.fillColor
      ].find(f => f && !isColorTransparent(f));
      rawFill = styleFill !== undefined
        ? styleFill
        : (category === 'channel' ? 'rgba(41, 98, 255, 0.15)' : category === 'shape' ? 'rgba(41, 98, 255, 0.2)' : 'transparent');
    }

    const isFillNone = !isShapeOrChannel || isColorTransparent(rawFill) || overlay.extendData?.filled === false || overlay.extendData?.fillOpacity === 0;
    const fillOpacity = isFillNone ? 0 : (overlay.extendData?.fillOpacity ?? 0.2);

    const isRegression = name === 'regression-trend' || name === 'regressionTrend';
    const upFillColor = overlay.extendData?.upFillColor ?? overlay.extendData?.upperFillColor ?? overlay.extendData?.fillColor ?? 'rgba(0, 150, 136, 0.18)';
    const downFillColor = overlay.extendData?.downFillColor ?? overlay.extendData?.lowerFillColor ?? overlay.extendData?.fillColor2 ?? 'rgba(239, 83, 80, 0.16)';

    window.dispatchEvent(new CustomEvent('open-drawing-toolbar', {
      detail: {
        overlayId: overlay.id,
        overlayName: overlay.name,
        category,
        lineColor: isLineNone ? 'transparent' : rawColor,
        lineWidth: rawWidth,
        lineStyle: rawStyle,
        lineOpacity: isLineNone ? 0 : (overlay.extendData?.lineOpacity ?? (name === 'highlighter' ? 0.4 : 1)),
        fillColor: isFillNone ? 'transparent' : rawFill,
        fillOpacity: fillOpacity,
        filled: !isFillNone && (overlay.extendData?.filled ?? isShapeOrChannel),
        upFillColor: isRegression ? upFillColor : undefined,
        downFillColor: isRegression ? downFillColor : undefined,
        locked: overlay.lock ?? overlay.extendData?.locked ?? false,
        points: overlay.points || [],
        screenX,
        screenY
      }
    }));
  } else if (
    // Gann Tools
    name === 'gann-box' || name === 'gannBox' || name === 'box' ||
    name === 'gann-fan' || name === 'gannFan' || name === 'fan' ||
    name === 'gann-square' || name === 'gannSquare' || name === 'square' ||
    // Forecasting & Measurers (except measure tool)
    name === 'price-range' || name === 'priceRange' ||
    name === 'date-range' || name === 'dateRange' ||
    name === 'date-price-range' || name === 'datePriceRange' ||
    name === 'forecast' ||
    name === 'bars-pattern' || name === 'barsPattern' ||
    name === 'projection' ||
    // Annotations
    name === 'anchored-text' || name === 'anchoredText' ||
    name === 'price-note' || name === 'priceNote' ||
    name === 'price-label' || name === 'priceLabel' ||
    name === 'comment' ||
    name === 'signpost' ||
    name === 'emoji'
  ) {
    window.dispatchEvent(new CustomEvent('close-text-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-fib-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-position-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-pin-flag-settings', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-table-toolbar', { detail: {} }));
    window.dispatchEvent(new CustomEvent('close-elliott-toolbar', { detail: {} }));

    const screenX = 64;
    const screenY = 140;

    window.dispatchEvent(new CustomEvent('open-drawing-toolbar', {
      detail: {
        overlayId: overlay.id,
        overlayName: overlay.name,
        category: 'simple',
        lineColor: 'transparent',
        lineWidth: 1,
        lineStyle: 'solid',
        lineOpacity: 1,
        fillColor: 'transparent',
        fillOpacity: 0,
        filled: false,
        locked: overlay.lock ?? overlay.extendData?.locked ?? false,
        points: overlay.points || [],
        screenX,
        screenY
      }
    }));
  }
}

function setupPositionPoints(overlay: any, defType: string) {
  if (!overlay || !overlay.points || overlay.points.length < 1) return;
  if (overlay.points.length >= 4) return;

  const entry = overlay.points[0];
  const entryPrice = Number(entry.value ?? 0);
  const isLong = defType === 'long-position';

  const chart = (globalThis as any).__active_chart_instance__ || (window as any).__active_chart_instance__;
  const dataList = chart && typeof chart.getDataList === 'function' ? chart.getDataList() : [];
  
  let entryIdx = Math.round(Number(entry.dataIndex ?? 0));
  if (dataList[entryIdx] && (!entry.timestamp || entry.timestamp === 0)) {
    entry.timestamp = Number(dataList[entryIdx].timestamp);
  }

  let targetDataIndex = Number(entry.dataIndex ?? 0) + 18;
  let targetTimestamp = Number(entry.timestamp ?? Date.now()) + 18 * 60000;

  // Responsive visual screen width in pixels: decreased slightly for sleeker proportions
  const chartWidth = (chart && typeof chart.getWidth === 'function' ? chart.getWidth() : null) || window.innerWidth || 800;
  const responsivePixelWidth = Math.min(Math.max(chartWidth * 0.15, 110), 210);

  let profitPrice = isLong ? entryPrice * 1.008 : entryPrice * 0.992;
  let stopPrice = isLong ? entryPrice * 0.992 : entryPrice * 1.008;

  try {
    if (chart && typeof chart.convertToPixel === 'function' && typeof chart.convertFromPixel === 'function') {
      const entryPixel = chart.convertToPixel([entry], { paneId: 'candle_pane' });
      if (entryPixel && entryPixel[0] && Number.isFinite(entryPixel[0].x)) {
        const targetPixelX = entryPixel[0].x + responsivePixelWidth;
        const convertedX = chart.convertFromPixel([{ x: targetPixelX, y: entryPixel[0].y }], { paneId: 'candle_pane' });
        if (convertedX && convertedX[0]) {
          if (Number.isFinite(convertedX[0].dataIndex)) {
            targetDataIndex = Number(convertedX[0].dataIndex);
          }
          if (convertedX[0].timestamp) {
            targetTimestamp = Number(convertedX[0].timestamp);
          }
        }

        const targetIdx = Math.round(targetDataIndex);
        if (dataList[targetIdx]) {
          targetTimestamp = Number(dataList[targetIdx].timestamp);
        } else if (dataList.length >= 2) {
          const lastIdx = dataList.length - 1;
          const step = Number(dataList[lastIdx].timestamp) - Number(dataList[lastIdx - 1].timestamp);
          targetTimestamp = Number(dataList[lastIdx].timestamp) + (targetIdx - lastIdx) * step;
        }

        // Viewport-aware TP (95px visual height) and SL (60px visual height)
        if (Number.isFinite(entryPixel[0].y)) {
          const tpPixelY = isLong ? entryPixel[0].y - 95 : entryPixel[0].y + 95;
          const slPixelY = isLong ? entryPixel[0].y + 60 : entryPixel[0].y - 60;
          const convertedTP = chart.convertFromPixel([{ x: entryPixel[0].x, y: tpPixelY }], { paneId: 'candle_pane' });
          const convertedSL = chart.convertFromPixel([{ x: entryPixel[0].x, y: slPixelY }], { paneId: 'candle_pane' });
          if (convertedTP && convertedTP[0] && Number.isFinite(convertedTP[0].value) && convertedTP[0].value > 0) {
            profitPrice = Number(convertedTP[0].value);
          }
          if (convertedSL && convertedSL[0] && Number.isFinite(convertedSL[0].value) && convertedSL[0].value > 0) {
            stopPrice = Number(convertedSL[0].value);
          }
        }
      }
    }
  } catch (e) { }

  overlay.points = [
    entry,
    { ...entry, value: stopPrice },
    { ...entry, value: profitPrice },
    { ...entry, dataIndex: targetDataIndex, timestamp: targetTimestamp }
  ];

  (overlay as any).__prevPoints = overlay.points.map((p: any) => ({
    dataIndex: p.dataIndex,
    timestamp: p.timestamp,
    value: p.value
  }));

  try {
    if (typeof overlay.forceComplete === 'function') {
      overlay.forceComplete();
    }
  } catch (e) { }

  if (chart && chart._chartStore) {
    try {
      chart._chartStore.progressOverlayComplete();
    } catch (e) { }
  }

  window.dispatchEvent(new CustomEvent('tickerpen-draw-end', { detail: { overlay } }));
  dispatchOverlaySettings(overlay);
}

/**
 * Ticker Pen Overlay Templates for all 68 tools from lightweight-charts-drawing.
 */
export const tickerPenOverlays: OverlayTemplate[] = TOOL_DEFINITIONS.map(def => {
  const isFreehand = def.type === 'brush' || def.type === 'highlighter';
  // Single-point tools with special y-axis label handling (background-colored label boxes)
  const singlePointYAxisLabel = new Set([
    'horizontal-line',
    'horizontal-ray',
    'cross-line'
  ]).has(def.type);
  // Single-point tools with special x-axis label handling
  const singlePointXAxisLabel = new Set([
    'vertical-line',
    'cross-line',
    'horizontal-line',
    'horizontal-ray'
  ]).has(def.type);
  // All multi-point tools (2+ anchors) get labels + shade on both axes
  const excludeFromLabels = new Set(['zoomInBox', 'brush', 'highlighter', 'text-annotation', 'text-box', 'arrow-mark-up', 'arrow-mark-down']).has(def.type);
  const isMultiPoint = def.requiredAnchors >= 2 && !excludeFromLabels;
  const showScaleValue = singlePointYAxisLabel || isMultiPoint || def.type === 'long-position' || def.type === 'short-position';
  const showDateOnScale = singlePointXAxisLabel || isMultiPoint || def.type === 'long-position' || def.type === 'short-position';
  return {
    name: def.type, // matches the tool key like 'trend-line', 'fib-retracement'
    totalStep: (def.type === 'polyline' || def.type === 'path') ? 999 : (isFreehand ? 1 : (def.requiredAnchors + 1)),
    // Use native point hit targets for regression endpoints. The visible
    // handles remain custom-rendered, but native points report drag events
    // reliably instead of starting a whole-overlay move.
    needDefaultPointFigure: (def.type === 'text-box' || def.type === 'text-annotation') ? false : (def.type === 'regression-trend' ? true : !isFreehand),
    needDefaultXAxisFigure: false,
    // Make the default point handles transparent so we can draw our custom
    // rounded squares in the canvas renderer, but keep them active and
    // draggable (with an 8px radius for easy hit testing).
    styles: {
      point: {
        color: 'rgba(0, 0, 0, 0)',
        borderColor: 'rgba(0, 0, 0, 0)',
        activeColor: 'rgba(0, 0, 0, 0)',
        activeBorderColor: 'rgba(0, 0, 0, 0)',
        radius: 8,
        activeRadius: 8
      },
      line: {
        color: 'rgba(0, 0, 0, 0)',
        size: 0
      },
      polygon: {
        color: 'rgba(0, 0, 0, 0)',
        borderColor: 'rgba(0, 0, 0, 0)',
        borderSize: 0
      },
      xAxis: {
        show: false
      },
      yAxis: {
        show: false
      },
      ...((def.type === 'long-position' || def.type === 'short-position') ? {
        takeProfit: {
          color: 'rgba(38, 166, 154, 0.2)'
        },
        stopLoss: {
          color: 'rgba(239, 83, 80, 0.2)'
        },
        entry: {
          color: '#787b86'
        }
      } : {})
    },
    // Use the custom scale values below. Ticker Pen' default overlay tags
    // create a second blue price bar with a different visual value/precision.
    needDefaultYAxisFigure: false,
    onClick: (event: any) => {
      try {
        if (event && event.overlay) {
          const isDrawing = typeof event.overlay.isDrawing === 'function' ? event.overlay.isDrawing() : false;
          if (isDrawing) {
            const axes = overlayAxesMap.get(event.overlay.id);
            const xAxis = axes?.xAxis;
            const yAxis = axes?.yAxis;
            const chart = (globalThis as any).__active_chart_instance__;
            if (xAxis && yAxis && typeof event.x === 'number' && typeof event.y === 'number' && event.overlay.points && event.overlay.points.length > 0) {
              const snapped = applyMagnetSnap(event.x, event.y, xAxis, yAxis, chart);
              if (snapped && Number.isFinite(snapped.value) && Number.isFinite(snapped.dataIndex)) {
                const lastIdx = event.overlay.points.length - 1;
                event.overlay.points[lastIdx].dataIndex = snapped.dataIndex;
                event.overlay.points[lastIdx].timestamp = snapped.timestamp;
                event.overlay.points[lastIdx].value = snapped.value;
                // Sync crosshair center to the placed anchor point position
                try {
                  const crossX = typeof snapped.snappedX === 'number' ? snapped.snappedX : event.x;
                  const crossY = typeof snapped.snappedY === 'number' ? snapped.snappedY : event.y;
                  chart?._chartStore?.setCrosshair?.({ x: crossX, y: crossY, paneId: 'candle_pane' }, { forceInvalidate: true });
                } catch (e) {}
              }
            }
          }
          if (def.type === 'polyline' && isDrawing) {
            const points = event.overlay.points;
            if (points && points.length >= 3) {
              const axes = overlayAxesMap.get(event.overlay.id);
              const xAxis = axes?.xAxis;
              const yAxis = axes?.yAxis;
              const chart = (globalThis as any).__active_chart_instance__;
              let isNearFirst = false;
              if (typeof event.x === 'number' && typeof event.y === 'number') {
                let p0x: number | null = null;
                let p0y: number | null = null;
                try {
                  const p0Pixel = chart && typeof chart.convertToPixel === 'function' ? chart.convertToPixel(points[0]) : null;
                  if (p0Pixel && typeof p0Pixel.x === 'number' && typeof p0Pixel.y === 'number') {
                    p0x = p0Pixel.x;
                    p0y = p0Pixel.y;
                  }
                } catch (e) {}
                if (p0x === null || p0y === null) {
                  if (xAxis && yAxis) {
                    p0x = dataIndexToPixelX(Number(points[0].dataIndex ?? 0), xAxis);
                    p0y = yAxis.convertToPixel(Number(points[0].value ?? 0));
                  }
                }
                if (typeof p0x === 'number' && typeof p0y === 'number') {
                  isNearFirst = Math.hypot(event.x - p0x, event.y - p0y) <= 35;
                }
              }
              if (isNearFirst) {
                const firstPoint = points[0];
                points[points.length - 1] = {
                  dataIndex: firstPoint.dataIndex,
                  timestamp: firstPoint.timestamp,
                  value: firstPoint.value
                };
                if (!event.overlay.extendData) event.overlay.extendData = {};
                event.overlay.extendData.__polylineClosed = true;
                event.overlay.forceComplete();
                if (chart && chart._chartStore) {
                  chart._chartStore.progressOverlayComplete();
                  if (typeof event.overlay.onDrawEnd === 'function') {
                    try { event.overlay.onDrawEnd({ overlay: event.overlay, chart }); } catch (e) { }
                  }
                }
                return true;
              }
            }
          }
          dispatchOverlaySettings(event.overlay);
        }
      } catch (e) { }
      return false;
    },
    onSelected: (event: any) => {
      try {
        if (event && event.overlay) {
          dispatchOverlaySettings(event.overlay);
        }
        const charts = Array.from((window as any).globalCoreCharts || []);
        charts.forEach((chart: any) => {
          if (typeof chart.updatePane === 'function') {
            chart.updatePane(1); // 1 = UpdateLevel.Overlay
          }
        });
      } catch (e) { }
      return false;
    },
    onDeselected: (event: any) => {
      try {
        if (event && event.overlay) {
          const name = event.overlay.name || '';
          if (name === 'text-box' || name === 'text-annotation' || name === 'simpleAnnotation') {
            window.dispatchEvent(new CustomEvent('close-text-settings', {
              detail: { overlayId: event.overlay.id }
            }));
          } else if (
            name.startsWith('fib') ||
            name === 'fibonacciLine' ||
            name.includes('pitchfork') ||
            name === 'andrews' ||
            name === 'schiff' ||
            name === 'modifiedSchiff' ||
            name === 'inside' ||
            name === 'pitchfan' ||
            name === 'pitchFan' ||
            name === 'speedFan' ||
            name === 'timeZone' ||
            name === 'timeExtension' ||
            name === 'fibChannel' ||
            name === 'fibCircles' ||
            name === 'fibArcs' ||
            name === 'fibWedge' ||
            name === 'fibSpiral' ||
            name === 'parallelStraightLine'
          ) {
            window.dispatchEvent(new CustomEvent('close-fib-settings', {
              detail: { overlayId: event.overlay.id }
            }));
          } else if (name === 'short-position' || name === 'long-position') {
            window.dispatchEvent(new CustomEvent('close-position-settings', {
              detail: { overlayId: event.overlay.id }
            }));
          } else if (name === 'pin' || name === 'flag-mark' || name === 'flag') {
            window.dispatchEvent(new CustomEvent('close-pin-flag-settings', {
              detail: { overlayId: event.overlay.id }
            }));
          } else if (name === 'table') {
            window.dispatchEvent(new CustomEvent('close-table-toolbar', {
              detail: { overlayId: event.overlay.id }
            }));
          }
          window.dispatchEvent(new CustomEvent('close-drawing-toolbar', {
            detail: { overlayId: event.overlay.id }
          }));
        }
        const charts = Array.from((window as any).globalCoreCharts || []);
        charts.forEach((chart: any) => {
          if (typeof chart.updatePane === 'function') {
            chart.updatePane(1);
          }
        });
      } catch (e) { }
      return false;
    },
    onRemoved: (event: any) => {
      try {
        if (event && event.overlay) {
          const name = event.overlay.name || '';
          if (name === 'text-box' || name === 'text-annotation' || name === 'simpleAnnotation') {
            window.dispatchEvent(new CustomEvent('close-text-settings', {
              detail: { overlayId: event.overlay.id }
            }));
          } else if (name === 'pin' || name === 'flag-mark' || name === 'flag') {
            window.dispatchEvent(new CustomEvent('close-pin-flag-settings', {
              detail: { overlayId: event.overlay.id }
            }));
          } else if (
            name.startsWith('fib') ||
            name === 'fibonacciLine' ||
            name.includes('pitchfork') ||
            name === 'andrews' ||
            name === 'schiff' ||
            name === 'modifiedSchiff' ||
            name === 'inside' ||
            name === 'pitchfan' ||
            name === 'pitchFan' ||
            name === 'speedFan' ||
            name === 'timeZone' ||
            name === 'timeExtension' ||
            name === 'fibChannel' ||
            name === 'fibCircles' ||
            name === 'fibArcs' ||
            name === 'fibWedge' ||
            name === 'fibSpiral' ||
            name === 'parallelStraightLine'
          ) {
            window.dispatchEvent(new CustomEvent('close-fib-settings', {
              detail: { overlayId: event.overlay.id }
            }));
          } else if (name === 'short-position' || name === 'long-position') {
            window.dispatchEvent(new CustomEvent('close-position-settings', {
              detail: { overlayId: event.overlay.id }
            }));
          } else if (name === 'table') {
            window.dispatchEvent(new CustomEvent('close-table-toolbar', {
              detail: { overlayId: event.overlay.id }
            }));
          }
          window.dispatchEvent(new CustomEvent('close-drawing-toolbar', {
            detail: { overlayId: event.overlay.id }
          }));
        }
      } catch (e) { }
      return false;
    },
    onMouseEnter: (_event: any) => {
      try {
        const charts = Array.from((window as any).globalCoreCharts || []);
        charts.forEach((chart: any) => {
          if (typeof chart.updatePane === 'function') {
            chart.updatePane(1);
          }
        });
      } catch (e) { }
      return false;
    },
    onMouseLeave: (_event: any) => {
      try {
        const charts = Array.from((window as any).globalCoreCharts || []);
        charts.forEach((chart: any) => {
          if (typeof chart.updatePane === 'function') {
            chart.updatePane(1);
          }
        });
      } catch (e) { }
      return false;
    },
    createYAxisFigures: showScaleValue ? (params: OverlayCreateFiguresCallbackParams<any>) => {
      const { coordinates, bounding, overlay, yAxis, chart } = params;
      if (overlay.visible === false) {
        return [];
      }
      const isAlwaysShowY = def.type === 'horizontal-line' ||
                            def.type === 'horizontal-ray' ||
                            def.type === 'cross-line' ||
                            overlay.name === 'horizontal-line' ||
                            overlay.name === 'horizontal-ray' ||
                            overlay.name === 'cross-line';
      const { isSelected, isDrawing } = getOverlayState(overlay);
      if (!isAlwaysShowY && !isSelected && !isDrawing) {
        return [];
      }
      let pricePrecision = 2;
      try {
        const symbolInfo = chart?.getSymbol?.();
        if (symbolInfo && typeof symbolInfo.pricePrecision === 'number') {
          pricePrecision = symbolInfo.pricePrecision;
        } else if (params && (params as any).precision && typeof (params as any).precision.price === 'number') {
          pricePrecision = (params as any).precision.price;
        } else if (typeof window !== 'undefined' && typeof (window as any).__active_price_precision__ === 'number') {
          pricePrecision = (window as any).__active_price_precision__;
        } else if (chart) {
          const dataList = typeof chart.getDataList === 'function' ? chart.getDataList() : [];
          if (dataList.length > 0) {
            const lastPrice = Number(dataList[dataList.length - 1].close);
            const str = String(lastPrice);
            const dotIdx = str.indexOf('.');
            pricePrecision = dotIdx !== -1 ? str.length - dotIdx - 1 : 2;
          }
        }
      } catch (e) {}

      if (typeof window !== 'undefined') {
        (window as any).__active_price_precision__ = pricePrecision;
      }

      let thousandsSeparator = ',';
      let decimalFoldThreshold = 3;

      if (params) {
        if (typeof (params as any).thousandsSeparator === 'string') {
          thousandsSeparator = (params as any).thousandsSeparator;
        }
        if (typeof (params as any).decimalFoldThreshold === 'number') {
          decimalFoldThreshold = (params as any).decimalFoldThreshold;
        }
      }

      if (chart && typeof chart.getStyles === 'function') {
        try {
          const chartStyles = chart.getStyles() as any;
          if (chartStyles) {
            if (typeof chartStyles.thousandsSeparator === 'string') {
              thousandsSeparator = chartStyles.thousandsSeparator;
            }
            if (typeof chartStyles.decimalFoldThreshold === 'number') {
              decimalFoldThreshold = chartStyles.decimalFoldThreshold;
            }
          }
        } catch (e) { }
      }

      if (typeof window !== 'undefined') {
        (window as any).__thousands_separator__ = thousandsSeparator;
        (window as any).__decimal_fold_threshold__ = decimalFoldThreshold;
      }

      const formatPrice = (val: number) => {
        // Apply currency conversion if active
        const convRate = (typeof window !== 'undefined' && (window as any).__currency_conversion_rate__) || 1;
        if (convRate !== 1) val = val * convRate;

        const absVal = Math.abs(val);

        // Large value abbreviation (market cap, volume, etc.)
        if (absVal >= 1_000_000_000_000) return (val / 1_000_000_000_000).toFixed(2) + 'T';
        if (absVal >= 1_000_000_000) return (val / 1_000_000_000).toFixed(2) + 'B';
        if (absVal >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M';

        let effectivePrecision = pricePrecision;
        if (convRate !== 1) {
          if (absVal >= 1000) effectivePrecision = Math.min(pricePrecision, 2);
          else if (absVal >= 1) effectivePrecision = Math.min(pricePrecision, 4);
          else if (absVal >= 0.001) effectivePrecision = Math.max(pricePrecision, 6);
          else effectivePrecision = Math.max(pricePrecision, 8);
        }

        let str = val.toFixed(effectivePrecision);
        if (thousandsSeparator) {
          const parts = str.split('.');
          parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
          str = parts.join('.');
        }
        if (decimalFoldThreshold > 0) {
          const reg = new RegExp('\\.0{' + decimalFoldThreshold + ',}[1-9][0-9]*$');
          if (reg.test(str)) {
            const result = str.split('.');
            const v = result[result.length - 1];
            const match = v.match(/0*/);
            if (match) {
              const count = match[0].length;
              result[result.length - 1] = v.replace(/0*/, `0{${count}}`);
              str = result.join('.');
            }
          }
        }
        return str;
      };

      const isHorizontalLine = def.type === 'horizontal-line' || overlay.name === 'horizontal-line' || overlay.name === 'horizontalStraightLine';
      const isHorizontalRay = def.type === 'horizontal-ray' || overlay.name === 'horizontal-ray' || overlay.name === 'horizontalRayLine';
      const isCrossLine = def.type === 'cross-line' || overlay.name === 'cross-line';
      const isLongPos = def.type?.includes('long') || overlay.name?.toLowerCase().includes('long');
      const isShortPos = def.type?.includes('short') || overlay.name?.toLowerCase().includes('short');

      if (isLongPos || isShortPos) {
        const showPriceLabels = (overlay as any)._positionOptions?.showPriceLabels ?? overlay.extendData?.showPriceLabels ?? true;
        if (!showPriceLabels) return [];

        const labelHeight = 18;
        const figures = coordinates
          .flatMap((coordinate: any, index: number) => {
            if (index > 2) return [];
            const value = overlay.points[index]?.value;
            if (typeof value !== 'number' || coordinate.y === undefined) return [];
            const textVal = formatPrice(value);
            // Hardcoded label colors: green (take profit), grey (entry), red (stop loss)
            let labelBgColor = '#787b86'; // grey - entry (index 0)
            if (index === 1) {
              labelBgColor = '#ef5350'; // red - stop loss (index 1)
            } else if (index === 2) {
              labelBgColor = '#26a69a'; // green - take profit (index 2)
            }

            const rectY = coordinate.y - labelHeight / 2;

            return [
              {
                key: `price-bg-${index}`,
                type: 'rect',
                attrs: {
                  x: 0,
                  y: rectY,
                  width: bounding.width,
                  height: labelHeight
                },
                styles: {
                  style: 'fill',
                  color: labelBgColor
                },
                ignoreEvent: true
              },
              {
                key: `price-text-${index}`,
                type: 'text',
                attrs: {
                  x: bounding.width / 2,
                  y: coordinate.y,
                  text: textVal,
                  align: 'center',
                  baseline: 'middle'
                },
                styles: {
                  color: '#ffffff',
                  family: "'Rubik', sans-serif",
                  backgroundColor: 'transparent',
                  borderColor: 'transparent',
                  borderSize: 0
                },
                ignoreEvent: true
              }
            ];
          });
        return figures as any;
      }

      if (isHorizontalLine || isHorizontalRay || isCrossLine) {
        const labelHeight = 18;
        const figures = coordinates
          .flatMap((coordinate: any, index: number) => {
            const value = overlay.points[index]?.value;
            if (typeof value !== 'number' || coordinate.y === undefined) return [];
            const textVal = formatPrice(value);

            // Retrieve line color from overlay styles, default styles, or fallback to blue
            let labelBgColor = '#2962ff';
            const defaultStyles = (params as any).defaultStyles;
            let tempColor = '';
            if (overlay.styles && (overlay.styles as any).line && (overlay.styles as any).line.color) {
              tempColor = (overlay.styles as any).line.color;
            } else if (defaultStyles && (defaultStyles as any).line && (defaultStyles as any).line.color) {
              tempColor = (defaultStyles as any).line.color;
            }
            if (tempColor && !isColorTransparent(tempColor)) {
              labelBgColor = tempColor;
            }

            const rectY = coordinate.y - labelHeight / 2;

            return [
              {
                key: `price-bg-${index}`,
                type: 'rect',
                attrs: {
                  x: 0,
                  y: rectY,
                  width: bounding.width,
                  height: labelHeight
                },
                styles: {
                  style: 'fill',
                  color: labelBgColor
                },
                ignoreEvent: true
              },
              {
                key: `price-text-${index}`,
                type: 'text',
                attrs: {
                  x: bounding.width / 2,
                  y: coordinate.y,
                  text: textVal,
                  align: 'center',
                  baseline: 'middle'
                },
                styles: {
                  color: '#ffffff',
                  family: "'Rubik', sans-serif",
                  backgroundColor: 'transparent',
                  borderColor: 'transparent',
                  borderSize: 0
                },
                ignoreEvent: true
              }
            ];
          })
          .filter(Boolean) as any[];

        return figures as any;
      }

      const figures: any[] = [];

      // For two-point tools (or tools with >= 2 coordinates), add a gradient-filled rect between the y-axis labels
      if (coordinates.length >= 2) {
        const ys = coordinates.map((c: any) => c?.y).filter((y: any) => y !== undefined && !isNaN(y));
        if (ys.length >= 2) {
          const topY = Math.min(...ys);
          const bottomY = Math.max(...ys);
          const shadeColor = getOverlayShadeColor(overlay);
          if (bottomY - topY > 0) {
            figures.push({
              key: 'price-gradient-rect',
              type: 'rect',
              attrs: {
                x: 0,
                y: topY,
                width: bounding.width,
                height: bottomY - topY
              },
              styles: {
                style: 'fill',
                color: shadeColor,
                borderSize: 0,
                borderColor: 'transparent'
              },
              ignoreEvent: true
            });
          }
        }
      }

      // Fixed default label color for generic tools (does not change when line color changes)
      const labelBgColor = '#2962ff';

      const labelHeight = 18;
      coordinates.forEach((coordinate: any, index: number) => {
        const value = overlay.points[index]?.value;
        if (typeof value !== 'number' || coordinate.y === undefined || isNaN(coordinate.y)) return;
        const rectY = coordinate.y - labelHeight / 2;

        figures.push({
          key: `price-bg-${index}`,
          type: 'rect',
          attrs: {
            x: 0,
            y: rectY,
            width: bounding.width,
            height: labelHeight
          },
          styles: {
            style: 'fill',
            color: labelBgColor
          },
          ignoreEvent: true
        });

        figures.push({
          key: `price-${index}`,
          type: 'text',
          attrs: {
            x: bounding.width / 2,
            y: coordinate.y,
            text: formatPrice(value),
            align: 'center',
            baseline: 'middle'
          },
          styles: {
            color: '#ffffff',
            family: "'Rubik', sans-serif",
            backgroundColor: 'transparent',
            borderColor: 'transparent',
            borderSize: 0
          },
          ignoreEvent: true
        });
      });

      return figures as any;
    } : undefined,
    createXAxisFigures: showDateOnScale ? (params: OverlayCreateFiguresCallbackParams<any>) => {
      const { coordinates, overlay, bounding, xAxis: xAxisParam } = params;
      const isSpecialColorTool =
        def.type === 'vertical-line' || overlay.name === 'vertical-line' || overlay.name === 'verticalStraightLine' ||
        def.type === 'cross-line' || overlay.name === 'cross-line' ||
        def.type === 'horizontal-line' || overlay.name === 'horizontal-line' || overlay.name === 'horizontalStraightLine' ||
        def.type === 'horizontal-ray' || overlay.name === 'horizontal-ray' || overlay.name === 'horizontalRayLine';

      const isAlwaysShowX = isSpecialColorTool;
      const { isSelected, isDrawing } = getOverlayState(overlay);
      if (!isAlwaysShowX && !isSelected && !isDrawing) {
        return [];
      }
      const figures: any[] = [];
      if (!coordinates || !overlay || !overlay.points) return figures as any;

      // For two-point tools, add a gradient-filled rect between the labels
      if (coordinates.length >= 2) {
        const xs = coordinates.map((c: any) => c?.x).filter((x: any) => x !== undefined && !isNaN(x));
        if (xs.length >= 2) {
          const leftX = Math.min(...xs);
          const rightX = Math.max(...xs);
          const shadeColor = getOverlayShadeColor(overlay);
          const rectHeight = (bounding as any)?.height || 24;
          if (rightX - leftX > 0) {
            figures.push({
              key: 'time-gradient-rect',
              type: 'rect',
              attrs: {
                x: leftX,
                y: 0,
                width: rightX - leftX,
                height: rectHeight
              },
              styles: {
                style: 'fill',
                color: shadeColor,
                borderSize: 0,
                borderColor: 'transparent'
              },
              ignoreEvent: true
            });
          }
        }
      }

      // Dynamic label background color for vertical-line, cross-line, horizontal-line, horizontal-ray
      let labelBgColor = '#2962ff';
      if (isSpecialColorTool) {
        let tempColor = '';
        if (overlay.styles && (overlay.styles as any).line && (overlay.styles as any).line.color) {
          tempColor = (overlay.styles as any).line.color;
        } else if (overlay.extendData && overlay.extendData.lineColor) {
          tempColor = overlay.extendData.lineColor;
        } else if (overlay.styles && (overlay.styles as any).color) {
          tempColor = (overlay.styles as any).color;
        }
        if (tempColor && !isColorTransparent(tempColor)) {
          labelBgColor = tempColor;
        }
      }

      const isLongPos = def.type === 'long-position' || 
                        overlay.name === 'long-position' || 
                        overlay.name?.toLowerCase().includes('longposition') || 
                        overlay.name?.toLowerCase().includes('long-position');
      const isShortPos = def.type === 'short-position' || 
                         overlay.name === 'short-position' || 
                         overlay.name?.toLowerCase().includes('shortposition') || 
                         overlay.name?.toLowerCase().includes('short-position');

      const axisHeight = (bounding as any)?.height || 22;
      const labelHeight = Math.min(18, axisHeight);
      const rectY = Math.max(0, (axisHeight - labelHeight) / 2);

      // Add text labels and colored background rects using the settings-aware formatCustomDateStamp
      coordinates.forEach((coordinate: any, index: number) => {
        if ((isLongPos || isShortPos) && (index === 1 || index === 2)) return;
        if (!coordinate || coordinate.x === undefined || isNaN(coordinate.x)) return;

        const pt = overlay.points[index];
        if (!pt) return;

        let timestamp = pt.timestamp;
        if (typeof timestamp !== 'number' || isNaN(timestamp) || timestamp === 0) {
          if (Number.isFinite(pt.dataIndex)) {
            const chart = (globalThis as any).__active_chart_instance__;
            const chartStore = chart?._chartStore || chart?.chartStore;
            timestamp = chartStore?.dataIndexToTimestamp?.(pt.dataIndex);
          }
        }
        if (typeof timestamp !== 'number' || isNaN(timestamp) || timestamp === 0) {
          if (xAxisParam) {
            timestamp = pixelXToDataIndexAndTimestamp(coordinate.x, xAxisParam).timestamp;
          }
        }

        if (typeof timestamp !== 'number' || isNaN(timestamp) || timestamp === 0) return;

        const dateText = formatCustomDateStamp(timestamp);
        const badgeWidth = Math.max(68, dateText.length * 7.2 + 12);
        const rectX = coordinate.x - badgeWidth / 2;

        figures.push({
          key: `time-bg-${index}`,
          type: 'rect',
          attrs: {
            x: rectX,
            y: rectY,
            width: badgeWidth,
            height: labelHeight
          },
          styles: {
            style: 'fill',
            color: labelBgColor
          },
          ignoreEvent: true
        });

        figures.push({
          key: `time-text-${index}`,
          type: 'text',
          attrs: {
            x: coordinate.x,
            y: rectY + labelHeight / 2,
            text: dateText,
            align: 'center',
            baseline: 'middle'
          },
          styles: {
            color: '#ffffff',
            family: "'Rubik', sans-serif",
            backgroundColor: 'transparent',
            borderColor: 'transparent',
            borderSize: 0
          },
          ignoreEvent: true
        });
      });

      return figures as any;
    } : undefined,
    onDrawing: ((event: any) => {
      if (def.type === 'polyline') {
        const overlay = event.overlay;
        const points = overlay?.points;
        if (points && points.length >= 3 && typeof event.x === 'number' && typeof event.y === 'number') {
          const chart = (globalThis as any).__active_chart_instance__;
          const axes = overlayAxesMap.get(overlay.id);
          const xAxis = axes?.xAxis;
          const yAxis = axes?.yAxis;
          if (chart && xAxis && yAxis) {
            let p0x: number | null = null;
            let p0y: number | null = null;
            try {
              const p0Pixel = typeof chart.convertToPixel === 'function' ? chart.convertToPixel(points[0]) : null;
              if (p0Pixel && typeof p0Pixel.x === 'number' && typeof p0Pixel.y === 'number') {
                p0x = p0Pixel.x;
                p0y = p0Pixel.y;
              }
            } catch (e) {}

            if (p0x === null || p0y === null) {
              p0x = dataIndexToPixelX(Number(points[0].dataIndex ?? 0), xAxis);
              p0y = yAxis.convertToPixel(Number(points[0].value ?? 0));
            }

            const lastIndex = points.length - 1;
            if (typeof p0x === 'number' && typeof p0y === 'number') {
              const dist = Math.hypot(event.x - p0x, event.y - p0y);
              if (dist <= 35) {
                points[lastIndex] = {
                  dataIndex: points[0].dataIndex,
                  timestamp: points[0].timestamp,
                  value: points[0].value
                };
                (overlay as any).__nearFirstPoint = true;
                return true;
              }
            }

            (overlay as any).__nearFirstPoint = false;
            const converted = typeof chart.convertFromPixel === 'function' ? chart.convertFromPixel(
              [{ x: event.x, y: event.y }],
              { paneId: 'candle_pane' }
            )?.[0] : null;
            const draggedPrice = yAxis ? yAxis.convertFromPixel(event.y) : converted?.value;
            const { dataIndex, timestamp } = pixelXToDataIndexAndTimestamp(event.x, xAxis);
            if (draggedPrice !== null && Number.isFinite(Number(draggedPrice))) {
              points[lastIndex] = {
                ...points[lastIndex],
                dataIndex: Number.isFinite(dataIndex) ? dataIndex : points[lastIndex].dataIndex,
                timestamp: timestamp || points[lastIndex].timestamp,
                value: Number(draggedPrice)
              };
            }
          }
        }
      } else if (def.type === 'regression-trend') {
        const points = event.overlay?.points;
        if (points && points.length >= 2 && typeof event.x === 'number' && typeof event.y === 'number') {
          const chart = (globalThis as any).__active_chart_instance__;
          const axes = overlayAxesMap.get(event.overlay.id);
          const xAxis = axes?.xAxis;
          const yAxis = axes?.yAxis;
          const converted = chart && typeof chart.convertFromPixel === 'function' ? chart.convertFromPixel(
            [{ x: event.x, y: event.y }],
            { paneId: 'candle_pane' }
          )?.[0] : null;
          const draggedPrice = yAxis ? yAxis.convertFromPixel(event.y) : converted?.value;
          const { dataIndex, timestamp } = xAxis ? pixelXToDataIndexAndTimestamp(event.x, xAxis) : { dataIndex: Number(converted?.dataIndex ?? 0), timestamp: Number(converted?.timestamp ?? 0) };
          const lastIndex = points.length - 1;
          if (draggedPrice !== null && Number.isFinite(Number(draggedPrice))) {
            points[lastIndex] = {
              ...points[lastIndex],
              dataIndex: Number.isFinite(dataIndex) ? dataIndex : points[lastIndex].dataIndex,
              timestamp: timestamp || points[lastIndex].timestamp,
              value: Number(draggedPrice)
            };
          }
        }
      } else if (def.type === 'parallel-channel') {
        const points = event.overlay?.points;
        if (points) {
          if (points.length < 6 && typeof event.x === 'number' && typeof event.y === 'number') {
            const chart = (globalThis as any).__active_chart_instance__;
            const axes = overlayAxesMap.get(event.overlay.id);
            const xAxis = axes?.xAxis;
            const yAxis = axes?.yAxis;
            const converted = chart && typeof chart.convertFromPixel === 'function' ? chart.convertFromPixel(
              [{ x: event.x, y: event.y }],
              { paneId: 'candle_pane' }
            )?.[0] : null;
            const draggedPrice = yAxis ? yAxis.convertFromPixel(event.y) : converted?.value;
            const { dataIndex, timestamp } = xAxis ? pixelXToDataIndexAndTimestamp(event.x, xAxis) : { dataIndex: Number(converted?.dataIndex ?? 0), timestamp: Number(converted?.timestamp ?? 0) };
            const lastIndex = points.length - 1;
            if (lastIndex >= 0 && draggedPrice !== null && Number.isFinite(Number(draggedPrice))) {
              points[lastIndex] = {
                ...points[lastIndex],
                dataIndex: Number.isFinite(dataIndex) ? dataIndex : points[lastIndex].dataIndex,
                timestamp: timestamp || points[lastIndex].timestamp,
                value: Number(draggedPrice)
              };
            }
          } else if (points.length >= 6 && (event.overlay as any).__parallelCompleted !== true) {
            const first = points[0];
            const second = points[1];
            const center = points[2];
            const prevPoints = (event.overlay as any).__prevPoints;
            let draggedIndex = -1;
            if (prevPoints && prevPoints.length === points.length) {
              for (let i = 0; i < points.length; i++) {
                if (points[i].value !== prevPoints[i].value ||
                  points[i].dataIndex !== prevPoints[i].dataIndex ||
                  points[i].timestamp !== prevPoints[i].timestamp) {
                  draggedIndex = i;
                  break;
                }
              }
            }

            let height = 0;
            const baselineMidValue = (Number(first.value ?? 0) + Number(second.value ?? 0)) / 2;

            if (draggedIndex === 5 && prevPoints) {
              const dp = Number(points[5].value ?? 0) - Number(prevPoints[5].value ?? 0);
              first.value = Number(first.value ?? 0) + dp;
              second.value = Number(second.value ?? 0) + dp;
              const newBaselineMid = (Number(first.value ?? 0) + Number(second.value ?? 0)) / 2;
              height = Number(center.value ?? newBaselineMid) - newBaselineMid;
            } else if ((draggedIndex === 0 || draggedIndex === 1) && prevPoints) {
              const prevMid = (Number(prevPoints[0].value ?? 0) + Number(prevPoints[1].value ?? 0)) / 2;
              height = Number(prevPoints[2].value ?? prevMid) - prevMid;
            } else if (draggedIndex === 3) {
              height = Number(points[3].value ?? 0) - Number(first.value ?? 0);
              center.value = baselineMidValue + height;
            } else if (draggedIndex === 4) {
              height = Number(points[4].value ?? 0) - Number(second.value ?? 0);
              center.value = baselineMidValue + height;
            } else {
              height = Number(center.value ?? baselineMidValue) - baselineMidValue;
            }

            const midpointIndex = Math.round((Number(first.dataIndex ?? 0) + Number(second.dataIndex ?? 0)) / 2);
            center.dataIndex = midpointIndex;
            if (typeof first.timestamp === 'number' && typeof second.timestamp === 'number') {
              center.timestamp = (first.timestamp + second.timestamp) / 2;
            }

            const baselineMidValueFinal = (Number(first.value ?? 0) + Number(second.value ?? 0)) / 2;
            const parallelStart = { ...first, value: Number(first.value ?? 0) + height };
            const parallelEnd = { ...second, value: Number(second.value ?? 0) + height };
            const baselineCenter = { ...center, value: baselineMidValueFinal };

            points[3] = parallelStart;
            points[4] = parallelEnd;
            points[5] = baselineCenter;

            (event.overlay as any).__prevPoints = points.map((p: any) => ({
              dataIndex: p.dataIndex,
              timestamp: p.timestamp,
              value: p.value
            }));
          }
        }
      }

      try {
        const isDrawing = typeof event?.overlay?.isDrawing === 'function' ? event.overlay.isDrawing() : true;
        if (isDrawing && event && event.overlay && event.overlay.points && event.overlay.points.length > 0) {
          const axes = overlayAxesMap.get(event.overlay.id);
          const xAxis = axes?.xAxis;
          const yAxis = axes?.yAxis;
          const chart = (globalThis as any).__active_chart_instance__;
          if (xAxis && yAxis && typeof event.x === 'number' && typeof event.y === 'number') {
            const snapped = applyMagnetSnap(event.x, event.y, xAxis, yAxis, chart);
            if (snapped && Number.isFinite(snapped.value) && Number.isFinite(snapped.dataIndex)) {
              const lastIdx = event.overlay.points.length - 1;
              event.overlay.points[lastIdx].dataIndex = snapped.dataIndex;
              event.overlay.points[lastIdx].timestamp = snapped.timestamp;
              event.overlay.points[lastIdx].value = snapped.value;
              // Sync crosshair center to the anchor point position
              try {
                const crossX = typeof snapped.snappedX === 'number' ? snapped.snappedX : event.x;
                const crossY = typeof snapped.snappedY === 'number' ? snapped.snappedY : event.y;
                chart?._chartStore?.setCrosshair?.({ x: crossX, y: crossY, paneId: 'candle_pane' }, { forceInvalidate: true });
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
      return false;
    }) as any,
    onDrawEnd: ((event: any) => {
      let result = false;
      if (def.type === 'parallel-channel') {
        const points = event.overlay.points;
        if (points && points.length >= 3) {
          const first = points[0];
          const second = points[1];
          const center = points[2];

          const x0 = Number(first.dataIndex ?? 0);
          const x1 = Number(second.dataIndex ?? 0);
          const xCenter = Number(center.dataIndex ?? x0);

          let baselineValAtX = Number(first.value ?? 0);
          if (x1 !== x0) {
            baselineValAtX = Number(first.value ?? 0) + (Number(second.value ?? 0) - Number(first.value ?? 0)) * (xCenter - x0) / (x1 - x0);
          }

          const height = Number(center.value ?? baselineValAtX) - baselineValAtX;

          const midpointIndex = (x0 + x1) / 2;
          const midpointTime = (Number(first.timestamp ?? 0) + Number(second.timestamp ?? 0)) / 2;

          center.dataIndex = Math.round(midpointIndex);
          center.timestamp = midpointTime;

          const baselineMidValue = (Number(first.value ?? 0) + Number(second.value ?? 0)) / 2;
          center.value = baselineMidValue + height;

          const parallelStart = { ...first, value: Number(first.value ?? 0) + height };
          const parallelEnd = { ...second, value: Number(second.value ?? 0) + height };
          const baselineCenter = { ...center, value: baselineMidValue };

          event.overlay.points = [
            first,
            second,
            center,
            parallelStart,
            parallelEnd,
            baselineCenter
          ];

          (event.overlay as any).__prevPoints = event.overlay.points.map((p: any) => ({
            dataIndex: p.dataIndex,
            timestamp: p.timestamp,
            value: p.value
          }));
          (event.overlay as any).__parallelCompleted = true;
        }
      } else if (def.type === 'fib-channel') {
        const points = event.overlay.points;
        if (points && points.length >= 3) {
          const axes = overlayAxesMap.get(event.overlay.id);
          const xAxis = axes?.xAxis;
          const yAxis = axes?.yAxis;
          if (xAxis && yAxis) {
            const p1X = xAxis.convertToPixel(Number(points[0].dataIndex ?? 0));
            const p1Y = yAxis.convertToPixel(Number(points[0].value ?? 0));
            const p2X = xAxis.convertToPixel(Number(points[1].dataIndex ?? 0));
            const p2Y = yAxis.convertToPixel(Number(points[1].value ?? 0));
            const p3X = xAxis.convertToPixel(Number(points[2].dataIndex ?? 0));
            const p3Y = yAxis.convertToPixel(Number(points[2].value ?? 0));

            if (p1X != null && p1Y != null && p2X != null && p2Y != null && p3X != null && p3Y != null) {
              const dx = p2X - p1X;
              const dy = p2Y - p1Y;
              const len = Math.hypot(dx, dy);
              if (len > 0) {
                const nx = -dy / len;
                const ny = dx / len;
                const vx = p3X - p1X;
                const vy = p3Y - p1Y;
                const dist = vx * nx + vy * ny;
                const p1Parallel = { x: p1X + nx * dist, y: p1Y + ny * dist };
                const lenSq = dx * dx + dy * dy;
                const u = Math.max(0, Math.min(1, (vx * dx + vy * dy) / lenSq));
                const attachedX = p1Parallel.x + u * dx;
                const attachedY = p1Parallel.y + u * dy;

                const { dataIndex, timestamp } = pixelXToDataIndexAndTimestamp(attachedX, xAxis);
                const price = yAxis.convertFromPixel(attachedY);

                points[2].dataIndex = dataIndex;
                if (timestamp) points[2].timestamp = timestamp;
                if (price !== null && Number.isFinite(price)) {
                  points[2].value = price;
                }
              }
            }
          }

          (event.overlay as any).__prevPoints = event.overlay.points.map((p: any) => ({
            dataIndex: p.dataIndex,
            timestamp: p.timestamp,
            value: p.value
          }));
        }
      } else if (def.type === 'disjoint-channel') {
        const points = event.overlay.points;
        if (points && points.length >= 3) {
          const first = points[0];
          const second = points[1];
          const center = points[2];

          const line2Start = {
            ...first,
            dataIndex: first.dataIndex,
            timestamp: first.timestamp,
            value: Number(center.value ?? 0) + (Number(second.value ?? 0) - Number(first.value ?? 0))
          };
          const line2End = {
            ...second,
            dataIndex: second.dataIndex,
            timestamp: second.timestamp,
            value: center.value
          };

          event.overlay.points = [
            first,
            second,
            line2Start,
            line2End
          ];

          event.overlay.forceComplete();
        }
      } else if (def.type === 'double-curve') {
        const points = event.overlay.points;
        if (points && points.length === 2) {
          const first = points[0];
          const second = points[1];
          const t0 = Number(first.timestamp ?? 0);
          const t1 = Number(second.timestamp ?? 0);
          const idx0 = Number(first.dataIndex ?? 0);
          const idx1 = Number(second.dataIndex ?? 0);
          const v0 = Number(first.value ?? 0);
          const v1 = Number(second.value ?? 0);
          const dy = v1 - v0;

          const through1 = {
            dataIndex: Math.round(idx0 + (idx1 - idx0) / 3),
            timestamp: Math.round(t0 + (t1 - t0) / 3),
            value: v0 + dy / 3 + dy * 0.25
          };
          const through2 = {
            dataIndex: Math.round(idx0 + 2 * (idx1 - idx0) / 3),
            timestamp: Math.round(t0 + 2 * (t1 - t0) / 3),
            value: v0 + 2 * dy / 3 - dy * 0.25
          };

          event.overlay.points = [first, second, through1, through2];
        }
      } else if (def.type === 'signpost' || def.type === 'flag-mark') {
        // Snap stored point to the nearest candle center
        if (event.overlay.points && event.overlay.points[0]) {
          const pt = event.overlay.points[0];
          const floatIdx = Number(pt.dataIndex ?? 0);
          const dataIndex = Math.round(floatIdx);
          pt.dataIndex = dataIndex;
          const chart = (globalThis as any).__active_chart_instance__;
          const dataList = chart && typeof chart.getDataList === 'function' ? chart.getDataList() : [];
          if (dataList[dataIndex]) {
            pt.timestamp = Number(dataList[dataIndex].timestamp);
          }
        }
      } else if (def.type === 'long-position' || def.type === 'short-position') {
        setupPositionPoints(event.overlay, def.type);
      } else if (def.type === 'flat-top-bottom') {
        const points = event.overlay.points;
        if (points && points.length >= 3) {
          const first = points[0];
          const second = points[1];
          const flatLevel = points[2];
          const flatPrice = Number(flatLevel.value ?? 0);

          const flatStart = {
            ...first,
            dataIndex: first.dataIndex,
            timestamp: first.timestamp,
            value: flatPrice
          };
          const flatEnd = {
            ...second,
            dataIndex: second.dataIndex,
            timestamp: second.timestamp,
            value: flatPrice
          };

          event.overlay.points = [
            first,
            second,
            flatStart,
            flatEnd
          ];

          (event.overlay as any).__prevPoints = event.overlay.points.map((p: any) => ({
            dataIndex: p.dataIndex,
            timestamp: p.timestamp,
            value: p.value
          }));

          event.overlay.forceComplete();
        }
      } else if (def.type === 'regression-trend') {
        (event.overlay as any).__regressionCompleted = true;
        (event.overlay as any).__regressionEditing = false;
        regressionEditingStates.delete(event.overlay.id);
        regressionMoveSnapshots.delete(event.overlay.id);
      }

      if (def.type === 'measure') {
        (event.overlay as any).__isMeasureAutoDelete = true;
        (event.overlay as any).__drawEndTimestamp = Date.now();
        registerAutoDeleteMeasureOverlay(event.overlay.id);
      }

      if (def.type === 'zoomInBox' || def.type === 'zoom-in-box') {
        performZoomInBox(event.overlay);
      }

      window.dispatchEvent(new CustomEvent('tickerpen-draw-end', { detail: event }));

      if (event.overlay) {
        dispatchOverlaySettings(event.overlay);
      }

      if (typeof window !== 'undefined' && (window as any).__isStayInDrawingMode) {
        const chart = (globalThis as any).__active_chart_instance__;
        if (chart && typeof chart.createOverlay === 'function' && event.overlay && event.overlay.name) {
          setTimeout(() => {
            chart.createOverlay({ name: event.overlay.name });
          }, 50);
        }
      }

      return result;
    }) as any,
    onPressedMoveStart: (event: any) => {
      let dragIdx = -1;
      const key = String(event.figure?.key || event.figureKey || '');
      if (key.includes('-anchor-') || key.includes('-corner-')) {
        const parts = key.split('-');
        dragIdx = Number(parts[parts.length - 1]);
      }
      if (dragIdx < 0 && typeof event.pointIndex === 'number' && event.pointIndex >= 0) {
        dragIdx = event.pointIndex;
      }
      if (dragIdx < 0 && typeof event.x === 'number' && typeof event.y === 'number' && event.overlay?.points) {
        const axes = overlayAxesMap.get(event.overlay.id);
        const xAxis = axes?.xAxis;
        const yAxis = axes?.yAxis;
        let nearest = 25;
        event.overlay.points.forEach((pt: any, idx: number) => {
          if (!pt) return;
          const px = xAxis?.convertToPixel(Number(pt.dataIndex ?? pt.timestamp ?? 0));
          const py = yAxis?.convertToPixel(Number(pt.value ?? 0));
          if (px != null && py != null) {
            const dist = Math.hypot(event.x - px, event.y - py);
            if (dist < nearest) {
              nearest = dist;
              dragIdx = idx;
            }
          }
        });
      }
      if (dragIdx >= 0) {
        setGlobalActiveDragAnchor(dragIdx, event.overlay.id);
        (event.overlay as any).__activeDragAnchorIndex = dragIdx;
      }

      if (def.type === 'regression-trend') {
        regressionEditingStates.set(event.overlay.id, true);
        (event.overlay as any).__regressionEditing = true;
        const snapshotPoints = event.overlay.points.map((point: any) => ({ ...point }));
        regressionMoveSnapshots.set(event.overlay.id, snapshotPoints);
        (event.overlay as any).__regressionMoveSnapshot = snapshotPoints;

        let rDragIdx = dragIdx;
        if (rDragIdx < 0 && key.includes('regression-anchor-')) {
          const parts = key.split('-');
          rDragIdx = Number(parts[parts.length - 1]);
        }
        if (rDragIdx < 0) {
          let nearest = Number.POSITIVE_INFINITY;
          const endpoints = regressionEndpoints.get(event.overlay.id);
          const bFirst = endpoints?.baseFirst || (event.overlay as any).__baseFirst;
          const bSecond = endpoints?.baseSecond || (event.overlay as any).__baseSecond;
          if (bFirst && bSecond && typeof event.x === 'number' && typeof event.y === 'number') {
            [bFirst, bSecond].forEach((coord: any, index: number) => {
              const distance = Math.hypot(event.x - coord.x, event.y - coord.y);
              if (distance < nearest) {
                nearest = distance;
                rDragIdx = index;
              }
            });
          }
          if (!Number.isFinite(nearest)) rDragIdx = -1;
        }
        if (rDragIdx < 0 && typeof event.x === 'number' && typeof event.y === 'number') {
          let nearest = Number.POSITIVE_INFINITY;
          const axes = overlayAxesMap.get(event.overlay.id);
          const xAxis = axes?.xAxis;
          const yAxis = axes?.yAxis;
          for (let index = 0; index < 2; index++) {
            const x = Number(xAxis?.convertToPixel(Number(event.overlay.points[index]?.dataIndex ?? 0)));
            const y = Number(yAxis?.convertToPixel(Number(event.overlay.points[index]?.value ?? 0)));
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const distance = Math.hypot(event.x - x, event.y - y);
            if (distance < nearest) {
              nearest = distance;
              rDragIdx = index;
            }
          }
          if (!Number.isFinite(nearest)) rDragIdx = -1;
        }
        regressionDragIndices.set(event.overlay.id, rDragIdx);
        (event.overlay as any).__draggedAnchorIndex = rDragIdx;
      }
      const snapshot = event.overlay.points.map((point: any) => ({ ...point }));
      event.overlay.points.__parallelMoveSnapshot = snapshot;
      (event.overlay as any).__moveSnapshot = snapshot;
      (event.overlay as any).__prevPoints = snapshot.map((p: any) => ({
        dataIndex: p.dataIndex,
        timestamp: p.timestamp,
        value: p.value
      }));
      if (typeof event.x === 'number' && typeof event.y === 'number') {
        (event.overlay as any).__moveStartMouse = { x: event.x, y: event.y };
      }
      if (def.type === 'long-position' || def.type === 'short-position') {
        (window as any).__is_position_dragging__ = true;
        const chart = (globalThis as any).__active_chart_instance__;
        if (chart?._chartEvent) {
          chart._chartEvent._startScrollCoordinate = null;
          chart._chartEvent._prevYAxisRanges?.clear?.();
        }
        positionDragSnapshots.set(event.overlay.id, snapshot);
        if (typeof event.x === 'number' && typeof event.y === 'number') {
          positionDragStartMouse.set(event.overlay.id, { x: event.x, y: event.y });
        }
      }
      return false;
    },
    onPressedMoveEnd: (event: any) => {
      setGlobalActiveDragAnchor(null, undefined);
      if (def.type === 'long-position' || def.type === 'short-position') {
        (window as any).__is_position_dragging__ = false;
      }
      if (event.overlay) {
        (event.overlay as any).__activeDragAnchorIndex = null;
        (event.overlay as any).__moveStartMouse = null;
        (event.overlay as any).__moveSnapshot = null;
        (event.overlay as any).__prevPoints = null;
      }
      if (def.type === 'regression-trend') {
        (event.overlay as any).__regressionEditing = false;
        (event.overlay as any).__draggedAnchorIndex = -1;
        regressionEditingStates.delete(event.overlay.id);
        regressionMoveSnapshots.delete(event.overlay.id);
        regressionDragIndices.delete(event.overlay.id);
        try {
          const charts = Array.from((window as any).globalCoreCharts || []);
          charts.forEach((chart: any) => chart.updatePane?.(1));
        } catch (e) {
          // Redraw is best-effort; the overlay mutation remains authoritative.
        }
      }
      if (def.type === 'long-position' || def.type === 'short-position') {
        positionDragSnapshots.delete(event.overlay.id);
        positionDragStartMouse.delete(event.overlay.id);
        const extData = event.overlay.extendData || {};
        const posOpts = event.overlay._positionOptions || {};
        const getOpt = (key: string, fallback: any) => extData[key] ?? posOpts[key] ?? fallback;
        window.dispatchEvent(new CustomEvent('open-position-settings', {
          detail: {
            overlayId: event.overlay.id,
            overlayName: event.overlay.name,
            showPrices: getOpt('showPrices', true),
            showPercentage: getOpt('showPercentage', true),
            showRiskReward: getOpt('showRiskReward', true),
            showPnL: getOpt('showPnL', true),
            quantity: getOpt('quantity', 1),
            accountSize: getOpt('accountSize', 10000),
            riskPercent: getOpt('riskPercent', 1),
            profitColor: event.overlay.styles?.takeProfit?.color ?? event.overlay.styles?.takeProfitColor ?? getOpt('profitColor', 'rgba(38, 166, 154, 0.2)'),
            lossColor: event.overlay.styles?.stopLoss?.color ?? event.overlay.styles?.stopLossColor ?? getOpt('lossColor', 'rgba(239, 83, 80, 0.2)'),
            accountSizeCurrency: getOpt('accountSizeCurrency', 'Default'),
            lotSize: getOpt('lotSize', 1),
            riskType: getOpt('riskType', 'percent'),
            risk: getOpt('risk', 10.00),
            leverage: getOpt('leverage', 1),
            qtyPrecision: getOpt('qtyPrecision', 'Default'),
            profitTicks: getOpt('profitTicks', undefined),
            profitPrice: getOpt('profitPrice', undefined),
            stopTicks: getOpt('stopTicks', undefined),
            stopPrice: getOpt('stopPrice', undefined),
            entryPrice: getOpt('entryPrice', undefined),
            linesColor: event.overlay.styles?.lineColor ?? getOpt('linesColor', 'rgba(255, 255, 255, 0.4)'),
            stopColor: event.overlay.styles?.stopLossColor ?? getOpt('stopColor', 'rgba(239, 83, 80, 0.2)'),
            targetColor: event.overlay.styles?.takeProfitColor ?? getOpt('targetColor', 'rgba(38, 166, 154, 0.2)'),
            textColor: event.overlay.styles?.textColor ?? getOpt('textColor', '#ffffff'),
            textSize: event.overlay.styles?.textSize ?? getOpt('textSize', 11),
            showPriceLabels: getOpt('showPriceLabels', true),
            compactStats: getOpt('compactStats', false),
            alwaysShowStats: getOpt('alwaysShowStats', false),
            showTpPriceOffset: getOpt('showTpPriceOffset', true),
            showTpPercentOffset: getOpt('showTpPercentOffset', true),
            showTpTickOffset: getOpt('showTpTickOffset', true),
            showTpAmount: getOpt('showTpAmount', true),
            showTpPL: getOpt('showTpPL', true),
            showOpenClosedPL: getOpt('showOpenClosedPL', true),
            showQty: getOpt('showQty', true),
            showSlPriceOffset: getOpt('showSlPriceOffset', true),
            showSlPercentOffset: getOpt('showSlPercentOffset', true),
            showSlTickOffset: getOpt('showSlTickOffset', true),
            showSlAmount: getOpt('showSlAmount', true),
            showSlPL: getOpt('showSlPL', true)
          }
        }));
      }
      // Trigger drawing persistence save after drag ends
      setTimeout(() => window.dispatchEvent(new CustomEvent('save-history-state')), 50);
      return false;
    },
    onPressedMoving: ((event: any) => {
      let dragIdx = (event.overlay as any).__activeDragAnchorIndex;
      const key = String(event.figure?.key || event.figureKey || '');
      if ((dragIdx == null || dragIdx < 0) && (key.includes('-anchor-') || key.includes('-corner-') || key.includes('point-'))) {
        const parts = key.split('-');
        const lastPart = parts[parts.length - 1];
        const num = Number(lastPart);
        if (!isNaN(num)) dragIdx = num;
      }
      if (dragIdx < 0 && typeof event.pointIndex === 'number' && event.pointIndex >= 0) {
        dragIdx = event.pointIndex;
      }
      if (typeof dragIdx === 'number' && dragIdx >= 0) {
        setGlobalActiveDragAnchor(dragIdx, event.overlay.id);
        (event.overlay as any).__activeDragAnchorIndex = dragIdx;
      }

      if (def.type === 'parallel-channel') {
        const key = String(event.figure?.key || event.figureKey || '');
        const points = event.overlay.points;
        const axes = overlayAxesMap.get(event.overlay.id);
        const yAxis = axes?.yAxis;
        const xAxis = axes?.xAxis;
        const snapshot = (event.overlay as any).__prevPoints || points.__parallelMoveSnapshot;

        if (!points || points.length < 6 || !xAxis || !yAxis || !snapshot || snapshot.length < 6) return false;
        if (typeof event.x !== 'number' || typeof event.y !== 'number') return false;

        let draggedIndex = -1;
        if (key.includes('parallel-anchor-')) {
          const parts = key.split('-');
          draggedIndex = Number(parts[parts.length - 1]);
        }

        if (draggedIndex < 0) {
          let nearest = Number.POSITIVE_INFINITY;
          const baselineMidX = (xAxis.convertToPixel(Number(points[0].dataIndex ?? 0)) + xAxis.convertToPixel(Number(points[1].dataIndex ?? 0))) / 2;
          const parallelMidX = (xAxis.convertToPixel(Number(points[3].dataIndex ?? 0)) + xAxis.convertToPixel(Number(points[4].dataIndex ?? 0))) / 2;

          for (let i = 0; i < 6; i++) {
            let x = 0;
            let y = 0;
            if (i === 2) {
              x = parallelMidX;
              y = yAxis.convertToPixel(Number(points[2].value ?? 0));
            } else if (i === 5) {
              x = baselineMidX;
              y = yAxis.convertToPixel(Number(points[5].value ?? 0));
            } else {
              x = xAxis.convertToPixel(Number(points[i].dataIndex ?? 0));
              y = yAxis.convertToPixel(Number(points[i].value ?? 0));
            }

            if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) continue;

            const distance = Math.hypot(event.x - x, event.y - y);
            if (distance < nearest) {
              nearest = distance;
              draggedIndex = i;
            }
          }
          if (nearest <= 28) {
            // If we resolved an anchor within 28px, set draggedIndex
          } else {
            draggedIndex = -1;
          }
        }

        if (draggedIndex < 0) return false;

        const chart = (globalThis as any).__active_chart_instance__;
        const snapped = applyMagnetSnap(event.x, event.y, xAxis, yAxis, chart);
        const draggedValue = snapped.value;
        const draggedDataIndex = snapped.dataIndex;
        if (!Number.isFinite(draggedValue) || !Number.isFinite(draggedDataIndex)) return true;

        const dataList = chart && typeof chart.getDataList === 'function' ? chart.getDataList() : [];

        let timeDiff = 24 * 60 * 60 * 1000;
        if (dataList.length >= 2) {
          timeDiff = Math.abs(Number(dataList[dataList.length - 1].timestamp) - Number(dataList[dataList.length - 2].timestamp));
        }

        if (draggedIndex === 0 || draggedIndex === 3) {
          const deltaX = draggedDataIndex - Number(snapshot[draggedIndex].dataIndex ?? 0);
          const deltaY = draggedValue - Number(snapshot[draggedIndex].value ?? 0);

          points[0].dataIndex = Number(snapshot[0].dataIndex ?? 0) + deltaX;
          points[0].timestamp = Number(snapshot[0].timestamp ?? 0) + (points[0].dataIndex - Number(snapshot[0].dataIndex ?? 0)) * timeDiff;
          points[0].value = Number(snapshot[0].value ?? 0) + deltaY;

          points[3].dataIndex = Number(snapshot[3].dataIndex ?? 0) + deltaX;
          points[3].timestamp = Number(snapshot[3].timestamp ?? 0) + (points[3].dataIndex - Number(snapshot[3].dataIndex ?? 0)) * timeDiff;
          points[3].value = Number(snapshot[3].value ?? 0) + deltaY;

          points[1] = { ...snapshot[1] };
          points[4] = { ...snapshot[4] };

          const midX = (points[0].dataIndex + points[1].dataIndex) / 2;
          const midTime = (points[0].timestamp + points[1].timestamp) / 2;

          points[5].dataIndex = midX;
          points[5].timestamp = midTime;
          points[5].value = (points[0].value + points[1].value) / 2;

          points[2].dataIndex = midX;
          points[2].timestamp = midTime;
          points[2].value = (points[3].value + points[4].value) / 2;
        } else if (draggedIndex === 1 || draggedIndex === 4) {
          const deltaX = draggedDataIndex - Number(snapshot[draggedIndex].dataIndex ?? 0);
          const deltaY = draggedValue - Number(snapshot[draggedIndex].value ?? 0);

          points[1].dataIndex = Number(snapshot[1].dataIndex ?? 0) + deltaX;
          points[1].timestamp = Number(snapshot[1].timestamp ?? 0) + (points[1].dataIndex - Number(snapshot[1].dataIndex ?? 0)) * timeDiff;
          points[1].value = Number(snapshot[1].value ?? 0) + deltaY;

          points[4].dataIndex = Number(snapshot[4].dataIndex ?? 0) + deltaX;
          points[4].timestamp = Number(snapshot[4].timestamp ?? 0) + (points[4].dataIndex - Number(snapshot[4].dataIndex ?? 0)) * timeDiff;
          points[4].value = Number(snapshot[4].value ?? 0) + deltaY;

          points[0] = { ...snapshot[0] };
          points[3] = { ...snapshot[3] };

          const midX = (points[0].dataIndex + points[1].dataIndex) / 2;
          const midTime = (points[0].timestamp + points[1].timestamp) / 2;

          points[5].dataIndex = midX;
          points[5].timestamp = midTime;
          points[5].value = (points[0].value + points[1].value) / 2;

          points[2].dataIndex = midX;
          points[2].timestamp = midTime;
          points[2].value = (points[3].value + points[4].value) / 2;
        } else if (draggedIndex === 2) {
          const currentBaselineMid = (Number(points[0].value ?? 0) + Number(points[1].value ?? 0)) / 2;
          const newHeight = draggedValue - currentBaselineMid;

          for (let i = 0; i < 2; i++) points[i] = { ...points[i] };
          points[5] = { ...points[5] };

          const midX = (points[0].dataIndex + points[1].dataIndex) / 2;
          const midTime = (points[0].timestamp + points[1].timestamp) / 2;

          points[2].dataIndex = midX;
          points[2].timestamp = midTime;
          points[2].value = draggedValue;

          points[3].dataIndex = points[0].dataIndex;
          points[3].timestamp = points[0].timestamp;
          points[3].value = points[0].value + newHeight;

          points[4].dataIndex = points[1].dataIndex;
          points[4].timestamp = points[1].timestamp;
          points[4].value = points[1].value + newHeight;
        } else if (draggedIndex === 5) {
          const oldBaselineMid = (Number(snapshot[0].value ?? 0) + Number(snapshot[1].value ?? 0)) / 2;
          const delta = draggedValue - oldBaselineMid;

          points[0].dataIndex = snapshot[0].dataIndex;
          points[0].timestamp = snapshot[0].timestamp;
          points[0].value = Number(snapshot[0].value ?? 0) + delta;

          points[1].dataIndex = snapshot[1].dataIndex;
          points[1].timestamp = snapshot[1].timestamp;
          points[1].value = Number(snapshot[1].value ?? 0) + delta;

          points[5].dataIndex = (points[0].dataIndex + points[1].dataIndex) / 2;
          points[5].timestamp = (points[0].timestamp + points[1].timestamp) / 2;
          points[5].value = draggedValue;

          for (let i = 2; i <= 4; i++) {
            points[i] = { ...snapshot[i] };
          }
        }

        (event.overlay as any).__prevPoints = points.map((p: any) => ({
          dataIndex: p.dataIndex,
          timestamp: p.timestamp,
          value: p.value
        }));

        event.overlay.points = [...points];
        return true;
      } else if (def.type === 'fib-channel') {
        const key = String(event.figure?.key || event.figureKey || '');
        const points = event.overlay.points;
        const axes = overlayAxesMap.get(event.overlay.id);
        const yAxis = axes?.yAxis;
        const xAxis = axes?.xAxis;
        const initialSnapshot = (event.overlay as any).__moveSnapshot || points?.__parallelMoveSnapshot;

        if (!points || points.length < 3 || !xAxis || !yAxis || !initialSnapshot || initialSnapshot.length < 3) return false;
        if (typeof event.x !== 'number' || typeof event.y !== 'number') return false;

        let draggedIndex = (event.overlay as any).__activeDragAnchorIndex;
        if ((draggedIndex == null || draggedIndex < 0) && key.includes('fib-channel-anchor-')) {
          const parts = key.split('-');
          draggedIndex = Number(parts[parts.length - 1]);
        }

        if (draggedIndex < 0 || isNaN(draggedIndex)) {
          let nearest = Number.POSITIVE_INFINITY;
          for (let i = 0; i < 3; i++) {
            const x = xAxis.convertToPixel(Number(points[i].dataIndex ?? 0));
            const y = yAxis.convertToPixel(Number(points[i].value ?? 0));
            if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) continue;
            const distance = Math.hypot(event.x - x, event.y - y);
            if (distance < nearest) {
              nearest = distance;
              draggedIndex = i;
            }
          }
          if (nearest > 28) {
            draggedIndex = -1;
          }
        }

        const chart = (globalThis as any).__active_chart_instance__;
        const snapped = applyMagnetSnap(event.x, event.y, xAxis, yAxis, chart);
        const draggedValue = snapped.value;
        const draggedDataIndex = snapped.dataIndex;
        if (!Number.isFinite(draggedValue) || !Number.isFinite(draggedDataIndex)) return true;

        const dataList = chart && typeof chart.getDataList === 'function' ? chart.getDataList() : [];
        let timeDiff = 24 * 60 * 60 * 1000;
        if (dataList.length >= 2) {
          timeDiff = Math.abs(Number(dataList[dataList.length - 1].timestamp) - Number(dataList[dataList.length - 2].timestamp));
        }

        if (draggedIndex === 2) {
          // Dragging Anchor 2 (the Level 1 channel width point)
          const p1X = xAxis.convertToPixel(Number(points[0].dataIndex ?? 0));
          const p1Y = yAxis.convertToPixel(Number(points[0].value ?? 0));
          const p2X = xAxis.convertToPixel(Number(points[1].dataIndex ?? 0));
          const p2Y = yAxis.convertToPixel(Number(points[1].value ?? 0));

          if (p1X != null && p1Y != null && p2X != null && p2Y != null) {
            const dx = p2X - p1X;
            const dy = p2Y - p1Y;
            const len = Math.hypot(dx, dy);
            if (len > 0) {
              const nx = -dy / len;
              const ny = dx / len;
              const vx = event.x - p1X;
              const vy = event.y - p1Y;
              const dist = vx * nx + vy * ny;
              const p1Parallel = { x: p1X + nx * dist, y: p1Y + ny * dist };
              const lenSq = dx * dx + dy * dy;
              const u = Math.max(0, Math.min(1, (vx * dx + vy * dy) / lenSq));
              const attachedX = p1Parallel.x + u * dx;
              const attachedY = p1Parallel.y + u * dy;

              const { dataIndex, timestamp } = pixelXToDataIndexAndTimestamp(attachedX, xAxis);
              const price = yAxis.convertFromPixel(attachedY);

              points[2].dataIndex = dataIndex;
              points[2].timestamp = timestamp || (points[2].timestamp + (dataIndex - points[2].dataIndex) * timeDiff);
              if (price !== null && Number.isFinite(price)) {
                points[2].value = price;
              }
            }
          }
        } else if (draggedIndex === 0 || draggedIndex === 1) {
          // Dragging Anchor 0 or 1: move baseline endpoint and keep channel perpendicular width preserved
          const oldP1X = xAxis.convertToPixel(Number(initialSnapshot[0].dataIndex ?? 0));
          const oldP1Y = yAxis.convertToPixel(Number(initialSnapshot[0].value ?? 0));
          const oldP2X = xAxis.convertToPixel(Number(initialSnapshot[1].dataIndex ?? 0));
          const oldP2Y = yAxis.convertToPixel(Number(initialSnapshot[1].value ?? 0));
          const oldP3X = xAxis.convertToPixel(Number(initialSnapshot[2].dataIndex ?? 0));
          const oldP3Y = yAxis.convertToPixel(Number(initialSnapshot[2].value ?? 0));

          let oldDist = 0;
          let oldU = 0.5;
          if (oldP1X != null && oldP1Y != null && oldP2X != null && oldP2Y != null && oldP3X != null && oldP3Y != null) {
            const oldDx = oldP2X - oldP1X;
            const oldDy = oldP2Y - oldP1Y;
            const oldLen = Math.hypot(oldDx, oldDy);
            if (oldLen > 0) {
              const oldNx = -oldDy / oldLen;
              const oldNy = oldDx / oldLen;
              const oldVx = oldP3X - oldP1X;
              const oldVy = oldP3Y - oldP1Y;
              oldDist = oldVx * oldNx + oldVy * oldNy;
              const oldLenSq = oldDx * oldDx + oldDy * oldDy;
              oldU = Math.max(0, Math.min(1, (oldVx * oldDx + oldVy * oldDy) / oldLenSq));
            }
          }

          const targetIdx = draggedIndex;
          const otherIdx = draggedIndex === 0 ? 1 : 0;

          points[otherIdx] = { ...initialSnapshot[otherIdx] };

          const deltaX = draggedDataIndex - Number(initialSnapshot[targetIdx].dataIndex ?? 0);
          const deltaY = draggedValue - Number(initialSnapshot[targetIdx].value ?? 0);
          points[targetIdx].dataIndex = Number(initialSnapshot[targetIdx].dataIndex ?? 0) + deltaX;
          points[targetIdx].timestamp = Number(initialSnapshot[targetIdx].timestamp ?? 0) + deltaX * timeDiff;
          points[targetIdx].value = Number(initialSnapshot[targetIdx].value ?? 0) + deltaY;

          // Recompute anchor 2 using new baseline p1->p2 and oldDist & oldU
          const newP1X = xAxis.convertToPixel(Number(points[0].dataIndex ?? 0));
          const newP1Y = yAxis.convertToPixel(Number(points[0].value ?? 0));
          const newP2X = xAxis.convertToPixel(Number(points[1].dataIndex ?? 0));
          const newP2Y = yAxis.convertToPixel(Number(points[1].value ?? 0));

          if (newP1X != null && newP1Y != null && newP2X != null && newP2Y != null) {
            const newDx = newP2X - newP1X;
            const newDy = newP2Y - newP1Y;
            const newLen = Math.hypot(newDx, newDy);
            if (newLen > 0) {
              const newNx = -newDy / newLen;
              const newNy = newDx / newLen;
              const newAttachedX = newP1X + newNx * oldDist + oldU * newDx;
              const newAttachedY = newP1Y + newNy * oldDist + oldU * newDy;

              const { dataIndex, timestamp } = pixelXToDataIndexAndTimestamp(newAttachedX, xAxis);
              const price = yAxis.convertFromPixel(newAttachedY);

              points[2].dataIndex = dataIndex;
              points[2].timestamp = timestamp || points[2].timestamp;
              if (price !== null && Number.isFinite(price)) {
                points[2].value = price;
              }
            }
          }
        } else {
          // Whole-overlay move (dragging body)
          const startMouse = (event.overlay as any).__moveStartMouse;
          let deltaDataIndex = 0;
          let deltaPrice = 0;
          if (startMouse) {
            const startXInfo = pixelXToDataIndexAndTimestamp(startMouse.x, xAxis);
            const currentXInfo = pixelXToDataIndexAndTimestamp(event.x, xAxis);
            deltaDataIndex = currentXInfo.dataIndex - startXInfo.dataIndex;

            const startPrice = yAxis.convertFromPixel(startMouse.y) ?? 0;
            const currentPrice = yAxis.convertFromPixel(event.y) ?? 0;
            deltaPrice = currentPrice - startPrice;
          } else {
            deltaDataIndex = draggedDataIndex - Number(initialSnapshot[0].dataIndex ?? 0);
            deltaPrice = draggedValue - Number(initialSnapshot[0].value ?? 0);
          }

          for (let i = 0; i < 3; i++) {
            points[i] = { ...initialSnapshot[i] };
            points[i].dataIndex = Number(initialSnapshot[i].dataIndex ?? 0) + deltaDataIndex;
            points[i].timestamp = Number(initialSnapshot[i].timestamp ?? 0) + deltaDataIndex * timeDiff;
            points[i].value = Number(initialSnapshot[i].value ?? 0) + deltaPrice;
          }
        }

        event.overlay.points = [...points];
        return true;
      } else if (def.type === 'disjoint-channel') {
        const key = String(event.figure?.key || event.figureKey || '');
        const points = event.overlay.points;
        const axes = overlayAxesMap.get(event.overlay.id);
        const yAxis = axes?.yAxis;
        const xAxis = axes?.xAxis;
        const snapshot = (event.overlay as any).__prevPoints || points.__parallelMoveSnapshot;

        if (!points || points.length < 4 || !xAxis || !yAxis || !snapshot || snapshot.length < 4) return false;
        if (typeof event.x !== 'number' || typeof event.y !== 'number') return false;

        let draggedIndex = -1;
        if (key.includes('disjoint-anchor-')) {
          const parts = key.split('-');
          draggedIndex = Number(parts[parts.length - 1]);
        }

        if (draggedIndex < 0) {
          let nearest = Number.POSITIVE_INFINITY;
          for (let i = 0; i < 4; i++) {
            const x = xAxis.convertToPixel(Number(points[i].dataIndex ?? 0));
            const y = yAxis.convertToPixel(Number(points[i].value ?? 0));
            if (typeof x !== 'number' || typeof y !== 'number') continue;
            const distance = Math.hypot(event.x - x, event.y - y);
            if (distance < nearest) {
              nearest = distance;
              draggedIndex = i;
            }
          }
          if (nearest > 24) draggedIndex = -1;
        }

        if (draggedIndex < 0) return false;

        const chart = (globalThis as any).__active_chart_instance__;
        const snapped = applyMagnetSnap(event.x, event.y, xAxis, yAxis, chart);
        const draggedValue = snapped.value;
        let draggedDataIndex = snapped.dataIndex;
        if (!Number.isFinite(draggedValue) || !Number.isFinite(draggedDataIndex)) return true;
        const dataList = chart && typeof chart.getDataList === 'function' ? chart.getDataList() : [];
        // If the time scale clamps empty-space pixels to the final candle,
        // extrapolate the index from the last two candle positions.
        if (dataList.length >= 2) {
          const lastIndex = dataList.length - 1;
          const lastX = Number(xAxis.convertToPixel(lastIndex));
          const previousX = Number(xAxis.convertToPixel(lastIndex - 1));
          const step = lastX - previousX;
          if (Number.isFinite(lastX) && Number.isFinite(step) && Math.abs(step) > 0.001) {
            if (event.x > lastX && draggedDataIndex >= lastIndex - 0.01) {
              draggedDataIndex = lastIndex + (event.x - lastX) / step;
            } else if (event.x < previousX && draggedDataIndex <= 0.01) {
              draggedDataIndex = (event.x - previousX) / step + (lastIndex - 1);
            }
          }
        }
        const roundedDataIndex = Math.round(draggedDataIndex);
        const draggedTimestamp = dataList[roundedDataIndex]?.timestamp ?? 0;

        for (let i = 0; i < 4; i++) {
          points[i] = { ...snapshot[i] };
        }

        const deltaValue = draggedValue - Number(snapshot[draggedIndex].value ?? 0);

        if (draggedIndex === 0) {
          // Drag Point 0 (line 1 left): moves in X & Y. Opposite Point 2 (line 2 left) follows in X and mirrors in Y
          points[0].dataIndex = draggedDataIndex;
          points[0].timestamp = draggedTimestamp;
          points[0].value = draggedValue;
          points[2].dataIndex = draggedDataIndex;
          points[2].timestamp = draggedTimestamp;
          points[2].value = Number(snapshot[2].value ?? 0) - deltaValue;
        } else if (draggedIndex === 1) {
          // Drag Point 1 (line 1 right): moves in X & Y. Opposite Point 3 (line 2 right) follows in X and mirrors in Y
          points[1].dataIndex = draggedDataIndex;
          points[1].timestamp = draggedTimestamp;
          points[1].value = draggedValue;
          points[3].dataIndex = draggedDataIndex;
          points[3].timestamp = draggedTimestamp;
          points[3].value = Number(snapshot[3].value ?? 0) - deltaValue;
        } else if (draggedIndex === 2) {
          // Drag Point 2 (line 2 left): moves in X & Y. Opposite Point 0 (line 1 left) follows in X and mirrors in Y
          points[2].dataIndex = draggedDataIndex;
          points[2].timestamp = draggedTimestamp;
          points[2].value = draggedValue;
          points[0].dataIndex = draggedDataIndex;
          points[0].timestamp = draggedTimestamp;
          points[0].value = Number(snapshot[0].value ?? 0) - deltaValue;
        } else if (draggedIndex === 3) {
          // Drag Point 3 (4th anchor, square): moves the entire second line vertically as a unit, and opposite Point 1 follows in X
          points[3].dataIndex = draggedDataIndex;
          points[3].timestamp = draggedTimestamp;
          points[1].dataIndex = draggedDataIndex;
          points[1].timestamp = draggedTimestamp;
          points[3].value = draggedValue;
          points[2].value = Number(snapshot[2].value ?? 0) + deltaValue;
        }

        (event.overlay as any).__prevPoints = points.map((p: any) => ({
          dataIndex: p.dataIndex,
          timestamp: p.timestamp,
          value: p.value
        }));

        event.overlay.points = [...points];
        return true;

      } else if (def.type === 'flat-top-bottom') {
        const key = String(event.figure?.key || event.figureKey || '');
        const points = event.overlay.points;
        const axes = overlayAxesMap.get(event.overlay.id);
        const yAxis = axes?.yAxis;
        const xAxis = axes?.xAxis;
        const snapshot = (event.overlay as any).__prevPoints || points.__parallelMoveSnapshot;

        if (!points || points.length < 4 || !xAxis || !yAxis || !snapshot || snapshot.length < 4) return false;
        if (typeof event.x !== 'number' || typeof event.y !== 'number') return false;

        let draggedIndex = -1;
        if (key.includes('flat-top-bottom-anchor-')) {
          const parts = key.split('-');
          draggedIndex = Number(parts[parts.length - 1]);
        }

        if (draggedIndex < 0) {
          let nearest = Number.POSITIVE_INFINITY;
          for (let i = 0; i < 4; i++) {
            const x = xAxis.convertToPixel(Number(points[i].dataIndex ?? 0));
            const y = yAxis.convertToPixel(Number(points[i].value ?? 0));
            if (typeof x !== 'number' || typeof y !== 'number') continue;
            const distance = Math.hypot(event.x - x, event.y - y);
            if (distance < nearest) {
              nearest = distance;
              draggedIndex = i;
            }
          }
          if (nearest > 24) draggedIndex = -1;
        }

        if (draggedIndex < 0) return false;

        const chart = (globalThis as any).__active_chart_instance__;
        const snapped = applyMagnetSnap(event.x, event.y, xAxis, yAxis, chart);
        const draggedValue = snapped.value;
        let draggedDataIndex = snapped.dataIndex;
        if (!Number.isFinite(draggedValue) || !Number.isFinite(draggedDataIndex)) return true;
        const dataList = chart && typeof chart.getDataList === 'function' ? chart.getDataList() : [];
        if (dataList.length >= 2) {
          const lastIndex = dataList.length - 1;
          const lastX = Number(xAxis.convertToPixel(lastIndex));
          const previousX = Number(xAxis.convertToPixel(lastIndex - 1));
          const step = lastX - previousX;
          if (Number.isFinite(lastX) && Number.isFinite(step) && Math.abs(step) > 0.001) {
            if (event.x > lastX && draggedDataIndex >= lastIndex - 0.01) {
              draggedDataIndex = lastIndex + (event.x - lastX) / step;
            } else if (event.x < previousX && draggedDataIndex <= 0.01) {
              draggedDataIndex = (event.x - previousX) / step + (lastIndex - 1);
            }
          }
        }
        const roundedDataIndex = Math.round(draggedDataIndex);
        const draggedTimestamp = dataList[roundedDataIndex]?.timestamp ?? 0;

        for (let i = 0; i < 4; i++) {
          points[i] = { ...snapshot[i] };
        }

        if (draggedIndex === 0) {
          points[0].dataIndex = draggedDataIndex;
          points[0].timestamp = draggedTimestamp;
          points[0].value = draggedValue;
          points[2].dataIndex = draggedDataIndex;
          points[2].timestamp = draggedTimestamp;
        } else if (draggedIndex === 1) {
          points[1].dataIndex = draggedDataIndex;
          points[1].timestamp = draggedTimestamp;
          points[1].value = draggedValue;
          points[3].dataIndex = draggedDataIndex;
          points[3].timestamp = draggedTimestamp;
        } else if (draggedIndex === 2) {
          points[2].dataIndex = draggedDataIndex;
          points[2].timestamp = draggedTimestamp;
          points[0].dataIndex = draggedDataIndex;
          points[0].timestamp = draggedTimestamp;
          points[2].value = draggedValue;
          points[3].value = draggedValue;
        } else if (draggedIndex === 3) {
          points[3].dataIndex = draggedDataIndex;
          points[3].timestamp = draggedTimestamp;
          points[1].dataIndex = draggedDataIndex;
          points[1].timestamp = draggedTimestamp;
          points[2].value = draggedValue;
          points[3].value = draggedValue;
        }

        (event.overlay as any).__prevPoints = points.map((p: any) => ({
          dataIndex: p.dataIndex,
          timestamp: p.timestamp,
          value: p.value
        }));

        event.overlay.points = [...points];
        return true;

      } else if (def.type === 'regression-trend') {
        const key = String(event.figure?.key || event.figureKey || '');
        const points = event.overlay.points;
        const axes = overlayAxesMap.get(event.overlay.id);
        const yAxis = axes?.yAxis;
        const xAxis = axes?.xAxis;
        const snapshot = regressionMoveSnapshots.get(event.overlay.id) || (event.overlay as any).__regressionMoveSnapshot || points.__parallelMoveSnapshot;

        if (!points || points.length < 2 || !xAxis || !yAxis || !snapshot || snapshot.length < 2) return false;
        if (typeof event.x !== 'number' || typeof event.y !== 'number') return false;

        let draggedIndex = regressionDragIndices.get(event.overlay.id) ?? (event.overlay as any).__draggedAnchorIndex ?? -1;
        if (draggedIndex < 0) {
          if (key.includes('regression-anchor-')) {
            const parts = key.split('-');
            draggedIndex = Number(parts[parts.length - 1]);
          }
        }

        if (draggedIndex < 0) {
          let nearest = Number.POSITIVE_INFINITY;
          const endpoints = regressionEndpoints.get(event.overlay.id);
          const bFirst = endpoints?.baseFirst || (event.overlay as any).__baseFirst;
          const bSecond = endpoints?.baseSecond || (event.overlay as any).__baseSecond;
          if (bFirst && bSecond) {
            [bFirst, bSecond].forEach((coord: any, index: number) => {
              const distance = Math.hypot(event.x - coord.x, event.y - coord.y);
              if (distance < nearest) {
                nearest = distance;
                draggedIndex = index;
              }
            });
          }
          // Fall back to the actual endpoint pixels when the custom figure key
          // is not supplied by Ticker Pen during a drag.
          if (!bFirst || !bSecond) {
            for (let index = 0; index < 2; index++) {
              const x = xAxis.convertToPixel(Number(points[index].dataIndex ?? 0));
              const y = yAxis.convertToPixel(Number(points[index].value ?? 0));
              if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
              const distance = Math.hypot(event.x - x, event.y - y);
              if (distance < nearest) {
                nearest = distance;
                draggedIndex = index;
              }
            }
          }
          if (nearest > 24) draggedIndex = -1;
        }

        if (draggedIndex < 0) return false;

        const chart = (globalThis as any).__active_chart_instance__;
        const snapped = applyMagnetSnap(event.x, event.y, xAxis, yAxis, chart);
        const draggedValue = snapped.value;
        const draggedDataIndex = snapped.dataIndex;
        if (!Number.isFinite(draggedValue) || !Number.isFinite(draggedDataIndex)) return true;

        const roundedDataIndex = Math.round(draggedDataIndex);
        const dataList = chart && typeof chart.getDataList === 'function' ? chart.getDataList() : [];
        // Keep the time coordinate valid even when the cursor is moved beyond
        // the last loaded candle, so an endpoint can be extended into empty
        // chart space.
        let draggedTimestamp = Number(dataList[roundedDataIndex]?.timestamp);
        if (!Number.isFinite(draggedTimestamp) && dataList.length >= 2) {
          const firstTimestamp = Number(dataList[0].timestamp);
          const lastIndex = dataList.length - 1;
          const timeStep = (Number(dataList[lastIndex].timestamp) - Number(dataList[lastIndex - 1].timestamp));
          draggedTimestamp = firstTimestamp + roundedDataIndex * timeStep;
        }
        if (!Number.isFinite(draggedTimestamp)) draggedTimestamp = Number(points[draggedIndex].timestamp ?? 0);

        for (let i = 0; i < 2; i++) {
          points[i] = { ...snapshot[i] };
        }

        points[draggedIndex].dataIndex = draggedDataIndex;
        points[draggedIndex].timestamp = draggedTimestamp;
        points[draggedIndex].value = draggedValue;

        return true;
      } else if (def.type === 'long-position' || def.type === 'short-position') {
        const key = String(event.figure?.key || event.figureKey || '');
        let dragIndex = -1;
        if (key.includes('anchor-0')) dragIndex = 0;
        else if (key.includes('anchor-1')) dragIndex = 1;
        else if (key.includes('anchor-2')) dragIndex = 2;
        else if (key.includes('anchor-3')) dragIndex = 3;

        const points = event.overlay.points;
        const axes = overlayAxesMap.get(event.overlay.id);
        const xAxis = axes?.xAxis;
        const yAxis = axes?.yAxis;
        const snapshot = positionDragSnapshots.get(event.overlay.id);

        // Native Ticker Pen point figures do not consistently expose the
        // custom anchor key. Resolve the dragged anchor from its actual pixel
        // distance instead of allowing the default polyline/arrow movement.
        if (dragIndex < 0 && points && points.length >= 4 && xAxis && yAxis
          && typeof event.x === 'number' && typeof event.y === 'number') {
          let nearest = Number.POSITIVE_INFINITY;
          for (let index = 0; index < 4; index++) {
            const x = dataIndexToPixelX(Number(points[index].dataIndex ?? 0), xAxis);
            const y = yAxis.convertToPixel(Number(points[index].value ?? 0));
            if (typeof x !== 'number' || typeof y !== 'number') continue;
            const distance = Math.hypot(event.x - x, event.y - y);
            if (distance < nearest) {
              nearest = distance;
              dragIndex = index;
            }
          }
          if (nearest > 24) dragIndex = -1;
        }

        if (dragIndex < 0) {
          // Body drag: move entire panel as a unit, preserving width span
          if (!points || points.length < 4 || !xAxis || !yAxis || !snapshot || snapshot.length < 4) return false;
          if (typeof event.x !== 'number' || typeof event.y !== 'number') return false;

          const charts = Array.from((window as any).globalCoreCharts || []);
          const chart = charts[0] as any;
          const dataList = chart ? chart.getDataList() : [];

          // Calculate dragged data index (supporting future)
          let draggedDataIndex = Number(xAxis.convertFromPixel(event.x));
          try {
            if (chart && dataList.length > 0) {
              const chartStore = chart._chartStore || chart.chartStore;
              const timeScaleStore = chartStore?.getTimeScaleStore?.() || chartStore?._timeScaleStore || chartStore?.timeScaleStore;
              const rawBarSpace = typeof chart.getBarSpace === 'function' ? chart.getBarSpace() : null;
              const currentBarSpace = typeof rawBarSpace === 'object' && rawBarSpace !== null
                ? (rawBarSpace as any).bar
                : (typeof rawBarSpace === 'number' ? rawBarSpace : (timeScaleStore?.getBarSpace?.()?.bar || 6));
              if (currentBarSpace > 0) {
                const lastIndex = dataList.length - 1;
                const lastCandleX = xAxis.convertToPixel(lastIndex);
                if (typeof lastCandleX === 'number' && !isNaN(lastCandleX)) {
                  draggedDataIndex = lastIndex + Math.round((event.x - lastCandleX) / currentBarSpace);
                }
              }
            }
          } catch (e) {}

          const draggedPrice = yAxis.convertFromPixel(event.y);
          if (draggedPrice === null) return false;

          // Calculate delta from where the drag started relative to the grab coordinates
          const snapLeftIdx = Number(snapshot[0].dataIndex ?? 0);
          const snapRightIdx = Number(snapshot[3].dataIndex ?? 0);
          const snapEntryPrice = Number(snapshot[0].value ?? 0);
          const snapCenterIdx = Math.round((snapLeftIdx + snapRightIdx) / 2);
          const snapCenterPrice = snapEntryPrice;

          const startMouse = positionDragStartMouse.get(event.overlay.id);
          let startDataIndex = snapCenterIdx;
          let startPrice = snapCenterPrice;

          if (startMouse) {
            startPrice = yAxis.convertFromPixel(startMouse.y) ?? snapCenterPrice;
            startDataIndex = Number(xAxis.convertFromPixel(startMouse.x));
            try {
              if (chart && dataList.length > 0) {
                const chartStore = chart._chartStore || chart.chartStore;
                const timeScaleStore = chartStore?.getTimeScaleStore?.() || chartStore?._timeScaleStore || chartStore?.timeScaleStore;
                const rawBarSpace = typeof chart.getBarSpace === 'function' ? chart.getBarSpace() : null;
                const currentBarSpace = typeof rawBarSpace === 'object' && rawBarSpace !== null
                  ? (rawBarSpace as any).bar
                  : (typeof rawBarSpace === 'number' ? rawBarSpace : (timeScaleStore?.getBarSpace?.()?.bar || 6));
                if (currentBarSpace > 0) {
                  const lastIndex = dataList.length - 1;
                  const lastCandleX = xAxis.convertToPixel(lastIndex);
                  if (typeof lastCandleX === 'number' && !isNaN(lastCandleX)) {
                    startDataIndex = lastIndex + Math.round((startMouse.x - lastCandleX) / currentBarSpace);
                  }
                }
              }
            } catch (e) {}
          }

          const deltaIndex = Math.round(draggedDataIndex) - Math.round(startDataIndex);
          const deltaPrice = draggedPrice - startPrice;

          // Get timeDiff between bars
          let timeDiff = 24 * 60 * 60 * 1000;
          try {
            if (dataList && dataList.length >= 2) {
              timeDiff = Math.abs(Number(dataList[dataList.length - 1].timestamp) - Number(dataList[dataList.length - 2].timestamp));
            }
          } catch (e) {}

          // Shift all 4 points by the same delta, preserving the width span
          for (let i = 0; i < 4; i++) {
            const snapIdx = Number(snapshot[i].dataIndex ?? 0);
            const snapTime = Number(snapshot[i].timestamp ?? 0);
            const snapVal = Number(snapshot[i].value ?? 0);
            points[i] = { ...snapshot[i] };
            points[i].dataIndex = snapIdx + deltaIndex;
            points[i].timestamp = snapTime + deltaIndex * timeDiff;
            points[i].value = snapVal + deltaPrice;
          }

          event.overlay.points = [...points];
          return true;
        }

        if (!points || points.length < 4 || !xAxis || !yAxis || !snapshot || snapshot.length < 4) return true;
        if (typeof event.x !== 'number' || typeof event.y !== 'number') return true;

        const charts = Array.from((window as any).globalCoreCharts || []);
        const chart = charts[0] as any;
        const snapped = applyMagnetSnap(event.x, event.y, xAxis, yAxis, chart);
        let draggedDataIndex = snapped.dataIndex;
        const draggedPrice = snapped.value;
        if (draggedPrice === null || !Number.isFinite(draggedPrice)) return true;

        const dataIndex = Math.round(draggedDataIndex);

        // Let's get timeDiff between bars
        let timeDiff = 24 * 60 * 60 * 1000;
        try {
          const charts = Array.from((window as any).globalCoreCharts || []);
          if (charts.length > 0) {
            const dataList = (charts[0] as any).getDataList();
            if (dataList && dataList.length >= 2) {
              timeDiff = Math.abs(Number(dataList[dataList.length - 1].timestamp) - Number(dataList[dataList.length - 2].timestamp));
            }
          }
        } catch (e) { }

        // Restore other points to snapshot base values before applying constraints, to avoid cumulative error
        for (let i = 0; i < 4; i++) {
          points[i] = { ...snapshot[i] };
        }

        if (dragIndex === 0) {
          // Dragging Entry Left: update entry price vertically only (locked horizontally)
          const stopPrice = Number(points[1].value ?? 0);
          const profitPrice = Number(points[2].value ?? 0);

          const stopY = yAxis.convertToPixel(stopPrice);
          const profitY = yAxis.convertToPixel(profitPrice);

          const minY = Math.min(stopY, profitY) + 30;
          const maxY = Math.max(stopY, profitY) - 30;

          let clampedEntryY = event.y;
          if (minY <= maxY) {
            clampedEntryY = Math.max(minY, Math.min(maxY, event.y));
          } else {
            clampedEntryY = (stopY + profitY) / 2;
          }

          const val = yAxis.convertFromPixel(clampedEntryY) ?? draggedPrice;

          const rightEdgeIndex = Number(points[3].dataIndex ?? 0);
          const maxLeftIndex = rightEdgeIndex - 1;
          const targetIndex = Math.min(maxLeftIndex, dataIndex);

          points[0].dataIndex = targetIndex;
          points[0].timestamp = Number(snapshot[0].timestamp ?? 0) + (targetIndex - Number(snapshot[0].dataIndex ?? 0)) * timeDiff;
          points[0].value = val;

          points[1].dataIndex = targetIndex;
          points[1].timestamp = points[0].timestamp;
          points[1].value = snapshot[1].value;

          points[2].dataIndex = targetIndex;
          points[2].timestamp = points[0].timestamp;
          points[2].value = snapshot[2].value;

          points[3].value = val;
        } else if (dragIndex === 1) {
          // Dragging Stop Loss: update value vertically only (locked horizontally)
          const isLong = def.type === 'long-position';
          const entryPrice = Number(points[0].value ?? 0);
          const entryY = yAxis.convertToPixel(entryPrice);

          let clampedStopY = event.y;
          if (isLong) {
            clampedStopY = Math.max(entryY + 30, event.y);
          } else {
            clampedStopY = Math.min(entryY - 30, event.y);
          }

          points[0].dataIndex = Number(snapshot[0].dataIndex ?? 0);
          points[0].timestamp = Number(snapshot[0].timestamp ?? 0);

          points[1].dataIndex = Number(snapshot[1].dataIndex ?? 0);
          points[1].timestamp = Number(snapshot[1].timestamp ?? 0);
          points[1].value = yAxis.convertFromPixel(clampedStopY) ?? draggedPrice;

          points[2].dataIndex = Number(snapshot[2].dataIndex ?? 0);
          points[2].timestamp = Number(snapshot[2].timestamp ?? 0);
        } else if (dragIndex === 2) {
          // Dragging Take Profit: update value vertically only (locked horizontally)
          const isLong = def.type === 'long-position';
          const entryPrice = Number(points[0].value ?? 0);
          const entryY = yAxis.convertToPixel(entryPrice);

          let clampedProfitY = event.y;
          if (isLong) {
            clampedProfitY = Math.min(entryY - 30, event.y);
          } else {
            clampedProfitY = Math.max(entryY + 30, event.y);
          }

          points[0].dataIndex = Number(snapshot[0].dataIndex ?? 0);
          points[0].timestamp = Number(snapshot[0].timestamp ?? 0);

          points[1].dataIndex = Number(snapshot[1].dataIndex ?? 0);
          points[1].timestamp = Number(snapshot[1].timestamp ?? 0);

          points[2].dataIndex = Number(snapshot[2].dataIndex ?? 0);
          points[2].timestamp = Number(snapshot[2].timestamp ?? 0);
          points[2].value = yAxis.convertFromPixel(clampedProfitY) ?? draggedPrice;
        } else if (dragIndex === 3) {
          // Dragging Entry Right: only update width/timestamp, lock value to Entry Price
          const leftEdgeIndex = Number(points[0].dataIndex ?? 0);
          const minRightIndex = leftEdgeIndex + 1;
          const targetIndex = Math.max(minRightIndex, dataIndex);
          points[3].dataIndex = targetIndex;
          points[3].timestamp = Number(snapshot[0].timestamp ?? 0) + (targetIndex - Number(snapshot[0].dataIndex ?? 0)) * timeDiff;
          points[3].value = points[0].value;
        }

        event.overlay.points = [...points];
        return true; // Let Ticker Pen redraw with the mutated points smoothly
      } else {
        // Generic anchor point dragging fallback for all drawing tools
        const key = String(event.figure?.key || event.figureKey || '');
        const points = event.overlay.points;
        if (!points) return false;

        let draggedIndex = -1;
        // First: check the anchor index stored by onPressedMoveStart — this is
        // the authoritative source that survives magnet snapping (where the point
        // may have moved far from the cursor, breaking proximity detection).
        const storedDragIdx = (event.overlay as any).__activeDragAnchorIndex;
        if (typeof storedDragIdx === 'number' && storedDragIdx >= 0 && storedDragIdx < points.length) {
          draggedIndex = storedDragIdx;
        }
        if (draggedIndex < 0 && key.includes('-anchor-')) {
          const parts = key.split('-anchor-');
          draggedIndex = parseInt(parts[parts.length - 1], 10);
        } else if (draggedIndex < 0 && typeof event.figureIndex === 'number' && event.figureIndex >= 0) {
          draggedIndex = event.figureIndex;
        } else if (draggedIndex < 0 && typeof event.figure?.figureIndex === 'number' && event.figure.figureIndex >= 0) {
          draggedIndex = event.figure.figureIndex;
        }

        const chart = (globalThis as any).__active_chart_instance__;
        if (!chart || typeof chart.convertFromPixel !== 'function') return false;

        const axes = overlayAxesMap.get(event.overlay.id);
        const xAxis = axes?.xAxis;
        const yAxis = axes?.yAxis;
        if (!xAxis || !yAxis) return false;

        if (draggedIndex < 0 && points.length > 0 && typeof event.x === 'number' && typeof event.y === 'number') {
          let nearest = Number.POSITIVE_INFINITY;
          for (let i = 0; i < points.length; i++) {
            const px = dataIndexToPixelX(Number(points[i].dataIndex ?? 0), xAxis);
            const py = yAxis.convertToPixel(Number(points[i].value ?? 0));
            if (typeof px === 'number' && typeof py === 'number') {
              const dist = Math.hypot(event.x - px, event.y - py);
              if (dist < nearest) {
                nearest = dist;
                draggedIndex = i;
              }
            }
          }
          if (nearest > 32) draggedIndex = -1;
        }

        if (draggedIndex < 0) {
          // Body drag for all tools: translate the entire drawing smoothly following the crosshair center!
          if (points.length > 0 && typeof event.x === 'number' && typeof event.y === 'number') {
            const startMouse = (event.overlay as any).__moveStartMouse;
            const snapshot = (event.overlay as any).__prevPoints || points.__parallelMoveSnapshot;
            if (startMouse && snapshot && snapshot.length === points.length) {
              const startXInfo = pixelXToDataIndexAndTimestamp(startMouse.x, xAxis);
              const currentXInfo = pixelXToDataIndexAndTimestamp(event.x, xAxis);
              const deltaDataIndex = currentXInfo.dataIndex - startXInfo.dataIndex;

              const startPrice = yAxis.convertFromPixel(startMouse.y);
              const currentPrice = yAxis.convertFromPixel(event.y);
              const deltaPrice = (currentPrice ?? 0) - (startPrice ?? 0);

              const chart = (globalThis as any).__active_chart_instance__;
              const dataList = chart && typeof chart.getDataList === 'function' ? chart.getDataList() : [];
              let timeDiff = 24 * 60 * 60 * 1000;
              if (dataList && dataList.length >= 2) {
                timeDiff = Math.abs(Number(dataList[dataList.length - 1].timestamp) - Number(dataList[dataList.length - 2].timestamp));
              }

              for (let i = 0; i < points.length; i++) {
                const basePt = snapshot[i];
                if (basePt) {
                  const newIdx = Number(basePt.dataIndex ?? 0) + deltaDataIndex;
                  points[i].dataIndex = newIdx;
                  points[i].timestamp = Number(basePt.timestamp ?? 0) + deltaDataIndex * timeDiff;
                  points[i].value = Number(basePt.value ?? 0) + deltaPrice;
                }
              }
              event.overlay.points = [...points];
              try {
                chart._chartStore?.setCrosshair?.({ x: event.x, y: event.y, paneId: 'candle_pane' }, { forceInvalidate: true });
              } catch (e) {}
              return true;
            }
          }
          return false;
        }

        if (isNaN(draggedIndex) || draggedIndex < 0 || draggedIndex >= points.length) return false;

        if (typeof event.x === 'number' && typeof event.y === 'number') {
          const snapped = applyMagnetSnap(event.x, event.y, xAxis, yAxis, chart);
          if (snapped.value !== null && Number.isFinite(Number(snapped.value))) {
            const dataIndex = snapped.dataIndex;
            const timestamp = snapped.timestamp;
            const draggedPrice = snapped.value;

            // If polyline is closed, check that BEFORE updating points
            let isClosed = false;
            if (event.overlay.name === 'polyline' && points.length > 2) {
              const lastIdx = points.length - 1;
              isClosed = (event.overlay.extendData?.__polylineClosed === true) ||
                (Math.abs(Number(points[0].dataIndex) - Number(points[lastIdx].dataIndex)) < 0.01 &&
                  Math.abs(Number(points[0].value) - Number(points[lastIdx].value)) < (Number(points[0].value) * 0.02 || 1));
            }

            points[draggedIndex].dataIndex = dataIndex;
            points[draggedIndex].timestamp = timestamp;
            points[draggedIndex].value = Number(draggedPrice);

            // Fib Retracement: Last anchor point (index 2) must not pass behind Anchor 1 (index 1) and must maintain a small gap
            if ((def.type === 'fib-retracement' || event.overlay.name === 'fib-retracement' || event.overlay.name === 'fibonacciLine') && points.length >= 3) {
              if (draggedIndex === 2) {
                if (points[1] && points[1].dataIndex !== undefined) {
                  const minDataIdx = Number(points[1].dataIndex) + 1;
                  const minTs = Number(points[1].timestamp ?? points[1].dataIndex) + 1;
                  if (Number(points[2].dataIndex) < minDataIdx) {
                    points[2].dataIndex = minDataIdx;
                    points[2].timestamp = minTs;
                  }
                }
                if (points[1] && points[1].value !== undefined) {
                  points[2].value = points[1].value;
                }
              } else if (draggedIndex === 1) {
                if (points[2] && points[2].dataIndex !== undefined && points[1].dataIndex !== undefined) {
                  if (Number(points[2].dataIndex) < Number(points[1].dataIndex) + 1) {
                    points[2].dataIndex = Number(points[1].dataIndex) + 1;
                    points[2].timestamp = Number(points[1].timestamp ?? points[1].dataIndex) + 1;
                  }
                }
              }
            }

            // Fib Extension: Last anchor point (index 3) must not pass behind Anchor 2 (index 2) and must maintain a small gap
            if ((def.type === 'fib-extension' || event.overlay.name === 'fib-extension' || event.overlay.name === 'fibExtension') && points.length >= 4) {
              if (draggedIndex === 3) {
                if (points[2] && points[2].dataIndex !== undefined) {
                  const minDataIdx = Number(points[2].dataIndex) + 1;
                  const minTs = Number(points[2].timestamp ?? points[2].dataIndex) + 1;
                  if (Number(points[3].dataIndex) < minDataIdx) {
                    points[3].dataIndex = minDataIdx;
                    points[3].timestamp = minTs;
                  }
                }
                if (points[2] && points[2].value !== undefined) {
                  points[3].value = points[2].value;
                }
              } else if (draggedIndex === 2) {
                if (points[3] && points[3].dataIndex !== undefined && points[2].dataIndex !== undefined) {
                  if (Number(points[3].dataIndex) < Number(points[2].dataIndex) + 1) {
                    points[3].dataIndex = Number(points[2].dataIndex) + 1;
                    points[3].timestamp = Number(points[2].timestamp ?? points[2].dataIndex) + 1;
                  }
                }
              }
            }

            // Fib Wedge: when Anchor 1 (index 1) or Anchor 2 (index 2) is dragged,
            // automatically synchronize the other point's distance from Apex (index 0)
            // so both points spread like a fan with matching radius
            if ((def.type === 'fib-wedge' || def.type === 'fibWedge' || event.overlay.name === 'fib-wedge') && points.length >= 3) {
              const p0X = xAxis.convertToPixel(Number(points[0].dataIndex ?? 0));
              const p0Y = yAxis.convertToPixel(Number(points[0].value ?? 0));
              const p1X = xAxis.convertToPixel(Number(points[1].dataIndex ?? 0));
              const p1Y = yAxis.convertToPixel(Number(points[1].value ?? 0));
              const p2X = xAxis.convertToPixel(Number(points[2].dataIndex ?? 0));
              const p2Y = yAxis.convertToPixel(Number(points[2].value ?? 0));

              if (p0X != null && p0Y != null && p1X != null && p1Y != null && p2X != null && p2Y != null) {
                if (draggedIndex === 1) {
                  const R = Math.hypot(p1X - p0X, p1Y - p0Y);
                  if (R > 0) {
                    const angle2 = Math.atan2(p2Y - p0Y, p2X - p0X);
                    const newP2X = p0X + R * Math.cos(angle2);
                    const newP2Y = p0Y + R * Math.sin(angle2);
                    const info2 = pixelXToDataIndexAndTimestamp(newP2X, xAxis);
                    const val2 = yAxis.convertFromPixel(newP2Y);
                    if (Number.isFinite(info2.dataIndex) && val2 != null && Number.isFinite(val2)) {
                      points[2].dataIndex = info2.dataIndex;
                      points[2].timestamp = info2.timestamp;
                      points[2].value = val2;
                    }
                  }
                } else if (draggedIndex === 2) {
                  const R = Math.hypot(p2X - p0X, p2Y - p0Y);
                  if (R > 0) {
                    const angle1 = Math.atan2(p1Y - p0Y, p1X - p0X);
                    const newP1X = p0X + R * Math.cos(angle1);
                    const newP1Y = p0Y + R * Math.sin(angle1);
                    const info1 = pixelXToDataIndexAndTimestamp(newP1X, xAxis);
                    const val1 = yAxis.convertFromPixel(newP1Y);
                    if (Number.isFinite(info1.dataIndex) && val1 != null && Number.isFinite(val1)) {
                      points[1].dataIndex = info1.dataIndex;
                      points[1].timestamp = info1.timestamp;
                      points[1].value = val1;
                    }
                  }
                }
              }
            }

            // If it was closed, make sure both endpoints move together as one point
            if (isClosed && event.overlay.name === 'polyline' && points.length > 2) {
              const lastIdx = points.length - 1;
              const figIdx = event.figure?.figureIndex !== undefined ? event.figure.figureIndex : event.figureIndex;
              const isJointDragging = draggedIndex === 0 || draggedIndex === lastIdx || figIdx === 0 || figIdx === lastIdx;

              if (isJointDragging) {
                points[0].dataIndex = dataIndex;
                points[0].timestamp = timestamp;
                points[0].value = Number(draggedPrice);

                points[lastIdx].dataIndex = dataIndex;
                points[lastIdx].timestamp = timestamp;
                points[lastIdx].value = Number(draggedPrice);

                if (!event.overlay.extendData) event.overlay.extendData = {};
                event.overlay.extendData.__polylineClosed = true;
              }
            }
            try {
              const crossX = (snapped && typeof snapped.snappedX === 'number') ? snapped.snappedX : event.x;
              const crossY = (snapped && typeof snapped.snappedY === 'number') ? snapped.snappedY : event.y;
              chart._chartStore?.setCrosshair?.({ x: crossX, y: crossY, paneId: 'candle_pane' }, { forceInvalidate: true });
            } catch (e) {}
            return true;
          }
        }
        return false;
      }
    }) as any,
    performEventPressedMove: (def.type === 'parallel-channel' ? (_params: any) => {
      // All parallel-channel drag logic is handled in onPressedMoving.
      // Leaving this as a no-op prevents two handlers from fighting and
      // causing visual flickering.
    } : def.type === 'disjoint-channel' ? (params: any) => {
      const points = params.points;
      const snapshot = (points as any).__parallelMoveSnapshot;
      if (!points || points.length < 4 || !snapshot || snapshot.length < 4) return;

      const index = Number(params.performPointIndex);
      if (index < 0 || index > 3) return;

      const source = snapshot[index];
      const moved = points[index];
      const deltaIndex = Number(moved.dataIndex ?? 0) - Number(source.dataIndex ?? 0);
      const deltaTime = Number(moved.timestamp ?? 0) - Number(source.timestamp ?? 0);
      const deltaValue = Number(moved.value ?? 0) - Number(source.value ?? 0);

      // Copy values and base coordinates from snapshot
      for (let i = 0; i < 4; i++) {
        points[i] = { ...snapshot[i] };
      }

      // Horizontal pair synchronization & Vertical mirroring
      if (index === 0) {
        points[0].dataIndex = Number(snapshot[0].dataIndex ?? 0) + deltaIndex;
        points[0].timestamp = Number(snapshot[0].timestamp ?? 0) + deltaTime;
        points[0].value = Number(snapshot[0].value ?? 0) + deltaValue;
        points[2].dataIndex = Number(snapshot[2].dataIndex ?? 0) + deltaIndex;
        points[2].timestamp = Number(snapshot[2].timestamp ?? 0) + deltaTime;
        points[2].value = Number(snapshot[2].value ?? 0) - deltaValue;
      } else if (index === 1) {
        points[1].dataIndex = Number(snapshot[1].dataIndex ?? 0) + deltaIndex;
        points[1].timestamp = Number(snapshot[1].timestamp ?? 0) + deltaTime;
        points[1].value = Number(snapshot[1].value ?? 0) + deltaValue;
        points[3].dataIndex = Number(snapshot[3].dataIndex ?? 0) + deltaIndex;
        points[3].timestamp = Number(snapshot[3].timestamp ?? 0) + deltaTime;
        points[3].value = Number(snapshot[3].value ?? 0) - deltaValue;
      } else if (index === 2) {
        points[2].dataIndex = Number(snapshot[2].dataIndex ?? 0) + deltaIndex;
        points[2].timestamp = Number(snapshot[2].timestamp ?? 0) + deltaTime;
        points[2].value = Number(snapshot[2].value ?? 0) + deltaValue;
        points[0].dataIndex = Number(snapshot[0].dataIndex ?? 0) + deltaIndex;
        points[0].timestamp = Number(snapshot[0].timestamp ?? 0) + deltaTime;
        points[0].value = Number(snapshot[0].value ?? 0) - deltaValue;
      } else if (index === 3) {
        points[3].dataIndex = Number(snapshot[3].dataIndex ?? 0) + deltaIndex;
        points[3].timestamp = Number(snapshot[3].timestamp ?? 0) + deltaTime;
        points[3].value = Number(snapshot[3].value ?? 0) + deltaValue;
        points[1].dataIndex = Number(snapshot[1].dataIndex ?? 0) + deltaIndex;
        points[1].timestamp = Number(snapshot[1].timestamp ?? 0) + deltaTime;
        points[1].value = Number(snapshot[1].value ?? 0) - deltaValue;
      }
    } : def.type === 'flat-top-bottom' ? (_params: any) => {
      // Handled in onPressedMoving
    } : undefined) as any,
    createPointFigures: (params: OverlayCreateFiguresCallbackParams<any>) => {
      const { coordinates, bounding, overlay, xAxis, yAxis } = params;
      if (overlay.visible === false) {
        return [];
      }
      const { isSelected, isHovered, isDrawing } = getOverlayState(overlay);

      // Backfill missing timestamps on overlay points
      if (xAxis && overlay.points && coordinates) {
        for (let i = 0; i < overlay.points.length; i++) {
          const pt = overlay.points[i];
          if (pt && coordinates[i]) {
            if (typeof pt.timestamp !== 'number' || isNaN(pt.timestamp) || pt.timestamp === 0) {
              const { timestamp } = pixelXToDataIndexAndTimestamp(coordinates[i].x, xAxis);
              if (timestamp) pt.timestamp = timestamp;
            }
          }
        }
      }

      // Re-sync dataIndex from timestamp ONLY when historical candles are prepended
      // (i.e., dataList[0].timestamp changes because older bars were loaded on scroll-left).
      // We must NEVER re-sync when panning right or loading future candles.
      if (overlay.points && overlay.points.length > 0 && !isDrawing) {
        try {
          const charts = Array.from((window as any).globalCoreCharts || []);
          const activeChart = ((window as any).__active_chart_instance__ || charts[0]) as any;
          const dataList = activeChart && typeof activeChart.getDataList === 'function' ? activeChart.getDataList() : [];
          if (dataList.length > 0) {
            const firstCandleTs = Number(dataList[0].timestamp);
            const lastKnownFirstTs = (overlay as any).__lastFirstCandleTs;

            if (lastKnownFirstTs === undefined) {
              (overlay as any).__lastFirstCandleTs = firstCandleTs;
            } else if (lastKnownFirstTs !== firstCandleTs) {
              (overlay as any).__lastFirstCandleTs = firstCandleTs;
              for (let i = 0; i < overlay.points.length; i++) {
                const pt = overlay.points[i];
                if (pt && typeof pt.timestamp === 'number' && pt.timestamp > 0) {
                  const correctIndex = timestampToDataIndex(pt.timestamp, dataList);
                  if (correctIndex !== pt.dataIndex) {
                    pt.dataIndex = correctIndex;
                  }
                }
              }
            }
          }
        } catch (e) {}
      }

      if ((def.type === 'long-position' || def.type === 'short-position') && coordinates.length >= 4 && yAxis) {
        const p0 = overlay.points[0];
        const p1 = overlay.points[1];
        const p2 = overlay.points[2];

        if (p0 && p1 && p2) {
          let lastTime = (overlay as any).__lastLeftTime;
          let lastIdx = (overlay as any).__lastLeftIndex;

          if (lastTime === undefined) {
            lastTime = p0.timestamp;
            lastIdx = p0.dataIndex;
          }

          let currentLeftTime = lastTime;
          let currentLeftIndex = lastIdx;

          if (p1.timestamp !== lastTime || p1.dataIndex !== lastIdx) {
            currentLeftTime = p1.timestamp;
            currentLeftIndex = p1.dataIndex;
          } else if (p2.timestamp !== lastTime || p2.dataIndex !== lastIdx) {
            currentLeftTime = p2.timestamp;
            currentLeftIndex = p2.dataIndex;
          }

          p0.timestamp = currentLeftTime;
          p0.dataIndex = currentLeftIndex;
          p1.timestamp = currentLeftTime;
          p1.dataIndex = currentLeftIndex;
          p2.timestamp = currentLeftTime;
          p2.dataIndex = currentLeftIndex;

          (overlay as any).__lastLeftTime = currentLeftTime;
          (overlay as any).__lastLeftIndex = currentLeftIndex;

          if (xAxis) {
            const indexOrTime = currentLeftIndex !== undefined && Number.isFinite(currentLeftIndex) ? currentLeftIndex : currentLeftTime;
            const lockedX = xAxis.convertToPixel(indexOrTime);
            if (lockedX !== null) {
              if (coordinates[0]) coordinates[0].x = lockedX;
              if (coordinates[1]) coordinates[1].x = lockedX;
              if (coordinates[2]) coordinates[2].x = lockedX;
            }
          }
        }

        const x0 = coordinates[0]?.x;
        // Fix coordinates[3].x for future indices using barSpace extrapolation
        if (xAxis && overlay.points[3]) {
          const p3DataIndex = Number(overlay.points[3].dataIndex ?? 0);
          const correctedX3 = dataIndexToPixelX(p3DataIndex, xAxis);
          if (coordinates[3] && typeof correctedX3 === 'number' && !isNaN(correctedX3)) {
            coordinates[3].x = correctedX3;
          }
        }
        const x3 = coordinates[3]?.x;
        if (x0 !== undefined) {
          if (coordinates[1]) {
            coordinates[1].x = x0;
            const y1 = yAxis.convertToPixel(overlay.points[1].value ?? 0);
            if (y1 !== null) coordinates[1].y = y1;
          }
          if (coordinates[2]) {
            coordinates[2].x = x0;
            const y2 = yAxis.convertToPixel(overlay.points[2].value ?? 0);
            if (y2 !== null) coordinates[2].y = y2;
          }
        }
        if (x3 !== undefined && coordinates[3] && coordinates[0]) {
          coordinates[3].y = coordinates[0].y;
        }
      }

      if (def.type === 'parallel-channel' || def.type === 'disjoint-channel' || def.type === 'flat-top-bottom' || def.type === 'long-position' || def.type === 'short-position' || def.type === 'polyline' || def.type === 'path') {
        // Keep Ticker Pen' native point hit areas for dragging, but hide its
        // circles. The visible handles are drawn below at the exact boundary
        // and midpoint coordinates.
        overlay.styles = {
          ...(overlay.styles || {}),
          point: {
            ...((overlay.styles as any)?.point || {}),
            color: 'rgba(0,0,0,0)',
            borderColor: 'rgba(0,0,0,0)',
            activeColor: 'rgba(0,0,0,0)',
            activeBorderColor: 'rgba(0,0,0,0)'
          }
        } as any;
      }
      // Save axes for dragging calculations
      overlayAxesMap.set(overlay.id, { xAxis, yAxis });
      if (def.type === 'disjoint-channel') {
        if (coordinates.length >= 4 && coordinates[0] && coordinates[1] && coordinates[2] && coordinates[3]) {
          coordinates[2].x = coordinates[0].x;
          coordinates[3].x = coordinates[1].x;
        }
      }
      if (def.type === 'flat-top-bottom') {
        if (coordinates.length >= 4 && coordinates[0] && coordinates[1] && coordinates[2] && coordinates[3]) {
          coordinates[2].x = coordinates[0].x;
          coordinates[3].x = coordinates[1].x;
          coordinates[3].y = coordinates[2].y;
        }
      }
      if (def.type === 'polyline' && coordinates[0]) {
        (overlay as any).__firstCoordinate = coordinates[0];
      }

      // Ticker Pen resolves overlay timestamps to pixel coordinates for us.
      // Its xAxis converter uses logical bar indexes, not timestamps, so use
      // those resolved points for exact anchors and interpolate when a tool
      // generates a point between or beyond its anchors.
      const timeToCoordinate = (time: any): number | null => {
        const dataIdx = Number(time);
        const points = overlay.points || [];
        const usesTimestamp = Math.abs(dataIdx) > 1e11 || points.some((point: any) => Number(point.timestamp) === dataIdx);
        const exactIndex = points.findIndex((point: any) => usesTimestamp
          ? Number(point.timestamp) === dataIdx
          : Number(point.dataIndex) === dataIdx);
        if (exactIndex >= 0 && coordinates[exactIndex]?.x !== undefined) {
          return coordinates[exactIndex].x;
        }

        for (let index = 1; index < points.length; index++) {
          const prevIdx = usesTimestamp ? Number(points[index - 1].timestamp) : Number(points[index - 1].dataIndex);
          const currIdx = usesTimestamp ? Number(points[index].timestamp) : Number(points[index].dataIndex);
          const previousX = coordinates[index - 1]?.x;
          const currentX = coordinates[index]?.x;
          if (previousX === undefined || currentX === undefined || currIdx === prevIdx) continue;
          const ratio = (dataIdx - prevIdx) / (currIdx - prevIdx);
          return previousX + (currentX - previousX) * ratio;
        }

        return xAxis ? dataIndexToPixelX(dataIdx, xAxis) : null;
      };

      if ((def.type === 'long-position' || def.type === 'short-position') && overlay.points.length < 4) {
        return [];
      }

      // Translate Ticker Pen point timestamps and values to Anchors
      const anchors = overlay.points.map((pt) => {
        return {
          time: (pt.timestamp ?? 0) as any,
          price: pt.value ?? 0,
          dataIndex: pt.dataIndex
        };
      });



      // Pad anchors to required length during drawing placement
      if (
        def.type !== 'curve' &&
        def.type !== 'double-curve' &&
        def.type !== 'flat-top-bottom' &&
        anchors.length >= 1 &&
        anchors.length < def.requiredAnchors
      ) {
        const lastAnchor = anchors[anchors.length - 1];
        while (anchors.length < def.requiredAnchors) {
          anchors.push({ ...lastAnchor });
        }
      }
      const isSinglePointMarker = def.type === 'signpost' ||
                                  def.type === 'pin' ||
                                  def.type === 'flag' ||
                                  def.type === 'flag-mark' ||
                                  overlay.name === 'signpost' ||
                                  overlay.name === 'pin' ||
                                  overlay.name === 'flag' ||
                                  overlay.name === 'flag-mark';

      const isStart = typeof (overlay as any).isStart === 'function' ? (overlay as any).isStart() : (overlay.currentStep === 1 || overlay.currentStep === 0);
      if (isDrawing && isStart && !isSinglePointMarker) {
        return [];
      }

      if (anchors.length < 1) {
        return [];
      }

      // Construct a mock Viewport that redirects coordinate translation to Ticker Pen axes
      const viewport = {
        width: bounding.width,
        height: bounding.height,
        timeScale: {
          coordinateToTime: (x: number) => {
            if (!xAxis) return null;
            return pixelXToDataIndexAndTimestamp(x, xAxis).dataIndex;
          },
          timeToCoordinate: (time: any) => {
            if (!xAxis) return null;
            return timeToCoordinate(time);
          },
          logicalToCoordinate: (logical: any) => {
            return logical;
          }
        },
        priceScale: {
          coordinateToPrice: (y: number) => {
            if (!yAxis) return null;
            return yAxis.convertFromPixel(y);
          },
          priceToCoordinate: (price: number) => {
            if (!yAxis) return null;
            return yAxis.convertToPixel(price);
          }
        }
      };

      // Instantiate the drawing tool using the library's registry factory
      let drawingStyle = (overlay.styles || {}) as any;
      const stylesAny = (overlay.styles || {}) as any;
      const rawWidth = [
        overlay.extendData?.lineWidth,
        overlay.extendData?.trendlineWidth,
        overlay.extendData?.levelLineWidth,
        overlay.extendData?.medianWidth,
        overlay.extendData?.gridLineWidth,
        overlay.extendData?.channelLineWidth,
        overlay.extendData?.brushSize,
        overlay.extendData?.highlighterWidth,
        overlay.extendData?.borderSize,
        (stylesAny.line?.size && stylesAny.line.size > 0) ? stylesAny.line.size : undefined,
        (stylesAny.line?.lineWidth && stylesAny.line.lineWidth > 0) ? stylesAny.line.lineWidth : undefined,
        (stylesAny.lines?.[0]?.size && stylesAny.lines[0].size > 0) ? stylesAny.lines[0].size : undefined,
        (stylesAny.polygon?.borderSize && stylesAny.polygon.borderSize > 0) ? stylesAny.polygon.borderSize : undefined,
        (stylesAny.rect?.borderSize && stylesAny.rect.borderSize > 0) ? stylesAny.rect.borderSize : undefined,
        (stylesAny.circle?.borderSize && stylesAny.circle.borderSize > 0) ? stylesAny.circle.borderSize : undefined,
        (stylesAny.arc?.borderSize && stylesAny.arc.borderSize > 0) ? stylesAny.arc.borderSize : undefined,
        (stylesAny.lineWidth && stylesAny.lineWidth > 0) ? stylesAny.lineWidth : undefined,
        (stylesAny.size && stylesAny.size > 0) ? stylesAny.size : undefined,
        (stylesAny.borderSize && stylesAny.borderSize > 0) ? stylesAny.borderSize : undefined
      ].find(w => typeof w === 'number' && w > 0) || (def.type === 'highlighter' ? 20 : ((def.type === 'brush' || def.type === 'fib-spiral' || def.type === 'fibSpiral') ? 2 : 1));

      drawingStyle = { ...drawingStyle, lineWidth: rawWidth, size: rawWidth };

      const colorCandidates = [
        overlay.extendData?.lineColor,
        overlay.extendData?.strokeColor,
        overlay.extendData?.color,
        (stylesAny.line?.color && !isColorTransparent(stylesAny.line.color)) ? stylesAny.line.color : undefined,
        (stylesAny.color && !isColorTransparent(stylesAny.color)) ? stylesAny.color : undefined
      ];

      const defaultToolColor = (def.type === 'arrow-mark-up' || def.type === 'arrowMarkUp')
        ? '#089981'
        : (def.type === 'arrow-mark-down' || def.type === 'arrowMarkDown')
        ? '#f23645'
        : '#2962FF';
      const rawLineColor = colorCandidates.find(c => c && !isColorTransparent(c)) || defaultToolColor;
      drawingStyle = { ...drawingStyle, lineColor: rawLineColor, color: rawLineColor };

      const fillCandidates = [
        overlay.extendData?.fillColor,
        (stylesAny.fillColor && !isColorTransparent(stylesAny.fillColor)) ? stylesAny.fillColor : undefined,
        (stylesAny.polygon?.color && !isColorTransparent(stylesAny.polygon.color)) ? stylesAny.polygon.color : undefined,
        (stylesAny.rect?.color && !isColorTransparent(stylesAny.rect.color)) ? stylesAny.rect.color : undefined,
        (stylesAny.circle?.color && !isColorTransparent(stylesAny.circle.color)) ? stylesAny.circle.color : undefined
      ];

      const rawFillColor = fillCandidates.find(f => f && !isColorTransparent(f));
      if (rawFillColor) {
        drawingStyle = { ...drawingStyle, fillColor: rawFillColor };
      }
      if (overlay.extendData?.lineDash || overlay.styles?.lineDash) {
        drawingStyle = { ...drawingStyle, lineDash: overlay.extendData?.lineDash || overlay.styles?.lineDash };
      }
      if (overlay.extendData?.lineStyle || overlay.styles?.lineStyle) {
        drawingStyle = { ...drawingStyle, lineStyle: overlay.extendData?.lineStyle || overlay.styles?.lineStyle };
      }
      if (def.type === 'zoomInBox' || def.type === 'zoom-in-box') {
        drawingStyle = {
          lineColor: 'rgba(0, 0, 0, 0)',
          lineWidth: 0,
          lineDash: [],
          fillColor: 'rgba(41, 98, 255, 0.16)',
          visible: true
        };
      }

      const toolInstance = def.factory(
        overlay.id || 'overlay',
        anchors,
        drawingStyle,
        {
          ...(overlay.extendData || {}),
          lineColor: overlay.extendData?.lineColor ?? rawLineColor,
          ...(rawWidth !== undefined ? {
            lineWidth: rawWidth,
            trendlineWidth: rawWidth,
            levelLineWidth: rawWidth,
            medianWidth: rawWidth,
            gridLineWidth: rawWidth,
            channelLineWidth: rawWidth,
            brushSize: rawWidth,
            highlighterWidth: rawWidth,
            borderSize: rawWidth
          } : {}),
          ...(overlay.extendData?.lineOpacity !== undefined ? { opacity: overlay.extendData.lineOpacity } : (def.type === 'highlighter' ? { opacity: 0.4 } : {})),
          ...(overlay.extendData?.fillColor !== undefined ? { filled: overlay.extendData?.fillColor !== 'transparent' && overlay.extendData?.fillColor !== 'rgba(0, 0, 0, 0)' } : {})
        }
      );

      const isDrawingEarly = isDrawing && ((overlay.currentStep != null && overlay.currentStep < 2) || (overlay.points && overlay.points.length < 3));
      (toolInstance as any)._isDrawingEarly = isDrawingEarly;

      // Automatically toggle upsideDown for signpost based on position relative to candle
      if (def.type === 'signpost') {
        const anchorPoint = overlay.points[0];
        const firstCoord = coordinates[0];
        if (anchorPoint && firstCoord && xAxis && yAxis && typeof firstCoord.x === 'number' && !isNaN(firstCoord.x)) {
          const dataIndex = Math.round(xAxis.convertFromPixel(firstCoord.x));
          // Snap X coordinate to the candle center
          const snappedCandleX = dataIndexToPixelX(dataIndex, xAxis);
          if (typeof snappedCandleX === 'number' && !isNaN(snappedCandleX)) {
            firstCoord.x = snappedCandleX;
          }
          const charts = getActiveGlobalCoreCharts();
          const chart = charts.find((c: any) => {
            try {
              return c.getOverlays({ id: overlay.id }).length > 0;
            } catch (e) {
              return false;
            }
          }) || (window as any).__active_chart_instance__;

          const dataList = chart && typeof chart.getDataList === 'function' ? chart.getDataList() : [];
          let candle = dataList[dataIndex];
          if (!candle && dataList.length > 0) {
            candle = dataList[dataList.length - 1];
          }
          if (candle) {
            const candleMid = (Number(candle.high) + Number(candle.low)) / 2;
            const anchorPrice = Number(anchorPoint.value);
            const isBelow = anchorPrice < candleMid;

            // Calculate dynamic extraPoleHeight to anchor the pole bottom to the candle top/bottom during zoom out
            const candleHighY = yAxis.convertToPixel(Number(candle.high)) ?? firstCoord.y;
            const candleLowY = yAxis.convertToPixel(Number(candle.low)) ?? firstCoord.y;
            const y = firstCoord.y;
            const text = (overlay.extendData?.text) ?? 'Add text';
            const fontSize = (overlay.extendData?.fontSize ?? 11);
            const paddingY = 6;
            const lines = text.split('\n');
            const boardHeight = (fontSize * lines.length) + (lines.length - 1) * 4 + paddingY * 2;
            const baseBoardHeight = fontSize + paddingY * 2;
            const scaleTop = baseBoardHeight / 13.17;
            const boardTopOffset = 8.886 * scaleTop;

            const upsideDown = isBelow;

            const candleGap = 6; // Tiny gap between the pole tip and the candle/wick
            let extraPoleHeight = 0;
            if (!upsideDown) {
              // Hanging down: pole extends from bottom of board towards candle high with a tiny gap
              const boardBottomY = y + boardTopOffset + boardHeight;
              const targetY = candleHighY - candleGap;
              const neededPoleHeight = Math.max(10, targetY - boardBottomY);
              extraPoleHeight = neededPoleHeight - 40;
            } else {
              // Standing up: pole extends from top of board towards candle low with a tiny gap
              const boardTopY = y - boardTopOffset - boardHeight;
              const targetY = candleLowY + candleGap;
              const neededPoleHeight = Math.max(10, boardTopY - targetY);
              extraPoleHeight = neededPoleHeight - 40;
            }

            if (toolInstance && typeof (toolInstance as any).setSignpostOptions === 'function') {
              (toolInstance as any).setSignpostOptions({
                upsideDown,
                extraPoleHeight
              });
            } else if (toolInstance && (toolInstance as any).signpostOptions) {
              (toolInstance as any).signpostOptions.upsideDown = upsideDown;
              (toolInstance as any).signpostOptions.extraPoleHeight = extraPoleHeight;
            }
            if (overlay.extendData) {
              overlay.extendData.upsideDown = upsideDown;
              overlay.extendData.extraPoleHeight = extraPoleHeight;
            }
          }
        }
      }
      
      if (def.type === 'vertical-line') {
        const timeToCoord = viewport.timeScale.timeToCoordinate;
        (viewport.timeScale as any).timeToCoordinate = (t: any) => {
          if (coordinates[0]?.x !== undefined) return coordinates[0].x;
          return timeToCoord(t);
        };
      }

      if (def.type === 'horizontal-ray') {
        const timeToCoord = viewport.timeScale.timeToCoordinate;
        (viewport.timeScale as any).timeToCoordinate = (t: any) => {
          if (coordinates[0]?.x !== undefined) return coordinates[0].x;
          return timeToCoord(t);
        };
      }

      if (def.type === 'horizontal-line') {
        const priceToCoord = viewport.priceScale.priceToCoordinate;
        (viewport.priceScale as any).priceToCoordinate = (p: any) => {
          if (coordinates[0]?.y !== undefined) return coordinates[0].y;
          return priceToCoord(p);
        };
      }

      if (def.type === 'regression-trend') {
        if (overlay.points[0] && overlay.points[1]) {
          const p1Idx = overlay.points[0].dataIndex ?? overlay.points[0].timestamp;
          const p2Idx = overlay.points[1].dataIndex ?? overlay.points[1].timestamp;
          if (p1Idx !== undefined && p2Idx !== undefined && p1Idx !== p2Idx && xAxis && yAxis) {
            const chart = (window as any).__active_chart_instance__;
            const dataList = chart && typeof chart.getDataList === 'function' ? chart.getDataList() : [];
            if (dataList.length > 0) {
              const from = Math.min(Number(p1Idx), Number(p2Idx));
              const to = Math.max(Number(p1Idx), Number(p2Idx));
              const regressionPoints = (toolInstance as any).anchors;
              const priceReg = (toolInstance as any).calculatePriceRegression?.();
              if (priceReg && Number.isFinite(priceReg.startPrice) && Number.isFinite(priceReg.endPrice)) {
                const firstBaseY = yAxis.convertToPixel(priceReg.startPrice);
                const secondBaseY = yAxis.convertToPixel(priceReg.endPrice);
                if (firstBaseY !== null && secondBaseY !== null && Number.isFinite(firstBaseY) && Number.isFinite(secondBaseY)) {
                  if (coordinates[0]) coordinates[0].y = firstBaseY;
                  if (coordinates[1]) coordinates[1].y = secondBaseY;
                }
              }
            }
          }
        }
      }

      // Snap flag-mark X coordinate to the nearest candle center
      if (def.type === 'flag-mark') {
        const firstCoord = coordinates[0];
        if (firstCoord && xAxis && typeof firstCoord.x === 'number' && !isNaN(firstCoord.x)) {
          const dataIndex = Math.round(xAxis.convertFromPixel(firstCoord.x));
          const snappedCandleX = dataIndexToPixelX(dataIndex, xAxis);
          if (typeof snappedCandleX === 'number' && !isNaN(snappedCandleX)) {
            firstCoord.x = snappedCandleX;
          }
        }
      }

      if (def.type === 'regression-trend' && typeof (toolInstance as any).setRegressionValues === 'function') {
        const charts = getActiveGlobalCoreCharts();
        const chart = charts.find((c: any) => {
          try {
            return c.getOverlays({ id: overlay.id }).length > 0;
          } catch (e) {
            return false;
          }
        }) || (window as any).__active_chart_instance__ || (globalThis as any).__active_chart_instance__;

        const dataList = chart && typeof chart.getDataList === 'function' ? chart.getDataList() : [];
        let firstIndex = -1;
        let secondIndex = -1;

        if (Array.isArray(dataList) && dataList.length > 0) {
          // 1. Try finding bar index by timestamp (most accurate across zooming / historical prepending)
          if (overlay.points[0]?.timestamp) {
            firstIndex = dataList.findIndex((item: any) => item.timestamp === overlay.points[0].timestamp);
          }
          if (overlay.points[1]?.timestamp) {
            secondIndex = dataList.findIndex((item: any) => item.timestamp === overlay.points[1].timestamp);
          }

          // 2. Fall back to xAxis conversion from pixel coordinates
          if (firstIndex < 0 && xAxis && coordinates[0] && typeof coordinates[0].x === 'number') {
            firstIndex = Math.round(Number(xAxis.convertFromPixel(coordinates[0].x)));
          }
          if (secondIndex < 0 && xAxis && coordinates[1] && typeof coordinates[1].x === 'number') {
            secondIndex = Math.round(Number(xAxis.convertFromPixel(coordinates[1].x)));
          }

          // 3. Fall back to stored dataIndex
          if (firstIndex < 0 && overlay.points[0]?.dataIndex !== undefined) {
            firstIndex = Math.round(Number(overlay.points[0].dataIndex));
          }
          if (secondIndex < 0 && overlay.points[1]?.dataIndex !== undefined) {
            secondIndex = Math.round(Number(overlay.points[1].dataIndex));
          }
        }

        if (Array.isArray(dataList) && dataList.length >= 2 && Number.isFinite(firstIndex) && Number.isFinite(secondIndex) && firstIndex >= 0 && secondIndex >= 0) {
          const start = Math.max(0, Math.min(firstIndex, secondIndex));
          const end = Math.min(dataList.length - 1, Math.max(firstIndex, secondIndex));
          const source = (overlay.extendData as any)?.source || 'close';
          const rawSlice = dataList.slice(start, end + 1);
          const values = rawSlice.map((item: any) => Number(item[source] ?? item.close)).filter(Number.isFinite);

          if (values.length >= 2) {
            if (typeof (toolInstance as any).setRegressionContext === 'function') {
              (toolInstance as any).setRegressionContext(values, (price: number) => yAxis?.convertToPixel(price) ?? null);
            } else {
              (toolInstance as any).setRegressionValues(values);
            }

            const priceReg = (toolInstance as any).calculatePriceRegression?.();
            if (priceReg) {
              if (!overlay.extendData) overlay.extendData = {};
              overlay.extendData.regStartPrice = priceReg.startPrice;
              overlay.extendData.regEndPrice = priceReg.endPrice;
              overlay.extendData.regStdDev = priceReg.stdDev;
              overlay.extendData.regStartTimestamp = dataList[start]?.timestamp ?? overlay.points[0]?.timestamp;
              overlay.extendData.regEndTimestamp = dataList[end]?.timestamp ?? overlay.points[1]?.timestamp;

              // Ensure timestamps on points stay accurate
              if (overlay.points[0] && dataList[start]) {
                overlay.points[0].timestamp = dataList[start].timestamp;
                overlay.points[0].dataIndex = start;
              }
              if (overlay.points[1] && dataList[end]) {
                overlay.points[1].timestamp = dataList[end].timestamp;
                overlay.points[1].dataIndex = end;
              }

              const regressionPoints = (toolInstance as any).anchors;
              const isEditing = regressionEditingStates.get(overlay.id) === true || (overlay as any).__regressionEditing === true;
              if (!isDrawing && !isEditing && yAxis) {
                const firstBaseY = yAxis.convertToPixel(priceReg.startPrice);
                const secondBaseY = yAxis.convertToPixel(priceReg.endPrice);
                if (firstBaseY !== null && secondBaseY !== null && Number.isFinite(firstBaseY) && Number.isFinite(secondBaseY)) {
                  if (coordinates[0]) coordinates[0].y = firstBaseY;
                  if (coordinates[1]) coordinates[1].y = secondBaseY;
                  if (regressionPoints?.[0]) regressionPoints[0].price = priceReg.startPrice;
                  if (regressionPoints?.[1]) regressionPoints[1].price = priceReg.endPrice;
                  if (overlay.points[0]) overlay.points[0].value = priceReg.startPrice;
                  if (overlay.points[1]) overlay.points[1].value = priceReg.endPrice;
                }
              }
            }
          }
        } else if (overlay.extendData?.regStartPrice !== undefined && yAxis) {
          const startPrice = Number(overlay.extendData.regStartPrice);
          const endPrice = Number(overlay.extendData.regEndPrice);
          const firstBaseY = yAxis.convertToPixel(startPrice);
          const secondBaseY = yAxis.convertToPixel(endPrice);
          if (firstBaseY !== null && secondBaseY !== null && Number.isFinite(firstBaseY) && Number.isFinite(secondBaseY)) {
            if (coordinates[0]) coordinates[0].y = firstBaseY;
            if (coordinates[1]) coordinates[1].y = secondBaseY;
          }
        }
      }

      if (def.type === 'fib-extension' && toolInstance.anchors.length >= 4) {
        if (overlay.points[2] && overlay.points[3]) {
          const p2Idx = overlay.points[2].dataIndex ?? overlay.points[2].timestamp;
          const p3Idx = overlay.points[3].dataIndex ?? overlay.points[3].timestamp;
          if (p3Idx !== undefined && p2Idx !== undefined && Number(p3Idx) < Number(p2Idx) + 1) {
            const nextIdx = Number(p2Idx) + 1;
            overlay.points[3].dataIndex = nextIdx;
            overlay.points[3].timestamp = overlay.points[2].timestamp !== undefined ? Number(overlay.points[2].timestamp) + 1 : nextIdx;
            if (toolInstance.anchors[3] && toolInstance.anchors[2]) {
              toolInstance.anchors[3].time = (Number((toolInstance.anchors[2] as any).time) + 1) as any;
              (toolInstance.anchors[3] as any).dataIndex = nextIdx;
              (toolInstance.anchors[3] as any).timestamp = overlay.points[3].timestamp;
            }
          }
          if (xAxis && coordinates[3] && overlay.points[3].dataIndex !== undefined) {
            const x = xAxis.convertToPixel(overlay.points[3].dataIndex);
            if (x !== null && Number.isFinite(x)) {
              coordinates[3].x = x;
            }
          }
          overlay.points[3].value = toolInstance.anchors[3].price;
          if (yAxis && coordinates[3]) {
            const y = yAxis.convertToPixel(toolInstance.anchors[3].price);
            if (y !== null && Number.isFinite(y)) coordinates[3].y = y;
          }
        }
      }

      if (def.type === 'fib-retracement' && toolInstance.anchors.length >= 3) {
        if (overlay.points[1] && overlay.points[2]) {
          const p1Idx = overlay.points[1].dataIndex ?? overlay.points[1].timestamp;
          const p2Idx = overlay.points[2].dataIndex ?? overlay.points[2].timestamp;
          if (p2Idx !== undefined && p1Idx !== undefined && Number(p2Idx) < Number(p1Idx) + 1) {
            const nextIdx = Number(p1Idx) + 1;
            overlay.points[2].dataIndex = nextIdx;
            overlay.points[2].timestamp = overlay.points[1].timestamp !== undefined ? Number(overlay.points[1].timestamp) + 1 : nextIdx;
            if (toolInstance.anchors[2] && toolInstance.anchors[1]) {
              toolInstance.anchors[2].time = (Number((toolInstance.anchors[1] as any).time) + 1) as any;
              (toolInstance.anchors[2] as any).dataIndex = nextIdx;
              (toolInstance.anchors[2] as any).timestamp = overlay.points[2].timestamp;
            }
          }
          if (xAxis && coordinates[2] && overlay.points[2].dataIndex !== undefined) {
            const x = xAxis.convertToPixel(overlay.points[2].dataIndex);
            if (x !== null && Number.isFinite(x)) {
              coordinates[2].x = x;
            }
          }
          overlay.points[2].value = toolInstance.anchors[2].price;
          if (yAxis && coordinates[2]) {
            const y = yAxis.convertToPixel(toolInstance.anchors[2].price);
            if (y !== null && Number.isFinite(y)) coordinates[2].y = y;
          }
        }
      }



      // Price values are rendered by the Ticker Pen Y-axis figure above;
      // disable the in-pane copies so they do not get clipped at the edge.
      if (def.type === 'horizontal-line') {
        (toolInstance as any).horizontalLineOptions.showPrice = false;
      } else if (def.type === 'horizontal-ray') {
        (toolInstance as any).horizontalRayOptions.showPrice = false;
        (toolInstance as any).horizontalRayOptions.showArrowOnScale = false;
      } else if (def.type === 'cross-line') {
        (toolInstance as any).crossLineOptions.showPrice = false;
        (toolInstance as any).crossLineOptions.showTime = false;
      } else if (def.type === 'vertical-line') {
        (toolInstance as any).verticalLineOptions.showTime = false;
      }

      // Override viewport access and coordinate conversion on the instance
      (toolInstance as any).getViewport = () => viewport;
      (toolInstance as any).anchorToPixel = (anchor: any) => {
        let pointIndex = -1;
        if (toolInstance.anchors && Array.isArray(toolInstance.anchors)) {
          pointIndex = toolInstance.anchors.indexOf(anchor);
        }
        if (pointIndex < 0 && anchor) {
          pointIndex = anchor.dataIndex !== undefined
            ? overlay.points.findIndex((point: any) => Number(point.dataIndex) === Number(anchor.dataIndex) && (anchor.price === undefined || Math.abs(Number(point.value) - Number(anchor.price)) < 1e-6))
            : overlay.points.findIndex((point: any) => Number(point.timestamp) === Number(anchor.time) && (anchor.price === undefined || Math.abs(Number(point.value) - Number(anchor.price)) < 1e-6));
        }
        const x = pointIndex >= 0 && coordinates[pointIndex]?.x !== undefined
          ? coordinates[pointIndex].x
          : viewport.timeScale.timeToCoordinate(anchor.time);
        const y = pointIndex >= 0 && coordinates[pointIndex]?.y !== undefined
          ? coordinates[pointIndex].y
          : viewport.priceScale.priceToCoordinate(anchor.price);
        if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
      };

      // Configure state
      toolInstance.options.visible = (overlay as any).visible !== false;
      const placedCount = isDrawing
        ? (isSinglePointMarker ? 1 : (isStart ? 0 : (typeof overlay.currentStep === 'number' ? Math.max(0, overlay.currentStep - 1) : (overlay.points ? Math.max(0, overlay.points.length - 1) : 0))))
        : null;

      const isOverlayHovered = overlay.extendData?.__isHovered === true || isHovered;
      if (overlay.extendData?.__isEditingText === true) {
        toolInstance.state = 'editing';
      } else if (isSelected || isDrawing) {
        toolInstance.state = 'selected';
      } else if (isOverlayHovered) {
        toolInstance.state = 'hovered';
      } else {
        toolInstance.state = 'normal';
      }
      if (def.type === 'long-position' || def.type === 'short-position') {
        (toolInstance as any).isDragging = positionDragSnapshots.has(overlay.id);
      }

      // Retrieve the tool's PaneViews (renderers)
      // Regression is rendered entirely by the adapter figures below. Do
      // not also invoke its legacy pane view, otherwise the preview and the
      // completed channel are drawn twice and appear tapered/thick at the
      // candle endpoints.
      const paneViews = def.type === 'regression-trend' ? [] : toolInstance.paneViews();
      if (def.type !== 'regression-trend' && (!paneViews || paneViews.length === 0)) return [];

      const regressionFigures: any[] = [];
      const spiralFigures: any[] = [];
      if (def.type === 'fib-spiral' && coordinates.length >= 2 && coordinates[0] && coordinates[1]) {
        overlay.styles = {
          ...(overlay.styles || {}),
          line: {
            ...((overlay.styles as any)?.line || {}),
            style: 'solid'
          }
        } as any;
      }
      if (def.type === 'regression-trend'
        && coordinates.length >= 2
        && coordinates[0]
        && coordinates[1]) {
        const isEditing = regressionEditingStates.get(overlay.id) === true || (overlay as any).__regressionEditing === true;
        const { isDrawing } = getOverlayState(overlay);
        const first = coordinates[0];
        const second = coordinates[1];
        const options = (toolInstance as any).channelOptions || {};
        const upperDev = options.upperDeviation ?? options.standardDeviations ?? 2;
        const lowerDev = options.lowerDeviation ?? options.standardDeviations ?? 2;

        const priceReg = (toolInstance as any).calculatePriceRegression?.();
        const startPrice = priceReg?.startPrice ?? overlay.extendData?.regStartPrice;
        const endPrice = priceReg?.endPrice ?? overlay.extendData?.regEndPrice;
        const stdDevPrice = priceReg?.stdDev ?? overlay.extendData?.regStdDev;

        let baseFirst = { x: first.x, y: first.y };
        let baseSecond = { x: second.x, y: second.y };
        let upperFirst = { x: first.x, y: first.y };
        let upperSecond = { x: second.x, y: second.y };
        let lowerFirst = { x: first.x, y: first.y };
        let lowerSecond = { x: second.x, y: second.y };

        if (yAxis && startPrice !== undefined && endPrice !== undefined && stdDevPrice !== undefined) {
          const y1 = yAxis.convertToPixel(startPrice);
          const y2 = yAxis.convertToPixel(endPrice);
          const y1Upper = yAxis.convertToPixel(startPrice + upperDev * stdDevPrice);
          const y2Upper = yAxis.convertToPixel(endPrice + upperDev * stdDevPrice);
          const y1Lower = yAxis.convertToPixel(startPrice - lowerDev * stdDevPrice);
          const y2Lower = yAxis.convertToPixel(endPrice - lowerDev * stdDevPrice);

          if (y1 !== null && y2 !== null && y1Upper !== null && y2Upper !== null && y1Lower !== null && y2Lower !== null) {
            baseFirst = { x: first.x, y: y1 };
            baseSecond = { x: second.x, y: y2 };
            upperFirst = { x: first.x, y: y1Upper };
            upperSecond = { x: second.x, y: y2Upper };
            lowerFirst = { x: first.x, y: y1Lower };
            lowerSecond = { x: second.x, y: y2Lower };
          }
        } else {
          const regression = (toolInstance as any).calculateRegression(first, second);
          const upper = regression.stdDev * upperDev;
          const lower = regression.stdDev * lowerDev;
          baseFirst = { x: first.x, y: regression.slope * first.x + regression.intercept };
          baseSecond = { x: second.x, y: regression.slope * second.x + regression.intercept };
          upperFirst = { x: baseFirst.x, y: baseFirst.y - upper };
          upperSecond = { x: baseSecond.x, y: baseSecond.y - upper };
          lowerFirst = { x: baseFirst.x, y: baseFirst.y + lower };
          lowerSecond = { x: baseSecond.x, y: baseSecond.y + lower };
        }

        const stylesAny = (overlay.styles || {}) as any;
        const colorCandidates = [
          overlay.extendData?.lineColor,
          overlay.extendData?.strokeColor,
          overlay.extendData?.color,
          (stylesAny.line?.color && !isColorTransparent(stylesAny.line.color)) ? stylesAny.line.color : undefined,
          (stylesAny.color && !isColorTransparent(stylesAny.color)) ? stylesAny.color : undefined
        ];
        const color = colorCandidates.find(c => c && !isColorTransparent(c)) || '#2962FF';

        const widthCandidates = [
          overlay.extendData?.lineWidth,
          overlay.extendData?.size,
          (stylesAny.line?.size && stylesAny.line.size > 0) ? stylesAny.line.size : undefined,
          (stylesAny.size && stylesAny.size > 0) ? stylesAny.size : undefined
        ];
        const size = widthCandidates.find(w => typeof w === 'number' && w > 0) || 1;
        const lineStyle = overlay.extendData?.lineStyle || overlay.styles?.line?.style || 'solid';

        const isFilled = overlay.extendData?.filled !== false;
        const defaultUpColor = 'rgba(0, 150, 136, 0.18)';
        const defaultDownColor = 'rgba(239, 83, 80, 0.16)';
        const rawUpColor = overlay.extendData?.upFillColor ?? overlay.extendData?.upperFillColor ?? overlay.extendData?.fillColor ?? defaultUpColor;
        const rawDownColor = overlay.extendData?.downFillColor ?? overlay.extendData?.lowerFillColor ?? defaultDownColor;

        const upFillColor = (!isFilled || isColorTransparent(rawUpColor)) ? 'transparent' : rawUpColor;
        const downFillColor = (!isFilled || isColorTransparent(rawDownColor)) ? 'transparent' : rawDownColor;

        // Project all three regression lines across the visible plot when
        // extension is enabled. Anchors remain at the original selected bars.
        const extendSegment = (start: any, end: any) => {
          if (!options.extendLines || Math.abs(end.x - start.x) < 0.001) {
            return { start, end };
          }
          const slope = (end.y - start.y) / (end.x - start.x);
          return {
            start: { x: 0, y: start.y + slope * (0 - start.x) },
            end: { x: bounding.width, y: start.y + slope * (bounding.width - start.x) }
          };
        };
        const extendedUpper = extendSegment(upperFirst, upperSecond);
        const extendedMiddle = extendSegment(baseFirst, baseSecond);
        const extendedLower = extendSegment(lowerFirst, lowerSecond);

        // Save regression line endpoints on the global map for event handler
        regressionEndpoints.set(overlay.id, { baseFirst, baseSecond });
        (overlay as any).__baseFirst = baseFirst;
        (overlay as any).__baseSecond = baseSecond;

        if (isDrawing || isEditing) {
          const lineFigure = (key: string, start: any, end: any, style: string = 'solid', lColor: string = '#2962FF', lSize: number = 2) => ({
            key,
            type: 'line',
            attrs: { coordinates: [start, end] },
            styles: { color: lColor, size: lSize, style },
            ignoreEvent: true
          });
          regressionFigures.push(lineFigure('regression-middle-line', first, second, 'solid', '#787B86', 1));
        } else {
          if (upFillColor !== 'transparent') {
            regressionFigures.push({
              key: 'regression-upper-fill',
              type: 'polygon',
              attrs: { coordinates: [extendedUpper.start, extendedUpper.end, extendedMiddle.end, extendedMiddle.start] },
              styles: {
                style: 'fill',
                color: upFillColor,
                borderColor: 'transparent',
                borderSize: 0
              },
              ignoreEvent: true
            });
          }
          if (downFillColor !== 'transparent') {
            regressionFigures.push({
              key: 'regression-lower-fill',
              type: 'polygon',
              attrs: { coordinates: [extendedMiddle.start, extendedMiddle.end, extendedLower.end, extendedLower.start] },
              styles: {
                style: 'fill',
                color: downFillColor,
                borderColor: 'transparent',
                borderSize: 0
              },
              ignoreEvent: true
            });
          }
          const createBandLineFigure = (key: string, start: any, end: any) => ({
            key,
            type: 'customDrawingRenderer',
            attrs: {
              drawFn: (ctx: CanvasRenderingContext2D) => {
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(1, size);
                if (lineStyle === 'solid') {
                  ctx.setLineDash([]);
                  ctx.lineCap = 'butt';
                } else if (lineStyle === 'dotted') {
                  ctx.lineCap = 'round';
                  ctx.setLineDash([0, Math.max(5, size * 3 + 2)]);
                } else {
                  // dashed
                  ctx.lineCap = 'butt';
                  ctx.setLineDash([Math.max(6, size * 3 + 3), Math.max(4, size * 2 + 2)]);
                }
                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.stroke();
                ctx.restore();
              }
            },
            ignoreEvent: true
          });

          regressionFigures.push(
            createBandLineFigure('regression-upper-line', extendedUpper.start, extendedUpper.end),
            createBandLineFigure('regression-lower-line', extendedLower.start, extendedLower.end)
          );

          // Draw middle line (regression line) as fixed original dashed line in ash color - independent from drag bar color/style
          regressionFigures.push({
            key: 'regression-middle-line',
            type: 'customDrawingRenderer',
            attrs: {
              drawFn: (ctx: CanvasRenderingContext2D) => {
                ctx.save();
                ctx.strokeStyle = '#787B86';
                ctx.lineWidth = 1; // Low thickness
                ctx.lineCap = 'round';
                ctx.setLineDash([2, 5]);
                ctx.beginPath();
                ctx.moveTo(extendedMiddle.start.x, extendedMiddle.start.y);
                ctx.lineTo(extendedMiddle.end.x, extendedMiddle.end.y);
                ctx.stroke();
                ctx.restore();
              }
            },
            ignoreEvent: true
          });
        }
      }

      const anchorFigures: any[] = [];
      if (def.type === 'regression-trend' && coordinates.length >= 1) {
        const { isSelected, isHovered, isDrawing } = getOverlayState(overlay);
        const isEditing = regressionEditingStates.get(overlay.id) === true || (overlay as any).__regressionEditing === true;
        const regPlacedCount = isDrawing ? (overlay.points ? Math.max(0, overlay.points.length - 1) : 0) : 2;
        if (isSelected || isHovered || isDrawing || isEditing) {
          const drawAnchor = (coord: any) => {
            regressionFigures.push({
              key: `regression-anchor-visual-${coord.x}-${coord.y}`,
              type: 'customDrawingRenderer',
              attrs: {
                drawFn: (ctx: CanvasRenderingContext2D) => {
                  ctx.save();
                  ctx.setLineDash([]);
                  // Match custom handles: dark center with a blue border.
                  ctx.fillStyle = '#131722';
                  ctx.beginPath();
                  ctx.arc(coord.x, coord.y, 5, 0, Math.PI * 2);
                  ctx.fill();
                  ctx.strokeStyle = '#2962FF';
                  ctx.lineWidth = 1.5;
                  ctx.beginPath();
                  ctx.arc(coord.x, coord.y, 5 - 1.5 / 2, 0, Math.PI * 2);
                  ctx.stroke();
                  ctx.restore();
                }
              },
              ignoreEvent: true
            });
          };

          const activeRegAnchor = (overlay as any).__activeDragAnchorIndex ?? (regressionDragIndices.get(overlay.id)) ?? (getGlobalActiveDragAnchor().index);
          const bFirst = coordinates[0];
          const bSecond = coordinates[1];
          if (bFirst && regPlacedCount >= 1 && activeRegAnchor !== 0) drawAnchor(bFirst);
          if (bSecond && regPlacedCount >= 2 && activeRegAnchor !== 1) drawAnchor(bSecond);
        }
      }
      if (def.type === 'parallel-channel' && overlay.points.length >= 6) {
        // Use the exact rendered boundary coordinates for the six handles.
        // Re-converting the midpoint price can put the square a few pixels
        // away from the line because the overlay contains paired points with
        // shared logical indexes.
        const firstLineMidpoint = coordinates[0] && coordinates[1]
          ? { x: (coordinates[0].x + coordinates[1].x) / 2, y: (coordinates[0].y + coordinates[1].y) / 2 }
          : null;
        const secondLineMidpoint = coordinates[3] && coordinates[4]
          ? { x: (coordinates[3].x + coordinates[4].x) / 2, y: (coordinates[3].y + coordinates[4].y) / 2 }
          : null;
        const handles = [
          coordinates[0],
          coordinates[1],
          secondLineMidpoint,
          coordinates[3],
          coordinates[4],
          firstLineMidpoint
        ].filter(Boolean) as any[];
        handles.forEach((handle: any, index: number) => {
          // Midpoint handles (indices 2 and 5) are visually larger; expand hit area
          const isMidpoint = index === 2 || index === 5;
          const halfSize = isMidpoint ? 10 : 8;
          const size = halfSize * 2;
          anchorFigures.push({
            key: `parallel-anchor-${index}`,
            type: 'rect',
            attrs: { x: handle.x - halfSize, y: handle.y - halfSize, width: size, height: size },
            styles: {
              style: 'fill',
              color: 'rgba(0, 0, 0, 0)',
              borderColor: 'rgba(0, 0, 0, 0)',
              borderSize: 0
            },
            ignoreEvent: false
          });
        });
      }
      if (def.type === 'disjoint-channel' && overlay.points.length >= 2) {
        coordinates.forEach((handle: any, index: number) => {
          if (!handle) return;
          anchorFigures.push({
            key: `disjoint-anchor-${index}`,
            type: 'rect',
            attrs: { x: handle.x - 8, y: handle.y - 8, width: 16, height: 16 },
            styles: {
              style: 'fill',
              color: 'rgba(0, 0, 0, 0)',
              borderColor: 'rgba(0, 0, 0, 0)',
              borderSize: 0
            },
            ignoreEvent: false
          });
        });
      }
      if (def.type === 'flat-top-bottom' && overlay.points.length >= 4) {
        coordinates.forEach((handle: any, index: number) => {
          if (!handle) return;
          anchorFigures.push({
            key: `flat-top-bottom-anchor-${index}`,
            type: 'rect',
            attrs: { x: handle.x - 8, y: handle.y - 8, width: 16, height: 16 },
            styles: {
              style: 'fill',
              color: 'rgba(0, 0, 0, 0)',
              borderColor: 'rgba(0, 0, 0, 0)',
              borderSize: 0
            },
            ignoreEvent: false
          });
        });
      }
      if ((def.type === 'long-position' || def.type === 'short-position') && overlay.points.length >= 4) {
        coordinates.forEach((handle: any, index: number) => {
          if (!handle) return;
          // These figures are invisible event targets for anchor dragging.
          // The visible anchor handles are drawn by the pane view's canvas
          // renderer. Keeping them transparent prevents visual conflicts
          // with the dashed guide arrow and canvas-drawn anchor points.
          anchorFigures.push({
            key: `${def.type}-anchor-${index}`,
            type: 'rect',
            attrs: { x: handle.x - 8, y: handle.y - 8, width: 16, height: 16 },
            styles: {
              style: 'fill',
              color: 'rgba(0, 0, 0, 0)',
              borderColor: 'rgba(0, 0, 0, 0)',
              borderSize: 0
            },
            ignoreEvent: false
          });
        });
      }

      // Generic anchor figures for all other tools to enable hover handle dragging
      if (
        def.type !== 'regression-trend' &&
        def.type !== 'parallel-channel' &&
        def.type !== 'disjoint-channel' &&
        def.type !== 'flat-top-bottom' &&
        def.type !== 'long-position' &&
        def.type !== 'short-position' &&
        !isFreehand &&
        coordinates.length >= 1
      ) {
        const isClosedPolyline = def.type === 'polyline' &&
          (overlay.extendData?.__polylineClosed ||
            (overlay.points.length > 2 &&
              overlay.points[0].dataIndex === overlay.points[overlay.points.length - 1].dataIndex &&
              overlay.points[0].value === overlay.points[overlay.points.length - 1].value));

        coordinates.forEach((handle: any, index: number) => {
          if (!handle) return;
          // Skip the duplicate final closing anchor for closed polylines so it behaves as a single point
          if (isClosedPolyline && index === coordinates.length - 1) return;

          anchorFigures.push({
            key: `${def.type}-anchor-${index}`,
            type: 'rect',
            attrs: { x: handle.x - 8, y: handle.y - 8, width: 16, height: 16 },
            styles: {
              style: 'fill',
              color: 'rgba(0, 0, 0, 0)',
              borderColor: 'rgba(0, 0, 0, 0)',
              borderSize: 0
            },
            ignoreEvent: false
          });
        });
      }

      // Add hover hit area for pin
      if (def.type === 'pin' && coordinates[0]) {
        const p = coordinates[0];
        const size = (overlay.extendData?.size) ?? 30;
        const isVisible = isOverlayHovered || isSelected || isDrawing || overlay.extendData?.__isHovered === true;

        let hitX = p.x - size / 2 - 2;
        let hitY = p.y - size - 2;
        let hitW = size + 4;
        let hitH = size + 4;

        if (isVisible) {
          const text = (overlay.extendData?.label ?? overlay.extendData?.text) ?? 'Add text';
          const lines = String(text).split('\n');
          const maxLen = Math.max(...lines.map((l: string) => l.length), 8);
          const panelWidth = Math.max(80, maxLen * 7 + 28);
          const panelHeight = (11 * lines.length) + (lines.length - 1) * 4 + 16;
          const topY = p.y - size - 8 - panelHeight - 4;
          hitX = p.x - Math.max(panelWidth, size) / 2 - 4;
          hitY = topY;
          hitW = Math.max(panelWidth, size) + 8;
          hitH = (p.y + 2) - topY;
        }

        anchorFigures.push({
          key: `pin-hover-hit-${overlay.id}`,
          type: 'rect',
          attrs: {
            x: hitX,
            y: hitY,
            width: hitW,
            height: hitH
          },
          styles: {
            style: 'fill',
            color: 'rgba(0, 0, 0, 0)',
            borderColor: 'rgba(0, 0, 0, 0)',
            borderSize: 0
          },
          ignoreEvent: false
        });
      }

      // Add hover hit area for flag
      if ((def.type === 'flag-mark' || def.type === 'flag') && coordinates[0]) {
        const p = coordinates[0];
        const size = (overlay.extendData?.size) ?? 30;
        const poleHeight = size * 1.5;
        const isVisible = isOverlayHovered || isSelected || isDrawing || overlay.extendData?.__isHovered === true;

        let hitX = p.x - 6;
        let hitY = p.y - poleHeight - 4;
        let hitW = size + 10;
        let hitH = poleHeight + 8;

        if (isVisible) {
          const text = (overlay.extendData?.label ?? overlay.extendData?.text) ?? 'Add text';
          const lines = String(text).split('\n');
          const maxLen = Math.max(...lines.map((l: string) => l.length), 8);
          const panelWidth = Math.max(80, maxLen * 7 + 28);
          const panelHeight = (11 * lines.length) + (lines.length - 1) * 4 + 16;
          const topY = p.y - poleHeight - 8 - panelHeight - 4;
          hitX = p.x - Math.max(panelWidth, size + 20) / 2 - 4;
          hitY = topY;
          hitW = Math.max(panelWidth, size + 20) + 8;
          hitH = (p.y + 4) - topY;
        }

        anchorFigures.push({
          key: `flag-hover-hit-${overlay.id}`,
          type: 'rect',
          attrs: {
            x: hitX,
            y: hitY,
            width: hitW,
            height: hitH
          },
          styles: {
            style: 'fill',
            color: 'rgba(0, 0, 0, 0)',
            borderColor: 'rgba(0, 0, 0, 0)',
            borderSize: 0
          },
          ignoreEvent: false
        });
      }

      return [
        ...regressionFigures,
        ...spiralFigures,
        ...anchorFigures,
        {
          type: 'customDrawingRenderer',
          attrs: {
            drawFn: (ctx: CanvasRenderingContext2D) => {
              setGlobalDrawingPlacedCount(placedCount);
              try {
                const scope = {
                  context: ctx,
                  bitmapSize: {
                    width: bounding.width,
                    height: bounding.height
                  },
                  // Ticker Pen has already scaled this canvas context for the
                  // device pixel ratio. Passing the ratio again would scale the
                  // drawing coordinates twice and make anchors miss the points.
                  horizontalPixelRatio: 1,
                  verticalPixelRatio: 1
                };
                paneViews.forEach((view: any) => {
                  const renderer = view.renderer();
                  // lightweight-charts renderers expect a CanvasRenderingTarget2D
                  // wrapper in draw(), while Ticker Pen gives us a raw 2D
                  // context. The renderers' drawImpl method accepts the bitmap
                  // scope directly and is the compatible bridge here.
                  if (renderer && typeof renderer.drawImpl === 'function') {
                    renderer.drawImpl(scope);
                  } else if (renderer && typeof renderer.draw === 'function') {
                    renderer.draw({
                      useBitmapCoordinateSpace: (callback: (value: any) => void) => callback(scope)
                    });
                  }
                });
              } finally {
                setGlobalDrawingPlacedCount(null);
              }
            },
            checkEventFn: (coord: { x: number; y: number }) => {
              const hit = (toolInstance as any).testHit ? (toolInstance as any).testHit(coord, viewport) : false;
              return hit;
            }
          }
        }
      ];
    }
  };
});

// Elliott Wave Overlays
const createElliottYAxisFigures = (params: OverlayCreateFiguresCallbackParams<any>) => {
  const { coordinates, bounding, overlay, chart } = params;
  const { isSelected, isDrawing } = getOverlayState(overlay);
  if (!isSelected && !isDrawing) {
    return [];
  }

  let pricePrecision = 2;
  try {
    const symbolInfo = chart?.getSymbol?.();
    if (symbolInfo && typeof symbolInfo.pricePrecision === 'number') {
      pricePrecision = symbolInfo.pricePrecision;
    } else if (params && (params as any).precision && typeof (params as any).precision.price === 'number') {
      pricePrecision = (params as any).precision.price;
    } else if (typeof window !== 'undefined' && typeof (window as any).__active_price_precision__ === 'number') {
      pricePrecision = (window as any).__active_price_precision__;
    } else if (chart) {
      const dataList = typeof chart.getDataList === 'function' ? chart.getDataList() : [];
      if (dataList.length > 0) {
        const lastPrice = Number(dataList[dataList.length - 1].close);
        const str = String(lastPrice);
        const dotIdx = str.indexOf('.');
        pricePrecision = dotIdx !== -1 ? str.length - dotIdx - 1 : 2;
      }
    }
  } catch (e) {}

  let thousandsSeparator = ',';
  let decimalFoldThreshold = 3;
  if (chart && typeof chart.getStyles === 'function') {
    try {
      const chartStyles = chart.getStyles() as any;
      if (chartStyles) {
        if (typeof chartStyles.thousandsSeparator === 'string') thousandsSeparator = chartStyles.thousandsSeparator;
        if (typeof chartStyles.decimalFoldThreshold === 'number') decimalFoldThreshold = chartStyles.decimalFoldThreshold;
      }
    } catch (e) {}
  }

  const formatPrice = (val: number) => {
    const convRate = (typeof window !== 'undefined' && (window as any).__currency_conversion_rate__) || 1;
    if (convRate !== 1) val = val * convRate;
    const absVal = Math.abs(val);
    if (absVal >= 1_000_000_000_000) return (val / 1_000_000_000_000).toFixed(2) + 'T';
    if (absVal >= 1_000_000_000) return (val / 1_000_000_000).toFixed(2) + 'B';
    if (absVal >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M';

    let effectivePrecision = pricePrecision;
    if (convRate !== 1) {
      if (absVal >= 1000) effectivePrecision = Math.min(pricePrecision, 2);
      else if (absVal >= 1) effectivePrecision = Math.min(pricePrecision, 4);
      else if (absVal >= 0.001) effectivePrecision = Math.max(pricePrecision, 6);
      else effectivePrecision = Math.max(pricePrecision, 8);
    }

    let str = val.toFixed(effectivePrecision);
    if (thousandsSeparator) {
      const parts = str.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
      str = parts.join('.');
    }
    return str;
  };

  const labelBgColor = (overlay.styles as any)?.yAxis?.color || overlay.extendData?.yAxisColor || '#2962ff';
  const labelHeight = 18;
  const figures: any[] = [];

  // Gradient rect between highest and lowest coordinate
  if (coordinates.length >= 2) {
    const ys = coordinates.map((c: any) => c?.y).filter((y: any) => y !== undefined && !isNaN(y));
    if (ys.length >= 2) {
      const topY = Math.min(...ys);
      const bottomY = Math.max(...ys);
      const shadeColor = getOverlayShadeColor({
        ...overlay,
        styles: {
          ...(overlay.styles || {}),
          line: { ...(overlay.styles?.line || {}), color: labelBgColor }
        }
      });
      if (bottomY - topY > 0) {
        figures.push({
          key: 'price-gradient-rect',
          type: 'rect',
          attrs: {
            x: 0,
            y: topY,
            width: bounding.width,
            height: bottomY - topY
          },
          styles: {
            style: 'fill',
            color: shadeColor,
            borderSize: 0,
            borderColor: 'transparent'
          },
          ignoreEvent: true
        });
      }
    }
  }

  coordinates.forEach((coordinate: any, index: number) => {
    const value = overlay.points[index]?.value;
    if (typeof value !== 'number' || coordinate.y === undefined || isNaN(coordinate.y)) return;
    const rectY = coordinate.y - labelHeight / 2;
    const textVal = formatPrice(value);

    figures.push({
      key: `price-bg-${index}`,
      type: 'rect',
      attrs: {
        x: 0,
        y: rectY,
        width: bounding.width,
        height: labelHeight
      },
      styles: {
        style: 'fill',
        color: labelBgColor,
        borderSize: 0,
        borderColor: 'transparent'
      },
      ignoreEvent: true
    });

    figures.push({
      key: `price-text-${index}`,
      type: 'text',
      attrs: {
        x: bounding.width / 2,
        y: coordinate.y,
        text: textVal,
        align: 'center',
        baseline: 'middle'
      },
      styles: {
        color: '#ffffff',
        family: "'Rubik', sans-serif",
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        borderSize: 0
      },
      ignoreEvent: true
    });
  });

  return figures;
};

const isElliottDownPoint = (i: number, coords: Array<{ x: number; y: number }>) => {
  if (!coords || coords.length <= 1 || !coords[i]) return false;
  const currentY = coords[i].y;
  const prevY = i > 0 && coords[i - 1] ? coords[i - 1].y : null;
  const nextY = i < coords.length - 1 && coords[i + 1] ? coords[i + 1].y : null;

  // Valley between two points (both neighbors have smaller Y / higher price)
  if (prevY !== null && nextY !== null) {
    if (currentY >= prevY && currentY >= nextY) return true;
    if (currentY <= prevY && currentY <= nextY) return false;
    return currentY > prevY;
  }

  // First point (if wave goes up to next point, point 0 is the starting bottom)
  if (nextY !== null) {
    return currentY > nextY;
  }

  // Last point (if wave came down to this point, it is a bottom)
  if (prevY !== null) {
    return currentY > prevY;
  }

  return false;
};

const createElliottWaveOverlay = (name: string, totalStep: number, labels: string[], color: string): OverlayTemplate => {
  return {
    name,
    totalStep,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    styles: {
      point: {
        color: 'rgba(0,0,0,0)',
        borderColor: 'rgba(0,0,0,0)',
        borderSize: 0,
        activeColor: 'rgba(0,0,0,0)',
        activeBorderColor: 'rgba(0,0,0,0)',
        activeBorderSize: 0,
        radius: 8,
        activeRadius: 8
      }
    },
    createYAxisFigures: createElliottYAxisFigures,
    onSelected: (event: any) => {
      try {
        if (event && event.overlay) {
          dispatchOverlaySettings(event.overlay);
        }
      } catch (e) {}
      return false;
    },
    onDeselected: (event: any) => {
      try {
        if (event && event.overlay) {
          window.dispatchEvent(new CustomEvent('close-elliott-toolbar', {
            detail: { overlayId: event.overlay.id }
          }));
        }
      } catch (e) {}
      return false;
    },
    onRemoved: (event: any) => {
      try {
        if (event && event.overlay) {
          window.dispatchEvent(new CustomEvent('close-elliott-toolbar', {
            detail: { overlayId: event.overlay.id }
          }));
        }
      } catch (e) {}
      return false;
    },
    onPressedMoveStart: (event: any) => {
      let dragIdx = -1;
      const key = String(event.figure?.key || event.figureKey || '');
      if (key.includes('-anchor-')) {
        const parts = key.split('-');
        dragIdx = Number(parts[parts.length - 1]);
      }
      if (dragIdx < 0 && typeof event.pointIndex === 'number' && event.pointIndex >= 0) {
        dragIdx = event.pointIndex;
      }
      if (dragIdx < 0 && typeof event.x === 'number' && typeof event.y === 'number' && event.overlay?.points) {
        const axes = overlayAxesMap.get(event.overlay.id);
        const xAxis = axes?.xAxis;
        const yAxis = axes?.yAxis;
        let nearest = 25;
        event.overlay.points.forEach((pt: any, idx: number) => {
          if (!pt) return;
          const px = xAxis?.convertToPixel(Number(pt.dataIndex ?? pt.timestamp ?? 0));
          const py = yAxis?.convertToPixel(Number(pt.value ?? 0));
          if (px != null && py != null) {
            const dist = Math.hypot(event.x - px, event.y - py);
            if (dist < nearest) {
              nearest = dist;
              dragIdx = idx;
            }
          }
        });
      }
      if (dragIdx >= 0) {
        setGlobalActiveDragAnchor(dragIdx, event.overlay.id);
        (event.overlay as any).__activeDragAnchorIndex = dragIdx;
      }
      return false;
    },
    onPressedMoveEnd: (event: any) => {
      setGlobalActiveDragAnchor(null, undefined);
      if (event.overlay) {
        (event.overlay as any).__activeDragAnchorIndex = null;
      }
      try {
        if (event && event.overlay) {
          dispatchOverlaySettings(event.overlay);
        }
      } catch (e) {}
      return false;
    },
    onDrawEnd: (event: any) => {
      try {
        if (event && event.overlay) {
          dispatchOverlaySettings(event.overlay);
        }
      } catch (e) {}
      return false;
    },
    createPointFigures: (params: OverlayCreateFiguresCallbackParams<any>) => {
      const { coordinates, overlay } = params;
      const figures: any[] = [];
      const { isSelected, isHovered, isDrawing } = getOverlayState(overlay);
      const isStart = typeof (overlay as any).isStart === 'function' ? (overlay as any).isStart() : (overlay.currentStep === 1 || overlay.currentStep === 0);
      const placedCount = isDrawing
        ? (isStart ? 0 : (typeof overlay.currentStep === 'number' ? Math.max(0, overlay.currentStep - 1) : (overlay.points ? Math.max(0, overlay.points.length - 1) : 0)))
        : coordinates.length;

      if (isDrawing && (placedCount === 0 || isStart)) return [];

      const isVisible = isSelected || isHovered || isDrawing;
      const strokeColor = overlay.extendData?.color || overlay.styles?.line?.color || color;
      const strokeSize = overlay.extendData?.size ?? overlay.styles?.line?.size ?? 1;

      // Keep native point figures transparent but draggable
      if (overlay.styles) {
        overlay.styles.point = {
          ...(overlay.styles.point || {}),
          color: 'rgba(0,0,0,0)',
          borderColor: 'rgba(0,0,0,0)',
          borderSize: 0,
          activeColor: 'rgba(0,0,0,0)',
          activeBorderColor: 'rgba(0,0,0,0)',
          activeBorderSize: 0,
          radius: 8,
          activeRadius: 8
        };
      }

      // 1. Draw line segments connecting coordinates
      for (let i = 1; i < coordinates.length; i++) {
        figures.push({
          type: 'line',
          attrs: {
            coordinates: [coordinates[i - 1], coordinates[i]]
          },
          styles: {
            color: strokeColor,
            size: strokeSize,
            style: overlay.styles?.line?.style || 'solid'
          }
        });
      }

      // 2. Draw labels and anchors at each point
      coordinates.forEach((coord, i) => {
        if (isDrawing && i >= placedCount) return;
        const labelText = labels[i] || '';
        const isDown = isElliottDownPoint(i, coordinates);
        const textY = isDown ? coord.y + 12 : coord.y - 12;
        const baseline = isDown ? 'top' : 'bottom';

        if (labelText) {
          figures.push({
            type: 'text',
            attrs: {
              x: coord.x,
              y: textY,
              text: labelText,
              align: 'center',
              baseline: baseline
            },
            styles: {
              color: strokeColor,
              fontSize: 12,
              family: "'Rubik', sans-serif",
              padding: 0,
              backgroundColor: 'transparent',
              borderColor: 'transparent',
              borderSize: 0
            },
            ignoreEvent: true
          });
        }

        // 3. Draw anchor points in standard tool design (Dark #131722 center + 1.5px colored border)
        if (isVisible) {
          const globalDragInfo = getGlobalActiveDragAnchor();
          const isDraggingThis = globalDragInfo.overlayId === overlay.id && globalDragInfo.index === i;
          if (!isDraggingThis) {
            figures.push({
              key: `${overlay.id}-anchor-visual-${i}`,
              type: 'customDrawingRenderer',
              attrs: {
                drawFn: (ctx: CanvasRenderingContext2D) => {
                  ctx.save();
                  ctx.setLineDash([]);
                  ctx.fillStyle = '#131722';
                  ctx.beginPath();
                  ctx.arc(coord.x, coord.y, 5, 0, Math.PI * 2);
                  ctx.fill();
                  ctx.strokeStyle = strokeColor;
                  ctx.lineWidth = 1.5;
                  ctx.beginPath();
                  ctx.arc(coord.x, coord.y, 5 - 1.5 / 2, 0, Math.PI * 2);
                  ctx.stroke();
                  ctx.restore();
                }
              },
              ignoreEvent: true
            });
          }
        }
      });

      return figures;
    }
  };
};

export const elliottImpulseWave = createElliottWaveOverlay(
  'elliott-impulse-wave',
  7, // 6 points: 0, 1, 2, 3, 4, 5
  ['(0)', '(1)', '(2)', '(3)', '(4)', '(5)'],
  '#2979ff'
);

export const elliottCorrectionWave = createElliottWaveOverlay(
  'elliott-correction-wave',
  5, // 4 points: 0, A, B, C
  ['(0)', '(A)', '(B)', '(C)'],
  '#ff9800'
);

export const elliottTriangleWave = createElliottWaveOverlay(
  'elliott-triangle-wave',
  7, // 6 points: 0, A, B, C, D, E
  ['(0)', '(A)', '(B)', '(C)', '(D)', '(E)'],
  '#e91e63'
);

export const elliottTripleComboWave = createElliottWaveOverlay(
  'elliott-triple-combo-wave',
  7, // 6 points: 0, W, X, Y, X, Z
  ['(0)', '(W)', '(X)', '(Y)', '(X)', '(Z)'],
  '#9c27b0'
);

export const elliottDoubleComboWave = createElliottWaveOverlay(
  'elliott-double-combo-wave',
  5, // 4 points: 0, W, X, Y
  ['(0)', '(W)', '(X)', '(Y)'],
  '#7e57c2'
);

export const elliottWavePath: OverlayTemplate = {
  name: 'elliott-wave-path',
  totalStep: 999,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    point: {
      color: 'rgba(0,0,0,0)',
      borderColor: 'rgba(0,0,0,0)',
      borderSize: 0,
      activeColor: 'rgba(0,0,0,0)',
      activeBorderColor: 'rgba(0,0,0,0)',
      activeBorderSize: 0,
      radius: 8,
      activeRadius: 8
    }
  },
  createYAxisFigures: createElliottYAxisFigures,
  onSelected: (event: any) => {
    try {
      if (event && event.overlay) {
        dispatchOverlaySettings(event.overlay);
      }
    } catch (e) {}
    return false;
  },
  onDeselected: (event: any) => {
    try {
      if (event && event.overlay) {
        window.dispatchEvent(new CustomEvent('close-elliott-toolbar', {
          detail: { overlayId: event.overlay.id }
        }));
      }
    } catch (e) {}
    return false;
  },
  onRemoved: (event: any) => {
    try {
      if (event && event.overlay) {
        window.dispatchEvent(new CustomEvent('close-elliott-toolbar', {
          detail: { overlayId: event.overlay.id }
        }));
      }
    } catch (e) {}
    return false;
  },
  onPressedMoveStart: (event: any) => {
    let dragIdx = -1;
    const key = String(event.figure?.key || event.figureKey || '');
    if (key.includes('-anchor-')) {
      const parts = key.split('-');
      dragIdx = Number(parts[parts.length - 1]);
    }
    if (dragIdx < 0 && typeof event.pointIndex === 'number' && event.pointIndex >= 0) {
      dragIdx = event.pointIndex;
    }
    if (dragIdx < 0 && typeof event.x === 'number' && typeof event.y === 'number' && event.overlay?.points) {
      const axes = overlayAxesMap.get(event.overlay.id);
      const xAxis = axes?.xAxis;
      const yAxis = axes?.yAxis;
      let nearest = 25;
      event.overlay.points.forEach((pt: any, idx: number) => {
        if (!pt) return;
        const px = xAxis?.convertToPixel(Number(pt.dataIndex ?? pt.timestamp ?? 0));
        const py = yAxis?.convertToPixel(Number(pt.value ?? 0));
        if (px != null && py != null) {
          const dist = Math.hypot(event.x - px, event.y - py);
          if (dist < nearest) {
            nearest = dist;
            dragIdx = idx;
          }
        }
      });
    }
    if (dragIdx >= 0) {
      setGlobalActiveDragAnchor(dragIdx, event.overlay.id);
      (event.overlay as any).__activeDragAnchorIndex = dragIdx;
    }
    return false;
  },
  onPressedMoveEnd: (event: any) => {
    setGlobalActiveDragAnchor(null, undefined);
    if (event.overlay) {
      (event.overlay as any).__activeDragAnchorIndex = null;
    }
    try {
      if (event && event.overlay) {
        dispatchOverlaySettings(event.overlay);
      }
    } catch (e) {}
    return false;
  },
  onDrawEnd: (event: any) => {
    try {
      if (event && event.overlay) {
        dispatchOverlaySettings(event.overlay);
      }
    } catch (e) {}
    return false;
  },
  createPointFigures: (params: OverlayCreateFiguresCallbackParams<any>) => {
    const { coordinates, overlay } = params;
    const figures: any[] = [];
    const { isSelected, isHovered, isDrawing } = getOverlayState(overlay);
    const isStart = typeof (overlay as any).isStart === 'function' ? (overlay as any).isStart() : (overlay.currentStep === 1 || overlay.currentStep === 0);
    const placedCount = isDrawing
      ? (isStart ? 0 : (typeof overlay.currentStep === 'number' ? Math.max(0, overlay.currentStep - 1) : (overlay.points ? Math.max(0, overlay.points.length - 1) : 0)))
      : coordinates.length;

    if (isDrawing && (placedCount === 0 || isStart)) return [];

    const isVisible = isSelected || isHovered || isDrawing;
    const strokeColor = overlay.extendData?.color || overlay.styles?.line?.color || '#089981';
    const strokeSize = overlay.extendData?.size ?? overlay.styles?.line?.size ?? 1;

    if (overlay.styles) {
      overlay.styles.point = {
        ...(overlay.styles.point || {}),
        color: 'rgba(0,0,0,0)',
        borderColor: 'rgba(0,0,0,0)',
        borderSize: 0,
        activeColor: 'rgba(0,0,0,0)',
        activeBorderColor: 'rgba(0,0,0,0)',
        activeBorderSize: 0,
        radius: 8,
        activeRadius: 8
      };
    }

    // 1. Draw line segments connecting coordinates
    for (let i = 1; i < coordinates.length; i++) {
      figures.push({
        type: 'line',
        attrs: {
          coordinates: [coordinates[i - 1], coordinates[i]]
        },
        styles: {
          color: strokeColor,
          size: strokeSize,
          style: overlay.styles?.line?.style || 'solid'
        }
      });
    }

    // 2. Draw labels and anchors at each point (0, 1, 2, 3, 4, 5, 6, ...)
    coordinates.forEach((coord, i) => {
      if (isDrawing && i >= placedCount) return;
      const isDown = isElliottDownPoint(i, coordinates);
      const textY = isDown ? coord.y + 12 : coord.y - 12;
      const baseline = isDown ? 'top' : 'bottom';

      figures.push({
        type: 'text',
        attrs: {
          x: coord.x,
          y: textY,
          text: `(${i})`,
          align: 'center',
          baseline: baseline
        },
        styles: {
          color: strokeColor,
          fontSize: 12,
          family: "'Rubik', sans-serif",
          padding: 0,
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderSize: 0
        },
        ignoreEvent: true
      });

      // 3. Draw anchor points in standard tool design (Dark #131722 center + 1.5px colored border)
      if (isVisible) {
        const globalDragInfo = getGlobalActiveDragAnchor();
        const isDraggingThis = globalDragInfo.overlayId === overlay.id && globalDragInfo.index === i;
        if (!isDraggingThis) {
          figures.push({
            key: `${overlay.id}-anchor-visual-${i}`,
            type: 'customDrawingRenderer',
            attrs: {
              drawFn: (ctx: CanvasRenderingContext2D) => {
                ctx.save();
                ctx.setLineDash([]);
                ctx.fillStyle = '#131722';
                ctx.beginPath();
                ctx.arc(coord.x, coord.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(coord.x, coord.y, 5 - 1.5 / 2, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
              }
            },
            ignoreEvent: true
          });
        }
      }
    });

    return figures;
  }
};

export const emojiOverlay: OverlayTemplate = {
  name: 'emoji',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  onSelected: (event: any) => {
    try {
      if (event && event.overlay) {
        dispatchOverlaySettings(event.overlay);
      }
    } catch (e) {}
    return false;
  },
  onDeselected: (event: any) => {
    try {
      if (event && event.overlay) {
        window.dispatchEvent(new CustomEvent('close-drawing-toolbar', {
          detail: { overlayId: event.overlay.id }
        }));
      }
    } catch (e) {}
    return false;
  },
  onRemoved: (event: any) => {
    try {
      if (event && event.overlay) {
        window.dispatchEvent(new CustomEvent('close-drawing-toolbar', {
          detail: { overlayId: event.overlay.id }
        }));
      }
    } catch (e) {}
    return false;
  },
  onPressedMoveEnd: (event: any) => {
    try {
      if (event && event.overlay) {
        dispatchOverlaySettings(event.overlay);
      }
    } catch (e) {}
    return false;
  },
  onDrawEnd: (event: any) => {
    try {
      if (event && event.overlay) {
        dispatchOverlaySettings(event.overlay);
      }
      window.dispatchEvent(new CustomEvent('tickerpen-draw-end', { detail: event }));
      const activeChart = event.chart || (window as any).__active_chart_instance__;
      if (activeChart && typeof activeChart.createOverlay === 'function') {
        try {
          activeChart.createOverlay({ name: '' });
        } catch (e) {}
      }
    } catch (e) {}
    return false;
  },
  createPointFigures: (params: OverlayCreateFiguresCallbackParams<any>) => {
    const { coordinates, overlay, chart } = params;
    const figures: any[] = [];
    if (coordinates.length >= 2 && coordinates[0] && coordinates[1]) {
      const p1 = coordinates[0];
      const p2 = coordinates[1];
      const x = Math.min(p1.x, p2.x);
      const y = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x);
      const h = Math.abs(p2.y - p1.y);

      const { isSelected, isHovered } = getOverlayState(overlay);

      // Add hit-box covering the bounding box for selection, dragging, and deletion
      figures.push({
        key: 'emoji-hit-box',
        type: 'rect',
        attrs: { x, y, width: w, height: h },
        styles: {
          style: 'stroke_fill',
          color: 'rgba(0, 0, 0, 0.001)',
          borderColor: 'rgba(0, 0, 0, 0.001)',
          borderSize: 1
        },
        ignoreEvent: false
      });

      const unified = overlay.extendData?.unified || '1f600';
      const localSrc = `/emojis/twemoji/${unified}.svg`;

      if (!(window as any).__local_2d_emoji_cache) {
        (window as any).__local_2d_emoji_cache = {};
      }

      let img = (window as any).__local_2d_emoji_cache[localSrc];
      if (!img) {
        img = new Image();
        img.src = localSrc;
        img.onload = () => {
          const activeChart = (window as any).__active_chart_instance__ || chart;
          if (activeChart) {
            if (typeof activeChart.updatePane === 'function') activeChart.updatePane(1);
            if (typeof activeChart.invalidate === 'function') activeChart.invalidate();
          }
        };
        img.onerror = () => {
          const altSrc = localSrc.includes('-fe0f')
            ? localSrc.replace('-fe0f', '')
            : localSrc.replace('.svg', '-fe0f.svg');
          if (img.src !== altSrc) {
            img.src = altSrc;
          }
        };
        (window as any).__local_2d_emoji_cache[localSrc] = img;
      }

      if (img.complete && img.naturalWidth !== 0) {
        figures.push({
          type: 'customDrawingRenderer',
          attrs: {
            drawFn: (ctx: CanvasRenderingContext2D) => {
              ctx.save();
              ctx.drawImage(img, x, y, w, h);
              if (isSelected || isHovered) {
                ctx.strokeStyle = '#2962ff';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
              }
              ctx.restore();
            }
          }
        });
      } else {
        figures.push({
          type: 'customDrawingRenderer',
          attrs: {
            drawFn: (ctx: CanvasRenderingContext2D) => {
              ctx.save();
              ctx.strokeStyle = overlay.styles?.line?.color || '#2962ff';
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.strokeRect(x, y, w, h);
              ctx.restore();
            }
          }
        });
      }
    }
    return figures;
  }
};

const tableDragStateMap = new Map<string, {
  dragCornerIndex: number;
  dragColDivider?: number;
  dragRowDivider?: number;
  startPixel: { x: number; y: number };
  startBounds: { x: number; y: number; w: number; h: number };
  startColRatios?: number[];
  startRowRatios?: number[];
  startPoints?: any[];
}>();

export const SMART_TAGS_CATALOG = [
  { tag: '{spot}', label: 'Spot Price', desc: 'Current spot price snapshot', category: 'Price' },
  { tag: '{open}', label: 'Candle Open', desc: 'Current candle open price', category: 'Price' },
  { tag: '{high}', label: 'Candle High', desc: 'Current candle high price', category: 'Price' },
  { tag: '{low}', label: 'Candle Low', desc: 'Current candle low price', category: 'Price' },
  { tag: '{eq}', label: '50% Equilibrium', desc: 'Midpoint (High + Low) / 2', category: 'Price' },
  { tag: '{change%}', label: '% Change', desc: 'Current candle return %', category: 'Price' },
  { tag: '{vol}', label: 'Volume', desc: 'Current trading volume', category: 'Price' },
  { tag: '{do}', label: 'Daily Open', desc: 'Day open benchmark price', category: 'Levels' },
  { tag: '{session}', label: 'Active Session', desc: 'Asian / London / New York', category: 'Market' },
  { tag: '{side}', label: 'Trade Side', desc: 'Auto LONG or SHORT', category: 'Market' },
  { tag: '{rsi}', label: 'RSI (14)', desc: '14-period RSI indicator', category: 'Indicators' },
  { tag: '{atr}', label: 'ATR (14)', desc: 'Average True Range', category: 'Indicators' },
  { tag: '{macd}', label: 'MACD (12,26)', desc: 'MACD line value', category: 'Indicators' },
  { tag: '{symbol}', label: 'Pair Symbol', desc: 'Active trading pair symbol', category: 'Symbol' },
  { tag: '{timeframe}', label: 'Timeframe', desc: 'Chart timeframe (e.g. 15m, 1h)', category: 'Time' },
  { tag: '{date}', label: 'Date', desc: 'Current date (DD-MM-YYYY)', category: 'Time' },
  { tag: '{time}', label: 'Time', desc: 'Current time (HH:MM)', category: 'Time' },
  { tag: '{day}', label: 'Day of Week', desc: 'Current weekday name', category: 'Time' },
  // Formula templates - Math & Aggregation
  { tag: '=SUM(A1:A3)', label: '=SUM(Range)', desc: 'Calculate sum of cells', category: 'Formulas' },
  { tag: '=AVG(A1:A3)', label: '=AVG(Range)', desc: 'Calculate average of cells', category: 'Formulas' },
  { tag: '=MIN(A1:A3)', label: '=MIN(Range)', desc: 'Find minimum value', category: 'Formulas' },
  { tag: '=MAX(A1:A3)', label: '=MAX(Range)', desc: 'Find maximum value', category: 'Formulas' },
  { tag: '=COUNT(A1:A3)', label: '=COUNT(Range)', desc: 'Count numeric cells', category: 'Formulas' },
  { tag: '=ROUND(A1, 2)', label: '=ROUND(Cell, N)', desc: 'Round to N decimal places', category: 'Formulas' },
  { tag: '=ABS(A1-B1)', label: '=ABS(Expr)', desc: 'Absolute difference', category: 'Formulas' },

  // Formula templates - Trading & Risk Management
  { tag: '=(B1-A1)/A1*100', label: 'Return %', desc: 'Calculate percentage gain/loss', category: 'Trading Formulas' },
  { tag: '=(D2-B2)/(B2-C2)', label: 'Risk/Reward (RR)', desc: 'Calculate risk to reward ratio', category: 'Trading Formulas' },
  { tag: '=ROUND((A2*0.01)/ABS(B2-C2), 4)', label: 'Position Sizing (1% Risk)', desc: 'Calculate contract/lot size', category: 'Trading Formulas' },
  { tag: '=ROUND(ABS(B2-C2)/B2*100, 2)', label: 'Stop Loss %', desc: 'SL distance in percentage', category: 'Trading Formulas' },
  { tag: '=B2+(B2-C2)*3', label: '1:3 TP Target Price', desc: 'Calculate 1:3 Take Profit level', category: 'Trading Formulas' },

  // Formula templates - Market & Volatility Dynamics
  { tag: '=ROUND({spot}-B2, 2)', label: 'Distance from Spot Price', desc: 'Points from target/support level', category: 'Trading Formulas' },
  { tag: '=ROUND({spot}-({atr}*1.5), 2)', label: 'ATR Trailing Stop', desc: '1.5x ATR volatility stop loss', category: 'Trading Formulas' },
  { tag: '=ROUND(({high}-{low})/{low}*100, 2)', label: 'Session Range %', desc: 'High-Low candle volatility spread', category: 'Trading Formulas' },
  { tag: '=ROUND({spot}-{do}, 2)', label: 'Daily Open Delta', desc: 'Distance from today open price', category: 'Trading Formulas' },

  // Formula templates - Fibonacci Math
  { tag: '=ROUND(C2+(B2-C2)*0.618, 2)', label: 'Fib 61.8% Golden Pocket', desc: 'Calculate 0.618 retracement', category: 'Trading Formulas' },
  { tag: '=ROUND(B2+(B2-C2)*1.618, 2)', label: 'Fib 1.618 Extension', desc: 'Calculate 1.618 target extension', category: 'Trading Formulas' },

  // Formula templates - Smart Signals & Conditionals
  { tag: '=IF({spot}>=D2, "TP HIT", "RUNNING")', label: 'TP Reached Status', desc: 'Conditional target hit check', category: 'Trading Formulas' },
  { tag: '=IF({spot}>{do}, "BULLISH", "BEARISH")', label: 'Daily Open Trend Bias', desc: 'Compare spot against daily open', category: 'Trading Formulas' },
];

function computeRSI(closes: number[], period: number = 14): string {
  if (!closes || closes.length < period + 1) return '---';
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  if (avgLoss === 0) return '100.0';
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return rsi.toFixed(1);
}

function computeATR(candles: any[], period: number = 14, prec: number = 2): string {
  if (!candles || candles.length < period + 1) return '---';
  let trSum = 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = Number(candles[i].high);
    const l = Number(candles[i].low);
    const prevC = Number(candles[i - 1].close);
    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    trs.push(tr);
  }
  if (trs.length < period) return '---';
  for (let i = 0; i < period; i++) {
    trSum += trs[i];
  }
  let atr = trSum / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr.toFixed(prec);
}

function computeMACD(closes: number[], prec: number = 2): string {
  if (!closes || closes.length < 26) return '---';
  const calcEMA = (data: number[], p: number): number[] => {
    const k = 2 / (p + 1);
    const emaArr: number[] = [data[0]];
    for (let i = 1; i < data.length; i++) {
      emaArr.push(data[i] * k + emaArr[i - 1] * (1 - k));
    }
    return emaArr;
  };

  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
  const sign = macdLine > 0 ? '+' : '';
  return `${sign}${macdLine.toFixed(prec)}`;
}

function formatVolume(val: number): string {
  if (!val || isNaN(val)) return '---';
  if (val >= 1_000_000_000) return (val / 1_000_000_000).toFixed(2) + 'B';
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M';
  if (val >= 1_000) return (val / 1_000).toFixed(2) + 'K';
  return val.toFixed(2);
}

function getActiveSession(now: Date): string {
  const utcHour = now.getUTCHours();
  if (utcHour >= 0 && utcHour < 8) return 'Asian';
  if (utcHour >= 8 && utcHour < 13) return 'London';
  if (utcHour >= 13 && utcHour < 16) return 'London/NY Overlap';
  if (utcHour >= 16 && utcHour < 21) return 'New York';
  return 'Asian (Early)';
}

export function getActiveChartSymbol(): string {
  let symbol = (window as any).__active_symbol__ || (window as any).__current_symbol__ || '';
  if (!symbol && typeof document !== 'undefined') {
    const symbolEl = document.querySelector('.ticker-pen-pro-symbol-title, .symbol-info-title, .symbol-text, .symbol-name');
    if (symbolEl && symbolEl.textContent) {
      symbol = symbolEl.textContent.trim();
    }
  }
  return symbol || 'BTCUSDT';
}

export function getActiveChartTimeframe(): string {
  let timeframe = (window as any).__active_period__ || (window as any).__active_timeframe_text__ || (window as any).__current_timeframe__ || '';

  const chart = (window as any).__active_chart_instance__;
  if (!timeframe && chart && typeof chart.getPeriod === 'function') {
    try {
      const p = chart.getPeriod();
      if (typeof p === 'string') timeframe = p;
      else if (p && p.text) timeframe = p.text;
      else if (p && p.multiplier && p.timespan) {
        if (p.timespan === 'minute') timeframe = `${p.multiplier}m`;
        else if (p.timespan === 'hour') timeframe = `${p.multiplier}h`;
        else if (p.timespan === 'day') timeframe = `${p.multiplier}d`;
        else if (p.timespan === 'week') timeframe = `${p.multiplier}w`;
        else if (p.timespan === 'month') timeframe = `${p.multiplier}M`;
      }
    } catch (e) { }
  }

  if (!timeframe && chart && typeof chart.getDataList === 'function') {
    try {
      const data = chart.getDataList();
      if (data && data.length >= 2) {
        const t1 = Number(data[data.length - 1].timestamp);
        const t0 = Number(data[data.length - 2].timestamp);
        const diffMs = Math.abs(t1 - t0);
        if (diffMs > 0) {
          const diffMin = Math.round(diffMs / 60000);
          if (diffMin === 1) timeframe = '1m';
          else if (diffMin === 3) timeframe = '3m';
          else if (diffMin === 5) timeframe = '5m';
          else if (diffMin === 15) timeframe = '15m';
          else if (diffMin === 30) timeframe = '30m';
          else if (diffMin === 45) timeframe = '45m';
          else if (diffMin === 60) timeframe = '1h';
          else if (diffMin === 120) timeframe = '2h';
          else if (diffMin === 180) timeframe = '3h';
          else if (diffMin === 240) timeframe = '4h';
          else if (diffMin === 360) timeframe = '6h';
          else if (diffMin === 480) timeframe = '8h';
          else if (diffMin === 720) timeframe = '12h';
          else if (diffMin === 1440) timeframe = '1d';
          else if (diffMin === 10080) timeframe = '1w';
          else if (diffMin >= 40000) timeframe = '1M';
          else if (diffMin < 60) timeframe = `${diffMin}m`;
          else if (diffMin < 1440) timeframe = `${Math.round(diffMin / 60)}h`;
          else timeframe = `${Math.round(diffMin / 1440)}d`;
        }
      }
    } catch (e) { }
  }

  if (!timeframe && typeof document !== 'undefined') {
    const activePeriodBtn = document.querySelector(
      '.ticker-pen-pro-period-bar .active, .ticker-pen-pro-period-bar .selected, .custom-timeframes-btn .label, .timeframe-selected'
    );
    if (activePeriodBtn && activePeriodBtn.textContent) {
      timeframe = activePeriodBtn.textContent.trim();
    }
  }
  return timeframe || '15m';
}

export function resolveTablePlaceholders(text: string): string {
  if (!text || typeof text !== 'string' || !text.includes('{')) return text;

  const chart = (window as any).__active_chart_instance__;
  const symbol = getActiveChartSymbol();
  const timeframe = getActiveChartTimeframe();
  const prec = (window as any).__active_price_precision__ ?? 2;

  let openPrice = '';
  let lastPrice = '';
  let highPrice = '';
  let lowPrice = '';
  let eqPrice = '';
  let changePct = '';
  let volumeStr = '';
  let dailyOpenPrice = '';
  let sideStr = 'LONG';
  let rsiStr = '---';
  let atrStr = '---';
  let macdStr = '---';

  if (chart && typeof chart.getDataList === 'function') {
    const data = chart.getDataList();
    if (data && data.length > 0) {
      const lastCandle = data[data.length - 1];
      const closes: number[] = [];
      for (const c of data) {
        if (typeof c.close === 'number') closes.push(c.close);
      }

      if (lastCandle) {
        const cOpen = Number(lastCandle.open);
        const cClose = Number(lastCandle.close);
        const cHigh = Number(lastCandle.high);
        const cLow = Number(lastCandle.low);

        if (!isNaN(cOpen)) openPrice = cOpen.toFixed(prec);
        if (!isNaN(cClose)) lastPrice = cClose.toFixed(prec);
        if (!isNaN(cHigh)) highPrice = cHigh.toFixed(prec);
        if (!isNaN(cLow)) lowPrice = cLow.toFixed(prec);
        if (!isNaN(cHigh) && !isNaN(cLow)) eqPrice = ((cHigh + cLow) / 2).toFixed(prec);

        if (!isNaN(cOpen) && !isNaN(cClose) && cOpen > 0) {
          const diff = ((cClose - cOpen) / cOpen) * 100;
          const sign = diff >= 0 ? '+' : '';
          changePct = `${sign}${diff.toFixed(2)}%`;
          sideStr = cClose >= cOpen ? 'LONG' : 'SHORT';
        }

        if (typeof lastCandle.volume === 'number') {
          volumeStr = formatVolume(lastCandle.volume);
        }

        // Daily Open: search backwards for start of current UTC day
        const nowUtcDay = new Date().getUTCDate();
        for (let i = data.length - 1; i >= 0; i--) {
          const cDate = new Date(data[i].timestamp);
          if (cDate.getUTCDate() !== nowUtcDay && i + 1 < data.length) {
            dailyOpenPrice = Number(data[i + 1].open).toFixed(prec);
            break;
          }
        }
        if (!dailyOpenPrice && data.length > 0) {
          dailyOpenPrice = Number(data[0].open).toFixed(prec);
        }

        rsiStr = computeRSI(closes, 14);
        atrStr = computeATR(data, 14, prec);
        macdStr = computeMACD(closes, prec);
      }
    }
  }

  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const dateStr = `${day}-${month}-${year}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const activeSession = getActiveSession(now);

  return text
    .replace(/\{symbol\}/gi, String(symbol))
    .replace(/\{price\}|\{last\}|\{spot\}|\{close\}/gi, lastPrice || '---')
    .replace(/\{open\}/gi, openPrice || '---')
    .replace(/\{high\}/gi, highPrice || '---')
    .replace(/\{low\}/gi, lowPrice || '---')
    .replace(/\{eq\}|\{mid\}|\{equilibrium\}/gi, eqPrice || '---')
    .replace(/\{change%\}|\{chg%\}|\{change\}/gi, changePct || '---')
    .replace(/\{vol\}|\{volume\}/gi, volumeStr || '---')
    .replace(/\{do\}|\{daily_open\}/gi, dailyOpenPrice || openPrice || '---')
    .replace(/\{session\}/gi, activeSession)
    .replace(/\{side\}/gi, sideStr)
    .replace(/\{day\}/gi, dayOfWeek)
    .replace(/\{rsi\}/gi, rsiStr)
    .replace(/\{atr\}/gi, atrStr)
    .replace(/\{macd\}/gi, macdStr)
    .replace(/\{timeframe\}|\{tf\}/gi, String(timeframe))
    .replace(/\{date\}/gi, dateStr)
    .replace(/\{time\}/gi, timeStr);
}

/**
 * Convert column letter(s) like "A", "B", "AA" to 0-based column index.
 */
export function colLetterToIndex(colStr: string): number {
  let index = 0;
  const upper = colStr.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      index = index * 26 + (code - 64);
    }
  }
  return Math.max(0, index - 1);
}

/**
 * Convert 0-based column index to letter(s) (0 -> "A", 1 -> "B", etc.).
 */
export function indexToColLetter(index: number): string {
  let letter = '';
  let temp = index + 1;
  while (temp > 0) {
    let rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter || 'A';
}

/**
 * Extract clean numeric float from string or value (stripping currency, %, commas).
 */
export function extractNumericValue(raw: any): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;
  const str = String(raw).trim();
  if (!str) return null;
  if (str.startsWith('#')) return null;
  const clean = str.replace(/[$€£¥,]/g, '').replace(/%$/, '').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

/**
 * Safe Recursive Descent Arithmetic Expression Evaluator.
 * Evaluates mathematical tokens with operators +, -, *, /, %, ^, unary +/-, and parentheses.
 */
function evaluateArithmeticString(expr: string): number | string {
  let pos = 0;
  const s = expr.replace(/\s+/g, '');

  function parseExpression(): number {
    let left = parseTerm();
    while (pos < s.length) {
      const op = s[pos];
      if (op === '+') {
        pos++;
        left = left + parseTerm();
      } else if (op === '-') {
        pos++;
        left = left - parseTerm();
      } else {
        break;
      }
    }
    return left;
  }

  function parseTerm(): number {
    let left = parsePower();
    while (pos < s.length) {
      const op = s[pos];
      if (op === '*') {
        pos++;
        left = left * parsePower();
      } else if (op === '/') {
        pos++;
        const right = parsePower();
        if (right === 0) throw new Error('#DIV/0!');
        left = left / right;
      } else if (op === '%') {
        pos++;
        const right = parsePower();
        if (right === 0) throw new Error('#DIV/0!');
        left = left % right;
      } else {
        break;
      }
    }
    return left;
  }

  function parsePower(): number {
    let left = parseFactor();
    if (pos < s.length && s[pos] === '^') {
      pos++;
      const right = parsePower();
      left = Math.pow(left, right);
    }
    return left;
  }

  function parseFactor(): number {
    if (pos >= s.length) return 0;
    if (s[pos] === '+') {
      pos++;
      return parseFactor();
    }
    if (s[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    if (s[pos] === '(') {
      pos++;
      const val = parseExpression();
      if (pos < s.length && s[pos] === ')') {
        pos++;
      }
      return val;
    }

    // Parse number
    const start = pos;
    while (pos < s.length && ((s[pos] >= '0' && s[pos] <= '9') || s[pos] === '.')) {
      pos++;
    }
    if (start === pos) return 0;
    const num = parseFloat(s.slice(start, pos));
    return isNaN(num) ? 0 : num;
  }

  try {
    const res = parseExpression();
    if (isNaN(res)) return '#VALUE!';
    if (!isFinite(res)) return '#DIV/0!';
    if (Number.isInteger(res)) return String(res);
    return String(parseFloat(res.toFixed(4)));
  } catch (err: any) {
    if (err && err.message && err.message.startsWith('#')) return err.message;
    return '#ERROR!';
  }
}

/**
 * Evaluates a single cell formula or value within the context of tableData.
 */
function evaluateSingleCell(
  r: number,
  c: number,
  tableData: string[][],
  cache: Map<string, string>,
  visited: Set<string>
): string {
  if (r < 0 || r >= tableData.length || !tableData[r] || c < 0 || c >= tableData[r].length) {
    return '';
  }

  const key = `${r}:${c}`;
  if (cache.has(key)) return cache.get(key)!;
  if (visited.has(key)) return '#REF!'; // Circular reference detection

  visited.add(key);

  const raw = tableData[r][c] || '';
  const resolved = resolveTablePlaceholders(raw).trim();

  if (!resolved.startsWith('=')) {
    visited.delete(key);
    cache.set(key, resolved);
    return resolved;
  }

  // Formula evaluation
  let formula = resolved.substring(1).trim();

  // Helper to extract numbers from a range string (e.g. A1:B3)
  const extractRangeNumbers = (rangeStr: string): number[] => {
    const parts = rangeStr.split(':');
    if (parts.length !== 2) return [];
    const m1 = parts[0].trim().toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
    const m2 = parts[1].trim().toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
    if (!m1 || !m2) return [];

    const c1 = colLetterToIndex(m1[1]);
    const r1 = parseInt(m1[2], 10) - 1;
    const c2 = colLetterToIndex(m2[1]);
    const r2 = parseInt(m2[2], 10) - 1;

    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);

    const nums: number[] = [];
    for (let rowIdx = minR; rowIdx <= maxR; rowIdx++) {
      for (let colIdx = minC; colIdx <= maxC; colIdx++) {
        const val = evaluateSingleCell(rowIdx, colIdx, tableData, cache, visited);
        const num = extractNumericValue(val);
        if (num !== null) nums.push(num);
      }
    }
    return nums;
  };

  // Helper to extract numbers from comma-separated arguments (which can be ranges, cell refs, or expressions)
  const extractArgNumbers = (argsStr: string): number[] => {
    const args = argsStr.split(',');
    const nums: number[] = [];
    for (const arg of args) {
      const trimmed = arg.trim();
      if (trimmed.includes(':')) {
        nums.push(...extractRangeNumbers(trimmed));
      } else {
        const cellMatch = trimmed.toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
        if (cellMatch) {
          const colIdx = colLetterToIndex(cellMatch[1]);
          const rowIdx = parseInt(cellMatch[2], 10) - 1;
          const val = evaluateSingleCell(rowIdx, colIdx, tableData, cache, visited);
          const num = extractNumericValue(val);
          if (num !== null) nums.push(num);
        } else {
          const num = extractNumericValue(trimmed);
          if (num !== null) nums.push(num);
        }
      }
    }
    return nums;
  };

  try {
    // 1. Handle Aggregate & Range Functions (SUM, AVG, AVERAGE, MIN, MAX, COUNT)
    formula = formula.replace(/\bSUM\s*\(([^()]+)\)/gi, (_, args) => {
      const nums = extractArgNumbers(args);
      const sum = nums.reduce((a, b) => a + b, 0);
      return String(sum);
    });

    formula = formula.replace(/\b(AVG|AVERAGE)\s*\(([^()]+)\)/gi, (_, __, args) => {
      const nums = extractArgNumbers(args);
      if (nums.length === 0) return '0';
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      return String(avg);
    });

    formula = formula.replace(/\bMIN\s*\(([^()]+)\)/gi, (_, args) => {
      const nums = extractArgNumbers(args);
      if (nums.length === 0) return '0';
      return String(Math.min(...nums));
    });

    formula = formula.replace(/\bMAX\s*\(([^()]+)\)/gi, (_, args) => {
      const nums = extractArgNumbers(args);
      if (nums.length === 0) return '0';
      return String(Math.max(...nums));
    });

    formula = formula.replace(/\bCOUNT\s*\(([^()]+)\)/gi, (_, args) => {
      const nums = extractArgNumbers(args);
      return String(nums.length);
    });

    // 2. Handle Math Functions (ROUND, ABS, SQRT, POW)
    formula = formula.replace(/\bROUND\s*\(([^,()]+),\s*([^()]+)\)/gi, (_, valStr, decStr) => {
      const v = Number(evaluateArithmeticString(valStr));
      const d = parseInt(decStr.trim(), 10) || 0;
      if (isNaN(v)) return '0';
      return v.toFixed(Math.max(0, Math.min(8, d)));
    });

    formula = formula.replace(/\bABS\s*\(([^()]+)\)/gi, (_, valStr) => {
      const v = Number(evaluateArithmeticString(valStr));
      return isNaN(v) ? '0' : String(Math.abs(v));
    });

    formula = formula.replace(/\bSQRT\s*\(([^()]+)\)/gi, (_, valStr) => {
      const v = Number(evaluateArithmeticString(valStr));
      return (isNaN(v) || v < 0) ? '#ERROR!' : String(Math.sqrt(v));
    });

    formula = formula.replace(/\bPOW\s*\(([^,()]+),\s*([^()]+)\)/gi, (_, bStr, eStr) => {
      const b = Number(evaluateArithmeticString(bStr));
      const e = Number(evaluateArithmeticString(eStr));
      return (isNaN(b) || isNaN(e)) ? '#ERROR!' : String(Math.pow(b, e));
    });

    // 3. Handle Conditional IF(condition, trueVal, falseVal)
    formula = formula.replace(/\bIF\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\)/gi, (_, cond, tVal, fVal) => {
      let isTrue = false;
      if (cond.includes('>=')) {
        const [a, b] = cond.split('>=');
        isTrue = Number(evaluateArithmeticString(a)) >= Number(evaluateArithmeticString(b));
      } else if (cond.includes('<=')) {
        const [a, b] = cond.split('<=');
        isTrue = Number(evaluateArithmeticString(a)) <= Number(evaluateArithmeticString(b));
      } else if (cond.includes('!=')) {
        const [a, b] = cond.split('!=');
        isTrue = String(a).trim() !== String(b).trim();
      } else if (cond.includes('>')) {
        const [a, b] = cond.split('>');
        isTrue = Number(evaluateArithmeticString(a)) > Number(evaluateArithmeticString(b));
      } else if (cond.includes('<')) {
        const [a, b] = cond.split('<');
        isTrue = Number(evaluateArithmeticString(a)) < Number(evaluateArithmeticString(b));
      } else if (cond.includes('=')) {
        const [a, b] = cond.split('=');
        isTrue = String(a).trim() === String(b).trim();
      } else {
        isTrue = Boolean(Number(evaluateArithmeticString(cond)));
      }
      return isTrue ? tVal.trim().replace(/^['"]|['"]$/g, '') : fVal.trim().replace(/^['"]|['"]$/g, '');
    });

    // 4. Substitute Individual Cell References (e.g. A1, B3, C2)
    formula = formula.replace(/\b([A-Z]+)([0-9]+)\b/gi, (match, colName, rowName) => {
      const colIdx = colLetterToIndex(colName);
      const rowIdx = parseInt(rowName, 10) - 1;
      const cellVal = evaluateSingleCell(rowIdx, colIdx, tableData, cache, visited);
      const num = extractNumericValue(cellVal);
      return num !== null ? String(num) : '0';
    });

    // 5. Evaluate remaining arithmetic expression
    const result = String(evaluateArithmeticString(formula));
    visited.delete(key);
    cache.set(key, result);
    return result;
  } catch (e: any) {
    visited.delete(key);
    const errStr = (e && e.message && e.message.startsWith('#')) ? e.message : '#ERROR!';
    cache.set(key, errStr);
    return errStr;
  }
}

/**
 * Evaluates the entire 2D table grid with Smart Tags and Formulas.
 */
export function evaluateTableData(tableData: string[][]): string[][] {
  if (!tableData || !Array.isArray(tableData) || tableData.length === 0) return [];
  const rows = tableData.length;
  const cols = Math.max(1, ...tableData.map(r => r.length));
  const evaluated: string[][] = [];
  const cache = new Map<string, string>();

  for (let r = 0; r < rows; r++) {
    const rowArr: string[] = [];
    for (let c = 0; c < cols; c++) {
      const visited = new Set<string>();
      const val = evaluateSingleCell(r, c, tableData, cache, visited);
      rowArr.push(val);
    }
    evaluated.push(rowArr);
  }
  return evaluated;
}

export function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const safeMaxWidth = Math.max(16, maxWidth);
  const paragraphs = String(text).split(/\r?\n/);
  const resultLines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      resultLines.push('');
      continue;
    }
    const words = para.split(' ');
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word) continue;

      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = ctx.measureText(testLine).width;

      if (testWidth <= safeMaxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          resultLines.push(currentLine);
          currentLine = '';
        }
        // If a single word is wider than maxWidth, break character by character
        if (ctx.measureText(word).width > safeMaxWidth) {
          let chunk = '';
          for (const char of word) {
            const testChunk = chunk + char;
            if (ctx.measureText(testChunk).width > safeMaxWidth && chunk) {
              resultLines.push(chunk);
              chunk = char;
            } else {
              chunk = testChunk;
            }
          }
          currentLine = chunk;
        } else {
          currentLine = word;
        }
      }
    }
    if (currentLine) {
      resultLines.push(currentLine);
    }
  }
  return resultLines.length > 0 ? resultLines : [''];
}

let _measuringCtx: CanvasRenderingContext2D | null = null;
function getMeasuringContext(fontSize: number, fontWeight: string = 'normal'): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!_measuringCtx) {
    const canvas = document.createElement('canvas');
    _measuringCtx = canvas.getContext('2d');
  }
  if (_measuringCtx) {
    _measuringCtx.font = `${fontWeight} ${fontSize}px 'Rubik', sans-serif`;
  }
  return _measuringCtx;
}

export function getTableDimensions(
  x: number,
  y: number,
  w: number,
  h: number,
  cols: number,
  rows: number,
  rawColRatios?: number[],
  rawRowRatios?: number[],
  tableData?: string[][],
  fontSize: number = 14,
  wrapText: boolean = true,
  headerRow: boolean = false
) {
  let colRatios = rawColRatios;
  if (!colRatios || !Array.isArray(colRatios) || colRatios.length !== cols) {
    colRatios = Array(cols).fill(1 / cols);
  } else {
    const sum = colRatios.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.001 && sum > 0) {
      colRatios = colRatios.map((r) => r / sum);
    }
  }

  const colWidths = colRatios.map((r) => w * r);
  const colXs: number[] = [x];
  for (let c = 0; c < cols; c++) {
    colXs.push(colXs[c] + colWidths[c]);
  }

  // Calculate base row heights
  let baseRowHeights: number[];
  if (rawRowRatios && Array.isArray(rawRowRatios) && rawRowRatios.length === rows) {
    baseRowHeights = rawRowRatios.map((r) => h * r);
  } else {
    baseRowHeights = Array(rows).fill(h / rows);
  }

  // Dynamically auto-expand row heights if wrapped text requires more vertical space
  const rowHeights: number[] = [];
  const padding = 6;
  const lineHeight = fontSize * 1.35;

  if (tableData && Array.isArray(tableData)) {
    const evalData = evaluateTableData(tableData);
    const mCtx = getMeasuringContext(fontSize);
    for (let r = 0; r < rows; r++) {
      let maxNeededRowH = Math.max(28, baseRowHeights[r] || 28);
      const isHeader = headerRow && r === 0;
      if (mCtx) {
        mCtx.font = `${isHeader ? '600' : 'normal'} ${fontSize}px 'Rubik', sans-serif`;
      }

      for (let c = 0; c < cols; c++) {
        const cellText = evalData[r]?.[c] ?? '';
        if (!cellText) continue;
        const cellW = colWidths[c];
        const maxTextW = Math.max(16, cellW - padding * 2);

        if (mCtx) {
          const lines = wrapText ? wrapCanvasText(mCtx, cellText, maxTextW) : [cellText];
          const neededH = lines.length * lineHeight + padding * 2;
          if (neededH > maxNeededRowH) {
            maxNeededRowH = neededH;
          }
        }
      }
      rowHeights.push(maxNeededRowH);
    }
  } else {
    for (let r = 0; r < rows; r++) {
      rowHeights.push(Math.max(28, baseRowHeights[r] || 28));
    }
  }

  const rowYs: number[] = [y];
  for (let r = 0; r < rows; r++) {
    rowYs.push(rowYs[r] + rowHeights[r]);
  }

  const totalH = rowYs[rows] - y;
  const rowRatios = rowHeights.map((rh) => rh / Math.max(1, totalH));

  return { colRatios, rowRatios, colWidths, rowHeights, colXs, rowYs, totalH };
}

export const tableOverlay: OverlayTemplate = {
  name: 'table',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    point: {
      color: 'rgba(0, 0, 0, 0)',
      borderColor: 'rgba(0, 0, 0, 0)',
      activeColor: 'rgba(0, 0, 0, 0)',
      activeBorderColor: 'rgba(0, 0, 0, 0)',
      radius: 8,
      activeRadius: 8
    }
  },
  createPointFigures: (params: OverlayCreateFiguresCallbackParams<any>) => {
    const { coordinates, overlay } = params;
    const { isSelected, isHovered, isDrawing } = getOverlayState(overlay);
    if (isDrawing && (!overlay.points || overlay.points.length < 2)) {
      return [];
    }
    const figures: any[] = [];
    if (coordinates.length >= 1 && coordinates[0]) {
      const p1 = coordinates[0];
      const p2 = coordinates[1] || { x: p1.x + 336, y: p1.y + 120 };
      const x = Math.min(p1.x, p2.x);
      const y = Math.min(p1.y, p2.y);
      const w = Math.max(40, Math.abs(p2.x - p1.x));
      const h = Math.max(30, Math.abs(p2.y - p1.y));

      const rows = Math.max(1, overlay.extendData?.rows ?? 3);
      const cols = Math.max(1, overlay.extendData?.cols ?? 3);
      const tableData: string[][] = overlay.extendData?.tableData ?? Array.from({ length: rows }, () => Array(cols).fill(''));
      const backgroundColor = overlay.extendData?.backgroundColor ?? '#3c404b';
      const borderColor = overlay.extendData?.borderColor ?? '#2962ff';
      const borderWidth = overlay.extendData?.borderWidth ?? 1;
      const textColor = overlay.extendData?.textColor ?? '#ffffff';
      const fontSize = overlay.extendData?.fontSize ?? 14;
      const textAlign = overlay.extendData?.textAlign ?? 'left';
      const headerRow = overlay.extendData?.headerRow ?? false;
      const headerBgColor = overlay.extendData?.headerBgColor ?? '#242836';
      const headerTextColor = overlay.extendData?.headerTextColor ?? '#ffffff';
      const zebraStriping = overlay.extendData?.zebraStriping ?? false;
      const zebraColor = overlay.extendData?.zebraColor ?? 'rgba(255, 255, 255, 0.04)';
      const borderRadius = Math.max(0, Math.min(16, overlay.extendData?.borderRadius ?? 6));
      const wrapText = overlay.extendData?.wrapText !== false;

      const { colWidths, rowHeights, colXs, rowYs, totalH } = getTableDimensions(
        x,
        y,
        w,
        h,
        cols,
        rows,
        overlay.extendData?.colRatios,
        overlay.extendData?.rowRatios,
        tableData,
        fontSize,
        wrapText,
        headerRow
      );

      // 1. Hit-box covering the full table area for selection & translation
      figures.push({
        key: 'table-hit-box',
        type: 'rect',
        attrs: { x, y, width: w, height: totalH },
        styles: {
          style: 'fill',
          color: 'rgba(0, 0, 0, 0)',
          borderColor: 'rgba(0, 0, 0, 0)',
          borderSize: 0
        },
        ignoreEvent: false
      });

      // 2. Custom Drawing Renderer for Background, Grid Lines, Headers, Zebra Striping & Cell Texts
      figures.push({
        type: 'customDrawingRenderer',
        attrs: {
          drawFn: (ctx: CanvasRenderingContext2D) => {
            const evalData = evaluateTableData(tableData);
            const traceRoundedRect = (rx: number, ry: number, rw: number, rh: number, rad: number) => {
              ctx.beginPath();
              if (typeof (ctx as any).roundRect === 'function') {
                (ctx as any).roundRect(rx, ry, rw, rh, rad);
              } else {
                const r = Math.min(rad, rw / 2, rh / 2);
                ctx.moveTo(rx + r, ry);
                ctx.lineTo(rx + rw - r, ry);
                ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
                ctx.lineTo(rx + rw, ry + rh - r);
                ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
                ctx.lineTo(rx + r, ry + rh);
                ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
                ctx.lineTo(rx, ry + r);
                ctx.quadraticCurveTo(rx, ry, rx + r, ry);
                ctx.closePath();
              }
            };

            ctx.save();

            // Rounded corner clipping for content inside if borderRadius > 0
            if (borderRadius > 0) {
              traceRoundedRect(x, y, w, totalH, borderRadius);
              ctx.clip();
            }

            // Base Background Fill
            if (backgroundColor && backgroundColor !== 'transparent') {
              ctx.fillStyle = backgroundColor;
              ctx.fillRect(x, y, w, totalH);
            }

            // Zebra Striping on alternating data rows
            if (zebraStriping) {
              ctx.fillStyle = zebraColor;
              for (let r = 0; r < rows; r++) {
                if (headerRow && r === 0) continue;
                if (r % 2 === 1) {
                  ctx.fillRect(x, rowYs[r], w, rowHeights[r]);
                }
              }
            }

            // Header Row Background Fill
            if (headerRow && rows > 0 && headerBgColor && headerBgColor !== 'transparent') {
              ctx.fillStyle = headerBgColor;
              ctx.fillRect(x, y, w, rowHeights[0]);
            }

            // Internal Grid Lines (Dividers)
            if (borderColor && borderColor !== 'transparent' && borderWidth > 0) {
              ctx.strokeStyle = borderColor;
              ctx.lineWidth = borderWidth;
              ctx.setLineDash([]);

              // Vertical Column Dividers
              for (let c = 1; c < cols; c++) {
                const lineX = Math.round(colXs[c]) + 0.5;
                ctx.beginPath();
                ctx.moveTo(lineX, y);
                ctx.lineTo(lineX, y + totalH);
                ctx.stroke();
              }

              // Horizontal Row Dividers
              for (let r = 1; r < rows; r++) {
                const lineY = Math.round(rowYs[r]) + 0.5;
                ctx.beginPath();
                ctx.moveTo(x, lineY);
                ctx.lineTo(x + w, lineY);
                if (headerRow && r === 1) {
                  ctx.lineWidth = borderWidth + 0.5;
                } else {
                  ctx.lineWidth = borderWidth;
                }
                ctx.stroke();
              }
            }

            // Render Text in Cells with Variable Resolution and Word Wrapping
            const padding = 6;
            for (let r = 0; r < rows; r++) {
              const isHeader = headerRow && r === 0;
              const currentTextColor = isHeader ? (headerTextColor || '#ffffff') : textColor;
              const fontWeight = isHeader ? '600' : 'normal';

              ctx.font = `${fontWeight} ${fontSize}px 'Rubik', sans-serif`;
              ctx.fillStyle = currentTextColor;
              ctx.textBaseline = 'top';

              const cellY = rowYs[r];
              const cellH = rowHeights[r];

              for (let c = 0; c < cols; c++) {
                const cellText = evalData[r]?.[c] ?? '';
                if (!cellText) continue;

                const cellX = colXs[c];
                const cellW = colWidths[c];

                ctx.save();
                ctx.beginPath();
                ctx.rect(cellX + 1, cellY + 1, Math.max(1, cellW - 2), Math.max(1, cellH - 2));
                ctx.clip();

                const maxTextW = Math.max(10, cellW - padding * 2);
                const lines = wrapText ? wrapCanvasText(ctx, cellText, maxTextW) : [cellText];
                const lineHeight = fontSize * 1.35;
                const totalLinesH = lines.length * lineHeight;

                // Center multi-line block vertically if fits, or start from top
                const startY = (totalLinesH <= cellH - padding)
                  ? cellY + (cellH - totalLinesH) / 2
                  : cellY + padding;

                lines.forEach((line, idx) => {
                  const lineY = startY + idx * lineHeight;
                  if (textAlign === 'center') {
                    ctx.textAlign = 'center';
                    ctx.fillText(line, cellX + cellW / 2, lineY);
                  } else if (textAlign === 'right') {
                    ctx.textAlign = 'right';
                    ctx.fillText(line, cellX + cellW - padding, lineY);
                  } else {
                    ctx.textAlign = 'left';
                    ctx.fillText(line, cellX + padding, lineY);
                  }
                });

                ctx.restore();
              }
            }

            // Restore inner clipping
            ctx.restore();

            // Outer Border - cleanly drawn along the rounded rectangle path
            if (borderColor && borderColor !== 'transparent' && borderWidth > 0) {
              ctx.save();
              ctx.strokeStyle = borderColor;
              ctx.lineWidth = borderWidth;
              ctx.setLineDash([]);
              if (borderRadius > 0) {
                traceRoundedRect(x, y, w, totalH, borderRadius);
                ctx.stroke();
              } else {
                ctx.strokeRect(x, y, w, totalH);
              }
              ctx.restore();
            }
          }
        }
      });

      // 3. Interactive Column Divider Handles (Drag to resize columns with mouse)
      if ((isSelected || isHovered) && !isDrawing) {
        for (let c = 1; c < cols; c++) {
          const divX = colXs[c];
          figures.push({
            key: `table-col-divider-${c}`,
            type: 'rect',
            attrs: { x: divX - 6, y: y, width: 12, height: totalH },
            styles: {
              style: 'fill',
              color: 'rgba(0, 0, 0, 0)',
              borderColor: 'rgba(0, 0, 0, 0)',
              borderSize: 0
            },
            ignoreEvent: false
          });
        }

        // 4. Interactive Row Divider Handles (Drag to resize rows with mouse)
        for (let r = 1; r < rows; r++) {
          const divY = rowYs[r];
          figures.push({
            key: `table-row-divider-${r}`,
            type: 'rect',
            attrs: { x: x, y: divY - 6, width: w, height: 12 },
            styles: {
              style: 'fill',
              color: 'rgba(0, 0, 0, 0)',
              borderColor: 'rgba(0, 0, 0, 0)',
              borderSize: 0
            },
            ignoreEvent: false
          });
        }

        // 5. Four Corner Anchors - fully draggable and visually styled
        const corners = [
          { x: x, y: y },              // 0: Top-Left
          { x: x + w, y: y },          // 1: Top-Right
          { x: x + w, y: y + totalH }, // 2: Bottom-Right
          { x: x, y: y + totalH }      // 3: Bottom-Left
        ];

        const activeTableAnchor = (overlay as any).__activeDragAnchorIndex ?? (tableDragStateMap.get(overlay.id)?.dragCornerIndex);
        corners.forEach((corner, idx) => {
          figures.push({
            key: `table-corner-${idx}`,
            type: 'rect',
            attrs: { x: corner.x - 10, y: corner.y - 10, width: 20, height: 20 },
            styles: {
              style: 'fill',
              color: 'rgba(0, 0, 0, 0)',
              borderColor: 'rgba(0, 0, 0, 0)',
              borderSize: 0
            },
            ignoreEvent: false
          });

          if (activeTableAnchor !== idx) {
            figures.push({
              key: `table-anchor-visual-${idx}`,
              type: 'customDrawingRenderer',
              attrs: {
                drawFn: (ctx: CanvasRenderingContext2D) => {
                  ctx.save();
                  ctx.setLineDash([]);
                  const radius = 5;
                  const ringWidth = 1.5;

                  ctx.beginPath();
                  ctx.arc(corner.x, corner.y, radius, 0, Math.PI * 2);
                  ctx.fillStyle = '#131722';
                  ctx.fill();

                  ctx.beginPath();
                  ctx.arc(corner.x, corner.y, radius - ringWidth / 2, 0, Math.PI * 2);
                  ctx.strokeStyle = '#2962FF';
                  ctx.lineWidth = ringWidth;
                  ctx.stroke();

                  ctx.restore();
                }
              },
              ignoreEvent: true
            });
          }
        });
      }
    }
    return figures;
  },
  onPressedMoveStart: (event: any) => {
    try {
      const overlay = event.overlay;
      const chart = (window as any).__active_chart_instance__;
      if (!chart || !overlay.points || !overlay.points[0]) return false;

      const p0 = chart.convertToPixel(overlay.points[0]);
      const p1 = overlay.points[1] ? chart.convertToPixel(overlay.points[1]) : (p0 ? { x: p0.x + 336, y: p0.y + 120 } : null);

      if (p0 && p1) {
        const x = Math.min(p0.x, p1.x);
        const y = Math.min(p0.y, p1.y);
        const w = Math.max(40, Math.abs(p1.x - p0.x));
        const h = Math.max(30, Math.abs(p1.y - p0.y));

        const rows = Math.max(1, overlay.extendData?.rows ?? 3);
        const cols = Math.max(1, overlay.extendData?.cols ?? 3);

        const { colRatios, rowRatios, colXs, rowYs } = getTableDimensions(
          x,
          y,
          w,
          h,
          cols,
          rows,
          overlay.extendData?.colRatios,
          overlay.extendData?.rowRatios,
          overlay.extendData?.tableData,
          overlay.extendData?.fontSize ?? 14,
          overlay.extendData?.wrapText !== false,
          overlay.extendData?.headerRow ?? false
        );

        let dragCorner = -1;
        let dragColDivider = -1;
        let dragRowDivider = -1;

        const key = String(event.figure?.key || event.figureKey || '');
        if (key.startsWith('table-corner-')) {
          dragCorner = parseInt(key.replace('table-corner-', ''), 10);
        } else if (key.startsWith('table-col-divider-')) {
          dragColDivider = parseInt(key.replace('table-col-divider-', ''), 10);
        } else if (key.startsWith('table-row-divider-')) {
          dragRowDivider = parseInt(key.replace('table-row-divider-', ''), 10);
        }

        if (dragCorner >= 0) {
          setGlobalActiveDragAnchor(dragCorner, overlay.id);
          (overlay as any).__activeDragAnchorIndex = dragCorner;
        }

        const mouseX = typeof event.x === 'number' && !isNaN(event.x) ? event.x : (event.coordinate?.x ?? p0.x);
        const mouseY = typeof event.y === 'number' && !isNaN(event.y) ? event.y : (event.coordinate?.y ?? p0.y);

        // Proximity detection if key was not directly captured
        if (dragCorner < 0 && dragColDivider < 0 && dragRowDivider < 0) {
          // Check column dividers (10px tolerance)
          for (let c = 1; c < cols; c++) {
            if (Math.abs(mouseX - colXs[c]) <= 10 && mouseY >= y - 10 && mouseY <= y + h + 10) {
              dragColDivider = c;
              break;
            }
          }
          // Check row dividers (10px tolerance)
          if (dragColDivider < 0) {
            for (let r = 1; r < rows; r++) {
              if (Math.abs(mouseY - rowYs[r]) <= 10 && mouseX >= x - 10 && mouseX <= x + w + 10) {
                dragRowDivider = r;
                break;
              }
            }
          }
          // Check corners
          if (dragColDivider < 0 && dragRowDivider < 0) {
            const corners = [
              { x: x, y: y },
              { x: x + w, y: y },
              { x: x + w, y: y + h },
              { x: x, y: y + h }
            ];
            let nearestDist = 24;
            corners.forEach((c, idx) => {
              const d = Math.hypot(mouseX - c.x, mouseY - c.y);
              if (d < nearestDist) {
                nearestDist = d;
                dragCorner = idx;
              }
            });
          }
        }

        tableDragStateMap.set(overlay.id, {
          dragCornerIndex: dragCorner,
          dragColDivider,
          dragRowDivider,
          startPixel: { x: mouseX, y: mouseY },
          startBounds: { x, y, w, h },
          startColRatios: [...colRatios],
          startRowRatios: [...rowRatios],
          startPoints: [
            { ...(overlay.points[0] || {}) },
            { ...(overlay.points[1] || {}) }
          ]
        });
      }
    } catch (e) { }
    return false;
  },
  onPressedMoving: (event: any) => {
    try {
      const overlay = event.overlay;
      const chart = (window as any).__active_chart_instance__;
      const state = tableDragStateMap.get(overlay.id);
      if (!chart || !state) return false;

      const { dragCornerIndex, dragColDivider, dragRowDivider, startPixel, startBounds, startColRatios, startRowRatios, startPoints } = state;
      const mouseX = typeof event.x === 'number' && !isNaN(event.x) ? event.x : (event.coordinate?.x ?? startPixel.x);
      const mouseY = typeof event.y === 'number' && !isNaN(event.y) ? event.y : (event.coordinate?.y ?? startPixel.y);
      const dx = mouseX - startPixel.x;
      const dy = mouseY - startPixel.y;

      // Handle Column Divider Resizing by mouse (lock table points in place)
      if (dragColDivider !== undefined && dragColDivider >= 1 && startColRatios && startPoints) {
        const totalW = startBounds.w;
        const leftIdx = dragColDivider - 1;
        const rightIdx = dragColDivider;

        const leftStartW = startColRatios[leftIdx] * totalW;
        const rightStartW = startColRatios[rightIdx] * totalW;
        const combinedW = leftStartW + rightStartW;

        const minCellW = 20;
        const newLeftW = Math.max(minCellW, Math.min(combinedW - minCellW, leftStartW + dx));
        const newRightW = combinedW - newLeftW;

        const newColRatios = [...startColRatios];
        newColRatios[leftIdx] = newLeftW / totalW;
        newColRatios[rightIdx] = newRightW / totalW;

        // Strictly lock points so table position does not move
        overlay.points = [
          { ...startPoints[0] },
          { ...startPoints[1] }
        ];

        overlay.extendData = {
          ...(overlay.extendData || {}),
          colRatios: newColRatios
        };

        if (typeof chart.updatePane === 'function') {
          chart.updatePane(1);
        }
        return true;
      }

      // Handle Row Divider Resizing by mouse (lock table points in place)
      if (dragRowDivider !== undefined && dragRowDivider >= 1 && startRowRatios && startPoints) {
        const totalH = startBounds.h;
        const topIdx = dragRowDivider - 1;
        const bottomIdx = dragRowDivider;

        const topStartH = startRowRatios[topIdx] * totalH;
        const bottomStartH = startRowRatios[bottomIdx] * totalH;
        const combinedH = topStartH + bottomStartH;

        const minCellH = 16;
        const newTopH = Math.max(minCellH, Math.min(combinedH - minCellH, topStartH + dy));
        const newBottomH = combinedH - newTopH;

        const newRowRatios = [...startRowRatios];
        newRowRatios[topIdx] = newTopH / totalH;
        newRowRatios[bottomIdx] = newBottomH / totalH;

        // Strictly lock points so table position does not move
        overlay.points = [
          { ...startPoints[0] },
          { ...startPoints[1] }
        ];

        overlay.extendData = {
          ...(overlay.extendData || {}),
          rowRatios: newRowRatios
        };

        if (typeof chart.updatePane === 'function') {
          chart.updatePane(1);
        }
        return true;
      }

      // Handle Corner Dragging (Scaling bounds)
      let newX = startBounds.x;
      let newY = startBounds.y;
      let newW = startBounds.w;
      let newH = startBounds.h;

      if (dragCornerIndex === 0) {
        const rightX = startBounds.x + startBounds.w;
        const bottomY = startBounds.y + startBounds.h;
        const proposedX = Math.min(rightX - 40, startBounds.x + dx);
        const proposedY = Math.min(bottomY - 30, startBounds.y + dy);
        newX = proposedX;
        newY = proposedY;
        newW = rightX - proposedX;
        newH = bottomY - proposedY;
      } else if (dragCornerIndex === 1) {
        const leftX = startBounds.x;
        const bottomY = startBounds.y + startBounds.h;
        const proposedRightX = Math.max(leftX + 40, startBounds.x + startBounds.w + dx);
        const proposedY = Math.min(bottomY - 30, startBounds.y + dy);
        newX = leftX;
        newY = proposedY;
        newW = proposedRightX - leftX;
        newH = bottomY - proposedY;
      } else if (dragCornerIndex === 2) {
        const leftX = startBounds.x;
        const topY = startBounds.y;
        newX = leftX;
        newY = topY;
        newW = Math.max(40, startBounds.w + dx);
        newH = Math.max(30, startBounds.h + dy);
      } else if (dragCornerIndex === 3) {
        const rightX = startBounds.x + startBounds.w;
        const topY = startBounds.y;
        const proposedX = Math.min(rightX - 40, startBounds.x + dx);
        newX = proposedX;
        newY = topY;
        newW = rightX - proposedX;
        newH = Math.max(30, startBounds.h + dy);
      } else {
        // Entire table body move / translation
        newX = startBounds.x + dx;
        newY = startBounds.y + dy;
      }

      const newPt0 = chart.convertFromPixel({ x: newX, y: newY });
      const newPt1 = chart.convertFromPixel({ x: newX + newW, y: newY + newH });

      if (newPt0 && newPt1) {
        overlay.points = [
          {
            ...(overlay.points[0] || {}),
            dataIndex: newPt0.dataIndex,
            timestamp: newPt0.timestamp,
            value: newPt0.value
          },
          {
            ...(overlay.points[1] || {}),
            dataIndex: newPt1.dataIndex,
            timestamp: newPt1.timestamp,
            value: newPt1.value
          }
        ];
        if (typeof chart.updatePane === 'function') {
          chart.updatePane(1);
        }
        return true;
      }
    } catch (e) { }
    return false;
  },
  onPressedMoveEnd: (event: any) => {
    tableDragStateMap.delete(event.overlay?.id);
    setGlobalActiveDragAnchor(null, undefined);
    if (event.overlay) {
      (event.overlay as any).__activeDragAnchorIndex = null;
    }
    try {
      const overlay = event.overlay;
      const chart = (window as any).__active_chart_instance__;
      let screenX = 350;
      let screenY = 120;
      if (chart && overlay.points && overlay.points[0]) {
        try {
          const px1 = chart.convertToPixel(overlay.points[0]);
          const px2 = overlay.points[1] ? chart.convertToPixel(overlay.points[1]) : px1;
          if (px1 && px2) {
            screenX = Math.min(px1.x, px2.x);
            screenY = Math.min(px1.y, px2.y);
          }
        } catch (e) { }
      }
      window.dispatchEvent(new CustomEvent('open-table-toolbar', {
        detail: {
          overlayId: overlay.id,
          overlayName: overlay.name,
          rows: overlay.extendData?.rows ?? 3,
          cols: overlay.extendData?.cols ?? 3,
          tableData: overlay.extendData?.tableData ?? Array.from({ length: overlay.extendData?.rows ?? 3 }, () => Array(overlay.extendData?.cols ?? 3).fill('')),
          backgroundColor: overlay.extendData?.backgroundColor ?? '#3c404b',
          borderColor: overlay.extendData?.borderColor ?? '#2962ff',
          borderWidth: overlay.extendData?.borderWidth ?? 1,
          textColor: overlay.extendData?.textColor ?? '#ffffff',
          fontSize: overlay.extendData?.fontSize ?? 14,
          textAlign: overlay.extendData?.textAlign ?? 'left',
          headerRow: overlay.extendData?.headerRow ?? false,
          headerBgColor: overlay.extendData?.headerBgColor ?? '#242836',
          headerTextColor: overlay.extendData?.headerTextColor ?? '#ffffff',
          zebraStriping: overlay.extendData?.zebraStriping ?? false,
          zebraColor: overlay.extendData?.zebraColor ?? 'rgba(255, 255, 255, 0.04)',
          borderRadius: overlay.extendData?.borderRadius ?? 6,
          wrapText: overlay.extendData?.wrapText !== false,
          colRatios: overlay.extendData?.colRatios,
          rowRatios: overlay.extendData?.rowRatios,
          screenX,
          screenY
        }
      }));
    } catch (e) { }
    return false;
  },
  onSelected: (event: any) => {
    try {
      window.dispatchEvent(new CustomEvent('close-text-settings', { detail: {} }));
      window.dispatchEvent(new CustomEvent('close-fib-settings', { detail: {} }));
      window.dispatchEvent(new CustomEvent('close-position-settings', { detail: {} }));
      const overlay = event.overlay;
      const chart = (window as any).__active_chart_instance__;
      let screenX = 350;
      let screenY = 120;
      if (chart && overlay.points && overlay.points[0]) {
        try {
          const px1 = chart.convertToPixel(overlay.points[0]);
          const px2 = overlay.points[1] ? chart.convertToPixel(overlay.points[1]) : px1;
          if (px1 && px2) {
            screenX = Math.min(px1.x, px2.x);
            screenY = Math.min(px1.y, px2.y);
          }
        } catch (e) { }
      }
      window.dispatchEvent(new CustomEvent('open-table-toolbar', {
        detail: {
          overlayId: overlay.id,
          overlayName: overlay.name,
          rows: overlay.extendData?.rows ?? 3,
          cols: overlay.extendData?.cols ?? 3,
          tableData: overlay.extendData?.tableData ?? Array.from({ length: overlay.extendData?.rows ?? 3 }, () => Array(overlay.extendData?.cols ?? 3).fill('')),
          backgroundColor: overlay.extendData?.backgroundColor ?? '#3c404b',
          borderColor: overlay.extendData?.borderColor ?? '#2962ff',
          borderWidth: overlay.extendData?.borderWidth ?? 1,
          textColor: overlay.extendData?.textColor ?? '#ffffff',
          fontSize: overlay.extendData?.fontSize ?? 14,
          textAlign: overlay.extendData?.textAlign ?? 'left',
          headerRow: overlay.extendData?.headerRow ?? false,
          headerBgColor: overlay.extendData?.headerBgColor ?? '#242836',
          headerTextColor: overlay.extendData?.headerTextColor ?? '#ffffff',
          zebraStriping: overlay.extendData?.zebraStriping ?? false,
          zebraColor: overlay.extendData?.zebraColor ?? 'rgba(255, 255, 255, 0.04)',
          borderRadius: overlay.extendData?.borderRadius ?? 6,
          wrapText: overlay.extendData?.wrapText !== false,
          colRatios: overlay.extendData?.colRatios,
          rowRatios: overlay.extendData?.rowRatios,
          screenX,
          screenY
        }
      }));
      const charts = Array.from((window as any).globalCoreCharts || []);
      charts.forEach((c: any) => c.updatePane?.(1));
    } catch (e) { }
    return false;
  },
  onDeselected: (event: any) => {
    try {
      if (event && event.overlay) {
        window.dispatchEvent(new CustomEvent('close-table-toolbar', {
          detail: { overlayId: event.overlay.id }
        }));
      }
      const charts = Array.from((window as any).globalCoreCharts || []);
      charts.forEach((c: any) => c.updatePane?.(1));
    } catch (e) { }
    return false;
  },
  onRemoved: (event: any) => {
    try {
      if (event && event.overlay) {
        window.dispatchEvent(new CustomEvent('close-table-toolbar', {
          detail: { overlayId: event.overlay.id }
        }));
      }
    } catch (e) { }
    return false;
  },
  onDrawEnd: (event: any) => {
    try {
      const overlay = event.overlay;
      const chart = event.chart || (window as any).__active_chart_instance__;
      if (chart && overlay.points && overlay.points[0]) {
        try {
          const px0 = chart.convertToPixel(overlay.points[0]);
          if (px0) {
            if (!overlay.points[1]) {
              const p1Coord = chart.convertFromPixel({ x: px0.x + 336, y: px0.y + 120 });
              if (p1Coord) {
                overlay.points[1] = {
                  ...overlay.points[0],
                  dataIndex: p1Coord.dataIndex,
                  timestamp: p1Coord.timestamp,
                  value: p1Coord.value
                };
              }
            }
          }
        } catch (e) { }
      }

      let screenX = 350;
      let screenY = 120;
      if (chart && overlay.points && overlay.points[0]) {
        try {
          const px1 = chart.convertToPixel(overlay.points[0]);
          const px2 = overlay.points[1] ? chart.convertToPixel(overlay.points[1]) : px1;
          if (px1 && px2) {
            screenX = Math.min(px1.x, px2.x);
            screenY = Math.min(px1.y, px2.y);
          }
        } catch (e) { }
      }
      window.dispatchEvent(new CustomEvent('open-table-toolbar', {
        detail: {
          overlayId: overlay.id,
          overlayName: overlay.name,
          rows: overlay.extendData?.rows ?? 3,
          cols: overlay.extendData?.cols ?? 3,
          tableData: overlay.extendData?.tableData ?? Array.from({ length: overlay.extendData?.rows ?? 3 }, () => Array(overlay.extendData?.cols ?? 3).fill('')),
          backgroundColor: overlay.extendData?.backgroundColor ?? '#3c404b',
          borderColor: overlay.extendData?.borderColor ?? '#2962ff',
          borderWidth: overlay.extendData?.borderWidth ?? 1,
          textColor: overlay.extendData?.textColor ?? '#ffffff',
          fontSize: overlay.extendData?.fontSize ?? 14,
          textAlign: overlay.extendData?.textAlign ?? 'left',
          headerRow: overlay.extendData?.headerRow ?? false,
          headerBgColor: overlay.extendData?.headerBgColor ?? '#242836',
          headerTextColor: overlay.extendData?.headerTextColor ?? '#ffffff',
          zebraStriping: overlay.extendData?.zebraStriping ?? false,
          zebraColor: overlay.extendData?.zebraColor ?? 'rgba(255, 255, 255, 0.04)',
          borderRadius: overlay.extendData?.borderRadius ?? 6,
          wrapText: overlay.extendData?.wrapText !== false,
          colRatios: overlay.extendData?.colRatios,
          rowRatios: overlay.extendData?.rowRatios,
          screenX,
          screenY
        }
      }));

      // Automatically revert to cursor tool once table is placed on chart
      window.dispatchEvent(new CustomEvent('tickerpen-draw-end', { detail: event }));
      if (chart && typeof chart.createOverlay === 'function') {
        try {
          chart.createOverlay({ name: '' });
        } catch (e) { }
      }
    } catch (e) { }
    return false;
  }
};

// Push overlays into tickerPenOverlays so they are registered automatically
tickerPenOverlays.push(
  elliottImpulseWave,
  elliottCorrectionWave,
  elliottTriangleWave,
  elliottTripleComboWave,
  elliottDoubleComboWave,
  elliottWavePath,
  emojiOverlay,
  tableOverlay
);

if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', (event) => {
    try {
      const chart = (window as any).__active_chart_instance__;
      if (!chart) return;
      const container = typeof chart.getContainer === 'function' ? chart.getContainer() : null;
      if (!container) return;

      const overlays = typeof chart.getOverlays === 'function' ? chart.getOverlays() : [];
      const table = overlays.find((o: any) => o.name === 'table');
      if (!table || !table.points || !table.points[0]) return;

      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      if (mouseX < 0 || mouseY < 0 || mouseX > rect.width || mouseY > rect.height) return;

      const p0 = chart.convertToPixel(table.points[0]);
      const p1 = table.points[1] ? chart.convertToPixel(table.points[1]) : null;
      if (!p0 || !p1) return;

      const x = Math.min(p0.x, p1.x);
      const y = Math.min(p0.y, p1.y);
      const w = Math.max(40, Math.abs(p1.x - p0.x));
      const h = Math.max(30, Math.abs(p1.y - p0.y));

      if (mouseX >= x - 10 && mouseX <= x + w + 10 && mouseY >= y - 10 && mouseY <= y + h + 10) {
        const rows = Math.max(1, table.extendData?.rows ?? 3);
        const cols = Math.max(1, table.extendData?.cols ?? 3);
        const { colXs, rowYs } = getTableDimensions(x, y, w, h, cols, rows, table.extendData?.colRatios, table.extendData?.rowRatios);

        // Check column dividers
        for (let c = 1; c < cols; c++) {
          if (Math.abs(mouseX - colXs[c]) <= 6 && mouseY >= y && mouseY <= y + h) {
            container.style.cursor = 'col-resize';
            return;
          }
        }

        // Check row dividers
        for (let r = 1; r < rows; r++) {
          if (Math.abs(mouseY - rowYs[r]) <= 6 && mouseX >= x && mouseX <= x + w) {
            container.style.cursor = 'row-resize';
            return;
          }
        }
      }
    } catch (e) { }
  }, { passive: true });

  window.addEventListener('click', (event) => {
    const chart = (window as any).__active_chart_instance__;
    if (!chart || !chart._chartStore) return;

    const info = chart._chartStore.getProgressOverlayInfo();
    if (!info) return;

    const progressOverlay = info.overlay;
    if (progressOverlay && progressOverlay.name === 'polyline' && progressOverlay.isDrawing()) {
      const points = progressOverlay.points;
      if (points && points.length >= 3) {
        const axes = overlayAxesMap.get(progressOverlay.id);
        const xAxis = axes?.xAxis;
        const yAxis = axes?.yAxis;
        let isNearFirst = (progressOverlay as any).__nearFirstPoint === true;
        if (!isNearFirst && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
          const container = typeof chart.getContainer === 'function' ? chart.getContainer() : null;
          const rect = container?.getBoundingClientRect();
          if (rect) {
            const chartX = event.clientX - rect.left;
            const chartY = event.clientY - rect.top;
            let p0x: number | null = null;
            let p0y: number | null = null;
            try {
              const p0Pixel = typeof chart.convertToPixel === 'function' ? chart.convertToPixel(points[0]) : null;
              if (p0Pixel && typeof p0Pixel.x === 'number' && typeof p0Pixel.y === 'number') {
                p0x = p0Pixel.x;
                p0y = p0Pixel.y;
              }
            } catch (e) {}
            if (p0x === null || p0y === null) {
              if (xAxis && yAxis) {
                p0x = dataIndexToPixelX(Number(points[0].dataIndex ?? 0), xAxis);
                p0y = yAxis.convertToPixel(Number(points[0].value ?? 0));
              }
            }
            if (typeof p0x === 'number' && typeof p0y === 'number') {
              isNearFirst = Math.hypot(chartX - p0x, chartY - p0y) <= 35;
            }
          }
        }

        if (isNearFirst) {
          const firstPoint = points[0];
          points[points.length - 1] = {
            dataIndex: firstPoint.dataIndex,
            timestamp: firstPoint.timestamp,
            value: firstPoint.value
          };
          if (!progressOverlay.extendData) progressOverlay.extendData = {};
          progressOverlay.extendData.__polylineClosed = true;
          progressOverlay.forceComplete();
          chart._chartStore.progressOverlayComplete();
          if (typeof progressOverlay.onDrawEnd === 'function') {
            try { progressOverlay.onDrawEnd({ overlay: progressOverlay, chart }); } catch (e) { }
          }
          event.preventDefault();
          event.stopPropagation();
        }
      }
    }
  }, true);

  window.addEventListener('dblclick', (event) => {
    const chart = (window as any).__active_chart_instance__;
    if (!chart) return;

    // Check if double-click is on Y-axis scale to trigger smooth animated reset
    const coreChart = (chart as any)._chartApi || chart;
    let isDblClickOnYAxis = false;
    const target = event.target as HTMLElement;
    const isYAxisElement = !!(target && (
      target.classList?.contains('y-axis') ||
      target.getAttribute?.('data-widget-name') === 'yAxis' ||
      target.closest?.('.y-axis')
    ));

    let isYAxisZone = false;
    const container = (coreChart.getContainer ? coreChart.getContainer() : null) || document.querySelector('.ticker-pen-pro') || (coreChart as any)._container;
    if (container && typeof container.getBoundingClientRect === 'function') {
      const rect = container.getBoundingClientRect();
      if (event.clientX >= rect.right - 80 && event.clientX <= rect.right + 10 && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        isYAxisZone = true;
      }
    }

    if (isYAxisElement || isYAxisZone) {
      isDblClickOnYAxis = true;
    }

    if (isDblClickOnYAxis) {
      const axisComponent = getYAxisComponent(coreChart);
      if (axisComponent) {
        animateYAxisReset(coreChart, axisComponent, 280);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    // Complete polyline or path drawing on double-click
    if (chart._chartStore) {
      const info = chart._chartStore.getProgressOverlayInfo();
      if (info) {
        const progressOverlay = info.overlay;
        if (progressOverlay && (progressOverlay.name === 'polyline' || progressOverlay.name === 'path') && progressOverlay.isDrawing()) {
          // Clean up duplicate trailing point added by double-click
          if (progressOverlay.points && progressOverlay.points.length >= 3) {
            const pts = progressOverlay.points;
            const pLast = pts[pts.length - 1];
            const pPrev = pts[pts.length - 2];
            if (pLast && pPrev) {
              const dIdx = Math.abs(Number(pLast.dataIndex ?? 0) - Number(pPrev.dataIndex ?? 0));
              const dVal = Math.abs(Number(pLast.value ?? 0) - Number(pPrev.value ?? 0));
              if (dIdx < 0.5 && dVal < (Number(pPrev.value) * 0.01 || 1)) {
                pts.pop();
              }
            }
          }
          checkAndClosePolyline(progressOverlay);
          progressOverlay.forceComplete();
          chart._chartStore.progressOverlayComplete();
          if (typeof progressOverlay.onDrawEnd === 'function') {
            try { progressOverlay.onDrawEnd({ overlay: progressOverlay, chart }); } catch (e) { }
          }
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    }

    if (typeof chart.convertFromPixel !== 'function') return;

    // Get hovered overlay instance
    const overlay = chart._chartStore?.getHoverOverlayInfo()?.overlay;
    if (!overlay) return;

    if (overlay.name === 'table') {
      if (!overlay.points || overlay.points.length < 2) return;
      const p0 = chart.convertToPixel(overlay.points[0]);
      const p1 = chart.convertToPixel(overlay.points[1]);
      if (!p0 || !p1) return;

      const x = Math.min(p0.x, p1.x);
      const y = Math.min(p0.y, p1.y);
      const w = Math.max(40, Math.abs(p1.x - p0.x));
      const h = Math.max(30, Math.abs(p1.y - p0.y));

      const container = chart.getContainer();
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      if (clickX >= x && clickX <= x + w && clickY >= y && clickY <= y + h) {
        const rows = overlay.extendData?.rows ?? 3;
        const cols = overlay.extendData?.cols ?? 3;
        let tableData = overlay.extendData?.tableData;
        if (!tableData || !Array.isArray(tableData)) {
          tableData = Array.from({ length: rows }, () => Array(cols).fill(''));
        }

        const { colWidths, rowHeights, colXs, rowYs } = getTableDimensions(
          x,
          y,
          w,
          h,
          cols,
          rows,
          overlay.extendData?.colRatios,
          overlay.extendData?.rowRatios,
          tableData,
          overlay.extendData?.fontSize ?? 14,
          overlay.extendData?.wrapText !== false,
          overlay.extendData?.headerRow ?? false
        );

        let currentC = 0;
        for (let c = 0; c < cols; c++) {
          if (clickX >= colXs[c] && clickX <= colXs[c + 1]) {
            currentC = c;
            break;
          }
        }

        let currentR = 0;
        for (let r = 0; r < rows; r++) {
          if (clickY >= rowYs[r] && clickY <= rowYs[r + 1]) {
            currentR = r;
            break;
          }
        }

        const safeRemoveNode = (el: Element | null) => {
          if (!el) return;
          try {
            if (el.parentNode) {
              el.parentNode.removeChild(el);
            } else if (typeof (el as any).remove === 'function') {
              (el as any).remove();
            }
          } catch (e) { }
        };

        const spawnCellEditor = (r: number, c: number) => {
          const existing = container.querySelector('.in-place-table-cell-editor');
          safeRemoveNode(existing);
          const existingSlash = container.querySelector('.table-smart-tag-slash-menu');
          safeRemoveNode(existingSlash);

          const cellLeft = colXs[c];
          const cellTop = rowYs[r];
          const cellW = colWidths[c];
          const cellH = rowHeights[r];

          const cellInput = document.createElement('textarea');
          cellInput.className = 'in-place-table-cell-editor';
          cellInput.value = tableData[r]?.[c] ?? '';
          cellInput.style.position = 'absolute';
          cellInput.style.left = `${cellLeft}px`;
          cellInput.style.top = `${cellTop}px`;
          cellInput.style.width = `${cellW}px`;
          cellInput.style.height = `${cellH}px`;
          cellInput.style.boxSizing = 'border-box';
          cellInput.style.backgroundColor = '#161720';
          cellInput.style.color = overlay.extendData?.textColor ?? '#ffffff';
          cellInput.style.border = '2px solid #2962ff';
          cellInput.style.borderRadius = '2px';
          cellInput.style.padding = '4px 6px';
          cellInput.style.font = `${overlay.extendData?.fontSize ?? 14}px 'Rubik', sans-serif`;
          cellInput.style.textAlign = overlay.extendData?.textAlign ?? 'left';
          cellInput.style.outline = 'none';
          cellInput.style.zIndex = '300000';
          cellInput.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.7)';
          cellInput.style.resize = 'none';
          cellInput.style.overflow = 'hidden';
          cellInput.style.lineHeight = '1.3';
          cellInput.style.whiteSpace = 'pre-wrap';
          cellInput.style.wordBreak = 'break-word';

          let slashPopup: HTMLDivElement | null = null;
          let selectedSlashIndex = 0;
          let filteredTags: typeof SMART_TAGS_CATALOG = [];
          let isInteractingWithPopup = false;

          const hideSlashPopup = () => {
            if (slashPopup) {
              safeRemoveNode(slashPopup);
              slashPopup = null;
            }
          };

          const insertSelectedTag = (item: typeof SMART_TAGS_CATALOG[0]) => {
            const resolvedValue = resolveTablePlaceholders(item.tag);
            const val = cellInput.value;
            const cursorPos = cellInput.selectionStart || val.length;
            const textBefore = val.slice(0, cursorPos);
            const textAfter = val.slice(cursorPos);
            const slashMatch = textBefore.match(/(?:\/|\{)([a-zA-Z0-9%_-]*)$/);
            let finalVal = val + resolvedValue;
            if (slashMatch) {
              const startIdx = cursorPos - slashMatch[0].length;
              finalVal = val.slice(0, startIdx) + resolvedValue + textAfter;
            }
            cellInput.value = finalVal;
            hideSlashPopup();
            // Automatically commit value and advance to next box
            commitCell(true);
          };

          const updateSlashSelectionVisuals = (newIdx: number) => {
            selectedSlashIndex = newIdx;
            if (!slashPopup) return;
            const items = slashPopup.querySelectorAll('.smart-tag-row-item');
            items.forEach((el, i) => {
              const isSel = i === selectedSlashIndex;
              const htmlEl = el as HTMLElement;
              htmlEl.style.backgroundColor = isSel ? 'rgba(41, 98, 255, 0.25)' : 'transparent';
              htmlEl.style.color = isSel ? '#ffffff' : '#d1d4dc';
              const titleSpan = htmlEl.querySelector('.smart-tag-title') as HTMLElement;
              if (titleSpan) {
                titleSpan.style.color = isSel ? '#64b5f6' : '#2979ff';
              }
            });
          };

          const renderSlashPopup = (query: string) => {
            filteredTags = SMART_TAGS_CATALOG.filter((item) => {
              const q = query.toLowerCase();
              return (
                item.tag.toLowerCase().includes(q) ||
                item.label.toLowerCase().includes(q) ||
                item.desc.toLowerCase().includes(q)
              );
            });

            if (filteredTags.length === 0) {
              hideSlashPopup();
              return;
            }

            if (selectedSlashIndex >= filteredTags.length) {
              selectedSlashIndex = 0;
            }

            if (!slashPopup) {
              const bodyLeft = rect.left + cellLeft;
              const bodyTop = rect.top + cellTop + cellH + 4;

              slashPopup = document.createElement('div');
              slashPopup.className = 'table-smart-tag-slash-menu';
              slashPopup.style.position = 'fixed';
              slashPopup.style.left = `${bodyLeft}px`;
              slashPopup.style.top = `${bodyTop}px`;
              slashPopup.style.width = '240px';
              slashPopup.style.maxHeight = '210px';
              slashPopup.style.overflowY = 'auto';
              slashPopup.style.backgroundColor = '#161822';
              slashPopup.style.border = '1px solid #2962ff';
              slashPopup.style.borderRadius = '6px';
              slashPopup.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.85)';
              slashPopup.style.zIndex = '999999';
              slashPopup.style.padding = '4px';
              slashPopup.style.display = 'flex';
              slashPopup.style.flexDirection = 'column';
              slashPopup.style.gap = '2px';
              slashPopup.style.pointerEvents = 'auto';

              slashPopup.addEventListener('mouseenter', () => {
                isInteractingWithPopup = true;
              });
              slashPopup.addEventListener('mouseleave', () => {
                isInteractingWithPopup = false;
              });
              slashPopup.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
              });
              slashPopup.addEventListener(
                'wheel',
                (e: WheelEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation();
                  if (slashPopup) {
                    slashPopup.scrollTop += e.deltaY;
                  }
                },
                { passive: false }
              );

              document.body.appendChild(slashPopup);
            }

            slashPopup.innerHTML = '';
            filteredTags.forEach((item, idx) => {
              const isSelected = idx === selectedSlashIndex;
              const rowEl = document.createElement('div');
              rowEl.className = 'smart-tag-row-item';
              rowEl.style.display = 'flex';
              rowEl.style.alignItems = 'center';
              rowEl.style.justifyContent = 'space-between';
              rowEl.style.padding = '5px 8px';
              rowEl.style.borderRadius = '4px';
              rowEl.style.cursor = 'pointer';
              rowEl.style.backgroundColor = isSelected ? 'rgba(41, 98, 255, 0.25)' : 'transparent';
              rowEl.style.color = isSelected ? '#ffffff' : '#d1d4dc';
              rowEl.style.fontSize = '12px';
              rowEl.style.fontFamily = "'Rubik', sans-serif";

              const leftBox = document.createElement('div');
              leftBox.style.display = 'flex';
              leftBox.style.flexDirection = 'column';
              leftBox.style.gap = '1px';

              const tagTitle = document.createElement('span');
              tagTitle.className = 'smart-tag-title';
              tagTitle.style.fontWeight = '600';
              tagTitle.style.color = isSelected ? '#64b5f6' : '#2979ff';
              tagTitle.style.fontFamily = 'monospace';
              tagTitle.textContent = item.tag;

              const tagDesc = document.createElement('span');
              tagDesc.style.fontSize = '10px';
              tagDesc.style.color = '#868993';
              tagDesc.textContent = item.label;

              leftBox.appendChild(tagTitle);
              leftBox.appendChild(tagDesc);

              const catBadge = document.createElement('span');
              catBadge.style.fontSize = '9px';
              catBadge.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
              catBadge.style.padding = '1px 5px';
              catBadge.style.borderRadius = '3px';
              catBadge.style.color = '#868993';
              catBadge.textContent = item.category;

              rowEl.appendChild(leftBox);
              rowEl.appendChild(catBadge);

              const selectAction = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                insertSelectedTag(item);
              };

              rowEl.addEventListener('pointerdown', selectAction);
              rowEl.addEventListener('mousedown', selectAction);
              rowEl.addEventListener('click', selectAction);

              rowEl.addEventListener('mouseenter', () => {
                updateSlashSelectionVisuals(idx);
              });

              slashPopup!.appendChild(rowEl);
            });
          };

          const checkSlashTrigger = () => {
            const val = cellInput.value;
            const cursorPos = cellInput.selectionStart || val.length;
            const textBefore = val.slice(0, cursorPos);
            const slashMatch = textBefore.match(/(?:\/|\{)([a-zA-Z0-9%_-]*)$/);
            if (slashMatch) {
              renderSlashPopup(slashMatch[1]);
            } else {
              hideSlashPopup();
            }
          };

          let cellFinished = false;
          const commitCell = (moveToNext: boolean = false) => {
            if (cellFinished) return;
            cellFinished = true;
            hideSlashPopup();
            if (!tableData[r]) tableData[r] = [];
            const rawVal = cellInput.value;
            tableData[r][c] = rawVal.trim().startsWith('=') ? rawVal.trim() : resolveTablePlaceholders(rawVal);
            overlay.extendData = {
              ...(overlay.extendData || {}),
              tableData: [...tableData]
            };
            if (typeof chart.updatePane === 'function') {
              chart.updatePane(1);
            }
            window.dispatchEvent(new CustomEvent('open-table-toolbar', {
              detail: {
                overlayId: overlay.id,
                overlayName: overlay.name,
                rows: overlay.extendData.rows,
                cols: overlay.extendData.cols,
                tableData: overlay.extendData.tableData,
                backgroundColor: overlay.extendData.backgroundColor,
                borderColor: overlay.extendData.borderColor,
                borderWidth: overlay.extendData.borderWidth,
                textColor: overlay.extendData.textColor,
                fontSize: overlay.extendData.fontSize,
                textAlign: overlay.extendData.textAlign,
                headerRow: overlay.extendData.headerRow,
                headerBgColor: overlay.extendData.headerBgColor,
                headerTextColor: overlay.extendData.headerTextColor,
                zebraStriping: overlay.extendData.zebraStriping,
                zebraColor: overlay.extendData.zebraColor,
                borderRadius: overlay.extendData.borderRadius,
                wrapText: overlay.extendData.wrapText !== false,
                colRatios: overlay.extendData.colRatios,
                rowRatios: overlay.extendData.rowRatios,
                screenX: x,
                screenY: y
              }
            }));
            safeRemoveNode(cellInput);

            if (moveToNext) {
              let nC = c + 1;
              let nR = r;
              if (nC >= cols) {
                nC = 0;
                nR = r + 1;
              }
              if (nR < rows) {
                setTimeout(() => {
                  spawnCellEditor(nR, nC);
                }, 20);
              }
            }
          };

          cellInput.addEventListener('input', () => {
            if (!tableData[r]) tableData[r] = [];
            tableData[r][c] = cellInput.value;
            overlay.extendData = {
              ...(overlay.extendData || {}),
              tableData: [...tableData]
            };
            if (typeof chart.updatePane === 'function') {
              chart.updatePane(1);
            }
            cellInput.style.height = 'auto';
            const newNeededH = Math.max(cellH, cellInput.scrollHeight);
            cellInput.style.height = `${newNeededH}px`;
            checkSlashTrigger();
          });

          cellInput.addEventListener('keydown', (e) => {
            e.stopPropagation();

            if (slashPopup && filteredTags.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIdx = (selectedSlashIndex + 1) % filteredTags.length;
                updateSlashSelectionVisuals(nextIdx);
                return;
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIdx = (selectedSlashIndex - 1 + filteredTags.length) % filteredTags.length;
                updateSlashSelectionVisuals(prevIdx);
                return;
              } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                if (filteredTags[selectedSlashIndex]) {
                  insertSelectedTag(filteredTags[selectedSlashIndex]);
                  return;
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                hideSlashPopup();
                return;
              }
            }

            if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
              e.preventDefault();
              commitCell(true);
            } else if (e.key === 'Escape') {
              cellFinished = true;
              hideSlashPopup();
              safeRemoveNode(cellInput);
            }
          });

          cellInput.addEventListener('blur', () => {
            setTimeout(() => {
              if (!isInteractingWithPopup) {
                commitCell(false);
              }
            }, 120);
          });

          container.appendChild(cellInput);
          cellInput.focus();
          cellInput.select();
        };

        spawnCellEditor(currentR, currentC);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    const isPin = overlay.name === 'pin';
    const isComment = overlay.name === 'comment';
    const isFlag = overlay.name === 'flag-mark' || overlay.name === 'flag';
    const isAnchoredText = overlay.name === 'anchored-text';
    const isTextBox = overlay.name === 'text-box';
    const isTextAnnotation = overlay.name === 'text-annotation' || overlay.name === 'simpleAnnotation';
    const isSignpost = overlay.name === 'signpost';
    const isCallout = overlay.name === 'callout';
    const isNote = overlay.name === 'note';

    const isAnnotationTool = isPin || isComment || isFlag || isAnchoredText || isTextBox || isTextAnnotation || isSignpost || isCallout || isNote;

    if (isAnnotationTool) {
      const anchorPoint = (isAnchoredText || isCallout) ? (overlay.points[1] || overlay.points[0]) : overlay.points[0];
      if (!anchorPoint) return;

      const p = chart.convertToPixel([anchorPoint], { paneId: 'candle_pane' })?.[0]
        || chart.convertToPixel([anchorPoint])?.[0];
      let posX = p.x;
      let posY = p.y;

      if (isSignpost || isFlag || isPin) {
        const axes = overlayAxesMap.get(overlay.id);
        const xAxis = axes?.xAxis;
        if (xAxis && typeof p.x === 'number' && !isNaN(p.x)) {
          const dataIndex = Math.round(xAxis.convertFromPixel(p.x));
          const snappedCandleX = dataIndexToPixelX(dataIndex, xAxis);
          if (typeof snappedCandleX === 'number' && !isNaN(snappedCandleX)) {
            posX = snappedCandleX;
          }
        }
      }

      // Current text on the tool
      const text = ((isPin || isFlag) ? (overlay.extendData?.label ?? overlay.extendData?.text) : overlay.extendData?.text) ?? 'Add text';
      const fontSize = (overlay.extendData?.fontSize) ?? (isTextBox || isTextAnnotation ? 14 : 11);

      const container = chart.getContainer();
      if (!container) return;

      const input = document.createElement('textarea');
      input.value = text;
      input.className = 'annotation-direct-text-editor';
      input.style.position = 'absolute';
      input.style.boxSizing = 'border-box';
      input.style.resize = 'none';
      input.style.overflow = 'hidden';
      input.style.overflowX = 'hidden';
      input.style.overflowY = 'hidden';
      input.style.scrollbarWidth = 'none';
      (input.style as any).msOverflowStyle = 'none';
      input.style.whiteSpace = 'pre-wrap';
      input.style.wordBreak = 'break-word';
      input.style.overflowWrap = 'break-word';
      input.style.outline = 'none';
      input.style.background = 'transparent';
      input.style.border = 'none';
      input.style.boxShadow = 'none';
      input.style.padding = '0';
      input.style.margin = '0';
      input.style.zIndex = '100000';

      // Tool-specific typography and text colors
      const textBoxPad = overlay.extendData?.padding ?? 8; // Must match canvas padding
      if (isPin || isFlag || isAnchoredText || isComment) {
        input.style.font = "bold 11px 'Rubik', sans-serif";
        input.style.color = '#C5C6A6';
        input.style.textAlign = 'center';
        input.style.caretColor = '#C5C6A6';
        input.style.padding = '8px 14px';
      } else if (isTextBox || isTextAnnotation) {
        const fWeight = overlay.extendData?.fontWeight || 'normal';
        const fStyle = overlay.extendData?.fontStyle || 'normal';
        const textColor = overlay.extendData?.textColor || '#ffffff';
        input.style.font = `${fStyle} ${fWeight} ${fontSize}px 'Rubik', sans-serif`;
        input.style.color = textColor;
        input.style.textAlign = overlay.extendData?.textAlign || 'left';
        input.style.caretColor = textColor;
        input.style.padding = `${textBoxPad}px`;
        input.style.backgroundColor = 'transparent';
        input.style.border = 'none';
        input.style.boxShadow = 'none';
      } else if (isSignpost || isNote) {
        const textColor = overlay.extendData?.textColor || '#000000';
        input.style.font = "bold 11px 'Rubik', sans-serif";
        input.style.color = textColor;
        input.style.textAlign = 'center';
        input.style.caretColor = textColor;
        input.style.padding = '6px 12px';
        if (isSignpost) {
          input.style.whiteSpace = 'pre-wrap';
          input.style.backgroundColor = 'transparent';
          input.style.border = 'none';
          input.style.boxShadow = 'none';
        }
      } else if (isCallout) {
        const textColor = overlay.extendData?.textColor || '#000000';
        input.style.font = "bold 12px 'Rubik', sans-serif";
        input.style.color = textColor;
        input.style.textAlign = 'left';
        input.style.caretColor = textColor;
        input.style.padding = '8px';
      } else {
        input.style.font = "bold 11px 'Rubik', sans-serif";
        input.style.color = overlay.extendData?.textColor || '#ffffff';
        input.style.textAlign = 'center';
        input.style.caretColor = overlay.extendData?.textColor || '#ffffff';
      }

      if (!overlay.extendData) overlay.extendData = {};
      overlay.extendData.__isEditingText = true;
      if (typeof chart.updatePane === 'function') {
        chart.updatePane(1);
      }

      container.appendChild(input);
      input.focus();
      input.select();

      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.font = input.style.font;

      let upsideDown = (overlay.extendData?.upsideDown) ?? false;
      if (isSignpost && anchorPoint) {
        const axes = overlayAxesMap.get(overlay.id);
        const xAxis = axes?.xAxis;
        const dataIndex = Math.round(Number(anchorPoint.dataIndex ?? (xAxis ? xAxis.convertFromPixel(posX) : 0)));
        const dataList = typeof chart.getDataList === 'function' ? chart.getDataList() : [];
        const candle = dataList[dataIndex] || (dataList.length > 0 ? dataList[dataList.length - 1] : null);
        if (candle) {
          const candleMid = (Number(candle.high) + Number(candle.low)) / 2;
          const anchorPrice = Number(anchorPoint.value);
          upsideDown = anchorPrice < candleMid;
        }
      }

      const updateSizeAndPosition = () => {
        tempCtx.font = input.style.font;
        const val = input.value;
        const lines = val.split('\n');
        const maxTextWidth = Math.max(...lines.map(line => tempCtx.measureText(line).width));

        if (isComment) {
          const panelWidth = Math.max(80, maxTextWidth + 28);
          const panelHeight = (11 * lines.length) + (lines.length - 1) * 4 + 16;
          const tailHeight = 8;
          input.style.width = `${panelWidth}px`;
          input.style.height = `${panelHeight}px`;
          input.style.lineHeight = '15px';
          input.style.left = `${posX}px`;
          input.style.top = `${posY - tailHeight - panelHeight}px`;
        } else if (isPin) {
          const pinSize = (overlay.extendData?.size) ?? 30;
          const panelWidth = Math.max(80, maxTextWidth + 28);
          const panelHeight = (11 * lines.length) + (lines.length - 1) * 4 + 16;
          input.style.width = `${panelWidth}px`;
          input.style.height = `${panelHeight}px`;
          input.style.lineHeight = '15px';
          input.style.left = `${posX - panelWidth / 2}px`;
          input.style.top = `${posY - pinSize - 8 - panelHeight}px`;
        } else if (isFlag) {
          const flagSize = (overlay.extendData?.size) ?? 30;
          const poleHeight = flagSize * 1.5;
          const panelWidth = Math.max(80, maxTextWidth + 28);
          const panelHeight = (11 * lines.length) + (lines.length - 1) * 4 + 16;
          input.style.width = `${panelWidth}px`;
          input.style.height = `${panelHeight}px`;
          input.style.lineHeight = '15px';
          input.style.left = `${posX - panelWidth / 2}px`;
          input.style.top = `${posY - poleHeight - 8 - panelHeight}px`;
        } else if (isAnchoredText) {
          const panelWidth = Math.max(80, maxTextWidth + 28);
          const panelHeight = (11 * lines.length) + (lines.length - 1) * 4 + 16;
          const circleRadius = 5;
          const boxLeft = posX + circleRadius + 4;
          const boxTop = posY - panelHeight / 2;
          input.style.width = `${panelWidth}px`;
          input.style.height = `${panelHeight}px`;
          input.style.lineHeight = '15px';
          input.style.left = `${boxLeft}px`;
          input.style.top = `${boxTop}px`;
        } else if (isTextBox || isTextAnnotation) {
          const lineSpacing = 1.25;
          const lineHeight = Math.round(fontSize * lineSpacing);
          const totalTextHeight = (lines.length * lineHeight) - (lineSpacing - 1) * fontSize;
          const textContentWidth = Math.max(maxTextWidth, 10);
          const finalWidth = textContentWidth + textBoxPad * 2;
          const finalHeight = totalTextHeight + textBoxPad * 2;
          const textAlign = overlay.extendData?.textAlign || 'left';
          input.style.width = `${Math.ceil(finalWidth)}px`;
          input.style.height = `${Math.ceil(finalHeight)}px`;
          input.style.lineHeight = `${lineHeight}px`;
          const boxY = posY - totalTextHeight / 2;
          input.style.top = `${Math.round(boxY - textBoxPad)}px`;
          if (textAlign === 'center') {
            input.style.left = `${Math.round(posX - textContentWidth / 2 - textBoxPad)}px`;
          } else if (textAlign === 'right') {
            input.style.left = `${Math.round(posX - textContentWidth - textBoxPad)}px`;
          } else {
            input.style.left = `${Math.round(posX - textBoxPad)}px`;
          }
        } else if (isCallout) {
          const calloutFontSize = 12;
          const boxWidth = maxTextWidth + 16;
          const boxHeight = calloutFontSize + 16;
          input.style.width = `${boxWidth}px`;
          input.style.height = `${boxHeight}px`;
          input.style.lineHeight = `${calloutFontSize}px`;
          input.style.left = `${posX - 8}px`;
          input.style.top = `${posY - boxHeight / 2}px`;
        } else {
          // Signpost & Notes — match canvas board geometry exactly
          const spFontSize = 11;
          const spPaddingX = 12;
          const spPaddingY = 6;
          const boardWidth = Math.max(36, maxTextWidth + spPaddingX * 2);
          const boardHeight = (spFontSize * lines.length) + (lines.length - 1) * 4 + spPaddingY * 2;
          const baseBoardHeight = spFontSize + spPaddingY * 2; // 23
          const scaleTop = baseBoardHeight / 13.17;
          const boardTopOffset = 8.886 * scaleTop;
          input.style.width = `${Math.ceil(boardWidth)}px`;
          input.style.height = `${Math.ceil(boardHeight)}px`;
          input.style.lineHeight = '15px';
          input.style.left = `${Math.round(posX - boardWidth / 2)}px`;
          if (!upsideDown) {
            input.style.top = `${Math.round(posY + boardTopOffset)}px`;
          } else {
            input.style.top = `${Math.round(posY - boardTopOffset - boardHeight)}px`;
          }
        }
      };

      // Set initial dimensions and location
      updateSizeAndPosition();

      const wrapTextTo40Chars = (textStr: string): string => {
        const lines = textStr.split('\n');
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
      };

      let finished = false;
      const commit = () => {
        if (finished) return;
        finished = true;
        const rawValue = input.value.trim() ? input.value.trim() : 'Add text';
        const value = wrapTextTo40Chars(rawValue);
        if (isPin || isFlag || isAnchoredText || isComment) {
          overlay.extendData = {
            ...(overlay.extendData || {}),
            label: value,
            text: value,
            __isEditingText: false
          };
        } else {
          overlay.extendData = {
            ...(overlay.extendData || {}),
            text: value,
            __isEditingText: false
          };
        }
        if (isTextBox || isTextAnnotation) {
          window.dispatchEvent(new CustomEvent('update-text-content', {
            detail: {
              overlayId: overlay.id,
              text: value
            }
          }));
        }
        if (typeof chart.updatePane === 'function') {
          chart.updatePane(1); // Force redraw with newly committed text
        }
        input.remove();
      };

      input.addEventListener('input', () => {
        const raw = input.value;
        const hasLongLine = raw.split('\n').some(line => line.length > 40);
        if (hasLongLine) {
          const start = input.selectionStart;
          const wrapped = wrapTextTo40Chars(raw);
          if (raw !== wrapped) {
            let newCursor = start;
            const diff = wrapped.length - raw.length;
            if (diff > 0) {
              newCursor += diff;
            }
            input.value = wrapped;
            input.setSelectionRange(newCursor, newCursor);
          }
        }
        updateSizeAndPosition();

        // Live preview: update overlay data in real-time
        const liveValue = input.value.trim() ? input.value.trim() : 'Add text';
        if (isPin || isFlag || isAnchoredText || isComment) {
          overlay.extendData = {
            ...(overlay.extendData || {}),
            label: liveValue,
            text: liveValue,
            __isEditingText: true
          };
        } else {
          overlay.extendData = {
            ...(overlay.extendData || {}),
            text: liveValue,
            __isEditingText: true
          };
        }
        if (typeof chart.updatePane === 'function') {
          chart.updatePane(1);
        }
      });

      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          if (e.shiftKey) {
            // Shift+Enter allows newline
            return;
          }
          // Pressing Enter directly applies the text and closes the editor
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          finished = true;
          if (overlay.extendData) overlay.extendData.__isEditingText = false;
          if (typeof chart.updatePane === 'function') {
            chart.updatePane(1);
          }
          input.remove();
        }
      });

      input.addEventListener('blur', commit);
    }
  }, true); // useCapture = true to intercept double-click before Ticker Pen stops propagation

  window.addEventListener('contextmenu', (event) => {
    const chart = (window as any).__active_chart_instance__;
    if (chart && chart._chartStore) {
      const info = chart._chartStore.getProgressOverlayInfo();
      if (info) {
        const progressOverlay = info.overlay;
        if (progressOverlay && (progressOverlay.name === 'polyline' || progressOverlay.name === 'path') && progressOverlay.isDrawing()) {
          // Remove trailing cursor point
          if (progressOverlay.points && progressOverlay.points.length >= 3) {
            progressOverlay.points.length = progressOverlay.points.length - 1;
          }
          checkAndClosePolyline(progressOverlay);
          progressOverlay.forceComplete();
          chart._chartStore.progressOverlayComplete();
          if (typeof progressOverlay.onDrawEnd === 'function') {
            try { progressOverlay.onDrawEnd({ overlay: progressOverlay, chart }); } catch (e) { }
          }
          event.preventDefault();
          event.stopPropagation();
        }
      }
    }
  }, true); // useCapture = true to intercept right-click before standard context menu opens

  // Active hover tracking for pin and flag overlays so their text box appears on hover and hides on mouseleave
  window.addEventListener('pointermove', (event) => {
    const charts = Array.from((window as any).globalCoreCharts || []);
    const activeChart = (window as any).__active_chart_instance__;
    const allCharts = Array.from(new Set([...charts, activeChart].filter(Boolean)));

    for (const chart of allCharts) {
      if (!chart || typeof (chart as any).getOverlays !== 'function') continue;
      const overlays = (chart as any).getOverlays().filter((o: any) =>
        o && (o.name === 'pin' || o.name === 'flag-mark' || o.name === 'flag')
      );
      if (!overlays || overlays.length === 0) continue;

      const container = (chart as any).getContainer ? (chart as any).getContainer() : null;
      if (!container) continue;
      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      let stateChanged = false;

      overlays.forEach((overlay: any) => {
        if (!overlay.points || !overlay.points[0]) return;
        const p = (chart as any).convertToPixel([overlay.points[0]], { paneId: 'candle_pane' })?.[0]
          || (chart as any).convertToPixel([overlay.points[0]])?.[0];
        if (!p || p.x === undefined || p.y === undefined) return;

        const isPin = overlay.name === 'pin';
        const isFlag = overlay.name === 'flag-mark' || overlay.name === 'flag';
        const size = (overlay.extendData?.size) ?? 30;
        const poleHeight = isFlag ? size * 1.5 : size;

        // 1. Check if mouse is on the pin/flag icon itself
        let isHovered = false;
        if (isPin) {
          isHovered = mouseX >= p.x - size / 2 - 2 && mouseX <= p.x + size / 2 + 2 && mouseY >= p.y - size - 2 && mouseY <= p.y + 2;
        } else if (isFlag) {
          isHovered = mouseX >= p.x - 6 && mouseX <= p.x + size + 4 && mouseY >= p.y - poleHeight - 4 && mouseY <= p.y + 4;
        }

        // 2. If it was already hovered (text box currently visible), also allow hovering on the visible text box
        if (!isHovered && overlay.extendData?.__isHovered) {
          const text = (overlay.extendData?.label ?? overlay.extendData?.text) ?? 'Add text';
          const lines = String(text).split('\n');
          const maxLen = Math.max(...lines.map((l: string) => l.length), 8);
          const panelWidth = Math.max(80, maxLen * 7 + 28);
          const panelHeight = (11 * lines.length) + (lines.length - 1) * 4 + 16;
          const topY = p.y - poleHeight - 8 - panelHeight - 4;
          const bottomY = p.y - poleHeight;
          isHovered = mouseX >= p.x - panelWidth / 2 && mouseX <= p.x + panelWidth / 2 && mouseY >= topY && mouseY <= bottomY;
        }

        if (!overlay.extendData) overlay.extendData = {};
        if (overlay.extendData.__isHovered !== isHovered) {
          overlay.extendData.__isHovered = isHovered;
          stateChanged = true;
        }
      });
      if (stateChanged && typeof (chart as any).updatePane === 'function') {
        (chart as any).updatePane(1);
      }
    }
  }, { passive: true });
}

// Smooth animated Y-axis reset (double-click on Y-axis scale)
export function animateYAxisReset(coreChart: any, yAxis: any, duration = 280) {
  if (!coreChart || !yAxis) return;

  const currentRange = (typeof yAxis.getRange === 'function' ? yAxis.getRange() : yAxis._range) || undefined;
  if (!currentRange) return;

  const startMin = currentRange.from !== undefined ? currentRange.from : currentRange.min;
  const startMax = currentRange.to !== undefined ? currentRange.to : currentRange.max;

  if (startMin === undefined || startMax === undefined) return;

  // Compute auto-fit target from visible data
  let targetMin = startMin;
  let targetMax = startMax;
  const chartStore = coreChart._chartStore;
  if (chartStore) {
    const dataList = typeof chartStore.getDataList === 'function' ? chartStore.getDataList() : [];
    const visibleRange = typeof chartStore.getVisibleRange === 'function' ? chartStore.getVisibleRange() : null;
    if (dataList && dataList.length > 0 && visibleRange) {
      let minP = Infinity;
      let maxP = -Infinity;
      const fromIdx = Math.max(0, Math.floor(visibleRange.from));
      const toIdx = Math.min(dataList.length - 1, Math.ceil(visibleRange.to));
      for (let i = fromIdx; i <= toIdx; i++) {
        const d = dataList[i];
        if (d) {
          if (d.low !== undefined && d.low < minP) minP = d.low;
          if (d.high !== undefined && d.high > maxP) maxP = d.high;
        }
      }
      if (minP < Infinity && maxP > -Infinity && maxP > minP) {
        const globalStyles = (typeof window !== 'undefined' ? (window as any).__chart_styles__ : null) || {};
        const topRate = (globalStyles.marginTop !== undefined ? globalStyles.marginTop : 0) / 100;
        const bottomRate = (globalStyles.marginBottom !== undefined ? globalStyles.marginBottom : 0) / 100;
        const diff = maxP - minP;
        targetMin = minP - diff * bottomRate;
        targetMax = maxP + diff * topRate;
      }
    }
  }

  const startTime = performance.now();

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  function frame(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const ease = easeOutCubic(progress);

    const curFrom = startMin + (targetMin - startMin) * ease;
    const curTo = startMax + (targetMax - startMax) * ease;

    const baseRange = (typeof yAxis.getRange === 'function' ? yAxis.getRange() : undefined) || undefined;
    const realFrom = typeof yAxis.valueToRealValue === 'function' ? yAxis.valueToRealValue(curFrom, baseRange ? { range: baseRange } : undefined) : curFrom;
    const realTo = typeof yAxis.valueToRealValue === 'function' ? yAxis.valueToRealValue(curTo, baseRange ? { range: baseRange } : undefined) : curTo;
    const displayFrom = typeof yAxis.realValueToDisplayValue === 'function' ? yAxis.realValueToDisplayValue(realFrom, baseRange ? { range: baseRange } : undefined) : realFrom;
    const displayTo = typeof yAxis.realValueToDisplayValue === 'function' ? yAxis.realValueToDisplayValue(realTo, baseRange ? { range: baseRange } : undefined) : realTo;

    const rangeVal = {
      from: curFrom,
      to: curTo,
      range: curTo - curFrom,
      realFrom,
      realTo,
      realRange: realTo - realFrom,
      displayFrom,
      displayTo,
      displayRange: displayTo - displayFrom
    };

    if (typeof yAxis.setRange === 'function') {
      yAxis.setRange(rangeVal);
    }
    (yAxis as any)._range = rangeVal;
    (yAxis as any)._realRange = rangeVal;

    if (progress < 1) {
      if (typeof coreChart.updatePane === 'function') {
        coreChart.updatePane(1);
      }
      requestAnimationFrame(frame);
    } else {
      if (typeof yAxis.setAutoCalcTickFlag === 'function') {
        yAxis.setAutoCalcTickFlag(true);
      }
      (yAxis as any)._autoCalcTickFlag = true;
      if (typeof coreChart.adjustPaneViewport === 'function') {
        coreChart.adjustPaneViewport(false, true, true, true);
      }
      if (typeof coreChart.layout === 'function') {
        coreChart.layout({ measureWidth: true, update: true, buildYAxisTick: true });
      }
      if (typeof coreChart.updatePane === 'function') {
        coreChart.updatePane(4);
      }
    }
  }

  requestAnimationFrame(frame);
}

// Chart and Y-Axis interaction management
let isPointerDown = false;
let isDraggingYAxis = false;
let isDraggingMainChart = false;
let isDispatchingFakeEvent = false;
let startX = 0;
let startY = 0;
let lastPointerX = 0;
let lastPointerY = 0;
let startOffset = 0;
let startRange: any = null;
let activeDragChart: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    // Complete polyline or path drawing on Enter or Escape keys
    if (e.key === 'Enter' || e.key === 'Escape') {
      const chart = (window as any).__active_chart_instance__;
      if (chart && chart._chartStore) {
        const info = chart._chartStore.getProgressOverlayInfo();
        if (info) {
          const progressOverlay = info.overlay;
          if (progressOverlay && (progressOverlay.name === 'polyline' || progressOverlay.name === 'path') && progressOverlay.isDrawing()) {
            if (progressOverlay.points && progressOverlay.points.length >= 3) {
              progressOverlay.points.length = progressOverlay.points.length - 1;
            }
            checkAndClosePolyline(progressOverlay);
            progressOverlay.forceComplete();
            chart._chartStore.progressOverlayComplete();
            if (typeof progressOverlay.onDrawEnd === 'function') {
              try { progressOverlay.onDrawEnd({ overlay: progressOverlay, chart }); } catch (e2) { }
            }
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }
    }
  });

  window.addEventListener('pointerdown', (e) => {
    const charts = getActiveGlobalCoreCharts();
    const chart = (window as any).__active_chart_instance__ || (charts.length > 0 ? charts[0] : null);
    if (!chart) {
      return;
    }

    isPointerDown = true;
    activeDragChart = chart;
    startX = e.clientX;
    startY = e.clientY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;

    const coreChart = (chart as any)._chartApi || chart;
    const chartStore = coreChart._chartStore;
    if (chartStore) {
      const timeScaleStore = typeof chartStore.getTimeScaleStore === 'function'
        ? chartStore.getTimeScaleStore()
        : chartStore._timeScaleStore || chartStore.timeScaleStore;

      if (timeScaleStore) {
        startOffset = typeof timeScaleStore.getOffsetRightDistance === 'function'
          ? timeScaleStore.getOffsetRightDistance()
          : 0;
      }
    }
    const axisComponent = getYAxisComponent(coreChart);

    if (axisComponent) {
      startRange = typeof axisComponent.getRange === 'function'
        ? { ...axisComponent.getRange() }
        : axisComponent._range ? { ...axisComponent._range } : null;
    }

    let isClickOnYAxis = false;
    const target = e.target as HTMLElement;
    const isYAxisElement = !!(target && (
      target.classList?.contains('y-axis') ||
      target.getAttribute?.('data-widget-name') === 'yAxis' ||
      target.closest?.('.y-axis')
    ));

    let isYAxisZone = false;
    const container = (coreChart.getContainer ? coreChart.getContainer() : null) || document.querySelector('.ticker-pen-pro') || (coreChart as any)._container;
    if (container && typeof container.getBoundingClientRect === 'function') {
      const rect = container.getBoundingClientRect();
      if (e.clientX >= rect.right - 80 && e.clientX <= rect.right + 10 && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        isYAxisZone = true;
      }
    }

    if (isYAxisElement || isYAxisZone) {
      isClickOnYAxis = true;
    }

    if (isClickOnYAxis) {
      isDraggingYAxis = true;
      isDraggingMainChart = false;
      e.preventDefault();
      e.stopPropagation();
    } else {
      isDraggingMainChart = true;
      isDraggingYAxis = false;
    }
  }, true);

  window.addEventListener('pointermove', (e) => {
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;

    if (!activeDragChart) return;

    // 1. Dragging on the Y-Axis Scale -> Stretch / Compress the price scale
    if (isDraggingYAxis) {
      e.preventDefault();
      e.stopPropagation();

      if (e.target && typeof (e.target as any).releasePointerCapture === 'function') {
        try {
          (e.target as any).releasePointerCapture(e.pointerId);
        } catch (err) { }
      }

      const coreChart = (activeDragChart as any)._chartApi || activeDragChart;
      const axisComponent = getYAxisComponent(coreChart);

      if (axisComponent && startRange) {
        const container = (coreChart.getContainer ? coreChart.getContainer() : null) || document.querySelector('.ticker-pen-pro') || (coreChart as any)._container;
        const height = (container && typeof container.getBoundingClientRect === 'function') ? container.getBoundingClientRect().height : 500;

        const dy = e.clientY - startY;
        // Dragging UP (dy < 0) stretches the scale (scaleFactor < 1, range shrinks -> price points spread apart)
        // Dragging DOWN (dy > 0) compresses the scale (scaleFactor > 1, range expands -> price points compress)
        const scaleFactor = Math.max(0.01, Math.min(100, Math.exp((dy / Math.max(100, height)) * 1.8)));

        const anchorPrice = typeof axisComponent.convertFromPixel === 'function'
          ? axisComponent.convertFromPixel(startY)
          : (startRange.from + startRange.to) / 2;

        const origRangeSpan = (startRange.to - startRange.from);
        const anchorRatio = origRangeSpan !== 0 ? Math.max(0, Math.min(1, (anchorPrice - startRange.from) / origRangeSpan)) : 0.5;

        const newRangeSpan = origRangeSpan * scaleFactor;
        const newFrom = anchorPrice - anchorRatio * newRangeSpan;
        const newTo = newFrom + newRangeSpan;

        if (typeof axisComponent.setAutoCalcTickFlag === 'function') {
          axisComponent.setAutoCalcTickFlag(false);
        }
        (axisComponent as any)._autoCalcTickFlag = false;

        const baseRange = axisComponent.getRange() || undefined;
        const realFrom = typeof axisComponent.valueToRealValue === 'function' ? axisComponent.valueToRealValue(newFrom, baseRange ? { range: baseRange } : undefined) : newFrom;
        const realTo = typeof axisComponent.valueToRealValue === 'function' ? axisComponent.valueToRealValue(newTo, baseRange ? { range: baseRange } : undefined) : newTo;
        const displayFrom = typeof axisComponent.realValueToDisplayValue === 'function' ? axisComponent.realValueToDisplayValue(realFrom, baseRange ? { range: baseRange } : undefined) : realFrom;
        const displayTo = typeof axisComponent.realValueToDisplayValue === 'function' ? axisComponent.realValueToDisplayValue(realTo, baseRange ? { range: baseRange } : undefined) : realTo;

        const rangeVal = {
          from: newFrom,
          to: newTo,
          range: newTo - newFrom,
          realFrom,
          realTo,
          realRange: realTo - realFrom,
          displayFrom,
          displayTo,
          displayRange: displayTo - displayFrom
        };

        if (typeof axisComponent.setRange === 'function') {
          axisComponent.setRange(rangeVal);
        }
        (axisComponent as any)._range = rangeVal;
        (axisComponent as any)._realRange = rangeVal;

        if (typeof coreChart.layout === 'function') {
          coreChart.layout({ measureWidth: true, update: true, buildYAxisTick: true });
        }
        if (typeof coreChart.updatePane === 'function') {
          coreChart.updatePane(4);
        }
      }
      return;
    }

    // 2. Dragging on the Main Chart -> ONLY when the chart is manually stretched, translate Y-axis
    if (isDraggingMainChart && activeDragChart) {
      const coreChart = (activeDragChart as any)._chartApi || activeDragChart;
      const axisComponent = getYAxisComponent(coreChart);
      const isManualScale = axisComponent && (
        (typeof axisComponent.getAutoCalcTickFlag === 'function' && !axisComponent.getAutoCalcTickFlag()) ||
        (axisComponent as any)._autoCalcTickFlag === false
      );

      // If the chart is stretched (in manual scale mode), synchronize the Y-axis vertical position
      // preserving the exact stretched range and gap created between prices!
      if (isManualScale && axisComponent && startRange) {
        const pStart = typeof axisComponent.convertFromPixel === 'function' ? axisComponent.convertFromPixel(startY) : 0;
        const pCurrent = typeof axisComponent.convertFromPixel === 'function' ? axisComponent.convertFromPixel(e.clientY) : 0;
        const dp = pStart - pCurrent;

        const newFrom = (startRange.from !== undefined ? startRange.from : startRange.min) + dp;
        const newTo = (startRange.to !== undefined ? startRange.to : startRange.max) + dp;

        const baseRange = axisComponent.getRange() || undefined;
        const realFrom = typeof axisComponent.valueToRealValue === 'function' ? axisComponent.valueToRealValue(newFrom, baseRange ? { range: baseRange } : undefined) : newFrom;
        const realTo = typeof axisComponent.valueToRealValue === 'function' ? axisComponent.valueToRealValue(newTo, baseRange ? { range: baseRange } : undefined) : newTo;
        const displayFrom = typeof axisComponent.realValueToDisplayValue === 'function' ? axisComponent.realValueToDisplayValue(realFrom, baseRange ? { range: baseRange } : undefined) : realFrom;
        const displayTo = typeof axisComponent.realValueToDisplayValue === 'function' ? axisComponent.realValueToDisplayValue(realTo, baseRange ? { range: baseRange } : undefined) : realTo;

        const rangeVal = {
          from: newFrom,
          to: newTo,
          range: newTo - newFrom,
          realFrom,
          realTo,
          realRange: realTo - realFrom,
          displayFrom,
          displayTo,
          displayRange: displayTo - displayFrom
        };

        if (typeof axisComponent.setRange === 'function') {
          axisComponent.setRange(rangeVal);
        }
        (axisComponent as any)._range = rangeVal;
        (axisComponent as any)._realRange = rangeVal;

        if (typeof coreChart.layout === 'function') {
          coreChart.layout({ measureWidth: true, update: true, buildYAxisTick: true });
        }
      }
    }
  }, true);

  window.addEventListener('pointerup', (e) => {
    setGlobalActiveDragAnchor(null, undefined);
    if (isDispatchingFakeEvent) return;
    isPointerDown = false;
    if (isDraggingYAxis) {
      e.preventDefault();
      e.stopPropagation();
    }
    isDraggingYAxis = false;
    isDraggingMainChart = false;
    activeDragChart = null;
  }, true);
}
