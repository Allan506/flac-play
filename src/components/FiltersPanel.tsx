import type { FilterState } from '../types';
import { FilterIcon } from './Icons';

interface FiltersPanelProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onReset: () => void;
  resultCount: number;
}

export function FiltersPanel({ filters, onChange, onReset, resultCount }: FiltersPanelProps) {
  const patch = (next: Partial<FilterState>) => onChange({ ...filters, ...next });

  return (
    <div className="filters-panel" id="filters-panel">
      <div className="filters-heading">
        <div>
          <span className="filters-kicker">
            <FilterIcon size={13} /> Refina la selección
          </span>
          <p>Combina metadatos y calidad disponible.</p>
        </div>
        <button type="button" className="text-button" onClick={onReset}>
          Restablecer
        </button>
      </div>

      <div className="filters-grid">
        <label className="field">
          <span>Artista</span>
          <input
            type="search"
            value={filters.artist}
            onChange={(event) => patch({ artist: event.target.value })}
            placeholder="Filtrar artista"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>Álbum</span>
          <input
            type="search"
            value={filters.album}
            onChange={(event) => patch({ album: event.target.value })}
            placeholder="Filtrar álbum"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>Calidad publicada</span>
          <select
            value={filters.quality}
            onChange={(event) => patch({ quality: event.target.value as FilterState['quality'] })}
          >
            <option value="any">Cualquier calidad</option>
            <option value="hifi">Alta fidelidad · FLAC o MP3 ≥320</option>
            <option value="lossless">Sin pérdida · FLAC</option>
            <option value="mp3_320">MP3 · 320 kb/s o más</option>
          </select>
        </label>

        <label className="field">
          <span>Duración mínima</span>
          <select
            value={filters.minDuration}
            onChange={(event) => patch({ minDuration: Number(event.target.value) })}
          >
            <option value={0}>Sin límite</option>
            <option value={120}>2 minutos</option>
            <option value={180}>3 minutos</option>
            <option value={240}>4 minutos</option>
            <option value={300}>5 minutos</option>
          </select>
        </label>

        <label className="field">
          <span>Ordenar por</span>
          <select
            value={filters.sort}
            onChange={(event) => patch({ sort: event.target.value as FilterState['sort'] })}
          >
            <option value="catalog">Orden del catálogo</option>
            <option value="quality">Mejor calidad disponible</option>
            <option value="title">Título · A–Z</option>
            <option value="duration">Duración · más larga</option>
          </select>
        </label>
      </div>

      <p className="filters-scope">
        Los filtros se aplican a los {resultCount} resultados cargados. Usa la paginación para
        explorar el resto del catálogo.
      </p>
    </div>
  );
}
