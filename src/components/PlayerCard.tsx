import { useState, type CSSProperties } from 'react';
import type { PlayerTrack } from '../types';
import { formatDuration, formatQuality, sourceTrackUrl } from '../lib/format';
import {
  AlbumIcon,
  DownloadIcon,
  ExternalIcon,
  HeadphonesIcon,
  LoaderIcon,
  LyricsIcon,
  MuteIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
  WaveIcon,
} from './Icons';

interface PlayerCardProps {
  playerTrack: PlayerTrack | null;
  playing: boolean;
  loading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  error: string;
  queueLength: number;
  onToggle: () => void;
  onSeek: (time: number) => void;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onLyrics: () => void;
  onDownload: () => void;
  onAlbum: () => void;
}

export function PlayerCard({
  playerTrack,
  playing,
  loading,
  currentTime,
  duration,
  volume,
  muted,
  error,
  queueLength,
  onToggle,
  onSeek,
  onVolume,
  onToggleMute,
  onNext,
  onPrevious,
  onLyrics,
  onDownload,
  onAlbum,
}: PlayerCardProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const track = playerTrack?.track ?? null;
  const actualDuration = duration || track?.duration || 0;
  const isPreview =
    track !== null &&
    actualDuration > 0 &&
    track.duration > 0 &&
    actualDuration < track.duration * 0.8 &&
    track.duration - actualDuration > 15;
  const progress = actualDuration > 0 ? Math.min(100, (currentTime / actualDuration) * 100) : 0;
  const volumeProgress = muted ? 0 : Math.round(volume * 100);

  return (
    <aside className="player-card" aria-label="Reproductor">
      <div className="player-card-head">
        <span>
          <HeadphonesIcon size={15} /> Ahora en escucha
        </span>
        <span className={`player-status ${playing ? 'is-playing' : ''}`}>
          {playing ? 'Sonando' : loading ? 'Cargando' : track ? 'En pausa' : 'En espera'}
        </span>
      </div>

      <div className="album-art">
        {track?.pic_url && !coverFailed ? (
          <img
            src={track.pic_url}
            alt={`Portada de ${track.album_name || track.name}`}
            referrerPolicy="no-referrer"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <div className="art-placeholder" aria-hidden="true">
            <span className="art-corner art-corner-tl" />
            <span className="art-corner art-corner-br" />
            <WaveIcon className="art-rings" size={136} />
            <span className="art-artifact">
              <WaveIcon size={17} />
            </span>
            <span className="art-wordmark">
              SONIDO
              <br />
              <span>EN MOVIMIENTO</span>
            </span>
            <span className="art-counter">LADO A · 33⅓</span>
          </div>
        )}
        {playing ? (
          <span className="art-equalizer" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : null}
      </div>

      <div className="player-track-meta">
        <span className="player-eyebrow">
          {playerTrack ? formatQuality(playerTrack.quality) : 'CABINA DE ESCUCHA'}
        </span>
        <h3 title={track?.name}>{track?.name ?? 'Elige una pista'}</h3>
        <p title={track ? `${track.artist}${track.album_name ? ` · ${track.album_name}` : ''}` : undefined}>
          {track ? `${track.artist}${track.album_name ? ` · ${track.album_name}` : ''}` : 'La música comienza cuando tú decides.'}
        </p>
      </div>

      <div className="seek-block">
        <label className="sr-only" htmlFor="player-seek">
          Posición de reproducción
        </label>
        <input
          id="player-seek"
          className="seek-range"
          type="range"
          min={0}
          max={actualDuration || 1}
          step={0.1}
          value={Math.min(currentTime, actualDuration || 1)}
          onChange={(event) => onSeek(Number(event.target.value))}
          disabled={!track || !actualDuration}
          style={{ '--progress': `${progress}%` } as CSSProperties}
        />
        <div className="time-row">
          <span>{formatDuration(currentTime)}</span>
          <span>{formatDuration(actualDuration)}</span>
        </div>
      </div>

      <div className="player-controls">
        <button type="button" className="player-skip" onClick={onPrevious} disabled={!track} aria-label="Pista anterior">
          <SkipBackIcon size={19} />
        </button>
        <button
          type="button"
          className="player-play"
          onClick={onToggle}
          disabled={!track || loading}
          aria-label={playing ? 'Pausar' : 'Reproducir'}
        >
          {loading ? <LoaderIcon size={21} /> : playing ? <PauseIcon size={21} /> : <PlayIcon size={21} />}
        </button>
        <button type="button" className="player-skip" onClick={onNext} disabled={!track} aria-label="Pista siguiente">
          <SkipForwardIcon size={19} />
        </button>

        <div className="volume-control">
          <button type="button" className="volume-button" onClick={onToggleMute} aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
            {muted ? <MuteIcon size={17} /> : <VolumeIcon size={17} />}
          </button>
          <label className="sr-only" htmlFor="player-volume">
            Volumen
          </label>
          <input
            id="player-volume"
            className="volume-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={volumeProgress}
            onChange={(event) => onVolume(Number(event.target.value) / 100)}
            style={{ '--progress': `${volumeProgress}%` } as CSSProperties}
          />
        </div>
      </div>

      <div className="player-secondary">
        <button type="button" className="secondary-button" onClick={onLyrics} disabled={!track}>
          <LyricsIcon size={15} /> Letra
        </button>
        <button type="button" className="secondary-button" onClick={onDownload} disabled={!track}>
          <DownloadIcon size={15} /> Descarga
        </button>
        <button type="button" className="secondary-button" onClick={onAlbum} disabled={!track || !track.album_id}>
          <AlbumIcon size={15} /> Álbum
        </button>
        {track ? (
          <a
            className="secondary-button secondary-link"
            href={sourceTrackUrl(playerTrack?.platform ?? 'kuwo', track)}
            target="_blank"
            rel="noreferrer"
            aria-label="Abrir en la fuente"
          >
            <ExternalIcon size={15} />
          </a>
        ) : null}
      </div>

      {isPreview && track ? (
        <div className="preview-note" role="status">
          <strong>Vista previa de {formatDuration(actualDuration)}</strong>
          <span>
            La fuente sólo entrega un fragmento de esta pista. La descarga completa no está
            disponible.
          </span>
          <a href={sourceTrackUrl(playerTrack?.platform ?? 'kuwo', track)} target="_blank" rel="noreferrer">
            Escuchar en la fuente <ExternalIcon size={12} />
          </a>
        </div>
      ) : null}

      {error ? (
        <p className="player-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="player-caption">
        <WaveIcon size={14} />
        {track ? (
          <span>
            {queueLength > 0
              ? `${queueLength} ${queueLength === 1 ? 'pista' : 'pistas'} en la cola · `
              : ''}
            Los controles de audio aparecen al elegir una pista.
          </span>
        ) : (
          <span>Los controles de audio aparecerán al elegir una pista.</span>
        )}
      </div>
    </aside>
  );
}
