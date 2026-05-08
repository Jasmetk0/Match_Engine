from app.models.player import PlayerSeasonProfile


def _weighted(values: dict[str, float], weights: dict[str, float]) -> float:
    total_weight = sum(weights.values())
    return sum(values[name] * weight for name, weight in weights.items()) / total_weight


def _adjust(base: float, profile: PlayerSeasonProfile) -> float:
    environment_bonus = (profile.skill_environment - 1.0) * 10.0
    form_confidence_adjustment = ((profile.form - 50) * 0.035) + ((profile.confidence - 50) * 0.035)
    fatigue_penalty = profile.fatigue * 0.035
    injury_penalty = {
        "Fresh": 0.0,
        "Managed": 1.5,
        "Worn": 4.0,
        "Compromised": 8.0,
    }.get(profile.injury_status, 0.0)
    return round(max(0.0, min(100.0, base + environment_bonus + form_confidence_adjustment - fatigue_penalty - injury_penalty)), 1)


def calculate_derived_ratings(profile: PlayerSeasonProfile) -> dict[str, float]:
    attrs = profile.attributes
    values = {column.name: getattr(attrs, column.name) for column in attrs.__table__.columns if column.name not in {"id", "profile_id"}}
    values.update({"form": profile.form, "confidence": profile.confidence})

    formulas = {
        "technical_rating": {
            "length_quality": 1.25,
            "width_control": 1.15,
            "volley_takeover": 1.0,
            "front_court_touch": 1.0,
            "serve_pressure": 0.8,
            "return_initiative": 0.9,
            "deception_creativity": 0.8,
        },
        "physical_rating": {
            "first_step_cod": 1.15,
            "t_recovery": 1.2,
            "aerobic_repeatability": 1.1,
            "recovery_efficiency": 1.0,
            "finishing_power": 0.75,
            "durability": 0.9,
        },
        "tactical_rating": {
            "anticipation": 1.2,
            "shot_selection": 1.25,
            "adaptability": 1.0,
            "width_control": 0.75,
            "volley_takeover": 0.65,
        },
        "mental_rating": {
            "composure": 1.25,
            "error_discipline": 1.15,
            "confidence": 0.45,
            "form": 0.35,
            "adaptability": 0.8,
        },
        "attacking_rating": {
            "volley_takeover": 1.15,
            "front_court_touch": 1.0,
            "finishing_power": 1.0,
            "serve_pressure": 0.75,
            "deception_creativity": 0.9,
            "shot_selection": 0.8,
        },
        "defensive_rating": {
            "return_initiative": 0.9,
            "length_quality": 1.0,
            "width_control": 0.85,
            "first_step_cod": 0.9,
            "t_recovery": 1.1,
            "aerobic_repeatability": 1.0,
            "error_discipline": 1.0,
            "durability": 0.75,
        },
        "tournament_rating": {
            "length_quality": 1.1,
            "t_recovery": 1.1,
            "aerobic_repeatability": 1.0,
            "error_discipline": 1.0,
            "shot_selection": 1.0,
            "anticipation": 0.95,
            "composure": 1.0,
            "recovery_efficiency": 0.9,
            "volley_takeover": 0.75,
            "front_court_touch": 0.7,
        },
        "league_rating": {
            "volley_takeover": 1.1,
            "front_court_touch": 1.0,
            "finishing_power": 0.95,
            "first_step_cod": 1.0,
            "shot_selection": 0.9,
            "composure": 0.9,
            "deception_creativity": 0.85,
            "return_initiative": 0.8,
            "t_recovery": 0.85,
            "error_discipline": 0.75,
        },
    }

    return {name: _adjust(_weighted(values, weights), profile) for name, weights in formulas.items()}
