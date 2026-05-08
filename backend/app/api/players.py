from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db.dependencies import get_db
from app.models.player import Player, PlayerAttributes, PlayerSeasonProfile
from app.ratings import calculate_derived_ratings
from app.schemas import (
    ATTRIBUTE_FIELDS,
    DuplicateProfileRequest,
    PlayerCreate,
    PlayerRead,
    PlayerUpdate,
    PlayerWithProfilesRead,
    SeasonProfileCreate,
    SeasonProfileRead,
    SeasonProfileUpdate,
)

router = APIRouter(tags=["players"])


def _profile_read(profile: PlayerSeasonProfile) -> SeasonProfileRead:
    data = {
        "id": profile.id,
        "player_id": profile.player_id,
        "season_year": profile.season_year,
        "age": profile.age,
        "play_style": profile.play_style,
        "career_personality": profile.career_personality,
        "match_mentality": profile.match_mentality,
        "progression_type": profile.progression_type,
        "form": profile.form,
        "confidence": profile.confidence,
        "fatigue": profile.fatigue,
        "injury_status": profile.injury_status,
        "skill_environment": profile.skill_environment,
        "notes": profile.notes,
        "created_at": profile.created_at,
        "updated_at": profile.updated_at,
        "attributes": profile.attributes,
    }
    data.update(calculate_derived_ratings(profile))
    return SeasonProfileRead.model_validate(data)


def _player_read(player: Player) -> PlayerRead:
    latest = max(player.profiles, key=lambda profile: profile.season_year, default=None)
    latest_ratings = calculate_derived_ratings(latest) if latest and latest.attributes else {}
    return PlayerRead.model_validate(
        {
            **player.__dict__,
            "profile_count": len(player.profiles),
            "latest_season": latest.season_year if latest else None,
            "latest_tournament_rating": latest_ratings.get("tournament_rating"),
            "latest_league_rating": latest_ratings.get("league_rating"),
        }
    )


def _get_player(db: Session, player_id: int) -> Player:
    player = db.scalar(
        select(Player).where(Player.id == player_id).options(selectinload(Player.profiles).selectinload(PlayerSeasonProfile.attributes))
    )
    if not player:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    return player


def _get_profile(db: Session, profile_id: int) -> PlayerSeasonProfile:
    profile = db.scalar(
        select(PlayerSeasonProfile)
        .where(PlayerSeasonProfile.id == profile_id)
        .options(joinedload(PlayerSeasonProfile.attributes))
    )
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season profile not found")
    return profile


def _commit_or_409(db: Session, message: str = "Name or season already exists") -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=message) from exc


def _create_profile_model(player_id: int, payload: SeasonProfileCreate) -> PlayerSeasonProfile:
    profile_data = payload.model_dump(exclude={"attributes"})
    profile = PlayerSeasonProfile(player_id=player_id, **profile_data)
    profile.attributes = PlayerAttributes(**payload.attributes.model_dump())
    return profile


@router.get("/players", response_model=list[PlayerRead])
def list_players(db: Session = Depends(get_db)):
    players = db.scalars(select(Player).options(selectinload(Player.profiles).selectinload(PlayerSeasonProfile.attributes))).all()
    return [_player_read(player) for player in players]


@router.post("/players", response_model=PlayerRead, status_code=status.HTTP_201_CREATED)
def create_player(payload: PlayerCreate, db: Session = Depends(get_db)):
    player = Player(**payload.model_dump())
    db.add(player)
    _commit_or_409(db, "Player name already exists")
    db.refresh(player)
    player.profiles = []
    return _player_read(player)


@router.get("/players/{player_id}", response_model=PlayerWithProfilesRead)
def get_player(player_id: int, db: Session = Depends(get_db)):
    player = _get_player(db, player_id)
    base = _player_read(player).model_dump()
    return PlayerWithProfilesRead(**base, profiles=[_profile_read(profile) for profile in player.profiles])


@router.put("/players/{player_id}", response_model=PlayerRead)
def update_player(player_id: int, payload: PlayerUpdate, db: Session = Depends(get_db)):
    player = _get_player(db, player_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(player, key, value)
    _commit_or_409(db, "Player name already exists")
    db.refresh(player)
    return _player_read(player)


@router.delete("/players/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_player(player_id: int, db: Session = Depends(get_db)):
    player = _get_player(db, player_id)
    db.delete(player)
    db.commit()


@router.get("/players/{player_id}/profiles", response_model=list[SeasonProfileRead])
def list_profiles(player_id: int, db: Session = Depends(get_db)):
    player = _get_player(db, player_id)
    return [_profile_read(profile) for profile in player.profiles]


@router.post("/players/{player_id}/profiles", response_model=SeasonProfileRead, status_code=status.HTTP_201_CREATED)
def create_profile(player_id: int, payload: SeasonProfileCreate, db: Session = Depends(get_db)):
    _get_player(db, player_id)
    profile = _create_profile_model(player_id, payload)
    db.add(profile)
    _commit_or_409(db, "Player already has a profile for this season")
    db.refresh(profile)
    return _profile_read(_get_profile(db, profile.id))


@router.get("/profiles/{profile_id}", response_model=SeasonProfileRead)
def get_profile(profile_id: int, db: Session = Depends(get_db)):
    return _profile_read(_get_profile(db, profile_id))


@router.put("/profiles/{profile_id}", response_model=SeasonProfileRead)
def update_profile(profile_id: int, payload: SeasonProfileUpdate, db: Session = Depends(get_db)):
    profile = _get_profile(db, profile_id)
    data = payload.model_dump(exclude_unset=True)
    attributes = data.pop("attributes", None)
    for key, value in data.items():
        setattr(profile, key, value)
    if attributes is not None:
        if profile.attributes is None:
            profile.attributes = PlayerAttributes()
        for key, value in attributes.items():
            setattr(profile.attributes, key, value)
    _commit_or_409(db, "Player already has a profile for this season")
    db.refresh(profile)
    return _profile_read(_get_profile(db, profile.id))


@router.delete("/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(profile_id: int, db: Session = Depends(get_db)):
    profile = _get_profile(db, profile_id)
    db.delete(profile)
    db.commit()


@router.post("/profiles/{profile_id}/duplicate", response_model=SeasonProfileRead, status_code=status.HTTP_201_CREATED)
def duplicate_profile(profile_id: int, payload: DuplicateProfileRequest, db: Session = Depends(get_db)):
    source = _get_profile(db, profile_id)
    profile = PlayerSeasonProfile(
        player_id=source.player_id,
        season_year=payload.season_year,
        age=source.age + (payload.season_year - source.season_year) if source.age is not None else None,
        play_style=source.play_style,
        career_personality=source.career_personality,
        match_mentality=source.match_mentality,
        progression_type=source.progression_type,
        form=source.form,
        confidence=source.confidence,
        fatigue=source.fatigue,
        injury_status=source.injury_status,
        skill_environment=min(1.5, source.skill_environment + (0.005 if payload.apply_skill_inflation else 0.0)),
        notes=source.notes,
    )
    profile.attributes = PlayerAttributes(**{field: getattr(source.attributes, field) for field in ATTRIBUTE_FIELDS})
    db.add(profile)
    _commit_or_409(db, "Player already has a profile for this season")
    db.refresh(profile)
    return _profile_read(_get_profile(db, profile.id))


@router.post("/dev/seed-sample-data", response_model=list[PlayerRead], status_code=status.HTTP_201_CREATED)
def seed_sample_data(db: Session = Depends(get_db)):
    if db.scalar(select(func.count(Player.id))) > 0:
        players = db.scalars(select(Player).options(selectinload(Player.profiles).selectinload(PlayerSeasonProfile.attributes))).all()
        return [_player_read(player) for player in players]

    samples = [
        (
            PlayerCreate(name="Arebady Macky jr", nationality="Fax & Finiat", birth_year=2001, height_cm=187, weight_kg=82, handedness="right"),
            SeasonProfileCreate(
                season_year=2030,
                age=29,
                play_style="Volley Pressor",
                career_personality="Fanatic",
                match_mentality="Mentally Tough",
                progression_type="Long Prime",
                attributes={
                    "volley_takeover": 93,
                    "first_step_cod": 91,
                    "t_recovery": 92,
                    "recovery_efficiency": 90,
                    "composure": 89,
                    "finishing_power": 90,
                },
            ),
        ),
        (
            PlayerCreate(name="Benjamin Paris", nationality="Francica", birth_year=2005, height_cm=181, weight_kg=76, handedness="right"),
            SeasonProfileCreate(
                season_year=2030,
                age=25,
                play_style="Relentless Retriever",
                career_personality="Workhorse",
                match_mentality="Comeback Fighter",
                progression_type="Standard",
                attributes={
                    "aerobic_repeatability": 94,
                    "t_recovery": 91,
                    "return_initiative": 89,
                    "error_discipline": 92,
                    "composure": 88,
                    "anticipation": 90,
                },
            ),
        ),
        (
            PlayerCreate(name="Olivier da Silva", nationality="Francica", birth_year=2006, height_cm=178, weight_kg=73, handedness="left"),
            SeasonProfileCreate(
                season_year=2030,
                age=24,
                play_style="Creative Magician",
                career_personality="Natural Talent",
                match_mentality="Ice Cold",
                progression_type="Flash Peak",
                attributes={
                    "front_court_touch": 95,
                    "deception_creativity": 96,
                    "shot_selection": 91,
                    "anticipation": 90,
                    "width_control": 89,
                    "composure": 93,
                },
            ),
        ),
    ]
    for player_payload, profile_payload in samples:
        player = Player(**player_payload.model_dump())
        db.add(player)
        db.flush()
        db.add(_create_profile_model(player.id, profile_payload))
    db.commit()
    players = db.scalars(select(Player).options(selectinload(Player.profiles).selectinload(PlayerSeasonProfile.attributes))).all()
    return [_player_read(player) for player in players]
