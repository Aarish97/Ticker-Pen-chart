/**
 * Custom Keyboard Shortcuts Manager
 * Handles user-configurable shortcut bindings for all drawing tools and chart actions.
 */

export interface ShortcutDefinition {
  id: string;
  name: string;
  category: 'lines' | 'fib' | 'shapes' | 'forecasting' | 'annotations' | 'actions';
  categoryLabel: string;
  defaultShortcut: string;
  type: 'tool' | 'action';
  toolKey?: string;
  actionKey?: string;
}

export const ALL_SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  // ─── Lines & Channels ───
  { id: 'tool_trendLine', name: 'Trendline', category: 'lines', categoryLabel: 'Lines & Channels', defaultShortcut: 'Alt + T', type: 'tool', toolKey: 'trendLine' },
  { id: 'tool_horizontalLine', name: 'Horizontal Line', category: 'lines', categoryLabel: 'Lines & Channels', defaultShortcut: 'Alt + H', type: 'tool', toolKey: 'horizontalLine' },
  { id: 'tool_horizontalRay', name: 'Horizontal Ray', category: 'lines', categoryLabel: 'Lines & Channels', defaultShortcut: 'Alt + J', type: 'tool', toolKey: 'horizontalRay' },
  { id: 'tool_verticalLine', name: 'Vertical Line', category: 'lines', categoryLabel: 'Lines & Channels', defaultShortcut: 'Alt + V', type: 'tool', toolKey: 'verticalLine' },
  { id: 'tool_crossLine', name: 'Cross Line', category: 'lines', categoryLabel: 'Lines & Channels', defaultShortcut: 'Alt + C', type: 'tool', toolKey: 'crossLine' },
  { id: 'tool_ray', name: 'Ray', category: 'lines', categoryLabel: 'Lines & Channels', defaultShortcut: 'Alt + Y', type: 'tool', toolKey: 'ray' },
  { id: 'tool_infoLine', name: 'Info Line', category: 'lines', categoryLabel: 'Lines & Channels', defaultShortcut: 'Alt + I', type: 'tool', toolKey: 'infoLine' },
  { id: 'tool_extendedLine', name: 'Extended Line', category: 'lines', categoryLabel: 'Lines & Channels', defaultShortcut: 'Alt + E', type: 'tool', toolKey: 'extendedLine' },
  { id: 'tool_trendAngle', name: 'Trend Angle', category: 'lines', categoryLabel: 'Lines & Channels', defaultShortcut: '', type: 'tool', toolKey: 'trendAngle' },
  { id: 'tool_parallelChannel', name: 'Parallel Channel', category: 'lines', categoryLabel: 'Lines & Channels', defaultShortcut: 'Alt + P', type: 'tool', toolKey: 'parallelChannel' },
  { id: 'tool_regressionTrend', name: 'Regression Trend', category: 'lines', categoryLabel: 'Lines & Channels', defaultShortcut: '', type: 'tool', toolKey: 'regressionTrend' },
  { id: 'tool_flatTopBottom', name: 'Flat Top / Bottom', category: 'lines', categoryLabel: 'Lines & Channels', defaultShortcut: '', type: 'tool', toolKey: 'flatTopBottom' },
  { id: 'tool_disjointChannel', name: 'Disjoint Channel', category: 'lines', categoryLabel: 'Lines & Channels', defaultShortcut: '', type: 'tool', toolKey: 'disjointChannel' },

  // ─── Fibonacci & Gann ───
  { id: 'tool_retracement', name: 'Fib Retracement', category: 'fib', categoryLabel: 'Fibonacci & Gann', defaultShortcut: 'Alt + F', type: 'tool', toolKey: 'retracement' },
  { id: 'tool_extension', name: 'Fib Extension', category: 'fib', categoryLabel: 'Fibonacci & Gann', defaultShortcut: 'Alt + X', type: 'tool', toolKey: 'extension' },
  { id: 'tool_channel', name: 'Fib Channel', category: 'fib', categoryLabel: 'Fibonacci & Gann', defaultShortcut: '', type: 'tool', toolKey: 'channel' },
  { id: 'tool_timeZone', name: 'Fib Time Zone', category: 'fib', categoryLabel: 'Fibonacci & Gann', defaultShortcut: '', type: 'tool', toolKey: 'timeZone' },
  { id: 'tool_box', name: 'Gann Box', category: 'fib', categoryLabel: 'Fibonacci & Gann', defaultShortcut: '', type: 'tool', toolKey: 'box' },
  { id: 'tool_fan', name: 'Gann Fan', category: 'fib', categoryLabel: 'Fibonacci & Gann', defaultShortcut: '', type: 'tool', toolKey: 'fan' },
  { id: 'tool_square', name: 'Gann Square', category: 'fib', categoryLabel: 'Fibonacci & Gann', defaultShortcut: '', type: 'tool', toolKey: 'square' },

  // ─── Shapes & Brushes ───
  { id: 'tool_rectangle', name: 'Rectangle', category: 'shapes', categoryLabel: 'Shapes & Brushes', defaultShortcut: 'Alt + R', type: 'tool', toolKey: 'rectangle' },
  { id: 'tool_rotatedRectangle', name: 'Rotated Rectangle', category: 'shapes', categoryLabel: 'Shapes & Brushes', defaultShortcut: '', type: 'tool', toolKey: 'rotatedRectangle' },
  { id: 'tool_circle', name: 'Circle', category: 'shapes', categoryLabel: 'Shapes & Brushes', defaultShortcut: 'Alt + O', type: 'tool', toolKey: 'circle' },
  { id: 'tool_triangle', name: 'Triangle', category: 'shapes', categoryLabel: 'Shapes & Brushes', defaultShortcut: '', type: 'tool', toolKey: 'triangle' },
  { id: 'tool_ellipse', name: 'Ellipse', category: 'shapes', categoryLabel: 'Shapes & Brushes', defaultShortcut: '', type: 'tool', toolKey: 'ellipse' },
  { id: 'tool_arc', name: 'Arc', category: 'shapes', categoryLabel: 'Shapes & Brushes', defaultShortcut: '', type: 'tool', toolKey: 'arc' },
  { id: 'tool_path', name: 'Path', category: 'shapes', categoryLabel: 'Shapes & Brushes', defaultShortcut: '', type: 'tool', toolKey: 'path' },
  { id: 'tool_polyline', name: 'Polyline', category: 'shapes', categoryLabel: 'Shapes & Brushes', defaultShortcut: 'Alt + B', type: 'tool', toolKey: 'polyline' },
  { id: 'tool_brush', name: 'Brush', category: 'shapes', categoryLabel: 'Shapes & Brushes', defaultShortcut: '', type: 'tool', toolKey: 'brush' },
  { id: 'tool_highlighter', name: 'Highlighter', category: 'shapes', categoryLabel: 'Shapes & Brushes', defaultShortcut: '', type: 'tool', toolKey: 'highlighter' },

  // ─── Forecasting & Measurement ───
  { id: 'tool_measure', name: 'Measure', category: 'forecasting', categoryLabel: 'Forecasting & Measurement', defaultShortcut: 'Shift + M', type: 'tool', toolKey: 'measure' },
  { id: 'tool_longPosition', name: 'Long Position', category: 'forecasting', categoryLabel: 'Forecasting & Measurement', defaultShortcut: 'Alt + L', type: 'tool', toolKey: 'longPosition' },
  { id: 'tool_shortPosition', name: 'Short Position', category: 'forecasting', categoryLabel: 'Forecasting & Measurement', defaultShortcut: 'Alt + S', type: 'tool', toolKey: 'shortPosition' },
  { id: 'tool_priceRange', name: 'Price Range', category: 'forecasting', categoryLabel: 'Forecasting & Measurement', defaultShortcut: 'Alt + Shift + P', type: 'tool', toolKey: 'priceRange' },
  { id: 'tool_dateRange', name: 'Date Range', category: 'forecasting', categoryLabel: 'Forecasting & Measurement', defaultShortcut: 'Alt + Shift + D', type: 'tool', toolKey: 'dateRange' },
  { id: 'tool_datePriceRange', name: 'Date & Price Range', category: 'forecasting', categoryLabel: 'Forecasting & Measurement', defaultShortcut: 'Alt + Shift + R', type: 'tool', toolKey: 'datePriceRange' },
  { id: 'tool_paperTrade', name: 'Paper Trade Overlay', category: 'forecasting', categoryLabel: 'Forecasting & Measurement', defaultShortcut: 'Alt + Shift + T', type: 'action', actionKey: 'togglePaperTrade' },

  // ─── Annotations ───
  { id: 'tool_text', name: 'Text', category: 'annotations', categoryLabel: 'Text & Annotations', defaultShortcut: 'Ctrl + Alt + T', type: 'tool', toolKey: 'text' },
  { id: 'tool_anchoredText', name: 'Anchored Text', category: 'annotations', categoryLabel: 'Text & Annotations', defaultShortcut: '', type: 'tool', toolKey: 'anchoredText' },
  { id: 'tool_table', name: 'Table', category: 'annotations', categoryLabel: 'Text & Annotations', defaultShortcut: '', type: 'tool', toolKey: 'table' },

  // ─── Chart Actions ───
  { id: 'act_undo', name: 'Undo Drawing Action', category: 'actions', categoryLabel: 'Chart Actions', defaultShortcut: 'Ctrl + Z', type: 'action', actionKey: 'undo' },
  { id: 'act_redo', name: 'Redo Drawing Action', category: 'actions', categoryLabel: 'Chart Actions', defaultShortcut: 'Ctrl + Y', type: 'action', actionKey: 'redo' },
  { id: 'act_deleteSelected', name: 'Delete Selected Drawing', category: 'actions', categoryLabel: 'Chart Actions', defaultShortcut: 'Delete', type: 'action', actionKey: 'deleteSelected' },
  { id: 'act_deleteAllDrawings', name: 'Remove All Drawings', category: 'actions', categoryLabel: 'Chart Actions', defaultShortcut: 'Alt + K', type: 'action', actionKey: 'deleteAllDrawings' },
  { id: 'act_toggleMagnet', name: 'Toggle Magnet Mode', category: 'actions', categoryLabel: 'Chart Actions', defaultShortcut: 'Alt + M', type: 'action', actionKey: 'toggleMagnet' },
  { id: 'act_toggleStayInDrawingMode', name: 'Toggle Stay in Drawing Mode', category: 'actions', categoryLabel: 'Chart Actions', defaultShortcut: 'Alt + D', type: 'action', actionKey: 'toggleStayInDrawingMode' },
  { id: 'act_toggleLockAll', name: 'Lock / Unlock All Drawings', category: 'actions', categoryLabel: 'Chart Actions', defaultShortcut: 'Alt + Q', type: 'action', actionKey: 'toggleLockAll' },
  { id: 'act_toggleHideDrawings', name: 'Hide / Show All Drawings', category: 'actions', categoryLabel: 'Chart Actions', defaultShortcut: 'Alt + W', type: 'action', actionKey: 'toggleHideDrawings' },
  { id: 'act_resetZoom', name: 'Reset Chart Zoom / Pan', category: 'actions', categoryLabel: 'Chart Actions', defaultShortcut: 'Alt + Z', type: 'action', actionKey: 'resetZoom' },
  { id: 'act_cursorCross', name: 'Select Crosshair Cursor', category: 'actions', categoryLabel: 'Chart Actions', defaultShortcut: 'Escape', type: 'tool', toolKey: 'cross' }
];

export const STORAGE_KEY_CUSTOM_SHORTCUTS = '__user_custom_shortcuts__';

/**
 * Get current configured shortcuts (user customized + fallback defaults).
 */
export function getCustomShortcuts(): Record<string, string> {
  const customMap: Record<string, string> = {};

  // 1. Initialize with defaults
  ALL_SHORTCUT_DEFINITIONS.forEach(def => {
    if (def.defaultShortcut) {
      customMap[def.id] = def.defaultShortcut;
    }
  });

  // 2. Overlay user stored preferences
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_SHORTCUTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          Object.keys(parsed).forEach(k => {
            customMap[k] = parsed[k];
          });
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load custom shortcuts:', e);
  }

  return customMap;
}

/**
 * Save user custom shortcuts to localStorage and notify listeners.
 */
export function saveCustomShortcuts(shortcuts: Record<string, string>): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_CUSTOM_SHORTCUTS, JSON.stringify(shortcuts));
      window.dispatchEvent(new CustomEvent('custom-shortcuts-updated', { detail: shortcuts }));
    }
  } catch (e) {
    console.warn('Failed to save custom shortcuts:', e);
  }
}

/**
 * Reset all shortcuts back to default values.
 */
export function resetCustomShortcuts(): Record<string, string> {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_CUSTOM_SHORTCUTS);
      const defaults = getCustomShortcuts();
      window.dispatchEvent(new CustomEvent('custom-shortcuts-updated', { detail: defaults }));
      return defaults;
    }
  } catch (e) {}
  return getCustomShortcuts();
}

/**
 * Convert a KeyboardEvent into a normalized shortcut string (e.g. "Alt + T", "Ctrl + Shift + Z").
 */
export function parseKeyEventToShortcutString(e: KeyboardEvent): string | null {
  // Ignore bare modifier key presses
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    return null;
  }

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let key = e.key.toUpperCase();
  if (e.key === ' ') key = 'Space';
  else if (e.key === 'Escape') key = 'Escape';
  else if (e.key === 'Delete') key = 'Delete';
  else if (e.key === 'Backspace') key = 'Backspace';
  else if (e.key === 'Enter') key = 'Enter';
  else if (e.key.length === 1) key = e.key.toUpperCase();

  parts.push(key);
  return parts.join(' + ');
}

/**
 * Test if a KeyboardEvent matches a normalized shortcut string.
 */
export function matchesShortcut(e: KeyboardEvent, shortcutStr: string): boolean {
  if (!shortcutStr || !shortcutStr.trim()) return false;

  const parts = shortcutStr.split('+').map(p => p.trim().toUpperCase());
  const hasCtrl = parts.includes('CTRL') || parts.includes('CONTROL') || parts.includes('CMD') || parts.includes('META');
  const hasAlt = parts.includes('ALT') || parts.includes('OPTION');
  const hasShift = parts.includes('SHIFT');

  const mainKeyPart = parts.find(p => !['CTRL', 'CONTROL', 'CMD', 'META', 'ALT', 'OPTION', 'SHIFT'].includes(p));
  if (!mainKeyPart) return false;

  const actualCtrl = !!(e.ctrlKey || e.metaKey);
  const actualAlt = !!e.altKey;
  const actualShift = !!e.shiftKey;

  if (actualCtrl !== hasCtrl) return false;
  if (actualAlt !== hasAlt) return false;
  if (actualShift !== hasShift) return false;

  let eventKey = e.key.toUpperCase();
  if (e.key === ' ') eventKey = 'SPACE';

  return eventKey === mainKeyPart || e.code.toUpperCase() === mainKeyPart || `KEY${eventKey}` === mainKeyPart;
}

/**
 * Find shortcut string for a toolKey (e.g. 'trendLine') from active shortcuts map.
 */
export function getShortcutForToolKey(toolKey: string, shortcutsMap: Record<string, string>): string {
  const def = ALL_SHORTCUT_DEFINITIONS.find(d => d.toolKey === toolKey);
  if (!def) return '';
  return shortcutsMap[def.id] || '';
}
