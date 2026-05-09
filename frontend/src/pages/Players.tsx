import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';

import {
  createPlayer,
  createProfile,
  deletePlayer,
  deleteProfile,
  duplicateProfile,
  getPlayer,
  getPlayerAnalytics,
  listPlayers,
  Player,
  PlayerAttributes,
  PlayerPayload,
  PlayerWithProfiles,
  PlayerAnalytics,
  SeasonProfile,
  SeasonProfilePayload,
  resetSampleData,
  seedSampleData,
  updatePlayer,
  updateProfile,
} from '../services/api';
import { AttributeBars } from '../components/AttributeBars';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { RatingRadar } from '../components/RatingRadar';
import {
  AttributeKey,
  QualityPreset,
  attributeDescriptions,
  compareProfiles,
  generateAttributesFromPreset,
  normalizeAttributesToTarget,
  qualityPresets,
  randomFictionalName,
  randomPlayStyle,
} from '../utils/playerPresets';

const attributeGroups: { title: string; fields: AttributeKey[] }[] = [
  { title: 'Serve/Return', fields: ['serve_pressure', 'return_initiative'] },
  { title: 'Court Control', fields: ['length_quality', 'width_control', 'volley_takeover'] },
  { title: 'Attack', fields: ['front_court_touch', 'finishing_power', 'deception_creativity'] },
  { title: 'Movement', fields: ['first_step_cod', 't_recovery', 'anticipation'] },
  { title: 'Endurance/Recovery', fields: ['aerobic_repeatability', 'recovery_efficiency', 'durability'] },
  { title: 'Tactical/Mental', fields: ['shot_selection', 'adaptability', 'composure', 'error_discipline'] },
];


const playStyles = [
  'Volley Pressor', 'Relentless Retriever', 'Creative Magician', 'Tactical Controller',
  'Power Driver', 'Pressure Defender', 'Game Reader', 'Tricky Opportunist',
  'Aggressive Disruptor', 'Composed Controller', 'All-Rounder', 'Endurance Grinder',
];

const careerPersonalities = [
  'Workhorse', 'Natural Talent', 'Fanatic', 'Rebel', 'Traditionalist', 'Star Chaser',
  'Apprentice', 'Hothead', 'Stable Grinder', 'Free Spirit',
];

const matchMentalities = [
  'Mentally Tough', 'Ice Cold', 'Comeback Fighter', 'Mentally Fragile', 'Pressure Magnet',
  'Hothead', 'Momentum Player', 'Slow Starter', 'Front Runner',
];

const progressionTypes = [
  'Early Bloomer', 'Standard', 'Late Bloomer', 'Long Prime', 'Flash Peak', 'Slow Burn',
  'Junior Star Bust', 'Injury Interrupted', 'Veteran Master', 'Burnout Arc',
];

function options(values: string[]) {
  return values.map((value) => <option key={value} value={value}>{value}</option>);
}

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
  attributes: { ...defaultAttributes },
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



const categoryKeys = [
  ['Technical', 'technical_rating'],
  ['Physical', 'physical_rating'],
  ['Tactical', 'tactical_rating'],
  ['Mental', 'mental_rating'],
  ['Attacking', 'attacking_rating'],
  ['Defensive', 'defensive_rating'],
] as const;

const attributeLabels: { key: AttributeKey; label: string }[] = [
  { key: 'serve_pressure', label: 'Serve pressure' },
  { key: 'return_initiative', label: 'Return initiative' },
  { key: 'length_quality', label: 'Length quality' },
  { key: 'width_control', label: 'Width control' },
  { key: 'volley_takeover', label: 'Volley takeover' },
  { key: 'front_court_touch', label: 'Front-court touch' },
  { key: 'finishing_power', label: 'Finishing power' },
  { key: 'first_step_cod', label: 'First-step/COD' },
  { key: 't_recovery', label: 'T recovery' },
  { key: 'aerobic_repeatability', label: 'Aerobic repeatability' },
  { key: 'recovery_efficiency', label: 'Recovery efficiency' },
  { key: 'anticipation', label: 'Anticipation' },
  { key: 'shot_selection', label: 'Shot selection' },
  { key: 'adaptability', label: 'Adaptability' },
  { key: 'composure', label: 'Composure' },
  { key: 'error_discipline', label: 'Error discipline' },
  { key: 'deception_creativity', label: 'Deception creativity' },
  { key: 'durability', label: 'Durability' },
];

function latestProfile(profiles: SeasonProfile[]) {
  return [...profiles].sort((left, right) => right.season_year - left.season_year)[0] ?? null;
}

function topAttributes(profile: SeasonProfile) {
  return attributeLabels
    .map((entry) => ({ ...entry, value: profile.attributes[entry.key] ?? 0 }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 3);
}

function MiniMeter({ label, value, tone = 'emerald' }: { label: string; value: number; tone?: 'emerald' | 'gold' | 'red' | 'blue' }) {
  return (
    <div className={`mini-meter tone-${tone}`}>
      <div><span>{label}</span><strong>{Math.round(value)}</strong></div>
      <div className="mini-meter-track"><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
    </div>
  );
}

function PlayerProfileOverview({ player, analytics }: { player: PlayerWithProfiles; analytics: PlayerAnalytics | null }) {
  const defaultProfile = latestProfile(player.profiles);
  const [profileId, setProfileId] = useState<number | ''>(defaultProfile?.id ?? '');

  useEffect(() => {
    setProfileId(latestProfile(player.profiles)?.id ?? '');
  }, [player.id, player.profiles]);

  const profile = player.profiles.find((item) => item.id === profileId) ?? defaultProfile;

  if (!profile) {
    return (
      <div className="player-profile-card player-profile-card--empty">
        <PlayerAvatar name={player.name} subtitle={player.nationality} handedness={player.handedness} size="lg" />
        <div><p className="eyebrow">Player profile</p><h2>No season profile yet</h2><p>Add a season profile below to unlock ratings, radar and scouting diagnostics.</p></div>
      </div>
    );
  }

  const radarValues = categoryKeys.map(([label, key]) => ({ label: label === 'Attacking' ? 'Attack' : label === 'Defensive' ? 'Defense' : label, value: profile[key] }));
  const recent = analytics?.recent_matches?.slice(0, 8) ?? [];

  return (
    <div className="player-profile-card">
      <div className="profile-hero-panel">
        <div className="profile-identity-block">
          <PlayerAvatar name={player.name} subtitle={player.nationality} handedness={player.handedness} playStyle={profile.play_style} size="lg" />
          <div className="profile-title-copy">
            <p className="eyebrow">Elite player profile</p>
            <h2>{player.name}</h2>
            <p>{player.nickname ? `“${player.nickname}” · ` : ''}{profile.play_style} · {profile.match_mentality}</p>
            <div className="profile-pill-row">
              <span className="seed-pill">{profile.season_year} season</span>
              <span className="seed-pill">{profile.injury_status}</span>
              <span className="seed-pill">{profile.progression_type}</span>
            </div>
          </div>
        </div>
        {player.profiles.length > 1 && (
          <label className="field-label profile-season-select"><span>Profile season</span><select value={profile.id} onChange={(event) => setProfileId(Number(event.target.value))}>{[...player.profiles].sort((a, b) => b.season_year - a.season_year).map((item) => <option key={item.id} value={item.id}>{item.season_year}</option>)}</select></label>
        )}
      </div>

      <div className="profile-main-grid">
        <div className="profile-rating-column">
          <div className="rating-duo">
            <div className="rating-card featured"><span>Tour rating</span><strong>{profile.tournament_rating.toFixed(1)}</strong><p>BO5 match strength</p></div>
            <div className="rating-card featured gold"><span>League rating</span><strong>{profile.league_rating.toFixed(1)}</strong><p>Timed 3x5 strength</p></div>
          </div>
          <div className="ratings-grid profile-categories">
            {categoryKeys.map(([label, key]) => <div className="rating-card" key={key}><span>{label}</span><strong>{profile[key].toFixed(1)}</strong></div>)}
          </div>
          <div className="diagnostic-card">
            <h3>Scouting notes</h3>
            <p><strong>Personality:</strong> {profile.career_personality}</p>
            <p><strong>Top strengths:</strong> {topAttributes(profile).map((entry) => `${entry.label} ${Math.round(entry.value)}`).join(' · ')}</p>
            {(player.notes || profile.notes) && <p>{profile.notes || player.notes}</p>}
          </div>
        </div>

        <div className="radar-panel"><RatingRadar values={radarValues} /></div>

        <div className="form-panel">
          <h3>Form & availability</h3>
          <MiniMeter label="Form" value={profile.form} />
          <MiniMeter label="Confidence" value={profile.confidence} tone="gold" />
          <MiniMeter label="Fatigue" value={profile.fatigue} tone="red" />
          <div className="form-strip">
            <span>Recent saved form</span>
            <div>{recent.length > 0 ? recent.map((match) => <b className={match.is_draw ? 'draw' : match.winner_name === player.name ? 'win' : 'loss'} key={match.id}>{match.is_draw ? 'D' : match.winner_name === player.name ? 'W' : 'L'}</b>) : <em>No saved matches</em>}</div>
          </div>
          {analytics && analytics.total_matches > 0 && <p className="form-summary">Saved record {analytics.wins}-{analytics.losses}-{analytics.draws} · {pct(analytics.win_rate)} win rate</p>}
        </div>
      </div>

      <div className="profile-attributes-panel">
        <div className="section-heading"><div><p className="eyebrow">Attribute map</p><h3>Detailed player toolkit</h3></div></div>
        <AttributeBars attributes={profile.attributes} />
      </div>
    </div>
  );
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function SavedMatchHistoryCard({ analytics, warning }: { analytics: PlayerAnalytics | null; warning: string | null }) {
  if (warning) return <div className="editor-card"><p className="eyebrow">Saved Match History</p><p className="warning-text">Analytics unavailable: {warning}</p></div>;
  if (!analytics) return <div className="editor-card"><p className="eyebrow">Saved Match History</p><p>Loading saved match history…</p></div>;
  if (analytics.total_matches === 0) return <div className="editor-card"><p className="eyebrow">Saved Match History</p><p>No saved matches yet for this player.</p></div>;
  return (
    <div className="editor-card compact-history-card">
      <div className="section-heading"><div><p className="eyebrow">Saved Match History</p><h2>{analytics.wins}-{analytics.losses}-{analytics.draws} record</h2><p>{pct(analytics.win_rate)} win rate · Points {analytics.total_points_for}-{analytics.total_points_against} · Diff {analytics.point_differential}</p></div></div>
      <div className="scoreline-grid">
        <span>Tour: {analytics.tour_wins}-{analytics.tour_matches - analytics.tour_wins}</span>
        <span>League: {analytics.league_wins}-{analytics.league_matches - analytics.league_wins - analytics.league_draws}-{analytics.league_draws}</span>
        <span>Avg perf: {analytics.average_performance_rating ?? '—'}</span>
      </div>
      <h3>Common opponents</h3>
      <table className="compact-table"><tbody>{analytics.common_opponents.slice(0, 5).map((opp) => <tr key={opp.opponent_name}><td>{opp.opponent_name}</td><td>{opp.matches}</td><td>{opp.wins}-{opp.losses}-{opp.draws}</td></tr>)}</tbody></table>
      <h3>Recent saved matches</h3>
      <ul className="compact-list">{analytics.recent_matches.slice(0, 5).map((match) => <li key={match.id}>{match.player_a_name} vs {match.player_b_name} · {match.is_draw ? 'Draw' : `${match.winner_name} won`} · {match.match_score_text}</li>)}</ul>
    </div>
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

function readProfilePayload(form: FormData, attributes: PlayerAttributes): SeasonProfilePayload {
  return {
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
    attributes,
  };
}

function ProfileEditor({ profile, player, onSave, onDelete, onDuplicate, onClone }: { profile: SeasonProfile | SeasonProfilePayload; player?: PlayerWithProfiles; onSave: (payload: SeasonProfilePayload) => Promise<void>; onDelete?: () => Promise<void>; onDuplicate?: (seasonYear: number) => Promise<void>; onClone?: (profile: SeasonProfile, name: string, nationality: string) => Promise<void> }) {
  const [duplicateYear, setDuplicateYear] = useState((profile.season_year ?? new Date().getFullYear()) + 1);
  const [attributes, setAttributes] = useState<PlayerAttributes>({ ...defaultAttributes, ...(profile.attributes ?? {}) });
  const savedProfile = 'id' in profile ? profile : null;

  useEffect(() => {
    setAttributes({ ...defaultAttributes, ...(profile.attributes ?? {}) });
    setDuplicateYear((profile.season_year ?? new Date().getFullYear()) + 1);
  }, [profile]);

  function setAttribute(field: AttributeKey, value: string) {
    setAttributes((current) => ({ ...current, [field]: rating(value) }));
  }

  function applyPreset(event: FormEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    const formData = new FormData(form);
    const preset = String(formData.get('quality_preset') || 'Elite Tour') as QualityPreset;
    if (!confirm(`Replace all attributes on this profile with the ${preset} preset?`)) return;
    setAttributes(generateAttributesFromPreset({
      qualityPreset: preset,
      playStyle: String(formData.get('play_style') || profile.play_style || 'All-Rounder'),
      handedness: player?.handedness,
      name: player?.name ?? 'Custom Player',
      seasonYear: Number(formData.get('season_year') || profile.season_year || 2030),
    }));
  }

  function normalize(event: FormEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    const target = Number(new FormData(form).get('rating_target') || 80);
    if (!confirm(`Scale all attributes toward an approximate rating target of ${target}?`)) return;
    setAttributes((current) => normalizeAttributesToTarget(current, target));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(readProfilePayload(new FormData(event.currentTarget), attributes));
  }

  return (
    <form className="editor-card" onSubmit={submit}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Season profile</p>
          <h2>{profile.season_year ?? 'New season'}</h2>
          <p>Attributes are 0–100. Elite world-class players usually sit 85–98 in their strengths.</p>
        </div>
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
        <Select defaultValue={profile.play_style ?? 'All-Rounder'} label="Play style" name="play_style">{options(playStyles)}</Select>
        <Select defaultValue={profile.career_personality ?? 'Stable Grinder'} label="Career personality" name="career_personality">{options(careerPersonalities)}</Select>
        <Select defaultValue={profile.match_mentality ?? 'Mentally Tough'} label="Match mentality" name="match_mentality">{options(matchMentalities)}</Select>
        <Select defaultValue={profile.progression_type ?? 'Standard'} label="Progression type" name="progression_type">{options(progressionTypes)}</Select>
        <Input defaultValue={profile.form} label="Form" max={100} min={0} name="form" type="number" />
        <Input defaultValue={profile.confidence} label="Confidence" max={100} min={0} name="confidence" type="number" />
        <Input defaultValue={profile.fatigue} label="Fatigue" max={100} min={0} name="fatigue" type="number" />
        <Select defaultValue={profile.injury_status ?? 'Fresh'} label="Injury status" name="injury_status"><option>Fresh</option><option>Managed</option><option>Worn</option><option>Compromised</option></Select>
        <Input defaultValue={profile.skill_environment} label="Skill environment" name="skill_environment" step="0.001" type="number" />
      </div>
      <label className="field-label wide-field"><span>Profile notes</span><textarea defaultValue={profile.notes ?? ''} name="notes" /></label>

      <div className="helper-panel">
        <div className="form-grid compact-grid">
          <Select defaultValue="Elite Tour" label="Apply preset to this profile" name="quality_preset">{options(qualityPresets)}</Select>
          <Input defaultValue={savedProfile?.tournament_rating ?? 85} label="Normalize to rating target" max={100} min={0} name="rating_target" type="number" />
        </div>
        <div className="button-row">
          <button className="ghost-button" onClick={applyPreset} type="button">Apply preset attributes</button>
          <button className="ghost-button" onClick={normalize} type="button">Normalize attributes</button>
        </div>
      </div>

      {attributeGroups.map((group) => (
        <div className="attribute-group" key={group.title}>
          <h3>{group.title}</h3>
          <div className="form-grid compact-grid">
            {group.fields.map((field) => (
              <label className="field-label attribute-field" key={field}>
                <span>{field.replace(/_/g, ' ')}</span>
                <small>{attributeDescriptions[field]}</small>
                <input max={100} min={0} name={field} onChange={(event) => setAttribute(field, event.target.value)} type="number" value={attributes[field]} />
              </label>
            ))}
          </div>
        </div>
      ))}

      {(onDuplicate || (savedProfile && onClone)) && (
        <div className="duplicate-row">
          {onDuplicate && <><label className="field-label"><span>Duplicate to season</span><input max={2200} min={1900} onChange={(event) => setDuplicateYear(Number(event.target.value))} type="number" value={duplicateYear} /></label><button className="ghost-button" onClick={() => onDuplicate(duplicateYear)} type="button">Duplicate profile</button></>}
          {savedProfile && onClone && <button className="ghost-button" onClick={() => { const name = prompt('New player name', `${player?.name ?? 'Player'} Copy`); if (!name) return; const nationality = prompt('New nationality', player?.nationality ?? 'Unknown') || 'Unknown'; onClone(savedProfile, name, nationality); }} type="button">Clone as new player</button>}
        </div>
      )}
    </form>
  );
}

function QuickCreatePanel({ onCreate }: { onCreate: (player: PlayerPayload, profile: SeasonProfilePayload) => Promise<void> }) {
  const [randomizeStyle, setRandomizeStyle] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const seasonYear = Number(form.get('season_year') || 2030);
    const qualityPreset = String(form.get('quality_preset') || 'Elite Tour') as QualityPreset;
    const nationality = String(form.get('nationality') || 'Unknown');
    const handedness = form.get('handedness') as 'right' | 'left';
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const randomMode = submitter?.value === 'random';
    const playStyle = randomMode && randomizeStyle ? randomPlayStyle(`${nationality}|${seasonYear}|${qualityPreset}`, playStyles) : String(form.get('play_style') || 'All-Rounder');
    const rawName = String(form.get('name') || '').trim();
    if (!randomMode && !rawName) {
      alert('Enter a name for Quick Create Player, or use Generate Random Player.');
      return;
    }
    const name = rawName || randomFictionalName(`${nationality}|${seasonYear}|${qualityPreset}|${playStyle}`);
    const notes = String(form.get('notes') ?? '');

    await onCreate(
      {
        ...emptyPlayer,
        name,
        nationality,
        handedness,
        notes: notes || (randomMode ? `Generated random ${qualityPreset} ${playStyle}.` : ''),
      },
      {
        ...newProfile(),
        season_year: seasonYear,
        play_style: playStyle,
        match_mentality: String(form.get('match_mentality') || 'Mentally Tough'),
        career_personality: String(form.get('career_personality') || 'Stable Grinder'),
        progression_type: String(form.get('progression_type') || 'Standard'),
        notes,
        attributes: generateAttributesFromPreset({ qualityPreset, playStyle, handedness, name, seasonYear }),
      },
    );
    event.currentTarget.reset();
    setRandomizeStyle(false);
  }

  return (
    <form className="editor-card quick-create-card" onSubmit={submit}>
      <div className="section-heading">
        <div><p className="eyebrow">Fast setup</p><h2>Quick Create Player</h2><p>Create an identity, one season profile, and a full generated 18-attribute set in one step.</p></div>
      </div>
      <div className="form-grid">
        <Input label="Name (optional for random)" name="name" />
        <Input defaultValue="Unknown" label="Nationality" name="nationality" />
        <Input defaultValue={2030} label="Season year" max={2200} min={1900} name="season_year" type="number" />
        <Select defaultValue="All-Rounder" label="Play style" name="play_style">{options(playStyles)}</Select>
        <Select defaultValue="Mentally Tough" label="Match mentality" name="match_mentality">{options(matchMentalities)}</Select>
        <Select defaultValue="Stable Grinder" label="Career personality" name="career_personality">{options(careerPersonalities)}</Select>
        <Select defaultValue="Standard" label="Progression type" name="progression_type">{options(progressionTypes)}</Select>
        <Select defaultValue="Elite Tour" label="Quality preset" name="quality_preset">{options(qualityPresets)}</Select>
        <Select defaultValue="right" label="Handedness" name="handedness"><option value="right">Right-handed</option><option value="left">Left-handed</option></Select>
      </div>
      <label className="field-label wide-field"><span>Optional notes</span><textarea name="notes" /></label>
      <label className="inline-check"><input checked={randomizeStyle} onChange={(event) => setRandomizeStyle(event.target.checked)} type="checkbox" /> Randomize play style when using Generate Random Player</label>
      <div className="button-row">
        <button className="primary-button" type="submit" value="quick">Quick create player</button>
        <button className="ghost-button" type="submit" value="random">Generate Random Player</button>
      </div>
    </form>
  );
}

function ComparePlayersPanel({ profiles }: { profiles: { player: PlayerWithProfiles; profile: SeasonProfile }[] }) {
  const [profileAId, setProfileAId] = useState<number | ''>('');
  const [profileBId, setProfileBId] = useState<number | ''>('');
  const profileA = profiles.find((item) => item.profile.id === profileAId)?.profile;
  const profileB = profiles.find((item) => item.profile.id === profileBId)?.profile;
  const comparison = profileA && profileB ? compareProfiles(profileA, profileB) : null;

  return (
    <div className="editor-card compare-card">
      <div className="section-heading"><div><p className="eyebrow">Matchup helper</p><h2>Compare Two Players</h2><p>Pick two season profiles to find useful single-match simulation pairings.</p></div></div>
      <div className="form-grid">
        <Select defaultValue="" label="Profile A" name="compare_a"><option value="">Choose profile A</option>{profiles.map(({ player, profile }) => <option key={profile.id} value={profile.id}>{player.name} · {profile.season_year}</option>)}</Select>
        <Select defaultValue="" label="Profile B" name="compare_b"><option value="">Choose profile B</option>{profiles.map(({ player, profile }) => <option key={profile.id} value={profile.id}>{player.name} · {profile.season_year}</option>)}</Select>
      </div>
      <div className="button-row">
        <button className="ghost-button" onClick={(event) => { const form = event.currentTarget.closest('.compare-card'); const selects = form?.querySelectorAll('select'); setProfileAId(Number(selects?.[0]?.value) || ''); setProfileBId(Number(selects?.[1]?.value) || ''); }} type="button">Compare profiles</button>
      </div>
      {comparison && profileA && profileB && (
        <div className="comparison-output">
          <div className="scoreline-grid">
            <span>Tour diff: {comparison.tourDiff > 0 ? '+' : ''}{comparison.tourDiff} for A</span>
            <span>League diff: {comparison.leagueDiff > 0 ? '+' : ''}{comparison.leagueDiff} for A</span>
            {Object.entries(comparison.bucketDiffs).map(([bucket, diff]) => <span key={bucket}>{bucket}: {diff > 0 ? '+' : ''}{diff} A</span>)}
          </div>
          <p>{comparison.styleNote}</p>
          <p><strong>Recommended format:</strong> {comparison.recommendedFormat}</p>
          <div className="comparison-columns">
            <div><h3>{profileA.play_style} A advantages</h3><ul>{comparison.aAdvantages.map(({ key, diff }) => <li key={key}>{key.replace(/_/g, ' ')} +{diff}</li>)}</ul></div>
            <div><h3>{profileB.play_style} B advantages</h3><ul>{comparison.bAdvantages.map(({ key, diff }) => <li key={key}>{key.replace(/_/g, ' ')} +{Math.abs(diff)}</li>)}</ul></div>
          </div>
        </div>
      )}
    </div>
  );
}


export function Players() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<PlayerWithProfiles | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newSeason, setNewSeason] = useState<SeasonProfilePayload | null>(null);
  const [analytics, setAnalytics] = useState<PlayerAnalytics | null>(null);
  const [analyticsWarning, setAnalyticsWarning] = useState<string | null>(null);
  const [detailedRoster, setDetailedRoster] = useState<PlayerWithProfiles[]>([]);

  async function refresh(selectedId = selected?.id) {
    const roster = await listPlayers();
    setPlayers(roster);
    const detailed = await Promise.all(roster.map((player) => getPlayer(player.id)));
    setDetailedRoster(detailed);
    if (selectedId) setSelected(await getPlayer(selectedId));
  }

  useEffect(() => { refresh(undefined).catch((err: Error) => setError(err.message)); }, []);

  useEffect(() => {
    if (!selected?.name) {
      setAnalytics(null);
      setAnalyticsWarning(null);
      return;
    }
    let cancelled = false;
    setAnalytics(null);
    setAnalyticsWarning(null);
    getPlayerAnalytics(selected.name)
      .then((payload) => { if (!cancelled) setAnalytics(payload); })
      .catch((err: Error) => { if (!cancelled) setAnalyticsWarning(err.message); });
    return () => { cancelled = true; };
  }, [selected?.name]);

  const filtered = useMemo(() => players.filter((player) => `${player.name} ${player.nationality}`.toLowerCase().includes(filter.toLowerCase())), [players, filter]);
  const compareOptions = useMemo(() => detailedRoster.flatMap((player) => player.profiles.map((profile) => ({ player, profile }))), [detailedRoster]);

  async function safe(action: () => Promise<void>) {
    try { setError(null); await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Unknown error'); }
  }

  async function quickCreate(playerPayload: PlayerPayload, profilePayload: SeasonProfilePayload) {
    const created = await createPlayer(playerPayload);
    await createProfile(created.id, profilePayload);
    setAdding(false);
    await refresh(created.id);
  }

  async function cloneProfile(profile: SeasonProfile, name: string, nationality: string) {
    if (!selected) return;
    const created = await createPlayer({
      ...emptyPlayer,
      name,
      nationality,
      handedness: selected.handedness,
      backhand_type: selected.backhand_type ?? '',
      notes: `Copy of ${selected.name}. ${selected.notes ?? ''}`.trim(),
    });
    await createProfile(created.id, {
      season_year: profile.season_year,
      age: profile.age,
      play_style: profile.play_style,
      career_personality: profile.career_personality,
      match_mentality: profile.match_mentality,
      progression_type: profile.progression_type,
      form: profile.form,
      confidence: profile.confidence,
      fatigue: profile.fatigue,
      injury_status: profile.injury_status,
      skill_environment: profile.skill_environment,
      notes: `Copy of ${selected.name} ${profile.season_year} profile. ${profile.notes ?? ''}`.trim(),
      attributes: { ...profile.attributes },
    });
    await refresh(created.id);
  }

  return (
    <section className="players-page">
      <div className="section-heading top-heading">
        <div><p className="eyebrow">Roster setup</p><h1>Players</h1><p>Manage stable player identities plus season-specific profiles, attributes, and derived ratings.</p></div>
        <div className="button-row">
          <button className="ghost-button" onClick={() => safe(async () => { await seedSampleData(); await refresh(); })} type="button">Seed sample data</button>
          <button className="ghost-button" onClick={() => safe(async () => { const updated = await resetSampleData(); await refresh(updated[0]?.id); })} type="button">Reset elite sample players</button>
          <button className="primary-button" onClick={() => { setAdding(true); setSelected(null); }} type="button">Add Player</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="players-layout">
        <aside className="roster-card">
          <input className="search-input" onChange={(event) => setFilter(event.target.value)} placeholder="Search name or nationality" value={filter} />
          <ComparePlayersPanel profiles={compareOptions} />
          <div className="player-table">
            {filtered.map((player) => (
              <button className={selected?.id === player.id ? 'player-row active' : 'player-row'} key={player.id} onClick={() => safe(async () => { setAdding(false); setNewSeason(null); setSelected(await getPlayer(player.id)); })} type="button">
                <strong>{player.name}</strong><span>{player.nationality}</span><span>{player.profile_count} profiles</span><span>{player.latest_season ?? '—'} · T {player.latest_tournament_rating ?? '—'} / L {player.latest_league_rating ?? '—'}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="detail-stack">
          <QuickCreatePanel onCreate={(playerPayload, profilePayload) => safe(async () => quickCreate(playerPayload, profilePayload))} />
          {adding && <PlayerForm player={emptyPlayer} onSave={(payload) => safe(async () => { const created = await createPlayer(payload); setAdding(false); await refresh(created.id); })} />}

          {selected && (
            <>
              <PlayerProfileOverview player={selected} analytics={analytics} />
              <PlayerForm player={selected} onDelete={() => safe(async () => { if (confirm(`Delete ${selected.name}?`)) { await deletePlayer(selected.id); setSelected(null); await refresh(undefined); } })} onSave={(payload) => safe(async () => { await updatePlayer(selected.id, payload); await refresh(selected.id); })} />
              <div className="section-heading"><h2>Season profiles</h2><button className="ghost-button" onClick={() => setNewSeason(newProfile())} type="button">Add season profile</button></div>
              {newSeason && <ProfileEditor player={selected} profile={newSeason} onSave={(payload) => safe(async () => { await createProfile(selected.id, payload); setNewSeason(null); await refresh(selected.id); })} />}
              {selected.profiles.map((profile) => (
                <ProfileEditor
                  key={profile.id}
                  profile={profile}
                  player={selected}
                  onClone={(profileToClone, name, nationality) => safe(async () => cloneProfile(profileToClone, name, nationality))}
                  onDelete={() => safe(async () => { if (confirm(`Delete ${profile.season_year} profile?`)) { await deleteProfile(profile.id); await refresh(selected.id); } })}
                  onDuplicate={(seasonYear) => safe(async () => { await duplicateProfile(profile.id, { season_year: seasonYear, apply_skill_inflation: true }); await refresh(selected.id); })}
                  onSave={(payload) => safe(async () => { await updateProfile(profile.id, payload); await refresh(selected.id); })}
                />
              ))}
              <SavedMatchHistoryCard analytics={analytics} warning={analyticsWarning} />
            </>
          )}

          {!adding && !selected && <div className="editor-card empty-state"><h2>Select a player</h2><p>Choose a roster row, add a player, or seed the fictional sample roster.</p></div>}
        </div>
      </div>
    </section>
  );
}
