import { useMemo, type CSSProperties } from 'react';
import type uPlot from 'uplot';
import { METRICS, columnFor, type MetricId, type MotorDef } from '../lib/channels';
import { buildAligned, type Telemetry, type TimeRange } from '../lib/data';
import { fmtValue, unitAxis, xAxis, xScale } from '../lib/chartOptions';
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
}

export function MotorChart({ tlm, motor, enabled, onToggle, range, onSelectRange, onExpand, expanded }: Props) {
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
    active.forEach((m, i) => {
      scales[m.id] = { auto: true };
      axes.push(unitAxis(m.id, m.unit, m.color, i === 0 ? 3 : 1, i === 0));
    });
    return {
      scales,
      axes,
      series: [
        { label: 'Tiempo', value: (_u, v) => (v == null ? '—' : `${v.toFixed(2)} s`) },
        ...active.map<uPlot.Series>((m) => ({
          label: `${m.label}`,
          scale: m.id,
          stroke: m.color,
          width: expanded ? 1.75 : 1.5,
          value: fmtValue(m.id === 'rpm' ? 1 : 2),
          points: { show: false },
        })),
      ],
      legend: { show: true, live: true },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, expanded]);

  const data = useMemo(
    () => buildAligned(tlm, active.map((m) => columnFor(motor, m.id)), range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tlm, motor, key, range],
  );

  return (
    <section
      className={`card chart-card${expanded ? ' expanded' : ''}`}
      onDoubleClick={onExpand}
      title={onExpand ? 'Doble clic para pantalla completa' : undefined}
    >
      <header className="card-head">
        <div className="card-title">
          <span className="badge" style={{ background: motor.color }} />
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
                style={{ '--c': m.color } as CSSProperties}
                disabled={disabled}
                aria-pressed={on}
                title={disabled ? 'Columna no encontrada en el CSV' : `Mostrar/ocultar ${m.unit}`}
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
          <UPlotChart options={options} optionsKey={`${key}|${expanded}`} data={data} onSelectRange={onSelectRange} />
        ) : (
          <div className="empty-chart">Selecciona RPM, A o A/s para graficar</div>
        )}
      </div>
    </section>
  );
}
