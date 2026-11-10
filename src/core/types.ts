import type {
  IChartApi,
  ISeriesApi,
  SeriesType,
  Time,
  Coordinate,
  Logical,
  IPrimitivePaneView,
} from 'lightweight-charts';

/**
 * Anchor point in chart coordinates (time/price)
 */
export interface Anchor {
  time: Time;
  price: number;
}

/**
 * Point in pixel coordinates
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Visual style for drawings
 */
export interface DrawingStyle {
  lineColor: string;
  lineWidth: number;
  lineDash?: number[];
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  showLabels?: boolean;
  labelFont?: string;
  labelColor?: string;
}

/**
 * Default drawing style
 */
export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  lineColor: '#2962FF',
  lineWidth: 2,
  lineDash: [],
  fillColor: 'rgba(41, 98, 255, 0.1)',
  fillOpacity: 0.1,
  showLabels: true,
  labelFont: '12px sans-serif',
  labelColor: '#2962FF',
};

/**
 * Drawing options beyond style
 */
export interface DrawingOptions {
  visible?: boolean;
  locked?: boolean;
  zIndex?: number;
  extendLeft?: boolean;
  extendRight?: boolean;
}

/**
 * Drawing state for selection/editing
 */
export type DrawingState = 'normal' | 'hovered' | 'selected' | 'editing';

/**
 * Serialized drawing data for persistence
 */
export interface SerializedDrawing {
  id: string;
  type: string;
  anchors: Anchor[];
  style: DrawingStyle;
  options: DrawingOptions;
}

/**
 * Viewport information for rendering
 */
export interface Viewport {
  width: number;
  height: number;
  timeScale: {
    coordinateToTime(x: number): Time | null;
    timeToCoordinate(time: Time): Coordinate | null;
    logicalToCoordinate(logical: Logical): Coordinate | null;
  };
  priceScale: {
    coordinateToPrice(y: number): number | null;
    priceToCoordinate(price: number): Coordinate | null;
  };
}

/**
 * Drawing tool metadata for registration
 */
export interface DrawingToolDefinition {
  type: string;
  name: string;
  category: DrawingCategory;
  icon?: string;
  shortcut?: string;
  requiredAnchors: number;
  defaultStyle?: Partial<DrawingStyle>;
  defaultOptions?: Partial<DrawingOptions>;
}

/**
 * Drawing categories for organization
 */
export type DrawingCategory =
  | 'line'
  | 'channel'
  | 'fibonacci'
  | 'gann'
  | 'pitchfork'
  | 'shape'
  | 'annotation'
  | 'trading'
  | 'forecasting'
  | 'measurement';
/**
 * Base drawing interface
 */
export interface IDrawing {
  readonly id: string;
  readonly type: string;
  anchors: Anchor[];
  style: DrawingStyle;
  options: DrawingOptions;
  state: DrawingState;

  // Lifecycle
  attach(series: ISeriesApi<SeriesType>, chart: IChartApi, container?: HTMLElement): void;
  detach(): void;
  isAttached(): boolean;

  // State
  isValid(): boolean;
  setAnchors(anchors: Anchor[]): void;
  updateAnchor(index: number, anchor: Anchor): void;
  updateStyle(style: Partial<DrawingStyle>): void;
  updateOptions(options: Partial<DrawingOptions>): void;
  setState(state: DrawingState): void;

  // Hit testing
  testHit(point: Point, viewport: Viewport): boolean;
  hitTestAnchor(point: Point, viewport: Viewport): number | null;
  getControlPoints(viewport: Viewport): (Point | ControlPoint)[];

  // Serialization
  toJSON(): SerializedDrawing;
  fromJSON(data: SerializedDrawing): void;

  // Clone
  clone(newId: string): IDrawing;

  // Viewport
  getViewport(): Viewport | null;

  // Request update
  requestUpdate(): void;

  // Pane views for rendering
  paneViews(): IPrimitivePaneView[];
}

/**
 * Control point for anchor manipulation
 */
export interface ControlPoint extends Point {
  index: number;
  radius: number;
  shape?: 'circle' | 'rect';
}

