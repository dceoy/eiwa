import type { DictionarySource } from "../dict-types";
import { ModalOverlay } from "./ModalOverlay";

export interface SourcesModalProps {
  open: boolean;
  onClose: () => void;
  licenses: DictionarySource[];
}

export function SourcesModal({ open, onClose, licenses }: SourcesModalProps) {
  if (!open) return null;

  return (
    <ModalOverlay onClose={onClose} labelledBy="sources-modal-heading">
      <header class="sheet-header">
        <h2 id="sources-modal-heading">Sources &amp; licenses</h2>
        <button type="button" class="icon-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>

      <p class="settings-note">
        Dictionary facts are drawn from the sources below. AI-generated translation, nuance, and
        correction text is produced locally by a WebLLM model and is not itself a licensed
        dictionary source.
      </p>

      {licenses.length === 0 ? (
        <p class="settings-note">Dictionary data has not loaded yet.</p>
      ) : (
        <ul class="sources-list">
          {licenses.map((source) => (
            <li key={`${source.name}:${source.license}`}>
              <strong>{source.name}</strong> — {source.license}
              {source.url && (
                <>
                  {" "}
                  (<a href={source.url}>{source.url}</a>)
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <p class="settings-note">
        Eiwa's source code is licensed under AGPL-3.0. See the project repository for full license
        text.
      </p>
    </ModalOverlay>
  );
}
