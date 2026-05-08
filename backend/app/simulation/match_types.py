from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

ATTRIBUTE_NAMES = [
    "serve_pressure",
    "return_initiative",
    "length_quality",
    "width_control",
    "volley_takeover",
    "front_court_touch",
    "finishing_power",
    "first_step_cod",
    "t_recovery",
    "aerobic_repeatability",
    "recovery_efficiency",
    "anticipation",
    "shot_selection",
    "adaptability",
    "composure",
    "error_discipline",
    "deception_creativity",
    "durability",
]


@dataclass(frozen=True)
class MatchPlayer:
    profile_id: int
    player_id: int
    name: str
    season_year: int
    play_style: str
    career_personality: str
    match_mentality: str
    progression_type: str
    form: int
    confidence: int
    starting_fatigue: int
    injury_status: str
    skill_environment: float
    attributes: dict[str, int]
    derived_ratings: dict[str, float]

    def attr(self, name: str) -> float:
        return float(self.attributes.get(name, 50))

    def rating(self, name: str) -> float:
        return float(self.derived_ratings.get(name, 50.0))

    def public_dict(self) -> dict[str, Any]:
        return {
            "profile_id": self.profile_id,
            "player_id": self.player_id,
            "name": self.name,
            "season_year": self.season_year,
            "play_style": self.play_style,
            "career_personality": self.career_personality,
            "match_mentality": self.match_mentality,
            "progression_type": self.progression_type,
            "form": self.form,
            "confidence": self.confidence,
            "fatigue": self.starting_fatigue,
            "injury_status": self.injury_status,
            "skill_environment": self.skill_environment,
            "tournament_rating": self.rating("tournament_rating"),
            "league_rating": self.rating("league_rating"),
            "physical_rating": self.rating("physical_rating"),
            "technical_rating": self.rating("technical_rating"),
            "tactical_rating": self.rating("tactical_rating"),
            "mental_rating": self.rating("mental_rating"),
            "attacking_rating": self.rating("attacking_rating"),
            "defensive_rating": self.rating("defensive_rating"),
        }


@dataclass
class MatchState:
    fatigue: dict[int, float]
    point_streak_profile_id: int | None = None
    point_streak_count: int = 0
    games_won: dict[int, int] = field(default_factory=dict)
    points_won: dict[int, int] = field(default_factory=dict)
    previous_game_winner_profile_id: int | None = None
