import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";

export interface ModalOverlayProps {
  onClose: () => void;
  labelledBy: string;
  children: ComponentChildren;
}

/** Shared bottom-sheet/dialog chrome for Settings and Sources modals. */
export function ModalOverlay({ onClose, labelledBy, children }: ModalOverlayProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss is a pointer-only convenience.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled globally above; the close button covers keyboard/AT users.
    <div class="sheet-overlay" onClick={onClose}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation here only guards the backdrop's click-to-dismiss, not an interactive action. */}
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
