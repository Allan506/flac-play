import type { AppConfig } from '../types';
import { Modal } from './Modal';
import { SettingsIcon, SparkIcon } from './Icons';

export interface Preferences {
  reducedMotion: boolean;
  autoplayNext: boolean;
  saveHistory: boolean;
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
  onClearHistory: () => void;
  historyCount: number;
  config: AppConfig | null;
}

export function SettingsModal({
  open,
  onClose,
  preferences,
  onChange,
  onClearHistory,
  historyCount,
  config,
}: SettingsModalProps) {
  const patch = (next: Partial<Preferences>) => onChange({ ...preferences, ...next });

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline="FLAC PLAY · AJUSTES"
      title="A tu manera"
      description="Estas preferencias se guardan en este navegador y se aplican la próxima vez que abras FLAC Play."
      className="settings-modal"
      footer={
        <div className="modal-footer-row">
          <span className="modal-footer-note">v{config?.version ?? '2.0.0'} · sin cuenta · sin cookies de seguimiento</span>
          <div className="modal-footer-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                onChange({ reducedMotion: false, autoplayNext: true, saveHistory: true })
              }
            >
              Restablecer
            </button>
            <button type="button" className="primary-button" onClick={onClose}>
              Listo
            </button>
          </div>
        </div>
      }
    >
      <div className="settings-list">
        <label className="settings-row">
          <span className="settings-icon">
            <SparkIcon size={17} />
          </span>
          <span className="settings-copy">
            <strong>Reducir movimiento</strong>
            <small>Desactiva animaciones y desplazamientos suaves.</small>
          </span>
          <span className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={preferences.reducedMotion}
              onChange={(event) => patch({ reducedMotion: event.target.checked })}
            />
            <span aria-hidden="true" />
          </span>
        </label>

        <label className="settings-row">
          <span className="settings-icon">
            <SettingsIcon size={17} />
          </span>
          <span className="settings-copy">
            <strong>Reproducir la siguiente pista</strong>
            <small>Continúa con la cola cuando termina una vista previa.</small>
          </span>
          <span className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={preferences.autoplayNext}
              onChange={(event) => patch({ autoplayNext: event.target.checked })}
            />
            <span aria-hidden="true" />
          </span>
        </label>

        <label className="settings-row">
          <span className="settings-icon">
            <SparkIcon size={17} />
          </span>
          <span className="settings-copy">
            <strong>Guardar búsquedas recientes</strong>
            <small>Hasta 8 búsquedas en este dispositivo, sin enviarlas a ningún servidor.</small>
          </span>
          <span className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={preferences.saveHistory}
              onChange={(event) => patch({ saveHistory: event.target.checked })}
            />
            <span aria-hidden="true" />
          </span>
        </label>
      </div>

      <div className="settings-extra">
        <div>
          <strong>Historial local</strong>
          <p>
            {historyCount > 0
              ? `${historyCount} ${historyCount === 1 ? 'búsqueda guardada' : 'búsquedas guardadas'} en este navegador.`
              : 'Todavía no hay búsquedas guardadas.'}
          </p>
        </div>
        <button type="button" className="text-button" onClick={onClearHistory} disabled={historyCount === 0}>
          Borrar historial
        </button>
      </div>

      <div className="settings-about">
        <strong>Acerca de FLAC Play</strong>
        <p>
          Un buscador independiente para comparar lo que publican los catálogos de Kuwo y NetEase.
          No aloja audio. Las vistas previas y las descargas dependen de lo que cada fuente permita.
        </p>
        <p className="settings-about-meta">
          {config?.catalogs.length ?? 2} catálogos · {config?.pageSize ?? 20} resultados por página ·
          versión {config?.version ?? '2.0.0'}
        </p>
      </div>
    </Modal>
  );
}
