// Piezas compartidas de configuración de uPlot (tema oscuro, ejes por unidad, línea de límite).
import type uPlot from 'uplot';
import { BATTERY_LIMIT_V, LIMIT_COLOR } from './channels';

const AXIS_TEXT = '#94a3b8';
const GRID = 'rgba(148, 163, 184, 0.10)';
const TICKS = 'rgba(148, 163, 184, 0.25)';
const FONT = '11px Inter, system-ui, sans-serif';
const LABEL_FONT = '600 11px Inter, system-ui, sans-serif';

export const xScale: uPlot.Scale = { time: false };

export function xAxis(): uPlot.Axis {
  return {
    stroke: AXIS_TEXT,
    font: FONT,
    grid: { stroke: GRID, width: 1 },
    ticks: { stroke: TICKS, width: 1, size: 4 },
    values: (_u, vals) => vals.map((v) => `${+v.toFixed(3)} s`),
  };
}

const compact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 10_000) return `${+(v / 1000).toFixed(1)}k`;
  return `${+v.toFixed(a < 10 ? 2 : 1)}`;
};

/**
 * Eje Y para una unidad. side 3 = izquierda, 1 = derecha.
 * El color del eje coincide con su serie para saber qué escala leer.
 */
export function unitAxis(scale: string, unit: string, color: string, side: 1 | 3, showGrid: boolean): uPlot.Axis {
  return {
    scale,
    side,
    stroke: color,
    font: FONT,
    label: unit,
    labelFont: LABEL_FONT,
    labelSize: 16,
    labelGap: 2,
    size: (u, values) => {
      const longest = (values ?? []).reduce((m, s) => Math.max(m, String(s).length), 3);
      void u;
      return Math.max(40, longest * 7 + 14);
    },
    grid: { show: showGrid, stroke: GRID, width: 1 },
    ticks: { stroke: TICKS, width: 1, size: 4 },
    values: (_u, vals) => vals.map(compact),
  };
}

/** Garantiza que el límite de batería siempre sea visible en la escala del voltaje. */
export const batteryRange: uPlot.Range.Function = (_u, min, max) => {
  const lo = Math.min(min ?? BATTERY_LIMIT_V, BATTERY_LIMIT_V);
  const hi = Math.max(max ?? BATTERY_LIMIT_V, BATTERY_LIMIT_V);
  const pad = Math.max((hi - lo) * 0.12, 0.15);
  return [lo - pad, hi + pad];
};

/** Dibuja la línea roja del límite de salud de la batería y sombrea la zona baja. */
export function batteryLimitPlugin(scaleKey: string): uPlot.Plugin {
  return {
    hooks: {
      draw: [
        (u) => {
          if (!u.scales[scaleKey] || u.scales[scaleKey].min == null) return;
          const ctx = u.ctx;
          const { left, top, width, height } = u.bbox;
          const y = Math.round(u.valToPos(BATTERY_LIMIT_V, scaleKey, true));
          if (y < top || y > top + height) return;
          const dpr = devicePixelRatio || 1;
          ctx.save();
          ctx.fillStyle = 'rgba(239, 68, 68, 0.07)';
          ctx.fillRect(left, y, width, top + height - y);
          ctx.strokeStyle = LIMIT_COLOR;
          ctx.lineWidth = 2 * dpr;
          ctx.setLineDash([6 * dpr, 4 * dpr]);
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(left + width, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = `600 ${11 * dpr}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = LIMIT_COLOR;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`Límite ${BATTERY_LIMIT_V} V`, left + width - 6 * dpr, y - 3 * dpr);
          ctx.restore();
        },
      ],
    },
  };
}

/** Trazo que cambia a rojo cuando el voltaje está por debajo del límite. */
export function batteryStroke(okColor: string, scaleKey: string) {
  return (u: uPlot) => {
    const { top, height } = u.bbox;
    const sc = u.scales[scaleKey];
    if (sc?.min == null || height <= 0) return okColor;
    const y = u.valToPos(BATTERY_LIMIT_V, scaleKey, true);
    const f = Math.min(1, Math.max(0, (y - top) / height));
    const g = u.ctx.createLinearGradient(0, top, 0, top + height);
    g.addColorStop(0, okColor);
    g.addColorStop(f, okColor);
    g.addColorStop(f, LIMIT_COLOR);
    g.addColorStop(1, LIMIT_COLOR);
    return g;
  };
}

export const fmtValue = (digits: number) => (_u: uPlot, v: number | null) =>
  v == null ? '—' : v.toFixed(digits);
