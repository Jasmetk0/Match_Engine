from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

Rating = Annotated[int, Field(ge=0, le=100)]
SeasonYear = Annotated[int, Field(ge=1900, le=2200)]

ATTRIBUTE_FIELDS = [
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


class CleanStringMixin(BaseModel):
    @field_validator("*", mode="before")
    @classmethod
    def blank_strings_to_none(cls, value):
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return value


class PlayerAttributesBase(BaseModel):
    serve_pressure: Rating = 50
    return_initiative: Rating = 50
    length_quality: Rating = 50
    width_control: Rating = 50
    volley_takeover: Rating = 50
    front_court_touch: Rating = 50
    finishing_power: Rating = 50
    first_step_cod: Rating = 50
    t_recovery: Rating = 50
    aerobic_repeatability: Rating = 50
    recovery_efficiency: Rating = 50
    anticipation: Rating = 50
    shot_selection: Rating = 50
    adaptability: Rating = 50
    composure: Rating = 50
    error_discipline: Rating = 50
    deception_creativity: Rating = 50
    durability: Rating = 50


class PlayerAttributesRead(PlayerAttributesBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int


class PlayerCreate(CleanStringMixin):
    name: str
    nationality: str = "Unknown"
    birth_year: int | None = None
    height_cm: int | None = None
    weight_kg: int | None = None
    handedness: str = "right"
    backhand_type: str | None = None
    nickname: str | None = None
    popularity: Rating = 50
    leadership: Rating = 50
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def name_required(cls, value: str | None) -> str:
        if not value:
            raise ValueError("name is required")
        return value

    @field_validator("nationality", mode="before")
    @classmethod
    def default_nationality(cls, value):
        return "Unknown" if value is None or value == "" else value

    @field_validator("handedness", mode="before")
    @classmethod
    def validate_handedness(cls, value):
        value = (value or "right").strip().lower()
        if value not in {"right", "left"}:
            raise ValueError("handedness must be right or left")
        return value


class PlayerUpdate(CleanStringMixin):
    name: str | None = None
    nationality: str | None = None
    birth_year: int | None = None
    height_cm: int | None = None
    weight_kg: int | None = None
    handedness: str | None = None
    backhand_type: str | None = None
    nickname: str | None = None
    popularity: Rating | None = None
    leadership: Rating | None = None
    notes: str | None = None

    @field_validator("handedness", mode="before")
    @classmethod
    def validate_handedness(cls, value):
        if value is None or value == "":
            return None
        value = value.strip().lower()
        if value not in {"right", "left"}:
            raise ValueError("handedness must be right or left")
        return value


class PlayerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    nationality: str
    birth_year: int | None
    height_cm: int | None
    weight_kg: int | None
    handedness: str
    backhand_type: str | None
    nickname: str | None
    popularity: int
    leadership: int
    notes: str | None
    created_at: datetime
    updated_at: datetime
    profile_count: int = 0
    latest_season: int | None = None
    latest_tournament_rating: float | None = None
    latest_league_rating: float | None = None


class SeasonProfileBase(CleanStringMixin):
    season_year: SeasonYear
    age: int | None = None
    play_style: str = "All-Rounder"
    career_personality: str = "Stable Grinder"
    match_mentality: str = "Mentally Tough"
    progression_type: str = "Standard"
    form: Rating = 50
    confidence: Rating = 50
    fatigue: Rating = 0
    injury_status: str = "Fresh"
    skill_environment: float = Field(default=1.0, ge=0.5, le=1.5)
    notes: str | None = None
    attributes: PlayerAttributesBase = Field(default_factory=PlayerAttributesBase)

    @field_validator("play_style", "career_personality", "match_mentality", "progression_type", mode="before")
    @classmethod
    def default_named_fields(cls, value, info):
        defaults = {
            "play_style": "All-Rounder",
            "career_personality": "Stable Grinder",
            "match_mentality": "Mentally Tough",
            "progression_type": "Standard",
        }
        return defaults[info.field_name] if value is None or value == "" else value

    @field_validator("injury_status", mode="before")
    @classmethod
    def validate_injury_status(cls, value):
        value = value or "Fresh"
        if value not in {"Fresh", "Managed", "Worn", "Compromised"}:
            raise ValueError("injury_status must be Fresh, Managed, Worn, or Compromised")
        return value


class SeasonProfileCreate(SeasonProfileBase):
    pass


class SeasonProfileUpdate(CleanStringMixin):
    season_year: SeasonYear | None = None
    age: int | None = None
    play_style: str | None = None
    career_personality: str | None = None
    match_mentality: str | None = None
    progression_type: str | None = None
    form: Rating | None = None
    confidence: Rating | None = None
    fatigue: Rating | None = None
    injury_status: str | None = None
    skill_environment: float | None = Field(default=None, ge=0.5, le=1.5)
    notes: str | None = None
    attributes: PlayerAttributesBase | None = None

    @field_validator("injury_status", mode="before")
    @classmethod
    def validate_injury_status(cls, value):
        if value is None or value == "":
            return None
        if value not in {"Fresh", "Managed", "Worn", "Compromised"}:
            raise ValueError("injury_status must be Fresh, Managed, Worn, or Compromised")
        return value


class SeasonProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    player_id: int
    season_year: int
    age: int | None
    play_style: str
    career_personality: str
    match_mentality: str
    progression_type: str
    form: int
    confidence: int
    fatigue: int
    injury_status: str
    skill_environment: float
    notes: str | None
    created_at: datetime
    updated_at: datetime
    attributes: PlayerAttributesRead
    tournament_rating: float
    league_rating: float
    physical_rating: float
    technical_rating: float
    tactical_rating: float
    mental_rating: float
    attacking_rating: float
    defensive_rating: float


class PlayerWithProfilesRead(PlayerRead):
    profiles: list[SeasonProfileRead] = []


class DuplicateProfileRequest(BaseModel):
    season_year: SeasonYear
    apply_skill_inflation: bool = True
