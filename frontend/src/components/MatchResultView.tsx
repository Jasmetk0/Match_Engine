import { useState } from 'react';

import { MatchGenerateResponse } from '../services/api';

function minutes(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  return `${(seconds / 60).toFixed(1)} min`;
}

function statPair(value: unknown) {
  if (!value || typeof value !== 'object') return '—';
  return Object.values(value as Record<string, unknown>).join(' / ');
}

function totalPoints(result: MatchGenerateResponse) {
  const points = result.stats?.total_points;
  if (!points || typeof points !== 'object') return '—';
  return Object.values(points as Record<string, unknown>).reduce((sum: number, value) => sum + Number(value), 0);
}

function makeNameLookup(result: MatchGenerateResponse) {
  return new Map<number, string>([
    [result.player_a.profile_id, result.player_a.name],
    [result.player_b.profile_id, result.player_b.name],
  ]);
}

function profileName(id: number | null, names: Map<number, string>) {
  if (id === null) return 'Draw';
  return names.get(id) ?? `Profile ${id}`;
}


function humanContext(context: Record<string, unknown> | undefined) {
  if (!context) return 'Not recorded';
  return Object.entries(context).map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value).replace(/_/g, ' ')}`).join('; ');
}

function scoreText(score: number[] | null | undefined) {
  return Array.isArray(score) ? score.join('-') : '—';
}

function valueText(value: unknown, suffix = '') {
  return value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
}

function matchReport(result: MatchGenerateResponse) {
  const stats = result.stats ?? {};
  const story = result.story ?? {};
  const why = result.explanation_breakdown ?? {};
  const keyRallies = result.key_rallies ?? [];
  return [
    `MATCH REPORT: ${result.player_a.name} vs ${result.player_b.name}`,
    `Match type: ${result.match_type}`,
    `Context: ${humanContext(result.match_context as Record<string, unknown> | undefined)}`,
    `Seed: ${result.seed}`,
    `Final result: ${result.is_draw || !result.winner ? 'Draw' : `${result.winner.name} defeated ${result.loser?.name ?? 'opponent'}`} ${result.match_score_text}`,
    `Game/set scores: ${(result.games ?? []).map((g) => scoreText(g.score)).join(', ') || 'Not recorded.'}`,
    `Clean time: ${minutes(stats.clean_rally_time_seconds ?? stats.total_duration_seconds)}; broadcast estimate: ${minutes(stats.estimated_broadcast_duration_seconds)}`,
    `Key stats: total points ${totalPoints(result)}, average rally ${stats.average_rally_shots ?? '—'} shots, winners ${statPair(stats.winners)}, errors ${statPair(stats.unforced_errors_committed)}.`,
    '',
    'Story:',
    Object.values(story).filter(Boolean).join('\n'),
    '',
    'Why this result happened:',
    Object.entries(why).map(([key, value]) => `- ${key.replace(/_/g, ' ')}: ${value}`).join('\n') || 'Not recorded.',
    '',
    'Key rallies:',
    keyRallies.map((rally) => `- ${rally.reason || 'Key moment'}: Game ${valueText(rally.game_number)}, Rally ${valueText(rally.rally_number)}, ${scoreText(rally.score_before)} before; ${valueText(rally.winner)} won by ${valueText(rally.terminal_type)} after ${valueText(rally.rally_shots)} shots (${valueText(rally.rally_duration_seconds, 's')}). ${rally.explanation ?? ''}`.trim()).join('\n') || 'Not recorded.',
  ].join('\n');
}

function namedPair(value: unknown, names: Map<number, string>) {
  if (!value || typeof value !== 'object') return '—';
  return Object.entries(value as Record<string, unknown>)
    .map(([id, entry]) => `${names.get(Number(id)) ?? `Profile ${id}`}: ${entry}`)
    .join(' / ');
}

type MatchResultViewProps = {
  result: MatchGenerateResponse;
  label?: string;
  defaultRallyOpen?: boolean;
};

export function MatchResultView({ result, label = 'Match result', defaultRallyOpen = true }: MatchResultViewProps) {
  const names = makeNameLookup(result);
  const stats = result.stats ?? {};
  const story = result.story ?? {};
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const rallies = result.rallies ?? [];
  const games = result.games ?? [];
  const hasClock = rallies.some((rally) => rally.game_clock_before_seconds !== undefined);
  const headline = result.is_draw || !result.winner ? `Match drawn ${result.match_score_text}` : `${result.winner.name} wins ${result.match_score_text}`;
  const winnerRating = result.winner ? stats.performance_rating?.[String(result.winner.profile_id)] : undefined;
  const loserRating = result.loser ? stats.performance_rating?.[String(result.loser.profile_id)] : undefined;

  async function copyMatchReport() {
    try {
      await navigator.clipboard.writeText(matchReport(result));
      setCopyMessage('Readable match report copied.');
    } catch (error) {
      setCopyMessage('Could not copy report automatically. Browser clipboard permissions may be blocked.');
    }
    window.setTimeout(() => setCopyMessage(null), 3000);
  }

  async function copyMatchJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopyMessage('Match JSON copied.');
    } catch (error) {
      setCopyMessage('Could not copy JSON automatically. Browser clipboard permissions may be blocked.');
    }
    window.setTimeout(() => setCopyMessage(null), 3000);
  }

  return (
    <div className="detail-stack generated-result">
      <div className="editor-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{label}</p>
            <h2>{headline}</h2>
          </div>
          <div className="button-row">
            <span className="seed-pill">Seed {result.seed}</span>
            <button className="ghost-button" onClick={copyMatchReport} type="button">Copy Match Report</button><button className="ghost-button" onClick={copyMatchJson} type="button">Copy Match JSON</button>
          </div>
        </div>
        {copyMessage && <div className="success-banner compact-banner">{copyMessage}</div>}
        <div className="match-meta-line">
          <span>{result.match_type}</span>
          <span>{result.player_a.name} vs {result.player_b.name}</span>
          <span>Context: {story.context_summary ?? humanContext(result.match_context as Record<string, unknown> | undefined)}</span>
        </div>
        <div className="scoreline-grid game-score-grid">
          {games.map((game) => <span key={game.game_number}>Game {game.game_number}: {scoreText(game.score)} · {game.is_draw ? 'Drawn set' : profileName(game.winner_profile_id, names)}{game.duration_seconds ? ` · ${game.duration_seconds.toFixed(1)}s clean` : ''}</span>)}
        </div>
        <div className="ratings-grid">
          <div className="rating-card"><span>Clean time</span><strong>{minutes(stats.clean_rally_time_seconds ?? stats.total_duration_seconds)}</strong></div>
          <div className="rating-card"><span>Broadcast estimate</span><strong>{minutes(stats.estimated_broadcast_duration_seconds)}</strong></div>
          <div className="rating-card"><span>Total points</span><strong>{totalPoints(result)}</strong></div>
          <div className="rating-card"><span>Avg rally shots</span><strong>{stats.average_rally_shots ?? '—'}</strong></div>
          <div className="rating-card"><span>Longest rally</span><strong>{stats.longest_rally_shots ?? '—'} shots</strong></div>
          <div className="rating-card"><span>Winners</span><strong>{statPair(stats.winners)}</strong></div>
          <div className="rating-card"><span>Unforced errors</span><strong>{statPair(stats.unforced_errors_committed)}</strong></div>
          <div className="rating-card"><span>Pressure points</span><strong>{statPair(stats.pressure_points_won ?? stats.clock_pressure_points_won)}</strong></div>
          <div className="rating-card"><span>Lets</span><strong>{stats.total_lets ?? '—'}</strong></div>
          {stats.points_per_minute !== undefined && <div className="rating-card"><span>Points/min</span><strong>{stats.points_per_minute}</strong></div>}
          {stats.drawn_sets !== undefined && <div className="rating-card"><span>Drawn sets</span><strong>{stats.drawn_sets}</strong></div>}
          {stats.final_minute_points_won && <div className="rating-card"><span>Final minute points</span><strong>{statPair(stats.final_minute_points_won)}</strong></div>}
          {stats.lead_changes_by_set && <div className="rating-card"><span>Lead changes</span><strong>{stats.lead_changes_by_set.join(' / ')}</strong></div>}
        </div>
        <details className="diagnostics-panel">
          <summary>Match Diagnostics</summary>
          <div className="diagnostics-grid">
            <span>Match type: <strong>{result.match_type}</strong></span>
            <span>Seed: <strong>{result.seed}</strong></span>
            <span>Total points: <strong>{totalPoints(result)}</strong></span>
            <span>Clean time: <strong>{minutes(stats.clean_rally_time_seconds ?? stats.total_duration_seconds)}</strong></span>
            <span>Broadcast time: <strong>{minutes(stats.estimated_broadcast_duration_seconds)}</strong></span>
            <span>Avg rally shots: <strong>{stats.average_rally_shots ?? '—'}</strong></span>
            <span>Avg rally duration: <strong>{stats.average_rally_duration_seconds ?? '—'}s</strong></span>
            <span>Longest rally shots: <strong>{stats.longest_rally_shots ?? '—'}</strong></span>
            <span>Longest rally seconds: <strong>{stats.longest_rally_seconds ?? '—'}s</strong></span>
            <span>Total lets: <strong>{stats.total_lets ?? '—'}</strong></span>
            {result.winner && <span>Winner / loser performance: <strong>{winnerRating ?? '—'} / {loserRating ?? '—'}</strong></span>}
            <span>Fatigue final: <strong>{namedPair(stats.fatigue_final, names)}</strong></span>
            <span>Styles: <strong>{result.player_a.name}: {result.player_a.play_style} / {result.player_b.name}: {result.player_b.play_style}</strong></span>
            <span>Context: <strong>{story.context_summary ?? humanContext(result.match_context as Record<string, unknown> | undefined)}</strong></span>
            {stats.points_per_minute !== undefined && <span>Points per minute: <strong>{stats.points_per_minute}</strong></span>}
            {stats.drawn_sets !== undefined && <span>Drawn sets: <strong>{stats.drawn_sets}</strong></span>}
            {stats.final_minute_points_won && <span>Final minute points: <strong>{namedPair(stats.final_minute_points_won, names)}</strong></span>}
            {stats.lead_changes_by_set && <span>Lead changes by set: <strong>{stats.lead_changes_by_set.join(' / ')}</strong></span>}
            {stats.clock_pressure_points_won && <span>Clock pressure points: <strong>{namedPair(stats.clock_pressure_points_won, names)}</strong></span>}
            {result.calibration_debug && Object.entries(result.calibration_debug).map(([key, value]) => (
              <span key={key}>Calibration {key.replace(/_/g, ' ')}: <strong>{String(value)}</strong></span>
            ))}
          </div>
        </details>
        <div className="story-box">
          <h3>{story.headline}</h3>
          <p>{story.key_factor}</p>
          <p>{story.turning_point}</p>
          <p>{story.style_summary}</p>
          {story.pace_summary && <p>{story.pace_summary}</p>}
          {story.clock_summary && <p>{story.clock_summary}</p>}
          {story.final_minute_summary && <p>{story.final_minute_summary}</p>}
          <p>{story.fatigue_summary}</p>
          <p>{story.pressure_summary}</p>
          <p>{story.explanation}</p>
        </div>
        {result.explanation_breakdown && (
          <div className="story-box">
            <h3>Why this result happened</h3>
            {Object.entries(result.explanation_breakdown).map(([key, value]) => <p key={key}><strong>{key.replace(/_/g, ' ')}:</strong> {value}</p>)}
          </div>
        )}
        {result.key_rallies?.length ? (
          <details className="diagnostics-panel" open>
            <summary>Key Rallies</summary>
            <div className="rally-table-wrap">
              <table className="rally-table"><thead><tr><th>Reason</th><th>Game</th><th>Rally</th><th>Before</th><th>Winner</th><th>Terminal</th><th>Shots</th><th>Duration</th><th>Explanation</th></tr></thead><tbody>
                {result.key_rallies.map((rally, index) => <tr key={`${rally.game_number ?? 'game'}-${rally.rally_number ?? 'rally'}-${index}`}><td>{rally.reason || 'Key moment'}</td><td>{valueText(rally.game_number)}</td><td>{valueText(rally.rally_number)}</td><td>{scoreText(rally.score_before)}</td><td>{valueText(rally.winner)}</td><td>{valueText(rally.terminal_type)}</td><td>{valueText(rally.rally_shots)}</td><td>{valueText(rally.rally_duration_seconds, 's')}</td><td>{rally.explanation ?? '—'}</td></tr>)}
              </tbody></table>
            </div>
          </details>
        ) : null}
      </div>

      <details className="editor-card rally-log" open={defaultRallyOpen}>
        <summary>Full rally log ({rallies.length} events)</summary>
        <div className="rally-table-wrap">
          <table className="rally-table">
            <thead>
              <tr>
                <th>Game</th><th>Rally</th><th>Before</th><th>Winner</th>{hasClock && <th>Clock before</th>}{hasClock && <th>Clock after</th>}{hasClock && <th>Remaining</th>}{hasClock && <th>Clock phase</th>}<th>Shots</th><th>Duration</th><th>Terminal</th><th>Pattern</th><th>Pressure</th><th>Explanation</th>
              </tr>
            </thead>
            <tbody>
              {rallies.map((rally, index) => (
                <tr key={`${rally.game_number}-${rally.rally_number}-${rally.terminal_type}-${index}`}>
                  <td>{rally.game_number}</td>
                  <td>{rally.rally_number}</td>
                  <td>{scoreText(rally.score_before)}</td>
                  <td>{rally.terminal_type === 'let_replayed' ? 'Let' : profileName(rally.winner_profile_id, names)}</td>
                  {hasClock && <td>{rally.game_clock_before_seconds?.toFixed(1)}s</td>}
                  {hasClock && <td>{rally.game_clock_after_seconds?.toFixed(1)}s</td>}
                  {hasClock && <td>{rally.seconds_remaining_after?.toFixed(1)}s</td>}
                  {hasClock && <td>{rally.clock_phase ?? '—'}</td>}
                  <td>{rally.rally_shots}</td>
                  <td>{rally.rally_duration_seconds}s</td>
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
  );
}
