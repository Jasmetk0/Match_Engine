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
  if (id === null) return 'Let';
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

  return (
    <div className="detail-stack generated-result">
      <div className="editor-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{label}</p>
            <h2>{result.winner.name} wins {result.match_score_text}</h2>
          </div>
          <span className="seed-pill">Seed {result.seed}</span>
        </div>
        <div className="match-meta-line">
          <span>{result.match_type}</span>
          <span>{result.player_a.name} vs {result.player_b.name}</span>
        </div>
        <div className="scoreline-grid game-score-grid">
          {result.games.map((game) => <span key={game.game_number}>Game {game.game_number}: {game.score[0]}-{game.score[1]} · {profileName(game.winner_profile_id, names)}</span>)}
        </div>
        <div className="ratings-grid">
          <div className="rating-card"><span>Duration</span><strong>{minutes(stats.total_duration_seconds)}</strong></div>
          <div className="rating-card"><span>Total points</span><strong>{totalPoints(result)}</strong></div>
          <div className="rating-card"><span>Avg rally shots</span><strong>{stats.average_rally_shots ?? '—'}</strong></div>
          <div className="rating-card"><span>Longest rally</span><strong>{stats.longest_rally_shots ?? '—'}</strong></div>
          <div className="rating-card"><span>Winners</span><strong>{statPair(stats.winners)}</strong></div>
          <div className="rating-card"><span>Unforced errors</span><strong>{statPair(stats.unforced_errors_committed)}</strong></div>
          <div className="rating-card"><span>Pressure points</span><strong>{statPair(stats.pressure_points_won)}</strong></div>
          <div className="rating-card"><span>Lets</span><strong>{stats.total_lets ?? '—'}</strong></div>
        </div>
        <div className="story-box">
          <h3>{story.headline}</h3>
          <p>{story.key_factor}</p>
          <p>{story.turning_point}</p>
          <p>{story.style_summary}</p>
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
                <th>Game</th><th>Rally</th><th>Before</th><th>Winner</th><th>Shots</th><th>Duration</th><th>Terminal</th><th>Pattern</th><th>Pressure</th><th>Explanation</th>
              </tr>
            </thead>
            <tbody>
              {result.rallies.map((rally, index) => (
                <tr key={`${rally.game_number}-${rally.rally_number}-${rally.terminal_type}-${index}`}>
                  <td>{rally.game_number}</td>
                  <td>{rally.rally_number}</td>
                  <td>{rally.score_before.join('-')}</td>
                  <td>{profileName(rally.winner_profile_id, names)}</td>
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
