import { useState } from 'react';
import { KeyIcon, CloseIcon } from './Icons';

interface Props {
  apiKey: string;
  simulationMode: boolean;
  onSave: (key: string) => void;
  onClose: () => void;
}

export default function ApiKeyModal({ apiKey, simulationMode, onSave, onClose }: Props) {
  const [value, setValue] = useState(apiKey);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <KeyIcon size={20} className="primary-text" />
          <h2 className="h1 primary-text" style={{ flex: 1 }}>
            Gemini API Key
          </h2>
          <button className="icon-btn small" onClick={onClose}>
            <CloseIcon size={16} />
          </button>
        </div>

        <p className="muted">
          Paste your Google Gemini API key to enable live multimodal video annotation. The key is
          stored only in your browser (localStorage) and sent directly to Google's API. Get a free
          key at{' '}
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="primary-text"
          >
            aistudio.google.com/app/apikey
          </a>
          .
        </p>

        <div>
          <label className="field-label">API Key</label>
          <input
            className="text-input mono"
            type="password"
            placeholder="AIza..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </div>

        {simulationMode && (
          <p className="badge-amber">
            No valid key detected — the app is running in high-fidelity demo simulation mode. All
            steps work offline with sample data.
          </p>
        )}

        <div className="row">
          {apiKey && (
            <button
              className="btn btn-outline"
              onClick={() => {
                setValue('');
                onSave('');
              }}
            >
              Clear Key
            </button>
          )}
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onSave(value.trim())}>
            Save Key
          </button>
        </div>
      </div>
    </div>
  );
}
