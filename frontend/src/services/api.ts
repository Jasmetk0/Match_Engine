export type HealthResponse = {
  status: string;
  app: string;
};

export type PlayerAttributes = {
  id?: number;
  profile_id?: number;
  serve_pressure: number;
  return_initiative: number;
  length_quality: number;
  width_control: number;
  volley_takeover: number;
  front_court_touch: number;
  finishing_power: number;
  first_step_cod: number;
  t_recovery: number;
  aerobic_repeatability: number;
  recovery_efficiency: number;
  anticipation: number;
  shot_selection: number;
  adaptability: number;
  composure: number;
  error_discipline: number;
  deception_creativity: number;
  durability: number;
};

export type Player = {
  id: number;
  name: string;
  nationality: string;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  handedness: 'right' | 'left';
  backhand_type: string | null;
  nickname: string | null;
  popularity: number;
  leadership: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  profile_count: number;
  latest_season: number | null;
  latest_tournament_rating: number | null;
  latest_league_rating: number | null;
};

export type SeasonProfile = {
  id: number;
  player_id: number;
  season_year: number;
  age: number | null;
  play_style: string;
  career_personality: string;
  match_mentality: string;
  progression_type: string;
  form: number;
  confidence: number;
  fatigue: number;
  injury_status: 'Fresh' | 'Managed' | 'Worn' | 'Compromised';
  skill_environment: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  attributes: PlayerAttributes;
  tournament_rating: number;
  league_rating: number;
  physical_rating: number;
  technical_rating: number;
  tactical_rating: number;
  mental_rating: number;
  attacking_rating: number;
  defensive_rating: number;
};

export type PlayerWithProfiles = Player & {
  profiles: SeasonProfile[];
};

export type PlayerPayload = Partial<Omit<Player, 'id' | 'created_at' | 'updated_at' | 'profile_count' | 'latest_season' | 'latest_tournament_rating' | 'latest_league_rating'>> & {
  name?: string;
};

export type SeasonProfilePayload = Partial<Omit<SeasonProfile, 'id' | 'player_id' | 'created_at' | 'updated_at' | 'tournament_rating' | 'league_rating' | 'physical_rating' | 'technical_rating' | 'tactical_rating' | 'mental_rating' | 'attacking_rating' | 'defensive_rating'>> & {
  season_year?: number;
  attributes?: Partial<PlayerAttributes>;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Backend returned ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

export async function listPlayers(): Promise<Player[]> {
  return request<Player[]>('/players');
}

export async function createPlayer(payload: PlayerPayload): Promise<Player> {
  return request<Player>('/players', { method: 'POST', body: JSON.stringify(payload) });
}

export async function getPlayer(playerId: number): Promise<PlayerWithProfiles> {
  return request<PlayerWithProfiles>(`/players/${playerId}`);
}

export async function updatePlayer(playerId: number, payload: PlayerPayload): Promise<Player> {
  return request<Player>(`/players/${playerId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deletePlayer(playerId: number): Promise<void> {
  return request<void>(`/players/${playerId}`, { method: 'DELETE' });
}

export async function createProfile(playerId: number, payload: SeasonProfilePayload): Promise<SeasonProfile> {
  return request<SeasonProfile>(`/players/${playerId}/profiles`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateProfile(profileId: number, payload: SeasonProfilePayload): Promise<SeasonProfile> {
  return request<SeasonProfile>(`/profiles/${profileId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteProfile(profileId: number): Promise<void> {
  return request<void>(`/profiles/${profileId}`, { method: 'DELETE' });
}

export async function duplicateProfile(
  profileId: number,
  payload: { season_year: number; apply_skill_inflation: boolean },
): Promise<SeasonProfile> {
  return request<SeasonProfile>(`/profiles/${profileId}/duplicate`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function seedSampleData(): Promise<Player[]> {
  return request<Player[]>('/dev/seed-sample-data', { method: 'POST' });
}

export type MatchRequest = {
  player_a_profile_id: number;
  player_b_profile_id: number;
  seed?: number | string | null;
  match_type?: 'tour_bo5';
  monte_carlo_runs?: number;
};

export type MatchPlayerSummary = {
  profile_id: number;
  player_id: number;
  name: string;
  season_year: number;
  play_style: string;
  tournament_rating: number;
  league_rating: number;
  physical_rating: number;
  mental_rating: number;
};

export type MatchPreviewResponse = {
  match_type: string;
  seed: number;
  monte_carlo_runs: number;
  player_a: MatchPlayerSummary;
  player_b: MatchPlayerSummary;
  player_a_win_probability: number;
  player_b_win_probability: number;
  player_a_3_0: number;
  player_a_3_1: number;
  player_a_3_2: number;
  player_b_3_0: number;
  player_b_3_1: number;
  player_b_3_2: number;
  deciding_game_probability: number;
  at_least_one_tiebreak_probability: number;
  expected_total_points: number;
  expected_total_duration_seconds: number;
  expected_total_rallies: number;
  expected_average_rally_shots: number;
  upset_hint: string;
  style_edge_summary: string;
  physical_edge_summary: string;
  pressure_edge_summary: string;
};

export type RallyEvent = {
  rally_number: number;
  game_number: number;
  server_profile_id: number;
  winner_profile_id: number | null;
  loser_profile_id: number | null;
  score_before: [number, number];
  score_after: [number, number];
  rally_shots: number;
  rally_duration_seconds: number;
  rally_length_type: string;
  terminal_type: string;
  tactical_pattern: string;
  pressure_level: string;
  initiative_player_profile_id: number;
  t_control_player_profile_id: number;
  fatigue_after: { player_a: number; player_b: number };
  explanation: string;
};

export type GameSummary = {
  game_number: number;
  score: [number, number];
  winner_profile_id: number;
  duration_seconds: number;
  scoring_rallies: number;
  lets: number;
  tiebreak?: boolean;
};

export type MatchGenerateResponse = {
  match_type: string;
  seed: number;
  player_a: MatchPlayerSummary;
  player_b: MatchPlayerSummary;
  winner: MatchPlayerSummary;
  loser: MatchPlayerSummary;
  match_score_text: string;
  games: GameSummary[];
  rallies: RallyEvent[];
  stats: Record<string, any>;
  story: Record<string, string>;
};

export async function previewMatch(payload: MatchRequest): Promise<MatchPreviewResponse> {
  return request<MatchPreviewResponse>('/match/preview', { method: 'POST', body: JSON.stringify(payload) });
}

export async function generateMatch(payload: MatchRequest): Promise<MatchGenerateResponse> {
  return request<MatchGenerateResponse>('/match/generate', { method: 'POST', body: JSON.stringify(payload) });
}

export type SavedMatchSummary = {
  id: number;
  created_at: string;
  title: string | null;
  match_type: string;
  seed: number;
  player_a_name_snapshot: string;
  player_b_name_snapshot: string;
  winner_name_snapshot: string;
  loser_name_snapshot: string;
  match_score_text: string;
  total_duration_seconds: number | null;
  total_points: number | null;
};

export type SavedMatchDetail = SavedMatchSummary & {
  notes: string | null;
  preview: MatchPreviewResponse | Record<string, any> | null;
  result: MatchGenerateResponse;
};

export type SavedMatchPayload = {
  title?: string | null;
  notes?: string | null;
  preview?: MatchPreviewResponse | null;
  result: MatchGenerateResponse;
};

export async function saveMatch(payload: SavedMatchPayload): Promise<SavedMatchDetail> {
  return request<SavedMatchDetail>('/saved-matches', { method: 'POST', body: JSON.stringify(payload) });
}

export async function listSavedMatches(): Promise<SavedMatchSummary[]> {
  return request<SavedMatchSummary[]>('/saved-matches');
}

export async function getSavedMatch(savedMatchId: number): Promise<SavedMatchDetail> {
  return request<SavedMatchDetail>(`/saved-matches/${savedMatchId}`);
}

export async function updateSavedMatch(savedMatchId: number, payload: { title?: string | null; notes?: string | null }): Promise<SavedMatchDetail> {
  return request<SavedMatchDetail>(`/saved-matches/${savedMatchId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteSavedMatch(savedMatchId: number): Promise<void> {
  return request<void>(`/saved-matches/${savedMatchId}`, { method: 'DELETE' });
}
