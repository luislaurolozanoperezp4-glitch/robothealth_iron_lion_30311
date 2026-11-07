// Modelo de telemetría: convierte cualquier tabla (texto, JSON, Excel) en columnas numéricas,
// recorta por rango de tiempo y decima para archivos muy grandes.
import { ALL_MOTORS, BATTERY_COLUMN, METRICS, TIME_COLUMN, columnFor } from './channels';

export interface Telemetry {
  fileName: string;
  rows: number;
  time: Float64Array;
  cols: Record<string, Float64Array>;
  tMin: number;
  tMax: number;
  /** Avisos sobre cómo se interpretó el archivo (columna de tiempo, encabezados, etc.). */
  notes: string[];
}

export type TimeRange = [number, number];

/** Tabla cruda de cualquier formato. Si no trae `header`, la primera fila puede ser el encabezado. */
export interface RawTable {
  header?: string[];
  rowCount: number;
  row(i: number): ArrayLike<unknown>;
  decimalComma?: boolean;
}

/** Orden estándar de columnas, usado cuando el archivo no trae encabezado. */
export const STANDARD_COLUMNS = [
  TIME_COLUMN,
  BATTERY_COLUMN,
  ...ALL_MOTORS.flatMap((m) => METRICS.map((x) => columnFor(m, x.id))),
];

/** Nombres alternativos para la columna de tiempo y su factor a segundos. */
const TIME_ALIASES: Record<string, number> = {
  time_s: 1, time: 1, t: 1, tiempo: 1, tiempo_s: 1, seconds: 1, secs: 1, sec: 1, s: 1,
  elapsed: 1, elapsed_s: 1, time_sec: 1, time_seconds: 1, timestamp: 1, timestamp_s: 1, fpga_time: 1,
  time_ms: 1e-3, timestamp_ms: 1e-3, t_ms: 1e-3, ms: 1e-3, millis: 1e-3, milliseconds: 1e-3, tiempo_ms: 1e-3,
  time_us: 1e-6, timestamp_us: 1e-6, us: 1e-6, micros: 1e-6, microseconds: 1e-6,
};

const BATTERY_ALIASES = new Set(['battery', 'battery_v', 'battery_voltage', 'voltage', 'volts', 'bat_v', 'vbat', 'bateria', 'bateria_v']);

/** "Battery Volts (V)" → "battery_volts_v"; "time (s)" → "time_s". */
export function normalizeName(h: unknown): string {
  return String(h ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function makeNum(decimalComma: boolean) {
  return (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (v == null) return NaN;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'boolean') return v ? 1 : 0;
    let s = String(v).trim();
    if (s === '') return NaN;
    if (s.charCodeAt(0) === 34 /* " */) s = s.replace(/^"|"$/g, '').trim();
    if (decimalComma) s = s.replace(',', '.');
    return +s;
  };
}

/** Convierte un texto de hora/fecha a número: "12:30:05.2" → segundos; ISO → ms epoch. */
function parseClockOrDate(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v !== 'string') return NaN;
  const s = v.trim().replace(/^"|"$/g, '');
  const m = /^(\d+):(\d{1,2})(?::(\d{1,2}(?:[.,]\d+)?))?$/.exec(s);
  if (m) {
    const [, a, b, c] = m;
    return c != null ? +a * 3600 + +b * 60 + +c.replace(',', '.') : +a * 60 + +b;
  }
  const d = Date.parse(s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s);
  return Number.isFinite(d) ? d : NaN;
}

const isNumericCell = (v: unknown, num: (v: unknown) => number) => {
  if (v == null || v === '') return true; // vacío no decide
  return Number.isFinite(num(v));
};

/** Convierte una tabla cruda en telemetría lista para graficar. */
export function tableToTelemetry(table: RawTable, fileName: string): Telemetry {
  const notes: string[] = [];
  const num = makeNum(!!table.decimalComma);
  if (table.rowCount === 0) throw new Error('The file is empty.');

  // 1. Encabezado
  let start = 0;
  let rawHeader: unknown[];
  if (table.header) {
    rawHeader = table.header;
  } else {
    const first = Array.from(table.row(0));
    const looksNumeric = first.every((v) => isNumericCell(v, num));
    if (looksNumeric) {
      if (first.length === STANDARD_COLUMNS.length) {
        rawHeader = STANDARD_COLUMNS;
        notes.push('No header row: assumed the standard robot column order.');
      } else {
        rawHeader = first.map((_, i) => `col_${i + 1}`);
        notes.push('No header row: columns named col_1, col_2, …');
      }
    } else {
      rawHeader = first;
      start = 1;
    }
  }

  const seen = new Map<string, number>();
  const header = rawHeader.map((h, i) => {
    let name = normalizeName(h) || `col_${i + 1}`;
    if (BATTERY_ALIASES.has(name)) name = BATTERY_COLUMN;
    const k = seen.get(name) ?? 0;
    seen.set(name, k + 1);
    return k ? `${name}_${k + 1}` : name;
  });
  if (!header.includes(BATTERY_COLUMN)) {
    const alt = header.findIndex((h) => /^(battery|bateria)/.test(h) && /(volt|_v$)/.test(h));
    if (alt >= 0) header[alt] = BATTERY_COLUMN;
  }
  const nCols = header.length;

  // 2. Columna de tiempo
  let timeIdx = header.indexOf(TIME_COLUMN);
  let timeFactor = 1;
  if (timeIdx < 0) {
    timeIdx = header.findIndex((h) => h in TIME_ALIASES);
    if (timeIdx < 0) timeIdx = header.findIndex((h) => /^(time|timestamp|tiempo|elapsed|date|datetime|fecha|hora|hour|clock)/.test(h));
    if (timeIdx >= 0) {
      const h = header[timeIdx];
      timeFactor = TIME_ALIASES[h] ?? (/(_ms|millis)/.test(h) ? 1e-3 : /(_us|micros)/.test(h) ? 1e-6 : 1);
    } else if (nCols > 1 && !STANDARD_COLUMNS.includes(header[0]) && (isMonotonic(table, start, 0, num) || isClockOrDate(table, start, 0, num))) {
      timeIdx = 0;
    }
  }
  const useIndex = timeIdx < 0;

  // ¿El tiempo viene como hora "hh:mm:ss" o fecha?
  let clockMode = false;
  if (!useIndex) {
    for (let r = start; r < Math.min(table.rowCount, start + 20); r++) {
      const v = table.row(r)[timeIdx];
      if (v == null || v === '') continue;
      clockMode = !Number.isFinite(num(v)) && Number.isFinite(parseClockOrDate(v));
      break;
    }
  }

  // 3. Valores
  const capacity = Math.max(table.rowCount - start, 0);
  const time = new Float64Array(capacity);
  const buffers = header.map(() => new Float64Array(capacity));
  const finiteCount = new Uint32Array(nCols);
  const last = new Float64Array(nCols);
  let n = 0;
  for (let r = start; r < table.rowCount; r++) {
    const cells = table.row(r);
    if (!cells || cells.length === 0) continue;
    let t: number;
    if (useIndex) t = n;
    else {
      const raw = cells[timeIdx];
      t = clockMode ? parseClockOrDate(raw) : num(raw);
      if (!Number.isFinite(t)) continue; // filas sin tiempo válido (unidades, comentarios) se ignoran
    }
    time[n] = t;
    for (let c = 0; c < nCols; c++) {
      if (c === timeIdx) continue;
      const v = num(cells[c]);
      if (Number.isFinite(v)) { buffers[c][n] = v; last[c] = v; finiteCount[c]++; }
      else buffers[c][n] = last[c];
    }
    n++;
  }
  if (n === 0) throw new Error('No numeric data rows were found in the file.');

  // 4. Escala del tiempo
  const notesBefore = notes.length;
  let tm = time.subarray(0, n);
  if (timeFactor !== 1) for (let i = 0; i < n; i++) tm[i] *= timeFactor;
  const t0 = tm[0];
  if (clockMode && t0 > 1e9) {
    for (let i = 0; i < n; i++) tm[i] = (tm[i] - t0) / 1000;
    notes.push(`Time column "${header[timeIdx]}" read as date/time; shown as seconds from the first sample.`);
  } else if (t0 > 1e11) {
    for (let i = 0; i < n; i++) tm[i] = (tm[i] - t0) / 1000;
    notes.push(`Time column "${header[timeIdx]}" looks like epoch milliseconds; shown as seconds from the first sample.`);
  } else if (t0 > 1e8) {
    for (let i = 0; i < n; i++) tm[i] -= t0;
    notes.push(`Time column "${header[timeIdx]}" looks like epoch seconds; shown relative to the first sample.`);
  }
  const timeNoted = notes.length > notesBefore;
  if (useIndex) notes.push('No time column found: using the row number as time.');
  else if (header[timeIdx] !== TIME_COLUMN && !timeNoted) {
    const unit = timeFactor === 1e-3 ? ' (ms → s)' : timeFactor === 1e-6 ? ' (µs → s)' : '';
    notes.push(`Using "${header[timeIdx]}" as the time column${unit}.`);
  }

  let cols: Record<string, Float64Array> = {};
  header.forEach((name, c) => {
    if (c !== timeIdx && finiteCount[c] > 0) cols[name] = buffers[c].slice(0, n);
  });
  let timeArr = tm.slice();

  // 5. Orden ascendente por tiempo (requisito de uPlot y de la búsqueda binaria)
  let sorted = true;
  for (let i = 1; i < n; i++) if (timeArr[i] < timeArr[i - 1]) { sorted = false; break; }
  if (!sorted) {
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => timeArr[a] - timeArr[b]);
    const reorder = (arr: Float64Array) => {
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) out[i] = arr[order[i]];
      return out;
    };
    cols = Object.fromEntries(Object.entries(cols).map(([k, a]) => [k, reorder(a)]));
    timeArr = reorder(timeArr);
    notes.push('Rows were not in time order; they were sorted.');
  }
  cols[TIME_COLUMN] = timeArr;

  if (Object.keys(cols).length === 1) {
    throw new Error(`No numeric columns to plot besides time. Columns in file: ${header.slice(0, 12).join(', ')}${header.length > 12 ? '…' : ''}`);
  }

  return { fileName, rows: n, time: timeArr, cols, tMin: timeArr[0], tMax: timeArr[n - 1], notes };
}

function isClockOrDate(table: RawTable, start: number, col: number, num: (v: unknown) => number): boolean {
  for (let r = start; r < Math.min(table.rowCount, start + 20); r++) {
    const v = table.row(r)[col];
    if (v == null || v === '') continue;
    return !Number.isFinite(num(v)) && Number.isFinite(parseClockOrDate(v));
  }
  return false;
}

function isMonotonic(table: RawTable, start: number, col: number, num: (v: unknown) => number): boolean {
  let prev = -Infinity, seen = 0;
  for (let r = start; r < Math.min(table.rowCount, start + 200); r++) {
    const v = num(table.row(r)[col]);
    if (!Number.isFinite(v)) continue;
    if (v < prev) return false;
    prev = v;
    seen++;
  }
  return seen > 1;
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
  const sign = t < 0 ? '-' : '';
  const a = Math.abs(t);
  const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
  if (a < 60) return `${sign}${a.toFixed(2)} s`;
  if (a < 3600) return `${sign}${Math.floor(a / 60)}:${(a % 60).toFixed(1).padStart(4, '0')}`;
  if (a < 86400) return `${sign}${Math.floor(a / 3600)}:${pad((a % 3600) / 60)}:${pad(a % 60)}`;
  return `${sign}${Math.floor(a / 86400)}d ${Math.floor((a % 86400) / 3600)}:${pad((a % 3600) / 60)}`;
}

/** Etiqueta del eje de tiempo según la duración visible. */
export function formatAxisTime(v: number, span: number): string {
  if (span < 120) return `${+v.toFixed(3)} s`;
  const a = Math.abs(v);
  const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
  if (span < 2 * 3600) return `${Math.floor(a / 60)}:${pad(a % 60)}`;
  if (span < 3 * 86400) return `${Math.floor(a / 3600)}:${pad((a % 3600) / 60)}`;
  return `${Math.floor(a / 86400)}d ${Math.floor((a % 86400) / 3600)}h`;
}
