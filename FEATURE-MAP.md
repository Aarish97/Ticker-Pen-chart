# 🔍 Feature Map — Trading Chart 3

> **How to use:** Find the feature you want to check. See if it's ✅ USED or ❌ UNUSED.  
> For USED features, the **"Used by"** list tells you what will break if you change it.  
> For UNUSED features, you can **safely delete** following the deletion guide.

---

## 📦 Core Types (`src/core/types.ts`)

| Feature | Status | Used by |
|---|---|---|
| `Anchor` | ✅ USED | ALL tools, `drawing.ts`, `tool-registry.ts` |
| `Point` | ✅ USED | ALL tools, `geometry.ts`, `canvas-utils.ts`, pane views |
| `DrawingStyle` | ✅ USED | ALL tools, `drawing.ts`, `canvas-utils.ts`, `tool-registry.ts` |
| `DrawingOptions` | ✅ USED | ALL tools, `drawing.ts`, `tool-registry.ts` |
| `DrawingState` | ✅ USED | `drawing.ts`, `drawing-pane-view.ts` |
| `IDrawing` | ✅ USED | `tool-registry.ts`, `DrawingEvent` |
| `Viewport` | ✅ USED | `drawing.ts`, `drawing-pane-view.ts`, ALL pane views |
| `ControlPoint` | ✅ USED | `drawing.ts`, `canvas-utils.ts`, `drawing-pane-view.ts` |
| `DrawingCategory` | ✅ USED | `tool-registry.ts` |
| `DrawingToolDefinition` | ✅ USED | `tool-registry.ts` |
| `SerializedDrawing` | ✅ USED | `drawing.ts` (toJSON/fromJSON) |
| `DEFAULT_DRAWING_STYLE` | ✅ USED | `drawing.ts` constructor |
| `MouseEventData` | ❌ **UNUSED** | Only defined in `types.ts`, never imported elsewhere |
| `PixelToChartFn` | ❌ **UNUSED** | Only defined in `types.ts`, never imported elsewhere |
| `ChartToPixelFn` | ❌ **UNUSED** | Only defined in `types.ts`, never imported elsewhere |
| `SnapConfig` | ❌ **UNUSED** | Only defined in `types.ts`, never imported elsewhere |
| `DrawingEventType` | ❌ **UNUSED** | Only used internally by `DrawingEvent` type definition |
| `DrawingEvent` | ❌ **UNUSED** | Only used by `DrawingEventCallback` type definition |
| `DrawingEventCallback` | ❌ **UNUSED** | Only defined in `types.ts`, never imported elsewhere |

### 🗑️ Safe to delete from `types.ts`:
```
MouseEventData, PixelToChartFn, ChartToPixelFn, SnapConfig,
DrawingEventType, DrawingEvent, DrawingEventCallback
```
> These were likely planned for a future event system but are not wired up anywhere.

---

## 📐 Geometry Utils (`src/core/geometry.ts`)

| Feature | Status | Used by |
|---|---|---|
| `LineGeometry` | ✅ USED | `drawing-pane-view.ts`, `base-line.ts` |
| `ArcGeometry` | ✅ USED | `drawing-pane-view.ts` (renderArc) |
| `RectangleGeometry` | ✅ USED | `drawing-pane-view.ts` (renderRectangle) |
| `PolygonGeometry` | ✅ USED | `drawing-pane-view.ts` (renderPolygon) |
| `TextGeometry` | ✅ USED | `drawing-pane-view.ts` (renderText) |
| `Geometry` (union type) | ✅ USED | `drawing.ts` (computeGeometry return type) |
| `distanceToLineSegment` | ✅ USED | `base-line.ts`, all pitchforks |
| `distanceToLine` | ✅ USED | `base-line.ts` (extended line hit test) |
| `distanceBetweenPoints` | ✅ USED | `info-line.ts`, `info-line-pane-view.ts` |
| `extendLineToViewport` | ✅ USED | `drawing-pane-view.ts`, `trend-line-pv`, `ray-pv`, `extended-line-pv` |
| `getLineAngleDegrees` | ✅ USED | `trend-line.ts/pv`, `ray-pv`, `info-line.ts/pv`, `extended-line-pv` |
| `midpoint` | ✅ USED | `trend-line.ts/pv`, `ray-pv`, `info-line.ts/pv`, `trend-angle-pv`, `extended-line-pv`, all pitchforks |
| `isPointNear` | ❌ **UNUSED** | Only defined, never imported elsewhere |
| `getLineAngle` | ⚠️ INTERNAL | Only used internally by `getLineAngleDegrees` — not directly imported |
| `rotatePoint` | ❌ **UNUSED** | Only defined, never imported elsewhere |
| `lerp` | ❌ **UNUSED** | Only defined, never imported elsewhere |

### 🗑️ Safe to delete from `geometry.ts`:
```
isPointNear, rotatePoint, lerp
```
> `getLineAngle` is used internally by `getLineAngleDegrees`, so keep it.

---

## 🎨 Canvas Utils (`src/rendering/canvas-utils.ts`)

| Feature | Status | Used by |
|---|---|---|
| `applyStyle` | ✅ USED | Most pane-view files |
| `drawLine` | ✅ USED | Most pane-view files |
| `drawDashedLine` | ✅ USED | gann-box-pv, gann-square-fixed-pv, fib-time-zone-pv, fib-time-extension-pv, fib-extension-pv, fib-channel-pv, projection-pv, bars-pattern-pv, parallel-channel-pv, disjoint-channel-pv |
| `drawControlPoint` | ✅ USED | Used internally by `drawControlPoints` |
| `drawControlPoints` | ✅ USED | ALL pane-view files |
| `drawArrowHead` | ❌ **UNUSED** | Defined but never imported — `drawFilledArrowHead` is used instead |
| `drawFilledArrowHead` | ✅ USED | `arrow-pane-view.ts`, `path-pane-view.ts` |
| `drawCircle` | ✅ USED | `circle-pane-view.ts` |
| `drawRect` | ✅ USED | `rectangle-pv`, `gann-square-pv`, `gann-square-fixed-pv`, `gann-box-pv` |
| `drawText` | ✅ USED | All fibonacci pane views, `fib-retracement-pv`, `price-range-pv`, `date-range-pv`, `date-price-range-pv` |
| `drawLabel` | ✅ USED | All line pane views, `rectangle-pv`, `gann-fan-pv`, `gann-box-pv`, `gann-square-fixed-pv` |
| `formatPrice` | ✅ USED | Many tools and pane views |
| `calculatePriceChange` | ❌ **UNUSED** | Only defined, never called |
| `formatPercentage` | ❌ **UNUSED** | Only defined, never called |
| `getDashPattern` | ✅ USED | Multiple fibonacci/channel pane views |
| `getDotPattern` | ✅ USED | Multiple fibonacci pane views |
| `globalActiveDragAnchorInfo` | ✅ USED | Internally by `drawControlPoints` |
| `setGlobalActiveDragAnchor` | ✅ USED | (exported for external use) |
| `getGlobalActiveDragAnchor` | ✅ USED | (exported for external use) |
| `globalDrawingPlacedCount` | ✅ USED | Internally by `drawControlPoints` |
| `setGlobalDrawingPlacedCount` | ✅ USED | (exported for external use) |
| `getGlobalDrawingPlacedCount` | ✅ USED | (exported for external use) |

### 🗑️ Safe to delete from `canvas-utils.ts`:
```
drawArrowHead, calculatePriceChange, formatPercentage
```

---

## 🛠️ Drawing Tools — Registration Status

### ✅ Registered in `tool-registry.ts` (All 58 tools actively wired)

| Category | Tool Type | Tool Class | Registered |
|---|---|---|---|
| **Lines** | `trend-line` | `TrendLine` | ✅ |
| | `horizontal-line` | `HorizontalLine` | ✅ |
| | `vertical-line` | `VerticalLine` | ✅ |
| | `ray` | `Ray` | ✅ |
| | `arrow` | `Arrow` | ✅ |
| | `extended-line` | `ExtendedLine` | ✅ |
| | `cross-line` | `CrossLine` | ✅ |
| | `info-line` | `InfoLine` | ✅ |
| | `trend-angle` | `TrendAngle` | ✅ |
| | `horizontal-ray` | `HorizontalRay` | ✅ |
| **Shapes** | `rectangle` | `Rectangle` | ✅ |
| | `circle` | `Circle` | ✅ |
| | `triangle` | `Triangle` | ✅ |
| | `price-range` | `PriceRange` | ✅ |
| | `ellipse` | `Ellipse` | ✅ |
| | `arc` | `Arc` | ✅ |
| | `rotated-rectangle` | `RotatedRectangle` | ✅ |
| | `path` | `Path` | ✅ |
| | `polyline` | `Polyline` | ✅ |
| | `curve` | `Curve` | ✅ |
| | `double-curve` | `DoubleCurve` | ✅ |
| | `zoomInBox` | `Rectangle` (reused) | ✅ |
| **Channels** | `parallel-channel` | `ParallelChannel` | ✅ |
| | `regression-trend` | `RegressionTrend` | ✅ |
| | `flat-top-bottom` | `FlatTopBottom` | ✅ |
| | `disjoint-channel` | `DisjointChannel` | ✅ |
| | `fib-retracement` | `FibRetracement` | ✅ |
| **Fibonacci** | `fib-extension` | `FibExtension` | ✅ |
| | `fib-channel` | `FibChannel` | ✅ |
| | `fib-time-zone` | `FibTimeZone` | ✅ |
| | `fib-speed-fan` | `FibSpeedFan` | ✅ |
| | `fib-time-extension` | `FibTimeExtension` | ✅ |
| | `fib-circles` | `FibCircles` | ✅ |
| | `fib-spiral` | `FibSpiral` | ✅ |
| | `fib-arcs` | `FibArcs` | ✅ |
| | `fib-wedge` | `FibWedge` | ✅ |
| | `pitchfan` | `Pitchfan` | ✅ |
| **Pitchforks** | `andrews-pitchfork` | `AndrewsPitchfork` | ✅ |
| | `schiff-pitchfork` | `SchiffPitchfork` | ✅ |
| | `modified-schiff-pitchfork` | `ModifiedSchiffPitchfork` | ✅ |
| | `inside-pitchfork` | `InsidePitchfork` | ✅ |
| **Gann** | `gann-box` | `GannBox` | ✅ |
| | `gann-fan` | `GannFan` | ✅ |
| | `gann-square` | `GannSquare` | ✅ |
| | `gann-square-fixed` | `GannSquareFixed` | ✅ |
| **Forecasting** | `long-position` | `LongPosition` | ✅ |
| | `short-position` | `ShortPosition` | ✅ |
| | `projection` | `Projection` | ✅ |
| | `forecast` | `Forecast` | ✅ |
| | `bars-pattern` | `BarsPattern` | ✅ |
| | `date-range` | `DateRange` | ✅ |
| | `date-price-range` | `DatePriceRange` | ✅ |
| | `measure` | `DatePriceRange` (reused) | ✅ |
| **Annotations** | `text-annotation` | `TextAnnotation` | ✅ |
| | `text-box` | `TextAnnotation` (reused) | ✅ |
| | `brush` | `Brush` | ✅ |
| | `highlighter` | `Highlighter` | ✅ |
| | `arrow-mark-up` | `ArrowMarkUp` | ✅ |
| | `arrow-mark-down` | `ArrowMarkDown` | ✅ |
| | `anchored-text` | `AnchoredText` | ✅ |
| | `price-note` | `PriceNote` | ✅ |
| | `price-label` | `PriceLabel` | ✅ |
| | `flag-mark` | `FlagMark` | ✅ |
| | `pin` | `Pin` | ✅ |
| | `comment` | `Comment` | ✅ |
| | `signpost` | `Signpost` | ✅ |
| | `note` | `Note` | ✅ |
| | `callout` | `Callout` | ✅ |

---

## 📋 Dead Code Cleanup & Changelog Summary

### ✅ Successfully Cleaned Up & Removed:

| Location | Item | Action Taken | Rationale |
|---|---|---|---|
| `core/types.ts` | `MouseEventData`, `PixelToChartFn`, `ChartToPixelFn`, `SnapConfig`, `DrawingEventType`, `DrawingEvent`, `DrawingEventCallback` | ✅ Deleted | Unused type definitions |
| `core/geometry.ts` | `isPointNear`, `rotatePoint`, `lerp` | ✅ Deleted | Dead utility functions |
| `rendering/canvas-utils.ts` | `drawArrowHead`, `calculatePriceChange`, `formatPercentage` | ✅ Deleted | Replaced with active helpers |
| `registry/tool-registry.ts` | Duplicate `arrow` entry (L158-164) | ✅ Deleted duplicate registration | Prevent registry collision |
| `ticker-pen-adapter-bridge.ts` | Obsolete center line color/style coupling | ✅ Removed | Center line reverted to fixed ash dashed style |
| `ticker-pen-adapter-bridge.ts` | Native line figure for regression bands | ✅ Replaced with `customDrawingRenderer` | Fixes missing dotted/dashed patterns & px width sync |
| `SideToolPanel.tsx` / `bridge` | `processOnDeselectedEvent` call errors | ✅ Fixed / Removed unsafe calls | Prevents runtime exceptions on layer screen |

---

### 🚀 Recently Added & Enhanced Features:

| Category / Component | Feature Added / Enhanced | Description |
|---|---|---|
| **Forecasting / Positions** | **Position Toolbar Clone & Layers** | Added **Duplicate/Clone** button and **Layers Dropdown** (Bring to Front, Bring Forward, Send Backward, Send to Back) to Long/Short position toolbars. |
| **Channels / Regression Trend** | **Dual Shade Color Pickers** | Added independent **Upper Shade** and **Lower Shade** color pickers with transparency sliders in `DrawingDragToolbar.tsx`. |
| **Channels / Regression Trend** | **Top & Bottom Line Styling** | Connected line color, exact thickness (1px, 2px, 3px, 4px), and line styles (Solid, Dashed, Dotted with true circular dots). |
| **Channels / Regression Trend** | **Ash Center Regression Line** | Fixed center regression line to Ash (`#787B86`) 1px dashed `[2, 5]` pattern, independent of drag bar controls. |
| **Layer Management** | **Fast Layer Selection & Toolbar Sync** | Fixed drag bar dismiss on switching tools and synchronized overlay selection speed. |
| **Top Panel / Themes** | **Chrome Theme Selector (Light, Dark, System)** | Positioned at the far right corner of the top bar (`themeManager.ts`, `TickerPenProWidget.tsx`, `index.css`) for **Light**, **Dark**, and **System default** theme modes with compact spacing. Top Panel, SideToolPanel, Popovers, Dropdowns (4x3 Layout panel with pure white background, crisp light-black grid lines, and bounds-safe positioning), and Dialogs dynamically and instantly react to theme changes without requiring mouse hover. |
| **Pitchforks / Schiff Pitchfork** | **Schiff Pivot & Origin Resolution** | Fixed `getSchiffOrigin` and `getSchiffPivot` calculations in `schiff-pitchfork.ts` and `schiff-pitchfork-pane-view.ts` for median line rendering and hit detection. |
| **Forecasting & Shapes** | **Price Range & Date Range Cursor-Only Selection** | Constrained `testHit` in `price-range.ts`, `date-range.ts`, and `date-price-range.ts` strictly to the drawn bounding box and info card, preventing accidental selection when crosshair lines pass across the screen. |
| **Side Toolbar / Favorites** | **Unified Favorites Drag Bar** | Unified the Star button floating drag bar (`SideToolPanel.tsx`, `index.css`) to match `DrawingDragToolbar` styling (`#1e222d` solid background, `#2a2e39` border, 6px radius, `GripVertical` drag handle, no close button). Excluded from light theme text/icon overrides to preserve sleek dark drag bar aesthetics. |
| **Annotations / Emoji Picker** | **Light/Dark 2D Emoji & Sticker Picker** | Added full Light & Dark mode support (`EmojiStickerPicker.tsx`) with search, categories, clean scrollbars, and high-contrast grid rendering. |
| **Top Panel / Timeframes** | **Timeframe Text Contrast & Active State** | Ensured selected timeframe dropdown text displays in bold high-contrast color (black in light mode, white in dark mode) with active indicator ticks. |
| **Drawing Persistence (IndexedDB + LS)** | **Robust Multi-Symbol Drawing Persistence** | Resolved drawing save and restoration across page reloads and symbol switches (`drawingIndexedDB.ts`, `TickerPenProWidget.tsx`). Automatically maps point timestamps from `dataList`, hooks into `onDrawEnd`, `onPressedMoveEnd`, `overrideOverlay`, and `beforeunload`, with isolated symbol switching and fallback to `localStorage`. |

---

## 🔗 Feature Connection Chains

### How a tool connects end-to-end:

```
User clicks tool in SideToolPanel.tsx
        │
        ▼
TickerPenProWidget.tsx (sets active tool type)
        │
        ▼
ticker-pen-adapter-bridge.ts (handles mouse events)
        │
        ▼
tool-registry.ts → createDrawing(type) → new ToolClass()
        │
        ▼
ToolClass.ts (extends Drawing, creates PaneView)
  ├── Uses: core/types.ts (Anchor, DrawingStyle, etc.)
  ├── Uses: core/geometry.ts (distance, midpoint, etc.)
  └── Creates: ToolPaneView.ts
              ├── Uses: rendering/canvas-utils.ts (drawLine, drawLabel, etc.)
              └── Renders on chart canvas
```

### To delete a tool completely, remove from:
1. ❌ `tools/category/tool-name.ts` — tool logic
2. ❌ `tools/category/tool-name-pane-view.ts` — rendering
3. ❌ `tools/category/index.ts` — exports
4. ❌ `registry/tool-registry.ts` — import + registration entry
5. ❌ `components/SideToolPanel.tsx` — toolbar button (if present)
6. ❌ `components/DrawingDragToolbar.tsx` — toolbar entry (if present)
7. ❌ `ticker-pen-adapter-bridge.ts` — any tool-specific handling
8. ❌ `components/TickerPenProWidget.tsx` — any tool-specific settings UI

### To add a new tool:
1. ✅ Create `tools/category/tool-name.ts` (extend `Drawing`)
2. ✅ Create `tools/category/tool-name-pane-view.ts` (custom renderer)
3. ✅ Export from `tools/category/index.ts`
4. ✅ Import + register in `registry/tool-registry.ts`
5. ✅ Add button in `components/SideToolPanel.tsx`

---

*Last updated: 2026-08-28*

