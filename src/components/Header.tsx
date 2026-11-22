import { SettingsIcon } from './Icons';

interface HeaderProps {
  onOpenSettings: () => void;
  onGoSearch: () => void;
  onGoCatalog: () => void;
}

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <b />
    </span>
  );
}

export function Header({ onOpenSettings, onGoSearch, onGoCatalog }: HeaderProps) {
  return (
    <header className="topbar">
      <a
        className="brand"
        href="/"
        onClick={(event) => {
          event.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        aria-label="FLAC Play, inicio"
      >
        <BrandMark />
        <span className="brand-name">
          FLAC<span>PLAY</span>
        </span>
      </a>

      <nav className="topbar-nav" aria-label="Navegación principal">
        <span className="live-pill">
          <span className="live-dot" />
          Buscador musical
        </span>
        <button type="button" className="nav-link" onClick={onGoSearch}>
          Buscar
        </button>
        <button type="button" className="nav-link" onClick={onGoCatalog}>
          Catálogos
        </button>
        <button type="button" className="settings-button" onClick={onOpenSettings}>
          <SettingsIcon size={16} />
          <span>Ajustes</span>
        </button>
      </nav>
    </header>
  );
}
