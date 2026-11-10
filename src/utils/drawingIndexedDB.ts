/**
 * IndexedDB-backed Storage for Drawing Overlays
 * Persists user-placed drawings (trend lines, fib, rectangles, etc.) per symbol.
 * Uses timestamps as the canonical X-coordinate so drawings survive data reloads.
 */

export interface SerializedOverlayPoint {
  dataIndex?: number;
  timestamp: number;
  value: number;
}

export interface SerializedDrawingOverlay {
  id: string;
  name: string;
  points: SerializedOverlayPoint[];
  styles?: any;
  extendData?: any;
  lock?: boolean;
  visible?: boolean;
  mode?: string;
}

const DB_NAME = 'TickerPen_DrawingStorage_v1';
const STORE_NAME = 'drawing_overlays';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'symbolKey' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('Failed to open IndexedDB drawing store:', request.error);
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Serialize overlay points from a live chart overlay, ensuring timestamps are captured.
 */
function serializeOverlay(overlay: any, dataList: any[] = []): SerializedDrawingOverlay | null {
  if (!overlay || !overlay.id || !overlay.name) return null;
  // Skip internal / temporary overlays
  if (overlay.name === 'future-time-scale' || overlay.name === 'zoomInBox' || overlay.name === 'zoom-in-box') return null;

  const barInterval = dataList.length >= 2
    ? (Number(dataList[dataList.length - 1].timestamp) - Number(dataList[0].timestamp)) / (dataList.length - 1)
    : 60000;

  const points: SerializedOverlayPoint[] = (overlay.points || []).map((p: any) => {
    let ts = typeof p.timestamp === 'number' && p.timestamp > 0 ? p.timestamp : 0;
    const dIdx = typeof p.dataIndex === 'number' ? p.dataIndex : undefined;
    const val = typeof p.value === 'number' ? p.value : 0;

    // If timestamp is not set on point, resolve from dataList using dataIndex
    if (ts <= 0 && dIdx !== undefined && dataList && dataList.length > 0) {
      if (dIdx >= 0 && dIdx < dataList.length) {
        ts = Number(dataList[dIdx]?.timestamp || 0);
      } else if (dIdx < 0) {
        ts = Number(dataList[0]?.timestamp || 0) - Math.abs(dIdx) * barInterval;
      } else {
        ts = Number(dataList[dataList.length - 1]?.timestamp || 0) + (dIdx - dataList.length + 1) * barInterval;
      }
    }

    return {
      dataIndex: dIdx,
      timestamp: ts,
      value: val,
    };
  });

  // Keep drawing as long as it has at least one point
  if (points.length === 0) return null;

  return {
    id: overlay.id,
    name: overlay.name,
    points,
    styles: overlay.styles ? JSON.parse(JSON.stringify(overlay.styles)) : undefined,
    extendData: overlay.extendData ? JSON.parse(JSON.stringify(overlay.extendData)) : undefined,
    lock: !!overlay.lock,
    visible: overlay.visible !== false,
    mode: overlay.mode || 'normal',
  };
}

/**
 * Save all drawing overlays for a symbol to IndexedDB (with LocalStorage backup).
 */
export async function saveDrawingsToIndexedDB(
  symbolKey: string,
  overlays: any[],
  dataList: any[] = []
): Promise<void> {
  if (!symbolKey) return;
  try {
    const drawings: SerializedDrawingOverlay[] = [];
    for (const o of overlays) {
      const serialized = serializeOverlay(o, dataList);
      if (serialized) drawings.push(serialized);
    }

    // Backup to LocalStorage for instant access
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const lsKey = `drawings_backup_${symbolKey}`;
        if (drawings.length === 0) {
          localStorage.removeItem(lsKey);
        } else {
          localStorage.setItem(lsKey, JSON.stringify(drawings));
        }
      }
    } catch {}

    const db = await getDB();

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      if (drawings.length === 0) {
        // No drawings — remove the record entirely
        const delReq = store.delete(symbolKey);
        delReq.onsuccess = () => resolve();
        delReq.onerror = () => reject(delReq.error);
      } else {
        const putReq = store.put({
          symbolKey,
          drawings,
          updatedAt: Date.now(),
        });
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      }
    });
  } catch (err) {
    console.warn('IndexedDB drawing write error:', err);
  }
}

/**
 * Load saved drawings for a symbol from IndexedDB (with LocalStorage fallback).
 */
export async function getDrawingsFromIndexedDB(
  symbolKey: string
): Promise<SerializedDrawingOverlay[] | null> {
  if (!symbolKey) return null;
  try {
    const db = await getDB();

    const idbResult = await new Promise<SerializedDrawingOverlay[] | null>((resolve) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(symbolKey);

      req.onsuccess = () => {
        const record = req.result;
        if (!record || !Array.isArray(record.drawings) || record.drawings.length === 0) {
          return resolve(null);
        }
        resolve(record.drawings);
      };

      req.onerror = () => resolve(null);
    });

    if (idbResult && idbResult.length > 0) return idbResult;

    // Fallback to LocalStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      const lsRaw = localStorage.getItem(`drawings_backup_${symbolKey}`);
      if (lsRaw) {
        const parsed = JSON.parse(lsRaw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }

    return null;
  } catch (err) {
    console.warn('IndexedDB drawing read error:', err);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const lsRaw = localStorage.getItem(`drawings_backup_${symbolKey}`);
        if (lsRaw) {
          const parsed = JSON.parse(lsRaw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch {}
    return null;
  }
}

/**
 * Delete saved drawings for a symbol.
 */
export async function deleteDrawingsFromIndexedDB(symbolKey: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction([STORE_NAME], 'readwrite');
    tx.objectStore(STORE_NAME).delete(symbolKey);
  } catch (err) {
    console.warn('IndexedDB drawing delete error:', err);
  }
}

/**
 * Given a timestamp and the chart's data list, find the closest dataIndex.
 * Extrapolates into the past or future using average bar interval when outside range.
 */
export function timestampToDataIndex(timestamp: number, dataList: any[]): number {
  if (!dataList || dataList.length === 0) return 0;
  if (timestamp <= 0) return 0;

  const hi = dataList.length - 1;
  const firstTs = Number(dataList[0].timestamp);
  const lastTs = Number(dataList[hi].timestamp);

  // Compute average bar interval in ms
  const barInterval = dataList.length >= 2 && lastTs > firstTs
    ? (lastTs - firstTs) / hi
    : 60000; // fallback 1 minute

  if (timestamp < firstTs) {
    const barsBefore = Math.round((firstTs - timestamp) / barInterval);
    return -barsBefore;
  }

  if (timestamp > lastTs) {
    const barsAfter = Math.round((timestamp - lastTs) / barInterval);
    return hi + barsAfter;
  }

  // Binary search for closest timestamp in dataList
  let lo = 0;
  let r = hi;
  while (lo <= r) {
    const mid = (lo + r) >>> 1;
    const midTs = Number(dataList[mid].timestamp);

    if (midTs === timestamp) return mid;
    if (midTs < timestamp) {
      lo = mid + 1;
    } else {
      r = mid - 1;
    }
  }

  // lo is insertion point
  if (lo >= dataList.length) return dataList.length - 1;
  if (lo === 0) return 0;

  const prevTs = Number(dataList[lo - 1].timestamp);
  const nextTs = Number(dataList[lo].timestamp);

  return Math.abs(timestamp - prevTs) <= Math.abs(timestamp - nextTs) ? lo - 1 : lo;
}
