import { useMemo, useState, type CSSProperties } from 'react';
import type uPlot from 'uplot';
import { IRON_METRIC_COLORS, IRON_MOTOR_COLORS, METRICS, RPM_TARGETS, columnFor, type MetricId, type MotorDef } from '../lib/channels';
import { buildAligned, type Telemetry, type TimeRange } from '../lib/data';
import { fmtValue, rpmTargetRange, rpmTargetsPlugin, unitAxis, xAxis, xScale } from '../lib/chartOptions';
import { UPlotChart } from './UPlotChart';

interface Props {
  tlm: Telemetry;
  motor: MotorDef;
  enabled: MetricId[];
  onToggle: (m: MetricId) => void;
  range: TimeRange;
  onSelectRange: (r: TimeRange) => void;
  onExpand?: () => void;
  expanded?: boolean;
  iron?: boolean;
}

export function MotorChart({ tlm, motor, enabled, onToggle, range, onSelectRange, onExpand, expanded, iron }: Props) {
  const [showTargets, setShowTargets] = useState(true);
  const available = useMemo(
    () => new Set(METRICS.filter((m) => columnFor(motor, m.id) in tlm.cols).map((m) => m.id)),
    [tlm, motor],
  );
  const active = METRICS.filter((m) => enabled.includes(m.id) && available.has(m.id));
  const key = active.map((m) => m.id).join(',');

  const options = useMemo<Omit<uPlot.Options, 'width' | 'height'>>(() => {
    // Cada unidad tiene su propio eje: el primero a la izquierda, los demás a la derecha.
    const axes: uPlot.Axis[] = [xAxis()];
    const scales: uPlot.Scales = { x: xScale };
    const targets = RPM_TARGETS[motor.id] ?? [];
    const drawTargets = showTargets && targets.length > 0 && active.some((m) => m.id === 'rpm');
    const colorOf = (m: (typeof METRICS)[number]) => (iron ? IRON_METRIC_COLORS[m.id] : m.color);
    active.forEach((m, i) => {
      scales[m.id] = m.id === 'rpm' && drawTargets ? { range: rpmTargetRange(targets) } : { auto: true };
      axes.push(unitAxis(m.id, m.unit, colorOf(m), i === 0 ? 3 : 1, i === 0));
    });
    return {
      scales,
      axes,
      plugins: drawTargets ? [rpmTargetsPlugin('rpm', targets)] : [],
      series: [
        { label: 'Time', value: (_u, v) => (v == null ? '—' : `${v.toFixed(2)} s`) },
        ...active.map<uPlot.Series>((m) => ({
          label: `${m.label}`,
          scale: m.id,
          stroke: colorOf(m),
          width: expanded ? 1.75 : 1.5,
          value: fmtValue(m.id === 'rpm' ? 1 : 2),
          points: { show: false },
        })),
      ],
      legend: { show: true, live: true },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, expanded, iron, showTargets]);

  const data = useMemo(
    () => buildAligned(tlm, active.map((m) => columnFor(motor, m.id)), range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tlm, motor, key, range],
  );

  return (
    <section
      className={`card chart-card${expanded ? ' expanded' : ''}`}
      onDoubleClick={onExpand}
      title={onExpand ? 'Double-click for full screen' : undefined}
    >
      <header className="card-head">
        <div className="card-title">
          {RPM_TARGETS[motor.id] && (
            <button
              className={`ghost target-toggle${showTargets ? ' on' : ''}`}
              onClick={() => setShowTargets((v) => !v)}
              aria-pressed={showTargets}
              title="Show or hide the target rate lines"
            >
              {showTargets ? 'Hide rate' : 'Show rate'}
            </button>
          )}
          <span className="badge" style={{ background: (iron && IRON_MOTOR_COLORS[motor.id]) || motor.color }} />
          <strong>{motor.short}</strong>
          {motor.short !== motor.label && <span className="muted">{motor.label}</span>}
        </div>
        <div className="toggles" onDoubleClick={(e) => e.stopPropagation()}>
          {METRICS.map((m) => {
            const on = enabled.includes(m.id);
            const disabled = !available.has(m.id);
            return (
              <button
                key={m.id}
                className={`toggle${on && !disabled ? ' on' : ''}`}
                style={{ '--c': iron ? IRON_METRIC_COLORS[m.id] : m.color } as CSSProperties}
                disabled={disabled}
                aria-pressed={on}
                title={disabled ? 'Column not found in the file' : `Show/hide ${m.unit}`}
                onClick={() => onToggle(m.id)}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </header>
      <div className="chart-body">
        {active.length > 0 ? (
          <UPlotChart options={options} optionsKey={`${key}|${expanded}|${iron}|${showTargets}`} data={data} onSelectRange={onSelectRange} />
        ) : (
          <div className="empty-chart">Select RPM, A or A/s to plot</div>
        )}
      </div>
    </section>
  );
}
