export interface CommonsRecording {
  url: string;
  file: string;
  source: "Wikimedia Commons";
}
/** Shared by ingestion, shard validation and playback; never accept arbitrary media origins. */
export function isCommonsRecording(value: unknown): value is CommonsRecording {
  if (!value || typeof value !== "object") return false;
  const audio = value as CommonsRecording;
  if (
    audio.source !== "Wikimedia Commons" ||
    typeof audio.file !== "string" ||
    !audio.file ||
    audio.file.length > 240 ||
    /[\r\n\t/#?]/.test(audio.file) ||
    typeof audio.url !== "string" ||
    audio.url.length > 1500
  )
    return false;
  try {
    const url = new URL(audio.url);
    return (
      url.protocol === "https:" &&
      url.hostname === "upload.wikimedia.org" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname.startsWith("/wikipedia/commons/") &&
      /\.(mp3|ogg|wav)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
export function recordingSourceUrl(audio: CommonsRecording): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(audio.file.replaceAll(" ", "_"))}`;
}
