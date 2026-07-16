'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';

type Props = {
  audioRef: RefObject<HTMLAudioElement | null>;
  playLabel: string;
  pauseLabel: string;
  volumeLabel: string;
  onBeforePlay?: () => void;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * The single shared transport bar for a prayer's audio — used for both plain
 * reading and prayer-mode viewing, so play/pause/seek/volume always act on
 * the one underlying <audio> element and stay in sync between the two.
 */
export function PrayerAudioBar({ audioRef, playLabel, pauseLabel, volumeLabel, onBeforePlay }: Props) {
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const progressTrackRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(() => audioRef.current?.volume ?? 1);
  const [isMuted, setIsMuted] = useState(() => audioRef.current?.muted ?? false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    function onPlay() {
      setIsPlaying(true);
    }
    function onPause() {
      setIsPlaying(false);
    }
    setIsPlaying(!audio.paused);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onPause);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onPause);
    };
  }, [audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let rafId = 0;
    function tick() {
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = `${formatTime(audio!.currentTime)} / ${formatTime(audio!.duration || 0)}`;
      }
      if (progressFillRef.current && audio!.duration) {
        const progress = Math.min(100, (audio!.currentTime / audio!.duration) * 100);
        progressFillRef.current.style.width = `${progress}%`;
        progressTrackRef.current?.style.setProperty('--audio-thumb-left', `${progress}%`);
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [audioRef]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      onBeforePlay?.();
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function toggleMute() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  }

  function handleSeek(event: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    const track = progressTrackRef.current;
    if (!audio || !track || !audio.duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  }

  function handleVolume(event: React.ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    setVolume(value);
    if (audioRef.current) {
      audioRef.current.volume = value;
      if (value > 0 && audioRef.current.muted) {
        audioRef.current.muted = false;
        setIsMuted(false);
      }
    }
  }

  return (
    <div className="prayer-audio-bar">
      <button type="button" className="prayer-audio-bar__play" onClick={togglePlay} aria-label={isPlaying ? pauseLabel : playLabel}>
        {isPlaying ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
      </button>
      <span className="prayer-audio-bar__time" ref={timeLabelRef}>00:00 / 00:00</span>
      <div className="prayer-audio-bar__progress" ref={progressTrackRef} onClick={handleSeek}>
        <div className="prayer-audio-bar__progress-fill" ref={progressFillRef} />
      </div>
      <button type="button" className="prayer-audio-bar__mute" onClick={toggleMute} aria-label={volumeLabel}>
        {isMuted || volume === 0 ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      </button>
      <input
        className="prayer-audio-bar__volume"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={handleVolume}
        aria-label={volumeLabel}
      />
    </div>
  );
}
