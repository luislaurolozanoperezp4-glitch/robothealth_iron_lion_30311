import { useMemo, type CSSProperties } from 'react';
import type uPlot from 'uplot';
import {
  BATTERY_COLOR, BATTERY_COLUMN, IRON_BATTERY_COLOR, IRON_METRIC_COLORS, IRON_MOTOR_COLORS, IRON_NEUTRAL,
  METRICS, columnFor, type MetricId,
} from '../lib/channels';
import { buildAligned, type Telemetry, type TimeRange } from '../lib/data';
import { clusterScales, type Layout } from '../lib/discover';
import { batteryLimitPlugin, batteryRange, fmtValue, unitAxis, xAxis, xScale } from '../lib/chartOptions';
import { UPlotChart } from './UPlotChart';

export interface OverviewState {
  hidden: string[]; // ids de grupos ocultos ('battery', motores y grupos de datos)
  metrics: MetricId[];
}

interface Props {
  tlm: Telemetry;
  layout: Layout;
  state: OverviewState;
  onChange: (s: OverviewState) => void;
  range: TimeRange;
  onSelectRange: (r: TimeRange) => void;
  iron?: boolean;
}

interface SeriesSpec { col: string; label: string; color: string; scale: string; dash?: number[]; digits: number }

const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function OverviewChart({ tlm, layout, state, onChange, range, onSelectRange, iron }: Props) {
  const bcol = iron ? IRON_BATTERY_COLOR : BATTERY_COLOR;
  const mcol = (id: string, base: string) => (iron && IRON_MOTOR_COLORS[id]) || base;
  const visible = (id: string) => !state.hidden.includes(id);

  const motorButtons = [
    ...(layout.hasBattery ? [{ id: 'battery', short: 'Battery', color: bcol }] : []),
    ...layout.motors.map((m) => ({ id: m.id, short: m.short, color: mcol(m.id, m.color) })),
  ];
  const groupButtons = layout.groups.map((g) => ({ id: g.id, short: g.label, color: iron ? g.columns[0].ironColor : g.color }));

  const specs = useMemo<SeriesSpec[]>(() => {
    const out: SeriesSpec[] = [];
    if (visible('battery') && BATTERY_COLUMN in tlm.cols) {
      out.push({ col: BATTERY_COLUMN, label: 'Battery V', color: bcol, scale: 'v', digits: 2 });
    }
    for (const motor of layout.motors) {
      if (!visible(motor.id)) continue;
      for (const m of METRICS) {
        const col = columnFor(motor, m.id);
        if (!state.metrics.includes(m.id) || !(col in tlm.cols)) continue;
        out.push({ col, label: `${motor.short} ${m.label}`, color: mcol(motor.id, motor.color), scale: m.id, dash: m.dash, digits: m.id === 'rpm' ? 1 : 2 });
      }
    }
    // Otras columnas: escalas compartidas por magnitud parecida.
    const other = layout.groups.filter((g) => visible(g.id)).flatMap((g) => g.columns.map((c) => ({ g, c })));
    const clusters = clusterScales(tlm, other.map((o) => o.c.col));
    for (const { g, c } of other) {
      out.push({ col: c.col, label: g.columns.length > 1 ? `${g.label} ${c.label}` : g.label, color: iron ? c.ironColor : c.color, scale: `o${clusters.get(c.col)}`, digits: 2 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tlm, layout, state, bcol, iron]);

  const key = specs.map((s) => `${s.col}@${s.scale}`).join(',');

  const options = useMemo<Omit<uPlot.Options, 'width' | 'height'>>(() => {
    const units = new Set(specs.map((s) => s.scale));
    const scales: uPlot.Scales = { x: xScale };
    const axes: uPlot.Axis[] = [xAxis()];
    // Orden de ejes: RPM y A/s a la izquierda, A y V a la derecha, luego otros datos alternando.
    const layoutAxes: { id: string; unit: string; side: 1 | 3; color: string }[] = [
      { id: 'rpm', unit: 'RPM', side: 3, color: iron ? IRON_METRIC_COLORS.rpm : '#e2e8f0' },
      { id: 'aps', unit: 'A/s', side: 3, color: iron ? IRON_METRIC_COLORS.aps : '#cbd5e1' },
      { id: 'a', unit: 'A', side: 1, color: iron ? IRON_METRIC_COLORS.a : '#e2e8f0' },
      { id: 'v', unit: 'V', side: 1, color: bcol },
    ];
    const others = [...units].filter((u) => u.startsWith('o')).sort();
    others.forEach((u, i) => {
      const members = specs.filter((s) => s.scale === u);
      const label = members.map((s) => s.label).join(', ');
      layoutAxes.push({
        id: u,
        unit: label.length > 28 ? `${label.slice(0, 27)}…` : label,
        side: i % 2 === 0 ? 3 : 1,
        color: members.length === 1 ? members[0].color : iron ? IRON_NEUTRAL : '#cbd5e1',
      });
    });
    let grid = true;
    for (const ax of layoutAxes) {
      if (!units.has(ax.id)) continue;
      scales[ax.id] = ax.id === 'v' ? { range: batteryRange } : { auto: true };
      axes.push(unitAxis(ax.id, ax.unit, ax.color, ax.side, grid));
      grid = false;
    }
    return {
      scales,
      axes,
      series: [
        { label: 'Time', value: (_u, v) => (v == null ? '—' : `${v.toFixed(2)} s`) },
        ...specs.map<uPlot.Series>((s) => ({
          label: s.label,
          scale: s.scale,
          stroke: s.color,
          dash: s.dash,
          width: s.scale === 'v' ? 2 : 1.4,
          value: fmtValue(s.digits),
          points: { show: false },
        })),
      ],
      plugins: units.has('v') ? [batteryLimitPlugin('v')] : [],
      legend: { show: true, live: true },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, iron, bcol]);

  const data = useMemo(
    () => buildAligned(tlm, specs.map((s) => s.col), range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tlm, key, range],
  );

  const allIds = [...motorButtons, ...groupButtons].map((g) => g.id);
  const allMetrics = METRICS.map((m) => m.id);

  const row = (label: string, buttons: { id: string; short: string; color: string }[]) => (
    <div className="toggles">
      <span className="toggles-label">{label}</span>
      {buttons.map((g) => (
        <button
          key={g.id}
          className={`toggle${visible(g.id) ? ' on' : ''}`}
          style={{ '--c': g.color } as CSSProperties}
          aria-pressed={visible(g.id)}
          onClick={() => onChange({ ...state, hidden: toggleIn(state.hidden, g.id) })}
        >
          {g.short}
        </button>
      ))}
    </div>
  );

  return (
    <section className="card chart-card expanded overview">
      <header className="card-head overview-head">
        <div className="card-title">
          <strong>Overview</strong>
          <span className="muted">{specs.length} series · click the legend to hide a series</span>
        </div>
        <div className="overview-controls">
          {motorButtons.length > 0 && row('Motors', motorButtons)}
          {groupButtons.length > 0 && row('Data', groupButtons)}
          <div className="toggles">
            {layout.motors.length > 0 && (
              <>
                <span className="toggles-label">Metrics</span>
                {METRICS.map((m) => (
                  <button
                    key={m.id}
                    className={`toggle${state.metrics.includes(m.id) ? ' on' : ''}`}
                    style={{ '--c': iron ? IRON_NEUTRAL : '#e2e8f0' } as CSSProperties}
                    aria-pressed={state.metrics.includes(m.id)}
                    onClick={() => onChange({ ...state, metrics: toggleIn(state.metrics, m.id) })}
                  >
                    <span className={`dash-sample ${m.id}`} />
                    {m.label}
                  </button>
                ))}
                <span className="sep" />
              </>
            )}
            <button className="ghost" onClick={() => onChange({ hidden: [], metrics: allMetrics })}>All</button>
            <button className="ghost" onClick={() => onChange({ hidden: allIds, metrics: state.metrics })}>None</button>
          </div>
        </div>
      </header>
      <div className="chart-body">
        {specs.length > 0 ? (
          <UPlotChart options={options} optionsKey={`ov|${key}`} data={data} onSelectRange={onSelectRange} />
        ) : (
          <div className="empty-chart">Enable at least one series</div>
        )}
      </div>
    </section>
  );
}
