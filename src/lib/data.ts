// Carga del CSV, recorte por rango de tiempo y decimación para archivos muy grandes.
import { TIME_COLUMN } from './channels';

export interface Telemetry {
  fileName: string;
  rows: number;
  time: Float64Array;
  cols: Record<string, Float64Array>;
  tMin: number;
  tMax: number;
}

export type TimeRange = [number, number];

/**
 * Parser numérico rápido. Celdas vacías o no numéricas toman el valor anterior
 * de la columna (o 0 al inicio) para que las gráficas no se rompan.
 */
export function parseTelemetryCsv(text: string, fileName: string): Telemetry {
  const lines = text.split(/\r?\n/);
  let headerIdx = 0;
  while (headerIdx < lines.length && lines[headerIdx].trim() === '') headerIdx++;
  if (headerIdx >= lines.length) throw new Error('El archivo está vacío.');

  const header = lines[headerIdx].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const timeIdx = header.indexOf(TIME_COLUMN);
  if (timeIdx < 0) throw new Error(`No se encontró la columna "${TIME_COLUMN}".`);

  const nCols = header.length;
  const capacity = lines.length - headerIdx - 1;
  const buffers = header.map(() => new Float64Array(Math.max(capacity, 0)));
  const last = new Float64Array(nCols);
  let n = 0;

  for (let li = headerIdx + 1; li < lines.length; li++) {
    const line = lines[li];
    if (line.length === 0 || line.trim() === '') continue;
    const cells = line.split(',');
    const t = parseFloat(cells[timeIdx]);
    if (!Number.isFinite(t)) continue; // filas sin tiempo válido se ignoran
    for (let c = 0; c < nCols; c++) {
      const v = c === timeIdx ? t : parseFloat(cells[c]);
      const val = Number.isFinite(v) ? v : last[c];
      buffers[c][n] = val;
      last[c] = val;
    }
    n++;
  }
  if (n === 0) throw new Error('El archivo no contiene filas de datos.');

  let cols: Record<string, Float64Array> = {};
  header.forEach((name, c) => {
    if (name) cols[name] = buffers[c].slice(0, n);
  });

  // Asegurar orden ascendente por tiempo (requisito de uPlot y de la búsqueda binaria).
  let time = cols[TIME_COLUMN];
  let sorted = true;
  for (let i = 1; i < n; i++) if (time[i] < time[i - 1]) { sorted = false; break; }
  if (!sorted) {
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => time[a] - time[b]);
    const re: Record<string, Float64Array> = {};
    for (const [k, arr] of Object.entries(cols)) {
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) out[i] = arr[order[i]];
      re[k] = out;
    }
    cols = re;
    time = cols[TIME_COLUMN];
  }

  return { fileName, rows: n, time, cols, tMin: time[0], tMax: time[n - 1] };
}

/** Índices [i0, i1] (inclusivos) de las muestras dentro del rango. */
export function rangeIndices(time: Float64Array, [t0, t1]: TimeRange): [number, number] {
  const lower = (x: number) => {
    let lo = 0, hi = time.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (time[mid] < x) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const upper = (x: number) => {
    let lo = 0, hi = time.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (time[mid] <= x) lo = mid + 1; else hi = mid; }
    return lo - 1;
  };
  let i0 = lower(t0);
  let i1 = upper(t1);
  if (i0 >= time.length) i0 = time.length - 1;
  if (i1 < i0) i1 = i0;
  return [i0, i1];
}

/** Arriba de este número de muestras visibles se aplica decimación min/max. */
const DECIMATE_ABOVE = 40_000;
const BUCKETS = 2_000;

/**
 * Datos alineados para uPlot: [tiempo, serie1, serie2, ...] limitados al rango.
 * Si hay demasiadas muestras, conserva por cubeta el primer/último punto y el
 * mínimo/máximo de cada serie, así los picos nunca se pierden.
 */
export function buildAligned(tlm: Telemetry, columns: string[], range: TimeRange): Float64Array[] {
  const [i0, i1] = rangeIndices(tlm.time, range);
  const series = columns.map((c) => tlm.cols[c] ?? new Float64Array(tlm.rows));
  const n = i1 - i0 + 1;

  if (n <= DECIMATE_ABOVE) {
    return [tlm.time.subarray(i0, i1 + 1), ...series.map((s) => s.subarray(i0, i1 + 1))];
  }

  const keep = new Uint8Array(n);
  const step = n / BUCKETS;
  for (let b = 0; b < BUCKETS; b++) {
    const s0 = Math.floor(b * step);
    const s1 = Math.min(n, Math.floor((b + 1) * step));
    if (s1 <= s0) continue;
    keep[s0] = 1;
    keep[s1 - 1] = 1;
    for (const s of series) {
      let minI = s0, maxI = s0;
      let minV = s[i0 + s0], maxV = minV;
      for (let k = s0 + 1; k < s1; k++) {
        const v = s[i0 + k];
        if (v < minV) { minV = v; minI = k; } else if (v > maxV) { maxV = v; maxI = k; }
      }
      keep[minI] = 1;
      keep[maxI] = 1;
    }
  }
  let count = 0;
  for (let k = 0; k < n; k++) count += keep[k];
  const out = [new Float64Array(count), ...series.map(() => new Float64Array(count))];
  let j = 0;
  for (let k = 0; k < n; k++) {
    if (!keep[k]) continue;
    out[0][j] = tlm.time[i0 + k];
    for (let s = 0; s < series.length; s++) out[s + 1][j] = series[s][i0 + k];
    j++;
  }
  return out;
}

export function formatTime(t: number): string {
  if (!Number.isFinite(t)) return '—';
  if (Math.abs(t) < 60) return `${t.toFixed(2)} s`;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
