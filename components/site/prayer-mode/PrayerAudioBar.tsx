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
    <div className="grid grid-cols-[auto_auto_minmax(160px,1fr)_auto_auto] items-center gap-[clamp(10px,1.4vw,18px)] rounded-full border border-gold/28 bg-[linear-gradient(180deg,rgba(205,164,90,.08),rgba(205,164,90,.025)),rgba(13,12,10,.86)] px-[18px] py-2.5 shadow-[inset_0_0_0_1px_rgba(233,203,132,.05)] max-[560px]:grid-cols-[auto_1fr_auto] max-[560px]:gap-2.5">
      <button
        type="button"
        className="grid size-[42px] place-items-center rounded-full border border-[rgba(214,168,79,.4)] bg-white/4 text-gold-light transition-colors duration-200 ease-linear hover:border-gold hover:text-foreground focus-visible:border-gold focus-visible:text-foreground"
        onClick={togglePlay}
        aria-label={isPlaying ? pauseLabel : playLabel}
      >
        {isPlaying ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
      </button>
      <span className="text-xs font-bold whitespace-nowrap text-muted-foreground max-[560px]:hidden" ref={timeLabelRef}>
        00:00 / 00:00
      </span>
      <div
        className="relative h-[5px] cursor-pointer rounded-full bg-white/16 after:absolute after:top-1/2 after:left-[var(--audio-thumb-left,0%)] after:size-4 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-gold-light after:shadow-[0_0_0_4px_rgba(214,168,79,.13)] after:content-['']"
        ref={progressTrackRef}
        onClick={handleSeek}
      >
        <div
          className="absolute inset-y-0 left-0 w-0 rounded-[inherit] bg-[linear-gradient(90deg,var(--color-gold-light),var(--color-gold))]"
          ref={progressFillRef}
        />
      </div>
      <button
        type="button"
        className="grid size-[42px] place-items-center rounded-full border border-[rgba(214,168,79,.4)] bg-white/4 text-gold-light transition-colors duration-200 ease-linear hover:border-gold hover:text-foreground focus-visible:border-gold focus-visible:text-foreground max-[560px]:hidden"
        onClick={toggleMute}
        aria-label={volumeLabel}
      >
        {isMuted || volume === 0 ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      </button>
      <input
        className="w-[118px] accent-gold max-[560px]:hidden"
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
