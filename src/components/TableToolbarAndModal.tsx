import React, { useState, useEffect, useRef } from 'react';
import {
  Trash2,
  X,
  GripVertical,
  Sparkles,
  Download,
  Upload,
  Copy,
  ClipboardPaste,
  FileSpreadsheet,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  ChevronsDown,
  Layers,
  BookOpen,
  Edit2,
  Eye
} from 'lucide-react';
import { LockbtnIcon, UnlockbtnIcon, DeletebtnIcon } from './SidebarIcons';
import ColorStylePicker from './ColorStylePicker';
import CustomDropdown from './CustomDropdown';
import {
  resolveTablePlaceholders,
  evaluateTableData,
  indexToColLetter,
  SMART_TAGS_CATALOG,
  getActiveChartSymbol,
  getActiveChartTimeframe
} from '../ticker-pen-adapter-bridge';

export interface TableOverlayData {
  overlayId: string;
  overlayName?: string;
  rows: number;
  cols: number;
  tableData: string[][];
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  textColor: string;
  fontSize: number;
  textAlign: 'left' | 'center' | 'right';
  headerRow: boolean;
  headerBgColor: string;
  headerTextColor: string;
  zebraStriping: boolean;
  zebraColor: string;
  borderRadius: number;
  locked?: boolean;
  wrapText?: boolean;
  colRatios?: number[];
  rowRatios?: number[];
  screenX?: number;
  screenY?: number;
}

const FONT_SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32];

interface CustomCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
}

const CustomCheckbox = ({ checked, onChange, label }: CustomCheckboxProps) => (
  <label
    onClick={(e) => {
      e.stopPropagation();
      onChange(!checked);
    }}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      cursor: 'pointer',
      userSelect: 'none'
    }}
  >
    <div
      style={{
        width: '16px',
        height: '16px',
        borderRadius: '4px',
        border: checked ? '1px solid #ffffff' : '2px solid #868993',
        backgroundColor: checked ? '#ffffff' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
        boxSizing: 'border-box',
        flexShrink: 0
      }}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none" style={{ display: 'block' }}>
          <path
            d="M1.5 4L4 6.5L8.5 1.5"
            stroke="#131722"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
    {label && <span style={{ fontSize: '13px', color: '#d1d4dc' }}>{label}</span>}
  </label>
);

export const TABLE_PRESET_TEMPLATES = [
  {
    name: 'Live Risk & PnL Formula Sheet',
    icon: '⚡',
    rows: 4,
    cols: 5,
    headerRow: true,
    data: [
      ['Asset', 'Entry', 'Current Price', 'Amount', 'Unrealized PnL'],
      ['{symbol}', '90000', '{spot}', '0.5', '=(C2-B2)*D2'],
      ['ETHUSDT', '3000', '3200', '2.0', '=(C3-B3)*D3'],
      ['Total', '---', '---', '---', '=SUM(E2:E3)']
    ]
  },
  {
    name: 'Position Sizing Calculator',
    icon: '⚖️',
    rows: 4,
    cols: 6,
    headerRow: true,
    data: [
      ['Account $', 'Risk %', 'Entry', 'Stop Loss', 'Risk Amount $', 'Lot Size'],
      ['10000', '1.0', '{spot}', '{low}', '=A2*(B2/100)', '=ROUND(E2/ABS(C2-D2), 4)'],
      ['25000', '2.0', '{spot}', '{low}', '=A3*(B3/100)', '=ROUND(E3/ABS(C3-D3), 4)'],
      ['50000', '1.5', '{spot}', '{low}', '=A4*(B4/100)', '=ROUND(E4/ABS(C4-D4), 4)']
    ]
  },
  {
    name: 'Fibonacci Targets & Ext',
    icon: '📐',
    rows: 4,
    cols: 5,
    headerRow: true,
    data: [
      ['Swing High', 'Swing Low', '0.50 Eq Mid', '0.618 Pocket', '1.618 Extension'],
      ['{high}', '{low}', '=ROUND(C2, 2)', '=ROUND(B2+(A2-B2)*0.618, 2)', '=ROUND(A2+(A2-B2)*1.618, 2)'],
      ['98000', '92000', '=ROUND((A3+B3)/2, 2)', '=ROUND(B3+(A3-B3)*0.618, 2)', '=ROUND(A3+(A3-B3)*1.618, 2)'],
      ['---', '---', '---', '---', '---']
    ]
  },
  {
    name: 'Volatility & Trailing Stops',
    icon: '🎯',
    rows: 3,
    cols: 5,
    headerRow: true,
    data: [
      ['Asset', 'Spot Price', 'ATR (14)', '1.5x Trailing SL', 'Range Volatility %'],
      ['{symbol}', '{spot}', '{atr}', '=ROUND({spot}-({atr}*1.5), 2)', '=ROUND(({high}-{low})/{low}*100, 2)'],
      ['ETHUSDT', '3200', '45', '=ROUND(B3-(C3*1.5), 2)', '2.85']
    ]
  },
  {
    name: 'Trade Journal with Live R:R',
    icon: '📈',
    rows: 4,
    cols: 7,
    headerRow: true,
    data: [
      ['Pair', 'Side', 'Entry', 'SL', 'TP', 'Risk/Reward', 'Status'],
      ['{symbol}', '{side}', '{spot}', '{low}', '=ROUND(C2+ABS(C2-D2)*3, 2)', '=ROUND(ABS(E2-C2)/ABS(C2-D2), 2)', '=IF({spot}>=E2, "TP HIT", "ACTIVE")'],
      ['ETHUSDT', 'LONG', '3100', '3000', '3400', '=ROUND(ABS(E3-C3)/ABS(C3-D3), 2)', '=IF({spot}>=E3, "TP HIT", "ACTIVE")'],
      ['SOLUSDT', 'SHORT', '180', '190', '150', '=ROUND(ABS(E4-C4)/ABS(C4-D4), 2)', 'ACTIVE']
    ]
  },
  {
    name: 'Key S/R Levels',
    icon: '🎯',
    rows: 4,
    cols: 5,
    headerRow: true,
    data: [
      ['Level', 'Price', 'Type', 'Strength', 'Notes'],
      ['Resistance 1', '{high}', 'Supply', 'Major', 'Order Block / Reject'],
      ['Pivot Level', '{spot}', 'Equilibrium', 'Medium', 'Daily Midpoint'],
      ['Support 1', '{low}', 'Demand', 'Major', 'Key Discount Zone']
    ]
  },
  {
    name: 'Session Plan',
    icon: '🕒',
    rows: 4,
    cols: 5,
    headerRow: true,
    data: [
      ['Session', 'Open', 'High', 'Low', 'Bias'],
      ['Asian', '{spot}', '{high}', '{low}', 'Range / Consolidate'],
      ['London', '...', '...', '...', 'Breakout / Expansion'],
      ['New York', '...', '...', '...', 'Trend Continuation']
    ]
  },
  {
    name: 'Watchlist Matrix',
    icon: '👀',
    rows: 4,
    cols: 5,
    headerRow: true,
    data: [
      ['Symbol', 'TF', 'Bias', 'Key Level', 'Trigger'],
      ['{symbol}', '{tf}', 'Bullish', '{low}', '4H Close Above'],
      ['ETHUSDT', '1h', 'Neutral', '3,450', 'Volume Break'],
      ['SOLUSDT', '15m', 'Bullish', '180', 'Pullback Entry']
    ]
  },
  {
    name: 'Clean Grid (3x3)',
    icon: '📝',
    rows: 3,
    cols: 3,
    headerRow: false,
    data: [
      ['', '', ''],
      ['', '', ''],
      ['', '', '']
    ]
  }
];

const DEFAULT_TABLE_CONFIG: Omit<TableOverlayData, 'overlayId'> = {
  rows: 3,
  cols: 3,
  tableData: Array.from({ length: 3 }, () => Array(3).fill('')),
  backgroundColor: '#3c404b',
  borderColor: '#2962ff',
  borderWidth: 1,
  textColor: '#ffffff',
  fontSize: 14,
  textAlign: 'left',
  headerRow: false,
  headerBgColor: '#242836',
  headerTextColor: '#ffffff',
  zebraStriping: false,
  zebraColor: 'rgba(255, 255, 255, 0.04)',
  borderRadius: 6,
  wrapText: true
};

function parseColorAndOpacity(colorStr: string): { hex: string; opacity: number } {
  if (!colorStr || colorStr === 'transparent') return { hex: '#ffffff', opacity: 0 };
  if (colorStr.startsWith('rgba')) {
    const parts = colorStr.match(/[\d.]+/g);
    if (parts && parts.length >= 4) {
      const r = parseInt(parts[0]);
      const g = parseInt(parts[1]);
      const b = parseInt(parts[2]);
      const a = parseFloat(parts[3]);
      const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      return { hex, opacity: isNaN(a) ? 1 : a };
    }
  } else if (colorStr.startsWith('rgb')) {
    const parts = colorStr.match(/\d+/g);
    if (parts && parts.length >= 3) {
      const r = parseInt(parts[0]);
      const g = parseInt(parts[1]);
      const b = parseInt(parts[2]);
      return { hex: '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1), opacity: 1 };
    }
  } else if (colorStr.startsWith('#')) {
    return { hex: colorStr, opacity: 1 };
  }
  return { hex: '#ffffff', opacity: 1 };
}

function rgbaString(hex: string, opacity: number): string {
  if (opacity === 0 || hex === 'transparent') return 'transparent';
  if (opacity >= 1) return hex;
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${isNaN(r) ? 0 : r}, ${isNaN(g) ? 0 : g}, ${isNaN(b) ? 0 : b}, ${opacity})`;
}

// Convert 2D array to CSV text
function tableToCSV(tableData: string[][], resolveTags: boolean = true): string {
  const data = resolveTags ? evaluateTableData(tableData) : tableData;
  return data.map((row) =>
    row.map((cell) => {
      const escaped = String(cell || '').replace(/"/g, '""');
      return escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')
        ? `"${escaped}"`
        : escaped;
    }).join(',')
  ).join('\r\n');
}

// Convert 2D array to TSV (Tabs) for Excel / Google Sheets
function tableToTSV(tableData: string[][], resolveTags: boolean = true): string {
  const data = resolveTags ? evaluateTableData(tableData) : tableData;
  return data.map((row) =>
    row.map((cell) => cell || '').join('\t')
  ).join('\r\n');
}

// Convert 2D array to Markdown Table
function tableToMarkdown(tableData: string[][], headerRow: boolean = true, resolveTags: boolean = true): string {
  if (!tableData || tableData.length === 0) return '';
  const data = resolveTags ? evaluateTableData(tableData) : tableData;
  const lines: string[] = [];
  const cols = data[0].length;

  data.forEach((row, idx) => {
    const rowStr = '| ' + row.map((cell) => cell || '').join(' | ') + ' |';
    lines.push(rowStr);
    if (idx === 0 && headerRow) {
      lines.push('| ' + Array(cols).fill('---').join(' | ') + ' |');
    }
  });
  return lines.join('\n');
}

// Parse text/CSV/TSV string into 2D table grid
function parseImportedTableText(rawText: string): string[][] {
  const clean = rawText.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!clean) return [];

  const rawLines = clean.split('\n').filter((l) => l.trim().length > 0);
  const rows: string[][] = [];

  for (const line of rawLines) {
    if (line.includes('\t')) {
      // TSV line
      rows.push(line.split('\t').map((c) => c.trim()));
    } else if (line.startsWith('|') && line.endsWith('|')) {
      // Markdown table row
      if (line.replace(/[\s|:-]/g, '').length === 0) {
        // Divider row: | --- | --- |
        continue;
      }
      const parts = line.split('|').slice(1, -1).map((c) => c.trim());
      rows.push(parts);
    } else {
      // CSV line parsing with quote handling
      const cells: string[] = [];
      let inQuotes = false;
      let cur = '';
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          cells.push(cur.trim());
          cur = '';
        } else {
          cur += char;
        }
      }
      cells.push(cur.trim());
      rows.push(cells);
    }
  }

  // Normalize column count
  const maxCols = Math.max(1, ...rows.map((r) => r.length));
  return rows.map((r) => {
    while (r.length < maxCols) r.push('');
    return r;
  });
}

export const TableToolbarAndModal: React.FC = () => {
  const [activeTable, setActiveTable] = useState<TableOverlayData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialBackup, setModalInitialBackup] = useState<TableOverlayData | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'content' | 'style' | 'journal'>('content');

  // Floating Drag Bar Positioning & Drag State
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [isToolbarDragging, setIsToolbarDragging] = useState(false);
  const toolbarDragStartRef = useRef({ x: 0, y: 0 });

  // Modal Dragging State
  const [modalPos, setModalPos] = useState({ x: 300, y: 120 });
  const [isModalDragging, setIsModalDragging] = useState(false);
  const modalDragStartRef = useRef({ x: 0, y: 0 });

  // Preset templates flyout popover
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const templateButtonRef = useRef<HTMLButtonElement>(null);

  // Border Width Dropdown state
  const [isBorderWidthDropdownOpen, setIsBorderWidthDropdownOpen] = useState(false);
  const borderWidthBtnRef = useRef<HTMLButtonElement>(null);

  // Visual Order / Layers Dropdown state
  const [isLayersDropdownOpen, setIsLayersDropdownOpen] = useState(false);

  // Feature 5: Export / Import flyout menu
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Success toast indicator message
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 2400);
  };

  // Slash Autocomplete State in Modal Grid
  const [modalSlashTarget, setModalSlashTarget] = useState<{ r: number; c: number; query: string; selectedIdx: number } | null>(null);

  // Snapshot Name Editing State
  const [editingSnapshotId, setEditingSnapshotId] = useState<string | null>(null);
  const [editingSnapshotName, setEditingSnapshotName] = useState<string>('');

  const handleRenameSnapshot = (id: string, newName: string) => {
    try {
      const raw = localStorage.getItem('trading_table_journal_history');
      const list = raw ? JSON.parse(raw) : [];
      const trimmed = newName.trim();
      const updated = list.map((item: any) => {
        if (item.id === id) {
          return { ...item, name: trimmed || item.name || item.symbol || 'Snapshot' };
        }
        return item;
      });
      localStorage.setItem('trading_table_journal_history', JSON.stringify(updated));
      showToast('Snapshot name updated');
      setEditingSnapshotId(null);
      setActiveTable((prev) => (prev ? { ...prev } : null));
    } catch (e) {
      showToast('Failed to update name');
    }
  };

  const insertModalTag = (rIdx: number, cIdx: number, tag: string) => {
    if (!activeTable) return;
    const resolvedVal = resolveTablePlaceholders(tag);
    const currentVal = activeTable.tableData[rIdx]?.[cIdx] || '';
    const slashMatch = currentVal.match(/(?:\/|\{)([a-zA-Z0-9%_-]*)$/);
    let newVal = currentVal + resolvedVal;
    if (slashMatch) {
      const startIdx = currentVal.length - slashMatch[0].length;
      newVal = currentVal.slice(0, startIdx) + resolvedVal;
    }
    const updated = activeTable.tableData.map((r, rI) => {
      if (rI !== rIdx) return [...r];
      const nRow = [...r];
      nRow[cIdx] = newVal;
      return nRow;
    });
    applyTableUpdate({ tableData: updated });
    setModalSlashTarget(null);

    // Automatically focus next cell input in modal grid
    let nC = cIdx + 1;
    let nR = rIdx;
    if (nC >= activeTable.cols) {
      nC = 0;
      nR = rIdx + 1;
    }
    if (nR < activeTable.rows) {
      setTimeout(() => {
        const nextInput = document.querySelector(`input[data-cell-pos="${nR}-${nC}"]`) as HTMLInputElement;
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }, 40);
    }
  };

  // Update target overlay on the chart
  const applyTableUpdate = (updated: Partial<TableOverlayData>) => {
    setActiveTable((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updated };
      const activeChart = (window as any).__active_chart_instance__;
      if (activeChart) {
        const overlays = typeof activeChart.getOverlays === 'function' ? activeChart.getOverlays() : [];
        const target = overlays.find((o: any) => o.id === next.overlayId);
        if (target) {
          if (updated.locked !== undefined) {
            target.lock = next.locked;
          }
          target.extendData = {
            ...(target.extendData || {}),
            rows: next.rows,
            cols: next.cols,
            tableData: next.tableData,
            backgroundColor: next.backgroundColor,
            borderColor: next.borderColor,
            borderWidth: next.borderWidth,
            textColor: next.textColor,
            fontSize: next.fontSize,
            textAlign: next.textAlign,
            headerRow: next.headerRow,
            headerBgColor: next.headerBgColor,
            headerTextColor: next.headerTextColor,
            zebraStriping: next.zebraStriping,
            zebraColor: next.zebraColor,
            borderRadius: next.borderRadius,
            locked: next.locked
          };
          if (typeof activeChart.overrideOverlay === 'function') {
            activeChart.overrideOverlay({
              id: next.overlayId,
              lock: next.locked,
              extendData: target.extendData
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

  const handleToggleLockTable = () => {
    if (!activeTable) return;
    const nextLocked = !activeTable.locked;
    applyTableUpdate({ locked: nextLocked });
  };

  const handleCloneTable = () => {
    if (!activeTable) return;
    const activeChart = (window as any).__active_chart_instance__;
    if (!activeChart || typeof activeChart.getOverlays !== 'function') return;

    const overlays = activeChart.getOverlays() || [];
    const target = overlays.find((o: any) => o.id === activeTable.overlayId);
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

  const handleHideTable = () => {
    if (!activeTable) return;
    const activeChart = (window as any).__active_chart_instance__;
    if (activeChart && typeof activeChart.overrideOverlay === 'function') {
      activeChart.overrideOverlay({
        id: activeTable.overlayId,
        visible: false
      });
      if (typeof activeChart.invalidate === 'function') {
        activeChart.invalidate();
      }
    }
    setActiveTable(null);
    window.dispatchEvent(new CustomEvent('update-layer-panel'));
    window.dispatchEvent(new CustomEvent('save-history-state'));
  };

  const reorderTable = (action: 'front' | 'forward' | 'backward' | 'back') => {
    if (!activeTable) return;
    const activeChart = (window as any).__active_chart_instance__;
    if (!activeChart || typeof activeChart.getOverlays !== 'function') return;

    const allOverlays = activeChart.getOverlays() || [];
    const userOverlays = allOverlays.filter((o: any) => o.id && o.name !== 'future-time-scale');
    if (userOverlays.length <= 1) return;

    const currentVisualList = [...userOverlays].reverse();
    const fromVisualIdx = currentVisualList.findIndex((o: any) => o.id === activeTable.overlayId);
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

    window.dispatchEvent(new CustomEvent('reorder-drawing-layer', { detail: { overlayId: activeTable.overlayId } }));
    window.dispatchEvent(new CustomEvent('update-layer-panel'));
    setTimeout(() => window.dispatchEvent(new CustomEvent('save-history-state')), 50);
  };

  useEffect(() => {
    const handleOpenToolbar = (e: Event) => {
      const detail = (e as CustomEvent).detail as TableOverlayData;
      if (!detail || !detail.overlayId) return;

      const activeChart = (window as any).__active_chart_instance__;
      let targetOverlay: any = null;
      if (activeChart && typeof activeChart.getOverlays === 'function') {
        const overlays = activeChart.getOverlays() || [];
        targetOverlay = overlays.find((o: any) => o.id === detail.overlayId);
      }

      const rows = detail.rows || targetOverlay?.extendData?.rows || 3;
      const cols = detail.cols || targetOverlay?.extendData?.cols || 3;
      let data = detail.tableData || targetOverlay?.extendData?.tableData;
      if (!data || !Array.isArray(data) || data.length !== rows) {
        data = Array.from({ length: rows }, () => Array(cols).fill(''));
      }

      const fullData: TableOverlayData = {
        overlayId: detail.overlayId,
        overlayName: detail.overlayName || targetOverlay?.name || 'table',
        rows: rows,
        cols: cols,
        tableData: data,
        backgroundColor: detail.backgroundColor ?? targetOverlay?.extendData?.backgroundColor ?? DEFAULT_TABLE_CONFIG.backgroundColor,
        borderColor: detail.borderColor ?? targetOverlay?.extendData?.borderColor ?? DEFAULT_TABLE_CONFIG.borderColor,
        borderWidth: detail.borderWidth ?? targetOverlay?.extendData?.borderWidth ?? DEFAULT_TABLE_CONFIG.borderWidth,
        textColor: detail.textColor ?? targetOverlay?.extendData?.textColor ?? DEFAULT_TABLE_CONFIG.textColor,
        fontSize: detail.fontSize ?? targetOverlay?.extendData?.fontSize ?? DEFAULT_TABLE_CONFIG.fontSize,
        textAlign: detail.textAlign ?? targetOverlay?.extendData?.textAlign ?? DEFAULT_TABLE_CONFIG.textAlign,
        headerRow: detail.headerRow !== undefined ? detail.headerRow : (targetOverlay?.extendData?.headerRow ?? DEFAULT_TABLE_CONFIG.headerRow),
        headerBgColor: detail.headerBgColor ?? targetOverlay?.extendData?.headerBgColor ?? DEFAULT_TABLE_CONFIG.headerBgColor,
        headerTextColor: detail.headerTextColor ?? targetOverlay?.extendData?.headerTextColor ?? DEFAULT_TABLE_CONFIG.headerTextColor,
        zebraStriping: detail.zebraStriping !== undefined ? detail.zebraStriping : (targetOverlay?.extendData?.zebraStriping ?? DEFAULT_TABLE_CONFIG.zebraStriping),
        zebraColor: detail.zebraColor ?? targetOverlay?.extendData?.zebraColor ?? DEFAULT_TABLE_CONFIG.zebraColor,
        borderRadius: detail.borderRadius !== undefined ? detail.borderRadius : (targetOverlay?.extendData?.borderRadius ?? DEFAULT_TABLE_CONFIG.borderRadius),
        locked: targetOverlay?.lock ?? targetOverlay?.extendData?.locked ?? detail.locked ?? false,
        screenX: detail.screenX,
        screenY: detail.screenY
      };

      setActiveTable(fullData);

      setToolbarPos((currentPos) => {
        if (currentPos && activeTable && activeTable.overlayId === detail.overlayId) {
          return currentPos;
        }
        return {
          x: 64,
          y: 140
        };
      });
    };

    const handleCloseToolbar = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setActiveTable((prev) => {
        if (!detail || !detail.overlayId || (prev && prev.overlayId === detail.overlayId)) {
          return null;
        }
        return prev;
      });
      setIsTemplateMenuOpen(false);
      setIsExportMenuOpen(false);
      setIsBorderWidthDropdownOpen(false);
      setIsLayersDropdownOpen(false);
    };

    const handleOpenSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail as TableOverlayData;
      if (detail && detail.overlayId) {
        handleOpenToolbar(e);
        setModalInitialBackup(JSON.parse(JSON.stringify(detail)));
        setIsModalOpen(true);
      }
    };

    const handleDocumentMouseDown = (e: MouseEvent) => {
      if (isModalOpen) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (
        target.closest('.tradingview-table-drag-toolbar') ||
        target.closest('.settings-modal-box') ||
        target.closest('.color-picker-portal') ||
        target.closest('.color-style-picker-portal') ||
        target.closest('.table-template-flyout') ||
        target.closest('.table-export-flyout') ||
        target.closest('.in-place-table-cell-editor') ||
        target.closest('[data-custom-dropdown]')
      ) {
        return;
      }

      setIsBorderWidthDropdownOpen(false);
      setTimeout(() => {
        const activeChart = (window as any).__active_chart_instance__;
        if (activeChart && activeChart._chartStore) {
          const clickInfo = activeChart._chartStore.getClickOverlayInfo();
          if (!clickInfo || !clickInfo.overlay || clickInfo.overlay.id !== activeTable?.overlayId) {
            setActiveTable(null);
            setIsTemplateMenuOpen(false);
            setIsExportMenuOpen(false);
            setIsBorderWidthDropdownOpen(false);
          }
        }
      }, 50);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isModalOpen) {
          setActiveTable(null);
          setIsTemplateMenuOpen(false);
          setIsExportMenuOpen(false);
          setIsBorderWidthDropdownOpen(false);
        }
      }
    };

    window.addEventListener('open-table-toolbar', handleOpenToolbar);
    window.addEventListener('close-table-toolbar', handleCloseToolbar);
    window.addEventListener('open-table-settings', handleOpenSettings);
    window.addEventListener('close-all-toolbars', handleCloseToolbar);
    document.addEventListener('mousedown', handleDocumentMouseDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('open-table-toolbar', handleOpenToolbar);
      window.removeEventListener('close-table-toolbar', handleCloseToolbar);
      window.removeEventListener('open-table-settings', handleOpenSettings);
      window.removeEventListener('close-all-toolbars', handleCloseToolbar);
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTable, isModalOpen]);

  // Toolbar Dragging Handlers
  const handleToolbarMouseDown = (e: React.MouseEvent) => {
    setIsToolbarDragging(true);
    const currentX = toolbarPos ? toolbarPos.x : (activeTable?.screenX || 350);
    const currentY = toolbarPos ? toolbarPos.y : ((activeTable?.screenY ? Math.max(60, activeTable.screenY - 48) : 120));
    toolbarDragStartRef.current = {
      x: e.clientX - currentX,
      y: e.clientY - currentY
    };
    e.preventDefault();
  };

  useEffect(() => {
    if (!isToolbarDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setToolbarPos({
        x: Math.max(48, Math.min(window.innerWidth - 320, e.clientX - toolbarDragStartRef.current.x)),
        y: Math.max(42, Math.min(window.innerHeight - 60, e.clientY - toolbarDragStartRef.current.y))
      });
    };
    const handleMouseUp = () => setIsToolbarDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
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
          y: Math.max(42, Math.min(window.innerHeight - 60, curr.y))
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Modal Dragging Handlers
  const handleModalMouseDown = (e: React.MouseEvent) => {
    setIsModalDragging(true);
    modalDragStartRef.current = {
      x: e.clientX - modalPos.x,
      y: e.clientY - modalPos.y
    };
    e.preventDefault();
  };

  useEffect(() => {
    if (!isModalDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setModalPos({
        x: Math.max(10, Math.min(window.innerWidth - 440, e.clientX - modalDragStartRef.current.x)),
        y: Math.max(10, Math.min(window.innerHeight - 480, e.clientY - modalDragStartRef.current.y))
      });
    };
    const handleMouseUp = () => setIsModalDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isModalDragging]);

  // Dynamically resize table boundaries outward to preserve cell dimensions
  const adjustTableBounds = (colDelta: number, rowDelta: number) => {
    if (!activeTable) return;
    const activeChart = (window as any).__active_chart_instance__;
    if (!activeChart) return;
    const overlays = typeof activeChart.getOverlays === 'function' ? activeChart.getOverlays() : [];
    const target = overlays.find((o: any) => o.id === activeTable.overlayId);
    if (!target || !target.points || !target.points[0]) return;

    try {
      const p0 = activeChart.convertToPixel(target.points[0]);
      const p1 = target.points[1] ? activeChart.convertToPixel(target.points[1]) : (p0 ? { x: p0.x + 336, y: p0.y + 120 } : null);
      if (p0 && p1) {
        const x = Math.min(p0.x, p1.x);
        const y = Math.min(p0.y, p1.y);
        const w = Math.max(40, Math.abs(p1.x - p0.x));
        const h = Math.max(30, Math.abs(p1.y - p0.y));

        const singleColW = w / Math.max(1, activeTable.cols);
        const singleRowH = h / Math.max(1, activeTable.rows);

        const newW = Math.max(40, w + colDelta * singleColW);
        const newH = Math.max(30, h + rowDelta * singleRowH);

        const newPt0 = activeChart.convertFromPixel({ x, y });
        const newPt1 = activeChart.convertFromPixel({ x: x + newW, y: y + newH });

        if (newPt0 && newPt1) {
          target.points = [
            {
              ...(target.points[0] || {}),
              dataIndex: newPt0.dataIndex,
              timestamp: newPt0.timestamp,
              value: newPt0.value
            },
            {
              ...(target.points[1] || {}),
              dataIndex: newPt1.dataIndex,
              timestamp: newPt1.timestamp,
              value: newPt1.value
            }
          ];
        }
      }
    } catch (e) { }
  };

  const resizeTableToNewDimensions = (newRows: number, newCols: number) => {
    if (!activeTable) return;
    const activeChart = (window as any).__active_chart_instance__;
    if (!activeChart) return;
    const overlays = typeof activeChart.getOverlays === 'function' ? activeChart.getOverlays() : [];
    const target = overlays.find((o: any) => o.id === activeTable.overlayId);
    if (!target || !target.points || !target.points[0]) return;

    try {
      const p0 = activeChart.convertToPixel(target.points[0]);
      const p1 = target.points[1] ? activeChart.convertToPixel(target.points[1]) : (p0 ? { x: p0.x + 336, y: p0.y + 120 } : null);
      if (p0 && p1) {
        const x = Math.min(p0.x, p1.x);
        const y = Math.min(p0.y, p1.y);
        const w = Math.max(40, Math.abs(p1.x - p0.x));
        const h = Math.max(30, Math.abs(p1.y - p0.y));

        const singleColW = Math.max(50, w / Math.max(1, activeTable.cols));
        const singleRowH = Math.max(28, h / Math.max(1, activeTable.rows));

        const newW = singleColW * newCols;
        const newH = singleRowH * newRows;

        const newPt0 = activeChart.convertFromPixel({ x, y });
        const newPt1 = activeChart.convertFromPixel({ x: x + newW, y: y + newH });

        if (newPt0 && newPt1) {
          target.points = [
            {
              ...(target.points[0] || {}),
              dataIndex: newPt0.dataIndex,
              timestamp: newPt0.timestamp,
              value: newPt0.value
            },
            {
              ...(target.points[1] || {}),
              dataIndex: newPt1.dataIndex,
              timestamp: newPt1.timestamp,
              value: newPt1.value
            }
          ];
        }
      }
    } catch (e) { }
  };

  const handleAddColumn = () => {
    if (!activeTable) return;
    adjustTableBounds(1, 0);
    const newCols = activeTable.cols + 1;
    const newData = activeTable.tableData.map((row) => [...row, '']);
    applyTableUpdate({ cols: newCols, tableData: newData, colRatios: undefined });
  };

  const handleDeleteColumn = () => {
    if (!activeTable || activeTable.cols <= 1) return;
    adjustTableBounds(-1, 0);
    const newCols = activeTable.cols - 1;
    const newData = activeTable.tableData.map((row) => row.slice(0, newCols));
    applyTableUpdate({ cols: newCols, tableData: newData, colRatios: undefined });
  };

  const handleAddRow = () => {
    if (!activeTable) return;
    adjustTableBounds(0, 1);
    const newRows = activeTable.rows + 1;
    const newRow = Array(activeTable.cols).fill('');
    const newData = [...activeTable.tableData, newRow];
    applyTableUpdate({ rows: newRows, tableData: newData, rowRatios: undefined });
  };

  const handleDeleteRow = () => {
    if (!activeTable || activeTable.rows <= 1) return;
    adjustTableBounds(0, -1);
    const newRows = activeTable.rows - 1;
    const newData = activeTable.tableData.slice(0, newRows);
    applyTableUpdate({ rows: newRows, tableData: newData, rowRatios: undefined });
  };

  const handleApplyTemplate = (template: typeof TABLE_PRESET_TEMPLATES[0]) => {
    if (!activeTable) return;
    resizeTableToNewDimensions(template.rows, template.cols);
    const resolvedGrid = template.data.map((row) =>
      row.map((cell) => resolveTablePlaceholders(cell))
    );
    applyTableUpdate({
      rows: template.rows,
      cols: template.cols,
      tableData: resolvedGrid,
      headerRow: template.headerRow,
      colRatios: undefined,
      rowRatios: undefined
    });
    setIsTemplateMenuOpen(false);
    showToast(`Loaded ${template.name}`);
  };

  // Feature 5: Export Actions
  const handleExportCSV = (resolveTags: boolean = true) => {
    if (!activeTable) return;
    const csvContent = tableToCSV(activeTable.tableData, resolveTags);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const symbol = (window as any).__active_symbol__ || 'table';
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateFormatted = `${day}-${month}-${year}`;
    link.setAttribute('href', url);
    link.setAttribute('download', `${symbol}_table_${dateFormatted}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
    showToast('CSV downloaded');
  };

  const handleCopyTSV = (resolveTags: boolean = true) => {
    if (!activeTable) return;
    const tsv = tableToTSV(activeTable.tableData, resolveTags);
    navigator.clipboard?.writeText(tsv);
    setIsExportMenuOpen(false);
    showToast('Copied for Excel / Sheets');
  };

  const handleCopyMarkdown = (resolveTags: boolean = true) => {
    if (!activeTable) return;
    const md = tableToMarkdown(activeTable.tableData, activeTable.headerRow, resolveTags);
    navigator.clipboard?.writeText(md);
    setIsExportMenuOpen(false);
    showToast('Copied Markdown table');
  };

  // Feature 5: Import Actions
  const handleTriggerFileImport = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const grid = parseImportedTableText(content);
        if (grid.length > 0) {
          resizeTableToNewDimensions(grid.length, grid[0].length);
          applyTableUpdate({
            rows: grid.length,
            cols: grid[0].length,
            tableData: grid
          });
          setIsExportMenuOpen(false);
          showToast(`Imported ${grid.length}x${grid[0].length} table`);
        }
      }
    };
    reader.readAsText(file);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const grid = parseImportedTableText(text);
      if (grid.length > 0) {
        resizeTableToNewDimensions(grid.length, grid[0].length);
        applyTableUpdate({
          rows: grid.length,
          cols: grid[0].length,
          tableData: grid
        });
        setIsExportMenuOpen(false);
        showToast(`Pasted ${grid.length}x${grid[0].length} table from clipboard`);
      }
    } catch (e) {
      showToast('Clipboard access denied');
    }
  };

  // Feature 5: Journal Snapshot Action
  const handleSaveToJournal = () => {
    if (!activeTable) return;
    try {
      const symbol = getActiveChartSymbol();
      const timeframe = getActiveChartTimeframe();
      const resolvedData = activeTable.tableData.map((row) =>
        row.map((c) => resolveTablePlaceholders(c))
      );

      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const dateFormatted = `${day}-${month}-${year} ${hours}:${minutes}`;

      const entry = {
        id: `journal_${Date.now()}`,
        name: `${symbol} (${timeframe})`,
        timestamp: Date.now(),
        date: dateFormatted,
        symbol,
        timeframe,
        rows: activeTable.rows,
        cols: activeTable.cols,
        tableData: resolvedData
      };

      const existingRaw = localStorage.getItem('trading_table_journal_history');
      const history = existingRaw ? JSON.parse(existingRaw) : [];
      history.unshift(entry);
      localStorage.setItem('trading_table_journal_history', JSON.stringify(history.slice(0, 50)));

      setIsExportMenuOpen(false);
      showToast('Snapshot saved to Trade Journal!');
    } catch (e) {
      showToast('Failed to save snapshot');
    }
  };

  const handleDeleteTable = () => {
    if (!activeTable || !activeTable.overlayId) return;
    const targetId = activeTable.overlayId;
    const activeChart = (window as any).__active_chart_instance__;
    if (activeChart && typeof activeChart.removeOverlay === 'function') {
      try {
        activeChart.removeOverlay({ id: targetId });
      } catch (e) { }
      if (typeof activeChart.updatePane === 'function') {
        activeChart.updatePane(1);
      }
      if (typeof activeChart.invalidate === 'function') {
        activeChart.invalidate();
      }
    }

    // Cleanly remove any floating DOM elements associated with the table
    const cellEditor = document.querySelector('.in-place-table-cell-editor');
    if (cellEditor) cellEditor.remove();
    const slashMenu = document.querySelector('.table-smart-tag-slash-menu');
    if (slashMenu) slashMenu.remove();

    setActiveTable(null);
    setToolbarPos(null);
    setIsModalOpen(false);
    setIsTemplateMenuOpen(false);
    setIsExportMenuOpen(false);
    showToast('Table deleted');
  };

  const handleResetDefaults = () => {
    applyTableUpdate(DEFAULT_TABLE_CONFIG);
  };

  const handleModalCancel = () => {
    if (modalInitialBackup) {
      applyTableUpdate(modalInitialBackup);
    }
    setIsModalOpen(false);
  };

  if (!activeTable) return null;

  const currentX = toolbarPos ? toolbarPos.x : 64;
  const currentY = toolbarPos ? toolbarPos.y : 140;

  const isNearBottom = currentY + 38 + 220 > window.innerHeight - 10;
  const isNearRight = currentX + 240 > window.innerWidth - 10;

  const borderParsed = parseColorAndOpacity(activeTable.borderColor);
  const bgParsed = parseColorAndOpacity(activeTable.backgroundColor);
  const textParsed = parseColorAndOpacity(activeTable.textColor);
  const headerBgParsed = parseColorAndOpacity(activeTable.headerBgColor);

  return (
    <>
      {/* Hidden File Input for CSV Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* Floating Notification Toast */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#1f2330',
            color: '#ffffff',
            border: '1px solid #2962ff',
            borderRadius: '8px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
            zIndex: 400000,
            pointerEvents: 'none'
          }}
        >
          <Check size={16} color="#2979ff" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 1. Floating Drag Bar Toolbar */}
      {!isModalOpen && (
        <div
          className="tradingview-table-drag-toolbar"
          style={{
            position: 'fixed',
            top: `${currentY}px`,
            left: `${currentX}px`,
            backgroundColor: '#1e222d',
            border: '1px solid #2a2e39',
            borderRadius: '6px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px',
            zIndex: 10000,
            userSelect: 'none',
            pointerEvents: 'auto',
            color: '#d1d4dc',
            fontFamily: "'Rubik', 'Rubik', sans-serif",
            boxSizing: 'border-box',
            gap: '6px',
            height: '38px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            onMouseDown={handleToolbarMouseDown}
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
            onMouseEnter={(e) => e.currentTarget.style.color = '#d1d4dc'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#787b86'}
          >
            <GripVertical size={16} />
          </div>

          <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

          {/* Feature 1: Add Column Button */}
          <button
            onClick={handleAddColumn}
            title="Add Column"
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              color: '#d1d4dc',
              cursor: 'pointer',
              height: '26px',
              width: '26px',
              padding: 0,
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#d1d4dc';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ display: 'block' }}>
              <rect x="2.5" y="3" width="9" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <line x1="7" y1="3" x2="7" y2="17" stroke="currentColor" strokeWidth="1.1" />
              <line x1="16" y1="7" x2="16" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="13" y1="10" x2="19" y2="10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          {/* Feature 1: Delete Column Button */}
          <button
            onClick={handleDeleteColumn}
            title="Delete Column"
            disabled={activeTable.cols <= 1}
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              color: activeTable.cols <= 1 ? '#434651' : '#d1d4dc',
              cursor: activeTable.cols <= 1 ? 'not-allowed' : 'pointer',
              height: '26px',
              width: '26px',
              padding: 0,
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTable.cols > 1) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.color = '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = activeTable.cols <= 1 ? '#434651' : '#d1d4dc';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ display: 'block' }}>
              <rect x="2.5" y="3" width="9" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <line x1="7" y1="3" x2="7" y2="17" stroke="currentColor" strokeWidth="1.1" />
              <line x1="13.5" y1="10" x2="18.5" y2="10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          {/* Feature 1: Add Row Button */}
          <button
            onClick={handleAddRow}
            title="Add Row"
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              color: '#d1d4dc',
              cursor: 'pointer',
              height: '26px',
              width: '26px',
              padding: 0,
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#d1d4dc';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ display: 'block' }}>
              <rect x="3" y="2.5" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <line x1="3" y1="7" x2="17" y2="7" stroke="currentColor" strokeWidth="1.1" />
              <line x1="10" y1="13" x2="10" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="7" y1="16" x2="13" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          {/* Feature 1: Delete Row Button */}
          <button
            onClick={handleDeleteRow}
            title="Delete Row"
            disabled={activeTable.rows <= 1}
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              color: activeTable.rows <= 1 ? '#434651' : '#d1d4dc',
              cursor: activeTable.rows <= 1 ? 'not-allowed' : 'pointer',
              height: '26px',
              width: '26px',
              padding: 0,
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTable.rows > 1) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.color = '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = activeTable.rows <= 1 ? '#434651' : '#d1d4dc';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ display: 'block' }}>
              <rect x="3" y="2.5" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <line x1="3" y1="7" x2="17" y2="7" stroke="currentColor" strokeWidth="1.1" />
              <line x1="7" y1="16" x2="13" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

          {/* Feature 2: Quick Templates Flyout Button */}
          <div style={{ position: 'relative' }}>
            <button
              ref={templateButtonRef}
              onClick={() => {
                setIsTemplateMenuOpen(!isTemplateMenuOpen);
                setIsExportMenuOpen(false);
              }}
              title="Trading Table Presets"
              style={{
                background: isTemplateMenuOpen ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
                border: isTemplateMenuOpen ? '1px solid #2962ff' : '1px solid transparent',
                color: isTemplateMenuOpen ? '#2979ff' : '#d1d4dc',
                cursor: 'pointer',
                height: '26px',
                padding: '0 6px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                fontSize: '12px',
                fontWeight: 500,
                outline: 'none',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!isTemplateMenuOpen) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.color = '#ffffff';
                }
              }}
              onMouseLeave={(e) => {
                if (!isTemplateMenuOpen) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#d1d4dc';
                }
              }}
            >
              <Sparkles size={14} />
            </button>

            {isTemplateMenuOpen && (
              <div
                className="table-template-flyout"
                style={{
                  position: 'absolute',
                  top: isNearBottom ? 'auto' : 'calc(100% + 6px)',
                  bottom: isNearBottom ? 'calc(100% + 6px)' : 'auto',
                  left: isNearRight ? 'auto' : '0',
                  right: isNearRight ? '0' : 'auto',
                  width: '210px',
                  backgroundColor: '#161720',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.75)',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  zIndex: 250000
                }}
              >
                <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#868993', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Preset Templates
                </div>
                {TABLE_PRESET_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.name}
                    onClick={() => handleApplyTemplate(tmpl)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      color: '#d1d4dc',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background-color 0.12s, color 0.12s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.15)';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#d1d4dc';
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{tmpl.icon}</span>
                      <span>{tmpl.name}</span>
                    </span>
                    <span style={{ fontSize: '10px', color: '#787b86' }}>{tmpl.rows}x{tmpl.cols}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Feature 5: Import, Export & Journal Flyout Button */}
          <div style={{ position: 'relative' }}>
            <button
              ref={exportButtonRef}
              onClick={() => {
                setIsExportMenuOpen(!isExportMenuOpen);
                setIsTemplateMenuOpen(false);
              }}
              title="Import, Export & Journal"
              style={{
                background: isExportMenuOpen ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
                border: isExportMenuOpen ? '1px solid #2962ff' : '1px solid transparent',
                color: isExportMenuOpen ? '#2979ff' : '#d1d4dc',
                cursor: 'pointer',
                height: '26px',
                padding: '0 6px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!isExportMenuOpen) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.color = '#ffffff';
                }
              }}
              onMouseLeave={(e) => {
                if (!isExportMenuOpen) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#d1d4dc';
                }
              }}
            >
              <FileSpreadsheet size={15} />
            </button>

            {isExportMenuOpen && (
              <div
                className="table-export-flyout"
                style={{
                  position: 'absolute',
                  top: isNearBottom ? 'auto' : 'calc(100% + 6px)',
                  bottom: isNearBottom ? 'calc(100% + 6px)' : 'auto',
                  left: isNearRight ? 'auto' : '0',
                  right: isNearRight ? '0' : 'auto',
                  width: '230px',
                  backgroundColor: '#161720',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.75)',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  zIndex: 250000
                }}
              >
                <div style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 600, color: '#868993', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Import & Paste
                </div>
                <button
                  onClick={handlePasteClipboard}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    padding: '6px 8px',
                    color: '#d1d4dc',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.15)';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#d1d4dc';
                  }}
                >
                  <ClipboardPaste size={14} color="#2979ff" />
                  <span>Paste from Clipboard (Sheets/TSV)</span>
                </button>

                <button
                  onClick={handleTriggerFileImport}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    padding: '6px 8px',
                    color: '#d1d4dc',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.15)';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#d1d4dc';
                  }}
                >
                  <Upload size={14} color="#089981" />
                  <span>Import CSV File (.csv)</span>
                </button>

                <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />

                <div style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 600, color: '#868993', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Export & Copy
                </div>

                <button
                  onClick={() => handleExportCSV(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    padding: '6px 8px',
                    color: '#d1d4dc',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.15)';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#d1d4dc';
                  }}
                >
                  <Download size={14} color="#f23645" />
                  <span>Download as CSV (.csv)</span>
                </button>

                <button
                  onClick={() => handleCopyTSV(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    padding: '6px 8px',
                    color: '#d1d4dc',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.15)';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#d1d4dc';
                  }}
                >
                  <Copy size={14} color="#f57c00" />
                  <span>Copy for Google Sheets / Excel</span>
                </button>

                <button
                  onClick={() => handleCopyMarkdown(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    padding: '6px 8px',
                    color: '#d1d4dc',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.15)';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#d1d4dc';
                  }}
                >
                  <Copy size={14} color="#9c27b0" />
                  <span>Copy as Markdown Table</span>
                </button>

                <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />

                <button
                  onClick={handleSaveToJournal}
                  style={{
                    background: 'rgba(41, 98, 255, 0.12)',
                    border: '1px solid rgba(41, 98, 255, 0.3)',
                    borderRadius: '5px',
                    padding: '6px 8px',
                    color: '#2979ff',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.22)';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.12)';
                    e.currentTarget.style.color = '#2979ff';
                  }}
                >
                  <BookOpen size={14} />
                  <span>Log Snapshot to Journal</span>
                </button>
              </div>
            )}
          </div>

          <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

          {/* Border Color */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <ColorStylePicker
              color={borderParsed.hex}
              opacity={borderParsed.opacity}
              isBorderColorPicker={true}
              hideStyleSelector={true}
              alignLeft={true}
              forceDark={true}
              onChange={(color, opacity) => {
                applyTableUpdate({ borderColor: rgbaString(color, opacity) });
              }}
            />
          </div>

          {/* Border Width (px) Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              ref={borderWidthBtnRef}
              onClick={() => {
                setIsBorderWidthDropdownOpen(prev => !prev);
                setIsTemplateMenuOpen(false);
                setIsExportMenuOpen(false);
              }}
              title="Border Width"
              style={{
                background: isBorderWidthDropdownOpen ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: isBorderWidthDropdownOpen ? '#2979ff' : '#d1d4dc',
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
                {activeTable.borderWidth || 1}px
              </span>
              <ChevronDown size={12} color="#787b86" />
            </button>

            {isBorderWidthDropdownOpen && (
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
                  zIndex: 160000
                }}
                onClick={e => e.stopPropagation()}
              >
                {[1, 2, 3, 4].map(w => (
                  <div
                    key={w}
                    onClick={() => {
                      applyTableUpdate({ borderWidth: w });
                      setIsBorderWidthDropdownOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: (activeTable.borderWidth || 1) === w ? '#2979ff' : '#d1d4dc',
                      backgroundColor: (activeTable.borderWidth || 1) === w ? 'rgba(41, 98, 255, 0.12)' : 'transparent'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = (activeTable.borderWidth || 1) === w ? 'rgba(41, 98, 255, 0.12)' : 'transparent'}
                  >
                    <span>{w}px</span>
                    {(activeTable.borderWidth || 1) === w && <Check size={12} color="#2979ff" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Background Fill Color */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <ColorStylePicker
              color={bgParsed.hex}
              opacity={bgParsed.opacity}
              isFillColorPicker={true}
              hideStyleSelector={true}
              alignLeft={true}
              forceDark={true}
              onChange={(color, opacity) => {
                applyTableUpdate({ backgroundColor: rgbaString(color, opacity) });
              }}
            />
          </div>

          {/* Text Color */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <ColorStylePicker
              color={textParsed.hex}
              opacity={textParsed.opacity}
              isTextColorPicker={true}
              hideStyleSelector={true}
              alignLeft={true}
              forceDark={true}
              onChange={(color, opacity) => {
                applyTableUpdate({ textColor: rgbaString(color, opacity) });
              }}
            />
          </div>

          <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

          {/* Settings Button (Opens modal) */}
          <button
            onClick={() => {
              setModalInitialBackup(JSON.parse(JSON.stringify(activeTable)));
              setIsModalOpen(true);
            }}
            title="Settings"
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              color: '#868993',
              cursor: 'pointer',
              height: '26px',
              width: '26px',
              padding: 0,
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#868993';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 33.136 28.412" style={{ pointerEvents: 'none' }}>
              <g id="Setting">
                <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" stroke="currentColor" strokeWidth="0.5" strokeMiterlimit="10" d="M22.77,14.206c0,3.426-2.777,6.203-6.203,6.203s-6.203-2.777-6.203-6.203s2.777-6.203,6.203-6.203S22.77,10.78,22.77,14.206z M21.22,14.206c0,2.569-2.083,4.652-4.652,4.652s-4.652-2.083-4.652-4.652s2.083-4.652,4.652-4.652S21.22,11.637,21.22,14.206z" />
                <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" stroke="currentColor" strokeWidth="0.5" strokeMiterlimit="10" d="M8.039,0.25h17.057l7.753,13.956l-7.753,13.956H8.039L0.286,14.206L8.039,0.25z M2.054,14.206L8.97,1.801h15.227l6.9,12.405 l-6.9,12.405H8.97l-6.9-12.405H2.054z" />
              </g>
            </svg>
          </button>

          {/* Lock / Unlock Button */}
          <button
            onClick={handleToggleLockTable}
            title={activeTable.locked ? 'Unlock Table' : 'Lock Table'}
            style={{
              background: activeTable.locked ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
              border: activeTable.locked ? '1px solid #2962ff' : 'none',
              color: activeTable.locked ? '#2979ff' : '#868993',
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
            onMouseEnter={e => { if (!activeTable.locked) { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; } }}
            onMouseLeave={e => { if (!activeTable.locked) { e.currentTarget.style.color = '#868993'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
          >
            {activeTable.locked ? <LockbtnIcon width={16} height={16} /> : <UnlockbtnIcon width={16} height={16} />}
          </button>

          {/* Hide / Visibility (Eye) Button */}
          <button
            onClick={handleHideTable}
            title="Hide"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#868993',
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
            onMouseLeave={e => { e.currentTarget.style.color = '#868993'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <Eye size={15} />
          </button>

          {/* Duplicate Button */}
          <button
            onClick={handleCloneTable}
            title="Duplicate"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#868993',
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
            onMouseLeave={e => { e.currentTarget.style.color = '#868993'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <Copy size={15} />
          </button>

          {/* Visual Order / Layers Dropdown Button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsLayersDropdownOpen(prev => !prev);
                setIsTemplateMenuOpen(false);
                setIsExportMenuOpen(false);
                setIsBorderWidthDropdownOpen(false);
              }}
              title="Visual Order (Layers)"
              style={{
                background: isLayersDropdownOpen ? 'rgba(41, 98, 255, 0.18)' : 'transparent',
                border: isLayersDropdownOpen ? '1px solid #2962ff' : 'none',
                color: isLayersDropdownOpen ? '#2979ff' : '#868993',
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
              onMouseLeave={e => { if (!isLayersDropdownOpen) { e.currentTarget.style.color = '#868993'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
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
                  zIndex: 250000
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
                        reorderTable(item.action as any);
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

          <div style={{ width: '1px', height: '20px', backgroundColor: '#2a2e39', margin: '0 1px' }} />

          {/* Delete Button */}
          <button
            onClick={handleDeleteTable}
            title="Remove"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#868993',
              cursor: 'pointer',
              height: '26px',
              width: '26px',
              padding: 0,
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#868993';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <DeletebtnIcon width={16} height={16} />
          </button>
        </div>
      )}

      {/* 2. Comprehensive Table Settings & Editor Modal */}
      {isModalOpen && (
        <div
          className="settings-modal-box"
          style={{
            position: 'fixed',
            left: `${modalPos.x}px`,
            top: `${modalPos.y}px`,
            width: '440px',
            backgroundColor: '#161720',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
            zIndex: 200000,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Rubik', sans-serif",
            color: '#d1d4dc',
            userSelect: 'none',
            overflow: 'hidden'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            onMouseDown={handleModalMouseDown}
            style={{
              padding: '12px 18px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'move',
              backgroundColor: '#11131a'
            }}
          >
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', letterSpacing: '0.3px' }}>Table Settings</span>
            <button
              onClick={() => setIsModalOpen(false)}
              title="Close"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#868993',
                cursor: 'pointer',
                borderRadius: '6px',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.backgroundColor = 'rgba(242, 54, 69, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(242, 54, 69, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#868993';
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Modal Tab Bar */}
          <div
            style={{
              display: 'flex',
              backgroundColor: '#101217',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '0 16px',
              gap: '4px'
            }}
          >
            <button
              onClick={() => setActiveModalTab('content')}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeModalTab === 'content' ? '2px solid #2962ff' : '2px solid transparent',
                color: activeModalTab === 'content' ? '#ffffff' : '#868993',
                padding: '10px 12px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.12s'
              }}
            >
              Data & Content
            </button>
            <button
              onClick={() => setActiveModalTab('style')}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeModalTab === 'style' ? '2px solid #2962ff' : '2px solid transparent',
                color: activeModalTab === 'style' ? '#ffffff' : '#868993',
                padding: '10px 12px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.12s'
              }}
            >
              Style & Design
            </button>
            <button
              onClick={() => setActiveModalTab('journal')}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeModalTab === 'journal' ? '2px solid #2962ff' : '2px solid transparent',
                color: activeModalTab === 'journal' ? '#ffffff' : '#868993',
                padding: '10px 12px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.12s'
              }}
            >
              Import / Export / Journal
            </button>
          </div>

          {/* Modal Body */}
          <div style={{ padding: '16px 18px', maxHeight: '400px', overflowY: 'auto', backgroundColor: '#161720' }}>
            {activeModalTab === 'content' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Feature 4: Live Data Tags Helper Banner */}
                <div
                  style={{
                    backgroundColor: 'rgba(41, 98, 255, 0.08)',
                    border: '1px solid rgba(41, 98, 255, 0.25)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#2979ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Sparkles size={13} />
                      <span>Live Smart Tags (Auto-Filled):</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#90caf9', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>Type</span>
                      <kbd style={{ backgroundColor: '#1e222d', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(41, 98, 255, 0.5)', color: '#64b5f6', fontFamily: 'monospace', fontWeight: 700, fontSize: '11px' }}>/</kbd>
                      <span>in any cell to insert live tags</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {[
                      '{symbol}',
                      '{spot}',
                      '{open}',
                      '{high}',
                      '{low}',
                      '{eq}',
                      '{change%}',
                      '{vol}',
                      '{do}',
                      '{session}',
                      '{side}',
                      '{rsi}',
                      '{atr}',
                      '{macd}',
                      '{timeframe}',
                      '{date}',
                      '{time}',
                      '{day}'
                    ].map((tag) => (
                      <span
                        key={tag}
                        title={`Click to copy ${tag} or type / in any cell`}
                        onClick={() => {
                          navigator.clipboard?.writeText(tag);
                          showToast(`Copied ${tag}`);
                        }}
                        style={{
                          fontSize: '11px',
                          backgroundColor: '#1e222d',
                          border: '1px solid #2a2e39',
                          borderRadius: '4px',
                          padding: '2px 7px',
                          color: '#d1d4dc',
                          cursor: 'pointer',
                          fontFamily: 'monospace'
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: '11px', color: '#868993', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <span>💡 <strong>Quick Insert:</strong> Type <code style={{ color: '#64b5f6', fontFamily: 'monospace', fontWeight: 700 }}>/</code> in any cell on chart or in table grid to open the live tag autocomplete menu.</span>
                  </div>
                </div>

                {/* Interactive Grid Cell Editor */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#d1d4dc' }}>
                      Table Cells ({activeTable.rows} rows × {activeTable.cols} cols):
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={handleAddColumn}
                        title="Add Column"
                        style={{
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#d1d4dc',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        + Col
                      </button>
                      <button
                        onClick={handleAddRow}
                        title="Add Row"
                        style={{
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#d1d4dc',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        + Row
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Cell Inputs Matrix */}
                  <div
                    style={{
                      maxHeight: '220px',
                      overflowX: 'auto',
                      overflowY: 'auto',
                      border: '1px solid #2a2e39',
                      borderRadius: '6px',
                      backgroundColor: '#11131a',
                      padding: '4px'
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${activeTable.cols}, minmax(80px, 1fr))`,
                        gap: '4px'
                      }}
                    >
                      {activeTable.tableData.map((rowArr, rIdx) =>
                        rowArr.map((cellVal, cIdx) => {
                          const isSlashActive = modalSlashTarget?.r === rIdx && modalSlashTarget?.c === cIdx;
                          const filteredModalTags = isSlashActive
                            ? SMART_TAGS_CATALOG.filter((item) => {
                                const q = modalSlashTarget.query.toLowerCase();
                                return (
                                  item.tag.toLowerCase().includes(q) ||
                                  item.label.toLowerCase().includes(q) ||
                                  item.desc.toLowerCase().includes(q)
                                );
                              })
                            : [];

                          return (
                            <div key={`${rIdx}-${cIdx}`} style={{ position: 'relative', width: '100%' }}>
                              <input
                                type="text"
                                data-cell-pos={`${rIdx}-${cIdx}`}
                                value={cellVal}
                                placeholder={indexToColLetter(cIdx) + (rIdx + 1)}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (isSlashActive && filteredModalTags.length > 0) {
                                    if (e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      setModalSlashTarget((prev) =>
                                        prev ? { ...prev, selectedIdx: (prev.selectedIdx + 1) % filteredModalTags.length } : null
                                      );
                                      return;
                                    } else if (e.key === 'ArrowUp') {
                                      e.preventDefault();
                                      setModalSlashTarget((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              selectedIdx:
                                                (prev.selectedIdx - 1 + filteredModalTags.length) % filteredModalTags.length
                                            }
                                          : null
                                      );
                                      return;
                                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                                      e.preventDefault();
                                      const sel = filteredModalTags[modalSlashTarget.selectedIdx];
                                      if (sel) {
                                        insertModalTag(rIdx, cIdx, sel.tag);
                                        return;
                                      }
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      setModalSlashTarget(null);
                                      return;
                                    }
                                  }
                                }}
                                onKeyUp={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const updated = activeTable.tableData.map((r, rI) => {
                                    if (rI !== rIdx) return [...r];
                                    const nRow = [...r];
                                    nRow[cIdx] = val;
                                    return nRow;
                                  });
                                  applyTableUpdate({ tableData: updated });

                                  const slashMatch = val.match(/(?:\/|\{)([a-zA-Z0-9%_=-]*)$/);
                                  if (slashMatch) {
                                    setModalSlashTarget({ r: rIdx, c: cIdx, query: slashMatch[1], selectedIdx: 0 });
                                  } else if (isSlashActive) {
                                    setModalSlashTarget(null);
                                  }
                                }}
                                onBlur={(e) => {
                                  setTimeout(() => {
                                    if (modalSlashTarget?.r === rIdx && modalSlashTarget?.c === cIdx) {
                                      setModalSlashTarget(null);
                                    }
                                  }, 150);
                                  const val = e.target.value.trim();
                                  if (!val.startsWith('=')) {
                                    const resolved = resolveTablePlaceholders(e.target.value);
                                    if (resolved !== e.target.value) {
                                      const updated = activeTable.tableData.map((r, rI) => {
                                        if (rI !== rIdx) return [...r];
                                        const nRow = [...r];
                                        nRow[cIdx] = resolved;
                                        return nRow;
                                      });
                                      applyTableUpdate({ tableData: updated });
                                    }
                                  }
                                }}
                                style={{
                                  backgroundColor: (activeTable.headerRow && rIdx === 0) ? '#1f2330' : '#181a24',
                                  color: '#ffffff',
                                  border: (activeTable.headerRow && rIdx === 0) ? '1px solid rgba(41, 98, 255, 0.4)' : '1px solid #2a2e39',
                                  borderRadius: '4px',
                                  padding: '5px 6px',
                                  fontSize: '12px',
                                  fontWeight: (activeTable.headerRow && rIdx === 0) ? 600 : 'normal',
                                  outline: 'none',
                                  width: '100%',
                                  boxSizing: 'border-box'
                                }}
                              />

                              {/* Slash Tag Autocomplete Menu */}
                              {isSlashActive && filteredModalTags.length > 0 && (
                                <div
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  onWheel={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.currentTarget.scrollTop += e.deltaY;
                                  }}
                                  style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    width: '220px',
                                    maxHeight: '180px',
                                    overflowY: 'auto',
                                    backgroundColor: '#161822',
                                    border: '1px solid #2962ff',
                                    borderRadius: '6px',
                                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.85)',
                                    zIndex: 500000,
                                    padding: '4px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                    marginTop: '2px'
                                  }}
                                >
                                  {filteredModalTags.map((item, fIdx) => {
                                    const isSel = fIdx === modalSlashTarget.selectedIdx;
                                    return (
                                      <div
                                        key={item.tag}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          insertModalTag(rIdx, cIdx, item.tag);
                                        }}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          insertModalTag(rIdx, cIdx, item.tag);
                                        }}
                                        onMouseEnter={() => {
                                          setModalSlashTarget((prev) => (prev ? { ...prev, selectedIdx: fIdx } : null));
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          padding: '4px 6px',
                                          borderRadius: '4px',
                                          cursor: 'pointer',
                                          backgroundColor: isSel ? 'rgba(41, 98, 255, 0.25)' : 'transparent',
                                          color: isSel ? '#ffffff' : '#d1d4dc',
                                          fontSize: '11px',
                                          fontFamily: "'Rubik', sans-serif"
                                        }}
                                      >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                          <span style={{ fontWeight: 600, color: isSel ? '#64b5f6' : '#2979ff', fontFamily: 'monospace' }}>
                                            {item.tag}
                                          </span>
                                          <span style={{ fontSize: '10px', color: '#868993' }}>{item.label}</span>
                                        </div>
                                        <span
                                          style={{
                                            fontSize: '9px',
                                            backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                            padding: '1px 4px',
                                            borderRadius: '3px',
                                            color: '#868993'
                                          }}
                                        >
                                          {item.category}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Feature 2: Quick Template Apply Selector */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#868993' }}>Load Preset:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {TABLE_PRESET_TEMPLATES.slice(0, 3).map((tmpl) => (
                      <button
                        key={tmpl.name}
                        onClick={() => handleApplyTemplate(tmpl)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          padding: '3px 8px',
                          color: '#d1d4dc',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        {tmpl.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : activeModalTab === 'style' ? (
              /* Feature 3: Style & Design Controls */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Header Row</span>
                  <CustomCheckbox
                    checked={activeTable.headerRow}
                    onChange={(val) => applyTableUpdate({ headerRow: val })}
                  />
                </div>

                {activeTable.headerRow && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Header Background</span>
                    <ColorStylePicker
                      color={headerBgParsed.hex}
                      opacity={headerBgParsed.opacity}
                      hideStyleSelector={true}
                      onChange={(color, opacity) => {
                        applyTableUpdate({ headerBgColor: rgbaString(color, opacity) });
                      }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Zebra Striping</span>
                  <CustomCheckbox
                    checked={activeTable.zebraStriping}
                    onChange={(val) => applyTableUpdate({ zebraStriping: val })}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Background</span>
                  <ColorStylePicker
                    color={bgParsed.hex}
                    opacity={bgParsed.opacity}
                    hideStyleSelector={true}
                    onChange={(color, opacity) => {
                      applyTableUpdate({ backgroundColor: rgbaString(color, opacity) });
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Border</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ColorStylePicker
                      color={borderParsed.hex}
                      opacity={borderParsed.opacity}
                      hideStyleSelector={true}
                      onChange={(color, opacity) => {
                        applyTableUpdate({ borderColor: rgbaString(color, opacity) });
                      }}
                    />
                    <CustomDropdown
                      value={activeTable.borderWidth ?? 1}
                      options={[
                        { value: 1, label: '1px' },
                        { value: 2, label: '2px' },
                        { value: 3, label: '3px' },
                        { value: 4, label: '4px' }
                      ]}
                      onChange={(bw) => applyTableUpdate({ borderWidth: bw })}
                      width={76}
                      height={26}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Corner Radius ({activeTable.borderRadius}px)</span>
                  <input
                    type="range"
                    min={0}
                    max={16}
                    step={2}
                    value={activeTable.borderRadius}
                    onChange={(e) => applyTableUpdate({ borderRadius: parseInt(e.target.value, 10) })}
                    style={{ width: '120px', accentColor: '#2962ff', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Text</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ColorStylePicker
                      color={textParsed.hex}
                      opacity={textParsed.opacity}
                      hideStyleSelector={true}
                      onChange={(color, opacity) => {
                        applyTableUpdate({ textColor: rgbaString(color, opacity) });
                      }}
                    />
                    <CustomDropdown
                      value={activeTable.fontSize}
                      options={FONT_SIZES}
                      onChange={(sz) => applyTableUpdate({ fontSize: sz })}
                      width={76}
                      height={26}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Text Alignment</span>
                  <CustomDropdown
                    value={activeTable.textAlign}
                    options={[
                      { value: 'left', label: 'Left' },
                      { value: 'center', label: 'Center' },
                      { value: 'right', label: 'Right' }
                    ]}
                    onChange={(align) => applyTableUpdate({ textAlign: align })}
                    width={110}
                    height={30}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '13px', color: '#d1d4dc' }}>Wrap Text</span>
                    <div style={{ fontSize: '11px', color: '#868993' }}>Multi-line text inside cells</div>
                  </div>
                  <CustomCheckbox
                    checked={activeTable.wrapText !== false}
                    onChange={(val) => applyTableUpdate({ wrapText: val })}
                  />
                </div>
              </div>
            ) : (
              /* Feature 5: Import, Export & Journal Integration Tab */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 1. Quick Actions Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#868993', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Import & Export Actions
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      onClick={() => handleExportCSV(true)}
                      style={{
                        backgroundColor: '#11131a',
                        border: '1px solid #2a2e39',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#2962ff';
                        e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#2a2e39';
                        e.currentTarget.style.backgroundColor = '#11131a';
                      }}
                    >
                      <Download size={16} color="#2979ff" />
                      <span>Export CSV</span>
                    </button>

                    <button
                      onClick={handleTriggerFileImport}
                      style={{
                        backgroundColor: '#11131a',
                        border: '1px solid #2a2e39',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#089981';
                        e.currentTarget.style.backgroundColor = 'rgba(8, 153, 129, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#2a2e39';
                        e.currentTarget.style.backgroundColor = '#11131a';
                      }}
                    >
                      <Upload size={16} color="#089981" />
                      <span>Import CSV</span>
                    </button>

                    <button
                      onClick={() => handleCopyTSV(true)}
                      style={{
                        backgroundColor: '#11131a',
                        border: '1px solid #2a2e39',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#f57c00';
                        e.currentTarget.style.backgroundColor = 'rgba(245, 124, 0, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#2a2e39';
                        e.currentTarget.style.backgroundColor = '#11131a';
                      }}
                    >
                      <Copy size={16} color="#f57c00" />
                      <span>Copy for Sheets</span>
                    </button>

                    <button
                      onClick={handlePasteClipboard}
                      style={{
                        backgroundColor: '#11131a',
                        border: '1px solid #2a2e39',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#2962ff';
                        e.currentTarget.style.backgroundColor = 'rgba(41, 98, 255, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#2a2e39';
                        e.currentTarget.style.backgroundColor = '#11131a';
                      }}
                    >
                      <ClipboardPaste size={16} color="#2979ff" />
                      <span>Paste Clipboard</span>
                    </button>
                  </div>
                </div>

                {/* 2. Trade Journal Integration */}
                <div
                  style={{
                    backgroundColor: '#11131a',
                    border: '1px solid #2a2e39',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <BookOpen size={16} color="#2979ff" />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>Trade Journal Snapshots</span>
                    </div>
                    <button
                      onClick={handleSaveToJournal}
                      style={{
                        backgroundColor: '#2962ff',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#ffffff',
                        padding: '5px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.12s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1e4bd8'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2962ff'}
                    >
                      + Save Current Snapshot
                    </button>
                  </div>
                  <span style={{ fontSize: '11px', color: '#868993', lineHeight: '1.4' }}>
                    Snapshots are securely stored in your browser's persistent LocalStorage (<code>trading_table_journal_history</code>).
                  </span>

                  {/* Saved Snapshots List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#868993', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Saved History ({(() => {
                          try {
                            const raw = localStorage.getItem('trading_table_journal_history');
                            return raw ? JSON.parse(raw).length : 0;
                          } catch { return 0; }
                        })()})
                      </span>
                      {(() => {
                        try {
                          const raw = localStorage.getItem('trading_table_journal_history');
                          const list = raw ? JSON.parse(raw) : [];
                          if (list.length > 0) {
                            return (
                              <button
                                onClick={() => {
                                  localStorage.removeItem('trading_table_journal_history');
                                  showToast('Cleared journal history');
                                  setActiveTable((prev) => prev ? { ...prev } : null);
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#f23645',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  padding: '0 4px'
                                }}
                              >
                                Clear All
                              </button>
                            );
                          }
                        } catch {}
                        return null;
                      })()}
                    </div>

                    <div
                      style={{
                        maxHeight: '150px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      {(() => {
                        try {
                          const raw = localStorage.getItem('trading_table_journal_history');
                          const list = raw ? JSON.parse(raw) : [];
                          if (list.length === 0) {
                            return (
                              <div style={{ fontSize: '12px', color: '#606470', fontStyle: 'italic', padding: '8px 4px' }}>
                                No snapshots saved yet. Click "+ Save Current Snapshot" to log your active table.
                              </div>
                            );
                          }
                          return list.map((entry: any, index: number) => {
                            const entryId = entry.id || `snapshot_${index}`;
                            const isEditingThis = editingSnapshotId === entryId;
                            const currentDisplayName = entry.name || entry.symbol || `Snapshot ${index + 1}`;

                            return (
                              <div
                                key={entryId}
                                style={{
                                  backgroundColor: '#181a24',
                                  border: '1px solid #2a2e39',
                                  borderRadius: '6px',
                                  padding: '8px 10px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '8px'
                                }}
                              >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                                  {isEditingThis ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <input
                                        type="text"
                                        autoFocus
                                        value={editingSnapshotName}
                                        onChange={(e) => setEditingSnapshotName(e.target.value)}
                                        onKeyDown={(e) => {
                                          e.stopPropagation();
                                          if (e.key === 'Enter') {
                                            handleRenameSnapshot(entryId, editingSnapshotName);
                                          } else if (e.key === 'Escape') {
                                            setEditingSnapshotId(null);
                                          }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                          backgroundColor: '#1f2330',
                                          border: '1px solid #2962ff',
                                          borderRadius: '4px',
                                          color: '#ffffff',
                                          padding: '2px 6px',
                                          fontSize: '12px',
                                          fontWeight: 600,
                                          outline: 'none',
                                          width: '140px'
                                        }}
                                      />
                                      <button
                                        onClick={() => handleRenameSnapshot(entryId, editingSnapshotName)}
                                        title="Save Name (Enter)"
                                        style={{
                                          backgroundColor: '#2962ff',
                                          border: 'none',
                                          borderRadius: '4px',
                                          color: '#ffffff',
                                          padding: '3px 6px',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center'
                                        }}
                                      >
                                        <Check size={12} />
                                      </button>
                                      <button
                                        onClick={() => setEditingSnapshotId(null)}
                                        title="Cancel (Esc)"
                                        style={{
                                          backgroundColor: 'transparent',
                                          border: 'none',
                                          color: '#868993',
                                          cursor: 'pointer',
                                          padding: '3px 4px',
                                          display: 'flex',
                                          alignItems: 'center'
                                        }}
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <span
                                        onClick={() => {
                                          setEditingSnapshotId(entryId);
                                          setEditingSnapshotName(currentDisplayName);
                                        }}
                                        title="Click to rename snapshot"
                                        style={{
                                          fontSize: '12px',
                                          fontWeight: 600,
                                          color: '#ffffff',
                                          cursor: 'pointer',
                                          borderBottom: '1px dashed rgba(255, 255, 255, 0.25)',
                                          paddingBottom: '1px',
                                          maxWidth: '160px',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = '#2979ff')}
                                        onMouseLeave={(e) => (e.currentTarget.style.color = '#ffffff')}
                                      >
                                        {currentDisplayName}
                                      </span>
                                      <button
                                        onClick={() => {
                                          setEditingSnapshotId(entryId);
                                          setEditingSnapshotName(currentDisplayName);
                                        }}
                                        title="Rename Snapshot"
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          color: '#868993',
                                          cursor: 'pointer',
                                          padding: '2px',
                                          display: 'flex',
                                          alignItems: 'center'
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = '#2979ff')}
                                        onMouseLeave={(e) => (e.currentTarget.style.color = '#868993')}
                                      >
                                        <Edit2 size={11} />
                                      </button>
                                    </div>
                                  )}

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px' }}>
                                    <span style={{ fontSize: '10px', color: '#9aa0a6', fontWeight: 500 }}>
                                      {entry.symbol || 'Symbol'}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: '9px',
                                        backgroundColor: 'rgba(41, 98, 255, 0.15)',
                                        color: '#64b5f6',
                                        padding: '1px 4px',
                                        borderRadius: '3px',
                                        fontWeight: 600
                                      }}
                                    >
                                      {entry.timeframe || '15m'}
                                    </span>
                                    <span style={{ fontSize: '10px', color: '#787b86' }}>
                                      {entry.rows}×{entry.cols}
                                    </span>
                                    <span style={{ fontSize: '9px', color: '#606470' }}>• {entry.date}</span>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <button
                                    onClick={() => {
                                      applyTableUpdate({
                                        rows: entry.rows,
                                        cols: entry.cols,
                                        tableData: entry.tableData
                                      });
                                      showToast(`Restored snapshot (${currentDisplayName})`);
                                    }}
                                    title="Restore this snapshot into table"
                                    style={{
                                      backgroundColor: 'rgba(41, 98, 255, 0.15)',
                                      border: '1px solid rgba(41, 98, 255, 0.3)',
                                      color: '#2979ff',
                                      borderRadius: '4px',
                                      padding: '4px 8px',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Load
                                  </button>
                                  <button
                                    onClick={() => {
                                      const md = tableToMarkdown(entry.tableData, true, false);
                                      navigator.clipboard?.writeText(md);
                                      showToast('Copied snapshot Markdown');
                                    }}
                                    title="Copy as Markdown"
                                    style={{
                                      backgroundColor: 'transparent',
                                      border: '1px solid #2a2e39',
                                      color: '#d1d4dc',
                                      borderRadius: '4px',
                                      padding: '4px 6px',
                                      fontSize: '11px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <Copy size={12} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      try {
                                        const updatedList = list.filter((_: any, i: number) => i !== index);
                                        localStorage.setItem('trading_table_journal_history', JSON.stringify(updatedList));
                                        showToast('Deleted snapshot');
                                        setActiveTable((prev) => (prev ? { ...prev } : null));
                                      } catch {}
                                    }}
                                    title="Delete snapshot"
                                    style={{
                                      backgroundColor: 'transparent',
                                      border: 'none',
                                      color: '#787b86',
                                      borderRadius: '4px',
                                      padding: '4px',
                                      cursor: 'pointer'
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.color = '#f23645')}
                                    onMouseLeave={(e) => (e.currentTarget.style.color = '#787b86')}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          });
                        } catch {
                          return null;
                        }
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              padding: '12px 18px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#11131a'
            }}
          >
            <button
              onClick={handleResetDefaults}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                color: '#d1d4dc',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#d1d4dc';
              }}
            >
              Default
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={handleModalCancel}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#d1d4dc',
                  padding: '6px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#d1d4dc';
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  backgroundColor: '#2962ff',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  padding: '6px 20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1e4bd8'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2962ff'}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
