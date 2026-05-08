from __future__ import annotations

from typing import Any

from app.simulation.match_types import MatchPlayer
from app.simulation.tour_match_engine import child_seed, simulate_tour_match


def edge_summary(label: str, a_name: str, b_name: str, a_value: float, b_value: float) -> str:
    diff = a_value - b_value
    if abs(diff) < 2.5:
        return f"{label} is close, with neither player holding a clear edge."
    leader = a_name if diff > 0 else b_name
    return f"{leader} has the clearer {label.lower()} edge ({abs(diff):.1f} rating points)."


def preview_probabilities(a: MatchPlayer, b: MatchPlayer, seed: int, runs: int) -> dict[str, Any]:
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
        result = simulate_tour_match(a, b, child_seed(seed, index), include_rallies=False)
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
    return {
        "match_type": "tour_bo5",
        "seed": seed,
        "monte_carlo_runs": runs,
        "player_a": a.public_dict(),
        "player_b": b.public_dict(),
        "player_a_win_probability": wins[a.profile_id] / runs,
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
    }
