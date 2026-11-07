// Genera un CSV sintético grande para probar rendimiento.
// Uso: npm run sample -- [filas] [archivo]
//   npm run sample -- 50000 big.csv
import { writeFileSync } from 'node:fs';

const rows = Number(process.argv[2] ?? 50_000);
const out = process.argv[3] ?? `motor_data_${rows}.csv`;
const dt = 0.01;

const motors = ['fl', 'fr', 'bl', 'br', 'shooter_p', 'shooter_n', 'intake'];
const header = ['time_s', 'battery_volts', ...motors.flatMap((m) => [`${m}_rpm`, `${m}_current_a`, `${m}_current_rate_aps`])];

const prevA = Object.fromEntries(motors.map((m) => [m, 0]));
const lines = [header.join(',')];
const noise = (s) => (Math.random() - 0.5) * s;

for (let i = 0; i < rows; i++) {
  const t = i * dt;
  const phase = t / (rows * dt);
  const cells = [t.toFixed(2)];
  let load = 0;
  const vals = [];
  for (const m of motors) {
    const isDrive = m.length === 2;
    const target = isDrive
      ? 300 * Math.max(0, Math.sin(t * 0.35 + m.charCodeAt(0)))
      : m === 'intake'
        ? (Math.sin(t * 0.2) > 0.3 ? 280 : 0)
        : (Math.sin(t * 0.12) > 0 ? 1500 : 0);
    const rpm = Math.max(0, target + noise(target * 0.02 + 1));
    const amps = Math.max(0, (isDrive ? 1.7 : 1.9) * (rpm > 1 ? 1 : 0) + noise(0.12) + (Math.random() < 0.0005 ? 18 : 0));
    const aps = (amps - prevA[m]) / dt;
    prevA[m] = amps;
    load += amps;
    vals.push(rpm.toFixed(1), amps.toFixed(2), aps.toFixed(2));
  }
  const volts = 13.1 - phase * 1.9 - load * 0.035 + noise(0.04);
  cells.push(volts.toFixed(2), ...vals);
  lines.push(cells.join(','));
}

writeFileSync(out, lines.join('\n'));
console.log(`Escribí ${rows.toLocaleString()} filas en ${out}`);
