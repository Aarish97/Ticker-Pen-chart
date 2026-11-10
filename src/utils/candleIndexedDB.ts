/**
 * IndexedDB-backed Storage for Candle & History Cache
 * Completely offloads deep candle history from RAM to browser IndexedDB storage.
 */

export interface StoredCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  turnover?: number;
}

const DB_NAME = 'TickerPen_CandleStorage_v3';
const STORE_NAME = 'candle_history';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.warn('Failed to open IndexedDB candle store:', request.error);
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Save and merge candles into IndexedDB storage for a given symbol & period.
 */
export async function saveCandlesToIndexedDB(
  cacheKey: string,
  newCandles: StoredCandle[]
): Promise<void> {
  try {
    if (!newCandles || newCandles.length === 0) return;
    const db = await getDB();

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(cacheKey);

      getReq.onsuccess = () => {
        const existingRecord = getReq.result;
        let mergedBars: StoredCandle[] = [];

        if (existingRecord && Array.isArray(existingRecord.bars) && existingRecord.bars.length > 0) {
          const oldBars = existingRecord.bars as StoredCandle[];
          const oldMin = oldBars[0].timestamp;
          const oldMax = oldBars[oldBars.length - 1].timestamp;
          const newMin = newCandles[0].timestamp;
          const newMax = newCandles[newCandles.length - 1].timestamp;

          // Only merge if datasets overlap or are close (avoid giant multi-month gaps)
          const isContiguous = (newMin <= oldMax + 86400000 && newMax >= oldMin - 86400000);
          if (isContiguous) {
            const map = new Map<number, StoredCandle>();
            for (const b of oldBars) {
              map.set(b.timestamp, b);
            }
            for (const b of newCandles) {
              map.set(b.timestamp, b);
            }
            mergedBars = [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
          } else {
            mergedBars = [...newCandles].sort((a, b) => a.timestamp - b.timestamp);
          }
        } else {
          mergedBars = [...newCandles].sort((a, b) => a.timestamp - b.timestamp);
        }

        const putReq = store.put({
          cacheKey,
          bars: mergedBars,
          updatedAt: Date.now()
        });

        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('IndexedDB write error:', err);
  }
}

/**
 * Retrieve candles from IndexedDB storage.
 * @param cacheKey symbol_period key (e.g. BTCUSDT_15m)
 * @param toTimestamp optional upper boundary timestamp (for past candles)
 * @param limit number of candles to return (default: 500)
 */
export async function getCandlesFromIndexedDB(
  cacheKey: string,
  toTimestamp?: number,
  limit: number = 500
): Promise<StoredCandle[] | null> {
  try {
    const db = await getDB();

    return new Promise<StoredCandle[] | null>((resolve) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);

      req.onsuccess = () => {
        const record = req.result;
        if (!record || !Array.isArray(record.bars) || record.bars.length === 0) {
          return resolve(null);
        }

        const allBars: StoredCandle[] = record.bars;
        if (Number.isFinite(toTimestamp) && toTimestamp! > 0) {
          const filtered = allBars.filter(b => b.timestamp < toTimestamp!);
          if (filtered.length > 0) {
            return resolve(filtered.slice(-limit));
          }
          return resolve(null);
        }

        return resolve(allBars.slice(-limit));
      };

      req.onerror = () => {
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('IndexedDB read error:', err);
    return null;
  }
}

/**
 * Clear all candles from IndexedDB.
 */
export async function clearCandleIndexedDB(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction([STORE_NAME], 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch (err) {
    console.warn('IndexedDB clear error:', err);
  }
}
