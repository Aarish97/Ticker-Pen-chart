# 🗺️ Dependency Map — Trading Chart 3

> **Purpose:** Before you change ANY file, find it in this map and check the  
> **"⚠️ If you change this"** section to know what else could break.

---

## 🔴 DANGER ZONE — Core Files (Changing these affects EVERYTHING)

These files are the foundation. Changing them can break 80+ files.

### `src/core/types.ts` — Master Type Definitions
**Exports:** `Anchor`, `Point`, `DrawingStyle`, `DrawingOptions`, `DrawingState`, `IDrawing`, `Viewport`, `ControlPoint`, `DrawingCategory`, `DrawingToolDefinition`, `SerializedDrawing`, `MouseEventData`, `SnapConfig`

⚠️ **If you change this:**
- **ALL tool files** (every `.ts` in `src/tools/`) depend on these types
- `src/core/drawing.ts` — base class uses these types
- `src/core/geometry.ts` — uses `Point`
- `src/rendering/drawing-pane-view.ts` — uses `Drawing`, `Point`, `Viewport`
- `src/rendering/canvas-utils.ts` — uses `Point`, `DrawingStyle`, `ControlPoint`
- `src/registry/tool-registry.ts` — uses `DrawingToolDefinition`, `DrawingCategory`
- `src/components/DrawingDragToolbar.tsx` — uses drawing types
- `src/components/SideToolPanel.tsx` — uses drawing types
- `src/components/TableToolbarAndModal.tsx` — uses drawing types
- `src/ticker-pen-adapter-bridge.ts` — uses drawing types
- `src/App.tsx` — uses drawing types

> **SAFE way to change:** Only ADD new optional fields (`newField?: type`). Never remove or rename existing fields.

---

### `src/core/drawing.ts` — Base Drawing Class
**Exports:** `Drawing` (abstract class)
**Imports from:** `types.ts`, `geometry.ts`

⚠️ **If you change this:**
| Affected Category | Files Count | Files |
|---|---|---|
| Lines | 11 | `trend-line.ts`, `horizontal-line.ts`, `vertical-line.ts`, `ray.ts`, `arrow.ts`, `extended-line.ts`, `cross-line.ts`, `info-line.ts`, `trend-angle.ts`, `horizontal-ray.ts`, `base-line.ts` |
| Shapes | 11 | `rectangle.ts`, `circle.ts`, `triangle.ts`, `ellipse.ts`, `arc.ts`, `path.ts`, `polyline.ts`, `curve.ts`, `double-curve.ts`, `rotated-rectangle.ts`, `price-range.ts` |
| Fibonacci | 10 | `fib-extension.ts`, `fib-channel.ts`, `fib-time-zone.ts`, `fib-speed-fan.ts`, `fib-time-extension.ts`, `fib-circles.ts`, `fib-spiral.ts`, `fib-arcs.ts`, `fib-wedge.ts`, `pitchfan.ts` |
| Gann | 4 | `gann-box.ts`, `gann-fan.ts`, `gann-square.ts`, `gann-square-fixed.ts` |
| Pitchforks | 4 | `andrews-pitchfork.ts`, `schiff-pitchfork.ts`, `modified-schiff-pitchfork.ts`, `inside-pitchfork.ts` |
| Channels | 5 | `parallel-channel.ts`, `regression-trend.ts`, `flat-top-bottom.ts`, `disjoint-channel.ts`, `fib-retracement.ts` |
| Forecasting | 7 | `long-position.ts`, `short-position.ts`, `date-range.ts`, `date-price-range.ts`, `projection.ts`, `forecast.ts`, `bars-pattern.ts` |
| Annotations | 14 | `text-annotation.ts`, `brush.ts`, `highlighter.ts`, `arrow-mark-up.ts`, `arrow-mark-down.ts`, `anchored-text.ts`, `price-note.ts`, `price-label.ts`, `flag-mark.ts`, `callout.ts`, `comment.ts`, `note.ts`, `pin.ts`, `signpost.ts` |

> **SAFE way to change:** Only ADD new methods/properties. Never change method signatures of existing methods.

---

### `src/core/geometry.ts` — Geometry Types & Math Utils
**Exports:** `Geometry`, `LineGeometry`, `ArcGeometry`, `RectangleGeometry`, `PolygonGeometry`, `TextGeometry`, `distanceToLineSegment`, `distanceToLine`, `distanceBetweenPoints`, `extendLineToViewport`, `getLineAngle`, `rotatePoint`, `midpoint`, `lerp`

⚠️ **If you change this:**
- `src/core/drawing.ts` — uses `Geometry`
- `src/rendering/drawing-pane-view.ts` — uses `LineGeometry`, `extendLineToViewport`
- ALL tool files that compute geometry
- ALL pane-view files that use geometry helpers

---

### `src/rendering/canvas-utils.ts` — Canvas Drawing Helpers
**Exports:** `applyStyle`, `drawLine`, `drawControlPoints`, `getDashPattern`, `getDotPattern`
**Imports from:** `types.ts`

⚠️ **If you change this:**
- `src/rendering/drawing-pane-view.ts` — uses all exports
- ALL custom pane-view files (`*-pane-view.ts`) that import from here

---

### `src/rendering/drawing-pane-view.ts` — Base Pane View & Renderer
**Exports:** `DrawingPaneView`
**Imports from:** `drawing.ts`, `types.ts`, `geometry.ts`, `canvas-utils.ts`

⚠️ **If you change this:**
- ALL tool files that use `DrawingPaneView` in their `paneViews()` method
- Tools with custom pane views may also be indirectly affected

---

## 🟡 MEDIUM RISK — Shared Tool Files

### `src/tools/lines/base-line.ts` — Base Line Class
**Extends:** `Drawing`
**Imports from:** `core/drawing.ts`, `core/types.ts`, `core/geometry.ts`, `rendering/drawing-pane-view.ts`

⚠️ **If you change this:**
- `trend-line.ts`, `horizontal-line.ts`, `vertical-line.ts`, `ray.ts`, `arrow.ts`
- `extended-line.ts`, `cross-line.ts`, `info-line.ts`, `trend-angle.ts`, `horizontal-ray.ts`

---

### `src/tools/pitchforks/pitchfork-levels.ts` — Shared Pitchfork Level Config
**Exports:** `PitchforkLevelItem`, `DEFAULT_PITCHFORK_LEVELS`

⚠️ **If you change this:**
- `andrews-pitchfork.ts`, `schiff-pitchfork.ts`, `modified-schiff-pitchfork.ts`, `inside-pitchfork.ts`
- Their corresponding `*-pane-view.ts` files

---

### `src/registry/tool-registry.ts` — Tool Registration Hub
**Imports:** ALL tool classes from ALL categories
**Imports from:** `core/types.ts`

⚠️ **If you change this:**
- `src/App.tsx` — uses registry
- `src/components/SideToolPanel.tsx` — tool selection
- `src/components/DrawingDragToolbar.tsx` — toolbar
- `src/ticker-pen-adapter-bridge.ts` — adapter

> **When adding a new tool:** You MUST register it here + import it.

---

## 🟢 LOW RISK — Individual Tool Files

Each tool category follows this pattern. Changes are usually safe within a tool pair.

### Pattern: `tool-name.ts` ↔ `tool-name-pane-view.ts`

```
┌──────────────────┐      ┌──────────────────────────┐
│  tool-name.ts    │◄────►│  tool-name-pane-view.ts   │
│  (Logic + State) │      │  (Rendering)              │
│  extends Drawing │      │  implements PaneView       │
└────────┬─────────┘      └─────────────┬────────────┘
         │                              │
         ▼                              ▼
   core/drawing.ts              rendering/canvas-utils.ts
   core/types.ts                core/geometry.ts
```

⚠️ **If you change a tool's `.ts` file:** Check its matching `-pane-view.ts`  
⚠️ **If you change a `-pane-view.ts` file:** Usually safe (only affects that tool's rendering)

---

## 📊 All Tools by Category

### Lines (src/tools/lines/)
| Tool File | Pane View | Extends |
|---|---|---|
| `trend-line.ts` | `trend-line-pane-view.ts` | `BaseLine` |
| `horizontal-line.ts` | `horizontal-line-pane-view.ts` | `BaseLine` |
| `vertical-line.ts` | `vertical-line-pane-view.ts` | `BaseLine` |
| `ray.ts` | `ray-pane-view.ts` | `BaseLine` |
| `arrow.ts` | `arrow-pane-view.ts` | `BaseLine` |
| `extended-line.ts` | `extended-line-pane-view.ts` | `BaseLine` |
| `cross-line.ts` | `cross-line-pane-view.ts` | `BaseLine` |
| `info-line.ts` | `info-line-pane-view.ts` | `BaseLine` |
| `trend-angle.ts` | `trend-angle-pane-view.ts` | `BaseLine` |
| `horizontal-ray.ts` | `horizontal-ray-pane-view.ts` | `BaseLine` |

### Fibonacci (src/tools/fibonacci/)
| Tool File | Pane View | Extends |
|---|---|---|
| `fib-extension.ts` | `fib-extension-pane-view.ts` | `Drawing` |
| `fib-channel.ts` | `fib-channel-pane-view.ts` | `Drawing` |
| `fib-time-zone.ts` | `fib-time-zone-pane-view.ts` | `Drawing` |
| `fib-speed-fan.ts` | `fib-speed-fan-pane-view.ts` | `Drawing` |
| `fib-time-extension.ts` | `fib-time-extension-pane-view.ts` | `Drawing` |
| `fib-circles.ts` | `fib-circles-pane-view.ts` | `Drawing` |
| `fib-spiral.ts` | `fib-spiral-pane-view.ts` | `Drawing` |
| `fib-arcs.ts` | `fib-arcs-pane-view.ts` | `Drawing` |
| `fib-wedge.ts` | `fib-wedge-pane-view.ts` | `Drawing` |
| `pitchfan.ts` | `pitchfan-pane-view.ts` | `Drawing` |

### Gann (src/tools/gann/)
| Tool File | Pane View | Extends |
|---|---|---|
| `gann-box.ts` | `gann-box-pane-view.ts` | `Drawing` |
| `gann-fan.ts` | `gann-fan-pane-view.ts` | `Drawing` |
| `gann-square.ts` | `gann-square-pane-view.ts` | `Drawing` |
| `gann-square-fixed.ts` | `gann-square-fixed-pane-view.ts` | `Drawing` |

### Shapes (src/tools/shapes/)
| Tool File | Pane View | Extends |
|---|---|---|
| `rectangle.ts` | `rectangle-pane-view.ts` | `Drawing` |
| `circle.ts` | `circle-pane-view.ts` | `Drawing` |
| `triangle.ts` | `triangle-pane-view.ts` | `Drawing` |
| `ellipse.ts` | `ellipse-pane-view.ts` | `Drawing` |
| `arc.ts` | `arc-pane-view.ts` | `Drawing` |
| `path.ts` | `path-pane-view.ts` | `Drawing` |
| `polyline.ts` | `polyline-pane-view.ts` | `Drawing` |
| `curve.ts` | `curve-pane-view.ts` | `Drawing` |
| `double-curve.ts` | `double-curve-pane-view.ts` | `Drawing` |
| `rotated-rectangle.ts` | `rotated-rectangle-pane-view.ts` | `Drawing` |
| `price-range.ts` | `price-range-pane-view.ts` | `Drawing` |

### Channels (src/tools/channels/)
| Tool File | Pane View | Extends |
|---|---|---|
| `parallel-channel.ts` | `parallel-channel-pane-view.ts` | `Drawing` |
| `regression-trend.ts` | `regression-trend-pane-view.ts` | `Drawing` |
| `flat-top-bottom.ts` | `flat-top-bottom-pane-view.ts` | `Drawing` |
| `disjoint-channel.ts` | `disjoint-channel-pane-view.ts` | `Drawing` |
| `fib-retracement.ts` | `fib-retracement-pane-view.ts` | `Drawing` |

### Pitchforks (src/tools/pitchforks/)
| Tool File | Pane View | Extends | Shared |
|---|---|---|---|
| `andrews-pitchfork.ts` | `andrews-pitchfork-pane-view.ts` | `Drawing` | `pitchfork-levels.ts` |
| `schiff-pitchfork.ts` | `schiff-pitchfork-pane-view.ts` | `Drawing` | `pitchfork-levels.ts` |
| `modified-schiff-pitchfork.ts` | `modified-schiff-pitchfork-pane-view.ts` | `Drawing` | `pitchfork-levels.ts` |
| `inside-pitchfork.ts` | `inside-pitchfork-pane-view.ts` | `Drawing` | `pitchfork-levels.ts` |

### Annotations (src/tools/annotations/)
| Tool File | Pane View | Extends |
|---|---|---|
| `text-annotation.ts` | `text-annotation-pane-view.ts` | `Drawing` |
| `brush.ts` | `brush-pane-view.ts` | `Drawing` |
| `highlighter.ts` | `highlighter-pane-view.ts` | `Drawing` |
| `arrow-mark-up.ts` | `arrow-mark-up-pane-view.ts` | `Drawing` |
| `arrow-mark-down.ts` | `arrow-mark-down-pane-view.ts` | `Drawing` |
| `anchored-text.ts` | `anchored-text-pane-view.ts` | `Drawing` |
| `price-note.ts` | `price-note-pane-view.ts` | `Drawing` |
| `price-label.ts` | `price-label-pane-view.ts` | `Drawing` |
| `flag-mark.ts` | `flag-mark-pane-view.ts` | `Drawing` |
| `callout.ts` | `callout-pane-view.ts` | `Drawing` |
| `comment.ts` | `comment-pane-view.ts` | `Drawing` |
| `note.ts` | `note-pane-view.ts` | `Drawing` |
| `pin.ts` | `pin-pane-view.ts` | `Drawing` |
| `signpost.ts` | `signpost-pane-view.ts` | `Drawing` |

### Forecasting (src/tools/forecasting/)
| Tool File | Pane View | Extends |
|---|---|---|
| `long-position.ts` | `long-position-pane-view.ts` | `Drawing` |
| `short-position.ts` | `short-position-pane-view.ts` | `Drawing` |
| `date-range.ts` | `date-range-pane-view.ts` | `Drawing` |
| `date-price-range.ts` | `date-price-range-pane-view.ts` | `Drawing` |
| `projection.ts` | `projection-pane-view.ts` | `Drawing` |
| `forecast.ts` | `forecast-pane-view.ts` | `Drawing` |
| `bars-pattern.ts` | `bars-pattern-pane-view.ts` | `Drawing` |

### `src/components/DrawingDragToolbar.tsx` — Floating Drawing Toolbar
**Handles:** Line Color, Line Width (1px–4px), Line Style (Solid, Dashed, Dotted), Fill/Shades, Dual Shades (Regression Upper/Lower), Transparency, Lock, Delete, Layers Ordering, and Tool-specific settings.

⚠️ **If you change this:**
- `src/ticker-pen-adapter-bridge.ts` — receives override updates via `overrideOverlay` and `extendData`
- Tool-specific rendering (`regression-trend`, pitchforks, fibonacci) that read `extendData`

---

### `src/components/TickerPenProWidget.tsx` — Main Chart Widget & Overlays
**Handles:** Chart initialization, overlay stack management (`cloneOverlayInStack`, `reorderOverlayInStack`), position settings panel (Long/Short Position with Clone and Layers dropdowns), drawing persistence load/save hooks, screenshot high-res renderer, undo/redo state events.

⚠️ **If you change this:**
- `src/ticker-pen-adapter-bridge.ts` — coordinate sync & custom figures
- `src/components/SideToolPanel.tsx` — tool activation & layer screen events
- `src/utils/drawingIndexedDB.ts` — drawing save/load per symbol
- `src/components/PaperTradeOverlay.tsx` — paper trade overlay integration

---

### `src/utils/drawingIndexedDB.ts` — Drawing Persistence & Coordinate Remapping
**Exports:** `saveDrawingsToIndexedDB`, `getDrawingsFromIndexedDB`, `deleteDrawingsFromIndexedDB`, `timestampToDataIndex`
**Handles:** Persisting overlay snapshots in IndexedDB per symbol (`TickerPen_DrawingStorage_v1`), binary search timestamp-to-dataIndex remapping, past/future bar extrapolation without boundary clamping.

⚠️ **If you change this:**
- `src/components/TickerPenProWidget.tsx` — debounced drawing save and load hooks
- `src/ticker-pen-adapter-bridge.ts` — history-prepend coordinate re-sync in `createPointFigures`

---

### `src/utils/drawingIndexedDB.ts` — IndexedDB & LocalStorage Drawing Persistence Engine
**Exports:** `saveDrawingsToIndexedDB`, `getDrawingsFromIndexedDB`, `deleteDrawingsFromIndexedDB`, `timestampToDataIndex`, `SerializedDrawingOverlay`, `SerializedOverlayPoint`
**Handles:** Multi-symbol persistent drawing storage with timestamp-based canonical X-coordinates, `dataList` timeline mapping/extrapolation, and instant `localStorage` mirror backup.

⚠️ **If you change this:**
- `src/components/TickerPenProWidget.tsx` — invokes save on `onDrawEnd`, `onPressedMoveEnd`, `overrideOverlay`, `removeOverlay`, `update-layer-panel`, `beforeunload`, and handles symbol switching/restoration.

---

### `src/utils/shortcutManager.ts` — Custom Keyboard Shortcut System
**Exports:** `ALL_SHORTCUT_DEFINITIONS`, `getCustomShortcuts`, `saveCustomShortcuts`, `resetCustomShortcuts`, `parseKeyEventToShortcutString`, `matchesShortcut`, `getShortcutForToolKey`
**Handles:** Central registry of shortcuts for all drawing tools & chart actions, localStorage persistence (`__user_custom_shortcuts__`), key combination parser & matcher, conflict detection.

⚠️ **If you change this:**
- `src/components/ShortcutsSettingsTab.tsx` — interactive shortcut editor in Settings
- `src/components/SideToolPanel.tsx` — global keydown shortcut dispatcher & popover badges
- `src/components/TickerPenProWidget.tsx` — handles `trigger-undo`, `trigger-redo`, `trigger-delete-selected`

---

### `src/components/ShortcutsSettingsTab.tsx` — Shortcuts Settings UI
**Handles:** Interactive key combination recorder, search filter, category pills, single-key clear & reset, global reset defaults, conflict warnings, saved toast feedback.

⚠️ **If you change this:**
- `src/App.tsx` — rendered in Master Chart Settings modal under "Shortcuts" tab

---

### `src/components/EmojiStickerPicker.tsx` — 2D Emoji & Sticker Picker
**Handles:** Searchable 2D emoji & sticker picker with categories, high-contrast grid rendering, and immediate Light/Dark theme reactivity via `chrome-theme-changed` and `MutationObserver`.

⚠️ **If you change this:**
- `src/components/SideToolPanel.tsx` — opens sticker/emoji picker modal for emoji overlay placement

---

### `src/components/PaperTradeOverlay.tsx` — Temporary Interactive Paper Trade Panel
**Handles:** Floating live trade position with draggable TP / SL levels, interactive price tags, P&L badge calculations, and toolbar toggle trigger.

⚠️ **If you change this:**
- `src/components/TickerPenProWidget.tsx` — renders the overlay inside the widget container
- `src/utils/shortcutManager.ts` — mapped to `Alt + Shift + T` action

---

### `src/utils/themeManager.ts` — Chrome Theme Manager (Top & Side Toolbars Only)
**Exports:** `getSavedChromeThemeMode`, `setChromeThemeMode`, `getEffectiveChromeTheme`, `applyChromeTheme`, `ChromeThemeMode`, `STORAGE_KEY_CHROME_THEME`
**Handles:** Manages Light, Dark, and System Default theme modes for UI chrome (Top Panel & Side Tool Panel) with zero interference on chart canvas/candles. Dispatches `chrome-theme-changed` and sets `data-chrome-theme` on `document.documentElement`.

⚠️ **If you change this:**
- `src/components/TickerPenProWidget.tsx` — top bar theme dropdown selector
- `src/components/SideToolPanel.tsx` — reactive toolbar, favorites drag bar, popovers, and bottom 6 controls
- `src/components/EmojiStickerPicker.tsx` — reactive light/dark emoji modal picker
- `src/main.tsx` — bootstrap theme application on startup
- `src/index.css` — CSS variable selectors `[data-chrome-theme="light"]` / `[data-chrome-theme="dark"]`

---

## 📋 Quick Reference: File → Check These

| When you edit... | Also check... |
|---|---|
| `core/types.ts` | **EVERYTHING** — run full build |
| `core/drawing.ts` | All tools, all pane views |
| `core/geometry.ts` | All pane views, drawing.ts |
| `rendering/canvas-utils.ts` | All pane views |
| `rendering/drawing-pane-view.ts` | All tools using base DrawingPaneView |
| `lines/base-line.ts` | All 10 line tools |
| `pitchforks/pitchfork-levels.ts` | All 4 pitchfork tools |
| `registry/tool-registry.ts` | App.tsx, SideToolPanel, DrawingDragToolbar |
| `DrawingDragToolbar.tsx` | `ticker-pen-adapter-bridge.ts` extendData handling |
| `TickerPenProWidget.tsx` | Overlay stack, position toolbars, drawing save/load, timeframe selector |
| `utils/drawingIndexedDB.ts` | `TickerPenProWidget.tsx` (IndexedDB + LS persistence) |
| `utils/themeManager.ts` | `TickerPenProWidget.tsx`, `SideToolPanel.tsx`, `EmojiStickerPicker.tsx`, `index.css` |
| `utils/shortcutManager.ts` | `ShortcutsSettingsTab.tsx`, `SideToolPanel.tsx`, `TickerPenProWidget.tsx` |
| `EmojiStickerPicker.tsx` | `SideToolPanel.tsx` |
| `ShortcutsSettingsTab.tsx` | `App.tsx` (Settings modal) |
| `PaperTradeOverlay.tsx` | `TickerPenProWidget.tsx` |
| Any `tool.ts` file | Its matching `-pane-view.ts` |
| Any `-pane-view.ts` file | Usually just that tool (safe ✅) |
| `tools/*/index.ts` | Files that import from that index |
| `App.tsx` | Settings modal, layout and chart widgets |
| `ticker-pen-adapter-bridge.ts` | Drawing rendering, coordinate sync, mouse handlers |

---

## 🔀 Complete Connection Chain (Top to Bottom)

```
src/App.tsx
  └── Settings Modal (Symbol, Status Line, Scales, Canvas, Shortcuts, Logs)
        └── src/components/ShortcutsSettingsTab.tsx
              └── src/utils/shortcutManager.ts (Storage & Matcher)
  └── src/ticker-pen-adapter-bridge.ts
        └── src/utils/drawingIndexedDB.ts (History re-sync & bar extrapolation)
  └── src/components/TickerPenProWidget.tsx
        └── src/utils/themeManager.ts (Theme selector & broadcast)
        └── src/utils/drawingIndexedDB.ts (IndexedDB + LS persistence per symbol)
        └── src/components/PaperTradeOverlay.tsx (Live TP/SL drag overlay)
        └── Overlay Stack & Position Toolbars (Clone, Layers)
  └── src/components/DrawingDragToolbar.tsx
        └── Drag Toolbar Controls (Colors, Widths, Styles, Dual Shades)
  └── src/components/SideToolPanel.tsx
        └── src/utils/themeManager.ts (Theme reactivity without hover)
        └── src/components/EmojiStickerPicker.tsx (2D Emoji modal picker)
        └── Star Favorites Floating Drag Bar
        └── src/utils/shortcutManager.ts (Global shortcut key listener & badges)
  └── src/registry/tool-registry.ts
        └── src/tools/lines/*.ts
        │     └── src/tools/lines/base-line.ts
        │           └── src/core/drawing.ts ──────────────┐
        └── src/tools/fibonacci/*.ts                      │
        │     └── src/core/drawing.ts ◄───────────────────┤
        └── src/tools/gann/*.ts                           │
        │     └── src/core/drawing.ts ◄───────────────────┤
        └── src/tools/shapes/*.ts                         │
        │     └── src/core/drawing.ts ◄───────────────────┤
        └── src/tools/channels/*.ts                       │
        │     └── src/core/drawing.ts ◄───────────────────┤
        └── src/tools/pitchforks/*.ts                     │
        │     └── src/core/drawing.ts ◄───────────────────┤
        └── src/tools/forecasting/*.ts                    │
        │     └── src/core/drawing.ts ◄───────────────────┤
        └── src/tools/annotations/*.ts                    │
              └── src/core/drawing.ts ◄───────────────────┘
                    └── src/core/types.ts        (Master Types)
                    └── src/core/geometry.ts      (Math Utils)
                    
        All *-pane-view.ts files
              └── src/rendering/canvas-utils.ts  (Canvas Helpers)
              └── src/rendering/drawing-pane-view.ts (Base Renderer)
              └── src/core/geometry.ts
              └── src/core/types.ts
```

---

## ✅ How to Use This Map

### Before making ANY change:
1. **Find the file** you want to edit in this map
2. **Check "⚠️ If you change this"** to see what depends on it
3. **If it's in DANGER ZONE** → Be extra careful, test everything
4. **If it's in MEDIUM RISK** → Test the related tool group
5. **If it's LOW RISK (individual tool)** → Just test that tool and its pane-view

### When adding a new tool:
1. Create `tool-name.ts` (extends `Drawing`)
2. Create `tool-name-pane-view.ts` (custom renderer)
3. Export both from the category's `index.ts`
4. Register in `src/registry/tool-registry.ts`
5. Add toolbar entry in `src/components/SideToolPanel.tsx`

### When adding a new option to an existing tool:
1. Add the option to the tool's options type (e.g., `FibCirclesOptions`, `RegressionTrendOptions`)
2. Update the pane-view if the option affects rendering
3. Update the toolbar/settings UI if needed (`DrawingDragToolbar.tsx`, `TickerPenProWidget.tsx`)
4. ✅ No need to change core files if the option is tool-specific

---

*Last updated: 2026-08-28*
