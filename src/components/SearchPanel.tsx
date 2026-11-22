import type { FormEvent, RefObject } from 'react';
import type { Catalog, FilterState, Platform } from '../types';
import { countActiveFilters } from '../lib/filters';
import { FiltersPanel } from './FiltersPanel';
import { CloseIcon, FilterIcon, SearchIcon, SparkIcon } from './Icons';

interface SearchPanelProps {
  catalogs: Catalog[];
  platform: Platform;
  onPlatformChange: (platform: Platform) => void;
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  onSubmit: () => void;
  loading: boolean;
  inputRef: RefObject<HTMLInputElement>;
  history: string[];
  onHistorySelect: (value: string) => void;
  onClearHistory: () => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  resultCount: number;
  maxKeywordLength: number;
}

export function SearchPanel({
  catalogs,
  platform,
  onPlatformChange,
  keyword,
  onKeywordChange,
  onSubmit,
  loading,
  inputRef,
  history,
  onHistorySelect,
  onClearHistory,
  filters,
  onFiltersChange,
  filtersOpen,
  onToggleFilters,
  resultCount,
  maxKeywordLength,
}: SearchPanelProps) {
  const activeFilters = countActiveFilters(filters);
  const selectedCatalog = catalogs.find((catalog) => catalog.value === platform);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <section className="search-panel" id="search" aria-labelledby="search-heading">
      <div className="search-panel-top">
        <span id="search-heading">
          <SparkIcon size={14} /> Encuentra tu siguiente escucha
        </span>
        <span className="search-index">01 / BÚSQUEDA</span>
      </div>

      <form className="search-form" onSubmit={handleSubmit} role="search">
        <label className="sr-only" htmlFor="catalog-select">
          Catálogo de música
        </label>
        <div className="platform-select">
          <span className="platform-badge" aria-hidden="true">
            {selectedCatalog?.initial ?? 'K'}
          </span>
          <select
            id="catalog-select"
            value={platform}
            onChange={(event) => onPlatformChange(event.target.value as Platform)}
          >
            {catalogs.map((catalog) => (
              <option key={catalog.value} value={catalog.value}>
                {catalog.name}
              </option>
            ))}
          </select>
        </div>

        <div className="search-input-wrap">
          <SearchIcon size={19} />
          <label className="sr-only" htmlFor="search-input">
            Canción, artista o álbum
          </label>
          <input
            ref={inputRef}
            id="search-input"
            type="search"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value.slice(0, maxKeywordLength))}
            placeholder="Canción, artista o álbum…"
            autoComplete="off"
            spellCheck={false}
            maxLength={maxKeywordLength}
            enterKeyHint="search"
          />
          {keyword ? (
            <button
              type="button"
              className="clear-search"
              onClick={() => onKeywordChange('')}
              aria-label="Borrar búsqueda"
            >
              <CloseIcon size={15} />
            </button>
          ) : null}
        </div>

        <button type="submit" className="search-button" disabled={loading || !keyword.trim()}>
          <SearchIcon size={17} />
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      <div className="search-foot">
        <span>
          <kbd>Enter</kbd> para buscar · <kbd>/</kbd> para enfocar
        </span>
        <span className="search-foot-right">
          <span className="catalog-selected">
            Catálogo: <strong>{selectedCatalog?.name ?? 'Kuwo'}</strong>
          </span>
          <button
            type="button"
            className={`filters-toggle ${filtersOpen ? 'is-open' : ''}`}
            onClick={onToggleFilters}
            aria-expanded={filtersOpen}
            aria-controls="filters-panel"
          >
            <FilterIcon size={15} />
            Filtros
            {activeFilters > 0 ? <span className="filter-count">{activeFilters}</span> : null}
          </button>
        </span>
      </div>

      {history.length > 0 ? (
        <div className="history-row" aria-label="Búsquedas recientes">
          <span className="history-label">Recientes</span>
          <div className="history-chips">
            {history.map((item) => (
              <button
                key={item}
                type="button"
                className="history-chip"
                onClick={() => onHistorySelect(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <button type="button" className="history-clear" onClick={onClearHistory}>
            Limpiar
          </button>
        </div>
      ) : null}

      {filtersOpen ? (
        <FiltersPanel
          filters={filters}
          onChange={onFiltersChange}
          onReset={() =>
            onFiltersChange({
              artist: '',
              album: '',
              quality: 'any',
              minDuration: 0,
              sort: 'catalog',
            })
          }
          resultCount={resultCount}
        />
      ) : null}
    </section>
  );
}
