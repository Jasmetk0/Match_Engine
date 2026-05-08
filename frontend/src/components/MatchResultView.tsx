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

type MatchResultViewProps = {
  result: MatchGenerateResponse;
  label?: string;
  defaultRallyOpen?: boolean;
};

export function MatchResultView({ result, label = 'Match result', defaultRallyOpen = true }: MatchResultViewProps) {
  const names = makeNameLookup(result);
  const stats = result.stats ?? {};
  const story = result.story ?? {};
  const hasClock = result.rallies.some((rally) => rally.game_clock_before_seconds !== undefined);
  const headline = result.is_draw || !result.winner ? `Match drawn ${result.match_score_text}` : `${result.winner.name} wins ${result.match_score_text}`;

  return (
    <div className="detail-stack generated-result">
      <div className="editor-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{label}</p>
            <h2>{headline}</h2>
          </div>
          <span className="seed-pill">Seed {result.seed}</span>
        </div>
        <div className="match-meta-line">
          <span>{result.match_type}</span>
          <span>{result.player_a.name} vs {result.player_b.name}</span>
        </div>
        <div className="scoreline-grid game-score-grid">
          {result.games.map((game) => <span key={game.game_number}>Game {game.game_number}: {game.score[0]}-{game.score[1]} · {game.is_draw ? 'Drawn set' : profileName(game.winner_profile_id, names)}{game.duration_seconds ? ` · ${game.duration_seconds.toFixed(1)}s` : ''}</span>)}
        </div>
        <div className="ratings-grid">
          <div className="rating-card"><span>Duration</span><strong>{minutes(stats.total_duration_seconds)}</strong></div>
          <div className="rating-card"><span>Total points</span><strong>{totalPoints(result)}</strong></div>
          <div className="rating-card"><span>Avg rally shots</span><strong>{stats.average_rally_shots ?? '—'}</strong></div>
          <div className="rating-card"><span>Longest rally</span><strong>{stats.longest_rally_shots ?? '—'}</strong></div>
          <div className="rating-card"><span>Winners</span><strong>{statPair(stats.winners)}</strong></div>
          <div className="rating-card"><span>Unforced errors</span><strong>{statPair(stats.unforced_errors_committed)}</strong></div>
          <div className="rating-card"><span>Pressure points</span><strong>{statPair(stats.pressure_points_won ?? stats.clock_pressure_points_won)}</strong></div>
          <div className="rating-card"><span>Lets</span><strong>{stats.total_lets ?? '—'}</strong></div>
          {stats.points_per_minute !== undefined && <div className="rating-card"><span>Points/min</span><strong>{stats.points_per_minute}</strong></div>}
          {stats.drawn_sets !== undefined && <div className="rating-card"><span>Drawn sets</span><strong>{stats.drawn_sets}</strong></div>}
          {stats.final_minute_points_won && <div className="rating-card"><span>Final minute points</span><strong>{statPair(stats.final_minute_points_won)}</strong></div>}
          {stats.lead_changes_by_set && <div className="rating-card"><span>Lead changes</span><strong>{stats.lead_changes_by_set.join(' / ')}</strong></div>}
        </div>
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
      </div>

      <details className="editor-card rally-log" open={defaultRallyOpen}>
        <summary>Full rally log ({result.rallies.length} events)</summary>
        <div className="rally-table-wrap">
          <table className="rally-table">
            <thead>
              <tr>
                <th>Game</th><th>Rally</th><th>Before</th><th>Winner</th>{hasClock && <th>Clock before</th>}{hasClock && <th>Clock after</th>}{hasClock && <th>Remaining</th>}{hasClock && <th>Clock phase</th>}<th>Shots</th><th>Duration</th><th>Terminal</th><th>Pattern</th><th>Pressure</th><th>Explanation</th>
              </tr>
            </thead>
            <tbody>
              {result.rallies.map((rally, index) => (
                <tr key={`${rally.game_number}-${rally.rally_number}-${rally.terminal_type}-${index}`}>
                  <td>{rally.game_number}</td>
                  <td>{rally.rally_number}</td>
                  <td>{rally.score_before.join('-')}</td>
                  <td>{rally.terminal_type === 'let_replayed' ? 'Let' : profileName(rally.winner_profile_id, names)}</td>
                  {hasClock && <td>{rally.game_clock_before_seconds?.toFixed(1)}s</td>}
                  {hasClock && <td>{rally.game_clock_after_seconds?.toFixed(1)}s</td>}
                  {hasClock && <td>{rally.seconds_remaining_after?.toFixed(1)}s</td>}
                  {hasClock && <td>{rally.clock_phase}</td>}
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
  );
}
