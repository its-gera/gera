import { useState, useEffect } from 'react';
import ThemeToggle from '../shared/ThemeToggle';
import { KeybindingsSettings } from '../settings/KeybindingsSettings';
import { useTour, resetTour } from '../../hooks/useTour';
import {
  authenticateGoogle,
  listGoogleAccounts,
  removeGoogleAccount,
  syncGoogleCalendar,
  TokenData,
  SyncResult,
} from '../../api';
import { MobilePageHeader } from './MobilePageHeader';

type Tab = 'general' | 'calendars' | 'keybindings';

export function MobileSettingsView() {
  const [tab, setTab] = useState<Tab>('general');
  const { startTour } = useTour();
  const [accounts, setAccounts] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setError(null);
      const accts = await listGoogleAccounts();
      setAccounts(accts);
      window.dispatchEvent(new CustomEvent('google-accounts-changed', { detail: accts }));
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
      window.dispatchEvent(new CustomEvent('google-accounts-changed', { detail: newAccounts }));
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
      window.dispatchEvent(new CustomEvent('google-accounts-changed', { detail: newAccounts }));
      setSyncResults((prev) => { const n = { ...prev }; delete n[email]; return n; });
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
      setError(typeof err === 'string' ? err : err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <MobilePageHeader label="SETTINGS" />

      {/* Tab strip */}
      <div className="mobile-settings-tabs">
        {(['general', 'calendars', 'keybindings'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`mobile-settings-tab${tab === t ? ' mobile-settings-tab--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="mobile-scroll-content" style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'general' && (
          <>
            <div className="mobile-section-label">APPEARANCE</div>
            <div className="mobile-set-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Theme</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Light / Dark / Auto</div>
              </div>
              <ThemeToggle />
            </div>
            <div className="mobile-section-label" style={{ marginTop: 8 }}>ONBOARDING</div>
            <div className="mobile-set-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>App tour</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Replay the guided walkthrough</div>
              </div>
              <button
                style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--surface-secondary)', background: 'var(--surface-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                onClick={() => { resetTour(); startTour(); }}
              >
                Restart tour
              </button>
            </div>
          </>
        )}

        {tab === 'calendars' && (
          <>
            <div className="mobile-section-label">GOOGLE CALENDAR ACCOUNTS</div>
            {error && (
              <div style={{ margin: '8px 20px', padding: 10, background: 'var(--surface-secondary)', borderRadius: 8, color: 'var(--text-error, red)', fontSize: 13 }}>
                {error}
              </div>
            )}
            {accounts.map((account) => (
              <div key={account.account_email} className="mobile-account-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {account.account_email || 'Unknown'}
                  </div>
                  {syncResults[account.account_email || ''] && (
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      Synced: {syncResults[account.account_email || ''].created} created,{' '}
                      {syncResults[account.account_email || ''].updated} updated
                    </div>
                  )}
                </div>
                <button
                  className="mobile-sync-btn"
                  onClick={() => handleSync(account.account_email)}
                  disabled={syncing === account.account_email}
                >
                  {syncing === account.account_email ? 'Syncing…' : 'Sync'}
                </button>
                <button
                  className="mobile-remove-btn"
                  onClick={() => handleRemoveAccount(account.account_email)}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="mobile-set-row"
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', justifyContent: 'flex-start', gap: 10, color: 'var(--accent-blue)', fontWeight: 600, fontSize: 14 }}
              onClick={handleAddAccount}
              disabled={loading}
            >
              {loading ? 'Authenticating…' : '+ Add Google Account'}
            </button>
          </>
        )}

        {tab === 'keybindings' && (
          <div style={{ padding: '0 4px' }}>
            <KeybindingsSettings />
          </div>
        )}
      </div>
    </div>
  );
}
