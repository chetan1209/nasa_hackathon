"""Greedy optimiser to determine the optimal number of parks."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

import numpy as np

from .scoring import ScoreSummary
from .simulation import SimulationResult, make_structured_candidate, simulate_park


@dataclass
class OptimisationStep:
    index: int
    equity_delta: float
    marginal_gain: float
    coverage_gain: float
    maintenance_penalty: float
    overlap_penalty: float
    summary: ScoreSummary


@dataclass
class OptimisationResult:
    steps: List[OptimisationStep]

    @property
    def optimal_parks(self) -> int:
        return len(self.steps)

    def as_dict(self) -> dict:
        return {
            "optimal_parks": self.optimal_parks,
            "steps": [
                {
                    "index": step.index,
                    "equity_delta": step.equity_delta,
                    "marginal_gain": step.marginal_gain,
                    "coverage_gain": step.coverage_gain,
                    "maintenance_penalty": step.maintenance_penalty,
                    "overlap_penalty": step.overlap_penalty,
                    "hcs_mean": step.summary.hcs_mean,
                    "equity_mean": step.summary.equity_mean,
                }
                for step in self.steps
            ],
        }


def greedy_search(
    lst: np.ndarray,
    no2: np.ndarray,
    pwv: np.ndarray,
    pop: np.ndarray,
    vulnerability: np.ndarray,
    parks_mask: np.ndarray,
    *,
    candidate_count: int = 25,
    max_iterations: int = 12,
    kernel_size: int = 3,
    lambda_m: float = 0.5,
    lambda_o: float = 2.0,
) -> OptimisationResult:
    """Greedy search to determine when parks stop improving the score."""

    current_lst = np.array(lst, copy=True)
    current_no2 = np.array(no2, copy=True)
    current_pw = np.array(pwv, copy=True)
    current_parks = parks_mask.astype(bool).copy()

    steps: List[OptimisationStep] = []

    flat_indices = np.arange(current_parks.size)

    for iteration in range(max_iterations):
        need_surface = np.nan_to_num(pop) * (1.0 + np.nan_to_num(vulnerability))
        need_surface[current_parks] = 0.0

        candidate_indices = flat_indices[np.argsort(need_surface.ravel())[::-1]]
        candidate_indices = candidate_indices[:candidate_count]

        best_step: Optional[OptimisationStep] = None
        best_result: Optional[SimulationResult] = None
        best_mask: Optional[np.ndarray] = None

        for idx in candidate_indices:
            candidate_mask = make_structured_candidate(idx, current_parks.shape, kernel_size=kernel_size)
            result = simulate_park(
                current_lst,
                current_no2,
                current_pw,
                pop,
                vulnerability,
                current_parks,
                candidate_mask,
                lambda_m=lambda_m,
                lambda_o=lambda_o,
            )
            if result is None:
                continue

            summary = ScoreSummary.from_surfaces(result.hcs_after, result.equity_after)
            step = OptimisationStep(
                index=int(idx),
                equity_delta=result.mean_equity_delta,
                marginal_gain=result.marginal_gain,
                coverage_gain=float(np.nanmean(result.coverage_gain)),
                maintenance_penalty=result.maintenance_penalty,
                overlap_penalty=result.overlap_penalty,
                summary=summary,
            )

            if best_step is None or step.marginal_gain > best_step.marginal_gain:
                best_step = step
                best_result = result
                best_mask = candidate_mask

        if best_step is None or best_step.marginal_gain <= 0:
            break

        steps.append(best_step)
        current_lst = best_result.lst_new
        current_no2 = best_result.no2_new
        current_pw = best_result.pwv_new
        current_parks = current_parks | best_mask

    return OptimisationResult(steps=steps)
