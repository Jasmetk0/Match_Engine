from __future__ import annotations

from typing import Any

from app.simulation.calibration import style_edge, volatility_index
from app.simulation.match_context import context_edges, context_summary, normalize_match_context, tactical_preview
from app.simulation.match_types import MatchPlayer
from app.simulation.tour_match_engine import child_seed, simulate_tour_match


def edge_summary(label: str, a_name: str, b_name: str, a_value: float, b_value: float) -> str:
    diff = a_value - b_value
    if abs(diff) < 2.5:
        return f"{label} is close, with neither player holding a clear edge."
    leader = a_name if diff > 0 else b_name
    return f"{leader} has the clearer {label.lower()} edge ({abs(diff):.1f} rating points)."


def preview_probabilities(a: MatchPlayer, b: MatchPlayer, seed: int, runs: int, match_context: dict[str, Any] | None = None) -> dict[str, Any]:
    match_context = normalize_match_context(match_context)
    wins = {a.profile_id: 0, b.profile_id: 0}
    scorelines = {
        "player_a_3_0": 0,
        "player_a_3_1": 0,
        "player_a_3_2": 0,
        "player_b_3_0": 0,
        "player_b_3_1": 0,
        "player_b_3_2": 0,
    }
    deciding = tiebreaks = 0
    total_points = total_duration = total_rallies = total_avg_shots = 0.0
    for index in range(runs):
        result = simulate_tour_match(a, b, child_seed(seed, index), include_rallies=False, match_context=match_context)
        winner_id = result["winner"]["profile_id"]
        wins[winner_id] += 1
        a_games = result["stats"]["games_won"][str(a.profile_id)]
        b_games = result["stats"]["games_won"][str(b.profile_id)]
        if winner_id == a.profile_id:
            scorelines[f"player_a_3_{b_games}"] += 1
        else:
            scorelines[f"player_b_3_{a_games}"] += 1
        deciding += int(len(result["games"]) == 5)
        tiebreaks += int(any(game.get("tiebreak") for game in result["games"]))
        points = sum(result["stats"]["total_points"].values())
        total_points += points
        total_duration += result["stats"]["total_duration_seconds"]
        total_rallies += result["stats"]["total_scoring_rallies"] + result["stats"]["total_lets"]
        total_avg_shots += result["stats"]["average_rally_shots"]
    rating_diff = a.rating("tournament_rating") - b.rating("tournament_rating")
    if abs(rating_diff) < 3:
        upset_hint = "Ratings are close enough that either winner would feel plausible rather than a true upset."
    else:
        favorite = a.name if rating_diff > 0 else b.name
        underdog = b.name if rating_diff > 0 else a.name
        upset_hint = f"{favorite} is the ratings favorite; a {underdog} win would be the upset result."
    ctx_edges = context_edges(a, b, match_context)
    long_share = round((a.attr("aerobic_repeatability") + b.attr("aerobic_repeatability") + a.attr("length_quality") + b.attr("length_quality")) / 400, 2)
    pressure_share = round((deciding / runs) * 0.35 + (tiebreaks / runs) * 0.25, 2)
    pa = wins[a.profile_id] / runs
    upset = round(min(pa, 1 - pa) * (0.85 if abs(rating_diff) > 8 else 1.15), 2)
    return {
        "match_type": "tour_bo5",
        "seed": seed,
        "monte_carlo_runs": runs,
        "player_a": a.public_dict(),
        "player_b": b.public_dict(),
        "player_a_win_probability": pa,
        "player_b_win_probability": wins[b.profile_id] / runs,
        **{key: value / runs for key, value in scorelines.items()},
        "deciding_game_probability": deciding / runs,
        "at_least_one_tiebreak_probability": tiebreaks / runs,
        "expected_total_points": round(total_points / runs, 1),
        "expected_total_duration_seconds": round(total_duration / runs, 1),
        "expected_total_rallies": round(total_rallies / runs, 1),
        "expected_average_rally_shots": round(total_avg_shots / runs, 1),
        "upset_hint": upset_hint,
        "style_edge_summary": f"{a.name} brings {a.play_style}; {b.name} brings {b.play_style}. Subtle style modifiers affect initiative, rally length and volatility.",
        "physical_edge_summary": edge_summary("Physical", a.name, b.name, a.rating("physical_rating"), b.rating("physical_rating")),
        "pressure_edge_summary": edge_summary("Pressure", a.name, b.name, a.rating("mental_rating"), b.rating("mental_rating")),
        "match_context": match_context,
        "context_summary": context_summary(match_context),
        "rating_edge": round(rating_diff, 2),
        "style_edge": style_edge(a, b, league=False),
        "context_edge": ctx_edges["context_edge"],
        "pressure_edge": ctx_edges["pressure_edge"],
        "fatigue_edge": ctx_edges["fatigue_edge"],
        "volatility_index": round(volatility_index(a, b, league=False) + (0.08 if match_context["event_importance"] == "rivalry" else 0), 2),
        "expected_closeness": round(1 - min(abs(rating_diff) / 28, 1), 2),
        "upset_probability_estimate": upset,
        "key_advantages": [edge_summary("Rating", a.name, b.name, a.rating("tournament_rating"), b.rating("tournament_rating")), edge_summary("Physical", a.name, b.name, a.rating("physical_rating"), b.rating("physical_rating"))],
        "risk_factors": ["Context modifiers are intentionally subtle.", "Pressure points and fatigue can still swing close games."],
        "tactical_preview": tactical_preview(a, b, match_context, league=False),
        "expected_long_rally_share": long_share,
        "expected_pressure_point_share": pressure_share,
        "expected_clean_time_range": [round((total_duration / runs) * 0.88, 1), round((total_duration / runs) * 1.14, 1)],
        "expected_broadcast_time_range": [round((total_duration / runs + (total_rallies / runs) * 18) * 0.9, 1), round((total_duration / runs + (total_rallies / runs) * 18) * 1.2, 1)],
        "preview_diagnostics": {
            "rating_edge": round(rating_diff, 2),
            "style_edge": style_edge(a, b, league=False),
            "format_edge": "Tour BO5 leans toward recovery, length quality, defensive repeatability and pressure discipline.",
            "volatility_estimate": volatility_index(a, b, league=False),
            "expected_closeness": round(1 - min(abs(rating_diff) / 28, 1), 2),
        },
    }
