from __future__ import annotations

import random
from typing import Any

from app.simulation.calibration import (
    BROADCAST_TIME,
    ELITE_QUALITY,
    FATIGUE_ACCUMULATION,
    FATIGUE_RECOVERY,
    INJURY_FATIGUE,
    LEAGUE_RALLY_LENGTH_WEIGHTS,
    LEAGUE_RALLY_SHOT_RANGES,
    LEAGUE_SECONDS_PER_SHOT_RANGE,
    LEAGUE_STYLE_EFFECTS,
    PRESSURE_MULTIPLIERS,
    STYLE_EFFECTS,
    TERMINAL_EVENT_BASE_RATES,
    calibration_debug,
    elite_modifier,
    pair_quality,
    style_edge,
    style_matchup_summary,
    volatility_index,
)
from app.simulation.match_types import MatchPlayer, MatchState
from app.simulation.match_context import (
    context_edges,
    context_summary,
    fatigue_cost_multiplier,
    initial_fatigue,
    normalize_match_context,
    player_context_modifier,
    pressure_risk_adjustment,
    rally_length_adjustments,
    terminal_adjustment,
    tactical_preview,
    volatility_boost,
)
from app.simulation.tour_match_engine import child_seed, clamp

SCHEDULED_SET_SECONDS = 300
def _style(player: MatchPlayer, key: str) -> float:
    return LEAGUE_STYLE_EFFECTS.get(player.play_style, {}).get(key, STYLE_EFFECTS.get(player.play_style, {}).get(key, 0.0))


def _weighted_pick(rng: random.Random, weighted: list[tuple[str, float]]) -> str:
    total = sum(max(0.01, weight) for _, weight in weighted)
    roll = rng.random() * total
    upto = 0.0
    for label, weight in weighted:
        upto += max(0.01, weight)
        if roll <= upto:
            return label
    return weighted[-1][0]


def _clock_phase(before: float, after: float) -> str:
    if before >= SCHEDULED_SET_SECONDS:
        return "overtime_rally"
    if before >= 240:
        return "final_minute"
    if before >= 180:
        return "late"
    if before >= 90:
        return "middle"
    return "early"


def _point_rate_context(a_points: int, b_points: int, player_id: int, a_id: int, b_id: int, clock: float) -> str:
    diff = a_points - b_points if player_id == a_id else b_points - a_points
    remaining = max(0.0, SCHEDULED_SET_SECONDS - clock)
    if remaining <= 30 and diff < 0:
        return "must_score"
    if remaining <= 120 and diff < 0:
        return "chasing"
    if remaining <= 120 and diff > 0:
        return "protecting_lead"
    return "normal"


def _pressure(a_points: int, b_points: int, clock: float, after: float) -> str:
    remaining = max(0.0, SCHEDULED_SET_SECONDS - clock)
    diff = abs(a_points - b_points)
    if after >= SCHEDULED_SET_SECONDS and diff <= 1:
        return "set_point_equivalent"
    if remaining <= 30 and diff in {1, 2, 3}:
        return "must_score"
    if remaining <= 60:
        return "final_minute"
    if clock >= 210 and diff <= 2:
        return "important"
    return "normal"


def _mentality(player: MatchPlayer, pressure: str, trailing: bool) -> tuple[float, float]:
    base = PRESSURE_MULTIPLIERS["league"][pressure]
    volatility = 0.0
    if player.match_mentality == "Mentally Tough":
        return base + 1.1, volatility
    if player.match_mentality == "Ice Cold":
        return base + 1.3, -0.8
    if player.match_mentality == "Comeback Fighter":
        return base + (1.6 if trailing else 0.2), volatility
    if player.match_mentality == "Mentally Fragile":
        return base - (1.8 if pressure in {"final_minute", "must_score", "set_point_equivalent"} else 1.0), volatility
    if player.match_mentality == "Pressure Magnet":
        return base + 0.2, 1.6
    if player.match_mentality == "Hothead":
        return base - (1.0 if trailing else 0.2), 1.4
    if player.match_mentality == "Momentum Player":
        return base + (0.3 if not trailing else -0.5), 0.7
    if player.match_mentality == "Front Runner":
        return base + (0.7 if not trailing else -0.8), 0.5
    if player.match_mentality == "Slow Starter":
        return base + 0.1, 0.2
    return base, volatility


def _effective(player: MatchPlayer, fatigue: float, area: str, pressure: str, trailing: bool, game_no: int, match_context: dict[str, Any] | None = None, player_slot: str = "a") -> float:
    attrs = player.attributes
    if area == "pace_attack":
        raw = attrs["volley_takeover"] * 0.22 + attrs["front_court_touch"] * 0.19 + attrs["finishing_power"] * 0.24 + attrs["first_step_cod"] * 0.16 + attrs["shot_selection"] * 0.10 + attrs["deception_creativity"] * 0.09 + _style(player, "quick") + _style(player, "attack")
    elif area == "control":
        raw = attrs["volley_takeover"] * 0.24 + attrs["length_quality"] * 0.20 + attrs["width_control"] * 0.18 + attrs["shot_selection"] * 0.18 + attrs["t_recovery"] * 0.12 + attrs["adaptability"] * 0.08 + _style(player, "control") + _style(player, "protect")
    elif area == "defense":
        raw = attrs["first_step_cod"] * 0.28 + attrs["anticipation"] * 0.20 + attrs["t_recovery"] * 0.18 + attrs["error_discipline"] * 0.16 + attrs["aerobic_repeatability"] * 0.10 + attrs["durability"] * 0.08 + _style(player, "defense")
    elif area == "discipline":
        raw = attrs["error_discipline"] * 0.32 + attrs["composure"] * 0.28 + attrs["shot_selection"] * 0.24 + attrs["adaptability"] * 0.16 + _style(player, "discipline")
    else:
        raw = player.rating("league_rating")
    bonus, _ = _mentality(player, pressure, trailing)
    quality = elite_modifier(player, "league_rating")
    if area in {"control", "defense", "discipline"}:
        raw += quality * ELITE_QUALITY["pressure_logic_bonus"] * 0.8
    third = _style(player, "third_set") if game_no == 3 else 0.0
    form = (player.form - 50) * 0.045 + (player.confidence - 50) * 0.055
    return raw + bonus + third + form + player_context_modifier(player, player_slot, match_context, area, pressure, trailing) - fatigue * 0.105


def _length_type(rng: random.Random, a: MatchPlayer, b: MatchPlayer, initiative: MatchPlayer, chasing: bool, match_context: dict[str, Any] | None = None) -> str:
    quick_bias = _style(initiative, "quick") + initiative.attr("volley_takeover") * 0.04 + initiative.attr("finishing_power") * 0.035
    if chasing:
        quick_bias += 4.0
    quality_pair = pair_quality(a, b, "league_rating")
    long_bias = (a.attr("aerobic_repeatability") + b.attr("aerobic_repeatability")) * 0.035 + _style(a, "long") + _style(b, "long")
    adj = rally_length_adjustments(match_context)
    return _weighted_pick(rng, [("short", LEAGUE_RALLY_LENGTH_WEIGHTS["short"] + adj["short"] + quick_bias), ("medium", LEAGUE_RALLY_LENGTH_WEIGHTS["medium"] + adj["medium"] + quality_pair * 1.0), ("long", LEAGUE_RALLY_LENGTH_WEIGHTS["long"] + adj["long"] + long_bias * 0.45 + quality_pair * 0.7), ("brutal", LEAGUE_RALLY_LENGTH_WEIGHTS["brutal"] + adj["brutal"] + long_bias * 0.12 + quality_pair * 0.2)])


def _apply_fatigue(a: MatchPlayer, b: MatchPlayer, state: MatchState, shots: int, duration: float, length_type: str, t_control_id: int, loser_id: int | None, match_context: dict[str, Any] | None = None) -> None:
    config = FATIGUE_ACCUMULATION["league"]
    multiplier = config[length_type]
    for p in (a, b):
        attr_resist = p.attr("aerobic_repeatability") * 0.25 + p.attr("recovery_efficiency") * 0.18 + p.attr("durability") * 0.22 + p.attr("first_step_cod") * 0.15
        base = (duration * config["duration"] + shots * config["shots"]) * multiplier * fatigue_cost_multiplier(match_context, length_type)
        scramble = config["scramble"] if p.profile_id != t_control_id else 0.0
        losing_burden = config["losing"] if loser_id and p.profile_id == loser_id else 0.0
        injury = INJURY_FATIGUE.get(p.injury_status, 0.0) * 0.012
        state.fatigue[p.profile_id] = clamp(state.fatigue[p.profile_id] + base * clamp(1.18 - attr_resist / 105, 0.30, 1.15) + scramble + losing_burden + injury, 0, 100)


def _pattern(player: MatchPlayer, terminal: str, length_type: str, had_t: bool) -> str:
    if terminal == "stroke":
        return "front_court_attack"
    if player.play_style == "Creative Magician" and terminal == "winner":
        return "deception_hold"
    if had_t and player.play_style in {"Volley Pressor", "Composed Controller", "Tactical Controller"}:
        return "volley_takeover"
    if terminal == "winner" and length_type == "short":
        return "power_finish" if player.attr("finishing_power") > 70 else "front_court_attack"
    if terminal == "forced_error" and length_type in {"long", "brutal"}:
        return "attritional_rally"
    return "serve_pressure_start" if length_type == "short" else "deep_length_exchange"


def _simulate_rally(rng: random.Random, a: MatchPlayer, b: MatchPlayer, state: MatchState, server_id: int, game_no: int, rally_no: int, score_before: list[int], clock_before: float, force_playable: bool, match_context: dict[str, Any] | None = None) -> dict[str, Any]:
    players = {a.profile_id: a, b.profile_id: b}
    opponent = {a.profile_id: b.profile_id, b.profile_id: a.profile_id}
    a_trailing = score_before[0] < score_before[1]
    b_trailing = score_before[1] < score_before[0]
    server = players[server_id]
    receiver = players[opponent[server_id]]
    serve_edge = server.attr("serve_pressure") * 0.45 + server.attr("volley_takeover") * 0.32 + server.attr("first_step_cod") * 0.23
    return_edge = receiver.attr("return_initiative") * 0.48 + receiver.attr("anticipation") * 0.24 + receiver.attr("first_step_cod") * 0.28
    initiative_id = server_id if rng.random() < clamp(0.52 + (serve_edge - return_edge) / 150, 0.31, 0.73) else receiver.profile_id
    initiative = players[initiative_id]
    context = _point_rate_context(score_before[0], score_before[1], initiative_id, a.profile_id, b.profile_id, clock_before)
    length_type = _length_type(rng, a, b, initiative, context in {"chasing", "must_score"}, match_context)
    lo, hi = LEAGUE_RALLY_SHOT_RANGES[length_type]
    shots = rng.randint(lo, hi)
    duration = round(shots * rng.uniform(*LEAGUE_SECONDS_PER_SHOT_RANGE), 1)
    clock_after = round(clock_before + duration, 1)
    pressure = _pressure(score_before[0], score_before[1], clock_before, clock_after)

    control_a = _effective(a, state.fatigue[a.profile_id], "control", pressure, a_trailing, game_no, match_context, "a") + (3.3 if initiative_id == a.profile_id else 0)
    control_b = _effective(b, state.fatigue[b.profile_id], "control", pressure, b_trailing, game_no, match_context, "b") + (3.3 if initiative_id == b.profile_id else 0)
    t_control_id = a.profile_id if rng.random() < clamp(0.5 + (control_a - control_b) / 125, 0.25, 0.75) else b.profile_id

    if not force_playable and rng.random() < clamp(0.009 + (abs(control_a - control_b) < 5) * 0.005, 0.004, 0.020):
        _apply_fatigue(a, b, state, shots, duration, length_type, t_control_id, None)
        return _event(rally_no, game_no, server_id, None, None, score_before, score_before[:], shots, duration, length_type, "let_replayed", "scramble_defense", pressure, initiative_id, t_control_id, state, clock_before, clock_after, context, "Traffic forced a let; the clock still runs in the timed format.")

    scores: dict[int, float] = {}
    candidate_terms: dict[int, str] = {}
    for p, opp, trailing in [(a, b, a_trailing), (b, a, b_trailing)]:
        attack = _effective(p, state.fatigue[p.profile_id], "pace_attack", pressure, trailing, game_no, match_context, "a" if p.profile_id == a.profile_id else "b")
        defense = _effective(p, state.fatigue[p.profile_id], "defense", pressure, trailing, game_no, match_context, "a" if p.profile_id == a.profile_id else "b")
        discipline = _effective(p, state.fatigue[p.profile_id], "discipline", pressure, trailing, game_no, match_context, "a" if p.profile_id == a.profile_id else "b")
        ctx = _point_rate_context(score_before[0], score_before[1], p.profile_id, a.profile_id, b.profile_id, clock_before)
        risk = 3.5 if ctx in {"chasing", "must_score"} else (-1.2 if ctx == "protecting_lead" and _style(p, "protect") > 0 else 0.0)
        volatile = _style(p, "volatility") + _mentality(p, pressure, trailing)[1]
        tired_target = max(0.0, state.fatigue[opp.profile_id] - state.fatigue[p.profile_id]) * (0.04 + _style(p, "tired_target") * 0.008)
        scores[p.profile_id] = attack * 0.38 + defense * 0.17 + discipline * 0.19 + p.rating("league_rating") * 0.16 + p.rating("mental_rating") * 0.10 + (4 if initiative_id == p.profile_id else 0) + (4.5 if t_control_id == p.profile_id else -1) + risk + tired_target + (_style(p, "pressure") if pressure != "normal" else 0.0)
        base_rates = TERMINAL_EVENT_BASE_RATES["league"]
        candidate_terms[p.profile_id] = _weighted_pick(rng, [("winner", base_rates["winner"] + attack * 0.43 + risk * 1.8 + volatile + terminal_adjustment(match_context, "winner")), ("forced_error", base_rates["forced_error"] + attack * 0.12 + defense * 0.18 + terminal_adjustment(match_context, "forced_error")), ("stroke", base_rates["stroke"] + (4.0 if t_control_id == p.profile_id and length_type == "short" else 0))])
    a_prob = clamp(0.5 + (scores[a.profile_id] - scores[b.profile_id]) / 90, 0.15, 0.85)
    winner_id = a.profile_id if rng.random() < a_prob else b.profile_id
    loser_id = opponent[winner_id]
    loser = players[loser_id]
    loser_trailing = loser_id == a.profile_id and a_trailing or loser_id == b.profile_id and b_trailing
    loser_disc = _effective(loser, state.fatigue[loser_id], "discipline", pressure, loser_trailing, game_no, match_context, "a" if loser_id == a.profile_id else "b")
    loser_ctx = _point_rate_context(score_before[0], score_before[1], loser_id, a.profile_id, b.profile_id, clock_before)
    pressure_error = {"normal": 0, "important": 2.5, "final_minute": 5.5, "must_score": 8.0, "set_point_equivalent": 7.0}[pressure]
    chase_risk = 5.0 if loser_ctx in {"chasing", "must_score"} else 0.0
    elite_suppression = elite_modifier(loser, "league_rating") * ELITE_QUALITY["error_suppression"] * 0.75
    error_prob = clamp((19 - loser_disc * 0.13 + state.fatigue[loser_id] * 0.045 + _style(loser, "risk") * 1.9 + max(0.0, _style(loser, "volatility") - elite_suppression * 2.0) + pressure_error + chase_risk + pressure_risk_adjustment(match_context, pressure) + volatility_boost(match_context)) / 100, TERMINAL_EVENT_BASE_RATES["league"]["unforced_error_floor"], TERMINAL_EVENT_BASE_RATES["league"]["unforced_error_cap"] - elite_suppression * 0.04)
    terminal = "unforced_error" if rng.random() < error_prob else candidate_terms[winner_id]
    pattern = "pressure_error" if terminal == "unforced_error" else _pattern(players[winner_id], terminal, length_type, t_control_id == winner_id)
    _apply_fatigue(a, b, state, shots, duration, length_type, t_control_id, loser_id, match_context)
    if state.point_streak_profile_id == winner_id:
        state.point_streak_count += 1
    else:
        state.point_streak_profile_id = winner_id
        state.point_streak_count = 1
    state.points_won[winner_id] += 1
    explanation = f"{players[winner_id].name} used timed-play {pattern.replace('_', ' ')} to win a {length_type} rally during the {pressure.replace('_', ' ')} phase."
    return _event(rally_no, game_no, server_id, winner_id, loser_id, score_before, score_before[:], shots, duration, length_type, terminal, pattern, pressure, initiative_id, t_control_id, state, clock_before, clock_after, _point_rate_context(score_before[0], score_before[1], winner_id, a.profile_id, b.profile_id, clock_before), explanation)


def _event(rally_number: int, game_number: int, server_id: int, winner_id: int | None, loser_id: int | None, score_before: list[int], score_after: list[int], shots: int, duration: float, length_type: str, terminal: str, pattern: str, pressure: str, initiative_id: int, t_control_id: int, state: MatchState, clock_before: float, clock_after: float, point_context: str, explanation: str) -> dict[str, Any]:
    return {
        "rally_number": rally_number,
        "game_number": game_number,
        "server_profile_id": server_id,
        "winner_profile_id": winner_id,
        "loser_profile_id": loser_id,
        "score_before": score_before,
        "score_after": score_after,
        "rally_shots": shots,
        "rally_duration_seconds": duration,
        "rally_length_type": length_type,
        "terminal_type": terminal,
        "tactical_pattern": pattern,
        "pressure_level": pressure,
        "initiative_player_profile_id": initiative_id,
        "t_control_player_profile_id": t_control_id,
        "fatigue_after": {"player_a": round(state.fatigue[list(state.fatigue.keys())[0]], 1), "player_b": round(state.fatigue[list(state.fatigue.keys())[1]], 1)},
        "explanation": explanation,
        "game_clock_before_seconds": round(clock_before, 1),
        "game_clock_after_seconds": round(clock_after, 1),
        "seconds_remaining_after": round(max(0.0, SCHEDULED_SET_SECONDS - clock_after), 1),
        "clock_phase": _clock_phase(clock_before, clock_after),
        "point_rate_context": point_context,
    }


def _blank_stats(a: MatchPlayer, b: MatchPlayer) -> dict[str, Any]:
    ids = [str(a.profile_id), str(b.profile_id)]
    pairs = {pid: 0 for pid in ids}
    return {
        "total_points": pairs.copy(), "sets_won": pairs.copy(), "games_won": pairs.copy(), "drawn_sets": 0,
        "total_scoring_rallies": 0, "total_lets": 0, "total_duration_seconds": 0.0,
        "clean_rally_time_seconds": 0.0, "estimated_broadcast_duration_seconds": 0.0, "estimated_broadcast_duration_minutes": 0.0,
        "average_rally_shots": 0.0, "average_rally_duration_seconds": 0.0, "longest_rally_shots": 0, "longest_rally_seconds": 0.0,
        "points_per_minute": 0.0, "points_per_set": [], "final_minute_points": pairs.copy(), "final_minute_points_won": pairs.copy(),
        "points_when_trailing": pairs.copy(), "points_when_leading": pairs.copy(), "lead_changes_by_set": [], "biggest_lead_by_set": [],
        "time_in_lead_seconds": pairs.copy(), "time_tied_seconds": 0.0, "quick_points_won": pairs.copy(), "clock_pressure_points_won": pairs.copy(),
        "must_score_points_won": pairs.copy(), "set_closing_points_won": pairs.copy(), "drawn_set_count": 0, "set_win_count": pairs.copy(), "set_loss_count": pairs.copy(),
        "winners": pairs.copy(), "forced_errors_won": pairs.copy(), "unforced_errors_committed": pairs.copy(), "strokes_won": pairs.copy(),
        "short_rallies_won": pairs.copy(), "medium_rallies_won": pairs.copy(), "long_rallies_won": pairs.copy(), "brutal_rallies_won": pairs.copy(),
        "fatigue_final": {pid: 0.0 for pid in ids}, "fatigue_change_by_set": [], "performance_rating": {pid: 0.0 for pid in ids},
    }


def simulate_league_timed_match(a: MatchPlayer, b: MatchPlayer, seed: int, include_rallies: bool = True, match_context: dict[str, Any] | None = None) -> dict[str, Any]:
    rng = random.Random(seed)
    match_context = normalize_match_context(match_context)
    state = MatchState(fatigue={a.profile_id: initial_fatigue(a, "a", match_context), b.profile_id: initial_fatigue(b, "b", match_context)}, games_won={a.profile_id: 0, b.profile_id: 0}, points_won={a.profile_id: 0, b.profile_id: 0})
    players = {a.profile_id: a, b.profile_id: b}
    opponent = {a.profile_id: b.profile_id, b.profile_id: a.profile_id}
    server_id = a.profile_id if rng.random() < 0.5 else b.profile_id
    rallies: list[dict[str, Any]] = []
    games: list[dict[str, Any]] = []
    stats = _blank_stats(a, b)
    rally_number = 0
    for game_no in range(1, 4):
        a_points = b_points = 0
        clock = 0.0
        scoring = lets = lead_changes = 0
        biggest_lead = 0
        last_leader: int | None = None
        final_minute = {str(a.profile_id): 0, str(b.profile_id): 0}
        fatigue_start = dict(state.fatigue)
        max_let_chain = 0
        while clock < SCHEDULED_SET_SECONDS:
            before_score = [a_points, b_points]
            rally = _simulate_rally(rng, a, b, state, server_id, game_no, rally_number + 1, before_score, clock, max_let_chain >= 2, match_context)
            rally_number += 1
            clock = rally["game_clock_after_seconds"]
            if include_rallies:
                rallies.append(rally)
            if rally["terminal_type"] == "let_replayed":
                lets += 1
                stats["total_lets"] += 1
                max_let_chain += 1
                continue
            max_let_chain = 0
            scoring += 1
            winner_id = rally["winner_profile_id"]
            assert winner_id is not None
            server_id = winner_id
            if winner_id == a.profile_id:
                a_points += 1
            else:
                b_points += 1
            rally["score_after"] = [a_points, b_points]
            wid = str(winner_id); lid = str(opponent[winner_id])
            stats["total_points"][wid] += 1
            stats["total_scoring_rallies"] += 1
            stats[f"{rally['rally_length_type']}_rallies_won"][wid] += 1
            if rally["terminal_type"] == "winner": stats["winners"][wid] += 1
            elif rally["terminal_type"] == "forced_error": stats["forced_errors_won"][wid] += 1
            elif rally["terminal_type"] == "unforced_error": stats["unforced_errors_committed"][lid] += 1
            elif rally["terminal_type"] == "stroke": stats["strokes_won"][wid] += 1
            if rally["game_clock_before_seconds"] >= 240:
                final_minute[wid] += 1; stats["final_minute_points"][wid] += 1; stats["final_minute_points_won"][wid] += 1
            if rally["score_before"][0] < rally["score_before"][1] and winner_id == a.profile_id or rally["score_before"][1] < rally["score_before"][0] and winner_id == b.profile_id:
                stats["points_when_trailing"][wid] += 1
            if rally["score_before"][0] > rally["score_before"][1] and winner_id == a.profile_id or rally["score_before"][1] > rally["score_before"][0] and winner_id == b.profile_id:
                stats["points_when_leading"][wid] += 1
            if rally["rally_length_type"] == "short" and rally["rally_duration_seconds"] < 8:
                stats["quick_points_won"][wid] += 1
            if rally["pressure_level"] != "normal":
                stats["clock_pressure_points_won"][wid] += 1
            if rally["pressure_level"] == "must_score":
                stats["must_score_points_won"][wid] += 1
            if rally["pressure_level"] == "set_point_equivalent":
                stats["set_closing_points_won"][wid] += 1
            leader = a.profile_id if a_points > b_points else b.profile_id if b_points > a_points else None
            if leader and last_leader and leader != last_leader:
                lead_changes += 1
            if leader:
                last_leader = leader
            biggest_lead = max(biggest_lead, abs(a_points - b_points))
            stats["longest_rally_shots"] = max(stats["longest_rally_shots"], rally["rally_shots"])
            stats["longest_rally_seconds"] = round(max(stats["longest_rally_seconds"], rally["rally_duration_seconds"]), 1)
        winner_id = a.profile_id if a_points > b_points else b.profile_id if b_points > a_points else None
        if winner_id:
            state.games_won[winner_id] += 1
            stats["sets_won"][str(winner_id)] += 1
            stats["games_won"][str(winner_id)] += 1
            stats["set_win_count"][str(winner_id)] += 1
            stats["set_loss_count"][str(opponent[winner_id])] += 1
        else:
            stats["drawn_sets"] += 1
            stats["drawn_set_count"] += 1
        games.append({"game_number": game_no, "score": [a_points, b_points], "winner_profile_id": winner_id, "is_draw": winner_id is None, "duration_seconds": round(clock, 1), "scheduled_duration_seconds": SCHEDULED_SET_SECONDS, "scoring_rallies": scoring, "lets": lets, "final_minute_points": final_minute, "lead_changes": lead_changes})
        stats["points_per_set"].append({str(a.profile_id): a_points, str(b.profile_id): b_points})
        stats["lead_changes_by_set"].append(lead_changes)
        stats["biggest_lead_by_set"].append(biggest_lead)
        if a_points == b_points:
            stats["time_tied_seconds"] += round(clock, 1)
        else:
            stats["time_in_lead_seconds"][str(a.profile_id if a_points > b_points else b.profile_id)] += round(clock, 1)
        stats["fatigue_change_by_set"].append({str(pid): round(state.fatigue[pid] - fatigue_start[pid], 1) for pid in state.fatigue})
        server_id = opponent[winner_id] if winner_id else opponent[server_id]
        for pid, p in players.items():
            travel_penalty = 0.35 if (match_context["travel_context"] == "player_a_travel_fatigue" and pid == a.profile_id) or (match_context["travel_context"] == "player_b_travel_fatigue" and pid == b.profile_id) else 0.0
            recovery = FATIGUE_RECOVERY["league_between_sets_base"] + p.attr("recovery_efficiency") * FATIGUE_RECOVERY["league_recovery_efficiency_factor"] + _style(p, "fatigue") * -0.8 - travel_penalty
            state.fatigue[pid] = max(float(p.starting_fatigue) * FATIGUE_RECOVERY["league_starting_fatigue_floor"], state.fatigue[pid] - recovery)
    a_sets = state.games_won[a.profile_id]; b_sets = state.games_won[b.profile_id]
    winner_id = a.profile_id if a_sets > b_sets else b.profile_id if b_sets > a_sets else None
    stats["total_duration_seconds"] = round(sum(g["duration_seconds"] for g in games), 1)
    stats["clean_rally_time_seconds"] = stats["total_duration_seconds"]
    broadcast_duration = stats["clean_rally_time_seconds"] + (max(len(games) - 1, 0) * BROADCAST_TIME["league_between_set_seconds"]) + BROADCAST_TIME["league_intro_outro_seconds"]
    stats["estimated_broadcast_duration_seconds"] = round(broadcast_duration, 1)
    stats["estimated_broadcast_duration_minutes"] = round(broadcast_duration / 60, 1)
    scoring_rallies = [r for r in rallies if r.get("terminal_type") != "let_replayed"]
    stats["average_rally_shots"] = round(sum(r["rally_shots"] for r in scoring_rallies) / len(scoring_rallies), 1) if scoring_rallies else 0.0
    stats["average_rally_duration_seconds"] = round(sum(r["rally_duration_seconds"] for r in scoring_rallies) / len(scoring_rallies), 1) if scoring_rallies else 0.0
    stats["points_per_minute"] = round(sum(stats["total_points"].values()) / (stats["total_duration_seconds"] / 60), 2) if stats["total_duration_seconds"] else 0.0
    stats["fatigue_final"] = {str(pid): round(value, 1) for pid, value in state.fatigue.items()}
    for p in (a, b):
        pid = str(p.profile_id)
        stats["performance_rating"][pid] = round(50 + stats["sets_won"][pid] * 9 + stats["total_points"][pid] * 0.9 + stats["final_minute_points_won"][pid] * 0.6 - stats["unforced_errors_committed"][pid] * 0.6 - stats["fatigue_final"][pid] * 0.06, 1)
    scores = ", ".join(f"{g['score'][0]}-{g['score'][1]}" for g in games)
    drawn = stats["drawn_sets"]
    if winner_id:
        match_score_text = f"{max(a_sets, b_sets)}-{min(a_sets, b_sets)} sets" + (f", {drawn} drawn" if drawn else "") + f" ({scores})"
    else:
        match_score_text = f"{a_sets}-{b_sets} sets" + (f", {drawn} drawn" if drawn else "") + f" — match drawn ({scores})"
    fatigue_impact = sum(stats["fatigue_final"].values()) / max(len(stats["fatigue_final"]), 1)
    pressure_total = sum(stats["clock_pressure_points_won"].values()) or 1
    pressure_impact = abs(stats["clock_pressure_points_won"][str(a.profile_id)] - stats["clock_pressure_points_won"][str(b.profile_id)]) / pressure_total
    return {"match_type": "league_timed_3x5", "seed": seed, "player_a": a.public_dict(), "player_b": b.public_dict(), "winner": players[winner_id].public_dict() if winner_id else None, "loser": players[opponent[winner_id]].public_dict() if winner_id else None, "is_draw": winner_id is None, "match_score_text": match_score_text, "games": games, "rallies": rallies if include_rallies else [], "stats": stats, "story": _story(a, b, winner_id, games, stats, match_context), "match_context": match_context, "explanation_breakdown": _explanation_breakdown_league(a, b, winner_id, stats, games, match_context), "key_rallies": _key_rallies_league(rallies, games, a, b) if include_rallies else [], "calibration_debug": calibration_debug(a, b, match_type="league_timed_3x5", fatigue_impact=fatigue_impact, pressure_impact=pressure_impact)}


def _story(a: MatchPlayer, b: MatchPlayer, winner_id: int | None, games: list[dict[str, Any]], stats: dict[str, Any], match_context: dict[str, Any] | None = None) -> dict[str, str]:
    if winner_id is None:
        headline = f"{a.name} and {b.name} draw a League Timed 3x5 match."
        key = "Neither player could turn the three timed sets into a decisive set-wins edge."
    else:
        winner = a if winner_id == a.profile_id else b
        loser = b if winner_id == a.profile_id else a
        headline = f"{winner.name} beats {loser.name} in League Timed 3x5."
        key = f"{winner.name}'s {winner.play_style} profile created enough quick points and clock pressure to win the set count."
    return {
        "headline": headline,
        "key_factor": key,
        "turning_point": f"Final-minute scoring finished {stats['final_minute_points_won'][str(a.profile_id)]}-{stats['final_minute_points_won'][str(b.profile_id)]}, with {sum(stats['lead_changes_by_set'])} lead changes.",
        "style_summary": style_matchup_summary(a, b, match_type="league_timed_3x5"),
        "pace_summary": f"The match produced {stats['points_per_minute']} points per minute across three fixed five-minute sets.",
        "clock_summary": f"Set durations were {', '.join(str(g['duration_seconds']) + 's' for g in games)} because rallies completed after the clock threshold still counted.",
        "final_minute_summary": f"Clock-pressure points finished {stats['clock_pressure_points_won'][str(a.profile_id)]}-{stats['clock_pressure_points_won'][str(b.profile_id)]}.",
        "fatigue_summary": f"Final fatigue was {stats['fatigue_final'][str(a.profile_id)]} for {a.name} and {stats['fatigue_final'][str(b.profile_id)]} for {b.name}; endurance mattered less than in BO5, with explosive styles paying more in repeated fast exchanges.",
        "pressure_summary": "Final-minute, narrow-lead, must-score and set-point-equivalent states use league-specific mentality modifiers, so chasing can get risky without turning elite pressure points into chaos.",
        "context_summary": context_summary(match_context),
        "explanation": "The simulation resolved every timed rally through pace attack, T control, clock context, risk while chasing, lead protection, fatigue, pressure and subtle match-context modifiers.",
    }


def preview_league_probabilities(a: MatchPlayer, b: MatchPlayer, seed: int, runs: int, match_context: dict[str, Any] | None = None) -> dict[str, Any]:
    match_context = normalize_match_context(match_context)
    wins = {a.profile_id: 0, b.profile_id: 0, None: 0}
    a30 = a21 = b30 = b21 = one_draw = multi_draw = final_decider = 0
    total_points = total_duration = total_rallies = ppm = 0.0
    set_scores = [[0.0, 0.0] for _ in range(3)]
    for index in range(runs):
        result = simulate_league_timed_match(a, b, child_seed(seed, index), include_rallies=False, match_context=match_context)
        winner = result["winner"]["profile_id"] if result["winner"] else None
        wins[winner] += 1
        aw = result["stats"]["sets_won"][str(a.profile_id)]; bw = result["stats"]["sets_won"][str(b.profile_id)]
        draws = result["stats"]["drawn_sets"]
        if winner == a.profile_id and aw == 3: a30 += 1
        if winner == a.profile_id and aw == 2: a21 += 1
        if winner == b.profile_id and bw == 3: b30 += 1
        if winner == b.profile_id and bw == 2: b21 += 1
        one_draw += int(draws == 1); multi_draw += int(draws >= 2)
        final_decider += int(any(sum(g["final_minute_points"].values()) > 0 and abs(g["score"][0] - g["score"][1]) <= 2 for g in result["games"]))
        total_points += sum(result["stats"]["total_points"].values())
        total_duration += result["stats"]["total_duration_seconds"]
        total_rallies += result["stats"]["total_scoring_rallies"] + result["stats"]["total_lets"]
        ppm += result["stats"]["points_per_minute"]
        for i, g in enumerate(result["games"]):
            set_scores[i][0] += g["score"][0]; set_scores[i][1] += g["score"][1]
    pace_a = a.attr("volley_takeover") * .25 + a.attr("front_court_touch") * .2 + a.attr("finishing_power") * .22 + a.attr("first_step_cod") * .18 + a.attr("deception_creativity") * .15 + _style(a, "quick")
    pace_b = b.attr("volley_takeover") * .25 + b.attr("front_court_touch") * .2 + b.attr("finishing_power") * .22 + b.attr("first_step_cod") * .18 + b.attr("deception_creativity") * .15 + _style(b, "quick")
    leader = a.name if pace_a >= pace_b else b.name
    rating_diff = a.rating("league_rating") - b.rating("league_rating")
    ctx_edges = context_edges(a, b, match_context)
    pa = wins[a.profile_id]/runs
    upset = round(min(pa, wins[b.profile_id]/runs) * (1.1 if abs(rating_diff) < 5 else 0.85), 2)
    return {"match_type": "league_timed_3x5", "seed": seed, "monte_carlo_runs": runs, "player_a": a.public_dict(), "player_b": b.public_dict(), "player_a_win_probability": wins[a.profile_id]/runs, "player_b_win_probability": wins[b.profile_id]/runs, "draw_probability": wins[None]/runs, "player_a_3_0_sets": a30/runs, "player_a_2_1_sets": a21/runs, "player_b_3_0_sets": b30/runs, "player_b_2_1_sets": b21/runs, "one_drawn_set_probability": one_draw/runs, "two_or_more_drawn_sets_probability": multi_draw/runs, "match_draw_probability": wins[None]/runs, "expected_total_points": round(total_points/runs,1), "expected_total_duration_seconds": round(total_duration/runs,1), "expected_total_rallies": round(total_rallies/runs,1), "expected_points_per_minute": round(ppm/runs,2), "expected_set_scores": [[round(x/runs,1), round(y/runs,1)] for x,y in set_scores], "final_minute_decider_probability": final_decider/runs, "style_edge_summary": f"{a.name} brings {a.play_style}; {b.name} brings {b.play_style}. League timing rewards fast starts, quick finishing, controlled protection of leads and useful volatility more than Tour BO5.", "pace_edge_summary": f"{leader} has the stronger timed-format pace profile ({abs(pace_a-pace_b):.1f} point edge)." if abs(pace_a-pace_b) >= 2.5 else "Pace tools are close enough that clock management may matter more than raw speed.", "pressure_edge_summary": f"Mental ratings are {a.rating('mental_rating'):.1f}-{b.rating('mental_rating'):.1f}; final-minute and must-score rallies receive league-specific pressure weighting.", "league_suitability_summary": f"Timed 3x5 boosts volley pressure, front-court finishing and first-step speed while reducing the BO5 endurance premium.", "match_context": match_context, "context_summary": context_summary(match_context), "rating_edge": round(rating_diff, 2), "style_edge": style_edge(a, b, league=True), "context_edge": ctx_edges["context_edge"], "pressure_edge": ctx_edges["pressure_edge"], "fatigue_edge": ctx_edges["fatigue_edge"], "volatility_index": volatility_index(a, b, league=True), "expected_closeness": round(1 - min(abs(rating_diff) / 24, 1), 2), "upset_probability_estimate": upset, "key_advantages": [f"{leader} has the stronger timed pace profile.", "Clock management may decide close sets."], "risk_factors": ["Drawn sets remain possible in timed format.", "Final-minute rallies can swing set outcomes."], "tactical_preview": tactical_preview(a, b, match_context, league=True), "expected_points_per_minute_range": [round((ppm/runs)*0.88,2), round((ppm/runs)*1.14,2)], "expected_draw_risk": wins[None]/runs, "expected_final_minute_importance": final_decider/runs, "likely_clock_pattern": "Fast exchanges if pace players control the T; longer rallies increase overtime-set risk.", "preview_diagnostics": {"rating_edge": round(rating_diff, 2), "style_edge": style_edge(a, b, league=True), "format_edge": "League Timed 3x5 leans toward quick initiative, front-court invention, pace and closing discipline.", "volatility_estimate": volatility_index(a, b, league=True), "expected_closeness": round(1 - min(abs(rating_diff) / 24, 1), 2)}}


def _key_entry_league(rally: dict[str, Any], reason: str, players: dict[int, MatchPlayer]) -> dict[str, Any]:
    winner_id = rally.get("winner_profile_id")
    return {
        "reason": reason,
        "game_number": rally.get("game_number"),
        "rally_number": rally.get("rally_number"),
        "score_before": rally.get("score_before"),
        "winner": players[winner_id].name if winner_id in players else "Let",
        "terminal_type": rally.get("terminal_type"),
        "rally_shots": rally.get("rally_shots"),
        "rally_duration_seconds": rally.get("rally_duration_seconds"),
        "explanation": rally.get("explanation", "Clock-pressure exchange."),
    }


def _key_rallies_league(rallies: list[dict[str, Any]], games: list[dict[str, Any]], a: MatchPlayer, b: MatchPlayer) -> list[dict[str, Any]]:
    players = {a.profile_id: a, b.profile_id: b}
    scoring = [r for r in rallies if r.get("terminal_type") != "let_replayed"]
    picked: list[tuple[int, str, dict[str, Any]]] = []
    seen: set[int] = set()
    def add(r: dict[str, Any] | None, reason: str, priority: int) -> None:
        if not r or id(r) in seen: return
        seen.add(id(r)); picked.append((priority, reason, r))
    for r in scoring:
        if r.get("pressure_level") == "must_score": add(r, "must-score rally", 1)
        elif r.get("pressure_level") == "set_point_equivalent": add(r, "set-point-equivalent rally", 1)
        elif r.get("clock_phase") == "final_minute": add(r, "final-minute rally", 3)
        if r.get("seconds_remaining_after", 999) <= 15: add(r, "biggest clock-pressure rally", 2)
    add(max(scoring, key=lambda r: r.get("rally_shots", 0), default=None), "longest rally", 2)
    for game in games:
        game_rallies = [r for r in scoring if r.get("game_number") == game.get("game_number")]
        if game_rallies:
            add(game_rallies[-1], "rally that fixed the set winner/draw outcome", 1)
    return [_key_entry_league(r, reason, players) for _, reason, r in sorted(picked, key=lambda item: (item[0], item[2].get("rally_number", 0)))[:12]][:12]


def _explanation_breakdown_league(a: MatchPlayer, b: MatchPlayer, winner_id: int | None, stats: dict[str, Any], games: list[dict[str, Any]], match_context: dict[str, Any] | None) -> dict[str, str]:
    if winner_id is None:
        rating_text = "Ratings and timed-set variance left neither player with a decisive set edge."
        style_text = "The styles cancelled out enough across three short sets to produce a draw."
        name = "Neither player"
        wid = str(a.profile_id); lid = str(b.profile_id)
    else:
        winner = a if winner_id == a.profile_id else b
        loser = b if winner_id == a.profile_id else a
        wid = str(winner.profile_id); lid = str(loser.profile_id); name = winner.name
        edge = winner.rating("league_rating") - loser.rating("league_rating")
        rating_text = f"{winner.name} had a {edge:.1f} League rating edge." if edge >= 0 else f"{winner.name} overcame a {abs(edge):.1f} League rating deficit."
        style_text = f"{winner.name}'s {winner.play_style} profile was useful in fast points and set-closing phases."
    return {
        "rating_factor": rating_text,
        "style_factor": style_text,
        "context_factor": f"Context was {context_summary(match_context)}; it subtly shifted pace, pressure, crowd and starting fatigue.",
        "pressure_factor": f"Clock-pressure points were {stats.get('clock_pressure_points_won', {}).get(wid, 0)}-{stats.get('clock_pressure_points_won', {}).get(lid, 0)}.",
        "fatigue_factor": f"Final fatigue: {stats.get('fatigue_final', {}).get(str(a.profile_id), '—')} for {a.name}, {stats.get('fatigue_final', {}).get(str(b.profile_id), '—')} for {b.name}.",
        "key_rallies_factor": f"{sum(stats.get('lead_changes_by_set', []))} lead changes and late-set rallies explain the set outcomes.",
        "randomness_factor": f"{name} benefited from rally-level variance constrained by league ratings, clock context and pressure logic.",
    }
