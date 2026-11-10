import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { sidebarIcons } from './SidebarIcons';
import {
  Crosshair,
  Slash,
  Grid,
  Square,
  Activity,
  Type,
  Magnet,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Trash2,
  Waves,
  Ruler,
  ZoomIn,
  ZoomOut,
  Star,
  ChevronRight,
  PenTool,
  Smile,
  GripVertical,
  X
} from 'lucide-react';
import { performZoomOutStep, getZoomHistoryCount, checkAndClosePolyline, dispatchOverlaySettings } from '../ticker-pen-adapter-bridge';
import { EmojiStickerPicker } from './EmojiStickerPicker';
import {
  ALL_SHORTCUT_DEFINITIONS,
  getCustomShortcuts,
  matchesShortcut,
  getShortcutForToolKey
} from '../utils/shortcutManager';

/** Returns true when the chrome UI is in light mode */
function isLightChromeTheme(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body.getAttribute('data-chrome-theme') === 'light' || 
         document.documentElement.getAttribute('data-chrome-theme') === 'light';
}

interface SideToolPanelProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

function renderToolSvgIcon(key: string) {
  const Icon = sidebarIcons[key];
  if (Icon && key !== 'dot') {
    return <Icon width={20} height={20} />;
  }
  switch (key) {
    case 'cross':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="4" x2="12" y2="9" />
          <line x1="12" y1="15" x2="12" y2="20" />
          <line x1="4" y1="12" x2="9" y2="12" />
          <line x1="15" y1="12" x2="20" y2="12" />
        </svg>
      );
    case 'dot':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3.5" fill="currentColor" />
        </svg>
      );
    case 'textBox':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="20" height="20" rx="2" strokeWidth="2" style={{ display: key === 'textBox' ? 'block' : 'none' }} />
          <polyline points="6 9 6 6 18 6 18 9" />
          <line x1="12" y1="6" x2="12" y2="18" />
          <line x1="9" y1="18" x2="15" y2="18" />
        </svg>
      );
    default:
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4" cy="18" r="2" fill="currentColor" />
          <circle cx="20" cy="6" r="2" fill="currentColor" />
          <line x1="5.5" y1="16.5" x2="18.5" y2="7.5" />
        </svg>
      );
  }
}

interface GroupSection {
  name?: string;
  items: Array<{ key: string; label: string }>;
}

interface ToolGroup {
  id: string;
  name: string;
  icon: any;
  sections: GroupSection[];
}

const toolGroups: ToolGroup[] = [
  {
    id: 'cursor',
    name: 'Cursor',
    icon: Crosshair,
    sections: [
      {
        items: [
          { key: 'cross', label: 'Cross' },
          { key: 'dot', label: 'Dot' },
          { key: 'arrowCursor', label: 'Arrow' },
          { key: 'demonstration', label: 'Demonstration' }
        ]
      }
    ]
  },
  {
    id: 'lines',
    name: 'Lines & Channels',
    icon: Slash,
    sections: [
      {
        name: 'LINES',
        items: [
          { key: 'trendLine', label: 'Trendline' },
          { key: 'ray', label: 'Ray' },
          { key: 'infoLine', label: 'Info line' },
          { key: 'extendedLine', label: 'Extended line' },
          { key: 'trendAngle', label: 'Trend angle' },
          { key: 'horizontalLine', label: 'Horizontal line' },
          { key: 'horizontalRay', label: 'Horizontal ray' },
          { key: 'verticalLine', label: 'Vertical line' },
          { key: 'crossLine', label: 'Crossline' }
        ]
      },
      {
        name: 'CHANNELS',
        items: [
          { key: 'parallelChannel', label: 'Parallel channel' },
          { key: 'regressionTrend', label: 'Regression trend' },
          { key: 'flatTopBottom', label: 'Flat top/bottom' },
          { key: 'disjointChannel', label: 'Disjoint channel' }
        ]
      },
      {
        name: 'PITCHFORKS',
        items: [
          { key: 'andrews', label: 'Pitchfork' },
          { key: 'schiff', label: 'Schiff pitchfork' },
          { key: 'modifiedSchiff', label: 'Modified Schiff pitchfork' },
          { key: 'inside', label: 'Inside pitchfork' }
        ]
      }
    ]
  },
  {
    id: 'fibonacci',
    name: 'Fibonacci & Gann',
    icon: Grid,
    sections: [
      {
        name: 'FIBONACCI',
        items: [
          { key: 'retracement', label: 'Fib Retracement' },
          { key: 'extension', label: 'Fib Extension' },
          { key: 'channel', label: 'Fib Channel' },
          { key: 'timeZone', label: 'Fib Time Zone' },
          { key: 'speedFan', label: 'Fib Speed Fan' },
          { key: 'timeExtension', label: 'Fib Time Extension' },
          { key: 'circles', label: 'Fib Circles' },
          { key: 'spiral', label: 'Fib Spiral' },
          { key: 'arcs', label: 'Fib Arcs' },
          { key: 'wedge', label: 'Fib Wedge' },
          { key: 'pitchfan', label: 'Pitchfan' }
        ]
      },
      {
        name: 'GANN',
        items: [
          { key: 'box', label: 'Gann Box' },
          { key: 'fan', label: 'Gann Fan' },
          { key: 'square', label: 'Gann Square' }
        ]
      }
    ]
  },
  {
    id: 'waves',
    name: 'Waves & Patterns',
    icon: Waves,
    sections: [
      {
        name: 'ELLIOTT WAVES',
        items: [
          { key: 'elliottImpulseWave', label: 'Elliott Impulse Wave (12345)' },
          { key: 'elliottCorrectionWave', label: 'Elliott Correction Wave (ABC)' },
          { key: 'elliottTriangleWave', label: 'Elliott Triangle Wave (ABCDE)' },
          { key: 'elliottDoubleComboWave', label: 'Elliott Double Combo Wave (WXY)' },
          { key: 'elliottTripleComboWave', label: 'Elliott Triple Combo Wave (WXYXZ)' },
          { key: 'elliottWavePath', label: 'Elliott Wave Path' }
        ]
      }
    ]
  },
  {
    id: 'forecasting',
    name: 'Forecasting & Measurement',
    icon: Activity,
    sections: [
      {
        name: 'FORECASTING',
        items: [
          { key: 'longPosition', label: 'Long Position' },
          { key: 'shortPosition', label: 'Short Position' },
          { key: 'forecast', label: 'Forecast' },
          { key: 'barsPattern', label: 'Bars Pattern' },
          { key: 'projection', label: 'Projection' }
        ]
      },
      {
        name: 'MEASURERS',
        items: [
          { key: 'priceRange', label: 'Price Range' },
          { key: 'dateRange', label: 'Date Range' },
          { key: 'datePriceRange', label: 'Date & Price Range' }
        ]
      }
    ]
  },
  {
    id: 'shapes',
    name: 'Shapes & Freehand',
    icon: Square,
    sections: [
      {
        name: 'SHAPES',
        items: [
          { key: 'rectangle', label: 'Rectangle' },
          { key: 'rotatedRectangle', label: 'Rotated Rectangle' },
          { key: 'circle', label: 'Circle' },
          { key: 'triangle', label: 'Triangle' },
          { key: 'ellipse', label: 'Ellipse' },
          { key: 'arc', label: 'Arc' },
          { key: 'path', label: 'Path' },
          { key: 'polyline', label: 'Polyline' },
          { key: 'curve', label: 'Curve' },
          { key: 'doubleCurve', label: 'Double Curve' }
        ]
      },
      {
        name: 'BRUSHES',
        items: [
          { key: 'brush', label: 'Brush' },
          { key: 'highlighter', label: 'Highlighter' }
        ]
      }
    ]
  },
  {
    id: 'annotations',
    name: 'Text & Annotations',
    icon: Type,
    sections: [
      {
        name: 'ANNOTATIONS',
        items: [
          { key: 'text', label: 'Text' },
          { key: 'anchoredText', label: 'Anchored Text' },
          { key: 'priceNote', label: 'Price Note' },
          { key: 'priceLabel', label: 'Price Label' },
          { key: 'flagMark', label: 'Flag Mark' },
          { key: 'pin', label: 'Pin' },
          { key: 'comment', label: 'Comment' },
          { key: 'signpost', label: 'Signpost' },
          { key: 'table', label: 'Table' }
        ]
      },
      {
        name: 'ARROWS',
        items: [
          { key: 'arrow', label: 'Arrow' },
          { key: 'arrowMarkUp', label: 'Arrow Mark Up' },
          { key: 'arrowMarkDown', label: 'Arrow Mark Down' }
        ]
      }
    ]
  }
];

const toolMapping: Record<string, string> = {
  // Cursor
  'cross': 'cross',
  'dot': 'dot',
  'arrowCursor': 'arrow-cursor',
  'demonstration': 'demonstration',

  // Lines
  'trendLine': 'trend-line',
  'ray': 'ray',
  'infoLine': 'info-line',
  'extendedLine': 'extended-line',
  'trendAngle': 'trend-angle',
  'horizontalLine': 'horizontal-line',
  'horizontalRay': 'horizontal-ray',
  'verticalLine': 'vertical-line',
  'crossLine': 'cross-line',

  // Fibonacci & Gann
  'retracement': 'fib-retracement',
  'extension': 'fib-extension',
  'channel': 'fib-channel',
  'timeZone': 'fib-time-zone',
  'speedFan': 'fib-speed-fan',
  'timeExtension': 'fib-time-extension',
  'circles': 'fib-circles',
  'spiral': 'fib-spiral',
  'arcs': 'fib-arcs',
  'wedge': 'fib-wedge',
  'pitchfan': 'pitchfan',
  'box': 'gann-box',
  'fan': 'gann-fan',
  'square': 'gann-square',

  // Channels
  'parallelChannel': 'parallel-channel',
  'regressionTrend': 'regression-trend',
  'flatTopBottom': 'flat-top-bottom',
  'disjointChannel': 'disjoint-channel',

  // Pitchforks
  'andrews': 'andrews-pitchfork',
  'schiff': 'schiff-pitchfork',
  'modifiedSchiff': 'modified-schiff-pitchfork',
  'inside': 'inside-pitchfork',

  // Forecasting
  'longPosition': 'long-position',
  'shortPosition': 'short-position',
  'forecast': 'forecast',
  'barsPattern': 'bars-pattern',
  'projection': 'projection',
  'priceRange': 'price-range',
  'dateRange': 'date-range',
  'datePriceRange': 'date-price-range',
  'measure': 'measure',

  // Shapes
  'rectangle': 'rectangle',
  'rotatedRectangle': 'rotated-rectangle',
  'circle': 'circle',
  'triangle': 'triangle',
  'ellipse': 'ellipse',
  'arc': 'arc',
  'path': 'path',
  'polyline': 'polyline',
  'curve': 'curve',
  'doubleCurve': 'double-curve',

  // Annotations
  'text': 'text-annotation',
  'textBox': 'text-box',
  'anchoredText': 'anchored-text',
  'priceNote': 'price-note',
  'priceLabel': 'price-label',
  'flagMark': 'flag-mark',
  'pin': 'pin',
  'comment': 'comment',
  'signpost': 'signpost',
  'table': 'table',
  'brush': 'brush',
  'highlighter': 'highlighter',
  'arrow': 'arrow',
  'arrowMarkUp': 'arrow-mark-up',
  'arrowMarkDown': 'arrow-mark-down',

  // Elliott Waves
  'elliottImpulseWave': 'elliott-impulse-wave',
  'elliottCorrectionWave': 'elliott-correction-wave',
  'elliottTriangleWave': 'elliott-triangle-wave',
  'elliottTripleComboWave': 'elliott-triple-combo-wave',
  'elliottDoubleComboWave': 'elliott-double-combo-wave',
  'elliottWavePath': 'elliott-wave-path',
  'emoji': 'emoji'
};

export default function SideToolPanel({ isOpen: _isOpen, setIsOpen: _setIsOpen }: SideToolPanelProps) {
  const [activeTool, setActiveTool] = useState<string | null>('cross');
  const [activePopover, setActivePopover] = useState<string | null>(null);
  
  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent('tickerpen-tool-change', { detail: { tool: activeTool } }));
  }, [activeTool]);

  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number; maxHeight: number }>({
    top: 45,
    left: 49,
    maxHeight: 450
  });
  const activeAnchorElRef = useRef<HTMLElement | null>(null);
  const [selectedTools, setSelectedTools] = useState<Record<string, string>>({
    cursor: 'cross',
    lines: 'trendLine',
    fibonacci: 'retracement',
    shapes: 'rectangle',
    annotations: 'text',
    waves: 'elliottImpulseWave',
    forecasting: 'longPosition'
  });
  const [favorites, setFavorites] = useState<Record<string, boolean>>({
    trendLine: true,
    horizontalLine: true,
    horizontalRay: true
  });
  const [magnetMode, setMagnetMode] = useState<'normal' | 'weak_magnet' | 'strong_magnet'>('normal');
  const [lastMagnetMode, setLastMagnetMode] = useState<'weak_magnet' | 'strong_magnet'>('weak_magnet');
  const [isStayInDrawingMode, setIsStayInDrawingMode] = useState<boolean>(false);
  const [isLockAll, setIsLockAll] = useState<boolean>(false);
  const [visibilityState, setVisibilityState] = useState<'show_all' | 'hide_drawings' | 'hide_indicators' | 'hide_all'>('show_all');
  const [zoomCount, setZoomCount] = useState<number>(0);
  const [hoveredButtonKey, setHoveredButtonKey] = useState<string | null>(null);
  const [customShortcuts, setCustomShortcuts] = useState<Record<string, string>>(() => getCustomShortcuts());

  useEffect(() => {
    const handleShortcutsUpdate = (e: any) => {
      setCustomShortcuts(e.detail || getCustomShortcuts());
    };
    window.addEventListener('custom-shortcuts-updated', handleShortcutsUpdate);
    return () => window.removeEventListener('custom-shortcuts-updated', handleShortcutsUpdate);
  }, []);

  const [chromeTheme, setChromeTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return (document.body.getAttribute('data-chrome-theme') === 'light' ||
              document.documentElement.getAttribute('data-chrome-theme') === 'light') ? 'light' : 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const handleThemeChange = (e: any) => {
      setChromeTheme(e.detail?.effective === 'light' ? 'light' : 'dark');
    };
    window.addEventListener('chrome-theme-changed', handleThemeChange);

    const checkTheme = () => {
      const isLightMode = document.body.getAttribute('data-chrome-theme') === 'light' || 
                          document.documentElement.getAttribute('data-chrome-theme') === 'light';
      setChromeTheme(isLightMode ? 'light' : 'dark');
    };

    const observer = new MutationObserver(checkTheme);
    if (typeof document !== 'undefined') {
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-chrome-theme', 'class'] });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-chrome-theme', 'class'] });
    }

    return () => {
      window.removeEventListener('chrome-theme-changed', handleThemeChange);
      observer.disconnect();
    };
  }, []);

  const [drawingsCount, setDrawingsCount] = useState<number>(0);
  const [indicatorsCount, setIndicatorsCount] = useState<number>(0);

  const [showFavoritesToolbar, setShowFavoritesToolbar] = useState<boolean>(false);
  const [favoritesPosition, setFavoritesPosition] = useState({ x: 120, y: 150 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const nextX = e.clientX - dragStartRef.current.x;
      const nextY = e.clientY - dragStartRef.current.y;
      
      const boundedX = Math.max(48, Math.min(window.innerWidth - 120, nextX));
      const boundedY = Math.max(42, Math.min(window.innerHeight - 50, nextY));

      setFavoritesPosition({ x: boundedX, y: boundedY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const handleResize = () => {
      setFavoritesPosition(prev => ({
        x: Math.max(48, Math.min(window.innerWidth - 120, prev.x)),
        y: Math.max(42, Math.min(window.innerHeight - 50, prev.y))
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - favoritesPosition.x,
      y: e.clientY - favoritesPosition.y
    };
    e.preventDefault();
  };

  const updateCounts = () => {
    const activeChart = (window as any).__active_chart_instance__;
    if (activeChart) {
      let dCount = 0;
      if (typeof activeChart.getOverlays === 'function') {
        const overlays = activeChart.getOverlays() || [];
        const drawings = overlays.filter((o: any) => 
          o.name !== 'future-time-scale' && 
          o.name !== 'zoomInBox' && 
          o.name !== 'zoom-in-box'
        );
        dCount = drawings.length;
      }
      let iCount = 0;
      if (typeof activeChart.getIndicators === 'function') {
        const indicators = activeChart.getIndicators() || [];
        iCount = indicators.length;
      }
      setDrawingsCount(dCount);
      setIndicatorsCount(iCount);
    }
  };

  useEffect(() => {
    if (activePopover === 'delete') {
      updateCounts();
    }
  }, [activePopover]);

  useEffect(() => {
    (window as any).__isStayInDrawingMode = isStayInDrawingMode;
  }, [isStayInDrawingMode]);

  useEffect(() => {
    // Initial zoom state fetch
    setZoomCount(getZoomHistoryCount());

    const handleZoomHistoryChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setZoomCount(typeof detail === 'number' ? detail : getZoomHistoryCount());
    };

    window.addEventListener('zoom-history-change', handleZoomHistoryChange);
    return () => {
      window.removeEventListener('zoom-history-change', handleZoomHistoryChange);
    };
  }, []);

  const popoverRef = useRef<HTMLDivElement>(null);
  const isStayInDrawingModeRef = useRef(isStayInDrawingMode);
  isStayInDrawingModeRef.current = isStayInDrawingMode;

  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  const selectedCursorRef = useRef(selectedTools.cursor || 'cross');
  selectedCursorRef.current = selectedTools.cursor || 'cross';

  const isShiftHeldMeasureRef = useRef(false);
  const toolBeforeShiftRef = useRef<string>('cross');

  // Automatically revert to cursor tool once drawing completes (unless Stay in Drawing Mode is locked)
  useEffect(() => {
    const handleDrawEnd = () => {
      const currentTool = activeToolRef.current;
      isShiftHeldMeasureRef.current = false;

      if (currentTool === 'brush' || currentTool === 'highlighter') {
        const activeChart = (window as any).__active_chart_instance__;
        if (activeChart) {
          const mappedKey = toolMapping[currentTool] || currentTool;
          setTimeout(() => {
            activeChart.createOverlay({ name: mappedKey });
          }, 50);
        }
        return;
      }

      if (isStayInDrawingModeRef.current) {
        const activeChart = (window as any).__active_chart_instance__;
        if (activeChart && currentTool) {
          const mappedKey = toolMapping[currentTool] || currentTool;
          if (mappedKey && !['cross', 'dot', 'arrowCursor', 'demonstration', 'brush', 'highlighter'].includes(currentTool)) {
            setTimeout(() => {
              activeChart.createOverlay({ name: mappedKey });
            }, 50);
          }
        }
      } else {
        handleSelectTool(selectedCursorRef.current);
      }
    };

    window.addEventListener('tickerpen-draw-end', handleDrawEnd);
    return () => window.removeEventListener('tickerpen-draw-end', handleDrawEnd);
  }, []);

  // Global custom keyboard shortcuts, Shift-hold-to-measure & Esc cancellation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.hasAttribute('contenteditable') ||
        activeEl.classList.contains('custom-shortcut-recorder')
      );
      if (isInput) return;

      // Shift key hold to measure (TradingView standard)
      if (e.key === 'Shift' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (activeToolRef.current !== 'measure') {
          toolBeforeShiftRef.current = activeToolRef.current ?? 'cross';
          isShiftHeldMeasureRef.current = true;
          handleSelectTool('measure');
        }
        return;
      }

      if (e.key === 'Escape') {
        const activeChart = (window as any).__active_chart_instance__;
        let polylineSaved = false;
        if (activeChart && activeChart._chartStore) {
          const info = activeChart._chartStore.getProgressOverlayInfo();
          if (info) {
            const overlay = info.overlay;
            if (overlay && (overlay.name === 'polyline' || overlay.name === 'path') && overlay.isDrawing()) {
              if (overlay.points && overlay.points.length >= 2) {
                checkAndClosePolyline(overlay);
                overlay.forceComplete();
                activeChart._chartStore.progressOverlayComplete();
                if (typeof overlay.onDrawEnd === 'function') {
                  try { overlay.onDrawEnd({ overlay, chart: activeChart }); } catch { }
                }
                polylineSaved = true;
              }
            }
          }
        }
        isShiftHeldMeasureRef.current = false;
        handleSelectTool(selectedCursorRef.current);
        if (activeChart) {
          if (typeof activeChart.removeOverlay === 'function') {
            activeChart.removeOverlay({ name: 'zoomInBox' });
            activeChart.removeOverlay({ name: 'zoom-in-box' });
          }
        }
      }

      // Match against user configured shortcuts
      for (const def of ALL_SHORTCUT_DEFINITIONS) {
        const shortcutStr = customShortcuts[def.id];
        if (shortcutStr && matchesShortcut(e, shortcutStr)) {
          e.preventDefault();
          e.stopPropagation();

          if (def.type === 'tool' && def.toolKey) {
            handleSelectTool(def.toolKey);
            return;
          }

          if (def.type === 'action') {
            switch (def.actionKey) {
              case 'undo':
                window.dispatchEvent(new CustomEvent('trigger-undo'));
                break;
              case 'redo':
                window.dispatchEvent(new CustomEvent('trigger-redo'));
                break;
              case 'deleteSelected':
                window.dispatchEvent(new CustomEvent('trigger-delete-selected'));
                break;
              case 'deleteAllDrawings':
                handleRemoveDrawings();
                break;
              case 'toggleMagnet':
                handleToggleMagnet();
                break;
              case 'toggleStayInDrawingMode':
                setIsStayInDrawingMode(prev => !prev);
                break;
              case 'toggleLockAll':
                handleToggleLockAll();
                break;
              case 'toggleHideDrawings':
                handleSelectVisibility(visibilityState === 'show_all' ? 'hide_drawings' : 'show_all');
                break;
              case 'resetZoom': {
                const activeChart = (window as any).__active_chart_instance__;
                if (activeChart) performZoomOutStep();
                break;
              }
              case 'togglePaperTrade':
                window.dispatchEvent(new CustomEvent('toggle-paper-trade-overlay'));
                break;
            }
            return;
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && isShiftHeldMeasureRef.current) {
        isShiftHeldMeasureRef.current = false;
        const activeChart = (window as any).__active_chart_instance__;
        const info = activeChart?._chartStore?.getProgressOverlayInfo();
        const isCurrentlyDrawing = info?.overlay?.isDrawing ? info.overlay.isDrawing() : false;
        if (!isCurrentlyDrawing) {
          handleSelectTool(toolBeforeShiftRef.current || selectedCursorRef.current || 'cross');
        }
      }
    };

    const handleSelectSideTool = (e: any) => {
      const toolKey = e?.detail?.toolKey;
      if (toolKey) handleSelectTool(toolKey);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('select-side-tool', handleSelectSideTool);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('select-side-tool', handleSelectSideTool);
    };
  }, [customShortcuts, visibilityState, isLockAll, magnetMode]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        const isSidePanelClick = (event.target as HTMLElement)?.closest('.custom-side-tool-panel');
        if (!isSidePanelClick) {
          setActivePopover(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Freehand paint mode for Brush and Highlighter tools
  useEffect(() => {
    const activeChart = (window as any).__active_chart_instance__;
    if (!activeChart) return;

    const container = activeChart.getDom ? activeChart.getDom() : document.querySelector('.ticker-pen-pro');
    if (!container) return;

    const mappedKey = activeTool ? (toolMapping[activeTool] || activeTool) : null;
    const isFreehand = mappedKey === 'brush' || mappedKey === 'highlighter';

    if (!isFreehand) {
      return;
    }

    const originalCursor = container.style.cursor;
    container.style.cursor = 'crosshair';

    let isPainting = false;
    let overlayId: string | null = null;
    let pointsArray: any[] = [];
    let lastPoint: any = null;

    const getChartPoint = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const p0Result = activeChart.convertToPixel([{ dataIndex: 0 }], { paneId: 'candle_pane' });
      const p100Result = activeChart.convertToPixel([{ dataIndex: 100 }], { paneId: 'candle_pane' });

      let preciseDataIndex = Number.NaN;
      if (p0Result && p100Result && p0Result[0] && p100Result[0]) {
        const p0 = p0Result[0].x;
        const p100 = p100Result[0].x;
        const barWidth = (p100 - p0) / 100;
        if (Math.abs(barWidth) > 0.0001) {
          preciseDataIndex = (x - p0) / barWidth;
        }
      }

      const pts = activeChart.convertFromPixel([{ x, y }], { paneId: 'candle_pane' });
      if (pts && pts[0]) {
        const dataList = typeof activeChart.getDataList === 'function'
          ? activeChart.getDataList()
          : [];
        const rawDataIndex = Number.isFinite(preciseDataIndex)
          ? preciseDataIndex
          : Number(pts[0].dataIndex);
        let dataIndex = rawDataIndex;
        let timestamp = Number(pts[0].timestamp);

        if (Array.isArray(dataList) && dataList.length > 0 && Number.isFinite(rawDataIndex)) {
          const lastIndex = dataList.length - 1;

          if (rawDataIndex >= 0 && rawDataIndex <= lastIndex) {
            const leftIndex = Math.floor(dataIndex);
            const rightIndex = Math.ceil(dataIndex);
            const leftTime = Number(dataList[leftIndex]?.timestamp);
            const rightTime = Number(dataList[rightIndex]?.timestamp);
            if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
              const ratio = dataIndex - leftIndex;
              timestamp = leftTime + (rightTime - leftTime) * ratio;
            } else if (Number.isFinite(leftTime)) {
              timestamp = leftTime;
            }
          } else {
            let timeDiff = 24 * 60 * 60 * 1000;
            if (dataList.length >= 2) {
              timeDiff = Math.abs(Number(dataList[lastIndex].timestamp) - Number(dataList[lastIndex - 1].timestamp));
            }
            if (rawDataIndex > lastIndex) {
              const lastTime = Number(dataList[lastIndex].timestamp);
              timestamp = lastTime + (rawDataIndex - lastIndex) * timeDiff;
            } else {
              const firstTime = Number(dataList[0].timestamp);
              timestamp = firstTime + rawDataIndex * timeDiff;
            }
          }
        }

        if (!Number.isFinite(timestamp)) {
          timestamp = Number(pts[0].timestamp);
        }

        return {
          dataIndex: Number.isFinite(dataIndex) ? dataIndex : pts[0].dataIndex,
          timestamp,
          value: pts[0].value
        };
      }
      return null;
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (!target.closest('.ticker-pen-pro-widget') && !target.closest('canvas')) {
        return;
      }

      const pt = getChartPoint(e);
      if (!pt) return;

      isPainting = true;
      overlayId = mappedKey + '_' + Date.now();
      pointsArray = [pt];
      lastPoint = pt;

      const defaultColor = '#2962FF';
      const defaultWidth = mappedKey === 'highlighter' ? 20 : 2;
      const defaultOpacity = mappedKey === 'highlighter' ? 0.4 : 1;

      activeChart.createOverlay({
        id: overlayId,
        name: mappedKey,
        points: pointsArray,
        styles: {
          line: {
            color: defaultColor,
            size: defaultWidth
          }
        },
        extendData: {
          lineColor: defaultColor,
          lineWidth: defaultWidth,
          lineOpacity: defaultOpacity,
          highlighterWidth: defaultWidth,
          brushSize: defaultWidth
        }
      });

      e.preventDefault();
      e.stopPropagation();

      window.addEventListener('mousemove', handleMouseMove, { capture: true, passive: false });
      window.addEventListener('mouseup', handleMouseUp, { capture: true, passive: false });
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPainting || !overlayId) return;

      const pt = getChartPoint(e);
      if (!pt) return;

      const timeDiff = Math.abs(pt.timestamp - lastPoint.timestamp);
      const valueDiff = Math.abs(pt.value - lastPoint.value);

      if (timeDiff > 0 || valueDiff > 0) {
        pointsArray.push(pt);
        lastPoint = pt;

        activeChart.overrideOverlay({
          id: overlayId,
          points: pointsArray
        });
      }

      e.preventDefault();
      e.stopPropagation();
    };

    const handleMouseUp = () => {
      if (!isPainting) return;
      isPainting = false;

      window.removeEventListener('mousemove', handleMouseMove, { capture: true });
      window.removeEventListener('mouseup', handleMouseUp, { capture: true });

      window.dispatchEvent(new CustomEvent('tickerpen-draw-end'));

      if (overlayId) {
        const activeChartInstance = (window as any).__active_chart_instance__ || activeChart;
        const overlays = (activeChartInstance && typeof activeChartInstance.getOverlays === 'function')
          ? (activeChartInstance.getOverlays() || [])
          : [];
        const currentOverlay = overlays.find((o: any) => o.id === overlayId);
        if (currentOverlay) {
          dispatchOverlaySettings(currentOverlay);
        } else {
          const rawColor = '#2962FF';
          const rawWidth = mappedKey === 'highlighter' ? 20 : 2;
          window.dispatchEvent(new CustomEvent('open-drawing-toolbar', {
            detail: {
              overlayId,
              overlayName: mappedKey,
              category: 'brush',
              lineColor: rawColor,
              lineWidth: rawWidth,
              lineStyle: 'solid',
              lineOpacity: mappedKey === 'highlighter' ? 0.4 : 1,
              fillColor: 'transparent',
              fillOpacity: 0.2,
              filled: false,
              locked: false,
              points: pointsArray || [],
              screenX: 64,
              screenY: 140
            }
          }));
        }
      }
    };

    container.addEventListener('mousedown', handleMouseDown, true);

    return () => {
      container.style.cursor = originalCursor;
      container.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('mousemove', handleMouseMove, { capture: true });
      window.removeEventListener('mouseup', handleMouseUp, { capture: true });
    };
  }, [activeTool]);

  const handleSelectTool = (toolKey: string) => {
    setActiveTool(toolKey);
    setActivePopover(null);
    const activeChart = (window as any).__active_chart_instance__;
    if (activeChart) {
      if (activeChart._chartStore) {
        const info = activeChart._chartStore.getProgressOverlayInfo();
        if (info) {
          const overlay = info.overlay;
          if (overlay && (overlay.name === 'polyline' || overlay.name === 'path') && overlay.isDrawing()) {
            if (overlay.points && overlay.points.length >= 2) {
              checkAndClosePolyline(overlay);
              overlay.forceComplete();
              activeChart._chartStore.progressOverlayComplete();
              if (typeof overlay.onDrawEnd === 'function') {
                try { overlay.onDrawEnd({ overlay, chart: activeChart }); } catch { }
              }
            }
          }
        }
      }
      if (typeof activeChart.removeOverlay === 'function') {
        activeChart.removeOverlay({ name: 'zoomInBox' });
        activeChart.removeOverlay({ name: 'zoom-in-box' });
      }

      const mappedKey = toolMapping[toolKey] || toolKey;
      const isCursorMode = ['cross', 'dot', 'arrowCursor', 'demonstration'].includes(toolKey) || ['cross', 'dot', 'arrow-cursor', 'demonstration'].includes(mappedKey);

      let effectiveCursorMode = (typeof window !== 'undefined' && (window as any).__active_cursor_mode__) || selectedCursorRef.current || 'cross';

      if (isCursorMode) {
        const normalizedCursor = toolKey === 'arrow-cursor' ? 'arrowCursor' : toolKey;
        effectiveCursorMode = normalizedCursor;
        setSelectedTools(prev => ({ ...prev, cursor: normalizedCursor }));
        selectedCursorRef.current = normalizedCursor;
        if (typeof window !== 'undefined') {
          (window as any).__active_cursor_mode__ = normalizedCursor;
        }
      }

      if (typeof window !== 'undefined') {
        // Enforce the body class matching the user's active cursor mode
        if (effectiveCursorMode === 'dot') {
          document.body.classList.add('hide-native-chart-cursor');
        } else if (effectiveCursorMode === 'arrowCursor' || effectiveCursorMode === 'demonstration') {
          document.body.classList.add('arrow-cursor-mode');
        }
        window.dispatchEvent(new CustomEvent('cursor-mode-change', { detail: { mode: effectiveCursorMode } }));
      }

      // Hide/show the TickerPen library's canvas-drawn crosshair lines
      // For arrowCursor: hide crosshair lines (just system arrow, nothing else)
      // For dot and demonstration and cross: KEEP crosshair lines visible
      if (effectiveCursorMode === 'arrowCursor') {
        if (typeof activeChart.setStyles === 'function') {
          activeChart.setStyles({
            crosshair: {
              show: false,
              horizontal: { show: false, line: { show: false }, text: { show: false } },
              vertical: { show: false, line: { show: false }, text: { show: false } }
            }
          });
        }
      } else {
        // Re-enable crosshair lines for cross, dot, and demonstration modes
        if (typeof activeChart.setStyles === 'function') {
          const userStyles = (window as any).__chart_styles__ || {};
          activeChart.setStyles({
            crosshair: {
              show: userStyles.crosshairShow !== false,
              horizontal: {
                show: userStyles.crosshairHorizontalShow !== false,
                line: { show: userStyles.crosshairHorizontalShow !== false },
                text: { show: userStyles.crosshairHorizontalShow !== false }
              },
              vertical: {
                show: userStyles.crosshairVerticalShow !== false,
                line: { show: userStyles.crosshairVerticalShow !== false },
                text: { show: userStyles.crosshairVerticalShow !== false }
              }
            }
          });
        }
      }

      // Always dismiss active drawing drag bars & settings toolbars when switching to another tool
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('close-all-toolbars'));
        window.dispatchEvent(new CustomEvent('close-drawing-toolbar'));
        window.dispatchEvent(new CustomEvent('close-text-settings'));
        window.dispatchEvent(new CustomEvent('close-fib-settings'));
        window.dispatchEvent(new CustomEvent('close-position-settings'));
        window.dispatchEvent(new CustomEvent('close-pin-flag-settings'));
        window.dispatchEvent(new CustomEvent('close-table-toolbar'));
        window.dispatchEvent(new CustomEvent('close-elliott-toolbar'));
        window.dispatchEvent(new CustomEvent('active-tool-change', { detail: { toolKey, mappedKey } }));
      }

      if (activeChart && activeChart._chartStore) {
        if (typeof activeChart._chartStore.setClickOverlayInfo === 'function') {
          const noop = () => {};
          try {
            activeChart._chartStore.setClickOverlayInfo(
              { paneId: '', overlay: null, figureType: null, figure: null, figureIndex: -1 },
              noop,
              noop
            );
          } catch {}
        }
      }
      if (typeof activeChart.updatePane === 'function') {
        activeChart.updatePane(1);
      }
      if (typeof activeChart.invalidate === 'function') {
        activeChart.invalidate();
      }

      if (isCursorMode) {
        if (activeChart && activeChart._chartStore) {
          const info = activeChart._chartStore.getProgressOverlayInfo();
          if (info && info.overlay) {
            if (typeof activeChart._chartStore.removeProgressOverlay === 'function') {
              activeChart._chartStore.removeProgressOverlay();
            } else if (typeof activeChart._chartStore.progressOverlayComplete === 'function') {
              activeChart._chartStore.progressOverlayComplete();
              if (info.overlay.id) {
                activeChart.removeOverlay({ id: info.overlay.id });
              }
            }
          }
        }

        activeChart.createOverlay({ name: '' });
      } else if (mappedKey !== 'brush' && mappedKey !== 'highlighter') {
        activeChart.createOverlay({ name: mappedKey });
      } else {
        activeChart.createOverlay({ name: '' });
      }
    } else {
      console.warn("No active chart instance found.");
    }
  };

  const handleSelectMagnetMode = (mode: 'weak_magnet' | 'strong_magnet') => {
    setMagnetMode(mode);
    setLastMagnetMode(mode);
    if (typeof window !== 'undefined') {
      (window as any).__magnet_mode__ = mode;
      window.dispatchEvent(new CustomEvent('magnet-mode-change', { detail: { mode } }));
    }
    const charts = Array.from((window as any).globalCoreCharts || []);
    charts.forEach((c: any) => {
      if (c && typeof c.overrideOverlay === 'function') {
        c.overrideOverlay({ mode });
      }
    });
    setActivePopover(null);
  };

  const handleToggleMagnet = () => {
    const nextMode = magnetMode === 'normal' ? lastMagnetMode : 'normal';
    setMagnetMode(nextMode);
    if (typeof window !== 'undefined') {
      (window as any).__magnet_mode__ = nextMode;
      window.dispatchEvent(new CustomEvent('magnet-mode-change', { detail: { mode: nextMode } }));
    }
    const charts = Array.from((window as any).globalCoreCharts || []);
    charts.forEach((c: any) => {
      if (c && typeof c.overrideOverlay === 'function') {
        c.overrideOverlay({ mode: nextMode });
      }
    });
  };



  const handleToggleLockAll = () => {
    const nextLock = !isLockAll;
    setIsLockAll(nextLock);
    const activeChart = (window as any).__active_chart_instance__;
    if (activeChart) activeChart.overrideOverlay({ lock: nextLock });
  };

  const handleSetIndicatorsVisibility = (visible: boolean) => {
    const activeChart = (window as any).__active_chart_instance__;
    if (!activeChart) return;
    try {
      if (typeof activeChart.getIndicators === 'function') {
        const indicators = activeChart.getIndicators() || [];
        if (Array.isArray(indicators)) {
          indicators.forEach((ind: any) => {
            activeChart.overrideIndicator({ name: ind.name, visible });
          });
        } else if (indicators && typeof indicators === 'object') {
          Object.keys(indicators).forEach(paneId => {
            const paneIndicators = indicators[paneId];
            if (Array.isArray(paneIndicators)) {
              paneIndicators.forEach((ind: any) => {
                activeChart.overrideIndicator({ name: ind.name, visible });
              });
            }
          });
        }
      }
    } catch (err) {
      console.error("Failed to toggle indicator visibility:", err);
    }
  };

  const handleSelectVisibility = (state: 'show_all' | 'hide_drawings' | 'hide_indicators' | 'hide_all') => {
    setVisibilityState(state);
    const activeChart = (window as any).__active_chart_instance__;
    if (!activeChart) return;
    
    // Toggle drawings visibility
    const drawingsVisible = (state === 'show_all' || state === 'hide_indicators');
    activeChart.overrideOverlay({ visible: drawingsVisible });
    
    // Toggle indicators visibility
    const indicatorsVisible = (state === 'show_all' || state === 'hide_drawings');
    handleSetIndicatorsVisibility(indicatorsVisible);
    
    setActivePopover(null);
  };



  const handleRemoveDrawings = () => {
    const activeChart = (window as any).__active_chart_instance__;
    if (activeChart && typeof activeChart.getOverlays === 'function') {
      const overlays = activeChart.getOverlays() || [];
      overlays.forEach((o: any) => {
        if (
          o.name !== 'future-time-scale' &&
          o.name !== 'zoomInBox' &&
          o.name !== 'zoom-in-box'
        ) {
          if (o.id) {
            activeChart.removeOverlay({ id: o.id });
          }
        }
      });
    }
  };

  const handleRemoveIndicators = () => {
    const activeChart = (window as any).__active_chart_instance__;
    if (activeChart && typeof activeChart.getIndicators === 'function') {
      const indicators = activeChart.getIndicators() || [];
      indicators.forEach((ind: any) => {
        activeChart.removeIndicator({ paneId: ind.paneId, name: ind.name });
      });
    }
  };

  const handleRemoveBoth = () => {
    handleRemoveDrawings();
    handleRemoveIndicators();
  };

  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickRef = useRef<{ time: number; groupId: string } | null>(null);

  const calculatePopoverPlacement = (targetEl: HTMLElement, estimatedWidth: number, estimatedHeight: number) => {
    const rect = targetEl.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const topBarHeight = 38; // height of top bar

    // Horizontal placement: default to the right side of the toolbar button
    let left = rect.right + 2;
    // Check if there is enough space on the right side of the sidebar/chart
    if (left + estimatedWidth > windowWidth - 8) {
      // Not enough space on right; check if there is room on the left side of the button
      if (rect.left - estimatedWidth - 2 >= 8) {
        left = rect.left - estimatedWidth - 2;
      } else {
        // Otherwise clamp within viewport
        left = Math.max(8, windowWidth - estimatedWidth - 8);
      }
    }

    // Vertical placement: default aligned with top of button
    let top = rect.top - 6;
    // If not enough space below, shift up so the popover fits above the bottom edge
    if (top + estimatedHeight > windowHeight - 10) {
      top = windowHeight - estimatedHeight - 10;
    }
    // Ensure it doesn't collide with or get hidden under the top bar
    top = Math.max(topBarHeight + 4, top);

    // Compute maximum allowable height dynamically so scrollable popovers fit on small viewports
    const maxHeight = Math.max(120, windowHeight - top - 12);

    return { top, left, maxHeight };
  };

  const updateActivePopoverPosition = () => {
    if (!activePopover || !activeAnchorElRef.current) return;
    let estWidth = 260;
    let estHeight = 450;
    if (activePopover === 'magnet') {
      estWidth = 130;
      estHeight = 90;
    } else if (activePopover === 'delete') {
      estWidth = 260;
      estHeight = 140;
    } else if (activePopover === 'visibility') {
      estWidth = 150;
      estHeight = 150;
    } else if (activePopover === 'emoji') {
      estWidth = 350;
      estHeight = 460;
    }
    const coords = calculatePopoverPlacement(activeAnchorElRef.current, estWidth, estHeight);
    setPopoverCoords(coords);
  };

  useEffect(() => {
    if (!activePopover) return;
    const handleScrollOrResize = () => {
      updateActivePopoverPosition();
    };
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [activePopover]);

  const openMagnetPopover = (targetEl: HTMLElement) => {
    if (activePopover === 'magnet') {
      setActivePopover(null);
      activeAnchorElRef.current = null;
      return;
    }
    activeAnchorElRef.current = targetEl;
    const coords = calculatePopoverPlacement(targetEl, 130, 90);
    setPopoverCoords(coords);
    setActivePopover('magnet');
  };

  const openDeletePopover = (targetEl: HTMLElement) => {
    if (activePopover === 'delete') {
      setActivePopover(null);
      activeAnchorElRef.current = null;
      return;
    }
    activeAnchorElRef.current = targetEl;
    const coords = calculatePopoverPlacement(targetEl, 260, 140);
    setPopoverCoords(coords);
    setActivePopover('delete');
  };

  const openVisibilityPopover = (targetEl: HTMLElement) => {
    if (activePopover === 'visibility') {
      setActivePopover(null);
      activeAnchorElRef.current = null;
      return;
    }
    activeAnchorElRef.current = targetEl;
    const coords = calculatePopoverPlacement(targetEl, 150, 150);
    setPopoverCoords(coords);
    setActivePopover('visibility');
  };

  const openGroupPopover = (groupId: string, targetEl: HTMLElement, forceOpen: boolean = false) => {
    if (!forceOpen && activePopover === groupId) {
      setActivePopover(null);
      activeAnchorElRef.current = null;
      return;
    }
    activeAnchorElRef.current = targetEl;
    const coords = calculatePopoverPlacement(targetEl, 260, 450);
    setPopoverCoords(coords);
    setActivePopover(groupId);
  };

  const openEmojiPopover = (targetEl: HTMLElement) => {
    if (activePopover === 'emoji') {
      setActivePopover(null);
      activeAnchorElRef.current = null;
      return;
    }
    activeAnchorElRef.current = targetEl;
    const coords = calculatePopoverPlacement(targetEl, 350, 460);
    setPopoverCoords(coords);
    setActivePopover('emoji');
  };

  const handleToolButtonClick = (
    groupId: string,
    toolKey: string,
    e: React.MouseEvent<HTMLElement>
  ) => {
    const now = Date.now();
    const targetEl = e.currentTarget;

    // Detect rapid double click (within 350ms on same group button)
    if (
      lastClickRef.current &&
      lastClickRef.current.groupId === groupId &&
      now - lastClickRef.current.time < 350
    ) {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      lastClickRef.current = null;
      openGroupPopover(groupId, targetEl, true);
      return;
    }

    lastClickRef.current = { time: now, groupId };
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null;
      lastClickRef.current = null;
      setSelectedTools(prev => ({ ...prev, [groupId]: toolKey }));
      handleSelectTool(toolKey);
    }, 220);
  };

  const handleToolButtonDoubleClick = (
    groupId: string,
    e: React.MouseEvent<HTMLElement>
  ) => {
    e.preventDefault();
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    lastClickRef.current = null;
    openGroupPopover(groupId, e.currentTarget, true);
  };

  const isLight = chromeTheme === 'light';

  return (
    <div
      className="custom-side-tool-panel"
      style={{
        position: 'absolute',
        top: '38px',
        left: 0,
        height: 'calc(100% - 38px)',
        width: '48px',
        backgroundColor: isLight ? '#f8f9fd' : '#000000',
        border: 'none',
        zIndex: 100000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        color: isLight ? '#131722' : '#d1d4dc',
        userSelect: 'none',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '8px 0 2px 0',
        boxSizing: 'border-box'
      }}
      onScroll={updateActivePopoverPosition}
    >
      {/* Tool Groups List */}
      {toolGroups.map(group => {
        const currentToolKey = selectedTools[group.id] || group.sections[0].items[0].key;
        const isGroupActive = activeTool === currentToolKey || group.sections.some(s => s.items.some(i => i.key === activeTool));
        const isMainHovered = hoveredButtonKey === `${group.id}-main`;
        const isArrowHovered = hoveredButtonKey === `${group.id}-arrow`;
        const isRowHovered = hoveredButtonKey !== null && hoveredButtonKey.startsWith(group.id);
        const showArrowTab = isRowHovered || activePopover === group.id;

        return (
          <div
            key={group.id}
            className="sidebar-group-btn"
            onMouseEnter={() => setHoveredButtonKey(`${group.id}-row`)}
            onMouseLeave={() => setHoveredButtonKey(null)}
            style={{
              marginBottom: '2px',
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              position: 'relative',
              flexShrink: 0
            }}
          >
            {/* Button Container */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '34px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {/* Main Tool Button */}
              <button
                onClick={(e) => handleToolButtonClick(group.id, currentToolKey, e)}
                onDoubleClick={(e) => handleToolButtonDoubleClick(group.id, e)}
                onMouseEnter={() => setHoveredButtonKey(`${group.id}-main`)}
                onMouseLeave={() => setHoveredButtonKey(`${group.id}-row`)}
                title={`${group.name} (Single click: select tool | Rapid double click: open sub panel)`}
                style={{
                  width: '34px',
                  height: '34px',
                  backgroundColor: isGroupActive ? 'rgba(41, 98, 255, 0.12)' : (isMainHovered ? (isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.08)') : 'transparent'),
                  borderRadius: '4px',
                  color: isGroupActive ? '#2962ff' : (isMainHovered ? (isLight ? '#000000' : '#ffffff') : (isLight ? '#131722' : '#d1d4dc')),
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  transition: 'all 0.15s ease'
                }}
              >
                {renderToolSvgIcon(currentToolKey)}
              </button>

              {/* Popout Disclosure/Arrow Tab */}
              {showArrowTab && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (clickTimeoutRef.current) {
                      clearTimeout(clickTimeoutRef.current);
                      clickTimeoutRef.current = null;
                    }
                    lastClickRef.current = null;
                    openGroupPopover(group.id, e.currentTarget.parentElement || e.currentTarget, false);
                  }}
                  onMouseEnter={() => setHoveredButtonKey(`${group.id}-arrow`)}
                  onMouseLeave={() => setHoveredButtonKey(`${group.id}-row`)}
                  title={`Open ${group.name} tools list`}
                  style={{
                    position: 'absolute',
                    right: '0px',
                    top: '0px',
                    width: '12px',
                    height: '34px',
                    backgroundColor: activePopover === group.id 
                      ? '#2962ff' 
                      : (isArrowHovered 
                        ? (isLight ? '#dde0e8' : '#2a2e39') 
                        : (isLight ? '#ebedf2' : '#1f222e')),
                    border: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.05)',
                    borderLeft: 'none',
                    borderTopRightRadius: '4px',
                    borderBottomRightRadius: '4px',
                    borderTopLeftRadius: '0px',
                    borderBottomLeftRadius: '0px',
                    color: activePopover === group.id ? '#ffffff' : (isLight ? '#131722' : '#d1d4dc'),
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    boxShadow: isLight ? '2px 0 6px rgba(0, 0, 0, 0.08)' : '2px 0 6px rgba(0, 0, 0, 0.3)',
                    transition: 'all 0.12s ease',
                    zIndex: 10
                  }}
                >
                  <ChevronRight
                    size={10}
                    style={{
                      transform: activePopover === group.id ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.15s ease'
                    }}
                  />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* 2D Emoji Tool Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          openEmojiPopover(e.currentTarget);
        }}
        onMouseEnter={() => setHoveredButtonKey('emoji-main')}
        onMouseLeave={() => setHoveredButtonKey(null)}
        title="2D Emojis & Stickers"
        style={{
          backgroundColor: activeTool === 'emoji' || activePopover === 'emoji' ? 'rgba(41, 98, 255, 0.12)' : (hoveredButtonKey === 'emoji-main' ? (isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.08)') : 'transparent'),
          border: 'none',
          borderRadius: '4px',
          color: activeTool === 'emoji' || activePopover === 'emoji' ? '#2962ff' : (hoveredButtonKey === 'emoji-main' ? (isLight ? '#000000' : '#ffffff') : (isLight ? '#131722' : '#d1d4dc')),
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '34px',
          height: '34px',
          marginBottom: '2px',
          transition: 'all 0.15s ease',
          flexShrink: 0
        }}
      >
        <Smile size={20} />
      </button>

      {/* Divider separating drawing tools from measure/zoom utilities */}
      <div style={{ width: '24px', height: '1px', backgroundColor: isLight ? '#e0e3eb' : 'rgba(255, 255, 255, 0.06)', margin: '4px 0', flexShrink: 0 }} />

      {/* Measuring Ruler Tool */}
      <button
        onClick={() => handleSelectTool('measure')}
        onMouseEnter={() => setHoveredButtonKey('measure-main')}
        onMouseLeave={() => setHoveredButtonKey(null)}
        title={`Measure (${getShortcutForToolKey('measure', customShortcuts) || 'Hold Shift / Shift + M'})`}
        style={{
          backgroundColor: activeTool === 'measure' ? 'rgba(41, 98, 255, 0.12)' : (hoveredButtonKey === 'measure-main' ? (isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.08)') : 'transparent'),
          border: 'none',
          borderRadius: '4px',
          color: activeTool === 'measure' ? '#2962ff' : (hoveredButtonKey === 'measure-main' ? (isLight ? '#000000' : '#ffffff') : (isLight ? '#131722' : '#d1d4dc')),
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '34px',
          height: '34px',
          marginBottom: '2px',
          transition: 'all 0.15s ease',
          flexShrink: 0
        }}
      >
        <Ruler size={20} />
      </button>

      {/* Zoom In Box Tool (Zoom+) */}
      <button
        onClick={() => handleSelectTool('zoomInBox')}
        onMouseEnter={() => setHoveredButtonKey('zoomInBox-main')}
        onMouseLeave={() => setHoveredButtonKey(null)}
        title="Zoom In (Draw box to zoom in)"
        style={{
          backgroundColor: activeTool === 'zoomInBox' ? 'rgba(41, 98, 255, 0.12)' : (hoveredButtonKey === 'zoomInBox-main' ? (isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.08)') : 'transparent'),
          border: 'none',
          borderRadius: '4px',
          color: activeTool === 'zoomInBox' ? '#2962ff' : (hoveredButtonKey === 'zoomInBox-main' ? (isLight ? '#000000' : '#ffffff') : (isLight ? '#131722' : '#d1d4dc')),
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '34px',
          height: '34px',
          marginBottom: '2px',
          transition: 'all 0.15s ease',
          flexShrink: 0
        }}
      >
        <ZoomIn size={20} />
      </button>

      {/* Zoom Out Step Tool (Zoom-) */}
      <button
        onClick={() => performZoomOutStep()}
        onMouseEnter={() => setHoveredButtonKey('zoomOut-main')}
        onMouseLeave={() => setHoveredButtonKey(null)}
        title={`Zoom Out (${zoomCount} zoom step${zoomCount > 1 ? 's' : ''} remaining)`}
        style={{
          backgroundColor: hoveredButtonKey === 'zoomOut-main' ? (isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.08)') : 'transparent',
          border: 'none',
          borderRadius: '4px',
          color: hoveredButtonKey === 'zoomOut-main' ? (isLight ? '#000000' : '#ffffff') : (isLight ? '#131722' : '#d1d4dc'),
          cursor: zoomCount > 0 ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '34px',
          height: '34px',
          marginBottom: '2px',
          position: 'relative',
          transition: 'all 0.15s ease',
          visibility: zoomCount > 0 ? 'visible' : 'hidden',
          pointerEvents: zoomCount > 0 ? 'auto' : 'none',
          flexShrink: 0
        }}
      >
        <ZoomOut size={20} />
        {zoomCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              backgroundColor: '#2962ff',
              color: '#ffffff',
              fontSize: '9px',
              fontWeight: 'bold',
              borderRadius: '50%',
              width: '14px',
              height: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: '1'
            }}
          >
            {zoomCount}
          </span>
        )}
      </button>

      {/* Divider separating utilities from action controls */}
      <div style={{ width: '24px', height: '1px', backgroundColor: isLight ? '#e0e3eb' : 'rgba(255, 255, 255, 0.06)', margin: '4px 0', flexShrink: 0 }} />

      {/* Magnet button inside rounded square container with a sub-panel toggle arrow */}
      <div
        className="sidebar-magnet-container"
        onMouseEnter={() => setHoveredButtonKey('magnet-row')}
        onMouseLeave={() => setHoveredButtonKey(null)}
        style={{
          position: 'relative',
          width: '100%',
          height: '34px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '2px',
          flexShrink: 0
        }}
      >
        {/* Main Magnet Button */}
        <button
          onClick={handleToggleMagnet}
          onMouseEnter={() => setHoveredButtonKey('magnet-main')}
          onMouseLeave={() => setHoveredButtonKey('magnet-row')}
          title={`Magnet: ${magnetMode === 'normal' ? 'Off' : magnetMode === 'weak_magnet' ? 'Weak' : 'Strong'}`}
          style={{
            width: '34px',
            height: '34px',
            backgroundColor: magnetMode !== 'normal' ? 'rgba(41, 98, 255, 0.18)' : (hoveredButtonKey === 'magnet-main' ? (isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.08)') : 'transparent'),
            borderRadius: '4px',
            color: magnetMode !== 'normal' ? '#2962ff' : (hoveredButtonKey === 'magnet-main' ? (isLight ? '#000000' : '#ffffff') : (isLight ? '#131722' : '#d1d4dc')),
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            transition: 'background-color 0.12s, color 0.12s'
          }}
        >
          {(() => {
            const MagnetIcon = magnetMode === 'strong_magnet' ? sidebarIcons['strongMagnetBtn'] : sidebarIcons['weakMagnetBtn'];
            return MagnetIcon ? <MagnetIcon width={20} height={20} /> : <Magnet size={20} />;
          })()}
        </button>

        {/* Popout Disclosure/Arrow Tab */}
        {(hoveredButtonKey?.startsWith('magnet') || activePopover === 'magnet') && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              openMagnetPopover(e.currentTarget.parentElement || e.currentTarget);
            }}
            onMouseEnter={() => setHoveredButtonKey('magnet-arrow')}
            onMouseLeave={() => setHoveredButtonKey('magnet-row')}
            title="Choose Magnet Mode"
            style={{
              position: 'absolute',
              right: '0px',
              top: '0px',
              width: '12px',
              height: '34px',
              backgroundColor: activePopover === 'magnet' 
                ? '#2962ff' 
                : (hoveredButtonKey === 'magnet-arrow' 
                  ? (isLight ? '#dde0e8' : '#2a2e39') 
                  : (isLight ? '#ebedf2' : '#1f222e')),
              border: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.05)',
              borderLeft: 'none',
              borderTopRightRadius: '4px',
              borderBottomRightRadius: '4px',
              borderTopLeftRadius: '0px',
              borderBottomLeftRadius: '0px',
              color: activePopover === 'magnet' ? '#ffffff' : (isLight ? '#131722' : '#d1d4dc'),
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              boxShadow: isLight ? '2px 0 6px rgba(0, 0, 0, 0.08)' : '2px 0 6px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.12s ease',
              zIndex: 10
            }}
          >
            <ChevronRight
              size={10}
              style={{
                transform: activePopover === 'magnet' ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease'
              }}
            />
          </button>
        )}
      </div>

      {/* Lock Drawing Mode (Stay in Drawing Mode) */}
      <button
        onClick={() => setIsStayInDrawingMode(prev => !prev)}
        onMouseEnter={() => setHoveredButtonKey('stayInDrawingMode-main')}
        onMouseLeave={() => setHoveredButtonKey(null)}
        title={isStayInDrawingMode ? 'Unlock Drawing Mode' : 'Stay in Drawing Mode'}
        style={{
          backgroundColor: isStayInDrawingMode ? 'rgba(41, 98, 255, 0.12)' : (hoveredButtonKey === 'stayInDrawingMode-main' ? (isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.08)') : 'transparent'),
          border: 'none',
          borderRadius: '4px',
          color: isStayInDrawingMode ? '#2962ff' : (hoveredButtonKey === 'stayInDrawingMode-main' ? (isLight ? '#000000' : '#ffffff') : (isLight ? '#131722' : '#d1d4dc')),
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '34px',
          height: '34px',
          marginBottom: '2px',
          transition: 'all 0.15s ease',
          flexShrink: 0
        }}
      >
        {(() => {
          const StayIcon = sidebarIcons['stayInDrawingModeBtn'];
          return StayIcon ? <StayIcon width={20} height={20} /> : <PenTool size={20} />;
        })()}
      </button>

      {/* Lock All Drawings */}
      <button
        onClick={handleToggleLockAll}
        onMouseEnter={() => setHoveredButtonKey('lockAll-main')}
        onMouseLeave={() => setHoveredButtonKey(null)}
        title={isLockAll ? 'Unlock All Drawings' : 'Lock All Drawings'}
        style={{
          backgroundColor: isLockAll ? 'rgba(41, 98, 255, 0.12)' : (hoveredButtonKey === 'lockAll-main' ? (isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.08)') : 'transparent'),
          border: 'none',
          borderRadius: '4px',
          color: isLockAll ? '#2962ff' : (hoveredButtonKey === 'lockAll-main' ? (isLight ? '#000000' : '#ffffff') : (isLight ? '#131722' : '#d1d4dc')),
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '34px',
          height: '34px',
          marginBottom: '2px',
          transition: 'all 0.15s ease',
          flexShrink: 0
        }}
      >
        {(() => {
          const LockIcon = sidebarIcons['lockBtn'];
          const UnlockIcon = sidebarIcons['unlockBtn'];
          if (isLockAll && LockIcon) return <LockIcon width={20} height={20} />;
          if (!isLockAll && UnlockIcon) return <UnlockIcon width={20} height={20} />;
          return isLockAll ? <Lock size={20} /> : <Unlock size={20} />;
        })()}
      </button>

      {/* Visibility Eye button with options chevron */}
      <div
        className="sidebar-visibility-container"
        onMouseEnter={() => setHoveredButtonKey('visibility-row')}
        onMouseLeave={() => setHoveredButtonKey(null)}
        style={{
          position: 'relative',
          width: '100%',
          height: '34px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '2px',
          flexShrink: 0
        }}
      >
        {/* Main Eye Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (visibilityState === 'show_all') {
              openVisibilityPopover(e.currentTarget.parentElement || e.currentTarget);
            } else {
              handleSelectVisibility('show_all');
            }
          }}
          onMouseEnter={() => setHoveredButtonKey('visibility-main')}
          onMouseLeave={() => setHoveredButtonKey('visibility-row')}
          title={
            visibilityState === 'show_all' 
              ? 'Hide Drawings' 
              : visibilityState === 'hide_drawings' 
              ? 'Hide Indicators (Drawings Hidden)'
              : visibilityState === 'hide_indicators'
              ? 'Hide All (Indicators Hidden)'
              : 'Show All (All Hidden)'
          }
          style={{
            width: '34px',
            height: '34px',
            backgroundColor: visibilityState !== 'show_all' ? 'rgba(239, 83, 80, 0.12)' : (hoveredButtonKey === 'visibility-main' ? (isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.08)') : 'transparent'),
            borderRadius: '4px',
            color: visibilityState !== 'show_all' ? '#ef5350' : (hoveredButtonKey === 'visibility-main' ? (isLight ? '#000000' : '#ffffff') : (isLight ? '#131722' : '#d1d4dc')),
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            transition: 'all 0.15s ease'
          }}
        >
          {visibilityState !== 'show_all' ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>

        {/* Popout Disclosure/Arrow Tab */}
        {(hoveredButtonKey?.startsWith('visibility') || activePopover === 'visibility') && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              openVisibilityPopover(e.currentTarget.parentElement || e.currentTarget);
            }}
            onMouseEnter={() => setHoveredButtonKey('visibility-arrow')}
            onMouseLeave={() => setHoveredButtonKey('visibility-row')}
            title="Hide Options"
            style={{
              position: 'absolute',
              right: '0px',
              top: '0px',
              width: '12px',
              height: '34px',
              backgroundColor: activePopover === 'visibility' 
                ? '#ef5350' 
                : (hoveredButtonKey === 'visibility-arrow' 
                  ? (isLight ? '#dde0e8' : '#2a2e39') 
                  : (isLight ? '#ebedf2' : '#1f222e')),
              border: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.05)',
              borderLeft: 'none',
              borderTopRightRadius: '4px',
              borderBottomRightRadius: '4px',
              borderTopLeftRadius: '0px',
              borderBottomLeftRadius: '0px',
              color: activePopover === 'visibility' ? '#ffffff' : (isLight ? '#131722' : '#d1d4dc'),
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              boxShadow: isLight ? '2px 0 6px rgba(0, 0, 0, 0.08)' : '2px 0 6px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.12s ease',
              zIndex: 10
            }}
          >
            <ChevronRight
              size={10}
              style={{
                transform: activePopover === 'visibility' ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease'
              }}
            />
          </button>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: '24px', height: '1px', backgroundColor: isLight ? '#e0e3eb' : 'rgba(255, 255, 255, 0.06)', margin: '4px 0', flexShrink: 0 }} />

      {/* Clear All Drawings & Indicators (Trash with chevron) */}
      <div
        className="sidebar-delete-container"
        onMouseEnter={() => setHoveredButtonKey('delete-row')}
        onMouseLeave={() => setHoveredButtonKey(null)}
        style={{
          position: 'relative',
          width: '100%',
          height: '34px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '2px',
          flexShrink: 0
        }}
      >
        {/* Main Trash Button */}
        <button
          className="trash-icon-btn"
          onClick={(e) => {
            e.stopPropagation();
            openDeletePopover(e.currentTarget);
          }}
          onMouseEnter={() => setHoveredButtonKey('delete-main')}
          onMouseLeave={() => setHoveredButtonKey('delete-row')}
          title="Remove drawings and indicators"
          style={{
            width: '34px',
            height: '34px',
            backgroundColor: activePopover === 'delete' ? 'rgba(239, 83, 80, 0.12)' : (hoveredButtonKey === 'delete-main' ? (isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.08)') : 'transparent'),
            borderRadius: '4px',
            color: activePopover === 'delete' ? '#ef5350' : (hoveredButtonKey === 'delete-main' ? '#ef5350' : (isLight ? '#131722' : '#d1d4dc')),
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            transition: 'background-color 0.12s, color 0.12s'
          }}
        >
          {(() => {
            const TrashIcon = sidebarIcons['deleteBtn'];
            return TrashIcon ? <TrashIcon width={20} height={20} /> : <Trash2 size={20} />;
          })()}
        </button>

        {/* Popout Disclosure/Arrow Tab */}
        {(hoveredButtonKey?.startsWith('delete') || activePopover === 'delete') && (
          <button
            className="trash-chevron-btn"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              openDeletePopover(e.currentTarget.parentElement || e.currentTarget);
            }}
            onMouseEnter={() => setHoveredButtonKey('delete-arrow')}
            onMouseLeave={() => setHoveredButtonKey('delete-row')}
            title="Remove options"
            style={{
              position: 'absolute',
              right: '0px',
              top: '0px',
              width: '12px',
              height: '34px',
              backgroundColor: activePopover === 'delete' 
                ? '#ef5350' 
                : (hoveredButtonKey === 'delete-arrow' 
                  ? (isLight ? '#dde0e8' : '#2a2e39') 
                  : (isLight ? '#ebedf2' : '#1f222e')),
              border: isLight ? '1px solid #e0e3eb' : '1px solid rgba(255, 255, 255, 0.05)',
              borderLeft: 'none',
              borderTopRightRadius: '4px',
              borderBottomRightRadius: '4px',
              borderTopLeftRadius: '0px',
              borderBottomLeftRadius: '0px',
              color: activePopover === 'delete' ? '#ffffff' : (isLight ? '#131722' : '#d1d4dc'),
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              boxShadow: isLight ? '2px 0 6px rgba(0, 0, 0, 0.08)' : '2px 0 6px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.12s ease',
              zIndex: 10
            }}
          >
            <ChevronRight
              size={10}
              style={{
                transform: activePopover === 'delete' ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease'
              }}
            />
          </button>
        )}
      </div>

      {/* Favorites Star */}
      <button
        onClick={() => setShowFavoritesToolbar(prev => !prev)}
        onMouseEnter={() => setHoveredButtonKey('favorites-main')}
        onMouseLeave={() => setHoveredButtonKey(null)}
        title="Favorites Toolbar"
        style={{
          backgroundColor: showFavoritesToolbar ? 'rgba(245, 197, 24, 0.12)' : (hoveredButtonKey === 'favorites-main' ? (isLight ? '#ebedf2' : 'rgba(255, 255, 255, 0.08)') : 'transparent'),
          border: 'none',
          borderRadius: '4px',
          color: showFavoritesToolbar ? '#f5c518' : (hoveredButtonKey === 'favorites-main' ? '#f5c518' : (isLight ? '#131722' : '#d1d4dc')),
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '34px',
          height: '34px',
          transition: 'all 0.15s ease',
          flexShrink: 0
        }}
      >
        <Star size={20} fill={showFavoritesToolbar ? '#f5c518' : 'none'} />
      </button>

      {/* Sub-Panel Overlay (Flyout Menu matching TradingView) */}
      {activePopover === 'magnet' && (() => {
        const isLight = isLightChromeTheme();
        return createPortal(
          <div
            ref={popoverRef}
            className="custom-tool-popover-menu"
            style={{
              position: 'fixed',
              left: `${popoverCoords.left}px`,
              top: `${popoverCoords.top}px`,
              maxHeight: `${popoverCoords.maxHeight}px`,
              overflowY: 'auto',
              width: '130px',
              backgroundColor: isLight ? '#ffffff' : '#1e222d',
              border: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39',
              borderRadius: '6px',
              boxShadow: isLight ? '0 8px 24px rgba(0, 0, 0, 0.12)' : '0 8px 24px rgba(0, 0, 0, 0.7)',
              zIndex: 200000,
              padding: '6px',
              color: isLight ? '#131722' : '#d1d4dc',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            {/* Weak Magnet */}
            <div
              onClick={() => handleSelectMagnetMode('weak_magnet')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                color: magnetMode === 'weak_magnet' ? '#2962ff' : (isLight ? '#131722' : '#d1d4dc'),
                backgroundColor: magnetMode === 'weak_magnet' ? 'rgba(41, 98, 255, 0.12)' : 'transparent',
                fontWeight: magnetMode === 'weak_magnet' ? '600' : 'normal',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = magnetMode === 'weak_magnet' ? 'rgba(41, 98, 255, 0.18)' : (isLightChromeTheme() ? '#f0f3fa' : 'rgba(255, 255, 255, 0.05)');
                e.currentTarget.style.color = magnetMode === 'weak_magnet' ? '#2962ff' : (isLightChromeTheme() ? '#000000' : '#ffffff');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = magnetMode === 'weak_magnet' ? 'rgba(41, 98, 255, 0.12)' : 'transparent';
                e.currentTarget.style.color = magnetMode === 'weak_magnet' ? '#2962ff' : (isLightChromeTheme() ? '#131722' : '#d1d4dc');
              }}
            >
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: magnetMode === 'weak_magnet' ? '#2962ff' : 'transparent' }} />
              Weak Magnet
            </div>

            {/* Strong Magnet */}
            <div
              onClick={() => handleSelectMagnetMode('strong_magnet')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                color: magnetMode === 'strong_magnet' ? '#2962ff' : (isLight ? '#131722' : '#d1d4dc'),
                backgroundColor: magnetMode === 'strong_magnet' ? 'rgba(41, 98, 255, 0.12)' : 'transparent',
                fontWeight: magnetMode === 'strong_magnet' ? '600' : 'normal',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = magnetMode === 'strong_magnet' ? 'rgba(41, 98, 255, 0.18)' : (isLightChromeTheme() ? '#f0f3fa' : 'rgba(255, 255, 255, 0.05)');
                e.currentTarget.style.color = magnetMode === 'strong_magnet' ? '#2962ff' : (isLightChromeTheme() ? '#000000' : '#ffffff');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = magnetMode === 'strong_magnet' ? 'rgba(41, 98, 255, 0.12)' : 'transparent';
                e.currentTarget.style.color = magnetMode === 'strong_magnet' ? '#2962ff' : (isLightChromeTheme() ? '#131722' : '#d1d4dc');
              }}
            >
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: magnetMode === 'strong_magnet' ? '#2962ff' : 'transparent' }} />
              Strong Magnet
            </div>
          </div>,
          document.body
        );
      })()}

      {activePopover === 'delete' && (() => {
        const isLight = isLightChromeTheme();
        return createPortal(
          <div
            ref={popoverRef}
            className="custom-tool-popover-menu"
            style={{
              position: 'fixed',
              left: `${popoverCoords.left}px`,
              top: `${popoverCoords.top}px`,
              maxHeight: `${popoverCoords.maxHeight}px`,
              overflowY: 'auto',
              width: '260px',
              backgroundColor: isLight ? '#ffffff' : '#1e222d',
              border: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39',
              borderRadius: '6px',
              boxShadow: isLight ? '0 8px 24px rgba(0, 0, 0, 0.12)' : '0 8px 24px rgba(0, 0, 0, 0.7)',
              zIndex: 200000,
              padding: '6px',
              color: isLight ? '#131722' : '#d1d4dc',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}
          >
            {/* Remove Drawings */}
            <div
              onClick={() => {
                handleRemoveDrawings();
                setActivePopover(null);
              }}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                cursor: 'pointer',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'background-color 0.15s, color 0.15s',
                color: isLight ? '#131722' : '#d1d4dc'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isLightChromeTheme() ? '#f0f3fa' : '#2a2e39';
                e.currentTarget.style.color = isLightChromeTheme() ? '#000000' : '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isLightChromeTheme() ? '#131722' : '#d1d4dc';
              }}
            >
              <span>Remove Drawings</span>
              <span style={{ fontSize: '11px', color: '#787b86' }}>{drawingsCount}</span>
            </div>

            {/* Remove Indicators */}
            <div
              onClick={() => {
                handleRemoveIndicators();
                setActivePopover(null);
              }}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                cursor: 'pointer',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'background-color 0.15s, color 0.15s',
                color: isLight ? '#131722' : '#d1d4dc'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isLightChromeTheme() ? '#f0f3fa' : '#2a2e39';
                e.currentTarget.style.color = isLightChromeTheme() ? '#000000' : '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isLightChromeTheme() ? '#131722' : '#d1d4dc';
              }}
            >
              <span>Remove Indicators</span>
              <span style={{ fontSize: '11px', color: '#787b86' }}>{indicatorsCount}</span>
            </div>

            {/* Remove Drawings & Indicators */}
            <div
              onClick={() => {
                handleRemoveBoth();
                setActivePopover(null);
              }}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                cursor: 'pointer',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'background-color 0.15s, color 0.15s',
                color: isLight ? '#131722' : '#d1d4dc',
                borderTop: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39',
                marginTop: '4px',
                paddingTop: '8px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isLightChromeTheme() ? '#f0f3fa' : '#2a2e39';
                e.currentTarget.style.color = isLightChromeTheme() ? '#000000' : '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isLightChromeTheme() ? '#131722' : '#d1d4dc';
              }}
            >
              <span>Remove Drawings & Indicators</span>
              <span style={{ fontSize: '11px', color: '#787b86' }}>{drawingsCount + indicatorsCount}</span>
            </div>
          </div>,
          document.body
        );
      })()}

      {activePopover === 'visibility' && (() => {
        const isLight = isLightChromeTheme();
        return createPortal(
          <div
            ref={popoverRef}
            className="custom-tool-popover-menu"
            style={{
              position: 'fixed',
              left: `${popoverCoords.left}px`,
              top: `${popoverCoords.top}px`,
              maxHeight: `${popoverCoords.maxHeight}px`,
              overflowY: 'auto',
              width: '150px',
              backgroundColor: isLight ? '#ffffff' : '#1e222d',
              border: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39',
              borderRadius: '6px',
              boxShadow: isLight ? '0 8px 24px rgba(0, 0, 0, 0.12)' : '0 8px 24px rgba(0, 0, 0, 0.7)',
              zIndex: 200000,
              padding: '6px',
              color: isLight ? '#131722' : '#d1d4dc',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            {/* Hide Drawings */}
            <div
              onClick={() => handleSelectVisibility('hide_drawings')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                color: visibilityState === 'hide_drawings' ? '#2962ff' : (isLight ? '#131722' : '#d1d4dc'),
                backgroundColor: visibilityState === 'hide_drawings' ? 'rgba(41, 98, 255, 0.12)' : 'transparent',
                fontWeight: visibilityState === 'hide_drawings' ? '600' : 'normal',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = visibilityState === 'hide_drawings' ? 'rgba(41, 98, 255, 0.18)' : (isLightChromeTheme() ? '#f0f3fa' : 'rgba(255, 255, 255, 0.05)');
                e.currentTarget.style.color = visibilityState === 'hide_drawings' ? '#2962ff' : (isLightChromeTheme() ? '#000000' : '#ffffff');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = visibilityState === 'hide_drawings' ? 'rgba(41, 98, 255, 0.12)' : 'transparent';
                e.currentTarget.style.color = visibilityState === 'hide_drawings' ? '#2962ff' : (isLightChromeTheme() ? '#131722' : '#d1d4dc');
              }}
            >
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: visibilityState === 'hide_drawings' ? '#2962ff' : 'transparent' }} />
              Hide Drawings
            </div>

            {/* Hide Indicators */}
            <div
              onClick={() => handleSelectVisibility('hide_indicators')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                color: visibilityState === 'hide_indicators' ? '#2962ff' : (isLight ? '#131722' : '#d1d4dc'),
                backgroundColor: visibilityState === 'hide_indicators' ? 'rgba(41, 98, 255, 0.12)' : 'transparent',
                fontWeight: visibilityState === 'hide_indicators' ? '600' : 'normal',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = visibilityState === 'hide_indicators' ? 'rgba(41, 98, 255, 0.18)' : (isLightChromeTheme() ? '#f0f3fa' : 'rgba(255, 255, 255, 0.05)');
                e.currentTarget.style.color = visibilityState === 'hide_indicators' ? '#2962ff' : (isLightChromeTheme() ? '#000000' : '#ffffff');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = visibilityState === 'hide_indicators' ? 'rgba(41, 98, 255, 0.12)' : 'transparent';
                e.currentTarget.style.color = visibilityState === 'hide_indicators' ? '#2962ff' : (isLightChromeTheme() ? '#131722' : '#d1d4dc');
              }}
            >
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: visibilityState === 'hide_indicators' ? '#2962ff' : 'transparent' }} />
              Hide Indicators
            </div>

            {/* Hide All */}
            <div
              onClick={() => handleSelectVisibility('hide_all')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                color: visibilityState === 'hide_all' ? '#2962ff' : (isLight ? '#131722' : '#d1d4dc'),
                backgroundColor: visibilityState === 'hide_all' ? 'rgba(41, 98, 255, 0.12)' : 'transparent',
                fontWeight: visibilityState === 'hide_all' ? '600' : 'normal',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = visibilityState === 'hide_all' ? 'rgba(41, 98, 255, 0.18)' : (isLightChromeTheme() ? '#f0f3fa' : 'rgba(255, 255, 255, 0.05)');
                e.currentTarget.style.color = visibilityState === 'hide_all' ? '#2962ff' : (isLightChromeTheme() ? '#000000' : '#ffffff');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = visibilityState === 'hide_all' ? 'rgba(41, 98, 255, 0.12)' : 'transparent';
                e.currentTarget.style.color = visibilityState === 'hide_all' ? '#2962ff' : (isLightChromeTheme() ? '#131722' : '#d1d4dc');
              }}
            >
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: visibilityState === 'hide_all' ? '#2962ff' : 'transparent' }} />
              Hide All
            </div>

            {/* Show All */}
            <div
              onClick={() => handleSelectVisibility('show_all')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                color: visibilityState === 'show_all' ? '#2962ff' : (isLight ? '#131722' : '#d1d4dc'),
                backgroundColor: visibilityState === 'show_all' ? 'rgba(41, 98, 255, 0.12)' : 'transparent',
                fontWeight: visibilityState === 'show_all' ? '600' : 'normal',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = visibilityState === 'show_all' ? 'rgba(41, 98, 255, 0.18)' : (isLightChromeTheme() ? '#f0f3fa' : 'rgba(255, 255, 255, 0.05)');
                e.currentTarget.style.color = visibilityState === 'show_all' ? '#2962ff' : (isLightChromeTheme() ? '#000000' : '#ffffff');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = visibilityState === 'show_all' ? 'rgba(41, 98, 255, 0.12)' : 'transparent';
                e.currentTarget.style.color = visibilityState === 'show_all' ? '#2962ff' : (isLightChromeTheme() ? '#131722' : '#d1d4dc');
              }}
            >
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: visibilityState === 'show_all' ? '#2962ff' : 'transparent' }} />
              Show All
            </div>
          </div>,
          document.body
        );
      })()}

      {activePopover === 'emoji' && createPortal(
        <div
          ref={popoverRef}
          className="custom-tool-popover-menu"
          style={{
            position: 'fixed',
            left: `${popoverCoords.left}px`,
            top: `${popoverCoords.top}px`,
            maxHeight: `${popoverCoords.maxHeight}px`,
            zIndex: 200000,
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.75)'
          }}
        >
          <EmojiStickerPicker
            onSelect={(emoji) => {
              (window as any).__current_selected_2d_emoji = emoji.unified;

              // Preload 2D vector graphic
              const localSrc = `/emojis/twemoji/${emoji.unified}.svg`;
              if (!(window as any).__local_2d_emoji_cache) {
                (window as any).__local_2d_emoji_cache = {};
              }
              const preImg = new Image();
              preImg.src = localSrc;
              (window as any).__local_2d_emoji_cache[localSrc] = preImg;

              handleSelectTool('emoji');
              setActivePopover(null);
            }}
            onClose={() => setActivePopover(null)}
          />
        </div>,
        document.body
      )}

      {activePopover && activePopover !== 'magnet' && activePopover !== 'delete' && (() => {
        const currentGroup = toolGroups.find(g => g.id === activePopover);
        if (!currentGroup) return null;
        const isLight = isLightChromeTheme();

        return createPortal(
          <div
            ref={popoverRef}
            className="custom-tool-popover-menu"
            style={{
              position: 'fixed',
              left: `${popoverCoords.left}px`,
              top: `${popoverCoords.top}px`,
              width: '260px',
              backgroundColor: isLight ? '#ffffff' : '#1e222d',
              border: isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39',
              borderRadius: '6px',
              boxShadow: isLight ? '0 8px 24px rgba(0, 0, 0, 0.12)' : '0 8px 24px rgba(0, 0, 0, 0.7)',
              zIndex: 200000,
              maxHeight: `${popoverCoords.maxHeight}px`,
              overflowY: 'auto',
              color: isLight ? '#131722' : '#d1d4dc'
            }}
          >
            {currentGroup.sections.map((section, sIdx) => (
              <div key={sIdx}>
                {section.name && (
                  <div
                    style={{
                      padding: '10px 16px 4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#787b86',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      borderTop: sIdx > 0 ? (isLight ? '1px solid #e0e3eb' : '1px solid #2a2e39') : 'none',
                      marginTop: sIdx > 0 ? '4px' : '0'
                    }}
                  >
                    {section.name}
                  </div>
                )}
                <div style={{ padding: '4px' }}>
                  {section.items.map(item => {
                    const isToolActive = activeTool === item.key;
                    return (
                      <div
                        key={item.key}
                        onClick={() => {
                          setSelectedTools(prev => ({ ...prev, [currentGroup.id]: item.key }));
                          handleSelectTool(item.key);
                        }}
                        style={{
                          margin: '2px 0',
                          padding: '8px 12px',
                          fontSize: '13px',
                          fontWeight: isToolActive ? 600 : 400,
                          cursor: 'pointer',
                          borderRadius: '6px',
                          backgroundColor: isToolActive 
                            ? (isLight ? 'rgba(41, 98, 255, 0.12)' : '#ffffff') 
                            : 'transparent',
                          color: isToolActive 
                            ? (isLight ? '#2962ff' : '#000000') 
                            : (isLight ? '#131722' : '#d1d4dc'),
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'background-color 0.15s, color 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          if (activeTool !== item.key) {
                            e.currentTarget.style.backgroundColor = isLightChromeTheme() ? '#f0f3fa' : '#2a2e39';
                            e.currentTarget.style.color = isLightChromeTheme() ? '#000000' : '#ffffff';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (activeTool !== item.key) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = isLightChromeTheme() ? '#131722' : '#d1d4dc';
                          }
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: '12px', color: 'inherit' }}>
                          {renderToolSvgIcon(item.key)}
                        </span>
                        <span style={{ flex: 1 }}>{item.label}</span>
                        {getShortcutForToolKey(item.key, customShortcuts) && (
                          <span style={{ fontSize: '11px', color: isToolActive ? (isLight ? '#2962ff' : '#5d606b') : '#787b86', marginRight: '12px', fontFamily: 'var(--font-sans)' }}>
                            {getShortcutForToolKey(item.key, customShortcuts)}
                          </span>
                        )}
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setFavorites(prev => ({ ...prev, [item.key]: !prev[item.key] }));
                          }}
                          style={{
                            cursor: 'pointer',
                            color: favorites[item.key] ? '#f5c518' : (isToolActive ? (isLight ? '#2962ff' : '#d1d4dc') : (isLight ? '#b2b5be' : '#434651')),
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                        >
                          <Star size={14} fill={favorites[item.key] ? '#f5c518' : 'none'} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>,
          document.body
        );
      })()}

      {showFavoritesToolbar && (
        <div
          className="custom-favorites-floating-toolbar custom-drawing-drag-toolbar"
          style={{
            position: 'fixed',
            left: `${favoritesPosition.x}px`,
            top: `${favoritesPosition.y}px`,
            backgroundColor: '#1e222d',
            border: '1px solid #2a2e39',
            borderRadius: '6px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            padding: '3px 6px',
            zIndex: 10000,
            userSelect: 'none',
            pointerEvents: 'auto',
            color: '#d1d4dc',
            fontFamily: "'Rubik', sans-serif",
            boxSizing: 'border-box',
            gap: '4px',
            height: '38px'
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag Handle */}
          <div
            onMouseDown={handleDragStart}
            title="Drag Toolbar"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isDragging ? 'grabbing' : 'grab',
              padding: '4px 2px',
              color: '#787b86',
              borderRadius: '4px',
              transition: 'color 0.12s'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#d1d4dc'}
            onMouseLeave={e => e.currentTarget.style.color = '#787b86'}
          >
            <GripVertical size={16} />
          </div>

          {/* Divider */}
          <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 2px' }} />

          {/* Favorite Items */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            {Object.keys(favorites).filter(key => favorites[key]).map(toolKey => {
              const isActive = activeTool === toolKey;
              let label = toolKey;
              for (const g of toolGroups) {
                for (const s of g.sections) {
                  const found = s.items.find(i => i.key === toolKey);
                  if (found) {
                    label = found.label;
                    break;
                  }
                }
              }

              return (
                <button
                  key={toolKey}
                  onClick={() => handleSelectTool(toolKey)}
                  title={label}
                  style={{
                    background: isActive ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
                    border: isActive ? '1px solid rgba(41, 98, 255, 0.5)' : 'none',
                    borderRadius: '4px',
                    color: isActive ? '#2979ff' : '#787b86',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    padding: '4px',
                    boxSizing: 'border-box',
                    transition: 'all 0.12s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = '#ffffff';
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = '#787b86';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {renderToolSvgIcon(toolKey)}
                </button>
              );
            })}
            
            {Object.keys(favorites).filter(key => favorites[key]).length === 0 && (
              <span style={{ fontSize: '11px', color: '#787b86', padding: '0 8px' }}>
                Star tools to add them here
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
