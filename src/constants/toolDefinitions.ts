export interface DrawingToolMetadata {
  type: string;
  name: string;
  category: string;
  requiredAnchors: number;
}

export const TOOL_DEFINITIONS: DrawingToolMetadata[] = [
  {
    "type": "trend-line",
    "name": "Trend Line",
    "category": "line",
    "requiredAnchors": 2
  },
  {
    "type": "horizontal-line",
    "name": "Horizontal Line",
    "category": "line",
    "requiredAnchors": 1
  },
  {
    "type": "vertical-line",
    "name": "Vertical Line",
    "category": "line",
    "requiredAnchors": 1
  },
  {
    "type": "ray",
    "name": "Ray",
    "category": "line",
    "requiredAnchors": 2
  },
  {
    "type": "arrow",
    "name": "Arrow",
    "category": "line",
    "requiredAnchors": 2
  },
  {
    "type": "extended-line",
    "name": "Extended Line",
    "category": "line",
    "requiredAnchors": 2
  },
  {
    "type": "cross-line",
    "name": "Cross Line",
    "category": "line",
    "requiredAnchors": 1
  },
  {
    "type": "info-line",
    "name": "Info Line",
    "category": "line",
    "requiredAnchors": 2
  },
  {
    "type": "trend-angle",
    "name": "Trend Angle",
    "category": "line",
    "requiredAnchors": 2
  },
  {
    "type": "horizontal-ray",
    "name": "Horizontal Ray",
    "category": "line",
    "requiredAnchors": 1
  },
  {
    "type": "zoomInBox",
    "name": "Zoom In Box",
    "category": "shape",
    "requiredAnchors": 2
  },
  {
    "type": "rectangle",
    "name": "Rectangle",
    "category": "shape",
    "requiredAnchors": 2
  },
  {
    "type": "circle",
    "name": "Circle",
    "category": "shape",
    "requiredAnchors": 2
  },
  {
    "type": "triangle",
    "name": "Triangle",
    "category": "shape",
    "requiredAnchors": 3
  },
  {
    "type": "price-range",
    "name": "Price Range",
    "category": "shape",
    "requiredAnchors": 2
  },
  {
    "type": "parallel-channel",
    "name": "Parallel Channel",
    "category": "channel",
    "requiredAnchors": 3
  },
  {
    "type": "regression-trend",
    "name": "Regression Trend",
    "category": "channel",
    "requiredAnchors": 2
  },
  {
    "type": "flat-top-bottom",
    "name": "Flat Top/Bottom",
    "category": "channel",
    "requiredAnchors": 3
  },
  {
    "type": "disjoint-channel",
    "name": "Disjoint Channel",
    "category": "channel",
    "requiredAnchors": 3
  },
  {
    "type": "fib-retracement",
    "name": "Fibonacci Retracement",
    "category": "fibonacci",
    "requiredAnchors": 3
  },
  {
    "type": "fib-extension",
    "name": "Fibonacci Extension",
    "category": "fibonacci",
    "requiredAnchors": 4
  },
  {
    "type": "fib-channel",
    "name": "Fibonacci Channel",
    "category": "fibonacci",
    "requiredAnchors": 3
  },
  {
    "type": "fib-time-zone",
    "name": "Fibonacci Time Zone",
    "category": "fibonacci",
    "requiredAnchors": 2
  },
  {
    "type": "fib-speed-fan",
    "name": "Fibonacci Speed Fan",
    "category": "fibonacci",
    "requiredAnchors": 2
  },
  {
    "type": "fib-time-extension",
    "name": "Trend-Based Fib Time",
    "category": "fibonacci",
    "requiredAnchors": 3
  },
  {
    "type": "fib-circles",
    "name": "Fibonacci Circles",
    "category": "fibonacci",
    "requiredAnchors": 2
  },
  {
    "type": "fib-spiral",
    "name": "Fibonacci Spiral",
    "category": "fibonacci",
    "requiredAnchors": 2
  },
  {
    "type": "fib-arcs",
    "name": "Fibonacci Arcs",
    "category": "fibonacci",
    "requiredAnchors": 2
  },
  {
    "type": "fib-wedge",
    "name": "Fibonacci Wedge",
    "category": "fibonacci",
    "requiredAnchors": 3
  },
  {
    "type": "pitchfan",
    "name": "Pitchfan",
    "category": "fibonacci",
    "requiredAnchors": 3
  },
  {
    "type": "schiff-pitchfork",
    "name": "Schiff Pitchfork",
    "category": "pitchfork",
    "requiredAnchors": 3
  },
  {
    "type": "modified-schiff-pitchfork",
    "name": "Modified Schiff Pitchfork",
    "category": "pitchfork",
    "requiredAnchors": 3
  },
  {
    "type": "inside-pitchfork",
    "name": "Inside Pitchfork",
    "category": "pitchfork",
    "requiredAnchors": 3
  },
  {
    "type": "gann-box",
    "name": "Gann Box",
    "category": "gann",
    "requiredAnchors": 2
  },
  {
    "type": "gann-fan",
    "name": "Gann Fan",
    "category": "gann",
    "requiredAnchors": 2
  },
  {
    "type": "gann-square",
    "name": "Gann Square",
    "category": "gann",
    "requiredAnchors": 2
  },
  {
    "type": "gann-square-fixed",
    "name": "Gann Square (Fixed)",
    "category": "gann",
    "requiredAnchors": 1
  },
  {
    "type": "long-position",
    "name": "Long Position",
    "category": "forecasting",
    "requiredAnchors": 1
  },
  {
    "type": "short-position",
    "name": "Short Position",
    "category": "forecasting",
    "requiredAnchors": 1
  },
  {
    "type": "date-range",
    "name": "Date Range",
    "category": "measurement",
    "requiredAnchors": 2
  },
  {
    "type": "date-price-range",
    "name": "Date and Price Range",
    "category": "measurement",
    "requiredAnchors": 2
  },
  {
    "type": "measure",
    "name": "Measure",
    "category": "measurement",
    "requiredAnchors": 2
  },
  {
    "type": "projection",
    "name": "Projection",
    "category": "forecasting",
    "requiredAnchors": 3
  },
  {
    "type": "text-annotation",
    "name": "Text",
    "category": "annotation",
    "requiredAnchors": 1
  },
  {
    "type": "text-box",
    "name": "Text Box",
    "category": "annotation",
    "requiredAnchors": 1
  },
  {
    "type": "brush",
    "name": "Brush",
    "category": "annotation",
    "requiredAnchors": 2
  },
  {
    "type": "highlighter",
    "name": "Highlighter",
    "category": "annotation",
    "requiredAnchors": 2
  },
  {
    "type": "arrow-mark-up",
    "name": "Arrow Mark Up",
    "category": "annotation",
    "requiredAnchors": 1
  },
  {
    "type": "arrow-mark-down",
    "name": "Arrow Mark Down",
    "category": "annotation",
    "requiredAnchors": 1
  },
  {
    "type": "ellipse",
    "name": "Ellipse",
    "category": "shape",
    "requiredAnchors": 2
  },
  {
    "type": "arc",
    "name": "Arc",
    "category": "shape",
    "requiredAnchors": 3
  },
  {
    "type": "rotated-rectangle",
    "name": "Rotated Rectangle",
    "category": "shape",
    "requiredAnchors": 3
  },
  {
    "type": "path",
    "name": "Path",
    "category": "shape",
    "requiredAnchors": 2
  },
  {
    "type": "polyline",
    "name": "Polyline",
    "category": "shape",
    "requiredAnchors": 2
  },
  {
    "type": "curve",
    "name": "Curve",
    "category": "shape",
    "requiredAnchors": 3
  },
  {
    "type": "double-curve",
    "name": "Double Curve",
    "category": "shape",
    "requiredAnchors": 2
  },
  {
    "type": "anchored-text",
    "name": "Anchored Text",
    "category": "annotation",
    "requiredAnchors": 2
  },
  {
    "type": "price-note",
    "name": "Price Note",
    "category": "annotation",
    "requiredAnchors": 2
  },
  {
    "type": "price-label",
    "name": "Price Label",
    "category": "annotation",
    "requiredAnchors": 1
  },
  {
    "type": "flag-mark",
    "name": "Flag Mark",
    "category": "annotation",
    "requiredAnchors": 1
  },
  {
    "type": "pin",
    "name": "Pin",
    "category": "annotation",
    "requiredAnchors": 1
  },
  {
    "type": "comment",
    "name": "Comment",
    "category": "annotation",
    "requiredAnchors": 1
  },
  {
    "type": "signpost",
    "name": "Signpost",
    "category": "annotation",
    "requiredAnchors": 1
  },
  {
    "type": "note",
    "name": "Note",
    "category": "annotation",
    "requiredAnchors": 1
  },
  {
    "type": "callout",
    "name": "Callout",
    "category": "annotation",
    "requiredAnchors": 2
  },
  {
    "type": "forecast",
    "name": "Forecast",
    "category": "forecasting",
    "requiredAnchors": 2
  },
  {
    "type": "bars-pattern",
    "name": "Bars Pattern",
    "category": "forecasting",
    "requiredAnchors": 3
  }
];
