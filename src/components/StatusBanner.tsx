export interface BannerState {
  kind: "info" | "error";
  message: string;
}

export function StatusBanner({ banner }: { banner: BannerState | null }) {
  if (!banner) return null;

  return (
    <div class={`status-banner status-banner--${banner.kind}`} role="status" aria-live="polite">
      {banner.message}
    </div>
  );
}
