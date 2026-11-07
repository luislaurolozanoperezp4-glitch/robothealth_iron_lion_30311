// Piezas compartidas de configuración de uPlot (tema oscuro, ejes por unidad, línea de límite).
import type uPlot from 'uplot';
import { BATTERY_LIMIT_V, LIMIT_COLOR, type RpmTarget } from './channels';
import { formatAxisTime } from './data';

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
    values: (_u, vals) => {
      const span = vals.length > 1 ? vals[vals.length - 1] - vals[0] : 0;
      return vals.map((v) => formatAxisTime(v, span));
    },
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
          ctx.fillText(`Limit ${BATTERY_LIMIT_V} V`, left + width - 6 * dpr, y - 3 * dpr);
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

/** Escala de RPM que siempre incluye los rangos objetivo, para que las líneas sean visibles. */
export function rpmTargetRange(targets: RpmTarget[]): uPlot.Range.Function {
  return (_u, min, max) => {
    let lo = min ?? 0;
    let hi = max ?? 0;
    for (const t of targets) {
      lo = Math.min(lo, t.min);
      hi = Math.max(hi, t.max);
    }
    const pad = Math.max((hi - lo) * 0.08, 5);
    return [Math.max(0, lo - pad), hi + pad];
  };
}

/** Dibuja dos líneas (mínimo y máximo) por cada rango objetivo sobre la escala de RPM. */
export function rpmTargetsPlugin(scaleKey: string, targets: RpmTarget[]): uPlot.Plugin {
  return {
    hooks: {
      draw: [
        (u) => {
          if (!u.scales[scaleKey] || u.scales[scaleKey].min == null) return;
          const ctx = u.ctx;
          const { left, top, width, height } = u.bbox;
          const dpr = devicePixelRatio || 1;
          ctx.save();
          ctx.lineWidth = 1.5 * dpr;
          ctx.setLineDash([6 * dpr, 4 * dpr]);
          ctx.font = `700 ${7 * dpr}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          for (const t of targets) {
            for (const v of [t.min, t.max]) {
              const y = Math.round(u.valToPos(v, scaleKey, true));
              if (y < top || y > top + height) continue;
              ctx.strokeStyle = t.color;
              ctx.fillStyle = t.color;
              ctx.beginPath();
              ctx.moveTo(left, y);
              ctx.lineTo(left + width, y);
              ctx.stroke();
              const text = `${t.name} ${v}`;
              const pad = 2 * dpr;
              const tw = ctx.measureText(text).width;
              const tx = left + width - 4 * dpr;
              const ty = y - 2 * dpr;
              ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
              ctx.fillRect(tx - tw - pad, ty - 7 * dpr - pad, tw + 2 * pad, 7 * dpr + 2 * pad);
              ctx.fillStyle = t.color;
              ctx.fillText(text, tx, ty);
            }
          }
          ctx.restore();
        },
      ],
    },
  };
}
