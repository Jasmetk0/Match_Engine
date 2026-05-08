import { useEffect, useState } from 'react';

import { getHealth, type HealthResponse } from '../services/api';

type ConnectionState = 'checking' | 'connected' | 'offline';

export function Dashboard() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string>('');

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

  return (
    <section className="dashboard-grid">
      <div className="hero-card">
        <p className="eyebrow">Local simulation workspace</p>
        <h1>Squash Match Lab</h1>
        <p>
          Build, test, and eventually simulate realistic squash matches rally by rally. This first
          version keeps the stack local and ready for future match-engine features.
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
              {health.app} API responded with status <strong>{health.status}</strong>.
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

      <div className="metric-card">
        <span>Database</span>
        <strong>SQLite</strong>
        <p>Local file: data/squash_engine.db</p>
      </div>

      <div className="metric-card">
        <span>Next build step</span>
        <strong>Match engine</strong>
        <p>Rally-by-rally simulation will be added after this foundation.</p>
      </div>
    </section>
  );
}
