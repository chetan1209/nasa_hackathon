"""FastAPI backend for park impact simulation and scoring."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

import numpy as np
import rioxarray as rxr
import xarray as xr
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from rasterio.features import rasterize
from rasterio.transform import from_bounds
from shapely.geometry import shape

from .utils.optimize import greedy_search
from .utils.scoring import ScoreSummary, compute_hcs, equity_adjust
from .utils.simulation import SimulationResult, simulate_park

BOUNDS = {
    "west": -87.8,
    "south": 41.8,
    "east": -87.5,
    "north": 42.1,
}
DEFAULT_SHAPE = (60, 60)
CRS = "EPSG:4326"

app = FastAPI(title="Healthy City Score API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ParkRequest(BaseModel):
    polygon: Dict[str, Any] = Field(..., description="GeoJSON geometry for the new park")
    lambda_m: float = Field(0.5, description="Maintenance penalty")
    lambda_o: float = Field(2.0, description="Overlap penalty multiplier")
    service_radius: float = Field(300.0, description="Service radius in metres")


class OptimisationRequest(BaseModel):
    candidate_count: int = Field(25, ge=1, le=500)
    max_iterations: int = Field(12, ge=1, le=100)
    kernel_size: int = Field(3, ge=1, le=11)
    lambda_m: float = Field(0.5)
    lambda_o: float = Field(2.0)


def _mock_surface(name: str, shape: tuple[int, int]) -> xr.DataArray:
    rng = np.random.default_rng(abs(hash(name)) & 0xFFFFFFFF)
    rows, cols = shape
    yy, xx = np.indices(shape)
    centre_y, centre_x = rows / 2.0, cols / 2.0
    distance = np.sqrt((yy - centre_y) ** 2 + (xx - centre_x) ** 2)
    distance_norm = distance / distance.max()

    if name == "lst.tif":
        data = 32 + 4 * distance_norm + rng.normal(0, 0.4, shape)
    elif name == "no2.tif":
        data = 0.03 + 0.02 * (1 - distance_norm) + rng.normal(0, 0.002, shape)
        data = np.clip(data, 0.005, None)
    elif name == "pwv.tif":
        data = 3 + 0.3 * rng.normal(0, 1, shape)
    elif name == "pop.tif":
        data = 2000 * (1 - distance_norm) + 100 * rng.random(shape)
        data = np.clip(data, 0, None)
    elif name == "vuln.tif":
        data = np.clip(0.6 * (1 - distance_norm) + 0.3 * rng.random(shape), 0, 1)
    elif name == "parks_existing.tif":
        data = np.zeros(shape, dtype=float)
        data[5:12, 8:14] = 1
        data[35:42, 30:36] = 1
    else:
        data = rng.random(shape)

    return _dataarray_from_data(data)


def _dataarray_from_data(data: np.ndarray) -> xr.DataArray:
    rows, cols = data.shape
    pixel_width = (BOUNDS["east"] - BOUNDS["west"]) / cols
    pixel_height = (BOUNDS["north"] - BOUNDS["south"]) / rows
    x_coords = BOUNDS["west"] + pixel_width / 2 + pixel_width * np.arange(cols)
    y_coords = BOUNDS["north"] - pixel_height / 2 - pixel_height * np.arange(rows)
    da = xr.DataArray(data, coords={"y": y_coords, "x": x_coords}, dims=("y", "x"))
    da = da.rio.write_crs(CRS)
    transform = from_bounds(
        BOUNDS["west"], BOUNDS["south"], BOUNDS["east"], BOUNDS["north"], cols, rows
    )
    da.rio.write_transform(transform, inplace=True)
    return da


def _load_raster(path: Path, fallback_name: str, shape: tuple[int, int]) -> xr.DataArray:
    if path.exists():
        da = rxr.open_rasterio(path).squeeze()
        if "band" in da.dims:
            da = da.drop("band")
        return da
    return _mock_surface(fallback_name, shape)


@app.on_event("startup")
def load_rasters() -> None:
    data_dir = Path(__file__).resolve().parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    shape = DEFAULT_SHAPE

    lst = _load_raster(data_dir / "lst.tif", "lst.tif", shape)
    shape = lst.shape

    no2 = _load_raster(data_dir / "no2.tif", "no2.tif", shape)
    pwv = _load_raster(data_dir / "pwv.tif", "pwv.tif", shape)
    pop = _load_raster(data_dir / "pop.tif", "pop.tif", shape)
    vuln = _load_raster(data_dir / "vuln.tif", "vuln.tif", shape)
    parks = _load_raster(data_dir / "parks_existing.tif", "parks_existing.tif", shape)

    app.state.lst = lst
    app.state.no2 = no2
    app.state.pwv = pwv
    app.state.pop = pop
    app.state.vuln = vuln
    app.state.parks = parks.astype(bool)


def _geometry_to_mask(geom: Any, template: xr.DataArray) -> np.ndarray:
    transform = template.rio.transform()
    out_shape = template.shape
    mask = rasterize([(geom, 1)], out_shape=out_shape, transform=transform, fill=0)
    return mask.astype(bool)


def _simulation_payload(result: SimulationResult) -> Dict[str, Any]:
    mean_lst = float(np.nanmean(result.delta_lst))
    min_lst = float(np.nanmin(result.delta_lst))
    mean_no2 = float(np.nanmean(result.delta_no2))
    total_coverage_gain = float(np.nanmean(np.clip(result.coverage_gain, 0.0, 1.0)))

    delta_hcs = float(np.nanmean(result.hcs_after - result.hcs_before))

    return {
        "delta_hcs": delta_hcs,
        "delta_equity": result.mean_equity_delta,
        "marginal_gain": result.marginal_gain,
        "maintenance_penalty": result.maintenance_penalty,
        "overlap_penalty": result.overlap_penalty,
        "coverage_gain": total_coverage_gain,
        "max_cooling": abs(min_lst),
        "mean_cooling": abs(mean_lst),
        "mean_no2_change_pct": -100.0 * mean_no2 / (np.nanmean(app.state.no2.values) + 1e-9),
        "coverage_before_mean": float(np.nanmean(result.coverage_before)),
        "coverage_after_mean": float(np.nanmean(result.coverage_after)),
    }


@app.get("/score")
def score() -> Dict[str, float]:
    lst = app.state.lst.values
    no2 = app.state.no2.values
    pwv = app.state.pwv.values
    vuln = app.state.vuln.values

    hcs = compute_hcs(lst, no2, pwv)
    equity = equity_adjust(hcs, vuln)
    summary = ScoreSummary.from_surfaces(hcs, equity)
    return {"hcs_mean": summary.hcs_mean, "equity_mean": summary.equity_mean}


@app.post("/simulate/park")
def simulate_park_endpoint(req: ParkRequest) -> Dict[str, Any]:
    try:
        geom = shape(req.polygon)
    except Exception as exc:  # pragma: no cover - shapely validation
        raise HTTPException(status_code=400, detail=f"Invalid geometry: {exc}") from exc

    template = app.state.lst
    mask = _geometry_to_mask(geom, template)
    if not mask.any():
        raise HTTPException(status_code=400, detail="Polygon does not intersect the study area")

    result = simulate_park(
        app.state.lst.values,
        app.state.no2.values,
        app.state.pwv.values,
        app.state.pop.values,
        app.state.vuln.values,
        app.state.parks.values,
        mask,
        service_radius=req.service_radius,
        lambda_m=req.lambda_m,
        lambda_o=req.lambda_o,
    )

    if result is None:
        raise HTTPException(status_code=400, detail="Polygon overlaps existing parks only")

    payload = _simulation_payload(result)
    payload["message"] = (
        "Park cools up to "
        f"{payload['max_cooling']:.2f}°C and reduces NO₂ by {payload['mean_no2_change_pct']:.1f}% "
        f"(equity-adjusted ΔHCS: {payload['delta_equity']:.2f})."
    )
    return payload


@app.post("/optimize")
def optimise_endpoint(req: OptimisationRequest) -> Dict[str, Any]:
    result = greedy_search(
        app.state.lst.values,
        app.state.no2.values,
        app.state.pwv.values,
        app.state.pop.values,
        app.state.vuln.values,
        app.state.parks.values,
        candidate_count=req.candidate_count,
        max_iterations=req.max_iterations,
        kernel_size=req.kernel_size,
        lambda_m=req.lambda_m,
        lambda_o=req.lambda_o,
    )
    return result.as_dict()


@app.get("/")
def root() -> Dict[str, Any]:
    return {"message": "Healthy City Score API ready"}
