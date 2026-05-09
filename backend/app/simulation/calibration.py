from __future__ import annotations

from typing import Any

from app.simulation.match_types import MatchPlayer

INJURY_FATIGUE = {"Fresh": 0.0, "Managed": 3.0, "Worn": 7.0, "Compromised": 13.0}

STYLE_EFFECTS: dict[str, dict[str, float]] = {
    "Volley Pressor": {"initiative": 3.0, "t_control": 2.7, "short": 1.8, "league": 1.0},
    "Relentless Retriever": {"defense": 3.0, "long": 2.7, "fatigue": -0.9, "extended": 1.1, "league": -0.2},
    "Creative Magician": {"attack": 2.0, "deception": 3.2, "volatility": 1.0, "league": 1.6},
    "Tactical Controller": {"control": 3.0, "discipline": 1.8, "chaos": -1.3, "protect": 1.1},
    "Power Driver": {"attack": 2.9, "short": 1.8, "risk": 0.9, "league": 1.3},
    "Pressure Defender": {"defense": 2.7, "long": 1.7, "pressure": 1.5},
    "Game Reader": {"anticipation": 2.7, "adapt": 2.0, "late": 0.8},
    "Tricky Opportunist": {"deception": 2.0, "tired_target": 2.4, "pressure": 0.7, "league": 0.7},
    "Aggressive Disruptor": {"attack": 2.8, "volatility": 2.1, "risk": 1.3, "league": 1.4},
    "Composed Controller": {"control": 2.1, "discipline": 2.8, "pressure": 1.6, "protect": 1.2},
    "All-Rounder": {"stability": 1.0, "chaos": -0.2},
    "Endurance Grinder": {"long": 3.0, "fatigue": -1.2, "late": 1.4, "extended": 1.3, "league": -0.1},
}

LEAGUE_STYLE_EFFECTS: dict[str, dict[str, float]] = {
    "Volley Pressor": {"quick": 4.8, "control": 3.1, "attack": 2.0, "protect": 0.5},
    "Creative Magician": {"attack": 3.8, "volatility": 2.3, "pressure": 1.0, "quick": 1.0},
    "Power Driver": {"quick": 4.0, "attack": 3.5, "risk": 2.1},
    "Aggressive Disruptor": {"quick": 3.4, "attack": 3.0, "volatility": 3.4, "risk": 2.6},
    "Tricky Opportunist": {"tired_target": 3.4, "attack": 2.0, "pressure": 1.0, "quick": 0.8},
    "Tactical Controller": {"control": 3.2, "protect": 3.0, "discipline": 1.8},
    "Relentless Retriever": {"defense": 2.4, "long": 0.9, "fatigue": -0.6, "quick": -0.4},
    "Endurance Grinder": {"third_set": 2.6, "long": 1.0, "fatigue": -0.8, "quick": -0.5},
    "Composed Controller": {"control": 2.2, "protect": 3.2, "pressure": 2.2, "discipline": 2.0},
    "Pressure Defender": {"defense": 2.4, "pressure": 1.5, "long": 0.8},
    "Game Reader": {"control": 1.2, "pressure": 0.8, "third_set": 1.2},
    "All-Rounder": {"stable": 1.0},
}

TOUR_RALLY_LENGTH_WEIGHTS = {"short": 29.0, "medium": 41.0, "long": 22.0, "brutal": 6.5}
TOUR_RALLY_SHOT_RANGES = {"short": (4, 8), "medium": (9, 18), "long": (19, 34), "brutal": (35, 62)}
TOUR_SECONDS_PER_SHOT_RANGE = (1.22, 1.72)

LEAGUE_RALLY_LENGTH_WEIGHTS = {"short": 43.0, "medium": 39.0, "long": 13.0, "brutal": 2.8}
LEAGUE_RALLY_SHOT_RANGES = {"short": (2, 5), "medium": (6, 12), "long": (13, 23), "brutal": (24, 38)}
LEAGUE_SECONDS_PER_SHOT_RANGE = (0.92, 1.32)

TERMINAL_EVENT_BASE_RATES = {
    "tour": {"winner": 24.0, "forced_error": 28.0, "stroke": 2.2, "unforced_error_floor": 0.018, "unforced_error_cap": 0.22},
    "league": {"winner": 36.0, "forced_error": 25.0, "stroke": 2.4, "unforced_error_floor": 0.024, "unforced_error_cap": 0.28},
}

ELITE_QUALITY = {
    "threshold": 78.0,
    "max_bonus": 1.0,
    "error_suppression": 0.36,
    "rally_extension_tour": 0.14,
    "rally_extension_league": 0.04,
    "volatility_damping": 0.22,
    "pressure_logic_bonus": 1.4,
}

FATIGUE_ACCUMULATION = {
    "tour": {"short": 0.52, "medium": 0.92, "long": 1.48, "brutal": 2.10, "duration": 0.020, "shots": 0.032, "scramble": 0.32, "losing": 0.14},
    "league": {"short": 0.48, "medium": 0.78, "long": 1.18, "brutal": 1.62, "duration": 0.014, "shots": 0.022, "scramble": 0.19, "losing": 0.08},
}

FATIGUE_RECOVERY = {
    "tour_between_games_base": 5.8,
    "tour_recovery_efficiency_factor": 0.060,
    "tour_starting_fatigue_floor": 0.35,
    "league_between_sets_base": 3.4,
    "league_recovery_efficiency_factor": 0.035,
    "league_starting_fatigue_floor": 0.45,
}

PRESSURE_MULTIPLIERS = {
    "tour": {"normal": 0.0, "important": 0.8, "game_ball": 1.5, "match_ball": 2.1, "fifth_game": 0.6, "streak_penalty": 0.45},
    "league": {"normal": 0.0, "important": 0.8, "final_minute": 1.7, "must_score": 2.2, "set_point_equivalent": 2.5, "protecting_lead": 0.45},
}

BROADCAST_TIME = {
    "tour_between_rally_seconds": 17.0,
    "tour_between_game_seconds": 105.0,
    "tour_intro_outro_seconds": 120.0,
    "league_between_set_seconds": 50.0,
    "league_intro_outro_seconds": 70.0,
}

MONTE_CARLO_DEFAULTS = {"tour_runs": 200, "league_runs": 200, "realism_report_runs": 100}

KEY_QUALITY_ATTRIBUTES = (
    "error_discipline",
    "composure",
    "shot_selection",
    "t_recovery",
    "length_quality",
    "recovery_efficiency",
)


def style_value(player: MatchPlayer, key: str, *, league: bool = False) -> float:
    table = LEAGUE_STYLE_EFFECTS if league else STYLE_EFFECTS
    return table.get(player.play_style, {}).get(key, STYLE_EFFECTS.get(player.play_style, {}).get(key, 0.0))


def elite_quality_score(player: MatchPlayer, rating_key: str) -> float:
    attrs = sum(player.attr(name) for name in KEY_QUALITY_ATTRIBUTES) / len(KEY_QUALITY_ATTRIBUTES)
    rating = player.rating(rating_key)
    quality = attrs * 0.66 + rating * 0.34
    quality += (player.form - 50) * 0.025 + (player.confidence - 50) * 0.030
    quality -= INJURY_FATIGUE.get(player.injury_status, 0.0) * 0.18
    return max(0.0, min(100.0, quality))


def elite_modifier(player: MatchPlayer, rating_key: str) -> float:
    threshold = ELITE_QUALITY["threshold"]
    return max(0.0, min(ELITE_QUALITY["max_bonus"], (elite_quality_score(player, rating_key) - threshold) / (100 - threshold)))


def pair_quality(a: MatchPlayer, b: MatchPlayer, rating_key: str) -> float:
    return (elite_modifier(a, rating_key) + elite_modifier(b, rating_key)) / 2


def volatility_index(a: MatchPlayer, b: MatchPlayer, *, league: bool = False) -> float:
    raw = style_value(a, "volatility", league=league) + style_value(b, "volatility", league=league)
    raw += style_value(a, "risk", league=league) + style_value(b, "risk", league=league)
    raw -= pair_quality(a, b, "league_rating" if league else "tournament_rating") * ELITE_QUALITY["volatility_damping"] * 6
    return round(max(0.0, raw), 2)


def style_edge(a: MatchPlayer, b: MatchPlayer, *, league: bool = False) -> float:
    if league:
        a_edge = style_value(a, "league", league=True) + style_value(a, "quick", league=True) * 0.25 + style_value(a, "protect", league=True) * 0.18
        b_edge = style_value(b, "league", league=True) + style_value(b, "quick", league=True) * 0.25 + style_value(b, "protect", league=True) * 0.18
    else:
        a_edge = style_value(a, "long") * 0.20 + style_value(a, "control") * 0.18 + style_value(a, "pressure") * 0.14 + style_value(a, "late") * 0.18
        b_edge = style_value(b, "long") * 0.20 + style_value(b, "control") * 0.18 + style_value(b, "pressure") * 0.14 + style_value(b, "late") * 0.18
    return round(a_edge - b_edge, 2)


def calibration_debug(a: MatchPlayer, b: MatchPlayer, *, match_type: str, fatigue_impact: float = 0.0, pressure_impact: float = 0.0) -> dict[str, Any]:
    league = match_type == "league_timed_3x5"
    rating_key = "league_rating" if league else "tournament_rating"
    quality = (elite_quality_score(a, rating_key) + elite_quality_score(b, rating_key)) / 2
    return {
        "rating_edge": round(a.rating(rating_key) - b.rating(rating_key), 2),
        "style_edge_estimate": style_edge(a, b, league=league),
        "average_player_quality": round(quality, 1),
        "volatility_index": volatility_index(a, b, league=league),
        "fatigue_impact": round(fatigue_impact, 2),
        "pressure_impact": round(pressure_impact, 2),
        "format_modifier_summary": "Timed 3x5 boosts quick initiative, finishing risk and lead protection." if league else "Tour BO5 rewards elite length, recovery, sustained pressure and late-match endurance.",
    }


def style_matchup_summary(a: MatchPlayer, b: MatchPlayer, *, match_type: str) -> str:
    league = match_type == "league_timed_3x5"
    edge = style_edge(a, b, league=league)
    leader = a.name if edge > 0 else b.name if edge < 0 else "Neither player"
    format_text = "League timing helps quick finishers and controlled lead protection" if league else "Tour BO5 lets attrition, recovery and pattern learning accumulate"
    details = {
        "Volley Pressor": "early initiative and T-control",
        "Relentless Retriever": "long-rally survival and retrieval",
        "Creative Magician": "deception and front-court invention",
        "Tactical Controller": "length, width and chaos suppression",
        "Power Driver": "pace-driven quick finishes",
        "Pressure Defender": "defensive pressure and forced errors",
        "Game Reader": "pattern recognition after early games",
        "Tricky Opportunist": "punishing fatigue and clock stress",
        "Aggressive Disruptor": "volatile tempo disruption",
        "Composed Controller": "low-error closing and lead protection",
        "All-Rounder": "stable all-court coverage",
        "Endurance Grinder": "late-match attrition",
    }
    if abs(edge) < 0.45:
        return f"{a.name}'s {details.get(a.play_style, a.play_style)} met {b.name}'s {details.get(b.play_style, b.play_style)}; style is close, so ratings and execution should dominate. {format_text}."
    return f"{leader} has a modest format/style edge ({abs(edge):.1f}) as {a.name}'s {a.play_style} meets {b.name}'s {b.play_style}. {format_text}, but attributes still carry the main result weight."
