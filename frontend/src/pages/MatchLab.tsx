import { useEffect, useMemo, useState } from 'react';

import {
  batchSimulateMatch,
  generateMatch,
  getPlayer,
  listPlayers,
  MatchGenerateResponse,
  MatchPreviewResponse,
  MatchContext,
  BatchMatchResponse,
  previewMatch,
  saveMatch,
  SeasonProfile,
} from '../services/api';
import { MatchResultView } from '../components/MatchResultView';


const DEFAULT_CONTEXT: MatchContext = {
  event_importance: 'regular',
  court_type: 'standard_court',
  crowd_environment: 'neutral',
  rest_context: 'equal_rest',
  travel_context: 'none',
  pressure_context: 'normal',
};

const LABELS: Record<string, string> = {
  regular: 'Regular', major: 'Major', world_championship: 'World Championship', final: 'Final', rivalry: 'Rivalry', exhibition: 'Exhibition',
  standard_court: 'Standard court', glass_court: 'Glass court', fast_court: 'Fast court', slow_court: 'Slow court',
  neutral: 'Neutral', home_player_a: 'Home player A', home_player_b: 'Home player B', hostile_to_a: 'Hostile to A', hostile_to_b: 'Hostile to B',
  equal_rest: 'Equal rest', player_a_short_rest: 'Player A short rest', player_b_short_rest: 'Player B short rest', both_tired: 'Both tired',
  none: 'None', player_a_travel_fatigue: 'Player A travel fatigue', player_b_travel_fatigue: 'Player B travel fatigue',
  normal: 'Normal', media_hype: 'Media hype', legacy_match: 'Legacy match', comeback_pressure: 'Comeback pressure', must_win: 'Must win',
};

const SCENARIOS: { label: string; context: MatchContext }[] = [
  { label: 'Neutral regular match', context: DEFAULT_CONTEXT },
  { label: 'Major semifinal', context: { ...DEFAULT_CONTEXT, event_importance: 'major', court_type: 'glass_court', pressure_context: 'media_hype' } },
  { label: 'World Championship final', context: { ...DEFAULT_CONTEXT, event_importance: 'world_championship', court_type: 'glass_court', pressure_context: 'legacy_match' } },
  { label: 'Heated rivalry', context: { ...DEFAULT_CONTEXT, event_importance: 'rivalry', pressure_context: 'media_hype' } },
  { label: 'Home crowd advantage A', context: { ...DEFAULT_CONTEXT, event_importance: 'major', crowd_environment: 'home_player_a' } },
  { label: 'Home crowd advantage B', context: { ...DEFAULT_CONTEXT, event_importance: 'major', crowd_environment: 'home_player_b' } },
  { label: 'Exhausted back-to-back match', context: { ...DEFAULT_CONTEXT, rest_context: 'both_tired', pressure_context: 'must_win' } },
  { label: 'Exhibition showcase', context: { ...DEFAULT_CONTEXT, event_importance: 'exhibition', pressure_context: 'normal' } },
  { label: 'League pressure duel', context: { ...DEFAULT_CONTEXT, event_importance: 'major', pressure_context: 'must_win', court_type: 'glass_court' } },
];

function contextText(context: MatchContext | undefined) {
  const ctx = context ?? DEFAULT_CONTEXT;
  return [ctx.event_importance, ctx.court_type, ctx.crowd_environment, ctx.rest_context, ctx.travel_context, ctx.pressure_context].map((key) => LABELS[key]).join(' · ');
}

function isNeutralContext(context: MatchContext | undefined) {
  const ctx = context ?? DEFAULT_CONTEXT;
  return ctx.event_importance === DEFAULT_CONTEXT.event_importance
    && ctx.court_type === DEFAULT_CONTEXT.court_type
    && ctx.crowd_environment === DEFAULT_CONTEXT.crowd_environment
    && ctx.rest_context === DEFAULT_CONTEXT.rest_context
    && ctx.travel_context === DEFAULT_CONTEXT.travel_context
    && ctx.pressure_context === DEFAULT_CONTEXT.pressure_context;
}

function contextHelperText(context: MatchContext | undefined) {
  return isNeutralContext(context)
    ? 'Neutral baseline context.'
    : 'Context active: this may subtly affect pressure, fatigue, rally length or pace.';
}

function titleContextTag(context: MatchContext | undefined) {
  if (!context) return '';
  if (context.event_importance === 'world_championship' && (context.pressure_context === 'legacy_match' || context.court_type === 'glass_court')) return ' · World Championship Final';
  if (context.event_importance === 'world_championship') return ' · World Championship';
  if (context.event_importance === 'final') return ' · Final';
  if (context.event_importance === 'rivalry') return ' · Rivalry';
  return '';
}

function previewContextEdgeText(preview: MatchPreviewResponse) {
  const edges = [preview.context_edge, preview.pressure_edge, preview.fatigue_edge].map((value) => value ?? 0);
  if (edges.every((value) => Math.abs(value) < 0.01)) return 'Context edge is neutral.';
  const totalEdge = edges.reduce((sum, value) => sum + value, 0);
  return `Context edge favors ${totalEdge >= 0 ? preview.player_a.name : preview.player_b.name} slightly.`;
}

type ProfileOption = SeasonProfile & { playerName: string };

function pct(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function minutes(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  return `${(seconds / 60).toFixed(1)} min`;
}

function profileLabel(profile: ProfileOption) {
  return `${profile.playerName} · ${profile.season_year} · Tour ${profile.tournament_rating.toFixed(1)} / League ${profile.league_rating.toFixed(1)}`;
}

function randomSeed() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return `sml-${Date.now()}-${values[0] % 1_000_000}`;
}

type MatchLabProps = {
  onOpenSavedMatches?: () => void;
};

export function MatchLab({ onOpenSavedMatches }: MatchLabProps) {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [playerAProfileId, setPlayerAProfileId] = useState<number | ''>('');
  const [playerBProfileId, setPlayerBProfileId] = useState<number | ''>('');
  const [seed, setSeed] = useState('squash-lab-1');
  const [runs, setRuns] = useState(500);
  const [matchType, setMatchType] = useState<'tour_bo5' | 'league_timed_3x5'>('tour_bo5');
  const [matchContext, setMatchContext] = useState<MatchContext>(DEFAULT_CONTEXT);
  const [preview, setPreview] = useState<MatchPreviewResponse | null>(null);
  const [result, setResult] = useState<MatchGenerateResponse | null>(null);
  const [loading, setLoading] = useState<'profiles' | 'preview' | 'generate' | 'save' | 'batch' | null>('profiles');
  const [error, setError] = useState<string | null>(null);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveNotes, setSaveNotes] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [batchRuns, setBatchRuns] = useState(20);
  const [batchResult, setBatchResult] = useState<BatchMatchResponse | null>(null);

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
  const sameProfileSelected = Boolean(playerAProfileId && playerBProfileId && playerAProfileId === playerBProfileId);

  function clearGeneratedState() {
    setPreview(null);
    setResult(null);
    setSaveMessage(null);
    setSaveTitle('');
    setSaveNotes('');
    setBatchResult(null);
  }

  function requestPayload(seedOverride?: string) {
    if (!playerAProfileId || !playerBProfileId) throw new Error('Choose two season profiles first.');
    if (playerAProfileId === playerBProfileId) throw new Error('Choose two different season profiles.');
    return {
      player_a_profile_id: playerAProfileId,
      player_b_profile_id: playerBProfileId,
      seed: (seedOverride ?? seed) || null,
      match_type: matchType,
      monte_carlo_runs: runs,
      match_context: matchContext,
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
    const format = match.match_type === 'league_timed_3x5' ? 'League Timed 3x5' : 'Tour BO5';
    const tag = titleContextTag(match.match_context);
    if (!match.winner || !match.loser || match.is_draw) return `${match.player_a.name} drew ${match.player_b.name} ${match.match_score_text} · ${match.player_a.season_year} ${format}${tag}`;
    return `${match.winner.name} def. ${match.loser.name} ${match.match_score_text.split(' ')[0]} · ${match.player_a.season_year} ${format}${tag}`;
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
      if (err instanceof Error && err.message.startsWith('Network error:')) {
        setError('Could not reach backend. Is run_backend.bat still running?');
      } else {
        setError(err instanceof Error ? err.message : 'Could not save match');
      }
    } finally {
      setLoading(null);
    }
  }

  function randomizeSeed() {
    setSeed(randomSeed());
    clearGeneratedState();
    setError(null);
  }

  async function generate(seedOverride?: string) {
    try {
      setError(null);
      if (seedOverride !== undefined) setPreview(null);
      setLoading('generate');
      const generated = await generateMatch(requestPayload(seedOverride));
      setResult(generated);
      setSaveTitle(autoTitle(generated));
      setSaveMessage(null);
      setSaveNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate match');
    } finally {
      setLoading(null);
    }
  }

  async function regenerate() {
    const nextSeed = randomSeed();
    setSeed(nextSeed);
    await generate(nextSeed);
  }


  function resetContext() {
    setMatchContext(DEFAULT_CONTEXT);
    clearGeneratedState();
    setError(null);
  }


  async function runBatchSimulation() {
    try {
      setError(null);
      setLoading('batch');
      const payload = requestPayload();
      setBatchResult(await batchSimulateMatch({
        player_a_profile_id: payload.player_a_profile_id,
        player_b_profile_id: payload.player_b_profile_id,
        match_type: payload.match_type,
        seed: payload.seed,
        runs: Math.max(5, Math.min(200, batchRuns)),
        match_context: matchContext,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run batch simulation');
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
      {profiles.length === 0 && loading !== 'profiles' && (
        <div className="error-banner">No season profiles found. Go to Players and reset elite sample players.</div>
      )}
      {sameProfileSelected && (
        <div className="error-banner">Choose two different season profiles before running a preview, match, or batch simulation.</div>
      )}

      <div className="editor-card match-control-card">
        <div className="form-grid">
          <label className="field-label">
            <span>Match type</span>
            <select value={matchType} onChange={(event) => { setMatchType(event.target.value as 'tour_bo5' | 'league_timed_3x5'); clearGeneratedState(); }}>
              <option value="tour_bo5">Tour BO5 · PAR to 11</option>
              <option value="league_timed_3x5">League Timed 3x5 · fixed clock</option>
            </select>
          </label>
          <label className="field-label">
            <span>Player A season profile</span>
            <select value={playerAProfileId} onChange={(event) => { setPlayerAProfileId(Number(event.target.value)); clearGeneratedState(); }}>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profileLabel(profile)}</option>)}
            </select>
          </label>
          <label className="field-label">
            <span>Player B season profile</span>
            <select value={playerBProfileId} onChange={(event) => { setPlayerBProfileId(Number(event.target.value)); clearGeneratedState(); }}>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profileLabel(profile)}</option>)}
            </select>
          </label>
          <label className="field-label">
            <span>Seed</span>
            <input value={seed} onChange={(event) => { setSeed(event.target.value); setSaveMessage(null); }} placeholder="Optional deterministic seed" />
            <small>Same seed = same match. Use Randomize Seed or Regenerate Match for a fresh simulation.</small>
          </label>
          <label className="field-label">
            <span>Monte Carlo runs</span>
            <input max={3000} min={50} step={50} type="number" value={runs} onChange={(event) => setRuns(Number(event.target.value))} />
            <small>500 is recommended for fast local testing. Higher runs are useful but may feel slow on older PCs.</small>
          </label>
        </div>

        <details className="diagnostics-panel context-control-panel" open>
          <summary>Match Context</summary>
          <p className="helper-text">Context changes should be subtle. Player attributes still dominate.</p>
          <p className="helper-text">{contextHelperText(matchContext)}</p>
          <div className="button-row match-actions scenario-row">
            <span className="seed-pill">Scenario Preset:</span>
            <button className="ghost-button" onClick={resetContext} type="button">Reset Context</button>
            {SCENARIOS.map((scenario) => (
              <button className="ghost-button" key={scenario.label} onClick={() => { setMatchContext(scenario.context); clearGeneratedState(); }} type="button">{scenario.label}</button>
            ))}
          </div>
          <div className="form-grid compact-grid">
            <label className="field-label"><span>Event importance</span><select value={matchContext.event_importance} onChange={(e) => { setMatchContext({ ...matchContext, event_importance: e.target.value as MatchContext['event_importance'] }); clearGeneratedState(); }}><option value="regular">Regular</option><option value="major">Major</option><option value="world_championship">World Championship</option><option value="final">Final</option><option value="rivalry">Rivalry</option><option value="exhibition">Exhibition</option></select></label>
            <label className="field-label"><span>Court type</span><select value={matchContext.court_type} onChange={(e) => { setMatchContext({ ...matchContext, court_type: e.target.value as MatchContext['court_type'] }); clearGeneratedState(); }}><option value="standard_court">Standard court</option><option value="glass_court">Glass court</option><option value="fast_court">Fast court</option><option value="slow_court">Slow court</option></select></label>
            <label className="field-label"><span>Crowd environment</span><select value={matchContext.crowd_environment} onChange={(e) => { setMatchContext({ ...matchContext, crowd_environment: e.target.value as MatchContext['crowd_environment'] }); clearGeneratedState(); }}><option value="neutral">Neutral</option><option value="home_player_a">Home player A</option><option value="home_player_b">Home player B</option><option value="hostile_to_a">Hostile to A</option><option value="hostile_to_b">Hostile to B</option></select></label>
            <label className="field-label"><span>Rest context</span><select value={matchContext.rest_context} onChange={(e) => { setMatchContext({ ...matchContext, rest_context: e.target.value as MatchContext['rest_context'] }); clearGeneratedState(); }}><option value="equal_rest">Equal rest</option><option value="player_a_short_rest">Player A short rest</option><option value="player_b_short_rest">Player B short rest</option><option value="both_tired">Both tired</option></select></label>
            <label className="field-label"><span>Travel context</span><select value={matchContext.travel_context} onChange={(e) => { setMatchContext({ ...matchContext, travel_context: e.target.value as MatchContext['travel_context'] }); clearGeneratedState(); }}><option value="none">None</option><option value="player_a_travel_fatigue">Player A travel fatigue</option><option value="player_b_travel_fatigue">Player B travel fatigue</option></select></label>
            <label className="field-label"><span>Pressure context</span><select value={matchContext.pressure_context} onChange={(e) => { setMatchContext({ ...matchContext, pressure_context: e.target.value as MatchContext['pressure_context'] }); clearGeneratedState(); }}><option value="normal">Normal</option><option value="media_hype">Media hype</option><option value="legacy_match">Legacy match</option><option value="comeback_pressure">Comeback pressure</option><option value="must_win">Must win</option></select></label>
          </div>
          <div className="match-meta-line"><span>{contextText(matchContext)}</span></div>
        </details>

        <div className="button-row match-actions">
          <button className="primary-button" disabled={loading !== null || profiles.length < 2 || sameProfileSelected} onClick={calculatePreview} type="button">
            {loading === 'preview' ? 'Calculating…' : 'Calculate Probabilities'}
          </button>
          <button className="ghost-button" disabled={loading !== null || profiles.length < 2 || sameProfileSelected} onClick={() => generate()} type="button">
            {loading === 'generate' ? 'Generating…' : 'Generate Match'}
          </button>
          <button className="ghost-button" disabled={loading !== null} onClick={randomizeSeed} type="button">Randomize Seed</button>
          <button className="ghost-button" disabled={loading !== null || profiles.length < 2 || sameProfileSelected} onClick={regenerate} type="button">
            {loading === 'generate' ? 'Regenerating…' : 'Regenerate Match'}
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


      {selectedA && selectedB && (
        <div className="editor-card batch-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Batch Simulate Rivalry</p>
              <h2>{selectedA.playerName} vs {selectedB.playerName}</h2>
              <p>{matchType === 'league_timed_3x5' ? 'League Timed 3x5' : 'Tour BO5'} · base seed {seed || 'random'}. Runs are not saved and omit full rally logs for speed.</p>
            </div>
          </div>
          <div className="form-grid compact-grid">
            <label className="field-label"><span>Number of matches</span><input max={200} min={5} type="number" value={batchRuns} onChange={(event) => setBatchRuns(Number(event.target.value))} /></label>
          </div>
          <button className="primary-button" disabled={loading !== null || profiles.length < 2 || sameProfileSelected} onClick={runBatchSimulation} type="button">{loading === 'batch' ? 'Running batch…' : 'Run Batch Simulation'}</button>
          {batchResult && (
            <>
              <div className="ratings-grid">
                <div className="rating-card featured"><span>{batchResult.player_a.name}</span><strong>{batchResult.player_a_wins}</strong><p>{pct(batchResult.player_a_win_rate)} win rate</p></div>
                <div className="rating-card featured"><span>{batchResult.player_b.name}</span><strong>{batchResult.player_b_wins}</strong><p>{pct(batchResult.player_b_win_rate)} win rate</p></div>
                <div className="rating-card"><span>Draws</span><strong>{batchResult.draws}</strong><p>{pct(batchResult.draw_rate)} draw rate</p></div>
                <div className="rating-card"><span>Avg points</span><strong>{batchResult.average_total_points}</strong><p>Avg rally shots {batchResult.average_rally_shots}</p></div>
                <div className="rating-card"><span>Avg clean time</span><strong>{minutes(batchResult.average_clean_time_seconds)}</strong><p>Broadcast {minutes(batchResult.average_broadcast_time_seconds)}</p></div>
              </div>
              <p>{batchResult.style_summary}</p>
              {batchResult.context_summary && <p>Context: {batchResult.context_summary}</p>}
              {batchResult.context_shift_summary && <p>{batchResult.context_shift_summary}</p>}
              <p>{batchResult.recommendation_summary}</p>
              <h3>Scoreline distribution</h3>
              <div className="scoreline-grid">{Object.entries(batchResult.scoreline_distribution).map(([label, count]) => <span key={label}>{label}: {count}</span>)}</div>
              <h3>Sample results</h3>
              <table className="compact-table"><tbody>{batchResult.sample_results.map((sample) => <tr key={sample.seed}><td>{sample.seed}</td><td>{sample.winner_name}</td><td>{sample.score}</td><td>{sample.total_points} pts</td></tr>)}</tbody></table>
            </>
          )}
        </div>
      )}

      {preview && preview.match_type === matchType && preview.player_a.profile_id === playerAProfileId && preview.player_b.profile_id === playerBProfileId && (
        <div className="detail-stack">
          <div className="editor-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Probability preview</p>
                <h2>{preview.player_a.name} vs {preview.player_b.name}</h2>
              </div>
              <span className="seed-pill">Seed {preview.seed}</span>
            </div>
            <div className="match-meta-line"><span>Context: {preview.context_summary ?? contextText(preview.match_context)}</span></div>
            <div className="story-box pre-match-intel">
              <h3>Pre-match Intelligence</h3>
              <p><strong>Context:</strong> {preview.context_summary ?? contextText(preview.match_context)}</p>
              <p>{previewContextEdgeText(preview)}</p>
              <div className="scoreline-grid">
                <span>Rating edge: {preview.rating_edge ?? '—'}</span><span>Style edge: {String(preview.style_edge ?? '—')}</span><span>Context edge: {preview.context_edge ?? '—'}</span><span>Pressure edge: {preview.pressure_edge ?? '—'}</span><span>Fatigue edge: {preview.fatigue_edge ?? '—'}</span><span>Volatility: {preview.volatility_index ?? '—'}</span><span>Closeness: {preview.expected_closeness ?? '—'}</span><span>Upset estimate: {pct(preview.upset_probability_estimate)}</span>
                {preview.expected_long_rally_share !== undefined && <span>Long-rally share: {pct(preview.expected_long_rally_share)}</span>}
                {preview.expected_pressure_point_share !== undefined && <span>Pressure-point share: {pct(preview.expected_pressure_point_share)}</span>}
                {preview.expected_clean_time_range && <span>Clean time range: {minutes(preview.expected_clean_time_range[0])}–{minutes(preview.expected_clean_time_range[1])}</span>}
                {preview.expected_broadcast_time_range && <span>Broadcast range: {minutes(preview.expected_broadcast_time_range[0])}–{minutes(preview.expected_broadcast_time_range[1])}</span>}
                {preview.expected_points_per_minute_range && <span>Points/min range: {preview.expected_points_per_minute_range[0]}–{preview.expected_points_per_minute_range[1]}</span>}
                {preview.expected_draw_risk !== undefined && <span>Draw risk: {pct(preview.expected_draw_risk)}</span>}
                {preview.expected_final_minute_importance !== undefined && <span>Final-minute importance: {pct(preview.expected_final_minute_importance)}</span>}
              </div>
              {preview.tactical_preview && <p>{preview.tactical_preview}</p>}
              {preview.likely_clock_pattern && <p>{preview.likely_clock_pattern}</p>}
              {preview.key_advantages?.length ? <p><strong>Key advantages:</strong> {preview.key_advantages.join(' · ')}</p> : null}
              {preview.risk_factors?.length ? <p><strong>Risk factors:</strong> {preview.risk_factors.join(' · ')}</p> : null}
            </div>
            {preview.match_type === 'league_timed_3x5' ? (
              <>
                <div className="ratings-grid">
                  <div className="rating-card featured"><span>{preview.player_a.name}</span><strong>{pct(preview.player_a_win_probability)}</strong><p>Win probability</p></div>
                  <div className="rating-card featured"><span>{preview.player_b.name}</span><strong>{pct(preview.player_b_win_probability)}</strong><p>Win probability</p></div>
                  <div className="rating-card featured"><span>Draw</span><strong>{pct(preview.draw_probability)}</strong><p>Match draw probability.</p></div>
                  <div className="rating-card"><span>Expected points</span><strong>{preview.expected_total_points}</strong><p>Total scoring points.</p></div>
                  <div className="rating-card"><span>Points/min</span><strong>{preview.expected_points_per_minute}</strong><p>Timed scoring pace.</p></div>
                  <div className="rating-card"><span>Final-minute decider</span><strong>{pct(preview.final_minute_decider_probability)}</strong><p>At least one set decided late.</p></div>
                  <div className="rating-card"><span>One drawn set</span><strong>{pct(preview.one_drawn_set_probability)}</strong><p>Exactly one tied set.</p></div>
                  <div className="rating-card"><span>Match draw</span><strong>{pct(preview.match_draw_probability)}</strong><p>Equal set wins after 3 sets.</p></div>
                </div>
                <div className="scoreline-grid">
                  <span>{preview.player_a.name} 3-0: {pct(preview.player_a_3_0_sets)}</span>
                  <span>{preview.player_a.name} 2-1: {pct(preview.player_a_2_1_sets)}</span>
                  <span>{preview.player_b.name} 3-0: {pct(preview.player_b_3_0_sets)}</span>
                  <span>{preview.player_b.name} 2-1: {pct(preview.player_b_2_1_sets)}</span>
                  <span>2+ drawn sets: {pct(preview.two_or_more_drawn_sets_probability)}</span>
                  <span>Expected set scores: {preview.expected_set_scores?.map((score) => `${score[0]}-${score[1]}`).join(' · ')}</span>
                </div>
                <p>{preview.style_edge_summary}</p>
                <p>{preview.pace_edge_summary}</p>
                <p>{preview.pressure_edge_summary}</p>
                <p>{preview.league_suitability_summary}</p>
              </>
            ) : (
              <>
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
              </>
            )}
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
              <button className="primary-button" disabled={loading !== null || !result} onClick={saveGeneratedMatch} type="button">
                {loading === 'save' ? 'Saving…' : 'Save Match'}
              </button>
              {saveMessage && onOpenSavedMatches && (
                <button className="ghost-button" onClick={onOpenSavedMatches} type="button">Open Saved Matches</button>
              )}
              {saveMessage && !onOpenSavedMatches && <span className="seed-pill">Open the Saved Matches page to view it.</span>}
            </div>
          </div>
          <MatchResultView result={result} label="Generated result" />
        </>
      )}
    </section>
  );
}
