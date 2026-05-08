import { useEffect, useState } from 'react';

import { exportAppData, getHealth, getSavedMatchesHealth, resetSampleData, type HealthResponse } from '../services/api';

type ConnectionState = 'checking' | 'connected' | 'offline';

export function Dashboard() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string>('');
  const [devMessage, setDevMessage] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    getHealth()
      .then((payload) => {
        if (!isMounted) return;
        setHealth(payload);
        setConnectionState('connected');
      })
      .catch((requestError: Error) => {
        if (!isMounted) return;
        setError(requestError.message);
        setConnectionState('offline');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function runDevCheck(action: () => Promise<unknown>, label: string) {
    try {
      setDevMessage(`${label}: running…`);
      const result = await action();
      setDevMessage(`${label}: ${JSON.stringify(result)}`);
    } catch (err) {
      setDevMessage(`${label}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }


  async function exportJson() {
    try {
      setDevMessage('Export app data JSON: running…');
      const data = await exportAppData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const link = document.createElement('a');
      link.href = url;
      link.download = `squash-match-lab-export-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDevMessage(`Export app data JSON: downloaded ${link.download}`);
    } catch (err) {
      setDevMessage(`Export app data JSON: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return (
    <section className="dashboard-grid">
      <div className="hero-card">
        <p className="eyebrow">Local simulation workspace</p>
        <h1>Squash Match Lab</h1>
        <p>
          Build and test realistic fictional FAX squash matches rally by rally. The workspace stays
          local and simple for manual Windows testing.
        </p>
      </div>

      <div className={`status-card status-card--${connectionState}`}>
        <span className="status-dot" aria-hidden="true" />
        <div>
          <p className="eyebrow">Backend status</p>
          <h2>
            {connectionState === 'checking' && 'Checking connection...'}
            {connectionState === 'connected' && 'Connected'}
            {connectionState === 'offline' && 'Offline'}
          </h2>
          {health ? (
            <p>
              {(health.app ?? 'Squash Match Lab')} API responded with status <strong>{health.status}</strong>.
            </p>
          ) : (
            <p>
              {connectionState === 'offline'
                ? `Could not reach the FastAPI backend. ${error}`
                : 'Waiting for the local API response.'}
            </p>
          )}
        </div>
      </div>

      <div className="metric-card dev-tools-card">
        <span>Local Dev Tools</span>
        <strong>Test helpers</strong>
        <p>Quick checks for the local API and seed data before a manual app test.</p>
        <div className="button-row match-actions">
          <button className="ghost-button" onClick={() => runDevCheck(getHealth, 'Backend health')} type="button">Health check backend</button>
          <button className="ghost-button" onClick={() => runDevCheck(getSavedMatchesHealth, 'Saved matches health')} type="button">Health check saved matches router</button>
          <button className="ghost-button" onClick={() => runDevCheck(resetSampleData, 'Reset elite sample players')} type="button">Reset elite sample players</button>
          <button className="ghost-button" onClick={exportJson} type="button">Export app data JSON</button>
        </div>
        {devMessage && <p className="dev-result">{devMessage}</p>}
      </div>

      <div className="metric-card">
        <span>Database</span>
        <strong>SQLite</strong>
        <p>Local file: data/squash_engine.db</p>
      </div>

      <div className="metric-card">
        <span>Current engines</span>
        <strong>Tour BO5 + League Timed 3x5</strong>
        <p>Use elite sample players, copied JSON, diagnostics, and saved-match filters to test realism.</p>
      </div>
    </section>
  );
}
