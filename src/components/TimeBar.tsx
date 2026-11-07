import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from 'react';
import { BATTERY_COLUMN, BATTERY_LIMIT_V } from '../lib/channels';
import { formatTime, type Telemetry, type TimeRange } from '../lib/data';

interface Props {
  tlm: Telemetry;
  range: TimeRange;
  onChange: (r: TimeRange) => void;
  iron?: boolean;
}

type DragMode = 'start' | 'end' | 'move';

/** Barra de tiempo con dos manijas; la ventana seleccionada también se puede arrastrar. */
export function TimeBar({ tlm, range, onChange, iron }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ mode: DragMode; x0: number; r0: TimeRange } | null>(null);
  const { tMin, tMax } = tlm;
  const total = Math.max(tMax - tMin, 1e-9);
  const minSpan = total / 2000;

  const clamp = (r: TimeRange, mode: DragMode): TimeRange => {
    let [a, b] = r;
    if (mode === 'move') {
      const span = b - a;
      if (a < tMin) { a = tMin; b = a + span; }
      if (b > tMax) { b = tMax; a = b - span; }
      return [Math.max(a, tMin), Math.min(b, tMax)];
    }
    a = Math.max(tMin, Math.min(a, tMax));
    b = Math.max(tMin, Math.min(b, tMax));
    if (mode === 'start') a = Math.min(a, b - minSpan);
    else b = Math.max(b, a + minSpan);
    return [Math.max(a, tMin), Math.min(b, tMax)];
  };

  const pxToDt = (dx: number) => (dx / (trackRef.current?.clientWidth || 1)) * total;
  const pct = (t: number) => ((t - tMin) / total) * 100;

  const begin = (mode: DragMode) => (e: RPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, x0: e.clientX, r0: range };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = pxToDt(e.clientX - d.x0);
    const [a, b] = d.r0;
    if (d.mode === 'start') onChange(clamp([a + dt, b], 'start'));
    else if (d.mode === 'end') onChange(clamp([a, b + dt], 'end'));
    else onChange(clamp([a + dt, b + dt], 'move'));
  };
  const end = () => { drag.current = null; };

  // Clic en la pista fuera de la ventana: mueve la manija más cercana.
  const onTrackDown = (e: RPointerEvent) => {
    const el = trackRef.current!;
    const rect = el.getBoundingClientRect();
    const t = tMin + ((e.clientX - rect.left) / rect.width) * total;
    const mode: DragMode = Math.abs(t - range[0]) < Math.abs(t - range[1]) ? 'start' : 'end';
    const next = clamp(mode === 'start' ? [t, range[1]] : [range[0], t], mode);
    onChange(next);
    el.setPointerCapture(e.pointerId);
    drag.current = { mode, x0: e.clientX, r0: next };
  };

  const onKey = (mode: DragMode) => (e: RKeyboardEvent) => {
    const step = (e.shiftKey ? 0.1 : 0.01) * total;
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    const [a, b] = range;
    if (mode === 'start') onChange(clamp([a + dir * step, b], 'start'));
    else if (mode === 'end') onChange(clamp([a, b + dir * step], 'end'));
    else onChange(clamp([a + dir * step, b + dir * step], 'move'));
  };

  // Mini gráfica de batería de todo el archivo como referencia.
  useEffect(() => {
    const canvas = canvasRef.current;
    const track = trackRef.current;
    if (!canvas || !track) return;
    const draw = () => {
      const dpr = devicePixelRatio || 1;
      const w = track.clientWidth, h = track.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const v = tlm.cols[BATTERY_COLUMN];
      if (!v || tlm.rows < 2) return;
      let lo = BATTERY_LIMIT_V, hi = BATTERY_LIMIT_V;
      for (let i = 0; i < v.length; i++) { if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i]; }
      const pad = (hi - lo) * 0.1 || 0.1;
      lo -= pad; hi += pad;
      const yOf = (x: number) => canvas.height - ((x - lo) / (hi - lo)) * canvas.height;
      const cols = canvas.width;
      const mins = new Float64Array(cols).fill(Infinity);
      const maxs = new Float64Array(cols).fill(-Infinity);
      for (let i = 0; i < v.length; i++) {
        const c = Math.min(cols - 1, Math.floor(((tlm.time[i] - tMin) / total) * cols));
        if (v[i] < mins[c]) mins[c] = v[i];
        if (v[i] > maxs[c]) maxs[c] = v[i];
      }
      ctx.strokeStyle = iron ? 'rgba(255, 85, 0, 0.6)' : 'rgba(34, 197, 94, 0.55)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      for (let c = 0; c < cols; c++) {
        if (mins[c] === Infinity) continue;
        ctx.moveTo(c + 0.5, yOf(maxs[c]));
        ctx.lineTo(c + 0.5, yOf(mins[c]) + 0.5);
      }
      ctx.stroke();
      const y = yOf(BATTERY_LIMIT_V);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(track);
    return () => ro.disconnect();
  }, [tlm, tMin, total, iron]);

  const full = range[0] <= tMin && range[1] >= tMax;

  return (
    <div className="timebar">
      <div className="timebar-row">
        <NumField label="Start" value={range[0]} onCommit={(t) => onChange(clamp([t, range[1]], 'start'))} />
        <div
          className="track"
          ref={trackRef}
          onPointerDown={onTrackDown}
          onPointerMove={onMove}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <canvas ref={canvasRef} className="track-canvas" />
          <div className="track-dim" style={{ left: 0, width: `${pct(range[0])}%` }} />
          <div className="track-dim" style={{ left: `${pct(range[1])}%`, right: 0 }} />
          <div
            className="track-window"
            style={{ left: `${pct(range[0])}%`, width: `${pct(range[1]) - pct(range[0])}%` }}
            onPointerDown={begin('move')}
            tabIndex={0}
            role="slider"
            aria-label="Time window"
            aria-valuetext={`${formatTime(range[0])} to ${formatTime(range[1])}`}
            onKeyDown={onKey('move')}
          />
          {(['start', 'end'] as const).map((mode) => (
            <div
              key={mode}
              className={`handle ${mode}`}
              style={{ left: `${pct(mode === 'start' ? range[0] : range[1])}%` }}
              onPointerDown={begin(mode)}
              tabIndex={0}
              role="slider"
              aria-label={mode === 'start' ? 'Start' : 'End'}
              aria-valuemin={tMin}
              aria-valuemax={tMax}
              aria-valuenow={mode === 'start' ? range[0] : range[1]}
              onKeyDown={onKey(mode)}
            >
              <span className="handle-tip">{formatTime(mode === 'start' ? range[0] : range[1])}</span>
            </div>
          ))}
        </div>
        <NumField label="End" value={range[1]} onCommit={(t) => onChange(clamp([range[0], t], 'end'))} />
        <button className="ghost" disabled={full} onClick={() => onChange([tMin, tMax])} title="Show the whole file">
          All
        </button>
      </div>
      <div className="timebar-foot muted">
        Window: <strong>{formatTime(range[1] - range[0])}</strong> of {formatTime(total)} · Drag the handles or the
        window, or drag over any chart to zoom
      </div>
    </div>
  );
}

function NumField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(value.toFixed(2));
  const [editing, setEditing] = useState(false);
  const shown = editing ? text : value.toFixed(2);
  const commit = () => {
    setEditing(false);
    const v = parseFloat(text);
    if (Number.isFinite(v)) onCommit(v);
  };
  return (
    <label className="numfield">
      <span>{label}</span>
      <input
        type="number"
        step="0.1"
        value={shown}
        onFocus={() => { setText(value.toFixed(2)); setEditing(true); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <em>s</em>
    </label>
  );
}
