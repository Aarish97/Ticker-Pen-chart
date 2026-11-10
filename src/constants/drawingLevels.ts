export interface DrawingLevelItem { value: number; color?: string; enabled: boolean; lineStyle?: string; [key: string]: any; }

export const DEFAULT_FIB_RETRACEMENT_LEVELS: DrawingLevelItem[] = [
  { value: 0, color: '#787B86', enabled: true },
  { value: 0.236, color: '#F7525F', enabled: true },
  { value: 0.382, color: '#FF9800', enabled: true },
  { value: 0.5, color: '#4CAF50', enabled: true },
  { value: 0.618, color: '#00897B', enabled: true },
  { value: 0.786, color: '#00BCD4', enabled: true },
  { value: 1, color: '#787B86', enabled: true },
  { value: 1.618, color: '#2962FF', enabled: true },
  { value: 2.618, color: '#F7525F', enabled: true },
  { value: 3.618, color: '#9C27B0', enabled: true },
  { value: 1.272, color: '#FF9800', enabled: true },
  { value: 4.236, color: '#880E4F', enabled: false },
  { value: 1.414, color: '#B71C1C', enabled: false },
  { value: 2.272, color: '#A04000', enabled: false },
  { value: 2.414, color: '#2E7D32', enabled: false },
  { value: 2, color: '#00695C', enabled: false },
  { value: 3, color: '#00838F', enabled: false },
  { value: 3.272, color: '#424242', enabled: false },
  { value: 3.414, color: '#1565C0', enabled: false },
  { value: 4, color: '#C62828', enabled: false },
  { value: 4.272, color: '#6A1B9A', enabled: false },
  { value: 4.414, color: '#AD1457', enabled: false },
  { value: 4.618, color: '#D35400', enabled: false },
  { value: 4.764, color: '#004D40', enabled: false }
];

export const FIB_EXTENSION_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2, 2.618, 3.618, 4.236];

export const DEFAULT_FIB_TIME_ZONE_LEVELS: DrawingLevelItem[] = [
  { value: 0, color: '#787B86', enabled: true },
  { value: 1, color: '#2962FF', enabled: true },
  { value: 2, color: '#2962FF', enabled: true },
  { value: 3, color: '#2962FF', enabled: true },
  { value: 5, color: '#2962FF', enabled: true },
  { value: 8, color: '#2962FF', enabled: true },
  { value: 13, color: '#2962FF', enabled: true },
  { value: 21, color: '#2962FF', enabled: true },
  { value: 34, color: '#2962FF', enabled: true },
  { value: 55, color: '#2962FF', enabled: true },
  { value: 89, color: '#2962FF', enabled: true },
  { value: 144, color: '#2962FF', enabled: false },
  { value: 233, color: '#2962FF', enabled: false },
  { value: 377, color: '#2962FF', enabled: false },
  { value: 610, color: '#2962FF', enabled: false },
];

export const DEFAULT_FIB_TIME_EXTENSION_LEVELS: DrawingLevelItem[] = [
  { value: 0, color: '#787B86', enabled: true },
  { value: 0.382, color: '#F7525F', enabled: true },
  { value: 0.5, color: '#4CAF50', enabled: false },
  { value: 0.618, color: '#00BCD4', enabled: true },
  { value: 1, color: '#00897B', enabled: true },
  { value: 1.382, color: '#00BCD4', enabled: true },
  { value: 1.618, color: '#787B86', enabled: true },
  { value: 2, color: '#2962FF', enabled: true },
  { value: 2.382, color: '#E91E63', enabled: true },
  { value: 2.618, color: '#9C27B0', enabled: true },
  { value: 3, color: '#673AB7', enabled: true },
  { value: 3.618, color: '#787B86', enabled: false },
  { value: 4.236, color: '#2962FF', enabled: false },
];

export const DEFAULT_FIB_CHANNEL_LEVELS: DrawingLevelItem[] = [
  { value: 0, color: '#787B86', enabled: true },
  { value: 0.382, color: '#FF9800', enabled: true },
  { value: 0.618, color: '#00897B', enabled: true },
  { value: 1, color: '#787B86', enabled: true },
  { value: 2.618, color: '#EF5350', enabled: true },
  { value: 4.236, color: '#E91E63', enabled: true },
  { value: 1.414, color: '#B71C1C', enabled: false },
  { value: 2.414, color: '#388E3C', enabled: false },
  { value: 3, color: '#0097A7', enabled: false },
  { value: 3.414, color: '#2962FF', enabled: false },
  { value: 4.272, color: '#7B1FA2', enabled: false },
  { value: 4.618, color: '#AF601A', enabled: false },
  { value: 0.236, color: '#EF5350', enabled: true },
  { value: 0.5, color: '#4CAF50', enabled: true },
  { value: 0.786, color: '#00BCD4', enabled: true },
  { value: 1.618, color: '#2962FF', enabled: true },
  { value: 3.618, color: '#9C27B0', enabled: true },
  { value: 1.272, color: '#B9770E', enabled: false },
  { value: 2.272, color: '#B9770E', enabled: false },
  { value: 2, color: '#00796B', enabled: false },
  { value: 3.272, color: '#616161', enabled: false },
  { value: 4, color: '#C0392B', enabled: false },
  { value: 4.414, color: '#AD1457', enabled: false },
  { value: 4.764, color: '#00695C', enabled: false },
];

export const DEFAULT_FIB_CIRCLES_LEVELS: DrawingLevelItem[] = [
  { value: 0.236, color: '#F23645', enabled: true },
  { value: 0.382, color: '#FF9800', enabled: true },
  { value: 0.5, color: '#00897B', enabled: true },
  { value: 0.618, color: '#4CAF50', enabled: true },
  { value: 0.786, color: '#00BCD4', enabled: true },
  { value: 1, color: '#787B86', enabled: true },
  { value: 1.618, color: '#2962FF', enabled: true },
  { value: 2.618, color: '#E91E63', enabled: true },
  { value: 3.618, color: '#2962FF', enabled: true },
  { value: 4.236, color: '#E91E63', enabled: true },
  { value: 4.618, color: '#F23645', enabled: true },
];

export const DEFAULT_FIB_ARCS_LEVELS: DrawingLevelItem[] = [
  { value: 0.236, color: '#F23645', enabled: true },
  { value: 0.382, color: '#FF9800', enabled: true },
  { value: 0.5, color: '#00897B', enabled: true },
  { value: 0.618, color: '#4CAF50', enabled: true },
  { value: 0.786, color: '#00BCD4', enabled: true },
  { value: 1, color: '#787B86', enabled: true },
  { value: 1.618, color: '#2962FF', enabled: true },
  { value: 2.618, color: '#E91E63', enabled: true },
  { value: 3.618, color: '#2962FF', enabled: true },
  { value: 4.236, color: '#E91E63', enabled: true },
  { value: 4.618, color: '#F23645', enabled: true },
];

export const DEFAULT_FIB_WEDGE_LEVELS: DrawingLevelItem[] = [
  { value: 0.236, color: '#F23645', enabled: true },
  { value: 0.382, color: '#FF9800', enabled: true },
  { value: 0.5, color: '#4CAF50', enabled: true },
  { value: 0.618, color: '#00897B', enabled: true },
  { value: 0.786, color: '#00BCD4', enabled: true },
  { value: 1, color: '#787B86', enabled: true },
  { value: 1.618, color: '#2962FF', enabled: false },
  { value: 2.618, color: '#9C27B0', enabled: false },
  { value: 3.618, color: '#673AB7', enabled: false },
  { value: 4.236, color: '#880E4F', enabled: false },
  { value: 4.618, color: '#880E4F', enabled: false },
];

export const DEFAULT_PITCHFAN_LEVELS: DrawingLevelItem[] = [
  { value: 0.25, color: '#9C6D38', enabled: false },
  { value: 0.382, color: '#5B8A61', enabled: false },
  { value: 0.5, color: '#00BCD4', enabled: true },
  { value: 0.618, color: '#2E7D68', enabled: false },
  { value: 0.75, color: '#1B858B', enabled: false },
  { value: 1, color: '#2962FF', enabled: true },
  { value: 1.5, color: '#6A1B9A', enabled: false },
  { value: 1.75, color: '#AD1457', enabled: false },
  { value: 2, color: '#A05252', enabled: false },
];

export const DEFAULT_SPEED_FAN_PRICE_LEVELS: DrawingLevelItem[] = [
  { value: 0, color: '#787B86', enabled: true },
  { value: 0.25, color: '#FF9800', enabled: true },
  { value: 0.382, color: '#00BCD4', enabled: true },
  { value: 0.5, color: '#4CAF50', enabled: true },
  { value: 0.618, color: '#089981', enabled: true },
  { value: 0.75, color: '#2962FF', enabled: true },
  { value: 1, color: '#787B86', enabled: true },
];

export const DEFAULT_SPEED_FAN_TIME_LEVELS: DrawingLevelItem[] = [
  { value: 0, color: '#787B86', enabled: true },
  { value: 0.25, color: '#FF9800', enabled: true },
  { value: 0.382, color: '#00BCD4', enabled: true },
  { value: 0.5, color: '#4CAF50', enabled: true },
  { value: 0.618, color: '#089981', enabled: true },
  { value: 0.75, color: '#2962FF', enabled: true },
  { value: 1, color: '#787B86', enabled: true },
];

export const DEFAULT_PITCHFORK_LEVELS: DrawingLevelItem[] = [
  { value: 0.25, color: '#A66B15', enabled: false, style: 'solid' },
  { value: 0.382, color: '#43824E', enabled: false, style: 'solid' },
  { value: 0.5, color: '#089981', enabled: true, style: 'solid' },
  { value: 0.618, color: '#057261', enabled: false, style: 'solid' },
  { value: 0.75, color: '#00897B', enabled: false, style: 'solid' },
  { value: 1, color: '#2962FF', enabled: true, style: 'solid' },
  { value: 1.5, color: '#7B1FA2', enabled: false, style: 'solid' },
  { value: 1.75, color: '#AD1457', enabled: false, style: 'solid' },
  { value: 2, color: '#8D6E63', enabled: false, style: 'solid' },
];