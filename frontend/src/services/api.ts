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
