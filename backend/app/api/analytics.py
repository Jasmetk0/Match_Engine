import json
from collections import defaultdict
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.models.saved_match import SavedMatch

router = APIRouter(prefix="/analytics", tags=["analytics"])

MatchTypeFilter = str


def _norm(name: str) -> str:
    return " ".join(name.strip().casefold().split())


def _load_result(match: SavedMatch) -> dict[str, Any]:
    try:
        value = json.loads(match.result_json or "{}")
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def _nested(data: dict[str, Any], key: str) -> dict[str, Any]:
    value = data.get(key)
    return value if isinstance(value, dict) else {}


def _num(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _avg(values: list[float | int]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def _player_side(result: dict[str, Any], saved: SavedMatch, player_name: str) -> str | None:
    needle = _norm(player_name)
    a_name = _nested(result, "player_a").get("name") or saved.player_a_name_snapshot
    b_name = _nested(result, "player_b").get("name") or saved.player_b_name_snapshot
    if _norm(str(a_name)) == needle:
        return "a"
    if _norm(str(b_name)) == needle:
        return "b"
    return None


def _side_id(result: dict[str, Any], side: str) -> str | None:
    player = _nested(result, "player_a" if side == "a" else "player_b")
    pid = player.get("profile_id")
    return str(pid) if pid is not None else None


def _points_for_side(result: dict[str, Any], side: str) -> int | None:
    stats = _nested(result, "stats")
    pid = _side_id(result, side)
    total_points = stats.get("total_points")
    if isinstance(total_points, dict) and pid is not None:
        value = _int(total_points.get(pid))
        if value is not None:
            return value
    games = result.get("games")
    if isinstance(games, list):
        index = 0 if side == "a" else 1
        total = 0
        found = False
        for game in games:
            if isinstance(game, dict) and isinstance(game.get("score"), list) and len(game["score"]) > index:
                value = _int(game["score"][index])
                if value is not None:
                    total += value
                    found = True
        if found:
            return total
    return None


def _performance_for_side(result: dict[str, Any], side: str) -> float | None:
    ratings = _nested(result, "stats").get("performance_rating")
    pid = _side_id(result, side)
    if isinstance(ratings, dict) and pid is not None:
        return _num(ratings.get(pid))
    return None


def _sets_or_games_for_side(result: dict[str, Any], side: str, key: str) -> int:
    values = _nested(result, "stats").get(key)
    pid = _side_id(result, side)
    if isinstance(values, dict) and pid is not None:
        return _int(values.get(pid)) or 0
    return 0


def _is_draw(result: dict[str, Any], saved: SavedMatch) -> bool:
    return bool(result.get("is_draw")) or (saved.winner_name_snapshot == "Draw" and saved.loser_name_snapshot == "Draw")


def _winner_side(result: dict[str, Any], saved: SavedMatch) -> str | None:
    if _is_draw(result, saved):
        return None
    winner = _nested(result, "winner")
    winner_name = winner.get("name") or saved.winner_name_snapshot
    if _norm(str(winner_name)) == _norm(str(_nested(result, "player_a").get("name") or saved.player_a_name_snapshot)):
        return "a"
    if _norm(str(winner_name)) == _norm(str(_nested(result, "player_b").get("name") or saved.player_b_name_snapshot)):
        return "b"
    winner_id = winner.get("profile_id") or saved.winner_profile_id
    if winner_id is not None:
        if str(winner_id) == (_side_id(result, "a") or str(saved.player_a_profile_id)):
            return "a"
        if str(winner_id) == (_side_id(result, "b") or str(saved.player_b_profile_id)):
            return "b"
    return None


def _summary(saved: SavedMatch, result: dict[str, Any] | None = None) -> dict[str, Any]:
    result = result or _load_result(saved)
    stats = _nested(result, "stats")
    return {
        "id": saved.id,
        "created_at": saved.created_at,
        "title": saved.title,
        "match_type": saved.match_type,
        "seed": saved.seed,
        "player_a_name": saved.player_a_name_snapshot,
        "player_b_name": saved.player_b_name_snapshot,
        "winner_name": saved.winner_name_snapshot,
        "loser_name": saved.loser_name_snapshot,
        "is_draw": _is_draw(result, saved),
        "match_score_text": saved.match_score_text,
        "total_points": saved.total_points,
        "clean_rally_time_seconds": _num(stats.get("clean_rally_time_seconds")) or saved.total_duration_seconds,
        "estimated_broadcast_duration_seconds": _num(stats.get("estimated_broadcast_duration_seconds")),
    }


def _matches(db: Session, match_type: str = "all") -> list[SavedMatch]:
    stmt = select(SavedMatch)
    if match_type != "all":
        stmt = stmt.where(SavedMatch.match_type == match_type)
    return list(db.scalars(stmt.order_by(desc(SavedMatch.created_at), desc(SavedMatch.id))).all())


def _validate_match_type(match_type: str) -> str:
    if match_type not in {"all", "tour_bo5", "league_timed_3x5"}:
        raise HTTPException(status_code=422, detail="match_type must be all, tour_bo5 or league_timed_3x5")
    return match_type


@router.get("/h2h")
def h2h(
    player_a_name: str = Query(..., min_length=1),
    player_b_name: str = Query(..., min_length=1),
    match_type: MatchTypeFilter = "all",
    db: Session = Depends(get_db),
):
    match_type = _validate_match_type(match_type)
    a_key, b_key = _norm(player_a_name), _norm(player_b_name)
    relevant: list[tuple[SavedMatch, dict[str, Any], str, str]] = []
    for saved in _matches(db, match_type):
        result = _load_result(saved)
        side_a = _player_side(result, saved, player_a_name)
        side_b = _player_side(result, saved, player_b_name)
        if side_a and side_b and side_a != side_b:
            relevant.append((saved, result, side_a, side_b))

    response: dict[str, Any] = {
        "player_a_name": player_a_name,
        "player_b_name": player_b_name,
        "match_type_filter": match_type,
        "total_matches": len(relevant),
        "player_a_wins": 0,
        "player_b_wins": 0,
        "draws": 0,
        "tour_matches": 0,
        "league_matches": 0,
        "player_a_tour_wins": 0,
        "player_b_tour_wins": 0,
        "player_a_league_wins": 0,
        "player_b_league_wins": 0,
        "total_points_player_a": 0,
        "total_points_player_b": 0,
    }
    clean: list[float] = []
    broadcast: list[float] = []
    avg_shots: list[float] = []
    avg_rally_duration: list[float] = []
    point_matches = 0
    scored: list[tuple[int, SavedMatch, dict[str, Any], str, str]] = []

    for saved, result, side_a, side_b in relevant:
        stats = _nested(result, "stats")
        is_tour = saved.match_type == "tour_bo5"
        response["tour_matches" if is_tour else "league_matches"] += 1
        winner_side = _winner_side(result, saved)
        if winner_side is None:
            response["draws"] += 1
        elif winner_side == side_a:
            response["player_a_wins"] += 1
            response["player_a_tour_wins" if is_tour else "player_a_league_wins"] += 1
        elif winner_side == side_b:
            response["player_b_wins"] += 1
            response["player_b_tour_wins" if is_tour else "player_b_league_wins"] += 1
        pa = _points_for_side(result, side_a)
        pb = _points_for_side(result, side_b)
        if pa is not None and pb is not None:
            response["total_points_player_a"] += pa
            response["total_points_player_b"] += pb
            point_matches += 1
            scored.append((abs(pa - pb), saved, result, side_a, side_b))
        for target, key in [(clean, "clean_rally_time_seconds"), (broadcast, "estimated_broadcast_duration_seconds"), (avg_shots, "average_rally_shots"), (avg_rally_duration, "average_rally_duration_seconds")]:
            value = _num(stats.get(key))
            if value is not None:
                target.append(value)

    response.update({
        "average_points_player_a": _avg([response["total_points_player_a"] / point_matches]) if point_matches else None,
        "average_points_player_b": _avg([response["total_points_player_b"] / point_matches]) if point_matches else None,
        "average_clean_time_seconds": _avg(clean),
        "average_broadcast_time_seconds": _avg(broadcast),
        "average_rally_shots": _avg(avg_shots),
        "average_rally_duration_seconds": _avg(avg_rally_duration),
        "most_recent_matches": [_summary(saved, result) for saved, result, _, _ in relevant[:10]],
        "biggest_win_summary": _summary(max(scored, key=lambda item: item[0])[1], max(scored, key=lambda item: item[0])[2]) if scored else None,
        "closest_match_summary": _summary(min(scored, key=lambda item: item[0])[1], min(scored, key=lambda item: item[0])[2]) if scored else None,
    })
    return response


@router.get("/player/{player_name}")
def player_analytics(player_name: str, db: Session = Depends(get_db)):
    relevant: list[tuple[SavedMatch, dict[str, Any], str]] = []
    for saved in _matches(db):
        result = _load_result(saved)
        side = _player_side(result, saved, player_name)
        if side:
            relevant.append((saved, result, side))

    response: dict[str, Any] = {
        "player_name": player_name,
        "total_matches": len(relevant),
        "wins": 0,
        "losses": 0,
        "draws": 0,
        "win_rate": 0.0,
        "tour_matches": 0,
        "tour_wins": 0,
        "league_matches": 0,
        "league_wins": 0,
        "league_draws": 0,
        "total_points_for": 0,
        "total_points_against": 0,
        "point_differential": 0,
        "match_type_breakdown": {},
    }
    opponents: dict[str, dict[str, Any]] = defaultdict(lambda: {"opponent_name": "", "matches": 0, "wins": 0, "losses": 0, "draws": 0})
    clean: list[float] = []
    broadcast: list[float] = []
    performances: list[float] = []
    point_matches = 0
    breakdown: dict[str, dict[str, int]] = defaultdict(lambda: {"matches": 0, "wins": 0, "losses": 0, "draws": 0})

    for saved, result, side in relevant:
        opp_side = "b" if side == "a" else "a"
        opp_name = saved.player_b_name_snapshot if side == "a" else saved.player_a_name_snapshot
        opp_key = _norm(opp_name)
        opponents[opp_key]["opponent_name"] = opp_name
        opponents[opp_key]["matches"] += 1
        is_tour = saved.match_type == "tour_bo5"
        response["tour_matches" if is_tour else "league_matches"] += 1
        breakdown[saved.match_type]["matches"] += 1
        winner_side = _winner_side(result, saved)
        if winner_side is None:
            response["draws"] += 1
            if not is_tour:
                response["league_draws"] += 1
            opponents[opp_key]["draws"] += 1
            breakdown[saved.match_type]["draws"] += 1
        elif winner_side == side:
            response["wins"] += 1
            response["tour_wins" if is_tour else "league_wins"] += 1
            opponents[opp_key]["wins"] += 1
            breakdown[saved.match_type]["wins"] += 1
        else:
            response["losses"] += 1
            opponents[opp_key]["losses"] += 1
            breakdown[saved.match_type]["losses"] += 1
        pf = _points_for_side(result, side)
        pa = _points_for_side(result, opp_side)
        if pf is not None and pa is not None:
            response["total_points_for"] += pf
            response["total_points_against"] += pa
            point_matches += 1
        stats = _nested(result, "stats")
        for target, key in [(clean, "clean_rally_time_seconds"), (broadcast, "estimated_broadcast_duration_seconds")]:
            value = _num(stats.get(key))
            if value is not None:
                target.append(value)
        perf = _performance_for_side(result, side)
        if perf is not None:
            performances.append(perf)

    response["point_differential"] = response["total_points_for"] - response["total_points_against"]
    response["win_rate"] = round(response["wins"] / response["total_matches"], 3) if response["total_matches"] else 0.0
    response["average_points_for"] = round(response["total_points_for"] / point_matches, 2) if point_matches else None
    response["average_points_against"] = round(response["total_points_against"] / point_matches, 2) if point_matches else None
    response["average_clean_time_seconds"] = _avg(clean)
    response["average_broadcast_time_seconds"] = _avg(broadcast)
    response["common_opponents"] = sorted(opponents.values(), key=lambda item: (-item["matches"], item["opponent_name"]))[:12]
    response["match_type_breakdown"] = breakdown
    response["recent_matches"] = [_summary(saved, result) for saved, result, _ in relevant[:10]]
    response["best_performance_rating"] = max(performances) if performances else None
    response["average_performance_rating"] = _avg(performances)
    return response


@router.get("/players")
def players_leaderboard(db: Session = Depends(get_db)):
    rows: dict[str, dict[str, Any]] = {}
    for saved in _matches(db):
        result = _load_result(saved)
        for side, name in (("a", saved.player_a_name_snapshot), ("b", saved.player_b_name_snapshot)):
            key = _norm(name)
            entry = rows.setdefault(key, {
                "player_name": name, "matches": 0, "wins": 0, "losses": 0, "draws": 0, "win_rate": 0.0,
                "tour_wins": 0, "league_wins": 0, "league_draws": 0, "point_differential": 0,
                "average_performance_rating": None, "last_played_at": None, "_performances": [],
            })
            entry["matches"] += 1
            if entry["last_played_at"] is None or saved.created_at > entry["last_played_at"]:
                entry["last_played_at"] = saved.created_at
            winner_side = _winner_side(result, saved)
            if winner_side is None:
                entry["draws"] += 1
                if saved.match_type == "league_timed_3x5":
                    entry["league_draws"] += 1
            elif winner_side == side:
                entry["wins"] += 1
                entry["tour_wins" if saved.match_type == "tour_bo5" else "league_wins"] += 1
            else:
                entry["losses"] += 1
            opp_side = "b" if side == "a" else "a"
            pf = _points_for_side(result, side) or 0
            pa = _points_for_side(result, opp_side) or 0
            entry["point_differential"] += pf - pa
            perf = _performance_for_side(result, side)
            if perf is not None:
                entry["_performances"].append(perf)
    output = []
    for entry in rows.values():
        entry["win_rate"] = round(entry["wins"] / entry["matches"], 3) if entry["matches"] else 0.0
        entry["average_performance_rating"] = _avg(entry.pop("_performances"))
        output.append(entry)
    return sorted(output, key=lambda item: (-item["matches"], -item["wins"], item["player_name"]))
