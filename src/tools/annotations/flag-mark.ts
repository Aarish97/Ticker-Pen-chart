import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions, IDrawing } from '../../core/types';
import type { Geometry } from '../../core/geometry';
import { FlagMarkPaneView } from './flag-mark-pane-view';

function wrapTextTo40Chars(text: string): string {
  const lines = text.split('\n');
  const wrappedLines: string[] = [];
  
  for (const line of lines) {
    if (line.length <= 40) {
      wrappedLines.push(line);
    } else {
      let currentLine = line;
      while (currentLine.length > 40) {
        let wrapIndex = currentLine.lastIndexOf(' ', 40);
        if (wrapIndex === -1 || wrapIndex === 0) {
          wrapIndex = 40;
        }
        wrappedLines.push(currentLine.substring(0, wrapIndex).trim());
        currentLine = currentLine.substring(wrapIndex).trim();
      }
      if (currentLine.length > 0) {
        wrappedLines.push(currentLine);
      }
    }
  }
  return wrappedLines.join('\n');
}

/**
 * Flag mark color type
 */
export type FlagColor = 'red' | 'green' | 'blue' | 'yellow' | 'purple' | 'custom';

/**
 * Flag Mark options
 */
export interface FlagMarkOptions extends DrawingOptions {
  flagColor?: FlagColor;
  customColor?: string;
  label?: string;
  size?: number;
}

/**
 * Flag Mark - A flag marker placed on the chart.
 *
 * Features:
 * - Single anchor point
 * - Various preset colors
 * - Optional label
 * - Configurable size
 */
export class FlagMark extends Drawing {
  readonly type = 'flag-mark';

  protected static readonly REQUIRED_ANCHORS = 1;
  protected static readonly HIT_THRESHOLD = 15;

  private _flagOptions: FlagMarkOptions;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<FlagMarkOptions> = {}
  ) {
    const { flagColor, customColor, label, size, ...baseOptions } = options;
    super(id, anchors, style, baseOptions);

    this._flagOptions = {
      ...this._options,
      flagColor: flagColor ?? 'red',
      customColor: customColor ?? '#B72D37',
      label: wrapTextTo40Chars(label && label.trim() ? label : 'Add text'),
      size: size ?? 30,
    };
  }

  get flagOptions(): FlagMarkOptions {
    return this._flagOptions;
  }

  setFlagOptions(options: Partial<FlagMarkOptions>): void {
    this._flagOptions = { ...this._flagOptions, ...options };
    this.requestUpdate();
  }

  getFlagColor(): string {
    if ((this._options as any)?.color) return (this._options as any).color;
    if ((this._flagOptions as any)?.color) return (this._flagOptions as any).color;
    const colors: Record<FlagColor, string> = {
      red: '#ef5350',
      green: '#26a69a',
      blue: '#2196F3',
      yellow: '#FFEB3B',
      purple: '#9C27B0',
      custom: this._flagOptions.customColor ?? '#FF0000',
    };
    return colors[this._flagOptions.flagColor ?? 'red'] || '#ef5350';
  }

  setLabel(label: string): void {
    this._flagOptions.label = wrapTextTo40Chars(label && label.trim() ? label : 'Add text');
    this.requestUpdate();
  }

  getLabel(): string {
    return this._flagOptions.label && this._flagOptions.label.trim() ? this._flagOptions.label : 'Add text';
  }

  isValid(): boolean {
    return this._anchors.length >= FlagMark.REQUIRED_ANCHORS;
  }

  paneViews(): IPrimitivePaneView[] {
    return [new FlagMarkPaneView(this)];
  }

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const p = this.anchorToPixel(this._anchors[0], viewport);
    if (!p) return [];

    return [{
      type: 'polygon',
      points: [p],
      closed: false,
    }];
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const p = this.anchorToPixel(this._anchors[0], viewport);
    if (!p) return false;

    const size = this._flagOptions.size ?? 30;
    const poleHeight = size * 1.5;

    // 1. Check if hit is within the flag body / pole itself
    const hitFlag = (
      point.x >= p.x - 8 &&
      point.x <= p.x + size + 4 &&
      point.y >= p.y - poleHeight - 4 &&
      point.y <= p.y + 4
    );
    if (hitFlag) return true;

    // 2. Check if hit is within the tooltip box area above the flag ONLY when visible
    if (this.state === 'hovered' || this.state === 'selected' || this.state === 'editing') {
      const text = this._flagOptions.label ?? '';
      const lines = text.split('\n');
      const fontSize = 11;
      const maxLineLen = Math.max(...lines.map(line => line.length));
      const estimatedTextWidth = maxLineLen * (fontSize * 0.6);
      const panelWidth = Math.max(80, estimatedTextWidth + 28);
      const panelHeight = (fontSize * lines.length) + (lines.length - 1) * 4 + 16;
      const panelY = p.y - poleHeight - 8 - panelHeight;

      const hitTooltip = (
        point.x >= p.x - panelWidth / 2 &&
        point.x <= p.x + panelWidth / 2 &&
        point.y >= panelY &&
        point.y <= p.y - poleHeight
      );
      if (hitTooltip) return true;
    }

    return false;
  }

  clone(newId: string): IDrawing {
    return new FlagMark(
      newId,
      [...this._anchors],
      { ...this._style },
      { ...this._flagOptions }
    );
  }

  static create(
    id: string,
    position: Anchor,
    flagColor?: FlagColor,
    label?: string,
    style?: Partial<DrawingStyle>,
    options?: Partial<FlagMarkOptions>
  ): FlagMark {
    return new FlagMark(id, [position], style, { ...options, flagColor, label });
  }
}
