import type { FilterState, Platform, Quality, SearchPage, Track } from '../types';
import { formatDuration, pluralize } from '../lib/format';
import { EmptyState } from './EmptyState';
import { TrackSkeletonList } from './Skeleton';
import { TrackRow } from './TrackRow';
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from './Icons';

interface ResultsListProps {
  results: SearchPage | null;
  filtered: Track[];
  loading: boolean;
  error: string;
  platform: Platform;
  submittedKeyword: string;
  filters: FilterState;
  page: number;
  pageSize: number;
  total: number;
  activeFilterCount: number;
  currentTrackId: string;
  isPlaying: boolean;
  resolvingId: string;
  onRetry: () => void;
  onClearFilters: () => void;
  onPlay: (track: Track, quality: Quality) => void;
  onLyrics: (track: Track) => void;
  onAlbum: (track: Track) => void;
  onDownload: (track: Track) => void;
  onPageChange: (page: number) => void;
  onSuggestion: (value: string) => void;
  onGoSearch: () => void;
}

const SUGGESTIONS = ['晴天', 'Rosalía', 'Daft Punk', 'City Pop', 'FKA twigs'];

export function ResultsList({
  results,
  filtered,
  loading,
  error,
  platform,
  submittedKeyword,
  page,
  pageSize,
  total,
  activeFilterCount,
  currentTrackId,
  isPlaying,
  resolvingId,
  onRetry,
  onClearFilters,
  onPlay,
  onLyrics,
  onAlbum,
  onDownload,
  onPageChange,
  onSuggestion,
  onGoSearch,
}: ResultsListProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasResults = Boolean(results);
  const hasTracks = Boolean(results?.list.length);
  const isSourceEmpty = hasResults && !hasTracks;
  const isFilteredEmpty = hasTracks && filtered.length === 0;

  return (
    <section className="results-column" id="catalog" aria-labelledby="results-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            <span className="eyebrow-line" />
            02 / Catálogo
          </p>
          <h2 id="results-title">
            {submittedKeyword ? (
              <>
                Resultados para <span className="query-label">“{submittedKeyword}”</span>
              </>
            ) : (
              'Tu próxima canción empieza aquí'
            )}
          </h2>
        </div>
        {hasResults ? (
          <span className="result-count">
            {total.toLocaleString('es')} {pluralize(total, 'coincidencia', 'coincidencias')}
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="notice-error" role="alert">
          <span>{error}</span>
          <button type="button" className="text-button" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      ) : null}

      {!submittedKeyword && !hasResults ? (
        <EmptyState
          kicker="Sin prisa, sin ruido"
          title="¿Qué quieres escuchar?"
          description="Busca una canción, un artista o un álbum. Comparamos lo que cada catálogo publica: FLAC sin pérdida, MP3 320 o la única calidad disponible."
          suggestions={SUGGESTIONS}
          onSuggestion={onSuggestion}
          action={
            <button type="button" className="text-button empty-action" onClick={onGoSearch}>
              <SearchIcon size={15} /> Empezar a buscar
            </button>
          }
        />
      ) : loading && !hasResults ? (
        <TrackSkeletonList count={6} />
      ) : isSourceEmpty ? (
        <div className="filter-empty" role="status">
          <strong>La fuente no devolvió pistas para esta búsqueda.</strong>
          <span>
            {total > 0
              ? `La fuente declara ${total.toLocaleString('es')} coincidencias, pero no entregó ninguna pista en esta página. Prueba con el nombre de una canción o cambia de catálogo.`
              : 'Prueba con el nombre de una canción o combina artista y canción (por ejemplo, «Jay Chou 晴天»).'}
          </span>
          <button type="button" className="text-button" onClick={onGoSearch}>
            Cambiar búsqueda
          </button>
        </div>
      ) : isFilteredEmpty ? (
        <div className="filter-empty" role="status">
          <strong>No hay coincidencias con estos filtros.</strong>
          <span>Prueba a relajar los filtros o consulta otra página del catálogo.</span>
          <button type="button" className="text-button" onClick={onClearFilters}>
            Limpiar filtros
          </button>
        </div>
      ) : hasTracks ? (
        <>
          <div className="results-toolbar">
            <span>
              {filtered.length} de {results?.list.length ?? 0} pistas en esta página
            </span>
            {activeFilterCount > 0 ? (
              <button type="button" className="active-filter-pill" onClick={onClearFilters}>
                {activeFilterCount} {pluralize(activeFilterCount, 'filtro activo', 'filtros activos')}
                <span aria-hidden="true">×</span>
              </button>
            ) : null}
          </div>

          <ul
            className={`track-list ${loading ? 'is-refreshing' : ''}`}
            aria-label={`Resultados de ${platform === 'kuwo' ? 'Kuwo' : 'NetEase'}`}
            aria-busy={loading}
          >
            {filtered.map((track, index) => (
              <TrackRow
                key={`${track.id}-${index}`}
                track={track}
                index={index}
                platform={platform}
                active={currentTrackId === track.id}
                playing={isPlaying && currentTrackId === track.id}
                resolving={resolvingId === track.id}
                onPlay={onPlay}
                onLyrics={onLyrics}
                onAlbum={onAlbum}
                onDownload={onDownload}
              />
            ))}
          </ul>

          {total > pageSize ? (
            <nav className="pagination" aria-label="Paginación de resultados">
              <span>
                Página <strong>{page}</strong> de <strong>{totalPages.toLocaleString('es')}</strong>
                <span className="pagination-duration">
                  {' '}
                  · {formatDuration(filtered.reduce((sum, track) => sum + track.duration, 0))} en
                  esta página
                </span>
              </span>
              <div className="pagination-actions">
                <button
                  type="button"
                  onClick={() => onPageChange(page - 1)}
                  disabled={page <= 1 || loading}
                  aria-label="Página anterior"
                >
                  <ChevronLeftIcon size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages || loading}
                  aria-label="Página siguiente"
                >
                  <ChevronRightIcon size={17} />
                </button>
              </div>
            </nav>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
