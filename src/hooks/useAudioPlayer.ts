import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerTrack } from '../types';

interface AudioPlayerOptions {
  onNext?: () => void;
  onPrevious?: () => void;
}

interface AudioPlayerState {
  playing: boolean;
  loading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  error: string;
}

const initialVolume = (() => {
  try {
    const raw = window.localStorage.getItem('flacplay:volume');
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0.8;
  } catch {
    return 0.8;
  }
})();

export function useAudioPlayer({ onNext, onPrevious }: AudioPlayerOptions = {}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onNextRef = useRef(onNext);
  const onPreviousRef = useRef(onPrevious);
  const [state, setState] = useState<AudioPlayerState>({
    playing: false,
    loading: false,
    currentTime: 0,
    duration: 0,
    volume: initialVolume,
    muted: false,
    error: '',
  });

  onNextRef.current = onNext;
  onPreviousRef.current = onPrevious;

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = initialVolume;
    audioRef.current = audio;

    const patch = (next: Partial<AudioPlayerState>) => setState((prev) => ({ ...prev, ...next }));

    const onTime = () => patch({ currentTime: audio.currentTime });
    const onDuration = () => patch({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
    const onPlay = () => patch({ playing: true, loading: false });
    const onPause = () => patch({ playing: false });
    const onWaiting = () => patch({ loading: true });
    const onCanPlay = () => patch({ loading: false });
    const onEnded = () => {
      patch({ playing: false, currentTime: 0 });
      onNextRef.current?.();
    };
    const onError = () =>
      patch({
        playing: false,
        loading: false,
        error: 'No se pudo reproducir esta vista previa. Prueba otra calidad o versión.',
      });

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('flacplay:volume', String(state.volume));
    } catch {
      // Ignore storage failures.
    }
    if (audioRef.current) audioRef.current.volume = state.muted ? 0 : state.volume;
  }, [state.volume, state.muted]);

  const load = useCallback(async (playerTrack: PlayerTrack, autoplay = true) => {
    const audio = audioRef.current;
    if (!audio) return;

    setState((prev) => ({
      ...prev,
      error: '',
      loading: true,
      currentTime: 0,
      duration: 0,
    }));

    audio.src = playerTrack.url;
    audio.load();

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: playerTrack.track.name,
        artist: playerTrack.track.artist,
        album: playerTrack.track.album_name,
        artwork: playerTrack.track.pic_url
          ? [{ src: playerTrack.track.pic_url, sizes: '512x512', type: 'image/jpeg' }]
          : [],
      });
    }

    if (!autoplay) return;

    try {
      await audio.play();
    } catch {
      setState((prev) => ({
        ...prev,
        playing: false,
        loading: false,
        error: 'El navegador bloqueó la reproducción automática. Pulsa reproducir.',
      }));
    }
  }, []);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setState((prev) => ({ ...prev, error: 'No se pudo iniciar la reproducción.' }));
      }
    } else {
      audio.pause();
    }
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(time, audio.duration || time));
    setState((prev) => ({ ...prev, currentTime: audio.currentTime }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clamped = Math.min(1, Math.max(0, volume));
    setState((prev) => ({ ...prev, volume: clamped, muted: clamped === 0 ? prev.muted : false }));
  }, []);

  const toggleMute = useCallback(() => {
    setState((prev) => ({ ...prev, muted: !prev.muted }));
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    setState((prev) => ({ ...prev, playing: false, currentTime: 0, duration: 0, loading: false }));
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => void toggle());
    navigator.mediaSession.setActionHandler('pause', () => void toggle());
    navigator.mediaSession.setActionHandler('previoustrack', () => onPreviousRef.current?.());
    navigator.mediaSession.setActionHandler('nexttrack', () => onNextRef.current?.());
    navigator.mediaSession.setActionHandler('seekbackward', (event) => {
      const audio = audioRef.current;
      if (audio) seek(audio.currentTime - (event.seekOffset ?? 10));
    });
    navigator.mediaSession.setActionHandler('seekforward', (event) => {
      const audio = audioRef.current;
      if (audio) seek(audio.currentTime + (event.seekOffset ?? 10));
    });
    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
    };
  }, [toggle, seek]);

  return {
    ...state,
    load,
    toggle,
    seek,
    setVolume,
    toggleMute,
    stop,
  };
}
