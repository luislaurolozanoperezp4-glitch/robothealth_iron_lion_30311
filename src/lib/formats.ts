// Detecta el formato de un archivo y lo convierte en telemetría.
// Soporta: texto delimitado (CSV, TSV, TXT, LOG, DAT… con coma, punto y coma, tabulador, | o espacios),
// JSON / NDJSON, Excel .xlsx/.xlsm, ZIP con un archivo de datos dentro y .gz.
import { tableToTelemetry, type RawTable, type Telemetry } from './data';
import { gunzip, isZip, readZip } from './zip';
import { readXlsx } from './xlsx';

export async function loadTelemetryFile(fileName: string, buffer: ArrayBuffer): Promise<Telemetry> {
  return loadBytes(fileName, new Uint8Array(buffer), fileName);
}

async function loadBytes(fileName: string, bytes: Uint8Array, displayName: string): Promise<Telemetry> {
  if (bytes.length === 0) throw new Error('The file is empty.');

  // .gz
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return loadBytes(fileName.replace(/\.gz$/i, ''), await gunzip(bytes), displayName);
  }

  // .xlsx / .xlsm o ZIP con datos
  if (isZip(bytes)) {
    const entries = readZip(bytes);
    if (entries.has('xl/workbook.xml')) {
      const rows = await readXlsx(entries);
      return tableToTelemetry({ rowCount: rows.length, row: (i) => rows[i] }, displayName);
    }
    const inner = [...entries.keys()].find((k) => /\.(csv|tsv|txt|log|dat|json|ndjson|jsonl|xlsx|xlsm)$/i.test(k) && !k.startsWith('__MACOSX'));
    if (!inner) throw new Error('The ZIP file does not contain a data file (CSV, TXT, JSON, XLSX…).');
    const t = await loadBytes(inner, await entries.get(inner)!(), `${displayName} › ${inner.split('/').pop()}`);
    return t;
  }

  // Excel antiguo (.xls, formato binario OLE)
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new Error('Old Excel .xls files are not supported. In Excel use "Save as" → .xlsx or .csv.');
  }

  const text = decodeText(bytes);
  if (looksBinary(text)) {
    throw new Error('This looks like a binary file (image, PDF, executable…). Use a text table (CSV/TXT), JSON or Excel file.');
  }

  const trimmed = text.trimStart();
  if (trimmed[0] === '[' || trimmed[0] === '{') {
    const table = jsonTable(trimmed);
    if (table) return tableToTelemetry(table, displayName);
    throw new Error('JSON structure not recognized. Use a list of rows [{"time_s": 0, …}] or columns {"time_s": [...], …}.');
  }
  return tableToTelemetry(parseTextTable(text), displayName);
}

/** UTF-8 (con o sin BOM), UTF-16 con BOM, y si no es UTF-8 válido, Windows-1252. */
function decodeText(b: Uint8Array): string {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3));
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('windows-1252').decode(b);
  }
}

function looksBinary(text: string): boolean {
  const sample = text.slice(0, 8192);
  let bad = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 0 || (c < 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12)) bad++;
  }
  return sample.length > 0 && bad / sample.length > 0.02;
}

// ───────────── Texto delimitado ─────────────

const DELIMS = ['\t', ';', '|', ','] as const;

function countChar(line: string, ch: string): number {
  let n = 0, inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ch && !inQ) n++;
  }
  return n;
}

function mode(values: number[]): [number, number] {
  const freq = new Map<number, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  let best = 0, bestF = 0;
  for (const [v, f] of freq) if (f > bestF || (f === bestF && v > best)) { best = v; bestF = f; }
  return [best, bestF];
}

function splitQuoted(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
    } else if (c === d && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Texto delimitado con detección automática de separador, encabezado y coma decimal. */
export function parseTextTable(text: string): RawTable {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '' && !/^\s*(#|\/\/)/.test(l));
  if (lines.length === 0) throw new Error('The file is empty.');
  const sample = lines.slice(0, 60);

  let delim: string = ',';
  let cols = 0;
  let found = false;
  for (const d of DELIMS) {
    const [m, f] = mode(sample.map((l) => countChar(l, d)));
    if (m >= 1 && f >= sample.length * 0.6) { delim = d; cols = m; found = true; break; }
  }
  if (!found) {
    const [m, f] = mode(sample.map((l) => l.trim().split(/\s+/).length - 1));
    if (m >= 1 && f >= sample.length * 0.6) { delim = ' '; cols = m; }
  }

  const count = (l: string) => (delim === ' ' ? l.trim().split(/\s+/).length - 1 : countChar(l, delim));
  // Saltar líneas de metadatos antes del encabezado (las que no tienen el número típico de columnas).
  let start = 0;
  if (cols > 0) while (start < lines.length - 1 && count(lines[start]) !== cols) start++;

  const decimalComma = delim !== ',' && sample.slice(1).some((l) => /\d,\d/.test(l));

  const split =
    delim === ' '
      ? (l: string) => l.trim().split(/\s+/)
      : (l: string) => (l.includes('"') ? splitQuoted(l, delim) : l.split(delim));

  return { rowCount: lines.length - start, row: (i) => split(lines[start + i]), decimalComma };
}

// ───────────── JSON ─────────────

function flatten(obj: unknown, prefix: string, out: Record<string, unknown>) {
  if (obj && typeof obj === 'object' && !Array.isArray(obj) && !(obj instanceof Date)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}_${k}` : k, out);
  } else {
    out[prefix || 'value'] = obj;
  }
  return out;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function jsonTable(text: string): RawTable | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // NDJSON / JSON Lines: un objeto por línea
    const ls = text.split(/\r?\n/).filter((l) => l.trim());
    if (!ls.every((l) => l.trim().startsWith('{'))) return null;
    try { data = ls.map((l) => JSON.parse(l)); } catch { return null; }
  }
  return toTable(data, 0);
}

function toTable(data: unknown, depth: number): RawTable | null {
  if (depth > 4) return null;
  if (Array.isArray(data)) {
    if (data.length === 0) throw new Error('The JSON has no rows.');
    if (Array.isArray(data[0])) return { rowCount: data.length, row: (i) => data[i] ?? [] };
    if (isPlainObject(data[0])) {
      const keys = new Set<string>();
      for (const r of data.slice(0, 200)) for (const k of Object.keys(flatten(r, '', {}))) keys.add(k);
      const header = [...keys];
      return { header, rowCount: data.length, row: (i) => { const f = flatten(data[i], '', {}); return header.map((k) => f[k]); } };
    }
    return null;
  }
  if (isPlainObject(data)) {
    // Envoltorio: { data: [...] }, { rows: [...] }, …
    for (const key of ['data', 'rows', 'records', 'samples', 'telemetry', 'values', 'items', 'log']) {
      const v = data[key];
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') return toTable(v, depth + 1);
    }
    // Columnar: { time_s: [...], battery_volts: [...] } (también anidado: { fl: { rpm: [...] } })
    const flat = flatten(data, '', {});
    const header = Object.keys(flat).filter((k) => Array.isArray(flat[k]) && (flat[k] as unknown[]).length > 1);
    if (header.length >= 2) {
      const arrays = header.map((k) => flat[k] as unknown[]);
      const rowCount = Math.max(...arrays.map((a) => a.length));
      return { header, rowCount, row: (i) => arrays.map((a) => a[i]) };
    }
    for (const v of Object.values(data)) {
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') return toTable(v, depth + 1);
    }
  }
  return null;
}
