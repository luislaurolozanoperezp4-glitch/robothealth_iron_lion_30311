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
  { id: 'fl', prefix: 'fl', short: 'FL', label: 'Frontal izquierdo', color: '#38bdf8' },
  { id: 'fr', prefix: 'fr', short: 'FR', label: 'Frontal derecho', color: '#34d399' },
  { id: 'bl', prefix: 'bl', short: 'BL', label: 'Trasero izquierdo', color: '#fb923c' },
  { id: 'br', prefix: 'br', short: 'BR', label: 'Trasero derecho', color: '#f472b6' },
];

export const MECHANISM_MOTORS: MotorDef[] = [
  { id: 'shooter_p', prefix: 'shooter_p', short: 'Pollen', label: 'Shooter Pollen', color: '#facc15' },
  { id: 'shooter_n', prefix: 'shooter_n', short: 'Nectar', label: 'Shooter Nectar', color: '#a78bfa' },
  { id: 'intake', prefix: 'intake', short: 'Intake', label: 'Intake', color: '#2dd4bf' },
];

export const ALL_MOTORS = [...DRIVE_MOTORS, ...MECHANISM_MOTORS];

export const CAROUSEL_PAGES: { title: string; motors: MotorDef[] }[] = [
  { title: 'Tren motriz', motors: DRIVE_MOTORS },
  { title: 'Mecanismos', motors: MECHANISM_MOTORS },
];

export const TIME_COLUMN = 'time_s';
export const BATTERY_COLUMN = 'battery_volts';
export const BATTERY_LIMIT_V = 11;
export const BATTERY_COLOR = '#22c55e';
export const LIMIT_COLOR = '#ef4444';

export const columnFor = (motor: MotorDef, metric: MetricId) =>
  motor.prefix + METRIC_BY_ID[metric].suffix;
