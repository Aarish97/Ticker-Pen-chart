import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import TickerPenProWidget from './components/TickerPenProWidget';
import SideToolPanel from './components/SideToolPanel';
import ChartSettingsModal from './components/ChartSettingsModal';
import MarketConnectionModal from './components/MarketConnectionModal';
import { marketDatafeedManager } from './datafeed/MarketDatafeedManager';
import type {
  TradingChartProps,
  TradingChartApi,
  CandleData,
  ChartPosition
} from './types/chart';
import { applyChromeTheme, getSavedChromeThemeMode } from './utils/themeManager';

export const TradingChart = forwardRef<TradingChartApi, TradingChartProps>((props, ref) => {
  const {
    symbol = 'BTCUSDT',
    period = '15m',
    theme = 'dark',
    layout: initialLayout = '1',
    symbols: propSymbols,
    datafeed,
    staticData,
    orders,
    positions,
    executions,
    chartType,
    indicators,
    headerVisible = true,
    drawingBarVisible = true,
    settingsModalEnabled = true,
    marketModalEnabled = true,
    marketConnection,
    onMarketConnectionChange,
    webhookConfig,
    onWebhook,
    onSymbolChange,
    onPeriodChange,
    onLayoutChange,
    onDataLoaded,
    onCandleTick,
    onOrderPlace,
    onOrderModify,
    onOrderCancel,
    onPositionClose,
    onPositionReverse,
    onModifyTP,
    onModifySL,
    styles: propStyles,
    containerStyle,
    className
  } = props;

  const [currentLayout, setCurrentLayout] = useState<string>(initialLayout);
  const [activeChartIdx, setActiveChartIdx] = useState<number>(0);
  const [drawingSidebarOpen, setDrawingSidebarOpen] = useState<boolean>(true);
  const [showMarketModal, setShowMarketModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // Sync external layout prop changes
  useEffect(() => {
    if (initialLayout && initialLayout !== currentLayout) {
      setCurrentLayout(initialLayout);
    }
  }, [initialLayout]);

  // Position and execution state
  const [positionsState, setPositionsState] = useState<ChartPosition[]>(positions || []);
  const [executionsState, setExecutionsState] = useState<any[]>(executions || []);

  useEffect(() => {
    if (positions) setPositionsState(positions);
  }, [positions]);

  useEffect(() => {
    if (executions) setExecutionsState(executions);
  }, [executions]);

  const activePositions = positions !== undefined ? positions : positionsState;
  const activeExecutions = executions !== undefined ? executions : executionsState;

  const handlePositionCloseInternal = (positionId: string, exitPriceParamOrPos?: any) => {
    const exitPriceParam = typeof exitPriceParamOrPos === 'number' ? exitPriceParamOrPos : undefined;
    const pos = activePositions.find(p => p.id === positionId);
    if (!pos) return;
    const chart = (window as any).__active_chart_instance__;
    const data = chart?.getDataList?.();
    const lastCandle = data?.[data.length - 1];
    const exitPrice = exitPriceParam !== undefined ? exitPriceParam : (lastCandle?.close || pos.entryPrice);
    const exitTimestamp = lastCandle?.timestamp || Date.now();
    const isShort = pos.side === 'short';
    const exitSide: 'buy' | 'sell' = isShort ? 'buy' : 'sell';
    const qty = Math.abs(typeof pos.amount === 'number' ? pos.amount : parseFloat(pos.amount as string) || 1);
    const pnlDiff = isShort ? (pos.entryPrice - exitPrice) : (exitPrice - pos.entryPrice);
    const realizedPnL = pnlDiff * qty;
    const pnlSign = realizedPnL >= 0 ? '+' : '';

    const exitExec: any = {
      id: `exec-exit-${Date.now()}`,
      timestamp: exitTimestamp,
      price: exitPrice,
      amount: qty,
      side: exitSide,
      type: 'exit',
      linkedTradeId: pos.id,
      pnl: realizedPnL,
      label: `${exitSide === 'buy' ? 'Buy to Close' : 'Sell to Close'} ${qty} @ ${exitPrice.toFixed(2)} (PnL: ${pnlSign}${realizedPnL.toFixed(2)} USD)`
    };

    setPositionsState(prev => prev.filter(p => p.id !== positionId));
    setExecutionsState(prev => [...prev, exitExec]);
    if (onPositionClose) onPositionClose(positionId, pos);
  };

  const handlePositionReverseInternal = (position: ChartPosition) => {
    const chart = (window as any).__active_chart_instance__;
    const data = chart?.getDataList?.();
    const lastCandle = data?.[data.length - 1];
    const newSide = position.side === 'short' ? 'long' : 'short';
    const rawAmt = typeof position.amount === 'number' ? position.amount : parseFloat(position.amount as string) || 1;
    const newAmount = newSide === 'short' ? -Math.abs(rawAmt) : Math.abs(rawAmt);
    const livePrice = lastCandle?.close || position.entryPrice;
    const liveTimestamp = lastCandle?.timestamp || Date.now();
    const newPosId = `pos-${Date.now()}`;

    const closeSide: 'buy' | 'sell' = position.side === 'short' ? 'buy' : 'sell';
    const diff = position.side === 'long' ? (livePrice - position.entryPrice) : (position.entryPrice - livePrice);
    const realizedPnL = diff * Math.abs(rawAmt);
    const pnlSign = realizedPnL >= 0 ? '+' : '';
    const exitExec: any = {
      id: `exec-exit-${Date.now()}`,
      timestamp: liveTimestamp,
      price: livePrice,
      amount: Math.abs(rawAmt),
      side: closeSide,
      type: 'exit',
      linkedTradeId: position.id,
      pnl: realizedPnL,
      label: `${closeSide === 'buy' ? 'Buy to Close' : 'Sell to Close'} ${Math.abs(rawAmt)} @ ${livePrice.toFixed(2)} (${pnlSign}${realizedPnL.toFixed(2)} USD)`
    };

    const newExec: any = {
      id: `exec-entry-${Date.now() + 1}`,
      timestamp: liveTimestamp,
      price: livePrice,
      amount: Math.abs(newAmount),
      side: newSide === 'long' ? 'buy' : 'sell',
      type: 'entry',
      linkedTradeId: newPosId,
      label: `${newSide === 'long' ? 'Buy to Open' : 'Sell to Open'} ${Math.abs(newAmount)} @ ${livePrice.toFixed(2)}`
    };

    setPositionsState(prev => prev.map(p => {
      if (p.id !== position.id) return p;
      return {
        ...p,
        id: newPosId,
        entryPrice: livePrice,
        side: newSide,
        amount: newAmount,
        pnl: 0,
        takeProfit: undefined,
        stopLoss: undefined
      };
    }));
    setExecutionsState(prev => [...prev, exitExec, newExec]);
    if (onPositionReverse) onPositionReverse(position);
  };

  const handleModifyTPInternal = (tpPrice: number | undefined, position: ChartPosition) => {
    setPositionsState(prev => prev.map(p => {
      if (p.id !== position.id) return p;
      return { ...p, takeProfit: tpPrice };
    }));
    if (onModifyTP) onModifyTP(tpPrice, position);
  };

  const handleModifySLInternal = (slPrice: number | undefined, position: ChartPosition) => {
    setPositionsState(prev => prev.map(p => {
      if (p.id !== position.id) return p;
      return { ...p, stopLoss: slPrice };
    }));
    if (onModifySL) onModifySL(slPrice, position);
  };

  // Expose window.tradingPositionApi
  useEffect(() => {
    (window as any).tradingPositionApi = {
      getPositions: () => activePositions,
      getExecutions: () => activeExecutions,
      setPositions: (newPos: any) => setPositionsState(newPos),
      setExecutions: (newExec: any) => setExecutionsState(newExec),
      openPosition: (params: any) => {
        const chart = (window as any).__active_chart_instance__;
        const data = chart?.getDataList?.();
        const lastCandle = data?.[data.length - 1];
        const price = params.entryPrice ?? lastCandle?.close ?? 65000;
        const timestamp = lastCandle?.timestamp ?? Date.now();
        const posId = params.id ?? `pos-${Date.now()}`;
        const isLong = params.side === 'long';
        const signedAmount = isLong ? Math.abs(params.amount) : -Math.abs(params.amount);
        const execSide: 'buy' | 'sell' = isLong ? 'buy' : 'sell';

        const newPosition: ChartPosition = {
          id: posId,
          entryPrice: price,
          amount: signedAmount,
          side: params.side,
          currency: params.currency ?? 'USD',
          takeProfit: params.takeProfit,
          stopLoss: params.stopLoss,
          color: params.color
        };

        const newExec: any = {
          id: `exec-entry-${Date.now()}`,
          timestamp,
          price,
          amount: Math.abs(params.amount),
          side: execSide,
          type: 'entry',
          linkedTradeId: posId,
          label: `${execSide === 'buy' ? 'Buy to Open' : 'Sell to Open'} ${Math.abs(params.amount)} @ ${price.toFixed(2)}`
        };

        setPositionsState(prev => [...prev.filter(p => p.id !== posId), newPosition]);
        setExecutionsState(prev => [...prev, newExec]);
        return newPosition;
      },
      closePosition: (posId: string, exitPrice?: number) => handlePositionCloseInternal(posId, exitPrice),
      reversePosition: (posId: string) => {
        const p = activePositions.find(pos => pos.id === posId);
        if (p) handlePositionReverseInternal(p);
      },
      modifyTP: (posId: string, tp: number | undefined) => {
        const p = activePositions.find(pos => pos.id === posId);
        if (p) handleModifyTPInternal(tp, p);
      },
      modifySL: (posId: string, sl: number | undefined) => {
        const p = activePositions.find(pos => pos.id === posId);
        if (p) handleModifySLInternal(sl, p);
      },
      clearAll: () => {
        setPositionsState([]);
        setExecutionsState([]);
      }
    };

    const handleOpenEvent = (e: any) => {
      if (e.detail) (window as any).tradingPositionApi.openPosition(e.detail);
    };
    const handleCloseEvent = (e: any) => {
      if (e.detail?.positionId) (window as any).tradingPositionApi.closePosition(e.detail.positionId, e.detail.price);
    };
    const handleSetPositionsEvent = (e: any) => {
      if (Array.isArray(e.detail)) setPositionsState(e.detail);
    };
    const handleSetExecutionsEvent = (e: any) => {
      if (Array.isArray(e.detail)) setExecutionsState(e.detail);
    };

    window.addEventListener('trading:open-position', handleOpenEvent);
    window.addEventListener('trading:close-position', handleCloseEvent);
    window.addEventListener('trading:set-positions', handleSetPositionsEvent);
    window.addEventListener('trading:set-executions', handleSetExecutionsEvent);

    return () => {
      window.removeEventListener('trading:open-position', handleOpenEvent);
      window.removeEventListener('trading:close-position', handleCloseEvent);
      window.removeEventListener('trading:set-positions', handleSetPositionsEvent);
      window.removeEventListener('trading:set-executions', handleSetExecutionsEvent);
    };
  }, [activePositions, activeExecutions]);

  // Default symbols pool for multi-chart layouts ensuring each cell has a unique ticker
  const DEFAULT_LAYOUT_SYMBOLS = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT',
    'ADAUSDT', 'XRPUSDT', 'DOGEUSDT', 'DOTUSDT',
    'AVAXUSDT', 'LINKUSDT', 'SHIBUSDT', 'PEPEUSDT'
  ];

  // Initialize symbols list for multi-chart layout (ensures at least 12 symbols available)
  const [symbolsList, setSymbolsList] = useState<string[]>(() => {
    const list = propSymbols && propSymbols.length > 0 ? [...propSymbols] : [symbol];
    for (const sym of DEFAULT_LAYOUT_SYMBOLS) {
      if (list.length >= 12) break;
      if (!list.includes(sym)) {
        list.push(sym);
      }
    }
    while (list.length < 12) {
      list.push(`TICKER${list.length + 1}`);
    }
    if (symbol && list[0] !== symbol) {
      list[0] = symbol;
    }
    return list;
  });

  // Keep first symbol in sync with prop symbol
  useEffect(() => {
    if (symbol) {
      setSymbolsList(prev => {
        if (prev[0] === symbol) return prev;
        const next = [...prev];
        next[0] = symbol;
        return next;
      });
    }
  }, [symbol]);

  // Keep symbols list in sync if propSymbols changes
  useEffect(() => {
    if (propSymbols && propSymbols.length > 0) {
      setSymbolsList(prev => {
        const next = [...propSymbols];
        for (const sym of DEFAULT_LAYOUT_SYMBOLS) {
          if (next.length >= 12) break;
          if (!next.includes(sym)) next.push(sym);
        }
        return next;
      });
    }
  }, [propSymbols]);

  // Load custom settings styles from localStorage or fallback
  const [chartStyles, setChartStyles] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('__custom_settings_styles__');
      const base = saved ? JSON.parse(saved) : {};
      return { ...base, ...propStyles };
    } catch (e) {
      return { ...propStyles };
    }
  });

  // Listen for storage or custom events when styles change
  useEffect(() => {
    const handleStylesChange = (e: any) => {
      if (e.detail) {
        setChartStyles((prev: any) => ({ ...prev, ...e.detail }));
      }
    };
    window.addEventListener('chart-styles-changed', handleStylesChange);
    return () => window.removeEventListener('chart-styles-changed', handleStylesChange);
  }, []);

  // Listen for open settings event from topbar / shortcut
  useEffect(() => {
    const handleOpenSettings = () => setShowSettingsModal(true);
    window.addEventListener('open-custom-settings', handleOpenSettings);
    return () => window.removeEventListener('open-custom-settings', handleOpenSettings);
  }, []);

  // Sync incoming marketConnection prop
  useEffect(() => {
    if (marketConnection) {
      if (marketConnection.mode) {
        marketDatafeedManager.setMode(marketConnection.mode);
      }
      if (marketConnection.separate) {
        Object.entries(marketConnection.separate).forEach(([m, cfg]) => {
          marketDatafeedManager.setMarketConfig(m as any, cfg);
        });
      }
      if (marketConnection.unified) {
        marketDatafeedManager.setUnifiedConfig(marketConnection.unified);
      }
    }
  }, [marketConnection]);

  // Subscribe to market connection changes
  useEffect(() => {
    const unsub = marketDatafeedManager.onSettingsChange(settings => {
      if (onMarketConnectionChange) {
        onMarketConnectionChange(settings);
      }
    });
    return unsub;
  }, [onMarketConnectionChange]);

  // Subscribe to market webhook events
  useEffect(() => {
    const unsub = marketDatafeedManager.onWebhook(event => {
      if (onWebhook) {
        onWebhook(event);
      }
    });
    return unsub;
  }, [onWebhook]);

  // Listen for global open-market-connection-modal events
  useEffect(() => {
    const handleOpen = () => setShowMarketModal(true);
    window.addEventListener('open-market-connection-modal', handleOpen);
    return () => window.removeEventListener('open-market-connection-modal', handleOpen);
  }, []);

  // Sync theme
  useEffect(() => {
    if (theme) {
      applyChromeTheme(theme);
    }
  }, [theme]);

  // Trigger resize event when layout changes or sidebar collapses / expands
  useEffect(() => {
    const triggerResize = () => {
      window.dispatchEvent(new Event('resize'));
    };
    triggerResize();
    const frame = requestAnimationFrame(triggerResize);
    const t1 = setTimeout(triggerResize, 60);
    const t2 = setTimeout(triggerResize, 220);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [currentLayout, drawingSidebarOpen]);

  // Helper to determine max charts supported by layout
  const getLayoutMaxCharts = (layKey: string): number => {
    switch (layKey) {
      case '1': return 1;
      case '2v':
      case '2h': return 2;
      case '3v':
      case '3h':
      case '3g':
      case '3g2':
      case '3g3':
      case '3g4': return 3;
      case '4': return 4;
      case '5': return 5;
      case '6': return 6;
      case '7': return 7;
      case '8': return 8;
      case '9': return 9;
      case '10': return 10;
      case '12': return 12;
      default: return 1;
    }
  };

  // Layout switcher handler
  const handleLayoutChange = useCallback((newLayout: string | ((prev: string) => string)) => {
    setCurrentLayout(prevLayout => {
      const val = typeof newLayout === 'function' ? newLayout(prevLayout) : newLayout;
      const maxCharts = getLayoutMaxCharts(val);

      setActiveChartIdx(prevIdx => {
        if (prevIdx >= maxCharts) {
          return 0;
        }
        return prevIdx;
      });

      if (val === '1') {
        setActiveChartIdx(prevIdx => {
          if (prevIdx > 0) {
            setSymbolsList(prevSymbols => {
              const next = [...prevSymbols];
              const sel = next[prevIdx];
              if (sel) next[0] = sel;
              return next;
            });
            try {
              const activePeriodStr = localStorage.getItem(`chart_selected_period_${prevIdx}`);
              if (activePeriodStr) {
                localStorage.setItem('chart_selected_period_0', activePeriodStr);
              }
            } catch (e) {}
          }
          return 0;
        });
      }
      if (onLayoutChange) {
        onLayoutChange(val);
      }
      return val;
    });
  }, [onLayoutChange]);

  // Symbol change per chart index
  const handleSymbolChange = useCallback((idx: number, newSymbol: string) => {
    setSymbolsList(prev => {
      const next = [...prev];
      next[idx] = newSymbol;
      return next;
    });
    if (idx === 0 && onSymbolChange) {
      onSymbolChange(newSymbol);
    }
  }, [onSymbolChange]);

  // Sync orders to chart overlays
  useEffect(() => {
    const chart = (window as any).__active_chart_instance__;
    if (!chart || !orders) return;

    try {
      orders.forEach(order => {
        const overlayId = `order_${order.id}`;
        const isBuy = order.side === 'buy';
        const color = order.color || (isBuy ? '#089981' : '#f23645');
        const labelText = order.label || `${order.side.toUpperCase()} ${order.amount} @ ${order.price}`;

        const existing = chart.getOverlays ? chart.getOverlays({ id: overlayId }) : [];
        if (existing.length === 0) {
          if (typeof chart.createOverlay === 'function') {
            chart.createOverlay({
              id: overlayId,
              name: 'horizontal-ray',
              points: [{ timestamp: 0, value: order.price }],
              styles: {
                line: {
                  color: color,
                  size: 1.5,
                  style: 'dashed'
                }
              },
              extendData: {
                text: labelText,
                orderId: order.id,
                orderData: order
              }
            });
          }
        } else if (typeof chart.overrideOverlay === 'function') {
          chart.overrideOverlay({
            id: overlayId,
            points: [{ timestamp: 0, value: order.price }],
            styles: {
              line: {
                color: color,
                size: 1.5,
                style: 'dashed'
              }
            }
          });
        }
      });
    } catch (e) {
      console.warn('Failed to sync orders overlay:', e);
    }
  }, [orders]);

  // Layout container CSS calculations
  const getLayoutContainerStyle = (lay: string, hasSidebar: boolean): React.CSSProperties => {
    const sidebarWidth = hasSidebar ? 52 : 0;
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      top: '42px',
      left: `${sidebarWidth}px`,
      width: `calc(100% - ${sidebarWidth}px)`,
      height: 'calc(100% - 42px)',
      boxSizing: 'border-box',
      overflow: 'hidden',
      gap: '1px',
      padding: '0px',
    };

    if (lay === '1') return { ...baseStyle, display: 'flex' };
    if (lay === '2v') return { ...baseStyle, display: 'flex', flexDirection: 'row' };
    if (lay === '2h') return { ...baseStyle, display: 'flex', flexDirection: 'column' };
    if (lay === '3v') return { ...baseStyle, display: 'flex', flexDirection: 'row' };
    if (lay === '3h') return { ...baseStyle, display: 'flex', flexDirection: 'column' };
    if (lay === '3g' || lay === '3g4') return { ...baseStyle, display: 'flex', flexDirection: 'row' };
    if (lay === '3g2' || lay === '3g3') return { ...baseStyle, display: 'flex', flexDirection: 'column' };
    if (lay === '4') return { ...baseStyle, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
    if (lay === '5') return { ...baseStyle, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
    if (lay === '6') return { ...baseStyle, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
    if (lay === '7') return { ...baseStyle, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
    if (lay === '8') return { ...baseStyle, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
    if (lay === '9') return { ...baseStyle, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' };
    if (lay === '10') return { ...baseStyle, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
    if (lay === '12') return { ...baseStyle, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' };
    return { ...baseStyle, display: 'flex' };
  };

  const handleSelectChart = (idx: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target && (target.closest('.ticker-pen-pro-drawing-bar') || target.closest('.ticker-pen-pro-period-bar') || target.closest('.custom-tool-popover-menu') || target.closest('.custom-side-tool-panel'))) {
      return;
    }
    setActiveChartIdx(idx);
  };

  const wrapChart = (idx: number, content: React.ReactNode, isFlex = true, extraStyle?: React.CSSProperties) => {
    const isActive = activeChartIdx === idx;
    const hasMultipleCharts = currentLayout !== '1';
    const borderStyle = hasMultipleCharts
      ? (isActive ? '1.5px solid #2979ff' : '1.5px solid #2a2e39')
      : 'none';

    return (
      <div
        key={idx}
        onClick={(e) => handleSelectChart(idx, e)}
        onMouseDown={(e) => handleSelectChart(idx, e)}
        style={{
          position: 'relative',
          flex: isFlex ? 1 : undefined,
          width: '100%',
          height: '100%',
          minWidth: 0,
          minHeight: 0,
          boxSizing: 'border-box',
          border: borderStyle,
          borderRadius: '0px',
          overflow: 'hidden',
          transition: 'border-color 0.15s',
          ...extraStyle
        }}
      >
        {content}
      </div>
    );
  };

  const renderWidget = (i: number, isMain: boolean) => (
    <TickerPenProWidget
      key={`${i}-${symbolsList[i] || ''}`}
      idx={i}
      symbol={symbolsList[i] || DEFAULT_LAYOUT_SYMBOLS[i % DEFAULT_LAYOUT_SYMBOLS.length]}
      onSymbolChange={(newSym) => handleSymbolChange(i, newSym)}
      styles={chartStyles}
      layout={currentLayout}
      onLayoutChange={handleLayoutChange}
      drawingBarVisible={isMain ? drawingBarVisible : false}
      headerVisible={isMain ? headerVisible : false}
      isActive={activeChartIdx === i}
      positions={i === 0 ? activePositions : []}
      executions={i === 0 ? activeExecutions : []}
      onPositionClose={handlePositionCloseInternal}
      onPositionReverse={handlePositionReverseInternal}
      onModifyTP={handleModifyTPInternal}
      onModifySL={handleModifySLInternal}
    />
  );

  const renderCharts = () => {
    const lay = currentLayout;
    if (lay === '1') {
      return wrapChart(0, renderWidget(0, true));
    }
    if (lay === '2v' || lay === '2h') {
      return (
        <>
          {wrapChart(0, renderWidget(0, true))}
          {wrapChart(1, renderWidget(1, false))}
        </>
      );
    }
    if (lay === '3v' || lay === '3h') {
      return (
        <>
          {wrapChart(0, renderWidget(0, true))}
          {wrapChart(1, renderWidget(1, false))}
          {wrapChart(2, renderWidget(2, false))}
        </>
      );
    }
    if (lay === '3g') {
      return (
        <>
          {wrapChart(0, renderWidget(0, true))}
          <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, minHeight: 0 }}>
            {wrapChart(1, renderWidget(1, false))}
            {wrapChart(2, renderWidget(2, false))}
          </div>
        </>
      );
    }
    if (lay === '3g2') {
      return (
        <>
          {wrapChart(0, renderWidget(0, true))}
          <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'row', gap: '1px', minWidth: 0, minHeight: 0 }}>
            {wrapChart(1, renderWidget(1, false))}
            {wrapChart(2, renderWidget(2, false))}
          </div>
        </>
      );
    }
    if (lay === '3g3') {
      return (
        <>
          <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'row', gap: '1px', minWidth: 0, minHeight: 0 }}>
            {wrapChart(1, renderWidget(1, false))}
            {wrapChart(2, renderWidget(2, false))}
          </div>
          {wrapChart(0, renderWidget(0, true))}
        </>
      );
    }
    if (lay === '3g4') {
      return (
        <>
          <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, minHeight: 0 }}>
            {wrapChart(1, renderWidget(1, false))}
            {wrapChart(2, renderWidget(2, false))}
          </div>
          {wrapChart(0, renderWidget(0, true))}
        </>
      );
    }
    if (lay === '4') {
      return (
        <>
          {Array.from({ length: 4 }, (_, i) => wrapChart(i, renderWidget(i, i === 0), false))}
        </>
      );
    }
    if (lay === '5') {
      return (
        <>
          {wrapChart(0, renderWidget(0, true), false, { gridColumn: 'span 3' })}
          {wrapChart(1, renderWidget(1, false), false, { gridColumn: 'span 3' })}
          {wrapChart(2, renderWidget(2, false), false, { gridColumn: 'span 2' })}
          {wrapChart(3, renderWidget(3, false), false, { gridColumn: 'span 2' })}
          {wrapChart(4, renderWidget(4, false), false, { gridColumn: 'span 2' })}
        </>
      );
    }
    if (lay === '6') {
      return (
        <>
          {Array.from({ length: 6 }, (_, i) => wrapChart(i, renderWidget(i, i === 0), false))}
        </>
      );
    }
    if (lay === '7') {
      return (
        <>
          {wrapChart(0, renderWidget(0, true), false, { gridColumn: 'span 4' })}
          {wrapChart(1, renderWidget(1, false), false, { gridColumn: 'span 4' })}
          {wrapChart(2, renderWidget(2, false), false, { gridColumn: 'span 4' })}
          {wrapChart(3, renderWidget(3, false), false, { gridColumn: 'span 3' })}
          {wrapChart(4, renderWidget(4, false), false, { gridColumn: 'span 3' })}
          {wrapChart(5, renderWidget(5, false), false, { gridColumn: 'span 3' })}
          {wrapChart(6, renderWidget(6, false), false, { gridColumn: 'span 3' })}
        </>
      );
    }
    if (lay === '8') {
      return (
        <>
          {Array.from({ length: 8 }, (_, i) => wrapChart(i, renderWidget(i, i === 0), false))}
        </>
      );
    }
    if (lay === '9') {
      return (
        <>
          {Array.from({ length: 9 }, (_, i) => wrapChart(i, renderWidget(i, i === 0), false))}
        </>
      );
    }
    if (lay === '10') {
      return (
        <>
          {Array.from({ length: 10 }, (_, i) => wrapChart(i, renderWidget(i, i === 0), false))}
        </>
      );
    }
    if (lay === '12') {
      return (
        <>
          {Array.from({ length: 12 }, (_, i) => wrapChart(i, renderWidget(i, i === 0), false))}
        </>
      );
    }
    return wrapChart(0, renderWidget(0, true));
  };

  // Expose Imperative API
  useImperativeHandle(ref, () => ({
    setSymbol: (newSymbol: string) => {
      const chart = (window as any).__active_chart_instance__;
      if (chart && typeof chart.setSymbol === 'function') {
        chart.setSymbol({ ticker: newSymbol });
      }
      handleSymbolChange(activeChartIdx, newSymbol);
    },
    setPeriod: (newPeriod: string | any) => {
      const chart = (window as any).__active_chart_instance__;
      if (chart && typeof chart.setPeriod === 'function') {
        const periodObj = typeof newPeriod === 'string'
          ? { text: newPeriod, multiplier: parseInt(newPeriod) || 1 }
          : newPeriod;
        chart.setPeriod(periodObj);
      }
      if (onPeriodChange) {
        onPeriodChange(newPeriod);
      }
    },
    setTheme: (newTheme: 'dark' | 'light') => {
      applyChromeTheme(newTheme);
    },
    updateCandle: (candle: CandleData) => {
      const chart = (window as any).__active_chart_instance__;
      if (chart && typeof chart.updateData === 'function') {
        chart.updateData(candle);
      }
    },
    setCandleData: (candles: CandleData[]) => {
      const chart = (window as any).__active_chart_instance__;
      if (chart && typeof chart.applyNewData === 'function') {
        chart.applyNewData(candles);
      }
    },
    addIndicator: (name: string, isStack: boolean = false, options?: any) => {
      const chart = (window as any).__active_chart_instance__;
      if (chart && typeof chart.createIndicator === 'function') {
        chart.createIndicator(name, isStack, options);
      }
    },
    removeIndicator: (nameOrId: string) => {
      const chart = (window as any).__active_chart_instance__;
      if (chart && typeof chart.removeIndicator === 'function') {
        chart.removeIndicator({ name: nameOrId });
      }
    },
    exportDrawings: () => {
      const chart = (window as any).__active_chart_instance__;
      if (chart && typeof chart.getOverlays === 'function') {
        return chart.getOverlays();
      }
      return [];
    },
    importDrawings: (drawings: any[]) => {
      const chart = (window as any).__active_chart_instance__;
      if (chart && Array.isArray(drawings) && typeof chart.createOverlay === 'function') {
        drawings.forEach(d => {
          try {
            chart.createOverlay(d);
          } catch (e) {}
        });
      }
    },
    clearDrawings: () => {
      const chart = (window as any).__active_chart_instance__;
      if (chart && typeof chart.removeOverlay === 'function') {
        try {
          chart.removeOverlay();
        } catch (e) {}
      }
    },
    takeScreenshot: async (): Promise<string> => {
      const chart = (window as any).__active_chart_instance__;
      if (chart && typeof chart.getConvertPictureUrl === 'function') {
        return chart.getConvertPictureUrl(true, 'jpeg', theme === 'dark' ? '#131722' : '#ffffff');
      }
      return '';
    },
    getCoreChart: () => {
      return (window as any).__active_chart_instance__;
    },
    marketConnection: marketDatafeedManager,
    connectMarketFeed: (options: any) => {
      return marketDatafeedManager.connectFeed(options);
    },
    disconnectMarketFeed: (market?: any) => {
      marketDatafeedManager.disconnectFeed(market);
    },
    pushWebhook: (payload: unknown, options?: any) => {
      const mergedOptions = {
        autoPlotSignal: webhookConfig?.autoPlotSignals !== false,
        format: webhookConfig?.format,
        ...options
      };
      return marketDatafeedManager.pushWebhook(payload, mergedOptions);
    },
    pushTick: (tick: any) => {
      marketDatafeedManager.pushTick(tick);
    },
    pushCandles: (candles: any[], sym: string, market?: any) => {
      marketDatafeedManager.pushCandles(candles, sym, market);
    },
    openMarketConnectionModal: () => {
      setShowMarketModal(true);
    },
    openSettingsModal: () => {
      setShowSettingsModal(true);
    },
    toggleDrawingSidebar: (open?: boolean) => {
      setDrawingSidebarOpen(prev => open !== undefined ? open : !prev);
    },
    setLayout: (lay: string) => {
      handleLayoutChange(lay);
    }
  }), [handleSymbolChange, handleLayoutChange, activeChartIdx, onPeriodChange, theme, webhookConfig]);

  const hasSidebar = Boolean(drawingBarVisible && drawingSidebarOpen);

  return (
    <div
      className={`trading-chart-wrapper layout-container ticker-pen-pro ${hasSidebar ? 'custom-sidebar-open' : 'custom-sidebar-collapsed'} ${className || ''}`}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: chartStyles.bgType === 'gradient'
          ? `linear-gradient(to bottom, ${chartStyles.bgColor || '#131722'}, ${chartStyles.bgColor2 || '#1e222d'})`
          : (chartStyles.bgColor || '#131722'),
        ...containerStyle
      }}
    >
      {/* SideToolPanel drawing toolbar */}
      {drawingBarVisible && (
        <SideToolPanel isOpen={drawingSidebarOpen} setIsOpen={setDrawingSidebarOpen} />
      )}

      {/* Border overlay - 4px divider under top bar and beside side panel */}
      {hasSidebar && (
        <div
          style={{
            position: 'absolute',
            top: '38px',
            left: 0,
            width: '48px',
            height: '4px',
            backgroundColor: '#363c4e',
            pointerEvents: 'none',
            zIndex: 100001,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          top: '38px',
          left: hasSidebar ? '48px' : '0px',
          width: hasSidebar ? 'calc(100% - 48px)' : '100%',
          height: 'calc(100% - 38px)',
          borderTop: '4px solid #363c4e',
          borderLeft: hasSidebar ? '4px solid #363c4e' : 'none',
          borderRadius: '0px',
          boxSizing: 'border-box',
          pointerEvents: 'none',
          zIndex: 100001,
        }}
      />

      {/* Grid Inner Container */}
      <div
        className="grid-inner-container"
        style={getLayoutContainerStyle(currentLayout, hasSidebar)}
      >
        {renderCharts()}
      </div>

      {/* Chart Settings Dialog Modal */}
      {settingsModalEnabled !== false && (
        <ChartSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          onApply={(updated) => setChartStyles((prev: any) => ({ ...prev, ...updated }))}
        />
      )}

      {/* Market Connection & Webhook Modal */}
      {marketModalEnabled !== false && (
        <MarketConnectionModal
          isOpen={showMarketModal}
          onClose={() => setShowMarketModal(false)}
          isLight={theme === 'light'}
        />
      )}
    </div>
  );
});

TradingChart.displayName = 'TradingChart';
export default TradingChart;
