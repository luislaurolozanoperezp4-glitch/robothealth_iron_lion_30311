import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { METRICS, type MetricId } from './lib/channels';
import { discoverLayout } from './lib/discover';
import { formatTime, type Telemetry, type TimeRange } from './lib/data';
import { loadTelemetryFile } from './lib/formats';
import { BatteryChart } from './components/BatteryChart';
import { MotorChart } from './components/MotorChart';
import { GroupChart } from './components/GroupChart';
import { OverviewChart, type OverviewState } from './components/OverviewChart';
import { TimeBar } from './components/TimeBar';
import { Modal } from './components/Modal';
import { FileDrop } from './components/FileDrop';

const ALL_METRICS = METRICS.map((m) => m.id);

export default function App() {
  const [tlm, setTlm] = useState<Telemetry | null>(null);
  const [range, setRange] = useState<TimeRange>([0, 1]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, MetricId[]>>({});
  const [groupHidden, setGroupHidden] = useState<Record<string, string[]>>({});
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null); // 'battery' o id de motor
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [iron, setIron] = useState(false); // tema Iron Health (negro y naranja)

  useEffect(() => {
    document.documentElement.classList.toggle('theme-iron', iron);
    return () => document.documentElement.classList.remove('theme-iron');
  }, [iron]);
  const [overview, setOverview] = useState<OverviewState>({ hidden: [], metrics: [...ALL_METRICS] });

  // Qué graficar según las columnas del archivo (motores conocidos, nuevos y otros datos).
  const layout = useMemo(() => (tlm ? discoverLayout(tlm) : null), [tlm]);
  const pages = layout?.pages ?? [];

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
      setPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const onFile = (f: File) => load(f.name, () => f.arrayBuffer());

  const toggleMetric = (motorId: string, m: MetricId) =>
    setMetrics((prev) => {
      const cur = prev[motorId] ?? ALL_METRICS;
      return { ...prev, [motorId]: cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m] };
    });

  const enabledFor = (motorId: string) => metrics[motorId] ?? ALL_METRICS;
  const toggleGroupCol = (groupId: string, col: string) =>
    setGroupHidden((prev) => {
      const cur = prev[groupId] ?? [];
      return { ...prev, [groupId]: cur.includes(col) ? cur.filter((x) => x !== col) : [...cur, col] };
    });

  const selectRange = useCallback((r: TimeRange) => setRange(r), []);

  // Atajos: A = vista general, Esc = cerrar, ← → = carrusel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : document.body;
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
        if (e.key === 'ArrowRight') setPage((p) => Math.min(pages.length - 1, p + 1));
        if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tlm, expanded, overviewOpen, pages.length]);

  const timebar = tlm && <TimeBar tlm={tlm} range={range} onChange={setRange} iron={iron} />;
  const expandedMotor = layout?.motors.find((m) => m.id === expanded);
  const expandedGroup = layout?.groups.find((g) => g.id === expanded);
  const curPage = Math.min(page, Math.max(0, pages.length - 1));

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
          {tlm && <FileDrop compact onFile={onFile} />}
        </div>
      </header>

      {error && <div className="error" role="alert">Could not read the file: {error}</div>}
      {loading && <div className="loading">Loading…</div>}
      {tlm && tlm.notes.length > 0 && !error && (
        <div className="notice" role="status">
          {tlm.notes.map((n) => <div key={n}>{n}</div>)}
        </div>
      )}

      {!tlm || !layout ? (
        <FileDrop onFile={onFile} />
      ) : (
        <main className="dashboard">
          {layout.hasBattery && (
            <BatteryChart tlm={tlm} range={chartRange} onSelectRange={selectRange} onExpand={() => setExpanded('battery')} iron={iron} />
          )}

          {pages.length > 0 ? (
            <section className="carousel">
              <div className="carousel-head">
                <button className="arrow" disabled={curPage === 0} onClick={() => setPage(curPage - 1)} aria-label="Previous">‹</button>
                <div className="carousel-title">
                  <strong>{pages[curPage].title}</strong>
                  <div className="dots">
                    {pages.map((p, i) => (
                      <button key={p.title} className={`dot${i === curPage ? ' on' : ''}`} onClick={() => setPage(i)} aria-label={p.title} />
                    ))}
                  </div>
                </div>
                <button className="arrow" disabled={curPage === pages.length - 1} onClick={() => setPage(curPage + 1)} aria-label="Next">›</button>
              </div>
              <div className="carousel-viewport">
                <div className="carousel-track" style={{ transform: `translateX(-${curPage * 100}%)` }}>
                  {pages.map((p, i) => (
                    <div key={p.title} className={`slide n${p.items.length}`} aria-hidden={i !== curPage} inert={i !== curPage}>
                      {p.items.map((item) =>
                        item.kind === 'motor' ? (
                          <MotorChart
                            key={item.motor.id}
                            tlm={tlm}
                            motor={item.motor}
                            enabled={enabledFor(item.motor.id)}
                            onToggle={(m) => toggleMetric(item.motor.id, m)}
                            range={chartRange}
                            onSelectRange={selectRange}
                            onExpand={() => setExpanded(item.motor.id)}
                            iron={iron}
                          />
                        ) : (
                          <GroupChart
                            key={item.group.id}
                            tlm={tlm}
                            group={item.group}
                            hidden={groupHidden[item.group.id] ?? []}
                            onToggle={(c) => toggleGroupCol(item.group.id, c)}
                            range={chartRange}
                            onSelectRange={selectRange}
                            onExpand={() => setExpanded(item.group.id)}
                            iron={iron}
                          />
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            !layout.hasBattery && <div className="error">The file has a time column but no other numeric columns to plot.</div>
          )}

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
            enabled={enabledFor(expandedMotor.id)}
            onToggle={(m) => toggleMetric(expandedMotor.id, m)}
            range={chartRange}
            onSelectRange={selectRange}
            expanded
            iron={iron}          />
        </Modal>
      )}
      {tlm && expandedGroup && (
        <Modal label={expandedGroup.label} onClose={() => setExpanded(null)} footer={timebar}>
          <GroupChart
            tlm={tlm}
            group={expandedGroup}
            hidden={groupHidden[expandedGroup.id] ?? []}
            onToggle={(c) => toggleGroupCol(expandedGroup.id, c)}
            range={chartRange}
            onSelectRange={selectRange}
            expanded
            iron={iron}
          />
        </Modal>
      )}
      {tlm && layout && overviewOpen && !expanded && (
        <Modal label="Overview" onClose={() => setOverviewOpen(false)} footer={timebar}>
          <OverviewChart tlm={tlm} layout={layout} state={overview} onChange={setOverview} range={chartRange} onSelectRange={selectRange} iron={iron} />
        </Modal>
      )}
    </div>
  );
}
