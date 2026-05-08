import json
import shutil
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from sqlalchemy import delete, distinct, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.api.players import ELITE_SAMPLE_PLAYERS, _upsert_elite_sample_players
from app.api.saved_matches import _season_year, _total_duration_seconds, _total_points
from app.core.config import DATA_DIR, DATABASE_PATH
from app.db.dependencies import get_db
from app.metadata import APP_VERSION
from app.models.player import Player, PlayerSeasonProfile
from app.models.saved_match import SavedMatch
from app.ratings import calculate_derived_ratings
from app.simulation.league_timed_engine import preview_league_probabilities, simulate_league_timed_match
from app.simulation.probabilities import preview_probabilities
from app.simulation.tour_match_engine import build_match_player, normalize_seed, simulate_tour_match

router = APIRouter(prefix="/dev", tags=["dev tools"])


class ImportSavedMatchesRequest(BaseModel):
    saved_matches: list[dict[str, Any]] = Field(default_factory=list)


class SelfTestRequest(BaseModel):
    save_test_matches: bool = False


def _json_dumps(value: dict[str, Any]) -> str:
    return json.dumps(jsonable_encoder(value), allow_nan=False)


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _required_str(value: Any, fallback: str) -> str:
    return value.strip() if isinstance(value, str) and value.strip() else fallback


def _int_or_none(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return None


def _seed_or_none(value: Any) -> int | None:
    seed = _int_or_none(value)
    if seed is None:
        return None
    seed = abs(seed) % (2**31 - 1)
    return seed or 1


def _nested(data: dict[str, Any], key: str) -> dict[str, Any]:
    value = data.get(key)
    return value if isinstance(value, dict) else {}


def _saved_match_from_payload(row: dict[str, Any]) -> SavedMatch:
    result = row.get("result")
    if not isinstance(result, dict):
        raise ValueError("missing result object")
    preview = row.get("preview")
    if preview is not None and not isinstance(preview, dict):
        raise ValueError("preview must be an object when provided")

    player_a = _nested(result, "player_a") or row
    player_b = _nested(result, "player_b") or row
    is_draw = bool(result.get("is_draw")) or row.get("winner_name_snapshot") == "Draw"
    winner = {} if result.get("winner") is None else _nested(result, "winner")
    loser = {} if result.get("loser") is None else _nested(result, "loser")
    seed = _seed_or_none(result.get("seed", row.get("seed")))
    if seed is None:
        raise ValueError("missing seed")

    created_at = _parse_datetime(row.get("created_at"))
    updated_at = _parse_datetime(row.get("updated_at"))
    match = SavedMatch(
        title=row.get("title") if isinstance(row.get("title"), str) else None,
        notes=row.get("notes") if isinstance(row.get("notes"), str) else None,
        match_type=_required_str(result.get("match_type") or row.get("match_type"), "tour_bo5"),
        season_year=_int_or_none(row.get("season_year")) or _season_year(result),
        seed=seed,
        player_a_profile_id=_int_or_none(player_a.get("profile_id") or row.get("player_a_profile_id")),
        player_b_profile_id=_int_or_none(player_b.get("profile_id") or row.get("player_b_profile_id")),
        winner_profile_id=None if is_draw else _int_or_none(winner.get("profile_id") or row.get("winner_profile_id")),
        loser_profile_id=None if is_draw else _int_or_none(loser.get("profile_id") or row.get("loser_profile_id")),
        player_a_name_snapshot=_required_str(player_a.get("name") or row.get("player_a_name_snapshot"), "Player A"),
        player_b_name_snapshot=_required_str(player_b.get("name") or row.get("player_b_name_snapshot"), "Player B"),
        winner_name_snapshot="Draw" if is_draw else _required_str(winner.get("name") or row.get("winner_name_snapshot"), "Winner"),
        loser_name_snapshot="Draw" if is_draw else _required_str(loser.get("name") or row.get("loser_name_snapshot"), "Loser"),
        match_score_text=_required_str(result.get("match_score_text") or row.get("match_score_text"), "Score unavailable"),
        total_duration_seconds=_total_duration_seconds(result),
        total_points=_total_points(result),
        result_json=_json_dumps(result),
        preview_json=_json_dumps(preview) if preview is not None else None,
    )
    if created_at is not None:
        match.created_at = created_at
    if updated_at is not None:
        match.updated_at = updated_at
    return match


def _fingerprint(match: SavedMatch) -> tuple[str, int, str, str, str, str]:
    created = match.created_at.isoformat() if match.created_at else ""
    return (
        match.match_type,
        match.seed,
        match.player_a_name_snapshot,
        match.player_b_name_snapshot,
        match.match_score_text,
        created,
    )


def _find_sample_profile(db: Session, name: str) -> PlayerSeasonProfile:
    profile = db.scalar(
        select(PlayerSeasonProfile)
        .join(Player)
        .where(Player.name == name, PlayerSeasonProfile.season_year == 2030)
        .options(joinedload(PlayerSeasonProfile.player), joinedload(PlayerSeasonProfile.attributes))
    )
    if profile is None:
        raise RuntimeError(f"Missing 2030 profile for {name}")
    return profile


def _add_check(checks: list[dict[str, str]], name: str, status_value: str, message: str) -> None:
    checks.append({"name": name, "status": status_value, "message": message})


@router.get("/db-info")
def db_info(db: Session = Depends(get_db)):
    return {
        "status": "ok",
        "database_path": str(DATABASE_PATH),
        "player_count": db.scalar(select(func.count(Player.id))) or 0,
        "season_profile_count": db.scalar(select(func.count(PlayerSeasonProfile.id))) or 0,
        "saved_match_count": db.scalar(select(func.count(SavedMatch.id))) or 0,
        "earliest_saved_match_created_at": db.scalar(select(func.min(SavedMatch.created_at))),
        "latest_saved_match_created_at": db.scalar(select(func.max(SavedMatch.created_at))),
        "available_match_types": db.scalars(select(distinct(SavedMatch.match_type)).order_by(SavedMatch.match_type)).all(),
        "app_version": APP_VERSION,
        "schema_version": APP_VERSION,
    }


@router.post("/backup-db")
def backup_db():
    if not DATABASE_PATH.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Database file not found at {DATABASE_PATH}")
    backup_dir = DATA_DIR / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"squash_engine_backup_{stamp}.db"
    shutil.copy2(DATABASE_PATH, backup_path)
    return {"status": "ok", "backup_path": str(backup_path), "size_bytes": backup_path.stat().st_size}


@router.post("/clear-saved-matches")
def clear_saved_matches(db: Session = Depends(get_db)):
    deleted_count = db.scalar(select(func.count(SavedMatch.id))) or 0
    db.execute(delete(SavedMatch))
    db.commit()
    remaining = db.scalar(select(func.count(SavedMatch.id))) or 0
    return {"deleted_count": deleted_count, "remaining_saved_match_count": remaining}


@router.post("/import-saved-matches")
def import_saved_matches(payload: ImportSavedMatchesRequest, db: Session = Depends(get_db)):
    existing = db.execute(
        select(
            SavedMatch.match_type,
            SavedMatch.seed,
            SavedMatch.player_a_name_snapshot,
            SavedMatch.player_b_name_snapshot,
            SavedMatch.match_score_text,
            SavedMatch.created_at,
        )
    ).all()
    normalized_existing = {
        (match_type, seed, a, b, score, created.isoformat() if created else "")
        for match_type, seed, a, b, score, created in existing
    }
    matches_to_import: list[SavedMatch] = []
    skipped_duplicates = 0
    errors: list[str] = []

    for index, row in enumerate(payload.saved_matches):
        try:
            if not isinstance(row, dict):
                raise ValueError("row must be an object")
            match = _saved_match_from_payload(row)
            fingerprint = _fingerprint(match)
            if fingerprint in normalized_existing:
                skipped_duplicates += 1
                continue
            matches_to_import.append(match)
            normalized_existing.add(fingerprint)
        except (ValueError, TypeError) as exc:
            errors.append(f"row {index}: {exc}")

    try:
        db.add_all(matches_to_import)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        errors.append(f"database commit: {exc.__class__.__name__}")
        matches_to_import = []

    return {"imported_count": len(matches_to_import), "skipped_duplicates": skipped_duplicates, "errors": errors}


@router.post("/self-test")
def self_test(payload: SelfTestRequest, db: Session = Depends(get_db)):
    checks: list[dict[str, str]] = []
    errors: list[str] = []
    sample_ratings: dict[str, dict[str, float]] = {}
    generated_summaries: dict[str, str] = {}
    status_value = "ok"

    def run_check(name: str, fn):
        nonlocal status_value
        try:
            message = fn()
            _add_check(checks, name, "ok", str(message))
        except Exception as exc:  # noqa: BLE001 - self-test should collect failures defensively.
            status_value = "failed"
            errors.append(f"{name}: {exc}")
            _add_check(checks, name, "failed", str(exc))

    profiles: dict[str, PlayerSeasonProfile] = {}
    match_players: dict[str, Any] = {}
    results: dict[str, dict[str, Any]] = {}

    def ensure_samples():
        _upsert_elite_sample_players(db)
        return f"Ensured {len(ELITE_SAMPLE_PLAYERS)} elite sample players."

    def load_profiles():
        for name in ["Arebady Macky jr", "Benjamin Paris", "Olivier da Silva"]:
            profile = _find_sample_profile(db, name)
            profiles[name] = profile
            ratings = calculate_derived_ratings(profile)
            sample_ratings[name] = {
                "tour": ratings["tournament_rating"],
                "league": ratings["league_rating"],
            }
            match_players[name] = build_match_player(profile)
        return "Loaded Arebady, Benjamin, and Olivier 2030 profiles."

    def generate_tour():
        result = simulate_tour_match(match_players["Arebady Macky jr"], match_players["Benjamin Paris"], normalize_seed("self-test-tour"), include_rallies=False)
        results["tour"] = result
        generated_summaries["tour_result_score"] = result.get("match_score_text", "Score unavailable")
        return generated_summaries["tour_result_score"]

    def generate_league():
        result = simulate_league_timed_match(match_players["Olivier da Silva"], match_players["Benjamin Paris"], normalize_seed("self-test-league"), include_rallies=False)
        results["league"] = result
        generated_summaries["league_result_score"] = result.get("match_score_text", "Score unavailable")
        return generated_summaries["league_result_score"]

    def preview_tour():
        preview = preview_probabilities(match_players["Arebady Macky jr"], match_players["Benjamin Paris"], normalize_seed("self-test-preview-tour"), 50)
        return f"Tour preview ran with A win probability {preview.get('player_a_win_probability')}."

    def preview_league():
        preview = preview_league_probabilities(match_players["Olivier da Silva"], match_players["Benjamin Paris"], normalize_seed("self-test-preview-league"), 50)
        return f"League preview ran with A win probability {preview.get('player_a_win_probability')}."

    def batch_simulation():
        for index in range(5):
            simulate_tour_match(match_players["Arebady Macky jr"], match_players["Benjamin Paris"], normalize_seed(f"self-test-batch-{index}"), include_rallies=False)
        return "Batch smoke test ran 5 unsaved Tour simulations."

    def saved_router_check():
        before = db.scalar(select(func.count(SavedMatch.id))) or 0
        if payload.save_test_matches:
            for key, result in results.items():
                match = _saved_match_from_payload({"result": result, "title": f"Self-test {key}"})
                db.add(match)
            db.commit()
            after = db.scalar(select(func.count(SavedMatch.id))) or 0
            return f"Saved {after - before} explicit self-test matches."
        return f"Saved-match storage reachable; current count {before}. No permanent test matches saved."

    for name, fn in [
        ("Ensure elite sample players", ensure_samples),
        ("Load sample profiles", load_profiles),
        ("Generate Tour BO5", generate_tour),
        ("Generate League Timed 3x5", generate_league),
        ("Preview Tour", preview_tour),
        ("Preview League", preview_league),
        ("Batch simulation", batch_simulation),
        ("Saved matches router/storage", saved_router_check),
    ]:
        run_check(name, fn)

    return {
        "status": status_value,
        "checks": checks,
        "sample_ratings": sample_ratings,
        "generated_summaries": generated_summaries,
        "errors": errors,
    }
