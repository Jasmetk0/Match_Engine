import { useEffect, useMemo, useState } from 'react';

import { MatchResultView } from '../components/MatchResultView';
import {
  deleteSavedMatch,
  getSavedMatch,
  listSavedMatches,
  SavedMatchDetail,
  SavedMatchSummary,
  updateSavedMatch,
} from '../services/api';

function minutes(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return '—';
  return `${(seconds / 60).toFixed(1)} min`;
}

function isDraw(match: SavedMatchSummary) {
  return match.winner_name_snapshot === 'Draw' && match.loser_name_snapshot === 'Draw';
}

function generatedTitle(match: SavedMatchSummary) {
  if (isDraw(match)) {
    return `Match drawn ${match.match_score_text} · ${match.match_type}`;
  }
  return `${match.winner_name_snapshot} def. ${match.loser_name_snapshot} ${match.match_score_text} · ${match.match_type}`;
}

function resultLine(match: SavedMatchSummary) {
  return isDraw(match) ? `Match drawn · ${match.match_score_text}` : `Winner: ${match.winner_name_snapshot} · ${match.match_score_text}`;
}

function createdDate(value: string) {
  return new Date(value).toLocaleString();
}

export function SavedMatches() {
  const [matches, setMatches] = useState<SavedMatchSummary[]>([]);
  const [selected, setSelected] = useState<SavedMatchDetail | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'tour_bo5' | 'league_timed_3x5' | 'draws'>('all');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState<'list' | 'detail' | 'update' | 'delete' | null>('list');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadList(selectId?: number) {
    setLoading('list');
    const loaded = await listSavedMatches();
    setMatches(loaded);
    if (selectId) {
      const detail = await getSavedMatch(selectId);
      setSelected(detail);
      setTitle(detail.title ?? '');
      setNotes(detail.notes ?? '');
    } else if (selected && !loaded.some((match) => match.id === selected.id)) {
      setSelected(null);
    }
  }

  useEffect(() => {
    loadList().catch((err) => setError(err instanceof Error ? err.message : 'Could not load saved matches')).finally(() => setLoading(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return matches.filter((match) => {
      const matchesType =
        typeFilter === 'all' ||
        (typeFilter === 'draws' ? isDraw(match) : match.match_type === typeFilter);
      if (!matchesType) return false;
      if (!needle) return true;
      return [
        match.title ?? generatedTitle(match),
        match.player_a_name_snapshot,
        match.player_b_name_snapshot,
        match.winner_name_snapshot,
        match.loser_name_snapshot,
        match.match_score_text,
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [matches, query, typeFilter]);

  async function openMatch(matchId: number) {
    try {
      setError(null);
      setMessage(null);
      setLoading('detail');
      const detail = await getSavedMatch(matchId);
      setSelected(detail);
      setTitle(detail.title ?? '');
      setNotes(detail.notes ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open saved match');
    } finally {
      setLoading(null);
    }
  }

  async function saveMeta() {
    if (!selected) return;
    try {
      setError(null);
      setMessage(null);
      setLoading('update');
      const updated = await updateSavedMatch(selected.id, { title, notes });
      setSelected(updated);
      setMessage(`Updated match #${updated.id}.`);
      const loaded = await listSavedMatches();
      setMatches(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update saved match');
    } finally {
      setLoading(null);
    }
  }

  async function removeSelected() {
    if (!selected) return;
    if (!window.confirm(`Delete saved match #${selected.id}? This cannot be undone.`)) return;
    try {
      setError(null);
      setMessage(null);
      setLoading('delete');
      await deleteSavedMatch(selected.id);
      setSelected(null);
      setTitle('');
      setNotes('');
      setMessage('Saved match deleted.');
      const loaded = await listSavedMatches();
      setMatches(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete saved match');
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="players-page saved-matches-page">
      <div className="section-heading top-heading">
        <div>
          <p className="eyebrow">History</p>
          <h1>Saved Matches</h1>
          <p>Browse historical match simulations exactly as they were generated, including snapshots, stats, story and rally log.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <div className="saved-matches-layout">
        <div className="roster-card saved-list-card">
          <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, player or score" />
          <label className="field-label saved-filter">
            <span>Filter</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
              <option value="all">All match types</option>
              <option value="tour_bo5">Tour BO5</option>
              <option value="league_timed_3x5">League Timed 3x5</option>
              <option value="draws">Draws only</option>
            </select>
          </label>
          <div className="player-table saved-match-list">
            {loading === 'list' && <div className="empty-state"><p>Loading saved matches…</p></div>}
            {!loading && filtered.length === 0 && <div className="empty-state"><p>No saved matches found.</p></div>}
            {filtered.map((match) => (
              <button
                className={selected?.id === match.id ? 'player-row saved-match-row active' : 'player-row saved-match-row'}
                key={match.id}
                onClick={() => openMatch(match.id)}
                type="button"
              >
                <strong>{match.title || generatedTitle(match)}</strong>
                <span>{match.player_a_name_snapshot} vs {match.player_b_name_snapshot}</span>
                <span>{resultLine(match)}</span>
                <span>{minutes(match.total_duration_seconds)} · {match.total_points ?? '—'} points · {createdDate(match.created_at)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="saved-detail-column">
          {!selected && (
            <div className="editor-card empty-state">
              <p>Select a saved match to view the full report.</p>
            </div>
          )}

          {selected && (
            <>
              <div className="editor-card saved-detail-summary">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Saved match #{selected.id}</p>
                    <h2>{isDraw(selected) ? `Match drawn ${selected.match_score_text}` : `${selected.winner_name_snapshot} wins ${selected.match_score_text}`}</h2>
                    <p>{selected.player_a_name_snapshot} vs {selected.player_b_name_snapshot}</p>
                  </div>
                  <span className="seed-pill">Seed {selected.seed}</span>
                </div>
                <div className="scoreline-grid">
                  <span>Match type: {selected.match_type}</span>
                  <span>Clean time: {minutes(selected.result?.stats?.clean_rally_time_seconds ?? selected.total_duration_seconds)}</span>
                  <span>Broadcast estimate: {minutes(selected.result?.stats?.estimated_broadcast_duration_seconds)}</span>
                  <span>Total points: {selected.total_points ?? '—'}</span>
                  <span>Created: {createdDate(selected.created_at)}</span>
                </div>
                <div className="form-grid save-form-grid">
                  <label className="field-label">
                    <span>Title</span>
                    <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={generatedTitle(selected)} />
                  </label>
                  <label className="field-label wide-field">
                    <span>Notes</span>
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional saved match notes" />
                  </label>
                </div>
                <div className="button-row match-actions">
                  <button className="primary-button" disabled={loading !== null} onClick={saveMeta} type="button">
                    {loading === 'update' ? 'Saving…' : 'Save Title/Notes'}
                  </button>
                  <button className="danger-button" disabled={loading !== null} onClick={removeSelected} type="button">
                    {loading === 'delete' ? 'Deleting…' : 'Delete Saved Match'}
                  </button>
                </div>
              </div>

              <MatchResultView result={selected.result} label="Saved result" />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
