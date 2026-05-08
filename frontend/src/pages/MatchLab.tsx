import { useEffect, useMemo, useState } from 'react';

import {
  generateMatch,
  getPlayer,
  listPlayers,
  MatchGenerateResponse,
  MatchPreviewResponse,
  previewMatch,
  saveMatch,
  SeasonProfile,
} from '../services/api';
import { MatchResultView } from '../components/MatchResultView';

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

export function MatchLab() {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [playerAProfileId, setPlayerAProfileId] = useState<number | ''>('');
  const [playerBProfileId, setPlayerBProfileId] = useState<number | ''>('');
  const [seed, setSeed] = useState('squash-lab-1');
  const [runs, setRuns] = useState(500);
  const [preview, setPreview] = useState<MatchPreviewResponse | null>(null);
  const [result, setResult] = useState<MatchGenerateResponse | null>(null);
  const [loading, setLoading] = useState<'profiles' | 'preview' | 'generate' | 'save' | null>('profiles');
  const [error, setError] = useState<string | null>(null);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveNotes, setSaveNotes] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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


  function autoTitle(match: MatchGenerateResponse) {
    return `${match.winner.name} def. ${match.loser.name} ${match.match_score_text.split(' ')[0]} · ${match.player_a.season_year} Tour BO5`;
  }

  async function saveGeneratedMatch() {
    if (!result) return;
    try {
      setError(null);
      setSaveMessage(null);
      setLoading('save');
      const saved = await saveMatch({
        title: saveTitle.trim() || autoTitle(result),
        notes: saveNotes,
        preview,
        result,
      });
      setSaveMessage(`Saved match #${saved.id}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save match');
    } finally {
      setLoading(null);
    }
  }

  async function generate() {
    try {
      setError(null);
      setLoading('generate');
      const generated = await generateMatch(requestPayload());
      setResult(generated);
      setSaveTitle(autoTitle(generated));
      setSaveMessage(null);
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
          <button className="ghost-button" disabled={!result} type="button" onClick={() => document.getElementById('save-match-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Save Match</button>
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
        <>
          <div className="editor-card save-match-panel" id="save-match-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Save this simulation</p>
                <h2>Save Match</h2>
                <p>Store the generated result, story, stats and rally log exactly as shown below.</p>
              </div>
              {saveMessage && <span className="seed-pill">{saveMessage}</span>}
            </div>
            <div className="form-grid save-form-grid">
              <label className="field-label">
                <span>Title</span>
                <input value={saveTitle} onChange={(event) => setSaveTitle(event.target.value)} placeholder={autoTitle(result)} />
              </label>
              <label className="field-label wide-field">
                <span>Notes</span>
                <textarea value={saveNotes} onChange={(event) => setSaveNotes(event.target.value)} placeholder="Optional notes about the match" />
              </label>
            </div>
            <div className="button-row match-actions">
              <button className="primary-button" disabled={loading !== null} onClick={saveGeneratedMatch} type="button">
                {loading === 'save' ? 'Saving…' : 'Save Match'}
              </button>
            </div>
          </div>
          <MatchResultView result={result} label="Generated result" />
        </>
      )}
    </section>
  );
}
