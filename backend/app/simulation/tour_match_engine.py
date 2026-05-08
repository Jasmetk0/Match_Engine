from __future__ import annotations

import hashlib
import random
from collections import defaultdict
from typing import Any

from app.models.player import PlayerSeasonProfile
from app.ratings import calculate_derived_ratings
from app.simulation.match_types import ATTRIBUTE_NAMES, MatchPlayer, MatchState

STYLE_EFFECTS: dict[str, dict[str, float]] = {
    "Volley Pressor": {"initiative": 2.4, "t_control": 2.2, "short": 1.3},
    "Relentless Retriever": {"defense": 2.6, "long": 2.2, "fatigue": -0.7},
    "Creative Magician": {"attack": 1.8, "deception": 2.8, "volatility": 1.0},
    "Tactical Controller": {"control": 2.5, "discipline": 1.2, "chaos": -0.9},
    "Power Driver": {"attack": 2.4, "short": 1.4, "risk": 0.9},
    "Pressure Defender": {"defense": 2.1, "long": 1.4, "pressure": 1.2},
    "Game Reader": {"anticipation": 2.5, "adapt": 1.8},
    "Tricky Opportunist": {"deception": 1.8, "tired_target": 2.0},
    "Aggressive Disruptor": {"attack": 2.3, "volatility": 1.6, "risk": 1.0},
    "Composed Controller": {"control": 1.6, "discipline": 2.2, "pressure": 1.2},
    "All-Rounder": {"stability": 1.0},
    "Endurance Grinder": {"long": 2.6, "fatigue": -1.0, "late": 1.2},
}

INJURY_FATIGUE = {"Fresh": 0.0, "Managed": 3.0, "Worn": 7.0, "Compromised": 13.0}


MAX_PUBLIC_SEED = 2**31 - 1


def _fit_public_seed(value: int) -> int:
    """Keep externally returned seeds inside SQLite/JavaScript-safe territory."""
    value = abs(value) % MAX_PUBLIC_SEED
    return value or 1


def normalize_seed(seed: int | str | None) -> int:
    if seed is None or seed == "":
        return random.SystemRandom().randint(1, MAX_PUBLIC_SEED)
    if isinstance(seed, int):
        return _fit_public_seed(seed)
    try:
        return _fit_public_seed(int(seed))
    except ValueError:
        digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16]
        return _fit_public_seed(int(digest, 16))


def child_seed(seed: int, index: int) -> int:
    digest = hashlib.sha256(f"{seed}:{index}".encode("utf-8")).hexdigest()[:16]
    return int(digest, 16)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def build_match_player(profile: PlayerSeasonProfile) -> MatchPlayer:
    attrs = profile.attributes
    attributes = {name: int(getattr(attrs, name, 50)) for name in ATTRIBUTE_NAMES}
    return MatchPlayer(
        profile_id=profile.id,
        player_id=profile.player_id,
        name=profile.player.name if profile.player else f"Profile {profile.id}",
        season_year=profile.season_year,
        play_style=profile.play_style,
        career_personality=profile.career_personality,
        match_mentality=profile.match_mentality,
        progression_type=profile.progression_type,
        form=profile.form,
        confidence=profile.confidence,
        starting_fatigue=profile.fatigue,
        injury_status=profile.injury_status,
        skill_environment=profile.skill_environment,
        attributes=attributes,
        derived_ratings=calculate_derived_ratings(profile),
    )


def _style(player: MatchPlayer, key: str) -> float:
    return STYLE_EFFECTS.get(player.play_style, {}).get(key, 0.0)


def _pressure_level(a_points: int, b_points: int, games_won: dict[int, int], a_id: int, b_id: int) -> str:
    if (a_points >= 10 and a_points >= b_points) or (b_points >= 10 and b_points >= a_points):
        if (games_won.get(a_id, 0) == 2 and a_points >= 10 and a_points >= b_points) or (
            games_won.get(b_id, 0) == 2 and b_points >= 10 and b_points >= a_points
        ):
            return "match_ball"
        return "game_ball"
    if max(a_points, b_points) >= 7 and abs(a_points - b_points) <= 2:
        return "important"
    return "normal"


def _mentality_modifier(player: MatchPlayer, pressure: str, trailing: bool, streak_against: int) -> tuple[float, float]:
    if pressure == "normal":
        base = 0.0
    elif pressure == "important":
        base = 0.8
    elif pressure == "game_ball":
        base = 1.5
    else:
        base = 2.0
    mentality = player.match_mentality
    volatility = 0.0
    if mentality == "Mentally Tough":
        return base + 0.8, volatility
    if mentality == "Ice Cold":
        return base + 1.0, -0.5
    if mentality == "Comeback Fighter":
        return base + (1.2 if trailing else 0.2), volatility
    if mentality == "Mentally Fragile":
        return base - 1.4, volatility
    if mentality == "Pressure Magnet":
        return base + 0.3, 1.2
    if mentality == "Hothead":
        return base - (1.1 if streak_against >= 2 else 0.1), 1.0
    return base, volatility


def _effective(player: MatchPlayer, fatigue: float, area: str, pressure: str, trailing: bool, streak_against: int) -> float:
    attrs = player.attributes
    if area == "serve":
        raw = attrs["serve_pressure"] * 0.65 + attrs["volley_takeover"] * 0.2 + attrs["shot_selection"] * 0.15 + _style(player, "initiative")
    elif area == "return":
        raw = attrs["return_initiative"] * 0.6 + attrs["anticipation"] * 0.25 + attrs["first_step_cod"] * 0.15
    elif area == "control":
        raw = attrs["length_quality"] * 0.27 + attrs["width_control"] * 0.24 + attrs["volley_takeover"] * 0.2 + attrs["t_recovery"] * 0.17 + attrs["shot_selection"] * 0.12 + _style(player, "control")
    elif area == "attack":
        raw = attrs["front_court_touch"] * 0.22 + attrs["finishing_power"] * 0.28 + attrs["volley_takeover"] * 0.17 + attrs["deception_creativity"] * 0.18 + attrs["shot_selection"] * 0.15 + _style(player, "attack") + _style(player, "deception") * 0.35
    elif area == "defense":
        raw = attrs["first_step_cod"] * 0.22 + attrs["t_recovery"] * 0.22 + attrs["anticipation"] * 0.2 + attrs["aerobic_repeatability"] * 0.18 + attrs["error_discipline"] * 0.18 + _style(player, "defense")
    elif area == "discipline":
        raw = attrs["error_discipline"] * 0.36 + attrs["composure"] * 0.25 + attrs["shot_selection"] * 0.22 + attrs["adaptability"] * 0.17 + _style(player, "discipline")
    else:
        raw = player.rating("tournament_rating")
    pressure_bonus, _ = _mentality_modifier(player, pressure, trailing, streak_against)
    form_bonus = (player.form - 50) * 0.045 + (player.confidence - 50) * 0.055 + (player.skill_environment - 1.0) * 5
    fatigue_penalty = fatigue * (0.08 if area in {"discipline", "attack"} else 0.11)
    injury_penalty = INJURY_FATIGUE.get(player.injury_status, 0.0) * 0.18
    return clamp(raw + form_bonus + pressure_bonus - fatigue_penalty - injury_penalty, 1, 105)


def _weighted_pick(rng: random.Random, items: list[tuple[str, float]]) -> str:
    total = sum(max(0.0, weight) for _, weight in items)
    if total <= 0:
        return items[0][0]
    roll = rng.random() * total
    upto = 0.0
    for item, weight in items:
        upto += max(0.0, weight)
        if roll <= upto:
            return item
    return items[-1][0]


def _game_over(a_points: int, b_points: int) -> bool:
    return (a_points >= 11 or b_points >= 11) and abs(a_points - b_points) >= 2


def _score_text(games: list[dict[str, Any]], a: MatchPlayer, b: MatchPlayer) -> str:
    a_games = sum(1 for g in games if g["winner_profile_id"] == a.profile_id)
    b_games = len(games) - a_games
    scores = " ".join(f"{g['score'][0]}-{g['score'][1]}" for g in games)
    return f"{a_games}-{b_games} ({scores})"


def simulate_tour_match(a: MatchPlayer, b: MatchPlayer, seed: int, include_rallies: bool = True) -> dict[str, Any]:
    rng = random.Random(seed)
    state = MatchState(
        fatigue={a.profile_id: float(a.starting_fatigue), b.profile_id: float(b.starting_fatigue)},
        games_won={a.profile_id: 0, b.profile_id: 0},
        points_won={a.profile_id: 0, b.profile_id: 0},
    )
    players = {a.profile_id: a, b.profile_id: b}
    opponent = {a.profile_id: b.profile_id, b.profile_id: a.profile_id}
    server_id = a.profile_id if rng.random() < 0.5 else b.profile_id
    rallies: list[dict[str, Any]] = []
    games: list[dict[str, Any]] = []
    stats = _blank_stats(a, b)
    rally_number = 0

    while state.games_won[a.profile_id] < 3 and state.games_won[b.profile_id] < 3:
        game_no = len(games) + 1
        a_points = b_points = 0
        game_duration = 0.0
        scoring_rallies = lets = 0
        max_let_chain = 0
        tiebreak_reached = False
        while not _game_over(a_points, b_points):
            if a_points >= 80 or b_points >= 80:
                if a_points == b_points:
                    a_points += 1 if rng.random() < 0.5 else 0
                    b_points += 1 if a_points == b_points else 0
                elif a_points > b_points:
                    a_points = b_points + 2
                else:
                    b_points = a_points + 2
                break
            pressure = _pressure_level(a_points, b_points, state.games_won, a.profile_id, b.profile_id)
            rally = _simulate_rally(
                rng, a, b, players, opponent, state, server_id, game_no, rally_number + 1, [a_points, b_points], pressure,
                force_playable=max_let_chain >= 2,
            )
            rally_number += 1
            rallies.append(rally) if include_rallies else None
            game_duration += rally["rally_duration_seconds"]
            if rally["terminal_type"] == "let_replayed":
                lets += 1
                stats["total_lets"] += 1
                stats["lets"][str(a.profile_id)] += 1
                stats["lets"][str(b.profile_id)] += 1
                max_let_chain += 1
                continue
            max_let_chain = 0
            scoring_rallies += 1
            winner_id = rally["winner_profile_id"]
            server_id = winner_id
            if winner_id == a.profile_id:
                a_points += 1
            else:
                b_points += 1
            rally["score_after"] = [a_points, b_points]
            tiebreak_reached = tiebreak_reached or (a_points >= 10 and b_points >= 10)
            _update_stats(stats, rally, a, b, pressure)
        game_winner_id = a.profile_id if a_points > b_points else b.profile_id
        state.games_won[game_winner_id] += 1
        state.previous_game_winner_profile_id = game_winner_id
        games.append({
            "game_number": game_no,
            "score": [a_points, b_points],
            "winner_profile_id": game_winner_id,
            "duration_seconds": round(game_duration, 1),
            "scoring_rallies": scoring_rallies,
            "lets": lets,
            "tiebreak": tiebreak_reached,
        })
        # Simple documented rule: the next game starts with the previous game loser serving.
        server_id = opponent[game_winner_id]
        for pid, player in players.items():
            recovery = 5.5 + player.attr("recovery_efficiency") * 0.055 + _style(player, "fatigue") * -1.4
            state.fatigue[pid] = max(float(players[pid].starting_fatigue) * 0.35, state.fatigue[pid] - recovery)

    winner_id = a.profile_id if state.games_won[a.profile_id] == 3 else b.profile_id
    loser_id = opponent[winner_id]
    stats = _finalize_stats(stats, games, rallies, a, b, state, include_rallies)
    return {
        "match_type": "tour_bo5",
        "seed": seed,
        "player_a": a.public_dict(),
        "player_b": b.public_dict(),
        "winner": players[winner_id].public_dict(),
        "loser": players[loser_id].public_dict(),
        "match_score_text": _score_text(games, a, b),
        "games": games,
        "rallies": rallies if include_rallies else [],
        "stats": stats,
        "story": _story(a, b, winner_id, games, stats),
    }


def _simulate_rally(rng: random.Random, a: MatchPlayer, b: MatchPlayer, players: dict[int, MatchPlayer], opponent: dict[int, int], state: MatchState, server_id: int, game_no: int, rally_no: int, score_before: list[int], pressure: str, force_playable: bool) -> dict[str, Any]:
    receiver_id = opponent[server_id]
    server = players[server_id]
    receiver = players[receiver_id]
    a_trailing = score_before[0] < score_before[1] or state.games_won[a.profile_id] < state.games_won[b.profile_id]
    b_trailing = score_before[1] < score_before[0] or state.games_won[b.profile_id] < state.games_won[a.profile_id]
    streak_against_a = state.point_streak_count if state.point_streak_profile_id == b.profile_id else 0
    streak_against_b = state.point_streak_count if state.point_streak_profile_id == a.profile_id else 0

    serve_edge = _effective(server, state.fatigue[server_id], "serve", pressure, server_id == a.profile_id and a_trailing or server_id == b.profile_id and b_trailing, 0)
    return_edge = _effective(receiver, state.fatigue[receiver_id], "return", pressure, receiver_id == a.profile_id and a_trailing or receiver_id == b.profile_id and b_trailing, 0)
    initiative_id = server_id if rng.random() < clamp(0.51 + (serve_edge - return_edge) / 160, 0.30, 0.72) else receiver_id

    control_a = _effective(a, state.fatigue[a.profile_id], "control", pressure, a_trailing, streak_against_a)
    control_b = _effective(b, state.fatigue[b.profile_id], "control", pressure, b_trailing, streak_against_b)
    if initiative_id == a.profile_id:
        control_a += 3.0
    else:
        control_b += 3.0
    t_control_id = a.profile_id if rng.random() < clamp(0.5 + (control_a - control_b) / 150, 0.25, 0.75) else b.profile_id

    length_bias = (a.attr("length_quality") + b.attr("length_quality") + a.attr("aerobic_repeatability") + b.attr("aerobic_repeatability")) / 4
    chaos = _style(a, "chaos") + _style(b, "chaos") + _style(a, "volatility") + _style(b, "volatility")
    length_type = _weighted_pick(rng, [
        ("short", 34 + _style(players[initiative_id], "short") + max(0, 60 - length_bias) * 0.10 + chaos),
        ("medium", 40),
        ("long", 19 + max(0, length_bias - 50) * 0.20 + _style(a, "long") + _style(b, "long")),
        ("brutal", 5 + max(0, length_bias - 65) * 0.13 + (_style(a, "long") + _style(b, "long")) * 0.45),
    ])
    shot_ranges = {"short": (3, 7), "medium": (8, 16), "long": (17, 30), "brutal": (31, 55)}
    lo, hi = shot_ranges[length_type]
    rally_shots = rng.randint(lo, hi)
    duration = round(rally_shots * rng.uniform(1.15, 1.65), 1)

    if not force_playable and rng.random() < clamp(0.010 + (abs(control_a - control_b) < 4) * 0.006, 0.004, 0.022):
        return _rally_event(rally_no, game_no, server_id, None, None, score_before, score_before, rally_shots, duration, length_type, "let_replayed", "scramble_defense", pressure, initiative_id, t_control_id, state, "Traffic through the middle forced a let and the rally will be replayed.")

    winner_id, terminal, pattern = _decide_scoring_outcome(rng, a, b, state, pressure, length_type, initiative_id, t_control_id, a_trailing, b_trailing, streak_against_a, streak_against_b)
    loser_id = opponent[winner_id]
    _apply_fatigue(a, b, state, rally_shots, duration, length_type, t_control_id, loser_id)
    if state.point_streak_profile_id == winner_id:
        state.point_streak_count += 1
    else:
        state.point_streak_profile_id = winner_id
        state.point_streak_count = 1
    state.points_won[winner_id] += 1
    explanation = _explanation(players[winner_id], players[loser_id], terminal, pattern, length_type, pressure)
    return _rally_event(rally_no, game_no, server_id, winner_id, loser_id, score_before, score_before[:], rally_shots, duration, length_type, terminal, pattern, pressure, initiative_id, t_control_id, state, explanation)


def _decide_scoring_outcome(rng: random.Random, a: MatchPlayer, b: MatchPlayer, state: MatchState, pressure: str, length_type: str, initiative_id: int, t_control_id: int, a_trailing: bool, b_trailing: bool, streak_a: int, streak_b: int) -> tuple[int, str, str]:
    players = {a.profile_id: a, b.profile_id: b}
    scores: dict[int, float] = {}
    terms: dict[int, str] = {}
    patterns: dict[int, str] = {}
    for p, opp, trailing, streak in [(a, b, a_trailing, streak_a), (b, a, b_trailing, streak_b)]:
        attack = _effective(p, state.fatigue[p.profile_id], "attack", pressure, trailing, streak)
        defense = _effective(p, state.fatigue[p.profile_id], "defense", pressure, trailing, streak)
        discipline = _effective(p, state.fatigue[p.profile_id], "discipline", pressure, trailing, streak)
        opp_discipline = _effective(opp, state.fatigue[opp.profile_id], "discipline", pressure, not trailing, 0)
        long_bonus = (_style(p, "long") + p.attr("aerobic_repeatability") * 0.025) if length_type in {"long", "brutal"} else 0
        initiative_bonus = 3.5 if initiative_id == p.profile_id else 0
        control_bonus = 4.2 if t_control_id == p.profile_id else -1.2
        tired_target = max(0.0, state.fatigue[opp.profile_id] - state.fatigue[p.profile_id]) * (0.03 + _style(p, "tired_target") * 0.01)
        scores[p.profile_id] = attack * 0.31 + defense * 0.24 + discipline * 0.20 + p.rating("tactical_rating") * 0.13 + p.rating("physical_rating") * 0.12 + initiative_bonus + control_bonus + long_bonus + tired_target
        win_weights = [
            ("winner", 25 + attack * 0.42 + _style(p, "attack") * 2.0),
            ("forced_error", 25 + defense * 0.22 + attack * 0.14 + max(0, 78 - opp_discipline) * 0.42),
            ("stroke", 2.2 + (4.5 if t_control_id == p.profile_id and length_type in {"short", "medium"} else 0.0)),
        ]
        if length_type in {"long", "brutal"}:
            win_weights[1] = ("forced_error", win_weights[1][1] + _style(p, "defense") * 2 + p.attr("aerobic_repeatability") * 0.08)
        terms[p.profile_id] = _weighted_pick(rng, win_weights)
        patterns[p.profile_id] = _pattern_for(p, terms[p.profile_id], length_type, initiative_id == p.profile_id, t_control_id == p.profile_id)
    a_prob = clamp(0.5 + (scores[a.profile_id] - scores[b.profile_id]) / 95, 0.16, 0.84)
    winner_id = a.profile_id if rng.random() < a_prob else b.profile_id
    loser = players[b.profile_id if winner_id == a.profile_id else a.profile_id]
    winner = players[winner_id]
    # A winner can still receive the point from the opponent's unforced error.
    loser_disc = _effective(loser, state.fatigue[loser.profile_id], "discipline", pressure, False, 0)
    pressure_error = {"normal": 0, "important": 3, "game_ball": 6, "match_ball": 8}[pressure]
    risk = max(3.0, 24 - loser_disc * 0.16 + state.fatigue[loser.profile_id] * 0.055 + _style(loser, "risk") * 1.8 + pressure_error)
    if rng.random() < clamp(risk / 100, 0.03, 0.26):
        return winner_id, "unforced_error", "pressure_error" if pressure != "normal" else "deep_length_exchange"
    return winner_id, terms[winner_id], patterns[winner_id]


def _pattern_for(player: MatchPlayer, terminal: str, length_type: str, had_initiative: bool, had_t: bool) -> str:
    if terminal == "stroke":
        return "front_court_attack"
    if player.play_style == "Creative Magician" and terminal == "winner":
        return "deception_hold"
    if player.play_style in {"Volley Pressor", "Composed Controller"} and had_t:
        return "volley_takeover"
    if terminal == "winner" and player.attr("finishing_power") > 72 and length_type == "short":
        return "power_finish"
    if terminal == "forced_error" and length_type in {"long", "brutal"}:
        return "attritional_rally"
    if terminal == "forced_error" and not had_initiative:
        return "return_counter"
    if player.attr("front_court_touch") + player.attr("deception_creativity") > 145:
        return "front_court_attack"
    if had_initiative and length_type == "short":
        return "serve_pressure_start"
    return "deep_length_exchange" if length_type != "brutal" else "scramble_defense"


def _apply_fatigue(a: MatchPlayer, b: MatchPlayer, state: MatchState, shots: int, duration: float, length_type: str, t_control_id: int, loser_id: int) -> None:
    multiplier = {"short": 0.55, "medium": 0.9, "long": 1.35, "brutal": 1.85}[length_type]
    for p in (a, b):
        attr_resist = p.attr("aerobic_repeatability") * 0.35 + p.attr("recovery_efficiency") * 0.25 + p.attr("durability") * 0.25 + p.attr("t_recovery") * 0.15
        base = (duration * 0.018 + shots * 0.030) * multiplier
        scramble = 0.28 if p.profile_id != t_control_id else 0.0
        losing_burden = 0.13 if p.profile_id == loser_id else 0.0
        injury = INJURY_FATIGUE.get(p.injury_status, 0.0) * 0.015
        state.fatigue[p.profile_id] = clamp(state.fatigue[p.profile_id] + base * clamp(1.25 - attr_resist / 100, 0.32, 1.25) + scramble + losing_burden + injury, 0, 100)


def _rally_event(rally_number: int, game_number: int, server_id: int, winner_id: int | None, loser_id: int | None, score_before: list[int], score_after: list[int], rally_shots: int, duration: float, length_type: str, terminal: str, pattern: str, pressure: str, initiative_id: int, t_control_id: int, state: MatchState, explanation: str) -> dict[str, Any]:
    return {
        "rally_number": rally_number,
        "game_number": game_number,
        "server_profile_id": server_id,
        "winner_profile_id": winner_id,
        "loser_profile_id": loser_id,
        "score_before": score_before,
        "score_after": score_after,
        "rally_shots": rally_shots,
        "rally_duration_seconds": duration,
        "rally_length_type": length_type,
        "terminal_type": terminal,
        "tactical_pattern": pattern,
        "pressure_level": pressure,
        "initiative_player_profile_id": initiative_id,
        "t_control_player_profile_id": t_control_id,
        "fatigue_after": {"player_a": round(state.fatigue[list(state.fatigue.keys())[0]], 1), "player_b": round(state.fatigue[list(state.fatigue.keys())[1]], 1)},
        "explanation": explanation,
    }


def _blank_stats(a: MatchPlayer, b: MatchPlayer) -> dict[str, Any]:
    ids = [str(a.profile_id), str(b.profile_id)]
    return {
        "total_points": {pid: 0 for pid in ids},
        "games_won": {pid: 0 for pid in ids},
        "total_scoring_rallies": 0,
        "total_lets": 0,
        "total_duration_seconds": 0.0,
        "clean_rally_time_seconds": 0.0,
        "estimated_broadcast_duration_seconds": 0.0,
        "estimated_broadcast_duration_minutes": 0.0,
        "average_rally_shots": 0.0,
        "average_rally_duration_seconds": 0.0,
        "longest_rally_shots": 0,
        "longest_rally_seconds": 0.0,
        "short_rallies_won": {pid: 0 for pid in ids},
        "medium_rallies_won": {pid: 0 for pid in ids},
        "long_rallies_won": {pid: 0 for pid in ids},
        "brutal_rallies_won": {pid: 0 for pid in ids},
        "winners": {pid: 0 for pid in ids},
        "forced_errors_won": {pid: 0 for pid in ids},
        "unforced_errors_committed": {pid: 0 for pid in ids},
        "strokes_won": {pid: 0 for pid in ids},
        "lets": {pid: 0 for pid in ids},
        "pressure_points_won": {pid: 0 for pid in ids},
        "game_balls_created": {pid: 0 for pid in ids},
        "game_balls_converted": {pid: 0 for pid in ids},
        "match_balls_created": {pid: 0 for pid in ids},
        "match_balls_converted": {pid: 0 for pid in ids},
        "biggest_point_streak": {pid: 0 for pid in ids},
        "comeback_notes": [],
        "fatigue_final": {pid: 0.0 for pid in ids},
        "performance_rating": {pid: 0.0 for pid in ids},
        "_shot_sum": 0,
        "_duration_sum": 0.0,
    }


def _update_stats(stats: dict[str, Any], rally: dict[str, Any], a: MatchPlayer, b: MatchPlayer, pressure: str) -> None:
    wid = str(rally["winner_profile_id"])
    lid = str(rally["loser_profile_id"])
    stats["total_points"][wid] += 1
    stats["total_scoring_rallies"] += 1
    stats["_shot_sum"] += rally["rally_shots"]
    stats["_duration_sum"] += rally["rally_duration_seconds"]
    stats["longest_rally_shots"] = max(stats["longest_rally_shots"], rally["rally_shots"])
    stats["longest_rally_seconds"] = round(max(stats["longest_rally_seconds"], rally["rally_duration_seconds"]), 1)
    length_key = f"{rally['rally_length_type']}_rallies_won"
    stats[length_key][wid] += 1
    term = rally["terminal_type"]
    if term == "winner":
        stats["winners"][wid] += 1
    elif term == "forced_error":
        stats["forced_errors_won"][wid] += 1
    elif term == "unforced_error":
        stats["unforced_errors_committed"][lid] += 1
    elif term == "stroke":
        stats["strokes_won"][wid] += 1
    if pressure != "normal":
        stats["pressure_points_won"][wid] += 1
    if pressure in {"game_ball", "match_ball"}:
        leader_id = str(a.profile_id if rally["score_before"][0] >= rally["score_before"][1] else b.profile_id)
        stats["game_balls_created"][leader_id] += 1
        if pressure == "match_ball":
            stats["match_balls_created"][leader_id] += 1
        if wid == leader_id:
            stats["game_balls_converted"][leader_id] += 1
            if pressure == "match_ball":
                stats["match_balls_converted"][leader_id] += 1


def _finalize_stats(stats: dict[str, Any], games: list[dict[str, Any]], rallies: list[dict[str, Any]], a: MatchPlayer, b: MatchPlayer, state: MatchState, include_rallies: bool) -> dict[str, Any]:
    for g in games:
        stats["games_won"][str(g["winner_profile_id"])] += 1
        stats["total_duration_seconds"] += g["duration_seconds"]
        if max(g["score"]) >= 11 and min(g["score"]) >= 8:
            loser_id = b.profile_id if g["winner_profile_id"] == a.profile_id else a.profile_id
            stats["comeback_notes"].append(f"Game {g['game_number']} stayed tight before profile {g['winner_profile_id']} edged it {g['score'][0]}-{g['score'][1]}.")
    scoring = [r for r in rallies if r.get("terminal_type") != "let_replayed"] if include_rallies else []
    if scoring:
        stats["average_rally_shots"] = round(sum(r["rally_shots"] for r in scoring) / len(scoring), 1)
        stats["average_rally_duration_seconds"] = round(sum(r["rally_duration_seconds"] for r in scoring) / len(scoring), 1)
        stats["longest_rally_shots"] = max(r["rally_shots"] for r in scoring)
        stats["longest_rally_seconds"] = round(max(r["rally_duration_seconds"] for r in scoring), 1)
        streaks = defaultdict(int)
        best = defaultdict(int)
        last = None
        for r in scoring:
            wid = str(r["winner_profile_id"])
            streaks[wid] = streaks[wid] + 1 if wid == last else 1
            last = wid
            best[wid] = max(best[wid], streaks[wid])
        for pid, value in best.items():
            stats["biggest_point_streak"][pid] = value
    else:
        total_points = stats["total_scoring_rallies"] or 1
        stats["average_rally_shots"] = round(stats["_shot_sum"] / total_points, 1)
        stats["average_rally_duration_seconds"] = round(stats["_duration_sum"] / total_points, 1)
    stats["fatigue_final"] = {str(pid): round(value, 1) for pid, value in state.fatigue.items()}
    for p in (a, b):
        pid = str(p.profile_id)
        points = stats["total_points"][pid]
        games_won = stats["games_won"][pid]
        stats["performance_rating"][pid] = round(50 + games_won * 10 + points * 0.35 + stats["pressure_points_won"][pid] * 0.25 - stats["unforced_errors_committed"][pid] * 0.45 - stats["fatigue_final"][pid] * 0.08, 1)
    stats["total_duration_seconds"] = round(stats["total_duration_seconds"], 1)
    stats["clean_rally_time_seconds"] = stats["total_duration_seconds"]
    broadcast_duration = stats["clean_rally_time_seconds"] + (stats["total_scoring_rallies"] * 12) + (max(len(games) - 1, 0) * 90) + 60
    stats["estimated_broadcast_duration_seconds"] = round(broadcast_duration, 1)
    stats["estimated_broadcast_duration_minutes"] = round(broadcast_duration / 60, 1)
    stats.pop("_shot_sum", None)
    stats.pop("_duration_sum", None)
    return stats


def _explanation(winner: MatchPlayer, loser: MatchPlayer, terminal: str, pattern: str, length_type: str, pressure: str) -> str:
    pressure_text = " under pressure" if pressure != "normal" else ""
    if terminal == "winner":
        return f"{winner.name} converted {pattern.replace('_', ' ')} into a {length_type} rally winner{pressure_text}."
    if terminal == "forced_error":
        return f"{winner.name} built enough pressure through {pattern.replace('_', ' ')} to force {loser.name}'s error."
    if terminal == "unforced_error":
        return f"{winner.name} stayed steadier as {loser.name} leaked an unforced error{pressure_text}."
    if terminal == "stroke":
        return f"{winner.name}'s front-court pressure earned a stroke."
    return "The rally was replayed after traffic interrupted the line to the ball."


def _story(a: MatchPlayer, b: MatchPlayer, winner_id: int, games: list[dict[str, Any]], stats: dict[str, Any]) -> dict[str, str]:
    winner = a if winner_id == a.profile_id else b
    loser = b if winner_id == a.profile_id else a
    wid = str(winner.profile_id)
    lid = str(loser.profile_id)
    close_games = sum(1 for g in games if abs(g["score"][0] - g["score"][1]) <= 2)
    return {
        "headline": f"{winner.name} defeats {loser.name} {stats['games_won'][wid]}-{stats['games_won'][lid]} in Tour BO5.",
        "key_factor": f"{winner.play_style} execution produced {stats['winners'][wid]} winners and {stats['forced_errors_won'][wid]} forced errors won.",
        "turning_point": f"The match hinged on {close_games} tight game(s), with pressure points finishing {stats['pressure_points_won'][wid]}-{stats['pressure_points_won'][lid]}.",
        "style_summary": f"{a.name}'s {a.play_style} met {b.name}'s {b.play_style}; attributes drove the result while style nudged initiative and rally shape.",
        "fatigue_summary": f"Final fatigue was {stats['fatigue_final'][str(a.profile_id)]} for {a.name} and {stats['fatigue_final'][str(b.profile_id)]} for {b.name}.",
        "pressure_summary": f"Game and match ball conversion finished {stats['game_balls_converted'][wid]}/{stats['game_balls_created'][wid]} for {winner.name}.",
        "explanation": "The simulation resolved every rally through serve/return initiative, T control, rally length, terminal event risk, fatigue and pressure modifiers.",
    }
