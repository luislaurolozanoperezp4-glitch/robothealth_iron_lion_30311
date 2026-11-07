import { useMemo } from 'react';
import type uPlot from 'uplot';
import { BATTERY_COLOR, BATTERY_COLUMN, BATTERY_LIMIT_V } from '../lib/channels';
import { buildAligned, formatTime, rangeIndices, type Telemetry, type TimeRange } from '../lib/data';
import { batteryLimitPlugin, batteryRange, batteryStroke, fmtValue, unitAxis, xAxis, xScale } from '../lib/chartOptions';
import { UPlotChart } from './UPlotChart';

interface Props {
  tlm: Telemetry;
  range: TimeRange;
  onSelectRange: (r: TimeRange) => void;
  onExpand?: () => void;
  expanded?: boolean;
}

export function BatteryChart({ tlm, range, onSelectRange, onExpand, expanded }: Props) {
  const hasBattery = BATTERY_COLUMN in tlm.cols;

  const options = useMemo<Omit<uPlot.Options, 'width' | 'height'>>(
    () => ({
      scales: { x: xScale, v: { range: batteryRange } },
      axes: [xAxis(), unitAxis('v', 'V', BATTERY_COLOR, 3, true)],
      series: [
        { label: 'Tiempo', value: (_u, v) => (v == null ? '—' : `${v.toFixed(2)} s`) },
        {
          label: 'Batería (V)',
          scale: 'v',
          stroke: batteryStroke(BATTERY_COLOR, 'v'),
          fill: 'rgba(34, 197, 94, 0.06)',
          width: 2,
          value: fmtValue(2),
          points: { show: false },
        },
      ],
      plugins: [batteryLimitPlugin('v')],
      legend: { show: true, live: true },
    }),
    [],
  );

  const data = useMemo(() => buildAligned(tlm, [BATTERY_COLUMN], range), [tlm, range]);

  // Estadísticas del rango visible.
  const stats = useMemo(() => {
    const v = tlm.cols[BATTERY_COLUMN];
    if (!v) return null;
    const [i0, i1] = rangeIndices(tlm.time, range);
    let min = Infinity, max = -Infinity, sum = 0, below = 0;
    for (let i = i0; i <= i1; i++) {
      const x = v[i];
      if (x < min) min = x;
      if (x > max) max = x;
      sum += x;
      // tiempo por debajo del límite (integrando hacia la siguiente muestra)
      if (x < BATTERY_LIMIT_V && i < i1) below += tlm.time[i + 1] - tlm.time[i];
    }
    const span = tlm.time[i1] - tlm.time[i0];
    return { min, max, avg: sum / (i1 - i0 + 1), last: v[i1], below, pct: span > 0 ? (below / span) * 100 : 0 };
  }, [tlm, range]);

  const healthy = stats ? stats.min >= BATTERY_LIMIT_V : true;

  return (
    <section
      className={`card battery-card${expanded ? ' expanded' : ''}`}
      onDoubleClick={onExpand}
      title={onExpand ? 'Doble clic para pantalla completa' : undefined}
    >
      <header className="card-head">
        <div className="card-title">
          <span className="badge" style={{ background: BATTERY_COLOR }} />
          <strong>Batería</strong>
          <span className={`pill ${healthy ? 'ok' : 'bad'}`}>
            {healthy ? 'Saludable' : `Bajo ${BATTERY_LIMIT_V} V`}
          </span>
        </div>
        {stats && (
          <dl className="stats">
            <div><dt>Actual</dt><dd>{stats.last.toFixed(2)} V</dd></div>
            <div><dt>Mín</dt><dd className={stats.min < BATTERY_LIMIT_V ? 'bad' : ''}>{stats.min.toFixed(2)} V</dd></div>
            <div><dt>Prom</dt><dd>{stats.avg.toFixed(2)} V</dd></div>
            <div><dt>Máx</dt><dd>{stats.max.toFixed(2)} V</dd></div>
            <div>
              <dt>Bajo límite</dt>
              <dd className={stats.below > 0 ? 'bad' : ''}>{formatTime(stats.below)} ({stats.pct.toFixed(1)}%)</dd>
            </div>
          </dl>
        )}
      </header>
      <div className="chart-body">
        {hasBattery ? (
          <UPlotChart options={options} optionsKey={`bat|${expanded}`} data={data} onSelectRange={onSelectRange} />
        ) : (
          <div className="empty-chart">El CSV no tiene la columna “{BATTERY_COLUMN}”</div>
        )}
      </div>
    </section>
  );
}
