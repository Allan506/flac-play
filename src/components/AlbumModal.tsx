import { useCallback, useEffect, useRef, useState } from 'react';
import { getAlbum } from '../api';
import type { AlbumInfo, Platform, Quality, Track } from '../types';
import { bestQuality, formatDuration, formatQuality, sourceAlbumUrl } from '../lib/format';
import { Modal } from './Modal';
import {
  DownloadIcon,
  ExternalIcon,
  LoaderIcon,
  LyricsIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
} from './Icons';

interface AlbumModalProps {
  open: boolean;
  onClose: () => void;
  albumId: string;
  platform: Platform;
  fallbackName: string;
  fallbackArtist: string;
  fallbackCover: string;
  currentTrackId: string;
  isPlaying: boolean;
  resolvingId: string;
  onPlay: (track: Track, quality: Quality) => void;
  onLyrics: (track: Track) => void;
  onDownload: (track: Track) => void;
  strictLossless?: boolean;
}

const PAGE_SIZE = 20;

export function AlbumModal({
  open,
  onClose,
  albumId,
  platform,
  fallbackName,
  fallbackArtist,
  fallbackCover,
  currentTrackId,
  isPlaying,
  resolvingId,
  onPlay,
  onLyrics,
  onDownload,
  strictLossless = false,
}: AlbumModalProps) {
  const [info, setInfo] = useState<AlbumInfo | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [descOpen, setDescOpen] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    setDescOpen(false);
  }, [albumId]);

  const loadPage = useCallback(
    async (nextPage: number, mode: 'replace' | 'append') => {
      const requestId = ++requestRef.current;
      if (mode === 'replace') {
        setLoading(true);
        setError('');
        setTracks([]);
        setInfo(null);
      } else {
        setLoadingMore(true);
      }

      try {
        const data = await getAlbum({
          platform,
          id: albumId,
          page: nextPage,
          size: PAGE_SIZE,
        });
        if (requestId !== requestRef.current) return;

        setInfo(data.info);
        setTotal(data.total);
        setPage(data.page);
        setHasMore(data.hasMore);
        setTracks((previous) => {
          const merged = mode === 'append' ? [...previous, ...data.list] : data.list;
          const seen = new Set<string>();
          return merged.filter((track) => {
            if (seen.has(track.id)) return false;
            seen.add(track.id);
            return true;
          });
        });
      } catch (caught) {
        if (requestId !== requestRef.current) return;
        setError(caught instanceof Error ? caught.message : 'No se pudo abrir el álbum.');
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [albumId, platform],
  );

  useEffect(() => {
    if (!open) return;
    if (!albumId || albumId === '0') {
      requestRef.current += 1;
      setInfo(null);
      setTracks([]);
      setTotal(0);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      setError('La fuente no publicó un álbum válido para esta pista.');
      return;
    }
    void loadPage(1, 'replace');
    return () => {
      requestRef.current += 1;
    };
  }, [open, albumId, loadPage]);

  const cover = info?.pic_url || fallbackCover;
  const firstPlayable = tracks.find((track) =>
    strictLossless
      ? track.minfo.some((item) => item.format === 'flac')
      : track.minfo.length > 0,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline={`FLAC PLAY · ÁLBUM · ${platform === 'kuwo' ? 'KUWO' : 'NETEASE'}`}
      title={info?.name || fallbackName || 'Álbum'}
      description={info ? `${info.artist}${info.release_date ? ` · ${info.release_date}` : ''}` : fallbackArtist}
      className="album-modal"
      wide
      footer={
        <div className="modal-footer-row">
          <span className="modal-footer-note">
            {total > 0 ? `${total} ${total === 1 ? 'pista' : 'pistas'} en el álbum` : 'Cargando el álbum…'}
          </span>
          <div className="modal-footer-actions">
            {firstPlayable ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const quality = strictLossless
                    ? (firstPlayable.minfo.find((item) => item.format === 'flac') ?? null)
                    : bestQuality(firstPlayable);
                  if (quality) onPlay(firstPlayable, quality);
                }}
              >
                <PlayIcon size={15} /> Reproducir
              </button>
            ) : null}
            <a
              className="secondary-button secondary-link"
              href={sourceAlbumUrl(platform, albumId)}
              target="_blank"
              rel="noreferrer"
            >
              Ver en la fuente <ExternalIcon size={14} />
            </a>
          </div>
        </div>
      }
    >
      <div className="album-hero">
        <div className="album-hero-art">
          {cover ? <img src={cover} alt="" referrerPolicy="no-referrer" /> : <MusicIcon size={34} />}
        </div>
        <div className="album-hero-copy">
          <p className={descOpen ? 'album-desc is-open' : 'album-desc'}>
            {info?.description || 'Sin descripción disponible en la fuente.'}
          </p>
          {(info?.description?.length ?? 0) > 240 ? (
            <button type="button" className="text-button" onClick={() => setDescOpen(!descOpen)}>
              {descOpen ? 'Ver menos' : 'Ver descripción completa'}
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="lyrics-loading">
          <LoaderIcon size={20} /> Abriendo el álbum…
        </div>
      ) : error ? (
        <div className="lyrics-empty">
          <strong>No se pudo abrir el álbum</strong>
          <p>{error}</p>
          <button type="button" className="text-button" onClick={() => void loadPage(1, 'replace')}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <div className="album-track-heading">
            <span>#</span>
            <span>Pista</span>
            <span>Duración</span>
            <span>Acciones</span>
          </div>
          <ol className="album-track-list">
            {tracks.map((track, index) => {
              const quality = strictLossless
                ? (track.minfo.find((item) => item.format === 'flac') ?? null)
                : bestQuality(track);
              const active = currentTrackId === track.id;
              return (
                <li key={`${track.id}-${index}`} className={`album-track-row ${active ? 'is-active' : ''}`}>
                  <span className="album-track-index">
                    {active && isPlaying ? <PauseIcon size={12} /> : String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="album-track-copy">
                    <strong title={track.name}>{track.name}</strong>
                    <span>{quality ? formatQuality(quality) : 'Sin audio disponible'}</span>
                  </div>
                  <span className="album-track-duration">{formatDuration(track.duration)}</span>
                  <div className="album-row-actions">
                    <button
                      type="button"
                      onClick={() => quality && onPlay(track, quality)}
                      disabled={!quality || resolvingId === track.id}
                      aria-label={`Reproducir ${track.name}`}
                    >
                      {resolvingId === track.id ? (
                        <LoaderIcon size={14} />
                      ) : active && isPlaying ? (
                        <PauseIcon size={14} />
                      ) : (
                        <PlayIcon size={14} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onLyrics(track)}
                      aria-label={`Ver letra de ${track.name}`}
                    >
                      <LyricsIcon size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownload(track)}
                      disabled={!quality}
                      aria-label={`Descargar ${track.name}`}
                    >
                      <DownloadIcon size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>

          {hasMore ? (
            <button
              type="button"
              className="load-more"
              onClick={() => void loadPage(page + 1, 'append')}
              disabled={loadingMore}
            >
              {loadingMore ? <LoaderIcon size={15} /> : null}
              {loadingMore ? 'Cargando…' : `Cargar más pistas (${tracks.length} de ${total})`}
            </button>
          ) : null}
        </>
      )}
    </Modal>
  );
}
