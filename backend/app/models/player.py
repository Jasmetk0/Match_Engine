from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Player(Base):
    """Stable identity record for a squash player."""

    __tablename__ = "players"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    nationality: Mapped[str] = mapped_column(String(120), nullable=False, default="Unknown")
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[int | None] = mapped_column(Integer, nullable=True)
    handedness: Mapped[str] = mapped_column(String(20), nullable=False, default="right")
    backhand_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    nickname: Mapped[str | None] = mapped_column(String(120), nullable=True)
    popularity: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    leadership: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    profiles: Mapped[list["PlayerSeasonProfile"]] = relationship(
        back_populates="player",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="PlayerSeasonProfile.season_year.desc()",
    )

    __table_args__ = (
        CheckConstraint("handedness in ('right', 'left')", name="ck_players_handedness"),
        CheckConstraint("popularity >= 0 and popularity <= 100", name="ck_players_popularity_range"),
        CheckConstraint("leadership >= 0 and leadership <= 100", name="ck_players_leadership_range"),
    )


class PlayerSeasonProfile(Base):
    """Season-specific version of a player used by future simulations."""

    __tablename__ = "player_season_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"), nullable=False, index=True)
    season_year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    play_style: Mapped[str] = mapped_column(String(120), nullable=False, default="All-Rounder")
    career_personality: Mapped[str] = mapped_column(String(120), nullable=False, default="Stable Grinder")
    match_mentality: Mapped[str] = mapped_column(String(120), nullable=False, default="Mentally Tough")
    progression_type: Mapped[str] = mapped_column(String(120), nullable=False, default="Standard")
    form: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    fatigue: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    injury_status: Mapped[str] = mapped_column(String(40), nullable=False, default="Fresh")
    skill_environment: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    player: Mapped[Player] = relationship(back_populates="profiles")
    attributes: Mapped["PlayerAttributes"] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )

    __table_args__ = (
        UniqueConstraint("player_id", "season_year", name="uq_player_season_profile"),
        CheckConstraint("season_year >= 1900 and season_year <= 2200", name="ck_profiles_season_year_range"),
        CheckConstraint("form >= 0 and form <= 100", name="ck_profiles_form_range"),
        CheckConstraint("confidence >= 0 and confidence <= 100", name="ck_profiles_confidence_range"),
        CheckConstraint("fatigue >= 0 and fatigue <= 100", name="ck_profiles_fatigue_range"),
        CheckConstraint(
            "injury_status in ('Fresh', 'Managed', 'Worn', 'Compromised')",
            name="ck_profiles_injury_status",
        ),
    )


class PlayerAttributes(Base):
    """One-to-one season attribute set. All ratings are integer 0-100."""

    __tablename__ = "player_attributes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("player_season_profiles.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    serve_pressure: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    return_initiative: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    length_quality: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    width_control: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    volley_takeover: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    front_court_touch: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    finishing_power: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    first_step_cod: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    t_recovery: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    aerobic_repeatability: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    recovery_efficiency: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    anticipation: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    shot_selection: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    adaptability: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    composure: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    error_discipline: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    deception_creativity: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    durability: Mapped[int] = mapped_column(Integer, nullable=False, default=50)

    profile: Mapped[PlayerSeasonProfile] = relationship(back_populates="attributes")
