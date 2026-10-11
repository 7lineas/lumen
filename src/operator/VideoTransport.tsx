import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { formatClock } from "@shared/clock";
import { videoPosition } from "@shared/stage";
import type { VideoPlayback } from "@shared/types";

interface Props {
  video: VideoPlayback;
  /** Length in seconds, null until the live monitor has read it. */
  duration: number | null;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onVolume: (volume: number) => void;
}

/** Play, pause, seek and volume for the video that is on the projector. */
export function VideoTransport({ video, duration, onToggle, onSeek, onVolume }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!video.playing) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [video.playing, video.startedAt, video.position]);

  const position = videoPosition(video, now, duration);
  const ended = duration != null && position >= duration - 0.25;
  const running = video.playing && !ended;

  return (
    <div className="lx-transport" aria-label="Control del video en pantalla" data-testid="video-transport">
      <button type="button" className="lx-sq" aria-label={running ? "Pausar video" : "Reproducir video"} onClick={onToggle}>
        {running ? <Pause /> : <Play />}
      </button>
      <button type="button" className="lx-sq" aria-label="Volver al inicio del video" title="Volver al inicio" onClick={() => onSeek(0)}>
        <RotateCcw />
      </button>
      <input
        type="range"
        className="lx-range"
        aria-label="Posición del video"
        min={0}
        max={duration ?? 0}
        step={0.1}
        disabled={duration == null}
        value={Math.min(position, duration ?? 0)}
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <span className="lx-time">{formatClock(position)} / {duration != null ? formatClock(duration) : "--:--"}</span>
      <label className="lx-volume" title="Volumen del proyector">
        <Volume2 aria-hidden />
        <input type="range" className="lx-range" aria-label="Volumen del video" min={0} max={1} step={0.05} value={video.volume} onChange={(event) => onVolume(Number(event.target.value))} />
      </label>
    </div>
  );
}
