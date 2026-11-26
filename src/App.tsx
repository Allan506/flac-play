import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, getConfig, resolveTrack, searchTracks } from './api';
import { AlbumModal } from './components/AlbumModal';
import { DownloadModal } from './components/DownloadModal';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { MiniPlayer } from './components/MiniPlayer';
import { Modal } from './components/Modal';
import { PlayerCard } from './components/PlayerCard';
import { ResultsList } from './components/ResultsList';
import { SearchPanel } from './components/SearchPanel';
import { SettingsModal, type Preferences } from './components/SettingsModal';
import { Toast, type ToastKind, type ToastMessage } from './components/Toast';
import { LyricsModal } from './components/LyricsModal';
import { SparkIcon } from './components/Icons';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useDebounce } from './hooks/useDebounce';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useMediaQuery } from './hooks/useMediaQuery';
import { defaultFilters, countActiveFilters, filterAndSortTracks } from './lib/filters';
import { bestQuality, formatDuration } from './lib/format';
import { isPlatform } from './lib/platforms';
import type {
  AppConfig,
  FilterState,
  Platform,
  PlayerTrack,
  Quality,
  SearchPage,
  Track,
} from './types';

const FALLBACK_CONFIG: AppConfig = {
  version: '2.3.0',
  catalogs: [
    { value: 'kuwo', name: 'Kuwo', initial: 'K', lyrics: true, albums: true },
    { value: 'wyy', name: 'NetEase', initial: 'W', lyrics: true, albums: true },
    { value: 'archive', name: 'Internet Archive', initial: 'A', lyrics: false, albums: true },
    { value: 'jamendo', name: 'Jamendo', initial: 'J', lyrics: false, albums: false },
    { value: 'commons', name: 'Commons', initial: 'C', lyrics: false, albums: false },
  ],
  pageSize: 20,
  maxKeywordLength: 120,
  maxDownloadBytes: 240 * 1024 * 1024,
};

const DEFAULT_PREFERENCES: Preferences = {
  reducedMotion: false,
  autoplayNext: true,
  saveHistory: true,
  strictLossless: false,
};

interface AlbumTarget {
  albumId: string;
  platform: Platform;
  albumName: string;
  artist: string;
  coverUrl: string;
}

interface Target {
  track: Track;
  platform: Platform;
}

function readInitialState() {
  const params = new URLSearchParams(window.location.search);
  const catalogParam = params.get('catalog');
  const catalog: Platform = isPlatform(catalogParam) ? catalogParam : 'kuwo';
  const query = (params.get('q') ?? '').trim().slice(0, 120);
  const page = Math.max(1, Number(params.get('page')) || 1);
  return { catalog, query, page };
}

function scrollToId(id: string, smooth = true) {
  document.getElementById(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

export default function App() {
  const initial = useMemo(readInitialState, []);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const catalogs = config?.catalogs ?? FALLBACK_CONFIG.catalogs;
  const pageSize = config?.pageSize ?? FALLBACK_CONFIG.pageSize;
  const maxKeywordLength = config?.maxKeywordLength ?? FALLBACK_CONFIG.maxKeywordLength;

  const [platform, setPlatform] = useState<Platform>(initial.catalog);
  const [keyword, setKeyword] = useState(initial.query);
  const [submittedKeyword, setSubmittedKeyword] = useState(initial.query);
  const [page, setPage] = useState(initial.page);
  const [results, setResults] = useState<SearchPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [history, setHistory] = useLocalStorage<string[]>('flacplay:history', []);
  const [preferences, setPreferences] = useLocalStorage<Preferences>(
    'flacplay:preferences',
    DEFAULT_PREFERENCES,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [playerTrack, setPlayerTrack] = useState<PlayerTrack | null>(null);
  const [resolvingId, setResolvingId] = useState('');
  const [lyricsTarget, setLyricsTarget] = useState<Target | null>(null);
  const [albumTarget, setAlbumTarget] = useState<AlbumTarget | null>(null);
  const [downloadTarget, setDownloadTarget] = useState<Target | null>(null);
  const [mobilePlayerOpen, setMobilePlayerOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const requestedQueryRef = useRef('');
  const initialisedRef = useRef(false);

  const submittedRef = useRef(submittedKeyword);
  submittedRef.current = submittedKeyword;
  const platformRef = useRef(platform);
  platformRef.current = platform;
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const playerTrackRef = useRef<PlayerTrack | null>(playerTrack);
  playerTrackRef.current = playerTrack;

  const isDesktop = useMediaQuery('(min-width: 981px)');

  const filteredTracks = useMemo(
    () => filterAndSortTracks(results?.list ?? [], filters),
    [results, filters],
  );
  const filteredTracksRef = useRef(filteredTracks);
  filteredTracksRef.current = filteredTracks;

  const showToast = useCallback((text: string, kind: ToastKind = 'info') => {
    setToast({ id: Date.now() + Math.random(), kind, text });
  }, []);

  const updateUrl = useCallback((query: string, nextPlatform: Platform, nextPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (nextPlatform) params.set('catalog', nextPlatform);
    if (nextPage > 1) params.set('page', String(nextPage));
    const search = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
  }, []);

  const performSearch = useCallback(
    async (
      rawQuery: string,
      nextPage: number,
      nextPlatform: Platform,
      options: { updateUrl?: boolean; addHistory?: boolean; scroll?: boolean } = {},
    ) => {
      const query = rawQuery.trim().slice(0, maxKeywordLength);
      if (!query) return;

      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      requestedQueryRef.current = query;
      setLoading(true);
      setError('');
      setResults(null);
      setSubmittedKeyword(query);
      setPlatform(nextPlatform);
      setKeyword(query);

      try {
        const data = await searchTracks(
          { platform: nextPlatform, keyword: query, page: nextPage },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        setResults(data);
        setPage(data.page);
        setSubmittedKeyword(query);
        if (options.updateUrl !== false) updateUrl(query, nextPlatform, data.page);
        if (options.addHistory && preferencesRef.current.saveHistory) {
          setHistory((previous) =>
            [query, ...previous.filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(
              0,
              8,
            ),
          );
        }
        if (options.scroll) {
          window.setTimeout(() => scrollToId('catalog'), 120);
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        if (nextPlatform === 'wyy' && caught instanceof ApiError && caught.code === 'UPSTREAM_UNAVAILABLE') {
          try {
            const fallback = await searchTracks(
              { platform: 'kuwo', keyword: query, page: nextPage },
              controller.signal,
            );
            if (controller.signal.aborted) return;
            setPlatform('kuwo');
            setResults(fallback);
            setPage(fallback.page);
            setSubmittedKeyword(query);
            if (options.updateUrl !== false) updateUrl(query, 'kuwo', fallback.page);
            showToast('NetEase no responde ahora mismo. Mostrando resultados de Kuwo.', 'info');
            return;
          } catch {
            if (controller.signal.aborted) return;
          }
        }
        setError(caught instanceof Error ? caught.message : 'No se pudo completar la búsqueda.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [maxKeywordLength, setHistory, showToast, updateUrl],
  );

  useEffect(() => {
    const controller = new AbortController();
    getConfig(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setConfig(data);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setConfigError(caught instanceof Error ? caught.message : 'No se pudo cargar la configuración.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (initialisedRef.current) return;
    initialisedRef.current = true;
    if (initial.query) {
      void performSearch(initial.query, initial.page, initial.catalog, {
        updateUrl: false,
        addHistory: false,
      });
    }
  }, [initial, performSearch]);

  const debouncedKeyword = useDebounce(keyword, 550);
  useEffect(() => {
    if (!initialisedRef.current) return;
    const query = debouncedKeyword.trim();
    if (query.length < 2) return;
    if (query === submittedRef.current || query === requestedQueryRef.current) return;
    void performSearch(query, 1, platformRef.current, {
      updateUrl: true,
      addHistory: false,
    });
  }, [debouncedKeyword, performSearch]);

  useEffect(() => {
    const onPopState = () => {
      const state = readInitialState();
      if (state.query) {
        void performSearch(state.query, state.page, state.catalog, {
          updateUrl: false,
          addHistory: false,
        });
      } else {
        searchAbortRef.current?.abort();
        setKeyword('');
        setSubmittedKeyword('');
        setResults(null);
        setError('');
        setPage(1);
        setPlatform(state.catalog);
        updateUrl('', state.catalog, 1);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [performSearch, updateUrl]);

  useEffect(() => {
    document.title = submittedKeyword
      ? `${submittedKeyword} · FLAC Play`
      : 'FLAC Play — busca, compara y escucha';
  }, [submittedKeyword]);

  useEffect(() => {
    if (configError) showToast(configError, 'error');
  }, [configError, showToast]);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = preferences.reducedMotion ? 'true' : 'false';
  }, [preferences.reducedMotion]);

  useEffect(() => {
    if (isDesktop) setMobilePlayerOpen(false);
  }, [isDesktop]);

  const autoNextRef = useRef<() => void>(() => {});
  const previousRef = useRef<() => void>(() => {});
  const player = useAudioPlayer({
    onNext: () => autoNextRef.current(),
    onPrevious: () => previousRef.current(),
  });

  const strictRef = useRef(false);
  useEffect(() => {
    strictRef.current = preferences.strictLossless;
  }, [preferences.strictLossless]);

  const pickQuality = useCallback((track: Track): Quality | null => {
    if (!strictRef.current) return bestQuality(track);
    return track.minfo.find((item) => item.format === 'flac') ?? null;
  }, []);

  const playTrack = useCallback(
    async (track: Track, quality: Quality, platformOverride?: Platform) => {
      const targetPlatform = platformOverride ?? platformRef.current;
      setResolvingId(track.id);
      try {
        const resolved = await resolveTrack({
          platform: targetPlatform,
          songid: track.id,
          format: quality.format,
          bitrate: quality.bitrate,
          time: track.time,
          sign: track.sign,
          requireLossless: strictRef.current,
        });
        const next: PlayerTrack = { track, platform: targetPlatform, quality, url: resolved.url };
        setPlayerTrack(next);
        await player.load(next, true);
        if (
          resolved.duration > 0 &&
          track.duration > 0 &&
          resolved.duration < track.duration * 0.8 &&
          track.duration - resolved.duration > 15
        ) {
          showToast(
            `La fuente sólo ofrece una vista previa de ${formatDuration(resolved.duration)}.`,
            'info',
          );
        }
      } catch (caught) {
        showToast(
          caught instanceof Error ? caught.message : 'No se pudo preparar esta pista.',
          'error',
        );
      } finally {
        setResolvingId('');
      }
    },
    [player.load, showToast],
  );

  const handlePlay = useCallback(
    (track: Track, quality: Quality, platformOverride?: Platform) => {
      const current = playerTrackRef.current;
      const targetPlatform = platformOverride ?? platformRef.current;
      if (
        current &&
        current.track.id === track.id &&
        current.platform === targetPlatform &&
        current.quality.format === quality.format &&
        current.quality.bitrate === quality.bitrate
      ) {
        void player.toggle();
        return;
      }
      void playTrack(track, quality, targetPlatform);
    },
    [player.toggle, playTrack],
  );

  const handleNext = useCallback(() => {
    const current = playerTrackRef.current;
    const queue = filteredTracksRef.current;
    if (!queue.length) return;
    const index = current ? queue.findIndex((track) => track.id === current.track.id) : -1;
    const next = queue[(index + 1) % queue.length];
    const quality = pickQuality(next);
    if (quality) {
      void playTrack(next, quality, current?.platform ?? platformRef.current);
    }
  }, [playTrack]);

  const handlePrevious = useCallback(() => {
    const current = playerTrackRef.current;
    const queue = filteredTracksRef.current;
    if (!queue.length) return;
    const index = current ? queue.findIndex((track) => track.id === current.track.id) : 0;
    const previous = queue[(index - 1 + queue.length) % queue.length];
    const quality = pickQuality(previous);
    if (quality) {
      void playTrack(previous, quality, current?.platform ?? platformRef.current);
    }
  }, [playTrack]);

  autoNextRef.current = () => {
    if (preferencesRef.current.autoplayNext) handleNext();
  };
  previousRef.current = handlePrevious;

  const handleSubmit = () => {
    const query = keyword.trim();
    if (!query) {
      showToast('Escribe el nombre de una canción, artista o álbum para empezar.', 'error');
      searchInputRef.current?.focus();
      return;
    }
    void performSearch(query, 1, platform, {
      updateUrl: true,
      addHistory: true,
      scroll: true,
    });
  };

  const handlePlatformChange = (next: Platform) => {
    setPlatform(next);
    if (submittedRef.current) {
      void performSearch(submittedRef.current, 1, next, {
        updateUrl: true,
        addHistory: false,
        scroll: false,
      });
    } else {
      updateUrl('', next, 1);
    }
  };

  const handleHistorySelect = (value: string) => {
    setKeyword(value);
    void performSearch(value, 1, platform, {
      updateUrl: true,
      addHistory: false,
      scroll: true,
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    showToast('Historial de búsquedas borrado.', 'success');
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || loading) return;
    void performSearch(submittedRef.current, nextPage, platform, {
      updateUrl: true,
      addHistory: false,
      scroll: true,
    });
  };

  const handleLyrics = (track: Track, platformOverride?: Platform) => {
    setLyricsTarget({ track, platform: platformOverride ?? platformRef.current });
    setAlbumTarget(null);
    setDownloadTarget(null);
  };

  const handleAlbum = (track: Track, platformOverride?: Platform) => {
    if (!track.album_id) {
      showToast('La fuente no publicó el álbum de esta pista.', 'info');
      return;
    }
    setAlbumTarget({
      albumId: track.album_id,
      platform: platformOverride ?? platformRef.current,
      albumName: track.album_name || 'Álbum completo',
      artist: track.artist,
      coverUrl: track.pic_url,
    });
    setLyricsTarget(null);
    setDownloadTarget(null);
  };

  const handleDownload = (track: Track, platformOverride?: Platform) => {
    if (!track.minfo.length) {
      showToast('Esta pista no tiene una calidad descargable.', 'error');
      return;
    }
    setDownloadTarget({ track, platform: platformOverride ?? platformRef.current });
    setLyricsTarget(null);
    setAlbumTarget(null);
  };

  const handlePlayFromLyrics = () => {
    if (!lyricsTarget) return;
    const quality = pickQuality(lyricsTarget.track);
    if (quality) void playTrack(lyricsTarget.track, quality, lyricsTarget.platform);
  };

  const isCurrentLyricsTrack = Boolean(
    lyricsTarget &&
      playerTrack &&
      lyricsTarget.track.id === playerTrack.track.id &&
      lyricsTarget.platform === playerTrack.platform,
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        Boolean(target?.matches('input, textarea, select')) || Boolean(target?.isContentEditable);
      const dialogOpen = Boolean(document.querySelector('[role="dialog"]'));

      if (event.key === '/' && !typing && !dialogOpen) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (dialogOpen) return;
      if (!playerTrackRef.current) return;
      if (event.code === 'Space' && !typing && !target?.matches('button, a, summary')) {
        event.preventDefault();
        void player.toggle();
      }
      if (event.key.toLowerCase() === 'm' && !typing) {
        event.preventDefault();
        player.toggleMute();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [player.toggle, player.toggleMute]);

  const activeFilterCount = countActiveFilters(filters);
  const playerIsPreview = Boolean(
    playerTrack &&
      player.duration > 0 &&
      playerTrack.track.duration > 0 &&
      player.duration < playerTrack.track.duration * 0.8 &&
      playerTrack.track.duration - player.duration > 15,
  );

  const playerCard = (
    <PlayerCard
      playerTrack={playerTrack}
      platform={playerTrack?.platform ?? null}
      playing={player.playing}
      loading={player.loading}
      currentTime={player.currentTime}
      duration={player.duration}
      volume={player.volume}
      muted={player.muted}
      error={player.error}
      queueLength={filteredTracks.length}
      onToggle={() => void player.toggle()}
      onSeek={player.seek}
      onVolume={player.setVolume}
      onToggleMute={player.toggleMute}
      onNext={handleNext}
      onPrevious={handlePrevious}
      onLyrics={() => playerTrack && handleLyrics(playerTrack.track, playerTrack.platform)}
      onDownload={() => playerTrack && handleDownload(playerTrack.track, playerTrack.platform)}
      onAlbum={() => playerTrack && handleAlbum(playerTrack.track, playerTrack.platform)}
    />
  );

  return (
    <div className={`app-shell ${preferences.reducedMotion ? 'reduce-motion' : ''}`}>
      <a className="skip-link" href="#main-content">
        Ir al contenido principal
      </a>

      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onGoSearch={() => {
          scrollToId('search');
          window.setTimeout(() => searchInputRef.current?.focus(), 350);
        }}
        onGoCatalog={() => scrollToId('catalog')}
      />

      <main id="main-content">
        <Hero catalogCount={catalogs.length} />

        <SearchPanel
          catalogs={catalogs}
          platform={platform}
          onPlatformChange={handlePlatformChange}
          keyword={keyword}
          onKeywordChange={setKeyword}
          onSubmit={handleSubmit}
          loading={loading}
          inputRef={searchInputRef}
          history={preferences.saveHistory ? history : []}
          onHistorySelect={handleHistorySelect}
          onClearHistory={handleClearHistory}
          filters={filters}
          onFiltersChange={setFilters}
          filtersOpen={filtersOpen}
          onToggleFilters={() => setFiltersOpen((open) => !open)}
          resultCount={results?.list.length ?? 0}
          maxKeywordLength={maxKeywordLength}
        />

        <div className="content-layout">
          <ResultsList
            results={results}
            filtered={filteredTracks}
            loading={loading}
            error={error}
            platform={platform}
            submittedKeyword={submittedKeyword}
            filters={filters}
            page={page}
            pageSize={pageSize}
            total={results?.total ?? 0}
            activeFilterCount={activeFilterCount}
            currentTrackId={playerTrack?.track.id ?? ''}
            isPlaying={player.playing}
            resolvingId={resolvingId}
            onRetry={() =>
              void performSearch(submittedRef.current, page, platform, {
                updateUrl: true,
                addHistory: false,
              })
            }
            onClearFilters={() => setFilters(defaultFilters)}
            onPlay={(track, quality) => handlePlay(track, quality, platform)}
            onLyrics={(track) => handleLyrics(track, platform)}
            onAlbum={(track) => handleAlbum(track, platform)}
            onDownload={(track) => handleDownload(track, platform)}
            strictLossless={preferences.strictLossless}
            onPageChange={handlePageChange}
            onSuggestion={(value) => {
              setKeyword(value);
              void performSearch(value, 1, platform, {
                updateUrl: true,
                addHistory: true,
                scroll: true,
              });
            }}
            onGoSearch={() => {
              scrollToId('search');
              searchInputRef.current?.focus();
            }}
          />

          <div className="listening-column">
            {playerCard}
            <div className="source-note">
              <SparkIcon size={17} />
              <div>
                <strong>Escucha con contexto</strong>
                <p>
                  Las calidades y la disponibilidad dependen de cada catálogo. Si una pista sólo
                  existe como vista previa, lo verás antes de descargar.
                </p>
              </div>
            </div>
            {playerIsPreview ? (
              <div className="preview-footnote" role="status">
                Vista previa detectada: {formatDuration(player.duration)} de{' '}
                {formatDuration(playerTrack?.track.duration ?? 0)}.
              </div>
            ) : null}
          </div>
        </div>
      </main>

      <Footer version={config?.version} />

      {!isDesktop && playerTrack ? (
        <MiniPlayer
          playerTrack={playerTrack}
          playing={player.playing}
          loading={player.loading}
          onToggle={() => void player.toggle()}
          onExpand={() => setMobilePlayerOpen(true)}
        />
      ) : null}

      <Modal
        open={Boolean(playerTrack && mobilePlayerOpen && !isDesktop)}
        onClose={() => setMobilePlayerOpen(false)}
        overline="FLAC PLAY · CABINA MÓVIL"
        title="Ahora en escucha"
        hideHeading
        className="player-sheet"
      >
        {playerCard}
      </Modal>

      <LyricsModal
        open={Boolean(lyricsTarget)}
        onClose={() => setLyricsTarget(null)}
        track={lyricsTarget?.track ?? null}
        platform={lyricsTarget?.platform ?? platform}
        currentTime={player.currentTime}
        isCurrentTrack={isCurrentLyricsTrack}
        onSeek={player.seek}
        onPlay={handlePlayFromLyrics}
        onToast={showToast}
      />

      <AlbumModal
        open={Boolean(albumTarget)}
        onClose={() => setAlbumTarget(null)}
        albumId={albumTarget?.albumId ?? ''}
        platform={albumTarget?.platform ?? platform}
        fallbackName={albumTarget?.albumName ?? ''}
        fallbackArtist={albumTarget?.artist ?? ''}
        fallbackCover={albumTarget?.coverUrl ?? ''}
        currentTrackId={playerTrack?.track.id ?? ''}
        isPlaying={player.playing}
        resolvingId={resolvingId}
        onPlay={(track, quality) => handlePlay(track, quality, albumTarget?.platform ?? platform)}
        onLyrics={(track) => handleLyrics(track, albumTarget?.platform ?? platform)}
        onDownload={(track) => handleDownload(track, albumTarget?.platform ?? platform)}
        strictLossless={preferences.strictLossless}
      />

      <DownloadModal
        open={Boolean(downloadTarget)}
        onClose={() => setDownloadTarget(null)}
        track={downloadTarget?.track ?? null}
        platform={downloadTarget?.platform ?? platform}
        strictLossless={preferences.strictLossless}
        onToast={showToast}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        preferences={preferences}
        onChange={setPreferences}
        onClearHistory={handleClearHistory}
        historyCount={history.length}
        config={config}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
