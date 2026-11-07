import { useEffect, useLayoutEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { TimeRange } from '../lib/data';

interface Props {
  /** Opciones de uPlot sin tamaño; el tamaño se toma del contenedor. */
  options: Omit<uPlot.Options, 'width' | 'height'>;
  /** Cambia esta llave para reconstruir la gráfica (p. ej. al cambiar series/ejes). */
  optionsKey: string;
  data: ArrayLike<number>[];
  /** Arrastrar sobre la gráfica selecciona un rango de tiempo. */
  onSelectRange?: (r: TimeRange) => void;
}

/** Envoltorio de uPlot que se ajusta al tamaño de su contenedor. */
export function UPlotChart({ options, optionsKey, data, onSelectRange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const dataRef = useRef(data);
  const optsRef = useRef(options);
  const selectRef = useRef(onSelectRange);
  dataRef.current = data;
  optsRef.current = options;
  selectRef.current = onSelectRange;

  // (Re)crear la gráfica cuando cambia la configuración.
  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const fit = (u: uPlot) => {
      const legend = u.root.querySelector('.u-legend') as HTMLElement | null;
      const legendH = legend ? legend.offsetHeight : 0;
      const w = Math.max(80, Math.floor(el.clientWidth));
      const h = Math.max(60, Math.floor(el.clientHeight - legendH - 4));
      if (u.width !== w || u.height !== h) u.setSize({ width: w, height: h });
    };

    const opts = optsRef.current;
    const u = new uPlot(
      {
        ...opts,
        width: Math.max(80, el.clientWidth),
        height: Math.max(60, el.clientHeight - 30),
        cursor: {
          sync: { key: 'telemetria' },
          drag: { x: true, y: false, setScale: false },
          ...opts.cursor,
        },
        hooks: {
          ...opts.hooks,
          setSelect: [
            ...(opts.hooks?.setSelect ?? []),
            (u) => {
              const { left, width } = u.select;
              if (width > 4 && selectRef.current) {
                const a = u.posToVal(left, 'x');
                const b = u.posToVal(left + width, 'x');
                selectRef.current([Math.min(a, b), Math.max(a, b)]);
              }
              u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            },
          ],
        },
      },
      dataRef.current as uPlot.AlignedData,
      el,
    );
    plotRef.current = u;
    fit(u);

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => fit(u));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      u.destroy();
      plotRef.current = null;
    };
  }, [optionsKey]);

  // Actualizar datos sin reconstruir.
  useEffect(() => {
    plotRef.current?.setData(data as uPlot.AlignedData);
  }, [data]);

  return <div ref={wrapRef} className="uplot-wrap" />;
}
