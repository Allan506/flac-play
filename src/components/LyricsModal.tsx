import { useEffect, useMemo, useRef, useState } from 'react';
import { getLyrics } from '../api';
import type { Platform, Track } from '../types';
import { findActiveLine, lyricsToPlainText, parseLrc } from '../lib/lrc';
import { formatDuration, sourceTrackUrl } from '../lib/format';
import { Modal } from './Modal';
import { CopyIcon, ExternalIcon, LoaderIcon, PlayIcon } from './Icons';

interface LyricsModalProps {
  open: boolean;
  onClose: () => void;
  track: Track | null;
  platform: Platform;
  currentTime: number;
  isCurrentTrack: boolean;
  onSeek: (time: number) => void;
  onPlay: () => void;
  onToast: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

export function LyricsModal({
  open,
  onClose,
  track,
  platform,
  currentTime,
  isCurrentTrack,
  onSeek,
  onPlay,
  onToast,
}: LyricsModalProps) {
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [follow, setFollow] = useState(true);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open || !track) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setRaw('');

    getLyrics(
      { platform, songid: track.id, time: track.time, sign: track.sign },
      controller.signal,
    )
      .then((lyrics) => {
        if (!controller.signal.aborted) setRaw(lyrics);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'No se pudo cargar la letra.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, track, platform]);

  const parsed = useMemo(() => parseLrc(raw), [raw]);
  const activeIndex = isCurrentTrack ? findActiveLine(parsed.lines, currentTime) : -1;

  useEffect(() => {
    if (!follow || activeIndex < 0) return;
    const node = lineRefs.current[activeIndex];
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, follow]);

  const copy = async () => {
    const text = parsed.synced ? lyricsToPlainText(parsed) : raw;
    try {
      await navigator.clipboard.writeText(text);
      onToast('Letra copiada al portapapeles.', 'success');
    } catch {
      onToast('El navegador no permitió copiar la letra.', 'error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline={`FLAC PLAY · LETRA · ${platform === 'kuwo' ? 'KUWO' : 'NETEASE'}`}
      title={track?.name ?? 'Letra'}
      description={
        track
          ? `${track.artist}${track.album_name ? ` · ${track.album_name}` : ''}`
          : 'Selecciona una pista para leer su letra.'
      }
      className="lyrics-modal"
      wide
      footer={
        <div className="modal-footer-row">
          <span className="modal-footer-note">
            {parsed.synced
              ? isCurrentTrack
                ? 'La línea activa se resalta mientras suena la pista.'
                : 'Pulsa una línea para saltar a ese punto cuando suene esta pista.'
              : 'La fuente no publicó marcas de tiempo para esta letra.'}
          </span>
          <div className="modal-footer-actions">
            {track && !isCurrentTrack ? (
              <button type="button" className="secondary-button" onClick={onPlay}>
                <PlayIcon size={15} /> Escuchar
              </button>
            ) : null}
            <button type="button" className="secondary-button" onClick={copy} disabled={!raw}>
              <CopyIcon size={15} /> Copiar
            </button>
            {track ? (
              <a
                className="secondary-button secondary-link"
                href={sourceTrackUrl(platform, track)}
                target="_blank"
                rel="noreferrer"
              >
                Fuente <ExternalIcon size={14} />
              </a>
            ) : null}
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="lyrics-loading">
          <LoaderIcon size={20} /> Buscando la letra en el catálogo…
        </div>
      ) : error ? (
        <div className="lyrics-empty">
          <strong>No se pudo cargar la letra</strong>
          <p>{error}</p>
        </div>
      ) : !parsed.lines.length ? (
        <div className="lyrics-empty">
          <strong>La fuente no publicó la letra de esta pista.</strong>
          <p>Puedes abrir la ficha original para comprobar si está disponible allí.</p>
        </div>
      ) : (
        <>
          {parsed.meta.ti || parsed.meta.ar ? (
            <div className="lyrics-meta">
              {parsed.meta.ti ? <span>{parsed.meta.ti}</span> : null}
              {parsed.meta.ar ? <span>{parsed.meta.ar}</span> : null}
            </div>
          ) : null}
          <div className="lyrics-scroll" role="region" aria-label="Letra de la canción" tabIndex={0}>
            {parsed.lines.map((line, index) =>
              line.time < 0 ? (
                <p key={`${line.text}-${index}`} className="lyric-line lyric-unsynced">
                  {line.text}
                </p>
              ) : (
                <button
                  key={`${line.time}-${index}`}
                  ref={(node) => {
                    lineRefs.current[index] = node;
                  }}
                  type="button"
                  className={`lyric-line ${index === activeIndex ? 'is-active' : ''}`}
                  onClick={() => isCurrentTrack && onSeek(line.time)}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  title={`${formatDuration(line.time)} · ${line.text}`}
                >
                  <span className="lyric-time">{formatDuration(line.time)}</span>
                  <span>{line.text || '…'}</span>
                </button>
              ),
            )}
          </div>
          <label className="lyrics-follow">
            <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
            Seguir la línea activa
          </label>
        </>
      )}
    </Modal>
  );
}
