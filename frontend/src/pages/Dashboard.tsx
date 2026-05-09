import { ChangeEvent, useEffect, useState } from 'react';

import {
  backupDb,
  clearSavedMatches,
  exportAppData,
  getDbInfo,
  getHealth,
  getSavedMatchesHealth,
  importSavedMatches,
  resetSampleData,
  runRealismReport,
  runSelfTest,
  type HealthResponse,
  type RealismReportResponse,
  type SelfTestResponse,
} from '../services/api';

type ConnectionState = 'checking' | 'connected' | 'offline';

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function minutes(seconds: number) {
  return `${(seconds / 60).toFixed(1)} min`;
}

export function Dashboard() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string>('');
  const [devMessage, setDevMessage] = useState<string>('');
  const [importText, setImportText] = useState('');
  const [selfTest, setSelfTest] = useState<SelfTestResponse | null>(null);
  const [realismReport, setRealismReport] = useState<RealismReportResponse | null>(null);

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
      setDevMessage(`${label}: ${pretty(result)}`);
    } catch (err) {
      setDevMessage(`${label}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  async function clearMatches() {
    if (!confirm('Delete all saved matches? Players, season profiles, and sample players will be kept.')) return;
    await runDevCheck(clearSavedMatches, 'Clear saved matches');
  }

  async function runDashboardSelfTest() {
    try {
      setDevMessage('Self-test: running…');
      const result = await runSelfTest(false);
      setSelfTest(result);
      setDevMessage(`Self-test: ${result.status}`);
    } catch (err) {
      setDevMessage(`Self-test: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  async function runDashboardRealismReport() {
    try {
      setDevMessage('Realism report: running 600 deterministic simulations…');
      const result = await runRealismReport();
      setRealismReport(result);
      setDevMessage(`Realism report: complete (${result.reports.length} rows)`);
    } catch (err) {
      setDevMessage(`Realism report: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

  async function handleImport() {
    try {
      const parsed = JSON.parse(importText);
      const savedMatches = Array.isArray(parsed) ? parsed : parsed.saved_matches;
      if (!Array.isArray(savedMatches)) throw new Error('JSON must be an export object with saved_matches, or a saved_matches array.');
      await runDevCheck(() => importSavedMatches(savedMatches), 'Import saved matches JSON');
    } catch (err) {
      setDevMessage(`Import saved matches JSON: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  function loadImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text()
      .then(setImportText)
      .catch((err: Error) => setDevMessage(`Read import file: ${err.message}`));
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
              {health.version && <> Version <strong>{health.version}</strong>.</>}
              {' '}Database initialized: <strong>{health.database_initialized ? 'yes' : 'no'}</strong>.
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
        <span>Ready for testing checklist</span>
        <strong>Manual smoke-test prompts</strong>
        <ol className="compact-list">
          <li>Backend connected</li>
          <li>Profiles loaded</li>
          <li>Elite sample players available</li>
          <li>Self-test available</li>
          <li>Realism report available</li>
          <li>Can generate Tour BO5</li>
          <li>Can generate League Timed 3x5</li>
          <li>Can save match</li>
        </ol>
        <div className="button-row match-actions">
          <button className="ghost-button" onClick={() => runDevCheck(getHealth, 'Backend health')} type="button">1. Backend</button>
          <button className="ghost-button" onClick={() => runDevCheck(getSavedMatchesHealth, 'Saved matches health')} type="button">2. Saved router</button>
          <button className="ghost-button" onClick={() => runDevCheck(resetSampleData, 'Reset elite sample players')} type="button">3. Reset samples</button>
          <button className="primary-button" onClick={runDashboardSelfTest} type="button">4. Run Self-Test</button>
          <button className="ghost-button" onClick={runDashboardRealismReport} type="button">Run Realism Report</button>
        </div>
      </div>

      <div className="metric-card dev-tools-card">
        <span>Local Dev Tools</span>
        <strong>Database and JSON tools</strong>
        <p>Quick checks for the local API, SQLite backup, and saved-match portability.</p>
        <div className="button-row match-actions">
          <button className="ghost-button" onClick={() => runDevCheck(getDbInfo, 'DB info')} type="button">DB info</button>
          <button className="ghost-button" onClick={() => runDevCheck(backupDb, 'Backup SQLite DB')} type="button">Backup SQLite DB</button>
          <button className="danger-button" onClick={clearMatches} type="button">Clear saved matches</button>
          <button className="ghost-button" onClick={exportJson} type="button">Export app data JSON</button>
        </div>
        <label className="field-label wide-field">
          <span>Import saved matches JSON</span>
          <input accept="application/json,.json" onChange={loadImportFile} type="file" />
          <textarea onChange={(event) => setImportText(event.target.value)} placeholder="Paste exported JSON here. Only saved_matches will be imported." value={importText} />
        </label>
        <button className="primary-button" disabled={!importText.trim()} onClick={handleImport} type="button">Import Saved Matches</button>
        {devMessage && <pre className="dev-result">{devMessage}</pre>}
      </div>

      {selfTest && (
        <div className="metric-card dev-tools-card">
          <span>Automated smoke test</span>
          <strong>{selfTest.status === 'ok' ? 'Passed' : 'Failed'}</strong>
          <h3>Checks</h3>
          <ul className="compact-list">
            {selfTest.checks.map((check) => <li key={check.name}><strong>{check.status}</strong> · {check.name}: {check.message}</li>)}
          </ul>
          <h3>Sample ratings</h3>
          <div className="scoreline-grid">
            {Object.entries(selfTest.sample_ratings).map(([name, rating]) => <span key={name}>{name}: Tour {rating.tour} / League {rating.league}</span>)}
          </div>
          <h3>Generated summaries</h3>
          <div className="scoreline-grid">
            {Object.entries(selfTest.generated_summaries).map(([name, summary]) => <span key={name}>{summary}</span>)}
          </div>
        </div>
      )}

      {realismReport && (
        <div className="metric-card dev-tools-card wide-card">
          <span>Calibration realism report</span>
          <strong>{realismReport.reports.length} matchup checks · {realismReport.runs_per_matchup} runs each</strong>
          <p>Generated {new Date(realismReport.generated_at).toLocaleString()} without saving matches.</p>
          <div className="rally-table-wrap">
            <table className="rally-table">
              <thead>
                <tr><th>Format</th><th>Matchup</th><th>Win rates</th><th>Avg pts</th><th>Clean</th><th>Broadcast</th><th>Shots</th><th>Common scores</th><th>Flags</th></tr>
              </thead>
              <tbody>
                {realismReport.reports.map((row) => (
                  <tr key={`${row.match_type}-${row.matchup}`}>
                    <td>{row.match_type === 'league_timed_3x5' ? 'League' : 'Tour'}</td>
                    <td>{row.matchup}</td>
                    <td>{Math.round(row.player_a_win_rate * 100)}% / {Math.round(row.player_b_win_rate * 100)}%{row.draw_rate > 0 ? ` / draw ${Math.round(row.draw_rate * 100)}%` : ''}</td>
                    <td>{row.average_total_points}</td>
                    <td>{minutes(row.average_clean_time)}</td>
                    <td>{minutes(row.average_broadcast_time)}</td>
                    <td>{row.average_rally_shots}</td>
                    <td>{row.common_scorelines.map((score) => `${score.scoreline} (${score.count})`).join(', ')}</td>
                    <td>{row.realism_flags.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="metric-card">
        <span>Database</span>
        <strong>SQLite</strong>
        <p>Local file: data/squash_engine.db</p>
      </div>

      <div className="metric-card">
        <span>Current MVP includes</span>
        <strong>Local squash lab</strong>
        <ul className="compact-list">
          <li>Players</li>
          <li>Tour BO5</li>
          <li>League Timed 3x5</li>
          <li>Save Match</li>
          <li>Analytics</li>
          <li>Batch Simulation</li>
          <li>Export/Backup</li>
          <li>Self-Test</li>
        </ul>
      </div>

      <div className="metric-card">
        <span>Current engines</span>
        <strong>Tour BO5 + League Timed 3x5</strong>
        <p>Use elite sample players, copied JSON, diagnostics, and saved-match filters to test realism.</p>
      </div>
    </section>
  );
}
