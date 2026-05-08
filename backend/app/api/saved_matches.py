import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import desc, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.models.saved_match import SavedMatch
from app.schemas import SavedMatchCreate, SavedMatchDetailRead, SavedMatchSummaryRead, SavedMatchUpdate

router = APIRouter(prefix="/saved-matches", tags=["saved matches"])


def _as_dict(value: Any, field_name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field_name} must be an object")
    return value


def _nested(data: dict[str, Any], key: str) -> dict[str, Any]:
    value = data.get(key)
    return value if isinstance(value, dict) else {}


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


def _float_or_none(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _required_str(value: Any, fallback: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def _total_points(result: dict[str, Any]) -> int | None:
    stats = _nested(result, "stats")
    total_points = stats.get("total_points")
    if isinstance(total_points, dict):
        try:
            return sum(int(value) for value in total_points.values() if value is not None)
        except (TypeError, ValueError):
            return None
    if total_points is not None:
        return _int_or_none(total_points)
    games = result.get("games")
    if isinstance(games, list):
        total = 0
        for game in games:
            if isinstance(game, dict) and isinstance(game.get("score"), list):
                try:
                    total += sum(int(point) for point in game["score"][:2])
                except (TypeError, ValueError):
                    return None
        return total
    return None


def _total_duration_seconds(result: dict[str, Any]) -> float | None:
    stats = _nested(result, "stats")
    duration = _float_or_none(stats.get("total_duration_seconds"))
    if duration is not None:
        return duration
    games = result.get("games")
    if isinstance(games, list):
        durations = [_float_or_none(game.get("duration_seconds")) for game in games if isinstance(game, dict)]
        durations = [value for value in durations if value is not None]
        if durations:
            return round(sum(durations), 1)
    return None


def _season_year(result: dict[str, Any]) -> int | None:
    years = [_int_or_none(_nested(result, key).get("season_year")) for key in ("player_a", "player_b")]
    years = [year for year in years if year is not None]
    if not years:
        return None
    return years[0] if len(set(years)) == 1 else max(years)


def _json_loads(raw: str | None) -> dict[str, Any] | None:
    if raw is None:
        return None
    value = json.loads(raw)
    return value if isinstance(value, dict) else None


def _json_dumps(value: dict[str, Any]) -> str:
    try:
        return json.dumps(jsonable_encoder(value), allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Payload contains data that cannot be serialized as JSON: {exc}") from exc


def _detail(saved_match: SavedMatch) -> SavedMatchDetailRead:
    return SavedMatchDetailRead(
        id=saved_match.id,
        created_at=saved_match.created_at,
        title=saved_match.title,
        match_type=saved_match.match_type,
        seed=saved_match.seed,
        player_a_name_snapshot=saved_match.player_a_name_snapshot,
        player_b_name_snapshot=saved_match.player_b_name_snapshot,
        winner_name_snapshot=saved_match.winner_name_snapshot,
        loser_name_snapshot=saved_match.loser_name_snapshot,
        match_score_text=saved_match.match_score_text,
        total_duration_seconds=saved_match.total_duration_seconds,
        total_points=saved_match.total_points,
        notes=saved_match.notes,
        preview=_json_loads(saved_match.preview_json),
        result=_json_loads(saved_match.result_json) or {},
    )


def _get_saved_match(db: Session, saved_match_id: int) -> SavedMatch:
    saved_match = db.get(SavedMatch, saved_match_id)
    if saved_match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved match not found")
    return saved_match


@router.get("/health")
def saved_matches_health():
    return {"status": "ok", "router": "saved-matches"}


@router.post("", response_model=SavedMatchDetailRead, status_code=status.HTTP_201_CREATED)
def create_saved_match(payload: SavedMatchCreate, db: Session = Depends(get_db)):
    result = _as_dict(payload.result, "result")
    preview = payload.preview if payload.preview is None else _as_dict(payload.preview, "preview")
    player_a = _nested(result, "player_a")
    player_b = _nested(result, "player_b")
    is_draw = bool(result.get("is_draw"))
    winner = {} if result.get("winner") is None else _nested(result, "winner")
    loser = {} if result.get("loser") is None else _nested(result, "loser")
    stats = _nested(result, "stats")

    seed = _seed_or_none(result.get("seed"))
    if seed is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="result.seed is required")

    saved_match = SavedMatch(
        title=payload.title,
        notes=payload.notes,
        match_type=_required_str(result.get("match_type"), "tour_bo5"),
        season_year=_season_year(result),
        seed=seed,
        player_a_profile_id=_int_or_none(player_a.get("profile_id")),
        player_b_profile_id=_int_or_none(player_b.get("profile_id")),
        winner_profile_id=None if is_draw else _int_or_none(winner.get("profile_id")),
        loser_profile_id=None if is_draw else _int_or_none(loser.get("profile_id")),
        player_a_name_snapshot=_required_str(player_a.get("name"), "Player A"),
        player_b_name_snapshot=_required_str(player_b.get("name"), "Player B"),
        winner_name_snapshot="Draw" if is_draw else _required_str(winner.get("name"), "Winner"),
        loser_name_snapshot="Draw" if is_draw else _required_str(loser.get("name"), "Loser"),
        match_score_text=_required_str(result.get("match_score_text"), "Score unavailable"),
        total_duration_seconds=_total_duration_seconds(result),
        total_points=_total_points(result),
        result_json=_json_dumps(result),
        preview_json=_json_dumps(preview) if preview is not None else None,
    )
    try:
        db.add(saved_match)
        db.commit()
        db.refresh(saved_match)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Could not save match: {exc.__class__.__name__}") from exc
    return _detail(saved_match)


@router.get("", response_model=list[SavedMatchSummaryRead])
def list_saved_matches(db: Session = Depends(get_db)):
    return db.scalars(select(SavedMatch).order_by(desc(SavedMatch.created_at), desc(SavedMatch.id))).all()


@router.get("/{saved_match_id}", response_model=SavedMatchDetailRead)
def get_saved_match(saved_match_id: int, db: Session = Depends(get_db)):
    return _detail(_get_saved_match(db, saved_match_id))


@router.put("/{saved_match_id}", response_model=SavedMatchDetailRead)
def update_saved_match(saved_match_id: int, payload: SavedMatchUpdate, db: Session = Depends(get_db)):
    saved_match = _get_saved_match(db, saved_match_id)
    update_data = payload.model_dump(exclude_unset=True)
    if "title" in update_data:
        saved_match.title = update_data["title"]
    if "notes" in update_data:
        saved_match.notes = update_data["notes"]
    saved_match.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(saved_match)
    return _detail(saved_match)


@router.delete("/{saved_match_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_match(saved_match_id: int, db: Session = Depends(get_db)):
    saved_match = _get_saved_match(db, saved_match_id)
    db.delete(saved_match)
    db.commit()
