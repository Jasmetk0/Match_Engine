from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.dependencies import get_db
from app.models.player import PlayerSeasonProfile
from app.schemas import MatchBatchRequest, MatchGenerateRequest, MatchGenerateResponse, MatchPreviewRequest, MatchPreviewResponse
from app.simulation.league_timed_engine import preview_league_probabilities, simulate_league_timed_match
from app.simulation.probabilities import preview_probabilities
from app.simulation.tour_match_engine import build_match_player, child_seed, normalize_seed, simulate_tour_match

router = APIRouter(prefix="/match", tags=["match"])


def _load_profile(db: Session, profile_id: int) -> PlayerSeasonProfile:
    profile = db.scalar(
        select(PlayerSeasonProfile)
        .where(PlayerSeasonProfile.id == profile_id)
        .options(joinedload(PlayerSeasonProfile.player), joinedload(PlayerSeasonProfile.attributes))
    )
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Season profile {profile_id} not found")
    if profile.attributes is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Season profile {profile_id} has no attributes")
    return profile


def _load_players(db: Session, a_id: int, b_id: int):
    if a_id == b_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose two different season profiles")
    return build_match_player(_load_profile(db, a_id)), build_match_player(_load_profile(db, b_id))



def _total_points(result: dict) -> int:
    points = result.get("stats", {}).get("total_points")
    if isinstance(points, dict):
        return sum(int(value or 0) for value in points.values())
    return 0


def _avg(values: list[float | int]) -> float:
    return round(sum(values) / len(values), 2) if values else 0.0


def _scoreline_key(result: dict, a_id: int, b_id: int) -> str:
    stats = result.get("stats", {})
    if result.get("match_type") == "league_timed_3x5":
        sets = stats.get("sets_won", {})
        a_sets = int(sets.get(str(a_id), 0)) if isinstance(sets, dict) else 0
        b_sets = int(sets.get(str(b_id), 0)) if isinstance(sets, dict) else 0
        drawn = int(stats.get("drawn_sets", 0) or stats.get("drawn_set_count", 0) or 0)
        if result.get("is_draw"):
            return f"draw ({a_sets}-{b_sets}, {drawn} drawn sets)"
        winner = result.get("winner", {}).get("name", "Winner") if result.get("winner") else "Winner"
        return f"{winner} {max(a_sets, b_sets)}-{min(a_sets, b_sets)} sets" + (f", {drawn} drawn sets" if drawn else "")
    games = stats.get("games_won", {})
    a_games = int(games.get(str(a_id), 0)) if isinstance(games, dict) else 0
    b_games = int(games.get(str(b_id), 0)) if isinstance(games, dict) else 0
    winner = result.get("winner", {}).get("name", "Winner") if result.get("winner") else "Winner"
    return f"{winner} {max(a_games, b_games)}-{min(a_games, b_games)}"


@router.post("/preview", response_model=MatchPreviewResponse)
def match_preview(payload: MatchPreviewRequest, db: Session = Depends(get_db)):
    a, b = _load_players(db, payload.player_a_profile_id, payload.player_b_profile_id)
    seed = normalize_seed(payload.seed)
    if payload.match_type == "league_timed_3x5":
        return preview_league_probabilities(a, b, seed, payload.monte_carlo_runs)
    return preview_probabilities(a, b, seed, payload.monte_carlo_runs)


@router.post("/generate", response_model=MatchGenerateResponse)
def match_generate(payload: MatchGenerateRequest, db: Session = Depends(get_db)):
    a, b = _load_players(db, payload.player_a_profile_id, payload.player_b_profile_id)
    seed = normalize_seed(payload.seed)
    if payload.match_type == "league_timed_3x5":
        return simulate_league_timed_match(a, b, seed, include_rallies=True)
    return simulate_tour_match(a, b, seed, include_rallies=True)


@router.post("/batch")
def match_batch(payload: MatchBatchRequest, db: Session = Depends(get_db)):
    a, b = _load_players(db, payload.player_a_profile_id, payload.player_b_profile_id)
    base_seed = normalize_seed(payload.seed)
    results = []
    scoreline_distribution: dict[str, int] = {}
    clean_times: list[float] = []
    broadcast_times: list[float] = []
    rally_shots: list[float] = []
    total_points: list[int] = []
    wins = {a.profile_id: 0, b.profile_id: 0, None: 0}

    for index in range(payload.runs):
        run_seed = normalize_seed(child_seed(base_seed, index + 1))
        result = simulate_league_timed_match(a, b, run_seed, include_rallies=False) if payload.match_type == "league_timed_3x5" else simulate_tour_match(a, b, run_seed, include_rallies=False)
        winner_id = result.get("winner", {}).get("profile_id") if result.get("winner") else None
        wins[winner_id] = wins.get(winner_id, 0) + 1
        stats = result.get("stats", {})
        scoreline = _scoreline_key(result, a.profile_id, b.profile_id)
        scoreline_distribution[scoreline] = scoreline_distribution.get(scoreline, 0) + 1
        total_points.append(_total_points(result))
        for source, target in [
            (stats.get("clean_rally_time_seconds") or stats.get("total_duration_seconds"), clean_times),
            (stats.get("estimated_broadcast_duration_seconds"), broadcast_times),
            (stats.get("average_rally_shots"), rally_shots),
        ]:
            if source is not None:
                target.append(float(source))
        if len(results) < 10:
            results.append({
                "seed": run_seed,
                "winner_name": result.get("winner", {}).get("name") if result.get("winner") else "Draw",
                "is_draw": bool(result.get("is_draw")),
                "score": result.get("match_score_text"),
                "total_points": total_points[-1],
            })

    a_wins = wins.get(a.profile_id, 0)
    b_wins = wins.get(b.profile_id, 0)
    draws = wins.get(None, 0)
    leader = a.name if a_wins >= b_wins else b.name
    return {
        "match_type": payload.match_type,
        "runs": payload.runs,
        "base_seed": base_seed,
        "player_a": a.public_dict(),
        "player_b": b.public_dict(),
        "player_a_wins": a_wins,
        "player_b_wins": b_wins,
        "draws": draws,
        "player_a_win_rate": round(a_wins / payload.runs, 3),
        "player_b_win_rate": round(b_wins / payload.runs, 3),
        "draw_rate": round(draws / payload.runs, 3),
        "average_total_points": _avg(total_points),
        "average_clean_time_seconds": _avg(clean_times),
        "average_broadcast_time_seconds": _avg(broadcast_times),
        "average_rally_shots": _avg(rally_shots),
        "scoreline_distribution": dict(sorted(scoreline_distribution.items(), key=lambda item: (-item[1], item[0]))),
        "sample_results": results,
        "style_summary": f"{a.name} ({a.play_style}) vs {b.name} ({b.play_style}) over {payload.runs} unsaved {payload.match_type} simulations.",
        "recommendation_summary": f"{leader} led the batch {a_wins}-{b_wins}" + (f" with {draws} draws." if draws else ".") + " Use this for matchup analysis only; it does not save historical matches.",
    }
