import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import TradingChart from './TradingChart';
import type { TradingChartProps, TradingChartApi } from './types/chart';
import { applyChromeTheme } from './utils/themeManager';
import './index.css';

export interface VanillaChartOptions extends TradingChartProps {
  container: HTMLElement | string;
}

export interface VanillaChartInstance {
  api: TradingChartApi;
  destroy: () => void;
}

/**
 * Initializes and mounts the Trading Chart into any DOM element.
 * Works seamlessly in Vanilla JavaScript, HTML, Vue, Angular, Svelte, Electron, etc.
 */
export function createTradingChart(
  containerOrOptions: HTMLElement | string | VanillaChartOptions,
  optionalOptions?: TradingChartProps
): VanillaChartInstance {
  let targetContainer: HTMLElement | string;
  let chartProps: TradingChartProps;

  if (typeof containerOrOptions === 'string' || containerOrOptions instanceof HTMLElement) {
    targetContainer = containerOrOptions;
    chartProps = optionalOptions || {};
  } else {
    const { container, ...rest } = containerOrOptions;
    targetContainer = container;
    chartProps = rest;
  }

  const targetElement = typeof targetContainer === 'string'
    ? document.querySelector<HTMLElement>(targetContainer)
    : targetContainer;

  if (!targetElement) {
    throw new Error(`[TradingChart] Target container element "${targetContainer}" not found in DOM.`);
  }

  // Ensure element has dimensions and relative position
  if (targetElement.clientHeight === 0) {
    targetElement.style.height = targetElement.style.height || '600px';
  }
  if (!targetElement.style.position) {
    targetElement.style.position = 'relative';
  }

  let chartApi: TradingChartApi | null = null;
  const root: Root = createRoot(targetElement);

  const ChartWrapper = () => {
    return React.createElement(TradingChart, {
      ...chartProps,
      ref: (api: TradingChartApi | null) => {
        if (api) {
          chartApi = api;
        }
      }
    });
  };

  root.render(React.createElement(ChartWrapper));

  if (chartProps.theme) {
    applyChromeTheme(chartProps.theme);
  }

  return {
    get api() {
      if (!chartApi) {
        // Fallback proxy while mounting
        return {
          setSymbol: (s: string) => (window as any).__active_chart_instance__?.setSymbol?.({ ticker: s }),
          setPeriod: (p: any) => (window as any).__active_chart_instance__?.setPeriod?.(p),
          setTheme: (t: any) => applyChromeTheme(t),
          updateCandle: (c: any) => (window as any).__active_chart_instance__?.updateData?.(c),
          setCandleData: (d: any) => (window as any).__active_chart_instance__?.applyNewData?.(d),
          addIndicator: (n: any, isStack?: any, o?: any) => (window as any).__active_chart_instance__?.createIndicator?.(n, isStack, o),
          removeIndicator: (n: any) => (window as any).__active_chart_instance__?.removeIndicator?.({ name: n }),
          exportDrawings: () => (window as any).__active_chart_instance__?.getOverlays?.() || [],
          importDrawings: (d: any) => d.forEach((o: any) => (window as any).__active_chart_instance__?.createOverlay?.(o)),
          clearDrawings: () => (window as any).__active_chart_instance__?.removeOverlay?.(),
          takeScreenshot: async () => (window as any).__active_chart_instance__?.getConvertPictureUrl?.() || '',
          getCoreChart: () => (window as any).__active_chart_instance__
        } as TradingChartApi;
      }
      return chartApi;
    },
    destroy: () => {
      root.unmount();
    }
  };
}

// Global browser window attachment
if (typeof window !== 'undefined') {
  (window as any).TradingChart = {
    create: createTradingChart,
    createTradingChart
  };
  (window as any).createTradingChart = createTradingChart;
}
