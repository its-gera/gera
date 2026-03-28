import { useEffect, useRef, useState } from 'react';
import {
  ALL_BINDINGS,
  KeyBinding,
  formatKeyEvent,
  formatKeysForDisplay,
  getActiveKeys,
  getMergedBindings,
  resetAllOverrides,
  saveOverride,
} from '../../types/keybindings';
import './KeybindingsSettings.css';

// Only configurable bindings are shown in this panel
const CONFIGURABLE = ALL_BINDINGS.filter((b) => b.configurable);

export function KeybindingsSettings() {
  const [bindings, setBindings] = useState<KeyBinding[]>(() => getMergedBindings());
  const [recording, setRecording] = useState<string | null>(null); // action being recorded
  const [pendingKey, setPendingKey] = useState<string>('');
  const [conflict, setConflict] = useState<string | null>(null); // conflicting action label
  const recordingRef = useRef<string | null>(null);
  recordingRef.current = recording;

  // Keyboard capture while recording
  useEffect(() => {
    if (!recording) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      // Escape cancels recording
      if (e.key === 'Escape') {
        setRecording(null);
        setPendingKey('');
        setConflict(null);
        return;
      }

      // Ignore bare modifier presses
      if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) return;

      const formatted = formatKeyEvent(e);
      setPendingKey(formatted);

      // Conflict detection: check other configurable bindings
      const conflicting = CONFIGURABLE.find(
        (b) => b.action !== recording && getActiveKeys(b.action) === formatted
      );
      setConflict(conflicting?.label ?? null);
    };

    document.addEventListener('keydown', handler, { capture: true });
    return () => document.removeEventListener('keydown', handler, { capture: true });
  }, [recording]);

  const commitRecording = () => {
    if (!recording || !pendingKey) return;
    saveOverride(recording, pendingKey);
    setBindings(getMergedBindings());
    setRecording(null);
    setPendingKey('');
    setConflict(null);
  };

  const cancelRecording = () => {
    setRecording(null);
    setPendingKey('');
    setConflict(null);
  };

  const handleReset = () => {
    resetAllOverrides();
    setBindings(getMergedBindings());
  };

  return (
    <div>
      <div className="kb-section">
        <div className="kb-section-label">Global shortcuts</div>
        {CONFIGURABLE.map((def) => {
          const merged = bindings.find((b) => b.action === def.action)!;
          const isRecording = recording === def.action;
          const displayKey = isRecording ? (pendingKey ? formatKeysForDisplay(pendingKey) : '…') : formatKeysForDisplay(merged.keys);
          const isModified = merged.keys !== def.keys;

          return (
            <div key={def.action}>
              <div className="kb-row">
                <span className="kb-label">{def.label}</span>
                <div className="kb-right">
                  <kbd
                    className={`kb-badge${isRecording ? ' kb-badge--recording' : ''}${isRecording && conflict ? ' kb-badge--conflict' : ''}`}
                  >
                    {isRecording && !pendingKey ? 'Press a key…' : displayKey}
                  </kbd>

                  {isRecording ? (
                    <>
                      <button
                        className="kb-edit-btn"
                        title="Confirm"
                        onClick={commitRecording}
                        disabled={!pendingKey || !!conflict}
                      >
                        ✓
                      </button>
                      <button className="kb-edit-btn" title="Cancel" onClick={cancelRecording}>
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="kb-edit-btn"
                        title="Record new shortcut"
                        onClick={() => { setRecording(def.action); setPendingKey(''); setConflict(null); }}
                      >
                        ✎
                      </button>
                      {isModified && (
                        <button
                          className="kb-edit-btn"
                          title="Reset to default"
                          onClick={() => {
                            saveOverride(def.action, def.keys);
                            setBindings(getMergedBindings());
                          }}
                        >
                          ↺
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {isRecording && conflict && (
                <div className="kb-conflict-hint">
                  Conflicts with "{conflict}" — press a different key
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="kb-footer">
        <button className="kb-reset-btn" onClick={handleReset}>
          Reset all to defaults
        </button>
      </div>
    </div>
  );
}
