import { createPortal } from 'react-dom';
import { useState, useEffect, useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import ThemeToggle from '../shared/ThemeToggle';
import { KeybindingsSettings } from './KeybindingsSettings';
import { useTour, resetTour } from '../../hooks/useTour';
import {
  authenticateGoogle,
  listGoogleAccounts,
  removeGoogleAccount,
  syncGoogleCalendar,
  TokenData,
  SyncResult,
} from '../../api';

type Tab = 'general' | 'calendars' | 'keybindings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);
  const [tab, setTab] = useState<Tab>('general');
  const { startTour } = useTour();
  const [accounts, setAccounts] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadAccounts();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const loadAccounts = async () => {
    try {
      setError(null);
      const accts = await listGoogleAccounts();
      setAccounts(accts);
      try {
        window.dispatchEvent(new CustomEvent('google-accounts-changed', { detail: accts }));
      } catch (e) {
        // ignore if environment doesn't support CustomEvent
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts');
    }
  };

  const handleAddAccount = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await authenticateGoogle();
      const newAccounts = [...accounts, token];
      setAccounts(newAccounts);
      try {
        window.dispatchEvent(new CustomEvent('google-accounts-changed', { detail: newAccounts }));
      } catch (e) {
        // ignore
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAccount = async (email: string | null) => {
    if (!email) return;
    try {
      await removeGoogleAccount(email);
      const newAccounts = accounts.filter((a) => a.account_email !== email);
      setAccounts(newAccounts);
      try {
        window.dispatchEvent(new CustomEvent('google-accounts-changed', { detail: newAccounts }));
      } catch (e) {
        // ignore
      }
      setSyncResults((prev) => {
        const newResults = { ...prev };
        delete newResults[email];
        return newResults;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove account');
    }
  };

  const handleSync = async (email: string | null) => {
    if (!email) return;
    setSyncing(email);
    setError(null);
    try {
      const result = await syncGoogleCalendar(email, 'primary');
      setSyncResults((prev) => ({ ...prev, [email]: result }));
    } catch (err) {
      const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : 'Sync failed';
      console.error('Sync failed:', msg);
      setError(msg);
    } finally {
      setSyncing(null);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel settings-modal" ref={panelRef} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <p className="modal-title">Settings</p>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Tab bar */}
        <div className="settings-tabs">
          <button
            className={`settings-tab${tab === 'general' ? ' settings-tab--active' : ''}`}
            onClick={() => setTab('general')}
          >
            General
          </button>
          <button
            className={`settings-tab${tab === 'calendars' ? ' settings-tab--active' : ''}`}
            onClick={() => setTab('calendars')}
          >
            Calendars
          </button>
          <button
            className={`settings-tab${tab === 'keybindings' ? ' settings-tab--active' : ''}`}
            onClick={() => setTab('keybindings')}
          >
            Keybindings
          </button>
        </div>

        {tab === 'general' && (
          <div className="modal-content">
            <p className="section-label">Appearance</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>Theme</p>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>Light / Dark / Auto</p>
              </div>
              <ThemeToggle />
            </div>

            <p className="section-label">Onboarding</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>App tour</p>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>Replay the guided walkthrough</p>
              </div>
              <button
                className="modal-btn modal-btn--cancel"
                onClick={() => { resetTour(); onClose(); startTour(); }}
              >
                Restart tour
              </button>
            </div>
          </div>
        )}

        {tab === 'calendars' && (
          <div className="modal-content">
            <p className="section-label">Google Calendar Accounts</p>

            {error && (
              <div className="error-banner">
                <p className="error-text">{error}</p>
              </div>
            )}

            <div className="accounts-list">
              {accounts.map((account) => (
                <div key={account.account_email} className="account-item">
                  <div className="account-info">
                    <p className="account-email">{account.account_email || 'Unknown'}</p>
                    {syncResults[account.account_email || ''] && (
                      <p className="sync-status">
                        Synced: {syncResults[account.account_email || ''].created} created,{' '}
                        {syncResults[account.account_email || ''].updated} updated
                      </p>
                    )}
                  </div>
                  <div className="account-actions">
                    <button
                      className="btn btn--sm btn--primary"
                      onClick={() => handleSync(account.account_email)}
                      disabled={syncing === account.account_email}
                    >
                      {syncing === account.account_email ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <button
                      className="btn btn--sm btn--danger"
                      onClick={() => handleRemoveAccount(account.account_email)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              <button
                className="account-add-row"
                onClick={handleAddAccount}
                disabled={loading}
              >
                <span className="account-add-icon">+</span>
                {loading ? 'Authenticating…' : 'Add Google Account'}
              </button>
            </div>
          </div>
        )}

        {tab === 'keybindings' && (
          <div className="modal-content">
            <KeybindingsSettings />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default SettingsModal;
