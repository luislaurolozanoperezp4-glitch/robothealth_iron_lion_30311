import { useRef, useState } from 'react';

const samples = import.meta.glob('../csv/*.csv', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
export const SAMPLE_FILES = Object.entries(samples).map(([path, url]) => ({ name: path.split('/').pop()!, url }));

interface Props {
  onFile: (file: File) => void;
  onSample: (name: string, url: string) => void;
  compact?: boolean;
}

/** Botón para cargar CSV + zona para soltar archivos. */
export function FileDrop({ onFile, onSample, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const input = (
    <input
      ref={inputRef}
      type="file"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = '';
      }}
    />
  );

  if (compact) {
    return (
      <>
        {input}
        <button className="primary" onClick={() => inputRef.current?.click()}>Load file</button>
      </>
    );
  }

  return (
    <div
      className={`dropzone${over ? ' over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      {input}
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
      </svg>
      <h2>Drag a telemetry file here</h2>
      <p className="muted">CSV, TSV, TXT, LOG, JSON, Excel (.xlsx), ZIP or .gz · Expected columns: time_s, battery_volts, fl_rpm, fl_current_a, fl_current_rate_aps, …</p>
      <button className="primary" onClick={() => inputRef.current?.click()}>Choose file</button>
      {SAMPLE_FILES.length > 0 && (
        <div className="samples">
          <span className="muted">or try an example:</span>
          {SAMPLE_FILES.map((s) => (
            <button key={s.name} className="ghost" onClick={() => onSample(s.name, s.url)}>{s.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}
