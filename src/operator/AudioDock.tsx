import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, X } from "lucide-react";
import { backgroundImageUrl } from "@shared/background-image";
import { formatClock } from "@shared/clock";
import { AudioIcon } from "./icons";

export interface AudioTrack {
  id: string;
  title: string;
  file: string;
}

interface Props {
  track: AudioTrack | null;
  onClose: () => void;
  onPlayingChange?: (playing: boolean) => void;
}

/**
 * Audio player of the operator window. It lives outside the workspaces, so a
 * track keeps playing while the operator moves between Bible, songs and media.
 */
export function AudioDock({ track, onClose, onPlayingChange }: Props) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [failed, setFailed] = useState(false);

  // A new track object is a request to play, also for the track already loaded.
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    setFailed(false);
    setTime(0);
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  }, [track]);

  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume, track]);

  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  if (!track) return null;

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  };

  return (
    <section
      className="lx-audio"
      aria-label="Reproductor de audio"
      data-testid="audio-dock"
    >
      <audio
        ref={ref}
        src={backgroundImageUrl(track.file)}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onDurationChange={(event) =>
          setDuration(
            Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0,
          )
        }
        onError={() => setFailed(true)}
      />
      <header>
        <span className="lx-mon-tag">
          <AudioIcon /> Audio
        </span>
        <span className="lx-mon-label" title={track.title}>
          {track.title}
        </span>
        <button
          type="button"
          className="lx-ghost"
          aria-label="Cerrar audio"
          title="Detener y cerrar"
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      {failed ? (
        <p className="lx-note" role="alert">
          No se pudo reproducir este archivo de audio.
        </p>
      ) : (
        <div className="lx-transport">
          <button
            type="button"
            className="lx-sq"
            aria-label={playing ? "Pausar audio" : "Reproducir audio"}
            onClick={toggle}
          >
            {playing ? <Pause /> : <Play />}
          </button>
          <input
            type="range"
            className="lx-range"
            aria-label="Posición del audio"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(time, duration || 0)}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (ref.current) ref.current.currentTime = next;
              setTime(next);
            }}
          />
          <span className="lx-time">
            {formatClock(time)} / {formatClock(duration)}
          </span>
          <label className="lx-volume" title="Volumen">
            <Volume2 aria-hidden />
            <input
              type="range"
              className="lx-range"
              aria-label="Volumen del audio"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </label>
        </div>
      )}
    </section>
  );
}
