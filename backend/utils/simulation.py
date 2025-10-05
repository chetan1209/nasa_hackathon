"""Simulation utilities for adding parks and updating rasters."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np
from scipy.ndimage import distance_transform_edt

from .scoring import compute_hcs, equity_adjust


@dataclass
class SimulationResult:
    """Container with the updated rasters and diagnostics."""

    lst_new: np.ndarray
    no2_new: np.ndarray
    pwv_new: np.ndarray
    delta_lst: np.ndarray
    delta_no2: np.ndarray
    need: np.ndarray
    coverage_before: np.ndarray
    coverage_after: np.ndarray
    coverage_gain: np.ndarray
    hcs_before: np.ndarray
    hcs_after: np.ndarray
    equity_before: np.ndarray
    equity_after: np.ndarray
    mean_equity_delta: float
    maintenance_penalty: float
    overlap_penalty: float
    marginal_gain: float


def _normalise(array: np.ndarray) -> np.ndarray:
    array = np.array(array, dtype=float)
    if np.all(np.isnan(array)):
        return np.zeros_like(array)
    max_val = np.nanmax(array)
    if max_val <= 0:
        return np.zeros_like(array)
    return array / (max_val + 1e-9)


def compute_need(
    pop: np.ndarray,
    vulnerability: np.ndarray,
    parks_mask: np.ndarray,
    *,
    px_m: float = 1000.0,
    service_radius: float = 300.0,
) -> Tuple[np.ndarray, np.ndarray]:
    """Compute the need surface and service coverage."""

    if parks_mask.dtype != bool:
        parks_mask = parks_mask.astype(bool)

    # Distance (in pixels) to the nearest park cell.
    distance = distance_transform_edt(~parks_mask)
    coverage = np.exp(-distance * px_m / service_radius)

    pop_weight = _normalise(pop)
    vuln_weight = np.nan_to_num(vulnerability, nan=0.0)
    need = pop_weight * (1.0 + vuln_weight) * (1.0 - coverage)

    return need, coverage


def _cap_delta(delta: np.ndarray, lower: float) -> np.ndarray:
    """Ensure deltas are capped to a minimum negative value."""

    result = np.clip(delta, lower, 0.0)
    return result


def simulate_park(
    lst: np.ndarray,
    no2: np.ndarray,
    pwv: np.ndarray,
    pop: np.ndarray,
    vulnerability: np.ndarray,
    parks_mask: np.ndarray,
    new_park_mask: np.ndarray,
    *,
    pixel_size_m: float = 1000.0,
    service_radius: float = 300.0,
    c_max: float = 1.0,
    r0_heat: float = 300.0,
    r_max: float = 0.05,
    r0_no2: float = 150.0,
    lambda_m: float = 0.5,
    lambda_o: float = 2.0,
) -> Optional[SimulationResult]:
    """Simulate the impact of a new park polygon."""

    parks_mask = parks_mask.astype(bool)
    new_mask = new_park_mask.astype(bool)
    net_new = new_mask & (~parks_mask)

    if net_new.sum() == 0:
        return None

    need, coverage_before = compute_need(
        pop, vulnerability, parks_mask, px_m=pixel_size_m, service_radius=service_radius
    )

    # Cooling impact (ΔLST)
    distance_new = distance_transform_edt(~net_new)
    cool_kernel = np.exp(-distance_new * pixel_size_m / r0_heat)
    delta_lst = -c_max * cool_kernel * need
    delta_lst = _cap_delta(delta_lst, lower=-2.0)

    # Air quality impact (ΔNO2)
    no2_kernel = np.exp(-distance_new * pixel_size_m / r0_no2)
    delta_no2 = -r_max * no2 * no2_kernel * need
    delta_no2 = np.maximum(delta_no2, -0.10 * no2)

    lst_new = lst + delta_lst
    no2_new = no2 + delta_no2
    pwv_new = np.array(pwv, copy=True)

    parks_after = parks_mask | net_new
    need_after, coverage_after = compute_need(
        pop, vulnerability, parks_after, px_m=pixel_size_m, service_radius=service_radius
    )
    coverage_gain = coverage_after - coverage_before

    # Scores and penalties
    hcs_before = compute_hcs(lst, no2, pwv)
    hcs_after = compute_hcs(lst_new, no2_new, pwv_new)
    equity_before = equity_adjust(hcs_before, vulnerability)
    equity_after = equity_adjust(hcs_after, vulnerability)
    mean_equity_delta = float(np.nanmean(equity_after - equity_before))

    maintenance_penalty = float(lambda_m)
    overlap_penalty = float(lambda_o * np.nanmean(np.clip(coverage_gain, 0.0, 1.0)))
    marginal_gain = mean_equity_delta - maintenance_penalty - overlap_penalty

    return SimulationResult(
        lst_new=lst_new,
        no2_new=no2_new,
        pwv_new=pwv_new,
        delta_lst=delta_lst,
        delta_no2=delta_no2,
        need=need,
        coverage_before=coverage_before,
        coverage_after=coverage_after,
        coverage_gain=coverage_gain,
        hcs_before=hcs_before,
        hcs_after=hcs_after,
        equity_before=equity_before,
        equity_after=equity_after,
        mean_equity_delta=mean_equity_delta,
        maintenance_penalty=maintenance_penalty,
        overlap_penalty=overlap_penalty,
        marginal_gain=marginal_gain,
    )


def make_structured_candidate(
    index: int,
    shape: Tuple[int, int],
    kernel_size: int = 3,
) -> np.ndarray:
    """Create a small square mask centred on the index."""

    rows, cols = shape
    mask = np.zeros(shape, dtype=bool)
    r = index // cols
    c = index % cols
    half = kernel_size // 2
    r0 = max(r - half, 0)
    r1 = min(r + half + 1, rows)
    c0 = max(c - half, 0)
    c1 = min(c + half + 1, cols)
    mask[r0:r1, c0:c1] = True
    return mask
