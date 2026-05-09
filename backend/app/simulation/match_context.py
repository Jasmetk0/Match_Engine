from __future__ import annotations

from typing import Any

from app.simulation.match_types import MatchPlayer

DEFAULT_MATCH_CONTEXT = {
    "event_importance": "regular",
    "court_type": "standard_court",
    "crowd_environment": "neutral",
    "rest_context": "equal_rest",
    "travel_context": "none",
    "pressure_context": "normal",
}

CONTEXT_LABELS = {
    "regular": "Regular match", "major": "Major match", "world_championship": "World Championship", "final": "Final", "rivalry": "Rivalry", "exhibition": "Exhibition",
    "standard_court": "standard court", "glass_court": "glass court", "fast_court": "fast court", "slow_court": "slow court",
    "neutral": "neutral crowd", "home_player_a": "home crowd for Player A", "home_player_b": "home crowd for Player B", "hostile_to_a": "hostile to Player A", "hostile_to_b": "hostile to Player B",
    "equal_rest": "equal rest", "player_a_short_rest": "Player A short rest", "player_b_short_rest": "Player B short rest", "both_tired": "both tired",
    "none": "no travel fatigue", "player_a_travel_fatigue": "Player A travel fatigue", "player_b_travel_fatigue": "Player B travel fatigue",
    "normal": "normal pressure", "media_hype": "media hype", "legacy_match": "legacy match", "comeback_pressure": "comeback pressure", "must_win": "must win",
}

VALID_CONTEXT = {
    "event_importance": {"regular", "major", "world_championship", "final", "rivalry", "exhibition"},
    "court_type": {"standard_court", "glass_court", "fast_court", "slow_court"},
    "crowd_environment": {"neutral", "home_player_a", "home_player_b", "hostile_to_a", "hostile_to_b"},
    "rest_context": {"equal_rest", "player_a_short_rest", "player_b_short_rest", "both_tired"},
    "travel_context": {"none", "player_a_travel_fatigue", "player_b_travel_fatigue"},
    "pressure_context": {"normal", "media_hype", "legacy_match", "comeback_pressure", "must_win"},
}


def normalize_match_context(context: dict[str, Any] | None = None) -> dict[str, str]:
    merged = dict(DEFAULT_MATCH_CONTEXT)
    if isinstance(context, dict):
        for key, value in context.items():
            if key in VALID_CONTEXT and value in VALID_CONTEXT[key]:
                merged[key] = str(value)
    return merged


def context_summary(context: dict[str, Any] | None) -> str:
    ctx = normalize_match_context(context)
    return "; ".join(CONTEXT_LABELS.get(ctx[key], ctx[key]).capitalize() if key == "event_importance" else CONTEXT_LABELS.get(ctx[key], ctx[key]) for key in DEFAULT_MATCH_CONTEXT)


def player_context_modifier(player: MatchPlayer, player_slot: str, context: dict[str, Any] | None, area: str, pressure: str, trailing: bool = False) -> float:
    ctx = normalize_match_context(context)
    mod = 0.0
    composure = (player.attr("composure") - 70) / 30
    mental = (player.rating("mental_rating") - 70) / 30
    if ctx["event_importance"] == "major" and pressure != "normal":
        mod += composure * 0.35
    elif ctx["event_importance"] == "world_championship" and area in {"discipline", "control", "return"}:
        mod += composure * (0.55 if pressure != "normal" else 0.2)
    elif ctx["event_importance"] == "final" and area in {"discipline", "attack", "control", "pace_attack"}:
        mod += mental * (0.7 if pressure != "normal" else 0.25)
    elif ctx["event_importance"] == "exhibition":
        if area in {"attack", "pace_attack"}:
            mod += 0.8 + (player.attr("deception_creativity") - 70) * 0.025
        elif area == "discipline":
            mod -= 0.4
    if ctx["court_type"] == "glass_court":
        if area in {"discipline", "control"}:
            mod += composure * 0.5
        if area in {"attack", "pace_attack"}:
            mod += (player.attr("volley_takeover") - 70) * 0.018
    elif ctx["court_type"] == "fast_court" and area in {"attack", "pace_attack", "serve"}:
        mod += 0.75
    elif ctx["court_type"] == "slow_court" and area in {"defense", "return", "control"}:
        mod += (player.attr("first_step_cod") + player.attr("aerobic_repeatability") - 140) * 0.015
    crowd = ctx["crowd_environment"]
    if (crowd == "home_player_a" and player_slot == "a") or (crowd == "home_player_b" and player_slot == "b"):
        mod += 0.55 if area in {"discipline", "control", "attack", "pace_attack"} else 0.25
    if (crowd == "hostile_to_a" and player_slot == "a") or (crowd == "hostile_to_b" and player_slot == "b"):
        resistance = 0.0 if player.match_mentality in {"Ice Cold", "Mentally Tough"} else 1.0
        mod -= max(0.0, 0.8 - composure * 0.45) * resistance if pressure != "normal" else 0.25 * resistance
    if (ctx["travel_context"] == "player_a_travel_fatigue" and player_slot == "a") or (ctx["travel_context"] == "player_b_travel_fatigue" and player_slot == "b"):
        if area in {"discipline", "defense", "return", "control", "pace_attack"}:
            mod -= 0.45
    if ctx["pressure_context"] == "legacy_match" and area in {"discipline", "control"}:
        mod += composure * (0.75 if pressure != "normal" else 0.25)
    elif ctx["pressure_context"] == "comeback_pressure" and trailing:
        mod += mental * (0.55 if player.match_mentality == "Comeback Fighter" else -0.2)
    elif ctx["pressure_context"] == "must_win" and pressure != "normal":
        mod += composure * 0.55
    return mod


def initial_fatigue(player: MatchPlayer, player_slot: str, context: dict[str, Any] | None) -> float:
    ctx = normalize_match_context(context)
    fatigue = float(player.starting_fatigue)
    if ctx["rest_context"] == f"player_{player_slot}_short_rest":
        fatigue += 6.0
    elif ctx["rest_context"] == "both_tired":
        fatigue += 4.5
    if ctx["travel_context"] == f"player_{player_slot}_travel_fatigue":
        fatigue += 3.0
    return max(0.0, min(100.0, fatigue))


def rally_length_adjustments(context: dict[str, Any] | None) -> dict[str, float]:
    ctx = normalize_match_context(context)
    adj = {"short": 0.0, "medium": 0.0, "long": 0.0, "brutal": 0.0}
    if ctx["court_type"] == "fast_court":
        adj.update({"short": 6.0, "medium": 1.0, "long": -2.5, "brutal": -1.5})
    elif ctx["court_type"] == "slow_court":
        adj.update({"short": -2.5, "medium": 0.5, "long": 4.5, "brutal": 2.5})
    elif ctx["event_importance"] == "exhibition":
        adj.update({"short": 2.0, "long": -0.8, "brutal": -0.8})
    return adj


def pressure_risk_adjustment(context: dict[str, Any] | None, pressure: str) -> float:
    if pressure == "normal":
        return 0.0
    ctx = normalize_match_context(context)
    value = 0.0
    if ctx["event_importance"] == "major": value += 0.6
    elif ctx["event_importance"] == "world_championship": value += 1.0
    elif ctx["event_importance"] == "final": value += 1.2
    elif ctx["event_importance"] == "rivalry": value += 0.7
    elif ctx["event_importance"] == "exhibition": value -= 1.1
    if ctx["pressure_context"] == "must_win": value += 1.2
    elif ctx["pressure_context"] == "media_hype": value += 0.8
    elif ctx["pressure_context"] == "legacy_match": value += 0.7
    elif ctx["pressure_context"] == "comeback_pressure": value += 0.5
    return value


def volatility_boost(context: dict[str, Any] | None) -> float:
    ctx = normalize_match_context(context)
    return (1.2 if ctx["event_importance"] == "rivalry" else 0.0) + (1.0 if ctx["pressure_context"] == "media_hype" else 0.0)


def fatigue_cost_multiplier(context: dict[str, Any] | None, length_type: str) -> float:
    ctx = normalize_match_context(context)
    mult = 1.0
    if ctx["court_type"] == "slow_court" and length_type in {"long", "brutal"}: mult += 0.08
    if ctx["event_importance"] == "exhibition": mult -= 0.08
    if ctx["rest_context"] == "both_tired": mult += 0.04
    return max(0.85, min(1.15, mult))


def terminal_adjustment(context: dict[str, Any] | None, terminal: str) -> float:
    ctx = normalize_match_context(context)
    if ctx["event_importance"] == "exhibition" and terminal == "winner": return 2.0
    if ctx["court_type"] == "fast_court" and terminal == "winner": return 1.5
    if ctx["court_type"] == "slow_court" and terminal == "forced_error": return 1.0
    return 0.0


def context_edges(a: MatchPlayer, b: MatchPlayer, context: dict[str, Any] | None) -> dict[str, Any]:
    ctx = normalize_match_context(context)
    edge = 0.0
    fatigue_edge = 0.0
    pressure_edge = (a.rating("mental_rating") - b.rating("mental_rating")) / 10
    for slot, player, sign in [("a", a, 1), ("b", b, -1)]:
        if (ctx["crowd_environment"] == f"home_player_{slot}"):
            edge += sign * 0.6
        if (ctx["crowd_environment"] == f"hostile_to_{slot}"):
            edge -= sign * max(0.1, 0.7 - (player.attr("composure") - 70) / 50)
        start = initial_fatigue(player, slot, ctx) - player.starting_fatigue
        fatigue_edge -= sign * start / 6
    return {"context_edge": round(edge, 2), "pressure_edge": round(pressure_edge, 2), "fatigue_edge": round(fatigue_edge, 2)}


def tactical_preview(a: MatchPlayer, b: MatchPlayer, context: dict[str, Any] | None, league: bool) -> str:
    ctx = normalize_match_context(context)
    court = CONTEXT_LABELS[ctx["court_type"]]
    pressure = CONTEXT_LABELS[ctx["pressure_context"]]
    if ctx["court_type"] == "fast_court" or league:
        pattern = "quick initiative, front-court finishing and clock/scoreboard stress"
    elif ctx["court_type"] == "slow_court":
        pattern = "longer exchanges, retrieval value and attritional pressure"
    else:
        pattern = "serve-return initiative, T control and pressure-point discipline"
    return f"On a {court} with {pressure}, expect {pattern}; {a.name}'s {a.play_style} meets {b.name}'s {b.play_style} without context overpowering ratings."
