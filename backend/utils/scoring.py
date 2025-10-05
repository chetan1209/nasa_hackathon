"""Scoring utilities for the Healthy City Score backend."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

import numpy as np


# Default weights for the Healthy City Score components.
HEAT_WEIGHT = 0.4
AIR_WEIGHT = 0.4
MOISTURE_WEIGHT = 0.2


def zscore(data: np.ndarray) -> np.ndarray:
    """Return the z-score normalisation of an array.

    Parameters
    ----------
    data:
        Array containing the values to normalise.

    Returns
    -------
    np.ndarray
        Z-score normalised array where NaN values are preserved.
    """

    mean = np.nanmean(data)
    std = np.nanstd(data) + 1e-9
    return (data - mean) / std


def compute_hcs(
    lst: np.ndarray,
    no2: np.ndarray,
    pwv: np.ndarray,
    *,
    weights: Tuple[float, float, float] = (HEAT_WEIGHT, AIR_WEIGHT, MOISTURE_WEIGHT),
) -> np.ndarray:
    """Compute the Healthy City Score (HCS) surface."""

    w_h, w_a, w_m = weights
    lst_z = zscore(lst)
    no2_z = zscore(no2)
    pwv_z = zscore(pwv)
    return 100.0 - (w_h * lst_z + w_a * no2_z + w_m * pwv_z)


def equity_adjust(hcs: np.ndarray, vulnerability: np.ndarray, equity_weight: float = 0.4) -> np.ndarray:
    """Apply the equity adjustment using the vulnerability surface."""

    return hcs * (1.0 - equity_weight * vulnerability)


@dataclass
class ScoreSummary:
    """Container for summary statistics."""

    hcs_mean: float
    equity_mean: float

    @classmethod
    def from_surfaces(cls, hcs: np.ndarray, equity: np.ndarray) -> "ScoreSummary":
        return cls(
            hcs_mean=float(np.nanmean(hcs)),
            equity_mean=float(np.nanmean(equity)),
        )
