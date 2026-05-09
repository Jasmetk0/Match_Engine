import { PlayerAttributes, SeasonProfile } from '../services/api';

export const ATTRIBUTE_KEYS = [
  'serve_pressure',
  'return_initiative',
  'length_quality',
  'width_control',
  'volley_takeover',
  'front_court_touch',
  'finishing_power',
  'first_step_cod',
  't_recovery',
  'aerobic_repeatability',
  'recovery_efficiency',
  'anticipation',
  'shot_selection',
  'adaptability',
  'composure',
  'error_discipline',
  'deception_creativity',
  'durability',
] as const satisfies readonly (keyof PlayerAttributes)[];

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type QualityPreset =
  | 'Local Pro'
  | 'National Level'
  | 'Challenger Level'
  | 'Elite Tour'
  | 'World Top 20'
  | 'World Top 5'
  | 'GOAT Candidate';

export const qualityPresets: QualityPreset[] = [
  'Local Pro',
  'National Level',
  'Challenger Level',
  'Elite Tour',
  'World Top 20',
  'World Top 5',
  'GOAT Candidate',
];

export const attributeDescriptions: Record<AttributeKey, string> = {
  serve_pressure: 'Serve quality and ability to start rallies on the front foot.',
  return_initiative: 'Return depth, intent, and ability to neutralize strong serves.',
  length_quality: 'Reliability and bite of deep drives into the back corners.',
  width_control: 'Use of side walls, angles, and channel discipline to control space.',
  volley_takeover: 'Comfort cutting balls off early and increasing pace around the T.',
  front_court_touch: 'Drops, boasts, holds, and touch when finishing or changing tempo.',
  finishing_power: 'Ability to end loose rallies with pace or decisive attacking shots.',
  first_step_cod: 'First step speed and change-of-direction explosiveness.',
  t_recovery: 'Recovery speed and positional discipline back to the T.',
  aerobic_repeatability: 'Repeat sprint endurance through long, attritional phases.',
  recovery_efficiency: 'How well the player resets between rallies, games, and hard spells.',
  anticipation: 'Reads patterns, opponent cues, and likely shot choices early.',
  shot_selection: 'Chooses the right risk level and shot for the tactical moment.',
  adaptability: 'Adjusts to opponent style, court speed, and momentum swings.',
  composure: 'Stays calm on big points and after bad calls or errors.',
  error_discipline: 'Avoids cheap mistakes and resists forcing low-percentage winners.',
  deception_creativity: 'Disguises intent and invents unexpected attacking solutions.',
  durability: 'Resistance to knocks, fatigue accumulation, and physical drop-off.',
};

export const comparisonBuckets: Record<'physical' | 'technical' | 'tactical' | 'mental', AttributeKey[]> = {
  physical: ['first_step_cod', 't_recovery', 'aerobic_repeatability', 'recovery_efficiency', 'durability', 'finishing_power'],
  technical: ['serve_pressure', 'return_initiative', 'length_quality', 'width_control', 'volley_takeover', 'front_court_touch'],
  tactical: ['anticipation', 'shot_selection', 'adaptability', 'width_control', 'deception_creativity'],
  mental: ['composure', 'error_discipline', 'adaptability', 'durability'],
};

const qualityRanges: Record<QualityPreset, [number, number]> = {
  'Local Pro': [55, 68],
  'National Level': [65, 76],
  'Challenger Level': [72, 82],
  'Elite Tour': [80, 90],
  'World Top 20': [86, 94],
  'World Top 5': [90, 97],
  'GOAT Candidate': [93, 99],
};

const styleBoosts: Record<string, Partial<Record<AttributeKey, number>>> = {
  'Volley Pressor': { volley_takeover: 7, t_recovery: 5, first_step_cod: 5, serve_pressure: 4 },
  'Relentless Retriever': { aerobic_repeatability: 7, first_step_cod: 5, return_initiative: 4, error_discipline: 5, durability: 5 },
  'Creative Magician': { deception_creativity: 8, front_court_touch: 6, shot_selection: 4, width_control: 4 },
  'Tactical Controller': { length_quality: 6, width_control: 6, shot_selection: 5, anticipation: 5 },
  'Power Driver': { finishing_power: 8, serve_pressure: 5, front_court_touch: 3 },
  'Pressure Defender': { composure: 5, error_discipline: 6, first_step_cod: 4, t_recovery: 5, anticipation: 4, return_initiative: 4 },
  'Game Reader': { anticipation: 8, adaptability: 5, shot_selection: 5 },
  'Tricky Opportunist': { deception_creativity: 7, front_court_touch: 5, anticipation: 4 },
  'Aggressive Disruptor': { finishing_power: 6, volley_takeover: 6, deception_creativity: 5, error_discipline: -4 },
  'Composed Controller': { composure: 7, error_discipline: 6, length_quality: 5, width_control: 5 },
  'All-Rounder': {},
  'Endurance Grinder': { aerobic_repeatability: 8, recovery_efficiency: 6, durability: 6, length_quality: 4 },
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) / 4294967296);
  };
}

export function generateAttributesFromPreset({
  qualityPreset,
  playStyle,
  handedness,
  name,
  seasonYear,
}: {
  qualityPreset: QualityPreset;
  playStyle: string;
  handedness?: 'right' | 'left' | '';
  name: string;
  seasonYear: number;
}): PlayerAttributes {
  const [min, max] = qualityRanges[qualityPreset];
  const random = seededRandom(hashSeed(`${name}|${seasonYear}|${playStyle}|${qualityPreset}|${handedness ?? ''}`));
  const midpoint = (min + max) / 2;
  const spread = Math.max(2, (max - min) / 2);
  const boosts = styleBoosts[playStyle] ?? {};
  const attrs = Object.fromEntries(ATTRIBUTE_KEYS.map((key) => {
    const variation = (random() * 2 - 1) * spread;
    const handednessNudge = handedness === 'left' && ['serve_pressure', 'deception_creativity', 'front_court_touch'].includes(key) ? 1 : 0;
    return [key, clamp(midpoint + variation + (boosts[key] ?? 0) + handednessNudge, min - 3, 100)];
  })) as PlayerAttributes;
  return attrs;
}

export function normalizeAttributesToTarget(attributes: PlayerAttributes, target: number): PlayerAttributes {
  const current = ATTRIBUTE_KEYS.reduce((sum, key) => sum + (attributes[key] ?? 50), 0) / ATTRIBUTE_KEYS.length;
  const adjustment = clamp(target, 0, 100) - current;
  return Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, clamp((attributes[key] ?? 50) + adjustment)])) as PlayerAttributes;
}

function avg(attributes: PlayerAttributes, keys: AttributeKey[]) {
  return keys.reduce((sum, key) => sum + (attributes[key] ?? 50), 0) / keys.length;
}

export function compareProfiles(profileA: SeasonProfile, profileB: SeasonProfile) {
  const attrDiffs = ATTRIBUTE_KEYS.map((key) => ({ key, diff: (profileA.attributes[key] ?? 50) - (profileB.attributes[key] ?? 50) }));
  const bucketDiffs = Object.fromEntries(
    Object.entries(comparisonBuckets).map(([bucket, keys]) => [bucket, Number((avg(profileA.attributes, keys) - avg(profileB.attributes, keys)).toFixed(1))]),
  ) as Record<'physical' | 'technical' | 'tactical' | 'mental', number>;
  const aAdvantages = attrDiffs.filter((item) => item.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 4);
  const bAdvantages = attrDiffs.filter((item) => item.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 4);
  const attritionalScore = Math.abs(bucketDiffs.physical) + Math.abs(bucketDiffs.mental) + avg(profileA.attributes, ['aerobic_repeatability', 'recovery_efficiency', 'durability']) / 20 + avg(profileB.attributes, ['aerobic_repeatability', 'recovery_efficiency', 'durability']) / 20;
  const quickScore = Math.abs(bucketDiffs.technical) + avg(profileA.attributes, ['volley_takeover', 'front_court_touch', 'finishing_power', 'deception_creativity']) / 20 + avg(profileB.attributes, ['volley_takeover', 'front_court_touch', 'finishing_power', 'deception_creativity']) / 20;
  return {
    tourDiff: Number((profileA.tournament_rating - profileB.tournament_rating).toFixed(1)),
    leagueDiff: Number((profileA.league_rating - profileB.league_rating).toFixed(1)),
    bucketDiffs,
    aAdvantages,
    bAdvantages,
    styleNote: `${profileA.play_style} vs ${profileB.play_style}: ${profileA.play_style === profileB.play_style ? 'mirror match where execution and mentality should decide the edge.' : 'contrasting styles should expose clear phase-by-phase strengths.'}`,
    recommendedFormat: attritionalScore >= quickScore ? 'Tour BO5' : 'League Timed 3x5',
  };
}

const firstNames = ['Ari', 'Maya', 'Niko', 'Sofia', 'Leo', 'Zara', 'Omar', 'Elena', 'Kai', 'Nadia', 'Rafi', 'Mila'];
const lastNames = ['Haddad', 'Mercer', 'Okafor', 'Silva', 'Khan', 'Novak', 'Petrov', 'Santos', 'Rossi', 'Bennett', 'Darwish', 'Chen'];

export function randomFictionalName(seedText: string) {
  const random = seededRandom(hashSeed(seedText));
  return `${firstNames[Math.floor(random() * firstNames.length)]} ${lastNames[Math.floor(random() * lastNames.length)]}`;
}

export function randomPlayStyle(seedText: string, playStyles: string[]) {
  const random = seededRandom(hashSeed(seedText));
  return playStyles[Math.floor(random() * playStyles.length)] ?? 'All-Rounder';
}
