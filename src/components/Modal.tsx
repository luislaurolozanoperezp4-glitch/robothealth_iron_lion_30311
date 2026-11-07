import { useEffect, type ReactNode } from 'react';

interface Props {
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  label: string;
}

/** Capa a pantalla completa. Se cierra con Esc (lo maneja App), con el botón o con doble clic en el fondo. */
export function Modal({ onClose, children, footer, label }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={label}>
      <div className="modal-bar">
        <span className="muted">{label} · <kbd>Esc</kbd> para cerrar</span>
        <button className="ghost" onClick={onClose} aria-label="Cerrar">✕ Cerrar</button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </div>
  );
}
