import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import { ALL_MOTORS, CAROUSEL_PAGES, METRICS, type MetricId } from './lib/channels';
import { formatTime, type Telemetry, type TimeRange } from './lib/data';
import { loadTelemetryFile } from './lib/formats';
import { BatteryChart } from './components/BatteryChart';
import { MotorChart } from './components/MotorChart';
import { OverviewChart, type OverviewState } from './components/OverviewChart';
import { TimeBar } from './components/TimeBar';
import { Modal } from './components/Modal';
import { FileDrop } from './components/FileDrop';

const ALL_METRICS = METRICS.map((m) => m.id);
const initialMetrics = () => Object.fromEntries(ALL_MOTORS.map((m) => [m.id, [...ALL_METRICS]])) as Record<string, MetricId[]>;

export default function App() {
  const [tlm, setTlm] = useState<Telemetry | null>(null);
  const [range, setRange] = useState<TimeRange>([0, 1]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null); // 'battery' o id de motor
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [iron, setIron] = useState(false); // tema Iron Health (negro y naranja)

  useEffect(() => {
    document.documentElement.classList.toggle('theme-iron', iron);
    return () => document.documentElement.classList.remove('theme-iron');
  }, [iron]);
  const [overview, setOverview] = useState<OverviewState>({
    groups: ['battery', ...ALL_MOTORS.map((m) => m.id)],
    metrics: [...ALL_METRICS],
  });

  // Las gráficas usan el rango diferido para que la barra de tiempo se sienta fluida con archivos grandes.
  const chartRange = useDeferredValue(range);

  const load = useCallback(async (name: string, getData: () => Promise<ArrayBuffer>) => {
    setLoading(true);
    setError(null);
    try {
      const t = await loadTelemetryFile(name, await getData());
      setTlm(t);
      setRange([t.tMin, t.tMax]);
      setExpanded(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const onFile = (f: File) => load(f.name, () => f.arrayBuffer());
  const onSample = (name: string, url: string) => load(name, () => fetch(url).then((r) => r.arrayBuffer()));

  const toggleMetric = (motorId: string, m: MetricId) =>
    setMetrics((prev) => {
      const cur = prev[motorId];
      return { ...prev, [motorId]: cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m] };
    });

  const selectRange = useCallback((r: TimeRange) => setRange(r), []);

  // Atajos: A = vista general, Esc = cerrar, ← → = carrusel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setIron((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        if (expanded) setExpanded(null);
        else setOverviewOpen(false);
        return;
      }
      if (!tlm) return;
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setExpanded(null);
        setOverviewOpen((o) => !o);
        return;
      }
      if (!expanded && !overviewOpen && !t.closest('[role="slider"]')) {
        if (e.key === 'ArrowRight') setPage((p) => Math.min(CAROUSEL_PAGES.length - 1, p + 1));
        if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tlm, expanded, overviewOpen]);

  const timebar = tlm && <TimeBar tlm={tlm} range={range} onChange={setRange} iron={iron} />;
  const expandedMotor = ALL_MOTORS.find((m) => m.id === expanded);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          {iron ? (
            <img className="brand-logo" src={`${import.meta.env.BASE_URL}iron-health-logo.jpg`} alt="Logo Iron Lion" />
          ) : (
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
              <polyline points="4,20 10,20 13,10 18,24 21,15 28,15" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          )}
          <div>
            <h1>{iron ? 'Iron Health' : 'RobotHealth'}</h1>
            <span className="muted">Iron Lion 30311 · motor telemetry</span>
          </div>
        </div>
        {tlm && (
          <div className="fileinfo">
            <strong title={tlm.fileName}>{tlm.fileName}</strong>
            <span className="muted">
              {tlm.rows.toLocaleString('en-US')} samples ·{formatTime(tlm.tMax - tlm.tMin)}
            </span>
          </div>
        )}
        <div className="topbar-actions">
          {tlm && (
            <button className="ghost" onClick={() => setOverviewOpen(true)} title="Shortcut: A key">
              Overview <kbd>A</kbd>
            </button>
          )}
          {tlm && <FileDrop compact onFile={onFile} onSample={onSample} />}
        </div>
      </header>

      {error && <div className="error" role="alert">Could not read the file: {error}</div>}
      {loading && <div className="loading">Loading…</div>}
      {tlm && tlm.notes.length > 0 && !error && (
        <div className="notice" role="status">
          {tlm.notes.map((n) => <div key={n}>{n}</div>)}
        </div>
      )}

      {!tlm ? (
        <FileDrop onFile={onFile} onSample={onSample} />
      ) : (
        <main className="dashboard">
          <BatteryChart tlm={tlm} range={chartRange} onSelectRange={selectRange} onExpand={() => setExpanded('battery')} iron={iron} />

          <section className="carousel">
            <div className="carousel-head">
              <button className="arrow" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous">‹</button>
              <div className="carousel-title">
                <strong>{CAROUSEL_PAGES[page].title}</strong>
                <div className="dots">
                  {CAROUSEL_PAGES.map((p, i) => (
                    <button key={p.title} className={`dot${i === page ? ' on' : ''}`} onClick={() => setPage(i)} aria-label={p.title} />
                  ))}
                </div>
              </div>
              <button className="arrow" disabled={page === CAROUSEL_PAGES.length - 1} onClick={() => setPage(page + 1)} aria-label="Next">›</button>
            </div>
            <div className="carousel-viewport">
              <div className="carousel-track" style={{ transform: `translateX(-${page * 100}%)` }}>
                {CAROUSEL_PAGES.map((p, i) => (
                  <div key={p.title} className={`slide n${p.motors.length}`} aria-hidden={i !== page} inert={i !== page}>
                    {p.motors.map((motor) => (
                      <MotorChart
                        key={motor.id}
                        tlm={tlm}
                        motor={motor}
                        enabled={metrics[motor.id]}
                        onToggle={(m) => toggleMetric(motor.id, m)}
                        range={chartRange}
                        onSelectRange={selectRange}
                        onExpand={() => setExpanded(motor.id)}
                        iron={iron}                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="timebar-dock">{timebar}</div>
          <p className="hint muted">
            Double-click a chart for full screen · <kbd>A</kbd> overview · <kbd>←</kbd> <kbd>→</kbd> carousel
          </p>
        </main>
      )}

      {tlm && expanded === 'battery' && (
        <Modal label="Battery" onClose={() => setExpanded(null)} footer={timebar}>
          <BatteryChart tlm={tlm} range={chartRange} onSelectRange={selectRange} expanded iron={iron} />
        </Modal>
      )}
      {tlm && expandedMotor && (
        <Modal label={expandedMotor.label} onClose={() => setExpanded(null)} footer={timebar}>
          <MotorChart
            tlm={tlm}
            motor={expandedMotor}
            enabled={metrics[expandedMotor.id]}
            onToggle={(m) => toggleMetric(expandedMotor.id, m)}
            range={chartRange}
            onSelectRange={selectRange}
            expanded
            iron={iron}          />
        </Modal>
      )}
      {tlm && overviewOpen && !expanded && (
        <Modal label="Overview" onClose={() => setOverviewOpen(false)} footer={timebar}>
          <OverviewChart tlm={tlm} state={overview} onChange={setOverview} range={chartRange} onSelectRange={selectRange} iron={iron} />
        </Modal>
      )}
    </div>
  );
}
