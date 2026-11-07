// Definición de canales de telemetría: qué columnas del CSV pertenecen a cada motor y métrica.

export type MetricId = 'rpm' | 'a' | 'aps';
export type UnitId = MetricId | 'v';

export interface MetricDef {
  id: MetricId;
  label: string; // texto del botón
  unit: string; // unidad mostrada en el eje
  suffix: string; // sufijo de la columna en el CSV
  color: string; // color en las gráficas por motor
  dash?: number[]; // patrón de línea en la vista general
}

export const METRICS: MetricDef[] = [
  { id: 'rpm', label: 'RPM', unit: 'RPM', suffix: '_rpm', color: '#38bdf8' },
  { id: 'a', label: 'A', unit: 'A', suffix: '_current_a', color: '#fbbf24', dash: [8, 4] },
  { id: 'aps', label: 'A/s', unit: 'A/s', suffix: '_current_rate_aps', color: '#c084fc', dash: [2, 3] },
];

export const METRIC_BY_ID: Record<MetricId, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.id, m]),
) as Record<MetricId, MetricDef>;

export interface MotorDef {
  id: string;
  prefix: string; // prefijo de la columna en el CSV
  short: string;
  label: string;
  color: string; // color del motor en la vista general
}

export const DRIVE_MOTORS: MotorDef[] = [
  { id: 'fl', prefix: 'fl', short: 'FL', label: 'Front left', color: '#38bdf8' },
  { id: 'fr', prefix: 'fr', short: 'FR', label: 'Front right', color: '#34d399' },
  { id: 'bl', prefix: 'bl', short: 'BL', label: 'Rear left', color: '#fb923c' },
  { id: 'br', prefix: 'br', short: 'BR', label: 'Rear right', color: '#f472b6' },
];

export const MECHANISM_MOTORS: MotorDef[] = [
  { id: 'shooter_p', prefix: 'shooter_p', short: 'Pollen', label: 'Shooter Pollen', color: '#facc15' },
  { id: 'shooter_n', prefix: 'shooter_n', short: 'Nectar', label: 'Shooter Nectar', color: '#a78bfa' },
  { id: 'intake', prefix: 'intake', short: 'Intake', label: 'Intake', color: '#2dd4bf' },
];

export const ALL_MOTORS = [...DRIVE_MOTORS, ...MECHANISM_MOTORS];

export const CAROUSEL_PAGES: { title: string; motors: MotorDef[] }[] = [
  { title: 'Drivetrain', motors: DRIVE_MOTORS },
  { title: 'Mechanisms', motors: MECHANISM_MOTORS },
];

/** Rango objetivo de RPM; cada rango se dibuja con una línea en su mínimo y otra en su máximo. */
export interface RpmTarget {
  name: string;
  min: number;
  max: number;
  color: string;
}

const DRIVE_TARGETS: RpmTarget[] = [
  { name: 'Fast', min: 240, max: 275, color: '#e2e8f0' },
  { name: 'Slow', min: 95, max: 120, color: '#a3e635' },
];
const SHOOTER_TARGETS: RpmTarget[] = [{ name: 'Target', min: 1200, max: 1450, color: '#e2e8f0' }];
const INTAKE_TARGETS: RpmTarget[] = [{ name: 'Target', min: 280, max: 360, color: '#e2e8f0' }];

/** Paleta del tema Iron Health: negro, gris y naranja (tomada del logo). */
export const IRON_ORANGE = '#ff5500';
export const IRON_METRIC_COLORS: Record<MetricId, string> = {
  rpm: IRON_ORANGE, // RPM: naranja
  a: '#9ca3af', // A: gris
  aps: '#e5e7eb', // A/s: gris claro (línea punteada)
};
export const IRON_MOTOR_COLORS: Record<string, string> = {
  fl: '#ff5500',
  fr: '#ff8c42',
  bl: '#9ca3af',
  br: '#d1d5db',
  shooter_p: '#ff3b00',
  shooter_n: '#6b7280',
  intake: '#ffb27a',
};
export const IRON_BATTERY_COLOR = '#ff8c42';
export const IRON_NEUTRAL = '#e5e7eb';

export const RPM_TARGETS: Record<string, RpmTarget[]> = {
  fl: DRIVE_TARGETS,
  fr: DRIVE_TARGETS,
  bl: DRIVE_TARGETS,
  br: DRIVE_TARGETS,
  shooter_p: SHOOTER_TARGETS,
  shooter_n: SHOOTER_TARGETS,
  intake: INTAKE_TARGETS,
};

export const TIME_COLUMN = 'time_s';
export const BATTERY_COLUMN = 'battery_volts';
export const BATTERY_LIMIT_V = 11;
export const BATTERY_COLOR = '#22c55e';
export const LIMIT_COLOR = '#ef4444';

export const columnFor = (motor: MotorDef, metric: MetricId) =>
  motor.prefix + METRIC_BY_ID[metric].suffix;
