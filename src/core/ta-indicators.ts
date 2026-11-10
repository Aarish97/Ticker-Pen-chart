import { registerIndicator } from 'tickerpen';

// ==========================================
// Math and Indicator Helper Functions
// ==========================================

function getEMA(data: number[], period: number): number[] {
  const ema: number[] = new Array(data.length).fill(NaN);
  if (data.length < period) return ema;

  // Initial SMA as the first EMA value
  let sum = 0;
  let count = 0;
  let firstIdx = -1;

  for (let i = 0; i < data.length; i++) {
    if (!isNaN(data[i])) {
      sum += data[i];
      count++;
      if (count === period) {
        firstIdx = i;
        ema[i] = sum / period;
        break;
      }
    }
  }

  if (firstIdx === -1) return ema;

  const k = 2 / (period + 1);
  for (let i = firstIdx + 1; i < data.length; i++) {
    if (isNaN(data[i])) {
      ema[i] = ema[i - 1];
    } else {
      ema[i] = data[i] * k + ema[i - 1] * (1 - k);
    }
  }

  return ema;
}

function getSMA(data: number[], period: number): number[] {
  const sma: number[] = new Array(data.length).fill(NaN);
  if (data.length < period) return sma;

  let sum = 0;
  let count = 0;

  for (let i = 0; i < data.length; i++) {
    const val = data[i];
    if (!isNaN(val)) {
      sum += val;
      count++;
    } else {
      sum = 0;
      count = 0;
      continue;
    }

    if (count >= period) {
      if (count > period) {
        const oldestVal = data[i - period];
        if (!isNaN(oldestVal)) {
          sum -= oldestVal;
        } else {
          sum = 0;
          for (let j = 0; j < period; j++) {
            sum += data[i - j];
          }
        }
      }
      sma[i] = sum / period;
    }
  }
  return sma;
}

function getRSI(prices: number[], period: number): number[] {
  const rsi: number[] = new Array(prices.length).fill(NaN);
  if (prices.length <= period) return rsi;

  let avgGain = 0;
  let avgLoss = 0;

  // First RSI value calculation (standard Wilder's smoothing)
  let count = 0;
  let lastPrice = NaN;
  let firstCalculationIdx = -1;

  for (let i = 0; i < prices.length; i++) {
    const price = prices[i];
    if (isNaN(price)) continue;

    if (isNaN(lastPrice)) {
      lastPrice = price;
      continue;
    }

    const change = price - lastPrice;
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }

    count++;
    lastPrice = price;

    if (count === period) {
      avgGain /= period;
      avgLoss /= period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
      firstCalculationIdx = i;
      break;
    }
  }

  if (firstCalculationIdx === -1) return rsi;

  // Subsequent values using Wilder's smoothing techniques
  lastPrice = prices[firstCalculationIdx];
  for (let i = firstCalculationIdx + 1; i < prices.length; i++) {
    const price = prices[i];
    if (isNaN(price)) {
      rsi[i] = rsi[i - 1];
      continue;
    }

    const change = price - lastPrice;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    lastPrice = price;
  }

  return rsi;
}

// ==========================================
// 17 TA-Lib Indicators Registration
// ==========================================

export function registerTALibIndicators() {
  // 1. Average True Range (ATR)
  registerIndicator({
    name: 'ATR',
    shortName: 'ATR',
    calcParams: [14],
    figures: [{ key: 'atr', title: 'ATR: ', type: 'line' }],
    calc: (dataList: any[], indicator: any) => {
      const [period] = indicator.calcParams;
      const trs: number[] = new Array(dataList.length).fill(0);
      
      for (let i = 0; i < dataList.length; i++) {
        const current = dataList[i];
        if (i === 0) {
          trs[i] = current.high - current.low;
        } else {
          const prev = dataList[i - 1];
          trs[i] = Math.max(
            current.high - current.low,
            Math.abs(current.high - prev.close),
            Math.abs(current.low - prev.close)
          );
        }
      }

      // Wilder's MA of TR
      const atrValues: number[] = new Array(dataList.length).fill(NaN);
      if (dataList.length < period) return atrValues.map(v => ({ atr: v }));

      let sumTR = 0;
      for (let i = 0; i < period; i++) {
        sumTR += trs[i];
      }
      atrValues[period - 1] = sumTR / period;

      for (let i = period; i < dataList.length; i++) {
        atrValues[i] = (atrValues[i - 1] * (period - 1) + trs[i]) / period;
      }

      return atrValues.map(v => ({ atr: isNaN(v) ? undefined : v }));
    }
  } as any);

  // 2. Weighted Moving Average (WMA)
  registerIndicator({
    name: 'WMA',
    shortName: 'WMA',
    calcParams: [9],
    series: 'price',
    figures: [{ key: 'wma', title: 'WMA: ', type: 'line' }],
    calc: (dataList: any[], indicator: any) => {
      const [period] = indicator.calcParams;
      const wmaList = new Array(dataList.length).fill(NaN);
      const denominator = (period * (period + 1)) / 2;

      for (let i = period - 1; i < dataList.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          const tickerPen = dataList[i - j];
          sum += tickerPen.close * (period - j);
        }
        wmaList[i] = sum / denominator;
      }

      return wmaList.map(v => ({ wma: isNaN(v) ? undefined : v }));
    }
  } as any);

  // 3. Double Exponential Moving Average (DEMA)
  registerIndicator({
    name: 'DEMA',
    shortName: 'DEMA',
    calcParams: [9],
    series: 'price',
    figures: [{ key: 'dema', title: 'DEMA: ', type: 'line' }],
    calc: (dataList: any[], indicator: any) => {
      const [period] = indicator.calcParams;
      const closes = dataList.map(k => k.close);
      const ema1 = getEMA(closes, period);
      const ema2 = getEMA(ema1.map(v => isNaN(v) ? 0 : v), period);

      const demaList = dataList.map((_, i) => {
        if (i < period * 2 - 2 || isNaN(ema1[i]) || isNaN(ema2[i])) return NaN;
        return 2 * ema1[i] - ema2[i];
      });

      return demaList.map(v => ({ dema: isNaN(v) ? undefined : v }));
    }
  } as any);

  // 4. Triple Exponential Moving Average (TEMA)
  registerIndicator({
    name: 'TEMA',
    shortName: 'TEMA',
    calcParams: [9],
    series: 'price',
    figures: [{ key: 'tema', title: 'TEMA: ', type: 'line' }],
    calc: (dataList: any[], indicator: any) => {
      const [period] = indicator.calcParams;
      const closes = dataList.map(k => k.close);
      const ema1 = getEMA(closes, period);
      const ema2 = getEMA(ema1.map(v => isNaN(v) ? 0 : v), period);
      const ema3 = getEMA(ema2.map(v => isNaN(v) ? 0 : v), period);

      const temaList = dataList.map((_, i) => {
        if (i < period * 3 - 3 || isNaN(ema1[i]) || isNaN(ema2[i]) || isNaN(ema3[i])) return NaN;
        return 3 * ema1[i] - 3 * ema2[i] + ema3[i];
      });

      return temaList.map(v => ({ tema: isNaN(v) ? undefined : v }));
    }
  } as any);

  // 5. Kaufman Adaptive Moving Average (KAMA)
  registerIndicator({
    name: 'KAMA',
    shortName: 'KAMA',
    calcParams: [10, 2, 30],
    series: 'price',
    figures: [{ key: 'kama', title: 'KAMA: ', type: 'line' }],
    calc: (dataList: any[], indicator: any) => {
      const [erPeriod, fastPeriod, slowPeriod] = indicator.calcParams;
      const kamaList = new Array(dataList.length).fill(NaN);
      if (dataList.length < erPeriod) return kamaList.map(v => ({ kama: v }));

      const fastSC = 2 / (fastPeriod + 1);
      const slowSC = 2 / (slowPeriod + 1);

      // Initialize KAMA
      kamaList[erPeriod - 1] = dataList[erPeriod - 1].close;

      for (let i = erPeriod; i < dataList.length; i++) {
        const change = Math.abs(dataList[i].close - dataList[i - erPeriod].close);
        
        let volatility = 0;
        for (let j = 0; j < erPeriod; j++) {
          volatility += Math.abs(dataList[i - j].close - dataList[i - j - 1].close);
        }

        const er = volatility === 0 ? 0 : change / volatility;
        const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
        
        kamaList[i] = kamaList[i - 1] + sc * (dataList[i].close - kamaList[i - 1]);
      }

      return kamaList.map(v => ({ kama: isNaN(v) ? undefined : v }));
    }
  } as any);

  // 6. Money Flow Index (MFI)
  registerIndicator({
    name: 'MFI',
    shortName: 'MFI',
    calcParams: [14],
    figures: [{ key: 'mfi', title: 'MFI: ', type: 'line' }],
    calc: (dataList: any[], indicator: any) => {
      const [period] = indicator.calcParams;
      const mfiList = new Array(dataList.length).fill(NaN);
      if (dataList.length < period) return mfiList.map(v => ({ mfi: v }));

      const typicalPrices = dataList.map(k => (k.high + k.low + k.close) / 3);
      const rawMoneyFlows = dataList.map((k, i) => typicalPrices[i] * k.volume);

      for (let i = period; i < dataList.length; i++) {
        let posFlow = 0;
        let negFlow = 0;

        for (let j = 0; j < period; j++) {
          const currentIdx = i - j;
          const prevIdx = currentIdx - 1;
          
          if (typicalPrices[currentIdx] > typicalPrices[prevIdx]) {
            posFlow += rawMoneyFlows[currentIdx];
          } else if (typicalPrices[currentIdx] < typicalPrices[prevIdx]) {
            negFlow += rawMoneyFlows[currentIdx];
          }
        }

        if (negFlow === 0) {
          mfiList[i] = 100;
        } else {
          const moneyRatio = posFlow / negFlow;
          mfiList[i] = 100 - 100 / (1 + moneyRatio);
        }
      }

      return mfiList.map(v => ({ mfi: isNaN(v) ? undefined : v }));
    }
  } as any);

  // 7. Volume Weighted Average Price (VWAP)
  registerIndicator({
    name: 'VWAP',
    shortName: 'VWAP',
    calcParams: [],
    series: 'price',
    figures: [{ key: 'vwap', title: 'VWAP: ', type: 'line' }],
    calc: (dataList: any[]) => {
      const vwapList = new Array(dataList.length).fill(NaN);
      if (dataList.length === 0) return [];

      let sumVolumeTypicalPrice = 0;
      let sumVolume = 0;
      let prevDay = -1;

      for (let i = 0; i < dataList.length; i++) {
        const tickerPen = dataList[i];
        const date = new Date(tickerPen.timestamp);
        const currentDay = date.getDate();

        // Reset VWAP daily
        if (currentDay !== prevDay) {
          sumVolumeTypicalPrice = 0;
          sumVolume = 0;
          prevDay = currentDay;
        }

        const typicalPrice = (tickerPen.high + tickerPen.low + tickerPen.close) / 3;
        sumVolumeTypicalPrice += typicalPrice * tickerPen.volume;
        sumVolume += tickerPen.volume;

        if (sumVolume > 0) {
          vwapList[i] = sumVolumeTypicalPrice / sumVolume;
        } else {
          vwapList[i] = tickerPen.close;
        }
      }

      return vwapList.map(v => ({ vwap: isNaN(v) ? undefined : v }));
    }
  } as any);

  // 8. Stochastic Oscillator (STOCH)
  registerIndicator({
    name: 'STOCH',
    shortName: 'STOCH',
    calcParams: [14, 3, 3], // %K period, %K slowing, %D period
    figures: [
      { key: 'stochK', title: '%K: ', type: 'line' },
      { key: 'stochD', title: '%D: ', type: 'line' }
    ],
    calc: (dataList: any[], indicator: any) => {
      const [kPeriod, slowPeriod, dPeriod] = indicator.calcParams;
      const fastK = new Array(dataList.length).fill(NaN);
      
      for (let i = kPeriod - 1; i < dataList.length; i++) {
        let lowestLow = Infinity;
        let highestHigh = -Infinity;

        for (let j = 0; j < kPeriod; j++) {
          const tickerPen = dataList[i - j];
          if (tickerPen.low < lowestLow) lowestLow = tickerPen.low;
          if (tickerPen.high > highestHigh) highestHigh = tickerPen.high;
        }

        const denominator = highestHigh - lowestLow;
        fastK[i] = denominator === 0 ? 50 : ((dataList[i].close - lowestLow) / denominator) * 100;
      }

      const slowK = getSMA(fastK, slowPeriod);
      const slowD = getSMA(slowK, dPeriod);

      return dataList.map((_, i) => ({
        stochK: isNaN(slowK[i]) ? undefined : slowK[i],
        stochD: isNaN(slowD[i]) ? undefined : slowD[i]
      }));
    }
  } as any);

  // 9. Stochastic RSI (STOCHRSI)
  registerIndicator({
    name: 'STOCHRSI',
    shortName: 'StochRSI',
    calcParams: [14, 14, 3, 3], // RSI period, Stochastic period, %K slowing, %D period
    figures: [
      { key: 'stochRsiK', title: '%K: ', type: 'line' },
      { key: 'stochRsiD', title: '%D: ', type: 'line' }
    ],
    calc: (dataList: any[], indicator: any) => {
      const [rsiPeriod, kPeriod, slowPeriod, dPeriod] = indicator.calcParams;
      const closes = dataList.map(k => k.close);
      const rsiList = getRSI(closes, rsiPeriod);
      const fastK = new Array(dataList.length).fill(NaN);

      const offset = rsiPeriod + kPeriod - 1;
      for (let i = offset; i < dataList.length; i++) {
        let lowestRSI = Infinity;
        let highestRSI = -Infinity;

        for (let j = 0; j < kPeriod; j++) {
          const r = rsiList[i - j];
          if (r < lowestRSI) lowestRSI = r;
          if (r > highestRSI) highestRSI = r;
        }

        const denominator = highestRSI - lowestRSI;
        fastK[i] = denominator === 0 ? 50 : ((rsiList[i] - lowestRSI) / denominator) * 100;
      }

      const slowK = getSMA(fastK, slowPeriod);
      const slowD = getSMA(slowK, dPeriod);

      return dataList.map((_, i) => ({
        stochRsiK: isNaN(slowK[i]) ? undefined : slowK[i],
        stochRsiD: isNaN(slowD[i]) ? undefined : slowD[i]
      }));
    }
  } as any);

  // 10. Aroon (AROON)
  registerIndicator({
    name: 'AROON',
    shortName: 'AROON',
    calcParams: [25],
    figures: [
      { key: 'aroonUp', title: 'Up: ', type: 'line' },
      { key: 'aroonDown', title: 'Down: ', type: 'line' }
    ],
    calc: (dataList: any[], indicator: any) => {
      const [period] = indicator.calcParams;
      const result = new Array(dataList.length).fill(null).map(() => ({ aroonUp: undefined as number | undefined, aroonDown: undefined as number | undefined }));

      for (let i = period; i < dataList.length; i++) {
        let highestHighIdx = -1;
        let highestHigh = -Infinity;
        let lowestLowIdx = -1;
        let lowestLow = Infinity;

        for (let j = 0; j <= period; j++) {
          const idx = i - j;
          const tickerPen = dataList[idx];
          if (tickerPen.high > highestHigh) {
            highestHigh = tickerPen.high;
            highestHighIdx = idx;
          }
          if (tickerPen.low < lowestLow) {
            lowestLow = tickerPen.low;
            lowestLowIdx = idx;
          }
        }

        const daysSinceHigh = i - highestHighIdx;
        const daysSinceLow = i - lowestLowIdx;

        result[i] = {
          aroonUp: ((period - daysSinceHigh) / period) * 100,
          aroonDown: ((period - daysSinceLow) / period) * 100
        };
      }

      return result;
    }
  } as any);

  // 11. Aroon Oscillator (AROONOSC)
  registerIndicator({
    name: 'AROONOSC',
    shortName: 'AroonOsc',
    calcParams: [25],
    figures: [{ key: 'aroonOsc', title: 'AroonOsc: ', type: 'line' }],
    calc: (dataList: any[], indicator: any) => {
      const [period] = indicator.calcParams;
      const aroonOscList = new Array(dataList.length).fill(NaN);

      for (let i = period; i < dataList.length; i++) {
        let highestHighIdx = -1;
        let highestHigh = -Infinity;
        let lowestLowIdx = -1;
        let lowestLow = Infinity;

        for (let j = 0; j <= period; j++) {
          const idx = i - j;
          const tickerPen = dataList[idx];
          if (tickerPen.high > highestHigh) {
            highestHigh = tickerPen.high;
            highestHighIdx = idx;
          }
          if (tickerPen.low < lowestLow) {
            lowestLow = tickerPen.low;
            lowestLowIdx = idx;
          }
        }

        const daysSinceHigh = i - highestHighIdx;
        const daysSinceLow = i - lowestLowIdx;

        const up = ((period - daysSinceHigh) / period) * 100;
        const down = ((period - daysSinceLow) / period) * 100;

        aroonOscList[i] = up - down;
      }

      return aroonOscList.map(v => ({ aroonOsc: isNaN(v) ? undefined : v }));
    }
  } as any);

  // 12. Chaikin Momentum Oscillator (CMO)
  registerIndicator({
    name: 'CMO',
    shortName: 'CMO',
    calcParams: [14],
    figures: [{ key: 'cmo', title: 'CMO: ', type: 'line' }],
    calc: (dataList: any[], indicator: any) => {
      const [period] = indicator.calcParams;
      const cmoList = new Array(dataList.length).fill(NaN);
      if (dataList.length <= period) return cmoList.map(v => ({ cmo: v }));

      for (let i = period; i < dataList.length; i++) {
        let sumGain = 0;
        let sumLoss = 0;

        for (let j = 0; j < period; j++) {
          const current = dataList[i - j];
          const prev = dataList[i - j - 1];
          const diff = current.close - prev.close;

          if (diff > 0) {
            sumGain += diff;
          } else {
            sumLoss += Math.abs(diff);
          }
        }

        const denominator = sumGain + sumLoss;
        cmoList[i] = denominator === 0 ? 0 : ((sumGain - sumLoss) / denominator) * 100;
      }

      return cmoList.map(v => ({ cmo: isNaN(v) ? undefined : v }));
    }
  } as any);

  // 13. Balance of Power (BOP)
  registerIndicator({
    name: 'BOP',
    shortName: 'BOP',
    calcParams: [],
    figures: [{ key: 'bop', title: 'BOP: ', type: 'line' }],
    calc: (dataList: any[]) => {
      return dataList.map(tickerPen => {
        const range = tickerPen.high - tickerPen.low;
        const val = range === 0 ? 0 : (tickerPen.close - tickerPen.open) / range;
        return { bop: val };
      });
    }
  } as any);

  // 14. Accumulation/Distribution Line (AD)
  registerIndicator({
    name: 'AD',
    shortName: 'A/D',
    calcParams: [],
    figures: [{ key: 'ad', title: 'A/D: ', type: 'line' }],
    calc: (dataList: any[]) => {
      let adCumulative = 0;
      return dataList.map(tickerPen => {
        const range = tickerPen.high - tickerPen.low;
        const multiplier = range === 0 ? 0 : ((tickerPen.close - tickerPen.low) - (tickerPen.high - tickerPen.close)) / range;
        const moneyFlowVolume = multiplier * tickerPen.volume;
        adCumulative += moneyFlowVolume;
        return { ad: adCumulative };
      });
    }
  } as any);

  // 15. Chaikin Oscillator (ADOSC)
  registerIndicator({
    name: 'ADOSC',
    shortName: 'ADOSC',
    calcParams: [3, 10],
    figures: [{ key: 'adosc', title: 'ADOSC: ', type: 'line' }],
    calc: (dataList: any[], indicator: any) => {
      const [fastPeriod, slowPeriod] = indicator.calcParams;
      const adList: number[] = [];
      let adCumulative = 0;

      for (let i = 0; i < dataList.length; i++) {
        const tickerPen = dataList[i];
        const range = tickerPen.high - tickerPen.low;
        const multiplier = range === 0 ? 0 : ((tickerPen.close - tickerPen.low) - (tickerPen.high - tickerPen.close)) / range;
        const moneyFlowVolume = multiplier * tickerPen.volume;
        adCumulative += moneyFlowVolume;
        adList.push(adCumulative);
      }

      const adEmaFast = getEMA(adList, fastPeriod);
      const adEmaSlow = getEMA(adList, slowPeriod);

      const adoscList = dataList.map((_, i) => {
        if (i < slowPeriod - 1 || isNaN(adEmaFast[i]) || isNaN(adEmaSlow[i])) return NaN;
        return adEmaFast[i] - adEmaSlow[i];
      });

      return adoscList.map(v => ({ adosc: isNaN(v) ? undefined : v }));
    }
  } as any);

  // 16. Normalized Average True Range (NATR)
  registerIndicator({
    name: 'NATR',
    shortName: 'NATR',
    calcParams: [14],
    figures: [{ key: 'natr', title: 'NATR: ', type: 'line' }],
    calc: (dataList: any[], indicator: any) => {
      const [period] = indicator.calcParams;
      const trs: number[] = new Array(dataList.length).fill(0);
      
      for (let i = 0; i < dataList.length; i++) {
        const current = dataList[i];
        if (i === 0) {
          trs[i] = current.high - current.low;
        } else {
          const prev = dataList[i - 1];
          trs[i] = Math.max(
            current.high - current.low,
            Math.abs(current.high - prev.close),
            Math.abs(current.low - prev.close)
          );
        }
      }

      const atrValues: number[] = new Array(dataList.length).fill(NaN);
      if (dataList.length < period) return atrValues.map(v => ({ natr: v }));

      let sumTR = 0;
      for (let i = 0; i < period; i++) {
        sumTR += trs[i];
      }
      atrValues[period - 1] = sumTR / period;

      for (let i = period; i < dataList.length; i++) {
        atrValues[i] = (atrValues[i - 1] * (period - 1) + trs[i]) / period;
      }

      const natrList = dataList.map((tickerPen, i) => {
        if (isNaN(atrValues[i]) || tickerPen.close === 0) return NaN;
        return (atrValues[i] / tickerPen.close) * 100;
      });

      return natrList.map(v => ({ natr: isNaN(v) ? undefined : v }));
    }
  } as any);

  // 17. Standard Deviation (STDDEV)
  registerIndicator({
    name: 'STDDEV',
    shortName: 'StdDev',
    calcParams: [20],
    figures: [{ key: 'stdDev', title: 'StdDev: ', type: 'line' }],
    calc: (dataList: any[], indicator: any) => {
      const [period] = indicator.calcParams;
      const stdDevList = new Array(dataList.length).fill(NaN);
      if (dataList.length < period) return stdDevList.map(v => ({ stdDev: v }));

      const closes = dataList.map(k => k.close);
      const smaList = getSMA(closes, period);

      for (let i = period - 1; i < dataList.length; i++) {
        const mean = smaList[i];
        if (isNaN(mean)) continue;

        let varianceSum = 0;
        for (let j = 0; j < period; j++) {
          const diff = dataList[i - j].close - mean;
          varianceSum += diff * diff;
        }

        stdDevList[i] = Math.sqrt(varianceSum / period);
      }

      return stdDevList.map(v => ({ stdDev: isNaN(v) ? undefined : v }));
    }
  } as any);

  // 18. Simple Moving Average (SMA)
  registerIndicator({
    name: 'SMA',
    shortName: 'SMA',
    calcParams: [5, 10, 30, 60],
    series: 'price',
    figures: [
      { key: 'sma1', title: 'SMA5: ', type: 'line', styles: () => ({ color: '#1677FF' }) },
      { key: 'sma2', title: 'SMA10: ', type: 'line', styles: () => ({ color: '#24FF6A' }) },
      { key: 'sma3', title: 'SMA30: ', type: 'line', styles: () => ({ color: '#FF9600' }) },
      { key: 'sma4', title: 'SMA60: ', type: 'line', styles: () => ({ color: '#9D24FF' }) }
    ],
    regenerateFigures: (calcParams: any[]) => {
      const colors = ['#1677FF', '#24FF6A', '#FF9600', '#9D24FF'];
      return calcParams.map((p, i) => ({
        key: `sma${i + 1}`,
        title: `SMA${p}: `,
        type: 'line',
        styles: () => ({ color: colors[i % colors.length] })
      }));
    },
    calc: (dataList: any[], indicator: any) => {
      const closes = dataList.map(k => k.close);
      const params = indicator.calcParams || [];
      const result = dataList.map(() => ({}));
      
      params.forEach((period: number, idx: number) => {
        const smaValues = getSMA(closes, period);
        smaValues.forEach((val, i) => {
          if (!isNaN(val)) {
            (result[i] as any)[`sma${idx + 1}`] = val;
          }
        });
      });
      return result;
    }
  } as any);

  // 19. Parabolic SAR (SAR)
  registerIndicator({
    name: 'SAR',
    shortName: 'SAR',
    calcParams: [2, 2, 20],
    series: 'price',
    shouldOhlc: true,
    figures: [
      {
        key: 'sar',
        title: 'SAR: ',
        type: 'circle',
        styles: (data: any, indicator: any, defaultStyles: any) => {
          const current = data.current;
          const sar = current.indicatorData?.sar ?? Number.MIN_SAFE_INTEGER;
          const tickerPenData = current.tickerPenData;
          if (!tickerPenData) return { color: 'rgba(0, 0, 0, 0)' };
          const halfHL = (tickerPenData.high + tickerPenData.low) / 2;
          const color = sar < halfHL
            ? (indicator.styles?.circles?.[0]?.upColor || defaultStyles.circles[0].upColor)
            : (indicator.styles?.circles?.[0]?.downColor || defaultStyles.circles[0].downColor);
          return { color };
        }
      }
    ],
    calc: (dataList: any[], indicator: any) => {
      const params = indicator.calcParams;
      const startAf = params[0] > 0.5 ? params[0] / 100 : params[0];
      const step = params[1] > 0.5 ? params[1] / 100 : params[1];
      const maxAf = params[2] > 0.5 ? params[2] / 100 : params[2];

      const result = new Array(dataList.length).fill(null).map(() => ({ sar: undefined as number | undefined }));
      if (dataList.length < 2) return result;

      let isIncreasing = dataList[1].close > dataList[0].close;
      let sar = isIncreasing ? dataList[0].low : dataList[0].high;
      let ep = isIncreasing ? dataList[0].high : dataList[0].low;
      let af = startAf;

      result[0] = { sar };

      for (let i = 1; i < dataList.length; i++) {
        const current = dataList[i];
        const prev = dataList[i - 1];
        const prev2 = i > 1 ? dataList[i - 2] : prev;

        const prevSar = sar;
        sar = prevSar + af * (ep - prevSar);

        if (isIncreasing) {
          sar = Math.min(sar, prev.low, prev2.low);
          if (current.high > ep) {
            ep = current.high;
            af = Math.min(af + step, maxAf);
          }
          if (current.low < sar) {
            isIncreasing = false;
            sar = ep;
            ep = current.low;
            af = startAf;
          }
        } else {
          sar = Math.max(sar, prev.high, prev2.high);
          if (current.low < ep) {
            ep = current.low;
            af = Math.min(af + step, maxAf);
          }
          if (current.high > sar) {
            isIncreasing = true;
            sar = ep;
            ep = current.high;
            af = startAf;
          }
        }
        result[i] = { sar: isNaN(sar) ? undefined : sar };
      }
      return result;
    }
  } as any);
}
