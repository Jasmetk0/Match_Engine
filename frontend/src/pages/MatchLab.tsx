import { useEffect, useMemo, useState } from 'react';

import {
  generateMatch,
  getPlayer,
  listPlayers,
  MatchGenerateResponse,
  MatchPreviewResponse,
  previewMatch,
  SeasonProfile,
} from '../services/api';

type ProfileOption = SeasonProfile & { playerName: string };

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function minutes(seconds: number) {
  return `${(seconds / 60).toFixed(1)} min`;
}

function profileLabel(profile: ProfileOption) {
  return `${profile.playerName} · ${profile.season_year} · Tour ${profile.tournament_rating.toFixed(1)} / League ${profile.league_rating.toFixed(1)}`;
}

function profileName(id: number | null, profiles: ProfileOption[]) {
  if (id === null) return 'Let';
  return profiles.find((profile) => profile.id === id)?.playerName ?? `Profile ${id}`;
}

export function MatchLab() {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [playerAProfileId, setPlayerAProfileId] = useState<number | ''>('');
  const [playerBProfileId, setPlayerBProfileId] = useState<number | ''>('');
  const [seed, setSeed] = useState('squash-lab-1');
  const [runs, setRuns] = useState(500);
  const [preview, setPreview] = useState<MatchPreviewResponse | null>(null);
  const [result, setResult] = useState<MatchGenerateResponse | null>(null);
  const [loading, setLoading] = useState<'profiles' | 'preview' | 'generate' | null>('profiles');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfiles() {
      try {
        setLoading('profiles');
        const players = await listPlayers();
        const loaded = await Promise.all(players.map((player) => getPlayer(player.id)));
        const options = loaded.flatMap((player) => player.profiles.map((profile) => ({ ...profile, playerName: player.name })));
        setProfiles(options);
        setPlayerAProfileId((current) => current || options[0]?.id || '');
        setPlayerBProfileId((current) => current || options[1]?.id || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load season profiles');
      } finally {
        setLoading(null);
      }
    }
    loadProfiles();
  }, []);

  const selectedA = useMemo(() => profiles.find((profile) => profile.id === playerAProfileId), [profiles, playerAProfileId]);
  const selectedB = useMemo(() => profiles.find((profile) => profile.id === playerBProfileId), [profiles, playerBProfileId]);

  function requestPayload() {
    if (!playerAProfileId || !playerBProfileId) throw new Error('Choose two season profiles first.');
    if (playerAProfileId === playerBProfileId) throw new Error('Choose two different season profiles.');
    return {
      player_a_profile_id: playerAProfileId,
      player_b_profile_id: playerBProfileId,
      seed: seed || null,
      match_type: 'tour_bo5' as const,
      monte_carlo_runs: runs,
    };
  }

  async function calculatePreview() {
    try {
      setError(null);
      setLoading('preview');
      setPreview(await previewMatch(requestPayload()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not calculate probabilities');
    } finally {
      setLoading(null);
    }
  }

  async function generate() {
    try {
      setError(null);
      setLoading('generate');
      setResult(await generateMatch(requestPayload()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate match');
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="players-page match-lab-page">
      <div className="section-heading top-heading">
        <div>
          <p className="eyebrow">Simulation workbench</p>
          <h1>Match Lab</h1>
          <p>Generate deterministic rally-by-rally professional squash Tour matches from player season profiles, pressure, fatigue, styles and all 18 attributes.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="editor-card match-control-card">
        <div className="form-grid">
          <label className="field-label">
            <span>Match type</span>
            <select value="tour_bo5" disabled>
              <option value="tour_bo5">Tour BO5 · PAR to 11</option>
            </select>
          </label>
          <label className="field-label">
            <span>Player A season profile</span>
            <select value={playerAProfileId} onChange={(event) => setPlayerAProfileId(Number(event.target.value))}>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profileLabel(profile)}</option>)}
            </select>
          </label>
          <label className="field-label">
            <span>Player B season profile</span>
            <select value={playerBProfileId} onChange={(event) => setPlayerBProfileId(Number(event.target.value))}>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profileLabel(profile)}</option>)}
            </select>
          </label>
          <label className="field-label">
            <span>Seed</span>
            <input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="Optional deterministic seed" />
          </label>
          <label className="field-label">
            <span>Monte Carlo runs</span>
            <input max={3000} min={50} step={50} type="number" value={runs} onChange={(event) => setRuns(Number(event.target.value))} />
          </label>
        </div>
        <div className="button-row match-actions">
          <button className="primary-button" disabled={loading !== null || profiles.length < 2} onClick={calculatePreview} type="button">
            {loading === 'preview' ? 'Calculating…' : 'Calculate Probabilities'}
          </button>
          <button className="ghost-button" disabled={loading !== null || profiles.length < 2} onClick={generate} type="button">
            {loading === 'generate' ? 'Generating…' : 'Generate Match'}
          </button>
          <button className="ghost-button" disabled type="button">Save Match · Coming next</button>
        </div>
      </div>

      {selectedA && selectedB && (
        <div className="ratings-grid matchup-grid">
          {[selectedA, selectedB].map((profile) => (
            <div className="rating-card featured" key={profile.id}>
              <span>{profile.playerName}</span>
              <strong>{profile.play_style}</strong>
              <p>Tour {profile.tournament_rating.toFixed(1)} · Mental {profile.mental_rating.toFixed(1)} · Physical {profile.physical_rating.toFixed(1)}</p>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="detail-stack">
          <div className="editor-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Probability preview</p>
                <h2>{preview.player_a.name} vs {preview.player_b.name}</h2>
              </div>
              <span className="seed-pill">Seed {preview.seed}</span>
            </div>
            <div className="ratings-grid">
              <div className="rating-card featured"><span>{preview.player_a.name}</span><strong>{pct(preview.player_a_win_probability)}</strong><p>Win probability</p></div>
              <div className="rating-card featured"><span>{preview.player_b.name}</span><strong>{pct(preview.player_b_win_probability)}</strong><p>Win probability</p></div>
              <div className="rating-card"><span>Deciding game</span><strong>{pct(preview.deciding_game_probability)}</strong><p>Best-of-five reaches 2-2.</p></div>
              <div className="rating-card"><span>Tiebreak chance</span><strong>{pct(preview.at_least_one_tiebreak_probability)}</strong><p>At least one game reaches 10-10.</p></div>
              <div className="rating-card"><span>Expected points</span><strong>{preview.expected_total_points}</strong><p>Total scoring points.</p></div>
              <div className="rating-card"><span>Expected duration</span><strong>{minutes(preview.expected_total_duration_seconds)}</strong><p>Match time estimate.</p></div>
              <div className="rating-card"><span>Average rally</span><strong>{preview.expected_average_rally_shots}</strong><p>Shots per rally.</p></div>
              <div className="rating-card"><span>Expected rallies</span><strong>{preview.expected_total_rallies}</strong><p>Scoring rallies plus lets.</p></div>
            </div>
            <div className="scoreline-grid">
              <span>{preview.player_a.name} 3-0: {pct(preview.player_a_3_0)}</span>
              <span>{preview.player_a.name} 3-1: {pct(preview.player_a_3_1)}</span>
              <span>{preview.player_a.name} 3-2: {pct(preview.player_a_3_2)}</span>
              <span>{preview.player_b.name} 3-0: {pct(preview.player_b_3_0)}</span>
              <span>{preview.player_b.name} 3-1: {pct(preview.player_b_3_1)}</span>
              <span>{preview.player_b.name} 3-2: {pct(preview.player_b_3_2)}</span>
            </div>
            <p>{preview.upset_hint}</p>
            <p>{preview.style_edge_summary}</p>
            <p>{preview.physical_edge_summary}</p>
            <p>{preview.pressure_edge_summary}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="detail-stack generated-result">
          <div className="editor-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Generated result</p>
                <h2>{result.winner.name} wins {result.match_score_text}</h2>
              </div>
              <span className="seed-pill">Seed {result.seed}</span>
            </div>
            <div className="scoreline-grid game-score-grid">
              {result.games.map((game) => <span key={game.game_number}>Game {game.game_number}: {game.score[0]}-{game.score[1]} · {profileName(game.winner_profile_id, profiles)}</span>)}
            </div>
            <div className="ratings-grid">
              <div className="rating-card"><span>Duration</span><strong>{minutes(result.stats.total_duration_seconds)}</strong></div>
              <div className="rating-card"><span>Total points</span><strong>{Object.values(result.stats.total_points).reduce((sum: number, value) => sum + Number(value), 0)}</strong></div>
              <div className="rating-card"><span>Avg rally shots</span><strong>{result.stats.average_rally_shots}</strong></div>
              <div className="rating-card"><span>Longest rally</span><strong>{result.stats.longest_rally_shots}</strong></div>
              <div className="rating-card"><span>Winners</span><strong>{Object.values(result.stats.winners).join(' / ')}</strong></div>
              <div className="rating-card"><span>Unforced errors</span><strong>{Object.values(result.stats.unforced_errors_committed).join(' / ')}</strong></div>
              <div className="rating-card"><span>Pressure points</span><strong>{Object.values(result.stats.pressure_points_won).join(' / ')}</strong></div>
              <div className="rating-card"><span>Lets</span><strong>{result.stats.total_lets}</strong></div>
            </div>
            <div className="story-box">
              <h3>{result.story.headline}</h3>
              <p>{result.story.key_factor}</p>
              <p>{result.story.turning_point}</p>
              <p>{result.story.style_summary}</p>
              <p>{result.story.fatigue_summary}</p>
              <p>{result.story.pressure_summary}</p>
              <p>{result.story.explanation}</p>
            </div>
          </div>

          <details className="editor-card rally-log" open>
            <summary>Full rally log ({result.rallies.length} events)</summary>
            <div className="rally-table-wrap">
              <table className="rally-table">
                <thead>
                  <tr>
                    <th>Game</th><th>Rally</th><th>Before</th><th>Winner</th><th>Shots</th><th>Duration</th><th>Terminal</th><th>Pattern</th><th>Pressure</th><th>Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rallies.map((rally) => (
                    <tr key={`${rally.game_number}-${rally.rally_number}-${rally.terminal_type}`}>
                      <td>{rally.game_number}</td>
                      <td>{rally.rally_number}</td>
                      <td>{rally.score_before.join('-')}</td>
                      <td>{profileName(rally.winner_profile_id, profiles)}</td>
                      <td>{rally.rally_shots}</td>
                      <td>{rally.rally_duration_seconds.toFixed(1)}s</td>
                      <td>{rally.terminal_type}</td>
                      <td>{rally.tactical_pattern}</td>
                      <td>{rally.pressure_level}</td>
                      <td>{rally.explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
