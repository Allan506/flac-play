import { useState } from 'react';
import type { PlayerTrack } from '../types';
import { LoaderIcon, PauseIcon, PlayIcon, ChevronDownIcon, WaveIcon } from './Icons';

interface MiniPlayerProps {
  playerTrack: PlayerTrack;
  playing: boolean;
  loading: boolean;
  onToggle: () => void;
  onExpand: () => void;
}

export function MiniPlayer({ playerTrack, playing, loading, onToggle, onExpand }: MiniPlayerProps) {
  const [coverFailed, setCoverFailed] = useState(false);

  return (
    <div className="mini-player" role="region" aria-label="Reproductor compacto">
      <button type="button" className="mini-cover" onClick={onExpand} aria-label="Abrir reproductor">
        {playerTrack.track.pic_url && !coverFailed ? (
          <img
            src={playerTrack.track.pic_url}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <WaveIcon size={20} />
        )}
      </button>
      <div className="mini-copy">
        <strong>{playerTrack.track.name}</strong>
        <span>{playerTrack.track.artist}</span>
      </div>
      <button
        type="button"
        className="mini-toggle"
        onClick={onToggle}
        aria-label={playing ? 'Pausar' : 'Reproducir'}
        disabled={loading}
      >
        {loading ? <LoaderIcon size={20} /> : playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
      </button>
      <button type="button" className="mini-expand" onClick={onExpand} aria-label="Expandir reproductor">
        <ChevronDownIcon size={18} />
      </button>
    </div>
  );
}
