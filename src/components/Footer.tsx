import { BrandMark } from './Header';
import { ExternalIcon } from './Icons';

export function Footer({ version }: { version?: string }) {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <BrandMark />
        <span>FLAC PLAY</span>
        <span className="footer-separator">/</span>
        <span>v{version ?? '2.3.0'}</span>
      </div>

      <details className="disclaimer">
        <summary>Uso responsable</summary>
        <div className="disclaimer-popover">
          <p>
            FLAC Play es un buscador: no aloja audio ni elude protecciones de acceso. Los enlaces y
            las calidades provienen de los catálogos públicos de Kuwo, NetEase, Internet
            Archive, Jamendo y Wikimedia Commons.
          </p>
          <p>
            Descarga sólo contenido al que tengas derecho de acceso y respeta las condiciones de
            cada plataforma. Si una pista sólo está disponible como vista previa, la aplicación no
            genera un archivo incompleto.
          </p>
          <a href="https://www.kuwo.cn/" target="_blank" rel="noreferrer">
            Visitar Kuwo <ExternalIcon size={13} />
          </a>
          <a href="https://music.163.com/" target="_blank" rel="noreferrer">
            Visitar NetEase Music <ExternalIcon size={13} />
          </a>
        </div>
      </details>
    </footer>
  );
}
