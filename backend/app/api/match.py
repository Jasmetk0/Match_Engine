from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.dependencies import get_db
from app.models.player import PlayerSeasonProfile
from app.schemas import MatchGenerateRequest, MatchGenerateResponse, MatchPreviewRequest, MatchPreviewResponse
from app.simulation.probabilities import preview_probabilities
from app.simulation.tour_match_engine import build_match_player, normalize_seed, simulate_tour_match

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


@router.post("/preview", response_model=MatchPreviewResponse)
def match_preview(payload: MatchPreviewRequest, db: Session = Depends(get_db)):
    a, b = _load_players(db, payload.player_a_profile_id, payload.player_b_profile_id)
    seed = normalize_seed(payload.seed)
    return preview_probabilities(a, b, seed, payload.monte_carlo_runs)


@router.post("/generate", response_model=MatchGenerateResponse)
def match_generate(payload: MatchGenerateRequest, db: Session = Depends(get_db)):
    a, b = _load_players(db, payload.player_a_profile_id, payload.player_b_profile_id)
    seed = normalize_seed(payload.seed)
    return simulate_tour_match(a, b, seed, include_rallies=True)
