import { useState } from 'react';
import type { Platform, Quality, Track } from '../types';
import {
  formatDuration,
  formatQuality,
  sourceTrackUrl,
} from '../lib/format';
import {
  AlbumIcon,
  DownloadIcon,
  ExternalIcon,
  LoaderIcon,
  LyricsIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
} from './Icons';

interface TrackRowProps {
  track: Track;
  index: number;
  platform: Platform;
  active: boolean;
  playing: boolean;
  resolving: boolean;
  onPlay: (track: Track, quality: Quality) => void;
  onLyrics: (track: Track) => void;
  onAlbum: (track: Track) => void;
  onDownload: (track: Track) => void;
  strictLossless?: boolean;
}

export function TrackRow({
  track,
  index,
  platform,
  active,
  playing,
  resolving,
  onPlay,
  onLyrics,
  onAlbum,
  onDownload,
  strictLossless = false,
}: TrackRowProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const flacQualities = track.minfo.filter((quality) => quality.format === 'flac');
  const available = strictLossless ? flacQualities : track.minfo;
  const bestQuality = available[0];
  const canPlay = available.length > 0;
  const displayQualities = available.slice(0, 3);

  const play = () => {
    if (bestQuality) onPlay(track, bestQuality);
  };

  return (
    <li className={`track-row ${active ? 'track-row-active' : ''}`} aria-current={active || undefined}>
      <span className="track-position" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="track-cover-wrap">
        {track.pic_url && !coverFailed ? (
          <img
            className="track-cover"
            src={track.pic_url}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <span className="cover-fallback" aria-hidden="true">
            <MusicIcon size={22} />
          </span>
        )}
        <button
          type="button"
          className="cover-play"
          aria-label={
            active && playing ? `Pausar ${track.name}` : `Reproducir ${track.name}`
          }
          onClick={play}
          disabled={!canPlay || resolving}
        >
          {resolving ? (
            <LoaderIcon size={18} />
          ) : active && playing ? (
            <PauseIcon size={18} />
          ) : (
            <PlayIcon size={18} />
          )}
        </button>
      </div>

      <div className="track-info">
        <h3 title={track.name}>{track.name}</h3>
        <p title={`${track.artist}${track.album_name ? ` · ${track.album_name}` : ''}`}>
          {track.artist}
          {track.album_name ? (
            <>
              <span className="meta-dot" aria-hidden="true">
                ·
              </span>
              {track.album_name}
            </>
          ) : null}
        </p>
        <div className="track-inline-meta">
          <span>{formatDuration(track.duration)}</span>
          {track.minfo.some((quality) => quality.format === 'flac') ? (
            <span className="lossless-inline">FLAC</span>
          ) : null}
        </div>
      </div>

      <div className="track-duration" aria-label={`Duración ${formatDuration(track.duration)}`}>
        {formatDuration(track.duration)}
      </div>

      <div className="track-actions">
        <div className="quality-list" aria-label="Calidades disponibles">
          {displayQualities.length ? (
            displayQualities.map((quality, qualityIndex) => (
              <button
                key={`${quality.format}-${quality.bitrate}-${qualityIndex}`}
                type="button"
                className={`quality-chip ${quality.format === 'flac' ? 'quality-lossless' : ''}`}
                onClick={() => onPlay(track, quality)}
                disabled={resolving}
                title={`Escuchar en ${formatQuality(quality)}${quality.size ? ` · ${quality.size}` : ''}`}
                aria-label={`Escuchar ${track.name} en ${formatQuality(quality)}`}
              >
                {quality.format === 'flac' ? (
                  <>
                    <span className="quality-dot" aria-hidden="true" />
                    FLAC
                  </>
                ) : (
                  `${quality.bitrate} kb/s`
                )}
              </button>
            ))
          ) : (
            <span className="quality-empty">
              {strictLossless ? 'Sin FLAC verificado' : 'Sin audio'}
            </span>
          )}
        </div>

        <div className="track-action-links">
          <button
            type="button"
            className="row-action"
            onClick={() => onLyrics(track)}
            aria-label={`Ver la letra de ${track.name}`}
          >
            <LyricsIcon size={14} />
            <span className="row-action-label">Letra</span>
          </button>
          {track.album_id ? (
            <button
              type="button"
              className="row-action"
              onClick={() => onAlbum(track)}
              aria-label={`Ver el álbum de ${track.name}`}
            >
              <AlbumIcon size={14} />
              <span className="row-action-label">Álbum</span>
            </button>
          ) : null}
          <button
            type="button"
            className="row-action"
            onClick={() => onDownload(track)}
            disabled={!canPlay}
            aria-label={`Descargar ${track.name}`}
            title={
              !canPlay && strictLossless
                ? 'Esta pista no publica FLAC: desactiva «Solo FLAC verificado» en Ajustes para bajarla en MP3.'
                : undefined
            }
          >
            <DownloadIcon size={14} />
            <span className="row-action-label">Descarga</span>
          </button>
          <a
            className="row-action row-action-link"
            href={sourceTrackUrl(platform, track)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Abrir ${track.name} en ${platform === 'kuwo' ? 'Kuwo' : 'NetEase'}`}
          >
            <ExternalIcon size={14} />
            <span className="sr-only">Abrir en la fuente</span>
          </a>
        </div>
      </div>
    </li>
  );
}
