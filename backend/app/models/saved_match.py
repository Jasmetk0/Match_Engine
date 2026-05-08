from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SavedMatch(Base):
    """Historical snapshot of a generated match simulation."""

    __tablename__ = "saved_matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    title: Mapped[str | None] = mapped_column(String(240), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    match_type: Mapped[str] = mapped_column(String(80), nullable=False)
    season_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    player_a_profile_id: Mapped[int | None] = mapped_column(ForeignKey("player_season_profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    player_b_profile_id: Mapped[int | None] = mapped_column(ForeignKey("player_season_profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    winner_profile_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    loser_profile_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    player_a_name_snapshot: Mapped[str] = mapped_column(String(120), nullable=False)
    player_b_name_snapshot: Mapped[str] = mapped_column(String(120), nullable=False)
    winner_name_snapshot: Mapped[str] = mapped_column(String(120), nullable=False)
    loser_name_snapshot: Mapped[str] = mapped_column(String(120), nullable=False)
    match_score_text: Mapped[str] = mapped_column(String(240), nullable=False)
    total_duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result_json: Mapped[str] = mapped_column(Text, nullable=False)
    preview_json: Mapped[str | None] = mapped_column(Text, nullable=True)
