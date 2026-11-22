import { HeadphonesIcon, SparkIcon } from './Icons';

interface HeroProps {
  catalogCount: number;
}

export function Hero({ catalogCount }: HeroProps) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow">
          <span className="eyebrow-line" />
          Buscador musical · alta fidelidad
        </p>
        <h1 id="hero-title">
          Encuentra tu canción.
          <br />
          <span>Escucha cada detalle.</span>
        </h1>
        <p className="hero-subtitle">
          Dos catálogos, una sola cabina. Compara calidades, lee la letra y descubre si la fuente
          ofrece la pista completa antes de descargar.
        </p>
        <div className="hero-facts">
          <span>
            <strong>{catalogCount}</strong> catálogos
          </span>
          <span className="hero-fact-divider" />
          <span>
            <HeadphonesIcon size={14} /> Vista previa integrada
          </span>
          <span className="hero-fact-divider" />
          <span>
            <SparkIcon size={14} /> Sin cuenta
          </span>
        </div>
      </div>

      <div className="hero-visual" aria-hidden="true">
        <div className="signal-disc">
          <span className="signal-ring signal-ring-1" />
          <span className="signal-ring signal-ring-2" />
          <span className="signal-ring signal-ring-3" />
          <span className="signal-core">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="signal-label signal-label-top">FLAC PLAY / SEÑAL HI-FI</span>
          <span className="signal-label signal-label-bottom">UNA BÚSQUEDA · OTRA PERSPECTIVA</span>
          <span className="signal-number">02</span>
        </div>
      </div>
    </section>
  );
}
