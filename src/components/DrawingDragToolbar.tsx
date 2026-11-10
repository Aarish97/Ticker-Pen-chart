import React, { useState, useEffect, useRef } from 'react';
import {
  GripVertical,
  Copy,
  Layers,
  ChevronsUp,
  ChevronUp,
  ChevronDown,
  ChevronsDown,
  Check,
  Eye
} from 'lucide-react';
import { LockbtnIcon, UnlockbtnIcon, DeletebtnIcon } from './SidebarIcons';
import ColorStylePicker, { parseColorAndAlpha, isColorTransparent } from './ColorStylePicker';

export type DrawingCategory = 'line' | 'channel' | 'shape' | 'brush' | 'simple';

export interface DrawingOverlayData {
  overlayId: string;
  overlayName: string;
  category: DrawingCategory;
  lineColor: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  lineOpacity: number;
  fillColor?: string;
  fillOpacity?: number;
  filled?: boolean;
  upFillColor?: string;
  upFillOpacity?: number;
  downFillColor?: string;
  downFillOpacity?: number;
  locked?: boolean;
  points?: Array<{ timestamp?: number; dataIndex?: number; value?: number }>;
  screenX?: number;
  screenY?: number;
}

const LINE_NAMES = new Set([
  'trend-line', 'trendLine',
  'horizontal-line', 'horizontalLine', 'horizontalStraightLine',
  'vertical-line', 'verticalLine', 'verticalStraightLine',
  'ray',
  'arrow',
  'extended-line', 'extendedLine',
  'cross-line', 'crossLine',
  'info-line', 'infoLine',
  'trend-angle', 'trendAngle',
  'horizontal-ray', 'horizontalRay', 'horizontalRayLine',
  'arrow-mark-up', 'arrowMarkUp',
  'arrow-mark-down', 'arrowMarkDown'
]);

const CHANNEL_NAMES = new Set([
  'parallel-channel', 'parallelChannel', 'parallelStraightLine',
  'regression-trend', 'regressionTrend',
  'flat-top-bottom', 'flatTopBottom',
  'disjoint-channel', 'disjointChannel'
]);

const SHAPE_NAMES = new Set([
  'rectangle',
  'rotated-rectangle', 'rotatedRectangle',
  'circle',
  'triangle',
  'ellipse',
  'arc',
  'path',
  'polyline',
  'curve',
  'double-curve', 'doubleCurve'
]);

const BRUSH_NAMES = new Set([
  'brush',
  'highlighter'
]);

const SIMPLE_TOOL_NAMES = new Set([
  // Gann Tools
  'gann-box', 'gannBox', 'box',
  'gann-fan', 'gannFan', 'fan',
  'gann-square', 'gannSquare', 'square',
  // Forecasting & Measurers (except measure)
  'price-range', 'priceRange',
  'date-range', 'dateRange',
  'date-price-range', 'datePriceRange',
  'forecast',
  'bars-pattern', 'barsPattern',
  'projection',
  // Annotations
  'anchored-text', 'anchoredText',
  'price-note', 'priceNote',
  'price-label', 'priceLabel',
  'comment',
  'signpost',
  'emoji'
]);

export function getDrawingCategory(name: string): DrawingCategory | null {
  if (LINE_NAMES.has(name)) return 'line';
  if (CHANNEL_NAMES.has(name)) return 'channel';
  if (SHAPE_NAMES.has(name)) return 'shape';
  if (BRUSH_NAMES.has(name)) return 'brush';
  if (SIMPLE_TOOL_NAMES.has(name)) return 'simple';
  return null;
}

export function formatToolTitle(name: string): string {
  if (!name) return 'Drawing';
  const spaced = name
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .trim();
  return spaced
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(char => char + char).join('');
  }
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return { r: 41, g: 98, b: 255 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

export const DrawingDragToolbar: React.FC = () => {
  const [activeDrawing, setActiveDrawing] = useState<DrawingOverlayData | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number }>({
    x: 64,
    y: 140
  });
  const [isToolbarDragging, setIsToolbarDragging] = useState(false);
  const toolbarDragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Dropdowns
  const [isWidthDropdownOpen, setIsWidthDropdownOpen] = useState(false);
  const [isStyleDropdownOpen, setIsStyleDropdownOpen] = useState(false);
  const [isLayersDropdownOpen, setIsLayersDropdownOpen] = useState(false);

  // References
  const widthBtnRef = useRef<HTMLButtonElement>(null);
  const styleBtnRef = useRef<HTMLButtonElement>(null);

  // Apply real-time update to the active chart
  const applyDrawingUpdate = (updatedProps: Partial<DrawingOverlayData>) => {
    setActiveDrawing(prev => {
      if (!prev) return null;
      const next = { ...prev, ...updatedProps };
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        const overlays = typeof activeChart.getOverlays === 'function' ? activeChart.getOverlays() : [];
        const target = overlays.find((o: any) => o.id === next.overlayId);
        if (target) {
          if (!target.extendData) target.extendData = {};
          if (!target.styles) target.styles = {};

          if (updatedProps.lineColor !== undefined) {
            target.extendData.lineColor = updatedProps.lineColor;
            target.extendData.color = updatedProps.lineColor;
            target.extendData.strokeColor = updatedProps.lineColor;
            if (!target.styles.line) target.styles.line = {};
            target.styles.line.color = updatedProps.lineColor;
            target.styles.color = updatedProps.lineColor;
            if (Array.isArray(target.styles.lines) && target.styles.lines.length > 0) {
              target.styles.lines.forEach((l: any) => { if (l) l.color = updatedProps.lineColor; });
            }
            if (target.styles.polygon) {
              target.styles.polygon.borderColor = updatedProps.lineColor;
            }
            if (target.styles.rect) {
              target.styles.rect.borderColor = updatedProps.lineColor;
            }
            if (target.styles.circle) {
              target.styles.circle.borderColor = updatedProps.lineColor;
            }
          }
          if (updatedProps.lineOpacity !== undefined) {
            target.extendData.lineOpacity = updatedProps.lineOpacity;
          }
          if (updatedProps.lineWidth !== undefined) {
            target.extendData.lineWidth = updatedProps.lineWidth;
            target.extendData.size = updatedProps.lineWidth;
            target.extendData.trendlineWidth = updatedProps.lineWidth;
            target.extendData.levelLineWidth = updatedProps.lineWidth;
            target.extendData.medianWidth = updatedProps.lineWidth;
            target.extendData.gridLineWidth = updatedProps.lineWidth;
            target.extendData.channelLineWidth = updatedProps.lineWidth;
            target.extendData.brushSize = updatedProps.lineWidth;
            target.extendData.highlighterWidth = updatedProps.lineWidth;
            target.extendData.borderSize = updatedProps.lineWidth;

            if (!target.styles) target.styles = {};
            target.styles.size = updatedProps.lineWidth;
            target.styles.lineWidth = updatedProps.lineWidth;
            target.styles.borderSize = updatedProps.lineWidth;

            if (!target.styles.line) target.styles.line = {};
            target.styles.line.size = updatedProps.lineWidth;
            target.styles.line.lineWidth = updatedProps.lineWidth;

            if (Array.isArray(target.styles.lines)) {
              target.styles.lines.forEach((l: any) => {
                if (l) {
                  l.size = updatedProps.lineWidth;
                  l.lineWidth = updatedProps.lineWidth;
                }
              });
            }
            if (target.styles.polygon) {
              target.styles.polygon.borderSize = updatedProps.lineWidth;
              target.styles.polygon.size = updatedProps.lineWidth;
            }
            if (target.styles.rect) {
              target.styles.rect.borderSize = updatedProps.lineWidth;
              target.styles.rect.size = updatedProps.lineWidth;
            }
            if (target.styles.circle) {
              target.styles.circle.borderSize = updatedProps.lineWidth;
              target.styles.circle.size = updatedProps.lineWidth;
            }
            if (target.styles.arc) {
              target.styles.arc.borderSize = updatedProps.lineWidth;
              target.styles.arc.size = updatedProps.lineWidth;
            }
          }
          if (updatedProps.lineStyle !== undefined) {
            target.extendData.lineStyle = updatedProps.lineStyle;
            target.extendData.lineDash = updatedProps.lineStyle === 'dashed' ? [6, 6] : updatedProps.lineStyle === 'dotted' ? [2, 3] : [];
            if (!target.styles.line) target.styles.line = {};
            target.styles.line.style = updatedProps.lineStyle;
            target.styles.line.dash = target.extendData.lineDash;
            if (Array.isArray(target.styles.lines) && target.styles.lines.length > 0) {
              target.styles.lines.forEach((l: any) => { if (l) l.style = updatedProps.lineStyle; });
            }
          }
          if (updatedProps.fillColor !== undefined) {
            target.extendData.fillColor = updatedProps.fillColor;
            if (!target.styles.polygon) target.styles.polygon = {};
            target.styles.polygon.color = updatedProps.fillColor;
            target.styles.fillColor = updatedProps.fillColor;
            if (target.styles.rect) target.styles.rect.color = updatedProps.fillColor;
            if (target.styles.circle) target.styles.circle.color = updatedProps.fillColor;
          }
          if (updatedProps.upFillColor !== undefined) {
            target.extendData.upFillColor = updatedProps.upFillColor;
            target.extendData.upperFillColor = updatedProps.upFillColor;
          }
          if (updatedProps.upFillOpacity !== undefined) {
            target.extendData.upFillOpacity = updatedProps.upFillOpacity;
          }
          if (updatedProps.downFillColor !== undefined) {
            target.extendData.downFillColor = updatedProps.downFillColor;
            target.extendData.lowerFillColor = updatedProps.downFillColor;
          }
          if (updatedProps.downFillOpacity !== undefined) {
            target.extendData.downFillOpacity = updatedProps.downFillOpacity;
          }
          if (updatedProps.fillOpacity !== undefined) {
            target.extendData.fillOpacity = updatedProps.fillOpacity;
          }
          if (updatedProps.filled !== undefined) {
            target.extendData.filled = updatedProps.filled;
          }
          if (updatedProps.locked !== undefined) {
            target.lock = updatedProps.locked;
            target.extendData.locked = updatedProps.locked;
          }

          if (typeof activeChart.overrideOverlay === 'function') {
            activeChart.overrideOverlay({
              id: target.id,
              styles: target.styles,
              extendData: target.extendData,
              lock: target.lock
            });
          }
          if (typeof activeChart.updatePane === 'function') {
            activeChart.updatePane(1);
          }
          if (typeof activeChart.invalidate === 'function') {
            activeChart.invalidate();
          }
        }
      }
      return next;
    });
  };

  // Hide overlay
  const handleHideDrawing = () => {
    if (!activeDrawing) return;
    const activeChart = (window as any).__active_chart_instance__;
    if (activeChart && typeof activeChart.overrideOverlay === 'function') {
      activeChart.overrideOverlay({
        id: activeDrawing.overlayId,
        visible: false
      });
      if (typeof activeChart.invalidate === 'function') {
        activeChart.invalidate();
      }
    }
    setActiveDrawing(null);
    window.dispatchEvent(new CustomEvent('update-layer-panel'));
    window.dispatchEvent(new CustomEvent('save-history-state'));
  };

  // Reorder overlay in chart stack
  const reorderActiveDrawing = (action: 'front' | 'forward' | 'backward' | 'back') => {
    if (!activeDrawing) return;
    const activeChart = (window as any).__active_chart_instance__;
    if (!activeChart || typeof activeChart.getOverlays !== 'function') return;

    const allOverlays = activeChart.getOverlays() || [];
    const userOverlays = allOverlays.filter((o: any) => o.id && o.name !== 'future-time-scale');
    if (userOverlays.length <= 1) return;

    const currentVisualList = [...userOverlays].reverse();
    const fromVisualIdx = currentVisualList.findIndex((o: any) => o.id === activeDrawing.overlayId);
    if (fromVisualIdx === -1) return;

    let destVisualIdx = fromVisualIdx;
    if (action === 'front') {
      destVisualIdx = 0;
    } else if (action === 'forward') {
      destVisualIdx = Math.max(0, fromVisualIdx - 1);
    } else if (action === 'backward') {
      destVisualIdx = Math.min(currentVisualList.length - 1, fromVisualIdx + 1);
    } else if (action === 'back') {
      destVisualIdx = currentVisualList.length - 1;
    }

    if (destVisualIdx === fromVisualIdx) return;

    const [movedItem] = currentVisualList.splice(fromVisualIdx, 1);
    currentVisualList.splice(destVisualIdx, 0, movedItem);

    const newActualStack = [...currentVisualList].reverse();

    newActualStack.forEach((o: any, idx: number) => {
      const newZ = (idx + 1) * 10;
      try {
        if (typeof activeChart.overrideOverlay === 'function') {
          activeChart.overrideOverlay({ id: o.id, zLevel: newZ });
        }
      } catch (e) {}
      o.zLevel = newZ;
      if (typeof o.setPrevZLevel === 'function') {
        o.setPrevZLevel(newZ);
      }
    });

    const coreChart = (activeChart as any)._chartApi || activeChart;
    const store = coreChart?._chartStore || (activeChart as any)?._chartStore;
    if (store && store._overlays) {
      try {
        store._overlays.forEach((paneOverlays: any[]) => {
          if (Array.isArray(paneOverlays)) {
            paneOverlays.sort((a, b) => (Number(a.zLevel) || 0) - (Number(b.zLevel) || 0));
          }
        });
        if (typeof store._sortOverlays === 'function') {
          store._sortOverlays();
        }
      } catch (e) {}
    }

    if (typeof activeChart.updatePane === 'function') activeChart.updatePane(1);
    if (typeof activeChart.invalidate === 'function') activeChart.invalidate();

    // Notify layer panel for visual refresh
    window.dispatchEvent(new CustomEvent('reorder-drawing-layer', { detail: { overlayId: activeDrawing.overlayId } }));
    window.dispatchEvent(new CustomEvent('update-layer-panel'));
    setTimeout(() => window.dispatchEvent(new CustomEvent('save-history-state')), 50);
  };

  // Event Listeners
  useEffect(() => {
    const handleOpenToolbar = (e: Event) => {
      const detail = (e as CustomEvent).detail as DrawingOverlayData;
      if (!detail || !detail.overlayId) return;

      const activeChart = (window as any).__active_chart_instance__;
      let targetOverlay: any = null;
      if (activeChart && typeof activeChart.getOverlays === 'function') {
        const overlays = activeChart.getOverlays() || [];
        targetOverlay = overlays.find((o: any) => o.id === detail.overlayId);
      }

      const overlayName = detail.overlayName || targetOverlay?.name || 'trend-line';
      const category = detail.category || getDrawingCategory(overlayName) || 'line';

      const defaultColor = (overlayName === 'arrow-mark-up' || overlayName === 'arrowMarkUp')
        ? '#089981'
        : (overlayName === 'arrow-mark-down' || overlayName === 'arrowMarkDown')
        ? '#f23645'
        : '#2962ff';
      const isNoShadeTool = overlayName === 'path' ||
                            overlayName === 'curve' ||
                            overlayName === 'double-curve' ||
                            overlayName === 'doubleCurve';
      const isShapeOrChannel = (category === 'shape' || category === 'channel') && !isNoShadeTool;
      const defaultOpacity = 1;
      // 1. Line color: prioritize explicit detail/extendData
      const extendLineColor = detail.lineColor ?? targetOverlay?.extendData?.lineColor ?? targetOverlay?.extendData?.strokeColor ?? targetOverlay?.extendData?.color;
      let rawColor = extendLineColor;
      if (rawColor === undefined) {
        const styleColor = [
          targetOverlay?.styles?.line?.color,
          targetOverlay?.styles?.lines?.[0]?.color,
          targetOverlay?.styles?.color,
          targetOverlay?.styles?.polygon?.borderColor,
          targetOverlay?.styles?.rect?.borderColor,
          targetOverlay?.styles?.circle?.borderColor,
          targetOverlay?.styles?.arc?.borderColor,
          targetOverlay?.styles?.arc?.color
        ].find(c => c && !isColorTransparent(c));
        rawColor = styleColor !== undefined ? styleColor : defaultColor;
      }

      const isLineNone = isColorTransparent(rawColor) || detail.lineOpacity === 0 || targetOverlay?.extendData?.lineOpacity === 0;
      const { hex: parsedHex, opacity: parsedLineAlpha } = parseColorAndAlpha(rawColor, detail.lineOpacity ?? targetOverlay?.extendData?.lineOpacity ?? defaultOpacity);
      const lineAlpha = isLineNone ? 0 : ((detail.lineOpacity !== undefined)
        ? detail.lineOpacity
        : (targetOverlay?.extendData?.lineOpacity !== undefined)
        ? targetOverlay.extendData.lineOpacity
        : (parsedLineAlpha > 0 ? parsedLineAlpha : defaultOpacity));

      // 2. Fill color: prioritize explicit detail/extendData
      const extendFillColor = detail.fillColor ?? targetOverlay?.extendData?.fillColor;
      let rawFillColor = extendFillColor;
      if (rawFillColor === undefined) {
        const styleFill = [
          targetOverlay?.styles?.polygon?.color,
          targetOverlay?.styles?.polygon?.fillColor,
          targetOverlay?.styles?.rect?.fillColor,
          targetOverlay?.styles?.circle?.fillColor
        ].find(f => f && !isColorTransparent(f));
        rawFillColor = styleFill !== undefined
          ? styleFill
          : (category === 'channel' ? 'rgba(41, 98, 255, 0.15)' : category === 'shape' ? 'rgba(41, 98, 255, 0.2)' : 'transparent');
      }

      const isFillNone = !isShapeOrChannel || isColorTransparent(rawFillColor) || targetOverlay?.extendData?.filled === false || detail.filled === false || detail.fillOpacity === 0 || targetOverlay?.extendData?.fillOpacity === 0;
      const { opacity: parsedFillAlpha } = parseColorAndAlpha(rawFillColor, detail.fillOpacity ?? targetOverlay?.extendData?.fillOpacity ?? 0.2);
      const fillAlpha = isFillNone ? 0 : (detail.fillOpacity ?? targetOverlay?.extendData?.fillOpacity ?? (parsedFillAlpha > 0 ? parsedFillAlpha : 0.2));

      const widthCandidates = [
        targetOverlay?.extendData?.lineWidth,
        targetOverlay?.extendData?.trendlineWidth,
        targetOverlay?.extendData?.levelLineWidth,
        targetOverlay?.extendData?.medianWidth,
        targetOverlay?.extendData?.gridLineWidth,
        targetOverlay?.extendData?.channelLineWidth,
        targetOverlay?.extendData?.brushSize,
        targetOverlay?.extendData?.highlighterWidth,
        targetOverlay?.extendData?.borderSize,
        targetOverlay?.styles?.line?.size,
        targetOverlay?.styles?.line?.lineWidth,
        targetOverlay?.styles?.lines?.[0]?.size,
        targetOverlay?.styles?.lines?.[0]?.lineWidth,
        targetOverlay?.styles?.polygon?.borderSize,
        targetOverlay?.styles?.rect?.borderSize,
        targetOverlay?.styles?.circle?.borderSize,
        targetOverlay?.styles?.arc?.borderSize,
        targetOverlay?.styles?.lineWidth,
        targetOverlay?.styles?.size,
        targetOverlay?.styles?.borderSize,
        detail.lineWidth
      ];

      const validLineWidth = widthCandidates.find(w => typeof w === 'number' && w > 0) || (overlayName === 'highlighter' ? 20 : (isBrushTool ? 2 : 1));

      const isRegression = overlayName === 'regression-trend' || overlayName === 'regressionTrend';
      const defaultUpShade = 'rgba(0, 150, 136, 0.18)';
      const defaultDownShade = 'rgba(239, 83, 80, 0.16)';
      const rawUpFill = detail.upFillColor ?? targetOverlay?.extendData?.upFillColor ?? targetOverlay?.extendData?.upperFillColor ?? defaultUpShade;
      const rawDownFill = detail.downFillColor ?? targetOverlay?.extendData?.downFillColor ?? targetOverlay?.extendData?.lowerFillColor ?? defaultDownShade;

      const { hex: parsedUpHex, opacity: parsedUpAlpha } = parseColorAndAlpha(rawUpFill, 0.18);
      const { hex: parsedDownHex, opacity: parsedDownAlpha } = parseColorAndAlpha(rawDownFill, 0.16);

      const fullData: DrawingOverlayData = {
        overlayId: detail.overlayId,
        overlayName,
        category,
        lineColor: isLineNone ? 'transparent' : (parsedHex || rawColor),
        lineWidth: validLineWidth,
        lineStyle: targetOverlay?.extendData?.lineStyle || targetOverlay?.styles?.line?.style || detail.lineStyle || 'solid',
        lineOpacity: lineAlpha,
        fillColor: isFillNone ? 'transparent' : rawFillColor,
        fillOpacity: fillAlpha,
        filled: !isFillNone && (targetOverlay?.extendData?.filled ?? detail.filled ?? (category === 'shape' || category === 'channel')),
        upFillColor: parsedUpHex || '#009688',
        upFillOpacity: parsedUpAlpha,
        downFillColor: parsedDownHex || '#ef5350',
        downFillOpacity: parsedDownAlpha,
        locked: targetOverlay?.lock ?? targetOverlay?.extendData?.locked ?? detail.locked ?? false,
        points: detail.points || targetOverlay?.points || [],
        screenX: detail.screenX,
        screenY: detail.screenY
      };

      setActiveDrawing(fullData);

      setToolbarPos(curr => {
        if (curr && activeDrawing && activeDrawing.overlayId === detail.overlayId) {
          return curr;
        }
        return {
          x: 64,
          y: 140
        };
      });
    };

    const handleCloseToolbar = (e?: Event) => {
      const detail = (e as CustomEvent)?.detail;
      setActiveDrawing(prev => {
        if (!detail || !detail.overlayId || (prev && prev.overlayId === detail.overlayId)) {
          return null;
        }
        return null;
      });
      setIsWidthDropdownOpen(false);
      setIsStyleDropdownOpen(false);
      setIsLayersDropdownOpen(false);
    };

    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        !target.closest('.custom-drawing-drag-toolbar') &&
        !target.closest('.color-style-picker-portal') &&
        !target.closest('.color-picker-portal')
      ) {
        setIsWidthDropdownOpen(false);
        setIsStyleDropdownOpen(false);
        setIsLayersDropdownOpen(false);
      }
    };

    window.addEventListener('open-drawing-toolbar', handleOpenToolbar);
    window.addEventListener('close-drawing-toolbar', handleCloseToolbar);
    window.addEventListener('close-all-toolbars', handleCloseToolbar);
    window.addEventListener('active-tool-change', handleCloseToolbar);
    window.addEventListener('cursor-mode-change', handleCloseToolbar);
    window.addEventListener('tickerpen-draw-start', handleCloseToolbar);
    document.addEventListener('mousedown', handleDocumentClick);

    return () => {
      window.removeEventListener('open-drawing-toolbar', handleOpenToolbar);
      window.removeEventListener('close-drawing-toolbar', handleCloseToolbar);
      window.removeEventListener('close-all-toolbars', handleCloseToolbar);
      window.removeEventListener('active-tool-change', handleCloseToolbar);
      window.removeEventListener('cursor-mode-change', handleCloseToolbar);
      window.removeEventListener('tickerpen-draw-start', handleCloseToolbar);
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [activeDrawing]);

  // Toolbar Drag Handlers
  const handleToolbarDragStart = (e: React.MouseEvent) => {
    setIsToolbarDragging(true);
    toolbarDragStartRef.current = {
      x: e.clientX - toolbarPos.x,
      y: e.clientY - toolbarPos.y
    };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isToolbarDragging) {
        setToolbarPos({
          x: Math.max(48, Math.min(window.innerWidth - 320, e.clientX - toolbarDragStartRef.current.x)),
          y: Math.max(42, Math.min(window.innerHeight - 50, e.clientY - toolbarDragStartRef.current.y))
        });
      }
    };

    const handleMouseUp = () => {
      setIsToolbarDragging(false);
    };

    if (isToolbarDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isToolbarDragging]);

  useEffect(() => {
    const handleResize = () => {
      setToolbarPos(curr => {
        if (!curr) return curr;
        return {
          x: Math.max(48, Math.min(window.innerWidth - 320, curr.x)),
          y: Math.max(42, Math.min(window.innerHeight - 50, curr.y))
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Actions
  const handleDeleteDrawing = () => {
    if (!activeDrawing) return;
    const activeChart = (window as any).__active_chart_instance__;
    if (activeChart && typeof activeChart.removeOverlay === 'function') {
      try {
        activeChart.removeOverlay({ id: activeDrawing.overlayId });
      } catch (e) { }
      if (typeof activeChart.updatePane === 'function') {
        activeChart.updatePane(1);
      }
      if (typeof activeChart.invalidate === 'function') {
        activeChart.invalidate();
      }
    }
    setActiveDrawing(null);
  };

  const handleToggleLock = () => {
    if (!activeDrawing) return;
    const nextLocked = !activeDrawing.locked;
    applyDrawingUpdate({ locked: nextLocked });
  };

  const handleCloneDrawing = () => {
    if (!activeDrawing) return;
    const activeChart = (window as any).__active_chart_instance__;
    if (!activeChart) return;

    const overlays = typeof activeChart.getOverlays === 'function' ? activeChart.getOverlays() : [];
    const target = overlays.find((o: any) => o.id === activeDrawing.overlayId);
    if (!target) return;

    const clonedPoints = (target.points || []).map((pt: any) => {
      let nextVal = pt.value;
      if (typeof nextVal === 'number') {
        nextVal = nextVal * 0.998;
      }
      let nextIndex = pt.dataIndex;
      if (typeof nextIndex === 'number') {
        nextIndex = nextIndex + 3;
      }
      return {
        ...pt,
        value: nextVal,
        dataIndex: nextIndex,
        timestamp: pt.timestamp ? pt.timestamp + 3 * 60000 : undefined
      };
    });

    if (typeof activeChart.createOverlay === 'function') {
      try {
        activeChart.createOverlay({
          name: target.name,
          points: clonedPoints,
          styles: JSON.parse(JSON.stringify(target.styles || {})),
          extendData: JSON.parse(JSON.stringify(target.extendData || {}))
        });
        if (typeof activeChart.updatePane === 'function') {
          activeChart.updatePane(1);
        }
        if (typeof activeChart.invalidate === 'function') {
          activeChart.invalidate();
        }
      } catch (e) { }
    }
  };

  if (!activeDrawing) return null;

  const isSimpleTool = activeDrawing.category === 'simple';
  const isBrushTool = activeDrawing.category === 'brush';
  const isHighlighter = activeDrawing.overlayName === 'highlighter';
  const isChannel = activeDrawing.category === 'channel';
  const isShape = activeDrawing.category === 'shape';
  const isArrowMark = activeDrawing.overlayName === 'arrow-mark-up' ||
                      activeDrawing.overlayName === 'arrowMarkUp' ||
                      activeDrawing.overlayName === 'arrow-mark-down' ||
                      activeDrawing.overlayName === 'arrowMarkDown';
  const isRegression = activeDrawing.overlayName === 'regression-trend' ||
                       activeDrawing.overlayName === 'regressionTrend';
  const isNoShadeTool = activeDrawing.overlayName === 'path' ||
                        activeDrawing.overlayName === 'curve' ||
                        activeDrawing.overlayName === 'double-curve' ||
                        activeDrawing.overlayName === 'doubleCurve';

  const widthOptions = isHighlighter
    ? [8, 14, 20, 28, 36]
    : isBrushTool
    ? [1, 2, 4, 8, 12]
    : [1, 2, 3, 4];

  const isNearBottom = toolbarPos.y + 38 + 180 > window.innerHeight - 10;
  const isNearRight = toolbarPos.x + 180 > window.innerWidth - 10;

  return (
    <div
      className="custom-drawing-drag-toolbar"
      style={{
        position: 'fixed',
        left: `${toolbarPos.x}px`,
        top: `${toolbarPos.y}px`,
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
        onMouseDown={handleToolbarDragStart}
        title="Drag Toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isToolbarDragging ? 'grabbing' : 'grab',
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

      {!isSimpleTool && (
        <>
          {/* Main Color Picker */}
          <ColorStylePicker
            color={activeDrawing.lineColor}
            opacity={activeDrawing.lineOpacity}
            style={activeDrawing.lineStyle}
            hideStyleSelector={true}
            forceDark={true}
            onChange={(newColor, newOpacity, newStyle) => {
              const finalColor = newOpacity === 0 || newColor === 'transparent' ? 'transparent' : (newOpacity < 1 ? `rgba(${hexToRgb(newColor).r}, ${hexToRgb(newColor).g}, ${hexToRgb(newColor).b}, ${newOpacity})` : newColor);
              applyDrawingUpdate({
                lineColor: finalColor,
                lineOpacity: newOpacity,
                lineStyle: newStyle
              });
            }}
          />

          {/* Fill Color Picker for Standard Shapes / Channels */}
          {(isShape || isChannel) && !isRegression && !isNoShadeTool && (
            <ColorStylePicker
              color={activeDrawing.fillColor || 'transparent'}
              opacity={activeDrawing.fillOpacity ?? (activeDrawing.filled ? 0.2 : 0)}
              style="solid"
              isFillColorPicker={true}
              hideStyleSelector={true}
              forceDark={true}
              onChange={(newColor, newOpacity) => {
                const finalColor = newOpacity === 0 || newColor === 'transparent' ? 'transparent' : `rgba(${hexToRgb(newColor).r}, ${hexToRgb(newColor).g}, ${hexToRgb(newColor).b}, ${newOpacity})`;
                applyDrawingUpdate({
                  fillColor: finalColor,
                  fillOpacity: newOpacity,
                  filled: newOpacity > 0 && finalColor !== 'transparent'
                });
              }}
            />
          )}

          {/* Two Shades for Regression Trend */}
          {isRegression && (
            <>
              {/* Upper Shade Color Picker */}
              <div title="Upper Shade">
                <ColorStylePicker
                  color={activeDrawing.upFillColor || '#009688'}
                  opacity={activeDrawing.upFillOpacity ?? 0.18}
                  style="solid"
                  isFillColorPicker={true}
                  hideStyleSelector={true}
                  forceDark={true}
                  onChange={(newColor, newOpacity) => {
                    const finalColor = newOpacity === 0 || newColor === 'transparent' ? 'transparent' : `rgba(${hexToRgb(newColor).r}, ${hexToRgb(newColor).g}, ${hexToRgb(newColor).b}, ${newOpacity})`;
                    applyDrawingUpdate({
                      upFillColor: finalColor,
                      upFillOpacity: newOpacity,
                      filled: true
                    });
                  }}
                />
              </div>

              {/* Lower Shade Color Picker */}
              <div title="Lower Shade">
                <ColorStylePicker
                  color={activeDrawing.downFillColor || '#ef5350'}
                  opacity={activeDrawing.downFillOpacity ?? 0.16}
                  style="solid"
                  isFillColorPicker={true}
                  hideStyleSelector={true}
                  forceDark={true}
                  onChange={(newColor, newOpacity) => {
                    const finalColor = newOpacity === 0 || newColor === 'transparent' ? 'transparent' : `rgba(${hexToRgb(newColor).r}, ${hexToRgb(newColor).g}, ${hexToRgb(newColor).b}, ${newOpacity})`;
                    applyDrawingUpdate({
                      downFillColor: finalColor,
                      downFillOpacity: newOpacity,
                      filled: true
                    });
                  }}
                />
              </div>
            </>
          )}

          {/* Line Width Dropdown */}
          {!isArrowMark && (
            <div style={{ position: 'relative' }}>
              <button
                ref={widthBtnRef}
                onClick={() => {
                  setIsWidthDropdownOpen(prev => !prev);
                  setIsStyleDropdownOpen(false);
                  setIsLayersDropdownOpen(false);
                }}
                title="Line Width"
                style={{
                  background: isWidthDropdownOpen ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: isWidthDropdownOpen ? '#2979ff' : '#d1d4dc',
                  padding: '0 6px',
                  cursor: 'pointer',
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: '26px',
                  boxSizing: 'border-box'
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: '500', minWidth: '14px', textAlign: 'center' }}>
                  {activeDrawing.lineWidth}px
                </span>
                <ChevronDown size={12} color="#787b86" />
              </button>

              {isWidthDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: isNearBottom ? 'auto' : '32px',
                    bottom: isNearBottom ? '34px' : 'auto',
                    left: isNearRight ? 'auto' : '0',
                    right: isNearRight ? '0' : 'auto',
                    backgroundColor: '#1e222d',
                    border: '1px solid #2a2e39',
                    borderRadius: '6px',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.7)',
                    padding: '4px 0',
                    minWidth: '85px',
                    zIndex: 50
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {widthOptions.map(w => (
                    <div
                      key={w}
                      onClick={() => {
                        applyDrawingUpdate({ lineWidth: w });
                        setIsWidthDropdownOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '7px 10px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: activeDrawing.lineWidth === w ? '#2979ff' : '#d1d4dc',
                        backgroundColor: activeDrawing.lineWidth === w ? 'rgba(41, 98, 255, 0.12)' : 'transparent'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = activeDrawing.lineWidth === w ? 'rgba(41, 98, 255, 0.12)' : 'transparent'}
                    >
                      <span>{w}px</span>
                      {activeDrawing.lineWidth === w && <Check size={12} color="#2979ff" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Line Style Dropdown (Solid, Dashed, Dotted) */}
          {!isBrushTool && !isArrowMark && (
            <div style={{ position: 'relative' }}>
              <button
                ref={styleBtnRef}
                onClick={() => {
                  setIsStyleDropdownOpen(prev => !prev);
                  setIsWidthDropdownOpen(false);
                  setIsLayersDropdownOpen(false);
                }}
                title="Line Style"
                style={{
                  background: isStyleDropdownOpen ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: isStyleDropdownOpen ? '#2979ff' : '#d1d4dc',
                  padding: '0 6px',
                  cursor: 'pointer',
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: '26px',
                  boxSizing: 'border-box'
                }}
              >
                <svg width="24" height="12" viewBox="0 0 24 12" style={{ display: 'block' }}>
                  {activeDrawing.lineStyle === 'dashed' ? (
                    <line x1="0" y1="6" x2="24" y2="6" stroke="currentColor" strokeWidth="2" strokeDasharray="5, 3" />
                  ) : activeDrawing.lineStyle === 'dotted' ? (
                    <line x1="2" y1="6" x2="22" y2="6" stroke="currentColor" strokeWidth="2.5" strokeDasharray="0, 5" strokeLinecap="round" />
                  ) : (
                    <line x1="0" y1="6" x2="24" y2="6" stroke="currentColor" strokeWidth="2" />
                  )}
                </svg>
                <ChevronDown size={12} color="#787b86" />
              </button>

              {isStyleDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: isNearBottom ? 'auto' : '32px',
                    bottom: isNearBottom ? '34px' : 'auto',
                    left: isNearRight ? 'auto' : '0',
                    right: isNearRight ? '0' : 'auto',
                    backgroundColor: '#1e222d',
                    border: '1px solid #2a2e39',
                    borderRadius: '6px',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.7)',
                    padding: '4px 0',
                    minWidth: '100px',
                    zIndex: 50
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {(['solid', 'dashed', 'dotted'] as const).map(st => (
                    <div
                      key={st}
                      onClick={() => {
                        applyDrawingUpdate({ lineStyle: st });
                        setIsStyleDropdownOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '7px 10px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: activeDrawing.lineStyle === st ? '#2979ff' : '#d1d4dc',
                        backgroundColor: activeDrawing.lineStyle === st ? 'rgba(41, 98, 255, 0.12)' : 'transparent'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = activeDrawing.lineStyle === st ? 'rgba(41, 98, 255, 0.12)' : 'transparent'}
                    >
                      <svg width="40" height="10" viewBox="0 0 40 10" style={{ display: 'block' }}>
                        {st === 'dashed' ? (
                          <line x1="0" y1="5" x2="40" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray="6, 3" />
                        ) : st === 'dotted' ? (
                          <line x1="2" y1="5" x2="38" y2="5" stroke="currentColor" strokeWidth="2.5" strokeDasharray="0, 5" strokeLinecap="round" />
                        ) : (
                          <line x1="0" y1="5" x2="40" y2="5" stroke="currentColor" strokeWidth="2" />
                        )}
                      </svg>
                      {activeDrawing.lineStyle === st && <Check size={12} color="#2979ff" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />
        </>
      )}

      {/* Lock Button */}
      <button
        onClick={handleToggleLock}
        title={activeDrawing.locked ? 'Unlock Drawing' : 'Lock Drawing'}
        style={{
          background: activeDrawing.locked ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
          border: activeDrawing.locked ? '1px solid #2962ff' : 'none',
          color: activeDrawing.locked ? '#2979ff' : '#787b86',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '26px',
          width: '26px',
          boxSizing: 'border-box'
        }}
        onMouseEnter={e => { if (!activeDrawing.locked) { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; } }}
        onMouseLeave={e => { if (!activeDrawing.locked) { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
      >
        {activeDrawing.locked ? <LockbtnIcon width={16} height={16} /> : <UnlockbtnIcon width={16} height={16} />}
      </button>

      {/* Hide / Visibility (Eye) Button */}
      <button
        onClick={handleHideDrawing}
        title="Hide"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#787b86',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '26px',
          width: '26px',
          boxSizing: 'border-box'
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <Eye size={15} />
      </button>

      {/* Clone / Duplicate Button */}
      <button
        onClick={handleCloneDrawing}
        title="Duplicate"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#787b86',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '26px',
          width: '26px',
          boxSizing: 'border-box'
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <Copy size={15} />
      </button>

      {/* Visual Order / Layers Dropdown Button */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsLayersDropdownOpen(prev => !prev);
            setIsWidthDropdownOpen(false);
            setIsStyleDropdownOpen(false);
          }}
          title="Visual Order (Layers)"
          style={{
            background: isLayersDropdownOpen ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
            border: isLayersDropdownOpen ? '1px solid #2962ff' : 'none',
            color: isLayersDropdownOpen ? '#2979ff' : '#787b86',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '26px',
            width: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => { if (!isLayersDropdownOpen) { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; } }}
          onMouseLeave={e => { if (!isLayersDropdownOpen) { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
        >
          <Layers size={15} />
        </button>

        {isLayersDropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: isNearBottom ? 'auto' : '32px',
              bottom: isNearBottom ? '34px' : 'auto',
              left: isNearRight ? 'auto' : '0',
              right: isNearRight ? '0' : 'auto',
              backgroundColor: '#1e222d',
              border: '1px solid #2a2e39',
              borderRadius: '6px',
              boxShadow: '0 6px 18px rgba(0,0,0,0.7)',
              padding: '4px 0',
              minWidth: '150px',
              zIndex: 50
            }}
            onClick={e => e.stopPropagation()}
          >
            {[
              { action: 'front', label: 'Bring to Front', icon: ChevronsUp },
              { action: 'forward', label: 'Bring Forward', icon: ChevronUp },
              { action: 'backward', label: 'Send Backward', icon: ChevronDown },
              { action: 'back', label: 'Send to Back', icon: ChevronsDown }
            ].map(item => {
              const IconComponent = item.icon;
              return (
                <div
                  key={item.action}
                  onClick={() => {
                    reorderActiveDrawing(item.action as any);
                    setIsLayersDropdownOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 12px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: '#d1d4dc'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#d1d4dc';
                  }}
                >
                  <IconComponent size={14} color="#787b86" />
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

      {/* Delete Button */}
      <button
        onClick={handleDeleteDrawing}
        title="Delete (Del)"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#787b86',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '26px',
          width: '26px',
          boxSizing: 'border-box'
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#787b86'; e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <DeletebtnIcon width={16} height={16} />
      </button>
    </div>
  );
};

export default DrawingDragToolbar;
