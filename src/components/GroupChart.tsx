import { useMemo, type CSSProperties } from 'react';
import type uPlot from 'uplot';
import type { DataGroup } from '../lib/discover';
import { buildAligned, type Telemetry, type TimeRange } from '../lib/data';
import { fmtValue, unitAxis, xAxis, xScale } from '../lib/chartOptions';
import { UPlotChart } from './UPlotChart';

interface Props {
  tlm: Telemetry;
  group: DataGroup;
  hidden: string[];
  onToggle: (col: string) => void;
  range: TimeRange;
  onSelectRange: (r: TimeRange) => void;
  onExpand?: () => void;
  expanded?: boolean;
  iron?: boolean;
}

const NEUTRAL = '#cbd5e1';

/** Gráfica genérica para columnas que no son batería ni motores: un botón por columna. */
export function GroupChart({ tlm, group, hidden, onToggle, range, onSelectRange, onExpand, expanded, iron }: Props) {
  const active = group.columns.filter((c) => !hidden.includes(c.col));
  const key = active.map((c) => c.col).join(',');
  const colorOf = (c: DataGroup['columns'][number]) => (iron ? c.ironColor : c.color);

  const options = useMemo<Omit<uPlot.Options, 'width' | 'height'>>(() => {
    const scales: uPlot.Scales = { x: xScale };
    const axes: uPlot.Axis[] = [xAxis()];
    const order: string[] = [];
    for (const c of active) if (!order.includes(c.scale)) order.push(c.scale);
    order.forEach((s, i) => {
      const cols = active.filter((c) => c.scale === s);
      scales[s] = { auto: true };
      const label = cols.map((c) => c.label).join(', ');
      axes.push(unitAxis(s, label.length > 28 ? `${label.slice(0, 27)}…` : label, cols.length === 1 ? colorOf(cols[0]) : NEUTRAL, i === 0 ? 3 : 1, i === 0));
    });
    return {
      scales,
      axes,
      series: [
        { label: 'Time', value: (_u, v) => (v == null ? '—' : `${v.toFixed(2)} s`) },
        ...active.map<uPlot.Series>((c) => ({
          label: c.label,
          scale: c.scale,
          stroke: colorOf(c),
          width: expanded ? 1.75 : 1.5,
          value: fmtValue(2),
          points: { show: false },
        })),
      ],
      legend: { show: true, live: true },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, expanded, iron]);

  const data = useMemo(
    () => buildAligned(tlm, active.map((c) => c.col), range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tlm, key, range],
  );

  return (
    <section
      className={`card chart-card${expanded ? ' expanded' : ''}`}
      onDoubleClick={onExpand}
      title={onExpand ? 'Double-click for full screen' : undefined}
    >
      <header className="card-head">
        <div className="card-title">
          <span className="badge" style={{ background: colorOf(group.columns[0]) }} />
          <strong>{group.label}</strong>
        </div>
        <div className="toggles" onDoubleClick={(e) => e.stopPropagation()}>
          {group.columns.map((c) => {
            const on = !hidden.includes(c.col);
            return (
              <button
                key={c.col}
                className={`toggle${on ? ' on' : ''}`}
                style={{ '--c': colorOf(c) } as CSSProperties}
                aria-pressed={on}
                title={`Show/hide ${c.col}`}
                onClick={() => onToggle(c.col)}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </header>
      <div className="chart-body">
        {active.length > 0 ? (
          <UPlotChart options={options} optionsKey={`grp|${group.id}|${key}|${expanded}|${iron}`} data={data} onSelectRange={onSelectRange} />
        ) : (
          <div className="empty-chart">Select a column to plot</div>
        )}
      </div>
    </section>
  );
}
