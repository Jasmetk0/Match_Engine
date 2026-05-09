import { useEffect, useMemo, useState } from 'react';

import {
  getH2HAnalytics,
  getPlayerAnalytics,
  getPlayersLeaderboard,
  listPlayers,
  type H2HAnalytics,
  type PlayerAnalytics,
  type PlayerLeaderboardRow,
} from '../services/api';

function pct(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function minutes(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  return `${(seconds / 60).toFixed(1)} min`;
}

function typeLabel(value: string) {
  return value === 'league_timed_3x5' ? 'League Timed 3x5' : value === 'tour_bo5' ? 'Tour BO5' : value;
}

function matchLine(match: { player_a_name: string; player_b_name: string; match_score_text: string; winner_name: string; is_draw: boolean; match_type: string }) {
  return `${match.player_a_name} vs ${match.player_b_name} · ${match.is_draw ? 'Draw' : `${match.winner_name} won`} · ${match.match_score_text} · ${typeLabel(match.match_type)}`;
}

export function Analytics() {
  const [names, setNames] = useState<string[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [h2hA, setH2hA] = useState('');
  const [h2hB, setH2hB] = useState('');
  const [h2hType, setH2hType] = useState('all');
  const [playerStats, setPlayerStats] = useState<PlayerAnalytics | null>(null);
  const [h2hStats, setH2hStats] = useState<H2HAnalytics | null>(null);
  const [leaderboard, setLeaderboard] = useState<PlayerLeaderboardRow[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPlayers()
      .then((players) => {
        const loadedNames = players.map((player) => player.name).sort();
        setNames(loadedNames);
        setPlayerName((current) => current || loadedNames[0] || '');
        setH2hA((current) => current || loadedNames[0] || '');
        setH2hB((current) => current || loadedNames[1] || loadedNames[0] || '');
      })
      .catch(() => undefined);
    loadLeaderboard();
  }, []);

  async function loadPlayer() {
    if (!playerName.trim()) return;
    try {
      setError(null);
      setLoading('player');
      setPlayerStats(await getPlayerAnalytics(playerName.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load player analytics');
    } finally {
      setLoading(null);
    }
  }

  async function loadH2H() {
    if (!h2hA.trim() || !h2hB.trim()) return;
    try {
      setError(null);
      setLoading('h2h');
      setH2hStats(await getH2HAnalytics(h2hA.trim(), h2hB.trim(), h2hType));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load H2H analytics');
    } finally {
      setLoading(null);
    }
  }

  async function loadLeaderboard() {
    try {
      setLoading((current) => current ?? 'leaderboard');
      setLeaderboard(await getPlayersLeaderboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load leaderboard');
    } finally {
      setLoading(null);
    }
  }

  const datalist = useMemo(() => <datalist id="analytics-player-names">{names.map((name) => <option key={name} value={name} />)}</datalist>, [names]);

  return (
    <section className="players-page analytics-page">
      <div className="section-heading top-heading">
        <div>
          <p className="eyebrow">Saved simulation analytics</p>
          <h1>Analytics</h1>
          <p>Analyze player histories, rivalries, score profiles and saved-match leaderboards from historical snapshots.</p>
        </div>
      </div>
      {datalist}
      {error && <div className="error-banner">{error}</div>}

      <div className="analytics-grid">
        <div className="editor-card">
          <div className="section-heading"><div><p className="eyebrow">Player Analytics</p><h2>Saved-match history</h2></div></div>
          <div className="form-grid compact-grid">
            <label className="field-label"><span>Player name</span><input list="analytics-player-names" value={playerName} onChange={(event) => setPlayerName(event.target.value)} /></label>
          </div>
          <button className="primary-button" disabled={loading !== null || !playerName.trim()} onClick={loadPlayer} type="button">{loading === 'player' ? 'Loading…' : 'Load Player Analytics'}</button>
          {!playerStats && <div className="empty-state"><p>Choose a player to summarize saved matches.</p></div>}
          {playerStats && playerStats.total_matches === 0 && <div className="empty-state"><p>No saved matches yet for this player.</p></div>}
          {playerStats && playerStats.total_matches > 0 && (
            <>
              <div className="ratings-grid">
                <div className="rating-card featured"><span>Record</span><strong>{playerStats.wins}-{playerStats.losses}-{playerStats.draws}</strong><p>{pct(playerStats.win_rate)} win rate</p></div>
                <div className="rating-card"><span>Tour</span><strong>{playerStats.tour_wins}-{playerStats.tour_matches - playerStats.tour_wins}</strong><p>BO5 saved matches</p></div>
                <div className="rating-card"><span>League</span><strong>{playerStats.league_wins}-{playerStats.league_matches - playerStats.league_wins - playerStats.league_draws}-{playerStats.league_draws}</strong><p>Timed 3x5</p></div>
                <div className="rating-card"><span>Points</span><strong>{playerStats.total_points_for}-{playerStats.total_points_against}</strong><p>Diff {playerStats.point_differential}</p></div>
                <div className="rating-card"><span>Avg perf</span><strong>{playerStats.average_performance_rating ?? '—'}</strong><p>Best {playerStats.best_performance_rating ?? '—'}</p></div>
              </div>
              <h3>Common opponents</h3>
              <div className="scroll-x"><table className="compact-table"><tbody>{playerStats.common_opponents.map((opp) => <tr key={opp.opponent_name}><td>{opp.opponent_name}</td><td>{opp.matches}</td><td>{opp.wins}-{opp.losses}-{opp.draws}</td></tr>)}</tbody></table></div>
              <h3>Recent matches</h3>
              <ul className="compact-list">{playerStats.recent_matches.map((match) => <li key={match.id}>{matchLine(match)}</li>)}</ul>
            </>
          )}
        </div>

        <div className="editor-card">
          <div className="section-heading"><div><p className="eyebrow">H2H Compare</p><h2>Rivalry record</h2></div></div>
          <div className="form-grid compact-grid">
            <label className="field-label"><span>Player A</span><input list="analytics-player-names" value={h2hA} onChange={(event) => setH2hA(event.target.value)} /></label>
            <label className="field-label"><span>Player B</span><input list="analytics-player-names" value={h2hB} onChange={(event) => setH2hB(event.target.value)} /></label>
            <label className="field-label"><span>Match type</span><select value={h2hType} onChange={(event) => setH2hType(event.target.value)}><option value="all">All</option><option value="tour_bo5">Tour BO5</option><option value="league_timed_3x5">League Timed 3x5</option></select></label>
          </div>
          <button className="primary-button" disabled={loading !== null || !h2hA.trim() || !h2hB.trim()} onClick={loadH2H} type="button">{loading === 'h2h' ? 'Loading…' : 'Load H2H'}</button>
          {!h2hStats && <div className="empty-state"><p>Load two player names to compare their saved rivalry.</p></div>}
          {h2hStats && h2hStats.total_matches === 0 && <div className="empty-state"><p>No saved H2H matches found.</p></div>}
          {h2hStats && h2hStats.total_matches > 0 && (
            <>
              <div className="ratings-grid">
                <div className="rating-card featured"><span>Total H2H</span><strong>{h2hStats.player_a_wins}-{h2hStats.player_b_wins}-{h2hStats.draws}</strong><p>{h2hStats.total_matches} matches</p></div>
                <div className="rating-card"><span>Tour H2H</span><strong>{h2hStats.player_a_tour_wins}-{h2hStats.player_b_tour_wins}</strong><p>{h2hStats.tour_matches} matches</p></div>
                <div className="rating-card"><span>League H2H</span><strong>{h2hStats.player_a_league_wins}-{h2hStats.player_b_league_wins}</strong><p>{h2hStats.league_matches} matches</p></div>
                <div className="rating-card"><span>Total points</span><strong>{h2hStats.total_points_player_a}-{h2hStats.total_points_player_b}</strong><p>All saved H2H</p></div>
                <div className="rating-card"><span>Avg duration</span><strong>{minutes(h2hStats.average_clean_time_seconds)}</strong><p>Broadcast {minutes(h2hStats.average_broadcast_time_seconds)}</p></div>
              </div>
              <h3>Recent H2H</h3>
              <ul className="compact-list">{h2hStats.most_recent_matches.map((match) => <li key={match.id}>{matchLine(match)}</li>)}</ul>
            </>
          )}
        </div>
      </div>

      <div className="editor-card leaderboard-card">
        <div className="section-heading"><div><p className="eyebrow">Saved Match Leaderboard</p><h2>Players from saved matches</h2></div><button className="ghost-button" onClick={loadLeaderboard} type="button">Refresh</button></div>
        {leaderboard.length === 0 ? <div className="empty-state"><p>No saved matches yet. Generate and save matches to populate this board.</p></div> : (
          <div className="scroll-x"><table className="compact-table leaderboard-table">
            <thead><tr><th>Player</th><th>Matches</th><th>W</th><th>L</th><th>D</th><th>Win rate</th><th>Tour W</th><th>League W</th><th>Point diff</th><th>Avg perf</th></tr></thead>
            <tbody>{leaderboard.map((row) => <tr key={row.player_name}><td>{row.player_name}</td><td>{row.matches}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.draws}</td><td>{pct(row.win_rate)}</td><td>{row.tour_wins}</td><td>{row.league_wins}</td><td>{row.point_differential}</td><td>{row.average_performance_rating ?? '—'}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </section>
  );
}
