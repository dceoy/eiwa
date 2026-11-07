import { useEffect, useRef, useState } from "preact/hooks";
import { type CommonsRecording, isCommonsRecording, recordingSourceUrl } from "../recording";

export function RecordingPlayer({ recording }: { recording: CommonsRecording }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);
  if (!isCommonsRecording(recording)) return null;
  return (
    <div class="recording-player">
      <button
        type="button"
        class="btn btn-secondary"
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          setFailed(false);
          // Do not even set src until a user requests playback. No prefetch/cache.
          if (!audio.getAttribute("src")) audio.src = recording.url;
          audio.currentTime = 0;
          void audio.play().catch(() => setFailed(true));
        }}
      >
        Play recording (Commons)
      </button>
      {/* biome-ignore lint/a11y/useMediaCaption: pronunciation-only recording, the headword is the transcript. */}
      <audio
        ref={audioRef}
        preload="none"
        crossOrigin="anonymous"
        controls
        onError={() => setFailed(true)}
      />
      <small>
        Source:{" "}
        <a href={recordingSourceUrl(recording)} target="_blank" rel="noreferrer">
          Wikimedia Commons — file credits &amp; license
        </a>
        . Streams only when played.
      </small>
      {failed && <p role="status">Recording unavailable. Try the device voice (Listen) instead.</p>}
    </div>
  );
}
