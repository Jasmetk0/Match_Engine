import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';

import {
  createPlayer,
  createProfile,
  deletePlayer,
  deleteProfile,
  duplicateProfile,
  getPlayer,
  listPlayers,
  Player,
  PlayerAttributes,
  PlayerPayload,
  PlayerWithProfiles,
  SeasonProfile,
  SeasonProfilePayload,
  seedSampleData,
  updatePlayer,
  updateProfile,
} from '../services/api';

const attributeGroups: { title: string; fields: (keyof PlayerAttributes)[] }[] = [
  {
    title: 'Technical Control',
    fields: ['serve_pressure', 'return_initiative', 'length_quality', 'width_control', 'volley_takeover', 'front_court_touch'],
  },
  {
    title: 'Athletic Engine',
    fields: ['finishing_power', 'first_step_cod', 't_recovery', 'aerobic_repeatability', 'recovery_efficiency', 'durability'],
  },
  {
    title: 'Squash IQ / Mental',
    fields: ['anticipation', 'shot_selection', 'adaptability', 'composure', 'error_discipline', 'deception_creativity'],
  },
];

const defaultAttributes: PlayerAttributes = {
  serve_pressure: 50,
  return_initiative: 50,
  length_quality: 50,
  width_control: 50,
  volley_takeover: 50,
  front_court_touch: 50,
  finishing_power: 50,
  first_step_cod: 50,
  t_recovery: 50,
  aerobic_repeatability: 50,
  recovery_efficiency: 50,
  anticipation: 50,
  shot_selection: 50,
  adaptability: 50,
  composure: 50,
  error_discipline: 50,
  deception_creativity: 50,
  durability: 50,
};

const newProfile = (): SeasonProfilePayload => ({
  season_year: new Date().getFullYear(),
  age: null,
  play_style: 'All-Rounder',
  career_personality: 'Stable Grinder',
  match_mentality: 'Mentally Tough',
  progression_type: 'Standard',
  form: 50,
  confidence: 50,
  fatigue: 0,
  injury_status: 'Fresh',
  skill_environment: 1,
  notes: '',
  attributes: defaultAttributes,
});

const emptyPlayer: PlayerPayload = {
  name: '',
  nationality: 'Unknown',
  birth_year: null,
  height_cm: null,
  weight_kg: null,
  handedness: 'right',
  backhand_type: '',
  nickname: '',
  popularity: 50,
  leadership: 50,
  notes: '',
};

function numberOrNull(value: FormDataEntryValue | null) {
  if (value === null || value === '') return null;
  return Number(value);
}

function rating(value: FormDataEntryValue | null, fallback = 50) {
  if (value === null || value === '') return fallback;
  return Math.max(0, Math.min(100, Number(value)));
}

function Input({ label, name, defaultValue, type = 'text', min, max, step }: { label: string; name: string; defaultValue?: string | number | null; type?: string; min?: number; max?: number; step?: string }) {
  return (
    <label className="field-label">
      <span>{label}</span>
      <input defaultValue={defaultValue ?? ''} max={max} min={min} name={name} step={step} type={type} />
    </label>
  );
}

function Select({ label, name, defaultValue, children }: { label: string; name: string; defaultValue?: string; children: ReactNode }) {
  return (
    <label className="field-label">
      <span>{label}</span>
      <select defaultValue={defaultValue} name={name}>{children}</select>
    </label>
  );
}

function PlayerForm({ player, onSave, onDelete }: { player: PlayerPayload; onSave: (payload: PlayerPayload) => Promise<void>; onDelete?: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    await onSave({
      name: String(form.get('name') ?? ''),
      nationality: String(form.get('nationality') || 'Unknown'),
      birth_year: numberOrNull(form.get('birth_year')),
      height_cm: numberOrNull(form.get('height_cm')),
      weight_kg: numberOrNull(form.get('weight_kg')),
      handedness: form.get('handedness') as 'right' | 'left',
      backhand_type: String(form.get('backhand_type') ?? ''),
      nickname: String(form.get('nickname') ?? ''),
      popularity: rating(form.get('popularity')),
      leadership: rating(form.get('leadership')),
      notes: String(form.get('notes') ?? ''),
    });
    setSaving(false);
  }

  return (
    <form className="editor-card" onSubmit={submit}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Identity</p>
          <h2>{player.name || 'Add Player'}</h2>
        </div>
        <div className="button-row">
          {onDelete && <button className="danger-button" onClick={onDelete} type="button">Delete player</button>}
          <button className="primary-button" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save player'}</button>
        </div>
      </div>
      <div className="form-grid">
        <Input defaultValue={player.name} label="Name" name="name" />
        <Input defaultValue={player.nationality} label="Nationality" name="nationality" />
        <Input defaultValue={player.nickname} label="Nickname" name="nickname" />
        <Select defaultValue={player.handedness ?? 'right'} label="Handedness" name="handedness"><option value="right">right</option><option value="left">left</option></Select>
        <Input defaultValue={player.backhand_type} label="Backhand type" name="backhand_type" />
        <Input defaultValue={player.birth_year} label="Birth year" name="birth_year" type="number" />
        <Input defaultValue={player.height_cm} label="Height cm" name="height_cm" type="number" />
        <Input defaultValue={player.weight_kg} label="Weight kg" name="weight_kg" type="number" />
        <Input defaultValue={player.popularity ?? 50} label="Popularity" max={100} min={0} name="popularity" type="number" />
        <Input defaultValue={player.leadership ?? 50} label="Leadership" max={100} min={0} name="leadership" type="number" />
      </div>
      <label className="field-label wide-field"><span>Notes</span><textarea defaultValue={player.notes ?? ''} name="notes" /></label>
    </form>
  );
}

function ProfileEditor({ profile, onSave, onDelete, onDuplicate }: { profile: SeasonProfile | SeasonProfilePayload; onSave: (payload: SeasonProfilePayload) => Promise<void>; onDelete?: () => Promise<void>; onDuplicate?: (seasonYear: number) => Promise<void> }) {
  const [duplicateYear, setDuplicateYear] = useState((profile.season_year ?? new Date().getFullYear()) + 1);
  const attributes = { ...defaultAttributes, ...(profile.attributes ?? {}) };
  const savedProfile = 'id' in profile ? profile : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextAttributes = Object.fromEntries(
      Object.keys(defaultAttributes).map((key) => [key, rating(form.get(key))]),
    ) as unknown as PlayerAttributes;
    await onSave({
      season_year: Number(form.get('season_year')),
      age: numberOrNull(form.get('age')),
      play_style: String(form.get('play_style') || 'All-Rounder'),
      career_personality: String(form.get('career_personality') || 'Stable Grinder'),
      match_mentality: String(form.get('match_mentality') || 'Mentally Tough'),
      progression_type: String(form.get('progression_type') || 'Standard'),
      form: rating(form.get('form')),
      confidence: rating(form.get('confidence')),
      fatigue: rating(form.get('fatigue'), 0),
      injury_status: form.get('injury_status') as 'Fresh' | 'Managed' | 'Worn' | 'Compromised',
      skill_environment: Number(form.get('skill_environment') || 1),
      notes: String(form.get('notes') ?? ''),
      attributes: nextAttributes,
    });
  }

  return (
    <form className="editor-card" onSubmit={submit}>
      <div className="section-heading">
        <div><p className="eyebrow">Season profile</p><h2>{profile.season_year ?? 'New season'}</h2></div>
        <div className="button-row"><button className="primary-button" type="submit">Save profile</button>{onDelete && <button className="danger-button" onClick={onDelete} type="button">Delete</button>}</div>
      </div>

      {savedProfile && (
        <div className="ratings-grid">
          <div className="rating-card featured"><span>Tournament</span><strong>{savedProfile.tournament_rating}</strong></div>
          <div className="rating-card featured"><span>League</span><strong>{savedProfile.league_rating}</strong></div>
          {(['technical', 'physical', 'tactical', 'mental', 'attacking', 'defensive'] as const).map((name) => (
            <div className="rating-card" key={name}><span>{name}</span><strong>{savedProfile[`${name}_rating`]}</strong></div>
          ))}
        </div>
      )}

      <div className="form-grid">
        <Input defaultValue={profile.season_year} label="Season year" max={2200} min={1900} name="season_year" type="number" />
        <Input defaultValue={profile.age} label="Age" name="age" type="number" />
        <Input defaultValue={profile.play_style} label="Play style" name="play_style" />
        <Input defaultValue={profile.career_personality} label="Career personality" name="career_personality" />
        <Input defaultValue={profile.match_mentality} label="Match mentality" name="match_mentality" />
        <Input defaultValue={profile.progression_type} label="Progression type" name="progression_type" />
        <Input defaultValue={profile.form} label="Form" max={100} min={0} name="form" type="number" />
        <Input defaultValue={profile.confidence} label="Confidence" max={100} min={0} name="confidence" type="number" />
        <Input defaultValue={profile.fatigue} label="Fatigue" max={100} min={0} name="fatigue" type="number" />
        <Select defaultValue={profile.injury_status ?? 'Fresh'} label="Injury status" name="injury_status"><option>Fresh</option><option>Managed</option><option>Worn</option><option>Compromised</option></Select>
        <Input defaultValue={profile.skill_environment} label="Skill environment" name="skill_environment" step="0.001" type="number" />
      </div>
      <label className="field-label wide-field"><span>Profile notes</span><textarea defaultValue={profile.notes ?? ''} name="notes" /></label>

      {attributeGroups.map((group) => (
        <div className="attribute-group" key={group.title}>
          <h3>{group.title}</h3>
          <div className="form-grid compact-grid">
            {group.fields.map((field) => <Input defaultValue={attributes[field]} key={field} label={field.replace(/_/g, ' ')} max={100} min={0} name={field} type="number" />)}
          </div>
        </div>
      ))}

      {onDuplicate && (
        <div className="duplicate-row">
          <label className="field-label"><span>Duplicate to season</span><input max={2200} min={1900} onChange={(event) => setDuplicateYear(Number(event.target.value))} type="number" value={duplicateYear} /></label>
          <button className="ghost-button" onClick={() => onDuplicate(duplicateYear)} type="button">Duplicate profile</button>
        </div>
      )}
    </form>
  );
}

export function Players() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<PlayerWithProfiles | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newSeason, setNewSeason] = useState<SeasonProfilePayload | null>(null);

  async function refresh(selectedId = selected?.id) {
    const roster = await listPlayers();
    setPlayers(roster);
    if (selectedId) setSelected(await getPlayer(selectedId));
  }

  useEffect(() => { refresh(undefined).catch((err: Error) => setError(err.message)); }, []);

  const filtered = useMemo(() => players.filter((player) => `${player.name} ${player.nationality}`.toLowerCase().includes(filter.toLowerCase())), [players, filter]);

  async function safe(action: () => Promise<void>) {
    try { setError(null); await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Unknown error'); }
  }

  return (
    <section className="players-page">
      <div className="section-heading top-heading">
        <div><p className="eyebrow">Roster setup</p><h1>Players</h1><p>Manage stable player identities plus season-specific profiles, attributes, and derived ratings.</p></div>
        <div className="button-row"><button className="ghost-button" onClick={() => safe(async () => { await seedSampleData(); await refresh(); })} type="button">Seed sample data</button><button className="primary-button" onClick={() => { setAdding(true); setSelected(null); }} type="button">Add Player</button></div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="players-layout">
        <aside className="roster-card">
          <input className="search-input" onChange={(event) => setFilter(event.target.value)} placeholder="Search name or nationality" value={filter} />
          <div className="player-table">
            {filtered.map((player) => (
              <button className={selected?.id === player.id ? 'player-row active' : 'player-row'} key={player.id} onClick={() => safe(async () => { setAdding(false); setNewSeason(null); setSelected(await getPlayer(player.id)); })} type="button">
                <strong>{player.name}</strong><span>{player.nationality}</span><span>{player.profile_count} profiles</span><span>{player.latest_season ?? '—'} · T {player.latest_tournament_rating ?? '—'} / L {player.latest_league_rating ?? '—'}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="detail-stack">
          {adding && <PlayerForm player={emptyPlayer} onSave={(payload) => safe(async () => { const created = await createPlayer(payload); setAdding(false); await refresh(created.id); })} />}

          {selected && (
            <>
              <PlayerForm player={selected} onDelete={() => safe(async () => { if (confirm(`Delete ${selected.name}?`)) { await deletePlayer(selected.id); setSelected(null); await refresh(undefined); } })} onSave={(payload) => safe(async () => { await updatePlayer(selected.id, payload); await refresh(selected.id); })} />
              <div className="section-heading"><h2>Season profiles</h2><button className="ghost-button" onClick={() => setNewSeason(newProfile())} type="button">Add season profile</button></div>
              {newSeason && <ProfileEditor profile={newSeason} onSave={(payload) => safe(async () => { await createProfile(selected.id, payload); setNewSeason(null); await refresh(selected.id); })} />}
              {selected.profiles.map((profile) => (
                <ProfileEditor
                  key={profile.id}
                  profile={profile}
                  onDelete={() => safe(async () => { if (confirm(`Delete ${profile.season_year} profile?`)) { await deleteProfile(profile.id); await refresh(selected.id); } })}
                  onDuplicate={(seasonYear) => safe(async () => { await duplicateProfile(profile.id, { season_year: seasonYear, apply_skill_inflation: true }); await refresh(selected.id); })}
                  onSave={(payload) => safe(async () => { await updateProfile(profile.id, payload); await refresh(selected.id); })}
                />
              ))}
            </>
          )}

          {!adding && !selected && <div className="editor-card empty-state"><h2>Select a player</h2><p>Choose a roster row, add a player, or seed the fictional sample roster.</p></div>}
        </div>
      </div>
    </section>
  );
}
