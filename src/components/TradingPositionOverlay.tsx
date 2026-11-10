import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ChartPosition, ChartExecution, PositionSide } from '../types/chart';

export interface TradingPositionOverlayProps {
  coreChart: any;
  container: HTMLElement | null;
  positions?: ChartPosition[];
  executions?: ChartExecution[];
  onPositionClose?: (positionId: string, position?: ChartPosition) => void;
  onPositionReverse?: (position: ChartPosition) => void;
  onModifyTP?: (tpPrice: number | undefined, position: ChartPosition) => void;
  onModifySL?: (slPrice: number | undefined, position: ChartPosition) => void;
  theme?: 'dark' | 'light';
  pricePrecision?: number;
}

interface DragState {
  type: 'create-tp' | 'create-sl' | 'move-tp' | 'move-sl';
  position: ChartPosition;
  currentY: number;
  currentPrice: number;
  startY: number;
  startPrice: number;
}

export const TradingPositionOverlay: React.FC<TradingPositionOverlayProps> = ({
  coreChart,
  container,
  positions = [],
  executions = [],
  onPositionClose,
  onPositionReverse,
  onModifyTP,
  onModifySL,
  theme = 'dark',
  pricePrecision = 2,
}) => {
  const [, setTick] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<{ posId: string; type: 'tp' | 'sl' | 'reverse' | 'close' } | null>(null);
  const [hoveredExecId, setHoveredExecId] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const chartInstance = coreChart || (typeof window !== 'undefined' ? (window as any).__active_chart_instance__ : null);

  // Trigger re-render to update positions when chart moves
  const requestUpdate = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setTick(t => (t + 1) % 10000);
    });
  }, []);

  // Poll until active chart instance is available if not initially present
  useEffect(() => {
    if (chartInstance) return;
    const interval = setInterval(() => {
      if ((window as any).__active_chart_instance__) {
        clearInterval(interval);
        requestUpdate();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [chartInstance, requestUpdate]);

  // Subscribe to chart zoom, scroll, and crosshair changes
  useEffect(() => {
    if (!chartInstance) return;
    const unsubZoom = chartInstance.subscribeAction?.('onZoom', requestUpdate);
    const unsubScroll = chartInstance.subscribeAction?.('onScroll', requestUpdate);
    const unsubRange = chartInstance.subscribeAction?.('onVisibleRangeChange', requestUpdate);
    const unsubCross = chartInstance.subscribeAction?.('onCrosshairChange', requestUpdate);

    return () => {
      try {
        if (typeof unsubZoom === 'function') unsubZoom();
        if (typeof unsubScroll === 'function') unsubScroll();
        if (typeof unsubRange === 'function') unsubRange();
        if (typeof unsubCross === 'function') unsubCross();
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      } catch (e) {}
    };
  }, [chartInstance, requestUpdate]);

  // Continuously track live price updates from active chart feed
  useEffect(() => {
    const timer = setInterval(() => {
      requestUpdate();
    }, 200);
    return () => clearInterval(timer);
  }, [requestUpdate]);

  // ResizeObserver on chart container
  useEffect(() => {
    if (!container) return;
    const ro = new ResizeObserver(() => {
      requestUpdate();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [container, requestUpdate]);

  // Price conversion helpers
  const priceToY = useCallback((price: number): number | null => {
    const chart = chartInstance;
    if (!chart || typeof chart.convertToPixel !== 'function' || !Number.isFinite(price)) return null;
    try {
      const res = chart.convertToPixel([{ value: price }], { paneId: 'candle_pane' });
      if (res && res[0] && Number.isFinite(res[0].y)) {
        return res[0].y;
      }
    } catch (e) {}
    return null;
  }, [chartInstance]);

  const yToPrice = useCallback((y: number): number | null => {
    const chart = chartInstance;
    if (!chart || typeof chart.convertFromPixel !== 'function' || !Number.isFinite(y)) return null;
    try {
      const res = chart.convertFromPixel([{ y }], { paneId: 'candle_pane' });
      if (res && res[0] && Number.isFinite(res[0].value)) {
        return res[0].value;
      }
    } catch (e) {}
    return null;
  }, [chartInstance]);

  const timestampToX = useCallback((timestamp: number): number | null => {
    const chart = chartInstance;
    if (!chart || typeof chart.convertToPixel !== 'function' || !timestamp) return null;
    try {
      const res = chart.convertToPixel([{ timestamp }], { paneId: 'candle_pane' });
      if (res && res[0] && Number.isFinite(res[0].x)) {
        return res[0].x;
      }
      // Robust fallback for live/recent candles if direct timestamp lookup misses exact millisecond
      if (typeof chart.getDataList === 'function') {
        const data = chart.getDataList();
        if (data && data.length > 0) {
          const lastCandle = data[data.length - 1];
          if (timestamp >= lastCandle.timestamp) {
            const lastRes = chart.convertToPixel([{ dataIndex: data.length - 1 }], { paneId: 'candle_pane' });
            if (lastRes && lastRes[0] && Number.isFinite(lastRes[0].x)) {
              return lastRes[0].x;
            }
          }
        }
      }
    } catch (e) {}
    return null;
  }, [chartInstance]);

  // Format helpers
  const formatPrice = useCallback((price: number) => {
    if (!Number.isFinite(price)) return '--';
    return price.toFixed(pricePrecision);
  }, [pricePrecision]);

  const formatPnL = useCallback((pnl: number, currency = 'USD') => {
    if (!Number.isFinite(pnl)) return `0.00 ${currency}`;
    const sign = pnl > 0 ? '+' : pnl < 0 ? '− ' : '';
    const absVal = Math.abs(pnl).toFixed(2);
    return `${sign}${absVal} ${currency}`;
  }, []);

  const formatTimestamp = useCallback((ts: number | null | undefined) => {
    if (!ts || !Number.isFinite(ts)) return '--';
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }, []);

  // Calculate projected PnL for TP / SL
  const calculateProjectedPnL = useCallback((
    side: PositionSide,
    entryPrice: number,
    targetPrice: number,
    amount: number | string
  ) => {
    const qty = typeof amount === 'string' ? parseFloat(amount) || 1 : Math.abs(amount);
    const diff = side === 'long' ? (targetPrice - entryPrice) : (entryPrice - targetPrice);
    return diff * qty;
  }, []);

  const hasMovedRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);

  // Helper to disable chart scrolling during position drag (especially in free movement mode)
  const disableChartScroll = useCallback((chart: any) => {
    (window as any).__is_position_dragging__ = true;
    const activeChart = chart || (window as any).__active_chart_instance__;
    if (!activeChart) return;
    try {
      if (typeof activeChart.setScrollEnabled === 'function') {
        activeChart.setScrollEnabled(false);
      }
      const store = activeChart._chartStore || (typeof activeChart.getChartStore === 'function' ? activeChart.getChartStore() : null);
      if (store && typeof store.setScrollEnabled === 'function') {
        store.setScrollEnabled(false);
      }
      const chartEvent = activeChart._chartEvent;
      if (chartEvent) {
        chartEvent._startScrollCoordinate = null;
        if (chartEvent._flingScrollAnimation) {
          chartEvent._flingScrollAnimation.cancel?.();
          chartEvent._flingScrollAnimation = null;
        }
        if (chartEvent._prevYAxisRanges && typeof chartEvent._prevYAxisRanges.clear === 'function') {
          chartEvent._prevYAxisRanges.clear();
        }
        if (chartEvent._event) {
          chartEvent._event._mousePressed = false;
          chartEvent._event._mouseMoveStartCoordinate = null;
          if (chartEvent._event._unsubscribeRootMouseEvents) {
            chartEvent._event._unsubscribeRootMouseEvents();
            chartEvent._event._unsubscribeRootMouseEvents = null;
          }
        }
      }
    } catch (e) {}
  }, []);

  const enableChartScroll = useCallback((chart: any) => {
    (window as any).__is_position_dragging__ = false;
    const activeChart = chart || (window as any).__active_chart_instance__;
    if (!activeChart) return;
    try {
      if (typeof activeChart.setScrollEnabled === 'function') {
        activeChart.setScrollEnabled(true);
      }
      const store = activeChart._chartStore || (typeof activeChart.getChartStore === 'function' ? activeChart.getChartStore() : null);
      if (store && typeof store.setScrollEnabled === 'function') {
        store.setScrollEnabled(true);
      }
      const chartEvent = activeChart._chartEvent;
      if (chartEvent) {
        chartEvent._startScrollCoordinate = null;
      }
    } catch (e) {}
  }, []);

  const stopEvent = useCallback((e: any) => {
    if (!e) return;
    e.preventDefault?.();
    e.stopPropagation?.();
    if (e.nativeEvent) {
      e.nativeEvent.preventDefault?.();
      e.nativeEvent.stopPropagation?.();
      e.nativeEvent.stopImmediatePropagation?.();
    }
  }, []);

  // Global mouse handlers for dragging TP / SL (continuous so zero moves are dropped)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent | PointerEvent) => {
      const currentDrag = dragStateRef.current;
      if (!currentDrag) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof (e as any).stopImmediatePropagation === 'function') {
        (e as any).stopImmediatePropagation();
      }

      // Ensure chart scrolling coordinate stays reset so chart cannot pan
      const activeChart = chartInstance || (window as any).__active_chart_instance__;
      if (activeChart?._chartEvent) {
        activeChart._chartEvent._startScrollCoordinate = null;
        if (activeChart._chartEvent._flingScrollAnimation) {
          activeChart._chartEvent._flingScrollAnimation.cancel?.();
          activeChart._chartEvent._flingScrollAnimation = null;
        }
      }

      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      const currentY = Math.max(10, Math.min(rect.height - 10, e.clientY - rect.top));

      if (Math.abs(currentY - currentDrag.startY) > 3) {
        hasMovedRef.current = true;
      }

      const rawPrice = yToPrice(currentY);
      if (rawPrice !== null && Number.isFinite(rawPrice)) {
        const currentPrice = Number(rawPrice.toFixed(pricePrecision));
        const nextState: DragState = {
          ...currentDrag,
          currentY,
          currentPrice
        };
        dragStateRef.current = nextState;
        setDragState(nextState);
      }
    };

    const handleMouseUp = (e: MouseEvent | PointerEvent) => {
      const currentDrag = dragStateRef.current;
      if (!currentDrag) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof (e as any).stopImmediatePropagation === 'function') {
        (e as any).stopImmediatePropagation();
      }

      enableChartScroll(chartInstance);

      if (!overlayRef.current) {
        dragStateRef.current = null;
        setDragState(null);
        return;
      }

      const position = currentDrag.position;
      const side = position.side;
      const rect = overlayRef.current.getBoundingClientRect();
      const finalY = Math.max(10, Math.min(rect.height - 10, e.clientY - rect.top));
      const rawFinalPrice = yToPrice(finalY);
      const finalPrice = rawFinalPrice !== null && Number.isFinite(rawFinalPrice)
        ? Number(rawFinalPrice.toFixed(pricePrecision))
        : currentDrag.currentPrice;

      const moved = hasMovedRef.current || Math.abs(finalY - currentDrag.startY) > 4;

      if (currentDrag.type === 'create-tp' || currentDrag.type === 'move-tp') {
        let tpPrice: number;
        if (moved) {
          // User dragged to a specific price - ALWAYS commit this exact price!
          tpPrice = finalPrice;
        } else if (currentDrag.type === 'create-tp') {
          // User single-clicked [ TP ] button without dragging -> default offset
          tpPrice = side === 'long'
            ? Number((position.entryPrice * 1.015).toFixed(pricePrecision))
            : Number((position.entryPrice * 0.985).toFixed(pricePrecision));
        } else {
          // Clicked existing TP badge without moving -> keep existing price
          tpPrice = position.takeProfit ?? finalPrice;
        }

        if (tpPrice > 0) {
          if (position.onModifyTP) {
            position.onModifyTP(tpPrice, position);
          } else if (onModifyTP) {
            onModifyTP(tpPrice, position);
          }
        }
      } else if (currentDrag.type === 'create-sl' || currentDrag.type === 'move-sl') {
        let slPrice: number;
        if (moved) {
          // User dragged to a specific price - ALWAYS commit this exact price!
          slPrice = finalPrice;
        } else if (currentDrag.type === 'create-sl') {
          // User single-clicked [ SL ] button without dragging -> default offset
          slPrice = side === 'long'
            ? Number((position.entryPrice * 0.988).toFixed(pricePrecision))
            : Number((position.entryPrice * 1.012).toFixed(pricePrecision));
        } else {
          // Clicked existing SL badge without moving -> keep existing price
          slPrice = position.stopLoss ?? finalPrice;
        }

        if (slPrice > 0) {
          if (position.onModifySL) {
            position.onModifySL(slPrice, position);
          } else if (onModifySL) {
            onModifySL(slPrice, position);
          }
        }
      }

      dragStateRef.current = null;
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: false, capture: true });
    window.addEventListener('mouseup', handleMouseUp, { capture: true });
    window.addEventListener('pointermove', handleMouseMove as any, { passive: false, capture: true });
    window.addEventListener('pointerup', handleMouseUp as any, { capture: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove, { capture: true });
      window.removeEventListener('mouseup', handleMouseUp, { capture: true });
      window.removeEventListener('pointermove', handleMouseMove as any, { capture: true });
      window.removeEventListener('pointerup', handleMouseUp as any, { capture: true });
      enableChartScroll(chartInstance);
    };
  }, [yToPrice, pricePrecision, onModifyTP, onModifySL, chartInstance, enableChartScroll]);

  // Start dragging a new TP
  const startDragCreateTP = (e: React.MouseEvent | React.PointerEvent, position: ChartPosition, entryY: number) => {
    stopEvent(e);
    if (dragStateRef.current) return;
    disableChartScroll(chartInstance);
    const rect = overlayRef.current?.getBoundingClientRect();
    const mouseY = rect ? Math.max(10, Math.min(rect.height - 10, e.clientY - rect.top)) : entryY;
    const currentPrice = yToPrice(mouseY) ?? position.entryPrice;

    hasMovedRef.current = false;
    const state: DragState = {
      type: 'create-tp',
      position,
      startY: mouseY,
      startPrice: position.entryPrice,
      currentY: mouseY,
      currentPrice
    };
    dragStateRef.current = state;
    setDragState(state);
  };

  // Start dragging a new SL
  const startDragCreateSL = (e: React.MouseEvent | React.PointerEvent, position: ChartPosition, entryY: number) => {
    stopEvent(e);
    if (dragStateRef.current) return;
    disableChartScroll(chartInstance);
    const rect = overlayRef.current?.getBoundingClientRect();
    const mouseY = rect ? Math.max(10, Math.min(rect.height - 10, e.clientY - rect.top)) : entryY;
    const currentPrice = yToPrice(mouseY) ?? position.entryPrice;

    hasMovedRef.current = false;
    const state: DragState = {
      type: 'create-sl',
      position,
      startY: mouseY,
      startPrice: position.entryPrice,
      currentY: mouseY,
      currentPrice
    };
    dragStateRef.current = state;
    setDragState(state);
  };

  // Start moving existing TP
  const startMoveTP = (e: React.MouseEvent | React.PointerEvent, position: ChartPosition, currentY: number) => {
    stopEvent(e);
    if (dragStateRef.current) return;
    if (!position.takeProfit) return;
    disableChartScroll(chartInstance);
    const rect = overlayRef.current?.getBoundingClientRect();
    const mouseY = rect ? Math.max(10, Math.min(rect.height - 10, e.clientY - rect.top)) : currentY;

    hasMovedRef.current = false;
    const state: DragState = {
      type: 'move-tp',
      position,
      startY: mouseY,
      startPrice: position.takeProfit,
      currentY: mouseY,
      currentPrice: position.takeProfit
    };
    dragStateRef.current = state;
    setDragState(state);
  };

  // Start moving existing SL
  const startMoveSL = (e: React.MouseEvent | React.PointerEvent, position: ChartPosition, currentY: number) => {
    stopEvent(e);
    if (dragStateRef.current) return;
    if (!position.stopLoss) return;
    disableChartScroll(chartInstance);
    const rect = overlayRef.current?.getBoundingClientRect();
    const mouseY = rect ? Math.max(10, Math.min(rect.height - 10, e.clientY - rect.top)) : currentY;

    hasMovedRef.current = false;
    const state: DragState = {
      type: 'move-sl',
      position,
      startY: mouseY,
      startPrice: position.stopLoss,
      currentY: mouseY,
      currentPrice: position.stopLoss
    };
    dragStateRef.current = state;
    setDragState(state);
  };

  // Cancel TP
  const handleCancelTP = (e: React.MouseEvent, position: ChartPosition) => {
    e.stopPropagation();
    if (position.onModifyTP) {
      position.onModifyTP(undefined, position);
    } else if (onModifyTP) {
      onModifyTP(undefined, position);
    }
  };

  // Cancel SL
  const handleCancelSL = (e: React.MouseEvent, position: ChartPosition) => {
    e.stopPropagation();
    if (position.onModifySL) {
      position.onModifySL(undefined, position);
    } else if (onModifySL) {
      onModifySL(undefined, position);
    }
  };

  // Reverse Position
  const handleReverse = (e: React.MouseEvent, position: ChartPosition) => {
    e.stopPropagation();
    if (position.onReverse) {
      position.onReverse(position);
    } else if (onPositionReverse) {
      onPositionReverse(position);
    }
  };

  // Close Position
  const handleClose = (e: React.MouseEvent, position: ChartPosition) => {
    e.stopPropagation();
    if (position.onClose) {
      position.onClose(position);
    } else if (onPositionClose) {
      onPositionClose(position.id, position);
    }
  };

  // Overlay dimensions
  const overlayDimensions = useMemo(() => {
    if (!container) return { width: 800, height: 500, rightMargin: 65 };
    const rect = container.getBoundingClientRect();
    // In Klinecharts right price axis is usually ~65px
    const rightMargin = 65;
    return {
      width: Math.max(100, rect.width),
      height: Math.max(100, rect.height),
      rightMargin
    };
  }, [container, setTick]);

  const { width, rightMargin } = overlayDimensions;
  const railX = width - rightMargin - 20;

  const hasContent = chartInstance && positions.length > 0;

  return (
    <div
      ref={overlayRef}
      className="tv-position-overlay-container"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: dragState ? 'auto' : 'none',
        userSelect: 'none',
        overflow: 'hidden',
        zIndex: dragState ? 99999 : 25,
        cursor: dragState ? 'ns-resize' : 'default'
      }}
    >
      {/* SVG Canvas for Lines, Rails, and Connectors */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none'
        }}
      >
        {hasContent && positions.map(position => {
          const isShort = position.side === 'short';
          const epColor = position.color || (isShort ? '#f23645' : '#089981');
          const slColor = '#ff9800';
          const tpColor = '#089981';

          const entryY = priceToY(position.entryPrice);
          const tpY = position.takeProfit ? priceToY(position.takeProfit) : null;
          const slY = position.stopLoss ? priceToY(position.stopLoss) : null;

          // Dragging state overrides
          const isDraggingThis = dragState?.position.id === position.id;
          const activeDragTPY = isDraggingThis && (dragState.type === 'create-tp' || dragState.type === 'move-tp') ? dragState.currentY : null;
          const activeDragSLY = isDraggingThis && (dragState.type === 'create-sl' || dragState.type === 'move-sl') ? dragState.currentY : null;

          const effectiveTPY = activeDragTPY ?? tpY;
          const effectiveSLY = activeDragSLY ?? slY;

          // Vertical bracket connector rail
          const validYs: { y: number; color: string }[] = [];
          if (entryY !== null) validYs.push({ y: entryY, color: epColor });
          if (effectiveTPY !== null) validYs.push({ y: effectiveTPY, color: tpColor });
          if (effectiveSLY !== null) validYs.push({ y: effectiveSLY, color: slColor });

          validYs.sort((a, b) => a.y - b.y);
          const minY = validYs[0]?.y;
          const maxY = validYs[validYs.length - 1]?.y;
          const showRail = validYs.length >= 2;
          const lineEndX = width - rightMargin;

          return (
            <g key={`svg-${position.id}`}>
              {/* Entry Price (EP) Line */}
              {entryY !== null && (
                <line
                  x1={0}
                  y1={entryY}
                  x2={lineEndX}
                  y2={entryY}
                  stroke={epColor}
                  strokeWidth={0.5}
                />
              )}

              {/* Stop Loss (SL) Line */}
              {effectiveSLY !== null && (
                <line
                  x1={0}
                  y1={effectiveSLY}
                  x2={lineEndX}
                  y2={effectiveSLY}
                  stroke={slColor}
                  strokeWidth={0.5}
                  strokeDasharray={isDraggingThis && dragState?.type === 'create-sl' ? '4,4' : undefined}
                />
              )}

              {/* Take Profit (TP) Line */}
              {effectiveTPY !== null && (
                <line
                  x1={0}
                  y1={effectiveTPY}
                  x2={lineEndX}
                  y2={effectiveTPY}
                  stroke={tpColor}
                  strokeWidth={0.5}
                  strokeDasharray={isDraggingThis && dragState?.type === 'create-tp' ? '4,4' : undefined}
                />
              )}

              {/* Right Bracket Connector Rail (shown ONLY when dragging line) */}
              {showRail && isDraggingThis && (
                <g>
                  {/* Vertical line connecting levels */}
                  <line
                    x1={railX}
                    y1={minY}
                    x2={railX}
                    y2={maxY}
                    stroke={epColor}
                    strokeWidth={0.5}
                    opacity={0.85}
                  />
                  {/* Anchor dots at each line level */}
                  {validYs.map((node, i) => (
                    <circle
                      key={`dot-${i}`}
                      cx={railX}
                      cy={node.y}
                      r={3.5}
                      fill={node.color}
                      stroke="#131722"
                      strokeWidth={0.5}
                    />
                  ))}
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Interactive HTML Badges & Controls Layer */}
      {hasContent && positions.map(position => {
        const isShort = position.side === 'short';
        const epColor = position.color || (isShort ? '#f23645' : '#089981');
        const slColor = '#ff9800';
        const tpColor = '#089981';
        const currency = position.currency || 'USD';

        const entryY = priceToY(position.entryPrice);
        const tpY = position.takeProfit ? priceToY(position.takeProfit) : null;
        const slY = position.stopLoss ? priceToY(position.stopLoss) : null;

        const isDraggingThis = dragState?.position.id === position.id;
        const activeDragTPY = isDraggingThis && (dragState.type === 'create-tp' || dragState.type === 'move-tp') ? dragState.currentY : null;
        const activeDragSLY = isDraggingThis && (dragState.type === 'create-sl' || dragState.type === 'move-sl') ? dragState.currentY : null;

        const effectiveTPY = activeDragTPY ?? tpY;
        const effectiveSLY = activeDragSLY ?? slY;
        const effectiveTPPrice = (activeDragTPY !== null ? dragState?.currentPrice : position.takeProfit) ?? 0;
        const effectiveSLPrice = (activeDragSLY !== null ? dragState?.currentPrice : position.stopLoss) ?? 0;

        // Display amounts
        const rawAmount = typeof position.amount === 'number' ? position.amount : parseFloat(position.amount) || 1;
        const displayQty = isShort ? `-${Math.abs(rawAmount)}` : `${Math.abs(rawAmount)}`;
        const posAmountNum = Math.abs(rawAmount);

        // Retrieve live market price from active chart to track real-time Profit and Loss
        let liveCurrentPrice: number | null = null;
        if (chartInstance && typeof chartInstance.getDataList === 'function') {
          const dataList = chartInstance.getDataList();
          if (dataList && dataList.length > 0) {
            const lastCandle = dataList[dataList.length - 1];
            if (lastCandle) {
              const candidate = lastCandle.close ?? lastCandle.open;
              if (Number.isFinite(candidate)) {
                liveCurrentPrice = candidate;
              }
            }
          }
        }

        // Live tracking PnL value calculation
        const pnl = (liveCurrentPrice !== null && Number.isFinite(position.entryPrice))
          ? (position.side === 'long'
              ? (liveCurrentPrice - position.entryPrice) * posAmountNum
              : (position.entryPrice - liveCurrentPrice) * posAmountNum)
          : (position.pnl !== undefined ? position.pnl : 0);

        const pnlPercent = (liveCurrentPrice !== null && Number.isFinite(position.entryPrice) && position.entryPrice > 0)
          ? ((liveCurrentPrice - position.entryPrice) / position.entryPrice) * 100 * (position.side === 'long' ? 1 : -1)
          : 0;

        // Position pill horizontal placement (~65% across chart width)
        const badgeX = Math.max(120, Math.min(width - rightMargin - 320, width * 0.62));
        const lineEndX = width - rightMargin;

        return (
          <React.Fragment key={`html-${position.id}`}>
            {/* ─── LINE DRAG HITBOXES (Dedicated full-width HTML bars for TP & SL lines) ─── */}
            {effectiveSLY !== null && position.stopLoss && (
              <div
                className="tv-line-drag-hitbox tv-sl-hitbox"
                title="Drag Stop Loss line"
                onMouseDown={(e) => startMoveSL(e, position, effectiveSLY)}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: `${effectiveSLY - 12}px`,
                  width: `${lineEndX}px`,
                  height: '24px',
                  cursor: 'ns-resize',
                  pointerEvents: 'auto',
                  zIndex: 29,
                  background: 'transparent'
                }}
              />
            )}

            {effectiveTPY !== null && position.takeProfit && (
              <div
                className="tv-line-drag-hitbox tv-tp-hitbox"
                title="Drag Take Profit line"
                onMouseDown={(e) => startMoveTP(e, position, effectiveTPY)}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: `${effectiveTPY - 12}px`,
                  width: `${lineEndX}px`,
                  height: '24px',
                  cursor: 'ns-resize',
                  pointerEvents: 'auto',
                  zIndex: 29,
                  background: 'transparent'
                }}
              />
            )}

            {/* ─── 1. ENTRY PRICE (EP) BADGE ─── */}
            {entryY !== null && (
              <div
                className="tv-position-badge tv-ep-badge"
                style={{
                  position: 'absolute',
                  left: `${badgeX}px`,
                  top: `${entryY}px`,
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  pointerEvents: 'auto',
                  zIndex: 30
                }}
              >
                {/* Reverse Position Button [ ⇅ ] */}
                <button
                  type="button"
                  title="Reverse position"
                  onClick={(e) => handleReverse(e, position)}
                  className="tv-badge-btn tv-btn-reverse"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '26px',
                    height: '24px',
                    borderRadius: '4px',
                    border: `1px solid ${epColor}`,
                    background: '#1e222d',
                    color: epColor,
                    cursor: 'pointer',
                    padding: 0,
                    outline: 'none',
                    boxShadow: hoveredBtn?.posId === position.id && hoveredBtn?.type === 'reverse'
                      ? `inset 0 0 0 100px ${isShort ? 'rgba(242, 54, 69, 0.22)' : 'rgba(8, 153, 129, 0.22)'}, 0 0 8px ${isShort ? 'rgba(242, 54, 69, 0.4)' : 'rgba(8, 153, 129, 0.4)'}`
                      : 'none',
                    transition: 'box-shadow 0.15s ease, transform 0.1s ease'
                  }}
                  onMouseEnter={() => setHoveredBtn({ posId: position.id, type: 'reverse' })}
                  onMouseLeave={() => setHoveredBtn(null)}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    {/* Left arrow: Upward pointing solid triangle head + vertical stem */}
                    <path
                      d="M3.75 1.6L6.2 5H1.3L3.75 1.6Z"
                      fill="currentColor"
                      stroke="currentColor"
                      strokeWidth="0.6"
                      strokeLinejoin="round"
                    />
                    <line
                      x1="3.75"
                      y1="4.5"
                      x2="3.75"
                      y2="11.2"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />

                    {/* Right arrow: Downward pointing solid triangle head + vertical stem */}
                    <path
                      d="M9.25 11.4L11.7 8H6.8L9.25 11.4Z"
                      fill="currentColor"
                      stroke="currentColor"
                      strokeWidth="0.6"
                      strokeLinejoin="round"
                    />
                    <line
                      x1="9.25"
                      y1="1.8"
                      x2="9.25"
                      y2="8.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>

                {/* Dotted [ TP ] Button (Visible only if TP is not set) */}
                {!position.takeProfit && (
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className="tv-badge-btn tv-btn-dotted tv-btn-dotted-tp"
                      onMouseDown={(e) => startDragCreateTP(e, position, entryY)}
                      onMouseEnter={() => setHoveredBtn({ posId: position.id, type: 'tp' })}
                      onMouseLeave={() => setHoveredBtn(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2px 8px',
                        height: '24px',
                        borderRadius: '4px',
                        border: (hoveredBtn?.posId === position.id && hoveredBtn?.type === 'tp') || (isDraggingThis && dragState?.type === 'create-tp')
                          ? '1.5px solid #089981'
                          : '1.5px dotted #089981',
                        background: '#1e222d',
                        color: '#089981',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'grab',
                        letterSpacing: '0.5px',
                        outline: 'none',
                        boxShadow: (hoveredBtn?.posId === position.id && hoveredBtn?.type === 'tp') || (isDraggingThis && dragState?.type === 'create-tp')
                          ? 'inset 0 0 0 100px rgba(8, 153, 129, 0.22), 0 0 8px rgba(8, 153, 129, 0.4)'
                          : 'none',
                        transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
                      }}
                    >
                      TP
                    </button>

                    {/* Tooltip on hover: "Drag to add Take profit" */}
                    {hoveredBtn?.posId === position.id && hoveredBtn?.type === 'tp' && !dragState && (
                      <div
                        className="tv-position-tooltip"
                        style={{
                          position: 'absolute',
                          bottom: '30px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          backgroundColor: '#2a2e39',
                          color: '#f0f3fa',
                          fontSize: '11px',
                          fontWeight: 500,
                          padding: '4px 8px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                          zIndex: 100,
                          pointerEvents: 'none'
                        }}
                      >
                        Drag to add Take profit
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: 0,
                            height: 0,
                            borderLeft: '5px solid transparent',
                            borderRight: '5px solid transparent',
                            borderTop: '5px solid #2a2e39'
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Dotted [ SL ] Button (Visible only if SL is not set) */}
                {!position.stopLoss && (
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className="tv-badge-btn tv-btn-dotted tv-btn-dotted-sl"
                      onMouseDown={(e) => startDragCreateSL(e, position, entryY)}
                      onMouseEnter={() => setHoveredBtn({ posId: position.id, type: 'sl' })}
                      onMouseLeave={() => setHoveredBtn(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2px 8px',
                        height: '24px',
                        borderRadius: '4px',
                        border: (hoveredBtn?.posId === position.id && hoveredBtn?.type === 'sl') || (isDraggingThis && dragState?.type === 'create-sl')
                          ? '1.5px solid #ff9800'
                          : '1.5px dotted #ff9800',
                        background: '#1e222d',
                        color: '#ff9800',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'grab',
                        letterSpacing: '0.5px',
                        outline: 'none',
                        boxShadow: (hoveredBtn?.posId === position.id && hoveredBtn?.type === 'sl') || (isDraggingThis && dragState?.type === 'create-sl')
                          ? 'inset 0 0 0 100px rgba(255, 152, 0, 0.22), 0 0 8px rgba(255, 152, 0, 0.4)'
                          : 'none',
                        transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
                      }}
                    >
                      SL
                    </button>

                    {/* Tooltip on hover: "Drag to add Stop loss" */}
                    {hoveredBtn?.posId === position.id && hoveredBtn?.type === 'sl' && !dragState && (
                      <div
                        className="tv-position-tooltip"
                        style={{
                          position: 'absolute',
                          bottom: '30px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          backgroundColor: '#2a2e39',
                          color: '#f0f3fa',
                          fontSize: '11px',
                          fontWeight: 500,
                          padding: '4px 8px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                          zIndex: 100,
                          pointerEvents: 'none'
                        }}
                      >
                        Drag to add Stop loss
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: 0,
                            height: 0,
                            borderLeft: '5px solid transparent',
                            borderRight: '5px solid transparent',
                            borderTop: '5px solid #2a2e39'
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Pill: [ Quantity | PnL | Close ✕ ] */}
                <div
                  className="tv-position-pill"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: '24px',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    border: `1px solid ${epColor}`,
                    background: '#1e222d',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.35)'
                  }}
                >
                  {/* Left Segment: Amount / Quantity with solid color */}
                  <div
                    className="tv-pill-qty"
                    style={{
                      background: epColor,
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '0 8px',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      letterSpacing: '0.3px'
                    }}
                  >
                    {displayQty}
                  </div>

                  {/* Middle Segment: Unrealized PnL Tracking Value */}
                  <div
                    className="tv-pill-pnl"
                    title={`Unrealized P&L: ${formatPnL(pnl, currency)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`}
                    style={{
                      padding: '0 10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: pnl < 0 ? '#f23645' : pnl > 0 ? '#089981' : '#d1d4dc',
                      display: 'flex',
                      alignItems: 'center',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {formatPnL(pnl, currency)}
                  </div>

                  {/* Close Position Button [ ✕ ] */}
                  <button
                    type="button"
                    title="Close position"
                    onClick={(e) => handleClose(e, position)}
                    className="tv-pill-close-btn"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '100%',
                      border: 'none',
                      background: 'transparent',
                      color: epColor,
                      cursor: 'pointer',
                      padding: 0,
                      outline: 'none',
                      transition: 'background 0.15s ease, color 0.15s ease'
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* ─── 2. STOP LOSS (SL) BADGE ─── */}
            {effectiveSLY !== null && (
              <div
                className="tv-position-badge tv-sl-badge"
                onMouseDown={(e) => startMoveSL(e, position, effectiveSLY)}
                style={{
                  position: 'absolute',
                  left: `${badgeX + 30}px`,
                  top: `${effectiveSLY}px`,
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  height: '24px',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  border: `1px solid ${slColor}`,
                  background: '#1e222d',
                  boxShadow: isDraggingThis && (dragState?.type === 'move-sl' || dragState?.type === 'create-sl')
                    ? 'inset 0 0 0 100px rgba(255, 152, 0, 0.22), 0 0 10px rgba(255, 152, 0, 0.5), 0 2px 8px rgba(0,0,0,0.5)'
                    : '0 2px 6px rgba(0,0,0,0.35)',
                  cursor: 'ns-resize',
                  pointerEvents: 'auto',
                  zIndex: 32
                }}
              >
                {/* SL Label */}
                <div
                  style={{
                    padding: '0 8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: slColor,
                    borderRight: '1px solid rgba(255, 152, 0, 0.3)',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    letterSpacing: '0.5px'
                  }}
                >
                  SL
                </div>

                {/* Projected Loss */}
                <div
                  style={{
                    padding: '0 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#f23645',
                    display: 'flex',
                    alignItems: 'center',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {formatPnL(
                    calculateProjectedPnL(position.side, position.entryPrice, effectiveSLPrice, position.amount),
                    currency
                  )}
                </div>

                {/* Cancel SL Button [ ✕ ] */}
                <button
                  type="button"
                  title="Remove Stop Loss"
                  onClick={(e) => handleCancelSL(e, position)}
                  className="tv-pill-close-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '100%',
                    border: 'none',
                    background: 'transparent',
                    color: slColor,
                    cursor: 'pointer',
                    padding: 0,
                    outline: 'none'
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}

            {/* ─── 3. TAKE PROFIT (TP) BADGE ─── */}
            {effectiveTPY !== null && (
              <div
                className="tv-position-badge tv-tp-badge"
                onMouseDown={(e) => startMoveTP(e, position, effectiveTPY)}
                style={{
                  position: 'absolute',
                  left: `${badgeX + 30}px`,
                  top: `${effectiveTPY}px`,
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  height: '24px',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  border: `1px solid ${tpColor}`,
                  background: '#1e222d',
                  boxShadow: isDraggingThis && (dragState?.type === 'move-tp' || dragState?.type === 'create-tp')
                    ? 'inset 0 0 0 100px rgba(8, 153, 129, 0.22), 0 0 10px rgba(8, 153, 129, 0.5), 0 2px 8px rgba(0,0,0,0.5)'
                    : '0 2px 6px rgba(0,0,0,0.35)',
                  cursor: 'ns-resize',
                  pointerEvents: 'auto',
                  zIndex: 32
                }}
              >
                {/* TP Label */}
                <div
                  style={{
                    padding: '0 8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: tpColor,
                    borderRight: '1px solid rgba(8, 153, 129, 0.3)',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    letterSpacing: '0.5px'
                  }}
                >
                  TP
                </div>

                {/* Projected Profit */}
                <div
                  style={{
                    padding: '0 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#089981',
                    display: 'flex',
                    alignItems: 'center',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {formatPnL(
                    calculateProjectedPnL(position.side, position.entryPrice, effectiveTPPrice, position.amount),
                    currency
                  )}
                </div>

                {/* Cancel TP Button [ ✕ ] */}
                <button
                  type="button"
                  title="Remove Take Profit"
                  onClick={(e) => handleCancelTP(e, position)}
                  className="tv-pill-close-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '100%',
                    border: 'none',
                    background: 'transparent',
                    color: tpColor,
                    cursor: 'pointer',
                    padding: 0,
                    outline: 'none'
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}

            {/* ─── 4. RIGHT Y-AXIS PRICE SCALE TAGS ─── */}
            {/* SL Price Tag */}
            {effectiveSLY !== null && (
              <div
                className="tv-axis-tag tv-axis-tag-sl"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: `${effectiveSLY}px`,
                  transform: 'translateY(-50%)',
                  background: slColor,
                  color: '#131722',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 5px',
                  borderRadius: '2px 0 0 2px',
                  pointerEvents: 'none',
                  zIndex: 35,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
                }}
              >
                {formatPrice(effectiveSLPrice)}
              </div>
            )}

            {/* EP Price Tag */}
            {entryY !== null && (
              <div
                className="tv-axis-tag tv-axis-tag-ep"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: `${entryY}px`,
                  transform: 'translateY(-50%)',
                  background: epColor,
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 5px',
                  borderRadius: '2px 0 0 2px',
                  pointerEvents: 'none',
                  zIndex: 35,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
                }}
              >
                {formatPrice(position.entryPrice)}
              </div>
            )}

            {/* TP Price Tag */}
            {effectiveTPY !== null && (
              <div
                className="tv-axis-tag tv-axis-tag-tp"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: `${effectiveTPY}px`,
                  transform: 'translateY(-50%)',
                  background: tpColor,
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 5px',
                  borderRadius: '2px 0 0 2px',
                  pointerEvents: 'none',
                  zIndex: 35,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
                }}
              >
                {formatPrice(effectiveTPPrice)}
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* ─── 4. TRADE HISTORY CONNECTORS (Between Entry & Exit Executions) ─── */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 20
        }}
      >
        {(() => {
          const tradePairs: Array<{ entry: ChartExecution; exit: ChartExecution }> = [];
          const entries = executions.filter(e => e.type === 'entry' && e.linkedTradeId);
          const exits = executions.filter(e => e.type === 'exit' && e.linkedTradeId);
          exits.forEach(exit => {
            const entry = entries.find(en => en.linkedTradeId === exit.linkedTradeId);
            if (entry) tradePairs.push({ entry, exit });
          });

          return tradePairs.map(({ entry, exit }, idx) => {
            const x1 = timestampToX(entry.timestamp);
            const y1 = priceToY(entry.price);
            const x2 = timestampToX(exit.timestamp);
            const y2 = priceToY(exit.price);
            if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

            const isProfitable = (exit.pnl ?? 0) >= 0;
            const lineColor = isProfitable ? '#089981' : '#f23645';

            return (
              <g key={`trade-line-${idx}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={lineColor}
                  strokeWidth={0.5}
                  strokeDasharray="4 3"
                  opacity="0.8"
                />
              </g>
            );
          });
        })()}
      </svg>


      {/* ─── 5. CANDLE EXECUTION MARKERS ─── */}
      {(() => {
        if (!executions || executions.length === 0) return null;

        const dataList = (chartInstance && typeof chartInstance.getDataList === 'function')
          ? chartInstance.getDataList()
          : [];

        // Helper to find candle for an execution timestamp
        const findCandleForExec = (timestamp: number) => {
          if (!dataList || dataList.length === 0) return null;
          for (let i = dataList.length - 1; i >= 0; i--) {
            const curT = dataList[i].timestamp;
            const nextT = i < dataList.length - 1 ? dataList[i + 1].timestamp : Infinity;
            if (timestamp >= curT && timestamp < nextT) {
              return { candle: dataList[i], index: i };
            }
          }
          if (timestamp >= dataList[dataList.length - 1].timestamp) {
            return { candle: dataList[dataList.length - 1], index: dataList.length - 1 };
          }
          return { candle: dataList[0], index: 0 };
        };

        // Pre-compute pixel coordinates and candle references for each execution
        const execsWithPos = executions.map(exec => {
          const candleInfo = findCandleForExec(exec.timestamp);
          let x = timestampToX(exec.timestamp);
          if (candleInfo && chartInstance && typeof chartInstance.convertToPixel === 'function') {
            try {
              const res = chartInstance.convertToPixel([{ dataIndex: candleInfo.index }], { paneId: 'candle_pane' });
              if (res && res[0] && Number.isFinite(res[0].x)) {
                x = res[0].x;
              }
            } catch (e) {}
          }
          const y = priceToY(exec.price);
          return {
            exec,
            x,
            y,
            candleInfo,
            candle: candleInfo?.candle
          };
        }).filter(item => item.x !== null && item.y !== null);

        // Group by (candleKey + side) to compute vertical stack offsets when multiple trades of same side are on same candle
        const stackCounters = new Map<string, number>();
        const execStackOffsets = new Map<string, number>();

        execsWithPos.forEach(({ exec, x, candleInfo }) => {
          const candleKey = candleInfo ? `c_${candleInfo.index}` : `x_${Math.round((x as number) / 8)}`;
          const groupKey = `${candleKey}_${exec.side}`;
          const currentCount = stackCounters.get(groupKey) ?? 0;
          execStackOffsets.set(exec.id, currentCount);
          stackCounters.set(groupKey, currentCount + 1);
        });

        const STACK_STEP = 5; // 5px offset: next arrow head sits slightly offset on existing arrow like stacked chevrons

        return execsWithPos.map(({ exec, x, y, candle, candleInfo }) => {
          const candleKey = candleInfo ? `c_${candleInfo.index}` : `x_${Math.round((x as number) / 8)}`;
          const groupKey = `${candleKey}_${exec.side}`;
          const isBuy = exec.side === 'buy';
          const isExecBuy = isBuy;
          const isExit = exec.type === 'exit';
          const color = isBuy ? '#2962ff' : '#f23645';
          const isHovered = hoveredExecId === exec.id;
          const stackIndex = execStackOffsets.get(exec.id) ?? 0;
          const totalInStack = stackCounters.get(groupKey) ?? 1;

          // Trade Action Title:
          // Long position: Buy to Open (Entry) -> Sell to Close (Exit)
          // Short position (opposite trade): Sell to Open (Entry) -> Buy to Close (Exit)
          const actionTitle = isExit
            ? (isBuy ? 'Buy to Close' : 'Sell to Close')
            : (isBuy ? 'Buy to Open' : 'Sell to Open');

          // Link exit execution to entry execution to show both Open and Close timestamps
          let openTimestamp: number | null = null;
          if (isExit) {
            if (exec.linkedTradeId) {
              const linkedEntry = executions.find(e => e.type === 'entry' && e.linkedTradeId === exec.linkedTradeId);
              if (linkedEntry) {
                openTimestamp = linkedEntry.timestamp;
              }
            }
            if (!openTimestamp) {
              const priorEntries = executions.filter(e => e.type === 'entry' && e.timestamp <= exec.timestamp);
              if (priorEntries.length > 0) {
                openTimestamp = priorEntries[priorEntries.length - 1].timestamp;
              } else {
                openTimestamp = exec.timestamp;
              }
            }
          } else {
            openTimestamp = exec.timestamp;
          }

          const closeTimestamp = isExit ? exec.timestamp : null;
          const durationSec = (isExit && openTimestamp && closeTimestamp)
            ? Math.max(0, Math.floor((closeTimestamp - openTimestamp) / 1000))
            : null;
          const durationStr = durationSec !== null
            ? (durationSec < 60 ? `${durationSec}s`
              : durationSec < 3600 ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
              : `${Math.floor(durationSec / 3600)}h ${Math.floor((durationSec % 3600) / 60)}m`)
            : null;

          const nativeTitle = isExit
            ? `${actionTitle}\nFilled: ${exec.amount} @ ${formatPrice(exec.price)}${exec.pnl !== undefined ? `\nPnL: ${(exec.pnl >= 0 ? '+' : '') + exec.pnl.toFixed(2)} USD` : ''}\nOpened: ${formatTimestamp(openTimestamp)}\nClosed: ${formatTimestamp(closeTimestamp)}${durationStr ? `\nDuration: ${durationStr}` : ''}`
            : `${actionTitle}\nFilled: ${exec.amount} @ ${formatPrice(exec.price)}\nOpened: ${formatTimestamp(openTimestamp)}`;

          let candleHighY: number | null = null;
          let candleLowY: number | null = null;
          if (candle) {
            if (candle.low !== undefined) candleLowY = priceToY(candle.low);
            if (candle.high !== undefined) candleHighY = priceToY(candle.high);
          }

          // Buy show on candle down (bottom pointing UP); Sell show on candle upside (top pointing DOWN)
          const baseArrowTop = isBuy
            ? (candleLowY !== null ? Math.max(y as number, candleLowY) : (y as number)) + 4
            : (candleHighY !== null ? Math.min(y as number, candleHighY) : (y as number)) - 4;

          // When stacked at candle down (Buy): next arrow head is slightly lower (baseArrowTop + stackIndex * STACK_STEP)
          // When stacked at candle upside (Sell): next arrow head is slightly higher (baseArrowTop - stackIndex * STACK_STEP)
          const arrowTop = isBuy
            ? baseArrowTop + stackIndex * STACK_STEP
            : baseArrowTop - stackIndex * STACK_STEP;

          return (
            <div
              key={`exec-${exec.id}`}
              className={`tv-execution-marker tv-exec-${exec.side} tv-exec-type-${isExit ? 'exit' : 'entry'}`}
              onMouseEnter={() => setHoveredExecId(exec.id)}
              onMouseLeave={() => setHoveredExecId(null)}
              title={nativeTitle}
              style={{
                position: 'absolute',
                left: `${x}px`,
                top: `${arrowTop}px`,
                transform: isBuy ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                pointerEvents: 'auto',
                zIndex: isHovered ? 100 : 25 + stackIndex
              }}
            >
              {/* Directional Arrow with Smooth Rounded Corners (Borderless, Compact Head) */}
              <div
                className={`tv-exec-arrow tv-exec-arrow-${exec.side}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '14px',
                  height: '16px',
                  cursor: 'pointer',
                  transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), filter 0.15s ease',
                  transform: isHovered ? 'scale(1.25)' : 'scale(1)',
                  filter: isHovered
                    ? `drop-shadow(0 0 6px ${color}) drop-shadow(0 2px 6px rgba(0,0,0,0.9))`
                    : 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))'
                }}
              >
                {isBuy ? (
                  // Upward pointing sleek arrow with compact head and smooth corners (no outline) - on candle down
                  <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                    <path
                      d="M 6.3 2.2 C 6.6 1.6, 7.4 1.6, 7.7 2.2 L 11.2 6.6 C 11.7 7.2, 11.3 7.8, 10.5 7.8 L 8.6 7.8 Q 8.2 7.8, 8.2 8.3 L 8.2 14.2 C 8.2 14.8, 7.7 15.2, 7.0 15.2 C 6.3 15.2, 5.8 14.8, 5.8 14.2 L 5.8 8.3 Q 5.8 7.8, 5.4 7.8 L 3.5 7.8 C 2.7 7.8, 2.3 7.2, 2.8 6.6 Z"
                      fill={color}
                    />
                  </svg>
                ) : (
                  // Downward pointing sleek arrow with compact head and smooth corners (no outline) - on candle upside
                  <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                    <path
                      d="M 6.3 13.8 C 6.6 14.4, 7.4 14.4, 7.7 13.8 L 11.2 9.4 C 11.7 8.8, 11.3 8.2, 10.5 8.2 L 8.6 8.2 Q 8.2 8.2, 8.2 7.7 L 8.2 1.8 C 8.2 1.2, 7.7 0.8, 7.0 0.8 C 6.3 0.8, 5.8 1.2, 5.8 1.8 L 5.8 7.7 Q 5.8 8.2, 5.4 8.2 L 3.5 8.2 C 2.7 8.2, 2.3 8.8, 2.8 9.4 Z"
                      fill={color}
                    />
                  </svg>
                )}
              </div>

              {/* Order Details Tooltip: Simple & Elegant Open and Close Box */}
              {isHovered && (
                <div
                  className="tv-execution-tooltip"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    [isBuy ? 'top' : 'bottom']: `${22 + (totalInStack - 1 - stackIndex) * STACK_STEP}px`,
                    backgroundColor: 'rgba(20, 24, 35, 0.96)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    minWidth: '225px',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.75), 0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    zIndex: 100,
                    pointerEvents: 'none',
                    animation: 'tvTooltipFade 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif"
                  }}
                >
                  {/* Top Row: Action Tag & Realized PnL */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: isBuy ? 'rgba(41, 98, 255, 0.16)' : 'rgba(242, 54, 69, 0.16)',
                        border: `1px solid ${isBuy ? 'rgba(41, 98, 255, 0.35)' : 'rgba(242, 54, 69, 0.35)'}`,
                        color: isBuy ? '#3880ff' : '#f7525f',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.4px',
                        textTransform: 'uppercase'
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: isBuy ? '#3880ff' : '#f7525f'
                        }}
                      />
                      {actionTitle}
                    </div>

                    {isExit && exec.pnl !== undefined && (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '3px 7px',
                          borderRadius: '4px',
                          backgroundColor: exec.pnl >= 0 ? 'rgba(8, 153, 129, 0.16)' : 'rgba(242, 54, 69, 0.16)',
                          border: `1px solid ${exec.pnl >= 0 ? 'rgba(8, 153, 129, 0.35)' : 'rgba(242, 54, 69, 0.35)'}`,
                          color: exec.pnl >= 0 ? '#089981' : '#f23645',
                          fontSize: '11px',
                          fontWeight: 700,
                          letterSpacing: '0.2px'
                        }}
                      >
                        {exec.pnl >= 0 ? '+' : ''}{exec.pnl.toFixed(2)} USD
                      </div>
                    )}
                  </div>

                  {/* Middle Row: Clean Metrics Bar (Amount & Exec Price) */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '5px',
                      padding: '6px 10px'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: '#787b86', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Amount
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#f0f3fa', marginTop: '1px' }}>
                        {exec.amount}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: '#787b86', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Exec Price
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#f0f3fa', marginTop: '1px', fontFamily: 'monospace' }}>
                        {formatPrice(exec.price)}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Simple & Elegant Open / Close Timeline */}
                  {isExit ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '10.5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#089981', fontSize: '9px' }}>○</span>
                          <span style={{ color: '#868993', fontWeight: 500 }}>Opened:</span>
                        </div>
                        <span style={{ color: '#d1d4dc', fontWeight: 500, fontFamily: 'monospace' }}>
                          {formatTimestamp(openTimestamp)}
                        </span>
                      </div>

                      <div style={{ marginLeft: '3px', width: '1px', height: '6px', background: 'rgba(255, 255, 255, 0.15)' }} />

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '10.5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: color, fontSize: '9px' }}>●</span>
                          <span style={{ color: '#868993', fontWeight: 500 }}>Closed:</span>
                        </div>
                        <span style={{ color: '#d1d4dc', fontWeight: 500, fontFamily: 'monospace' }}>
                          {formatTimestamp(closeTimestamp)}
                        </span>
                      </div>

                      {durationStr && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: '2px' }}>
                          <span
                            style={{
                              fontSize: '9.5px',
                              color: '#868993',
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              padding: '1px 6px',
                              borderRadius: '3px',
                              letterSpacing: '0.3px'
                            }}
                          >
                            Duration: <strong style={{ color: '#f0f3fa', fontWeight: 600 }}>{durationStr}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '10.5px', paddingTop: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: color, fontSize: '9px' }}>●</span>
                        <span style={{ color: '#868993', fontWeight: 500 }}>Opened:</span>
                      </div>
                      <span style={{ color: '#d1d4dc', fontWeight: 500, fontFamily: 'monospace' }}>
                        {formatTimestamp(openTimestamp)}
                      </span>
                    </div>
                  )}

                  {/* Tooltip triangle caret */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      [isBuy ? 'bottom' : 'top']: '100%',
                      width: 0,
                      height: 0,
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      [isBuy ? 'borderBottom' : 'borderTop']: '5px solid rgba(20, 24, 35, 0.96)'
                    }}
                  />
                </div>
              )}
            </div>
          );
        });
      })()}
    </div>
  );
};

export default TradingPositionOverlay;
