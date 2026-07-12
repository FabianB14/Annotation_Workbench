import { useEffect, useRef, useState } from 'react';
import { getVideo } from '../services/videoStore';
import { Spinner } from './Shared';
import { VideoIcon } from './Icons';

interface Props {
  projectId: string;
  isPlaying: boolean;
  playbackSpeed: number;
  /**
   * Speed-correction factor S (source/recording). The media plays the (possibly
   * sped-up) recording, but all times exposed to the app are on the source
   * timeline: source_ms = media_ms * S. Setting playbackRate to 1/S makes the
   * recording play back at true 1x.
   */
  speedFactor: number;
  /** When set, seek to this SOURCE-timeline ms then clear it via onSeekProcessed. */
  seekToMs: number | null;
  onTimeUpdate: (ms: number) => void;
  onDuration: (ms: number) => void;
  onSeekProcessed: () => void;
  onEnded: () => void;
}

export default function VideoPlayer({
  projectId,
  isPlaying,
  playbackSpeed,
  speedFactor,
  seekToMs,
  onTimeUpdate,
  onDuration,
  onSeekProcessed,
  onEnded,
}: Props) {
  const s = speedFactor && speedFactor > 0 ? speedFactor : 1;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  // Load the video blob from IndexedDB and create an object URL.
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    getVideo(projectId)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setMissing(true);
          setLoading(false);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setMissing(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId]);

  // Play / pause
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.play().catch(() => {});
    else v.pause();
  }, [isPlaying, url]);

  // Speed: play the recording at 1/S so it runs at true 1x, scaled by the
  // user's chosen playback speed.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackSpeed / s;
  }, [playbackSpeed, s, url]);

  // Seek (seekToMs is a source-timeline value -> convert to media time).
  useEffect(() => {
    if (seekToMs == null || !videoRef.current) return;
    videoRef.current.currentTime = seekToMs / 1000 / s;
    onSeekProcessed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekToMs]);

  if (loading) {
    return (
      <div className="video-frame">
        <Spinner />
      </div>
    );
  }

  if (missing || !url) {
    return (
      <div className="video-frame">
        <div className="empty" style={{ padding: 16 }}>
          <VideoIcon size={40} />
          <div>Video not available in this browser.</div>
          <div className="muted">Re-upload it in Step 1 to enable playback.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="video-frame">
      <video
        ref={videoRef}
        src={url}
        playsInline
        onLoadedMetadata={(e) => onDuration(Math.round(e.currentTarget.duration * 1000 * s))}
        onTimeUpdate={(e) => onTimeUpdate(Math.round(e.currentTarget.currentTime * 1000 * s))}
        onEnded={onEnded}
      />
    </div>
  );
}
