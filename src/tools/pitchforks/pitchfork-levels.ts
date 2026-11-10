export interface PitchforkLevelItem {
  value: number;
  color: string;
  enabled: boolean;
  style?: 'solid' | 'dashed' | 'dotted';
}

export const DEFAULT_PITCHFORK_LEVELS: PitchforkLevelItem[] = [
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
