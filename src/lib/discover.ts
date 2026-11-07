// Descubre qué graficar a partir de las columnas del archivo: batería, motores conocidos,
// motores nuevos (prefijo_rpm / _current_a / _current_rate_aps) y cualquier otra columna,
// agrupada por prefijo (gyro_yaw + gyro_pitch → "Gyro").
import {
  BATTERY_COLUMN, CAROUSEL_PAGES, METRICS, TIME_COLUMN, columnFor, type MotorDef,
} from './channels';
import type { Telemetry } from './data';

export interface GroupColumn {
  col: string;
  label: string;
  color: string;
  ironColor: string;
  scale: string; // columnas de magnitud parecida comparten escala
}

export interface DataGroup {
  id: string;
  label: string;
  color: string;
  columns: GroupColumn[];
  /** Etiqueta del eje por escala. */
  scaleLabels: Record<string, string>;
}

export type CarouselItem = { kind: 'motor'; motor: MotorDef } | { kind: 'group'; group: DataGroup };

export interface Layout {
  hasBattery: boolean;
  motors: MotorDef[];
  groups: DataGroup[];
  pages: { title: string; items: CarouselItem[] }[];
}

export const PALETTE = ['#38bdf8', '#fbbf24', '#c084fc', '#34d399', '#fb923c', '#f472b6', '#a3e635', '#2dd4bf', '#f87171', '#818cf8'];
export const IRON_PALETTE = ['#ff5500', '#9ca3af', '#e5e7eb', '#ff8c42', '#6b7280', '#ffb27a', '#d1d5db', '#ff3b00'];

const PER_PAGE = 4;
const MOTOR_SUFFIX = new RegExp(`^(.+)(${METRICS.map((m) => m.suffix).join('|')})$`);

export const titleCase = (s: string) =>
  s.split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** Parte una lista en trozos de hasta n elementos, de tamaños parecidos (5 → 3 + 2, no 4 + 1). */
function chunk<T>(list: T[], n: number): T[][] {
  const parts = Math.ceil(list.length / n);
  const size = Math.ceil(list.length / Math.max(parts, 1));
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Agrupa columnas por magnitud (factor ≤ 4) para que compartan eje sin aplastarse. */
export function clusterScales(tlm: Telemetry, cols: string[]): Map<string, number> {
  const mag = (c: string) => {
    const a = tlm.cols[c];
    let m = 0;
    for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > m) m = v; }
    return m;
  };
  const items = cols.map((c) => ({ c, m: mag(c) })).sort((a, b) => a.m - b.m);
  const out = new Map<string, number>();
  let cluster = -1;
  let base = NaN;
  for (const { c, m } of items) {
    const tiny = m < 1e-9;
    if (cluster < 0 || (tiny ? !(base < 1e-9) : !(m <= Math.max(base, 1e-9) * 4))) {
      cluster++;
      base = m;
    }
    out.set(c, cluster);
  }
  return out;
}

export function discoverLayout(tlm: Telemetry): Layout {
  const names = Object.keys(tlm.cols).filter((c) => c !== TIME_COLUMN);
  const used = new Set<string>([BATTERY_COLUMN]);
  const hasBattery = BATTERY_COLUMN in tlm.cols;

  // Motores conocidos presentes
  const pages: Layout['pages'] = [];
  const motors: MotorDef[] = [];
  for (const page of CAROUSEL_PAGES) {
    const present = page.motors.filter((m) => METRICS.some((x) => columnFor(m, x.id) in tlm.cols));
    present.forEach((m) => METRICS.forEach((x) => used.add(columnFor(m, x.id))));
    motors.push(...present);
    if (present.length) pages.push({ title: page.title, items: present.map((motor) => ({ kind: 'motor' as const, motor })) });
  }

  // Motores nuevos: <prefijo>_rpm, <prefijo>_current_a, <prefijo>_current_rate_aps
  const newMotors: MotorDef[] = [];
  for (const c of names) {
    if (used.has(c)) continue;
    const m = MOTOR_SUFFIX.exec(c);
    if (!m || newMotors.some((x) => x.prefix === m[1])) continue;
    const prefix = m[1];
    const motor: MotorDef = {
      id: `m:${prefix}`, prefix, short: titleCase(prefix), label: titleCase(prefix),
      color: PALETTE[(motors.length + newMotors.length) % PALETTE.length],
    };
    newMotors.push(motor);
  }
  newMotors.forEach((m) => METRICS.forEach((x) => used.add(columnFor(m, x.id))));
  motors.push(...newMotors);
  chunk(newMotors, PER_PAGE).forEach((items, i, all) =>
    pages.push({ title: all.length > 1 ? `More motors (${i + 1}/${all.length})` : 'More motors', items: items.map((motor) => ({ kind: 'motor' as const, motor })) }),
  );

  // Resto de columnas, agrupadas por la primera palabra del nombre
  const rest = names.filter((c) => !used.has(c));
  const byPrefix = new Map<string, string[]>();
  for (const c of rest) {
    const p = c.includes('_') ? c.slice(0, c.indexOf('_')) : c;
    byPrefix.set(p, [...(byPrefix.get(p) ?? []), c]);
  }
  const groups: DataGroup[] = [];
  let colorIdx = 0;
  for (const [prefix, cols] of byPrefix) {
    const shared = cols.length > 1;
    chunk(cols, PER_PAGE).forEach((part, i, all) => {
      const scales = clusterScales(tlm, part);
      const columns: GroupColumn[] = part.map((c) => {
        const k = colorIdx++;
        const short = shared && c.startsWith(`${prefix}_`) ? c.slice(prefix.length + 1) : c;
        const label = /^\d+$/.test(short) ? c : short;
        return { col: c, label, color: PALETTE[k % PALETTE.length], ironColor: IRON_PALETTE[k % IRON_PALETTE.length], scale: `s${scales.get(c)}` };
      });
      const scaleLabels: Record<string, string> = {};
      for (const col of columns) scaleLabels[col.scale] = scaleLabels[col.scale] ? `${scaleLabels[col.scale]}, ${col.label}` : col.label;
      const base = prefix === 'col' ? 'Columns' : titleCase(shared ? prefix : part[0]);
      groups.push({
        id: `g:${prefix}:${i}`,
        label: all.length > 1 ? `${base} (${i + 1}/${all.length})` : base,
        color: columns[0].color,
        columns,
        scaleLabels,
      });
    });
  }
  chunk(groups, PER_PAGE).forEach((items, i, all) =>
    pages.push({ title: all.length > 1 ? `Other data (${i + 1}/${all.length})` : 'Other data', items: items.map((group) => ({ kind: 'group' as const, group })) }),
  );

  return { hasBattery, motors, groups, pages };
}
