"""Score computation API endpoints."""
from fastapi import APIRouter, Query, HTTPException, Depends, Path
from typing import Optional, List, Dict, Any
import json
from pydantic import BaseModel

from ..core.config import get_city_config, CityConfig
from ..core.cities import CityDataLoader
from ..services.metrics import MetricsComputer

router = APIRouter()


class ScoreRequest(BaseModel):
    """Request model for score computation."""
    city_format: Optional[str] = "geojson"  # geojson, table, summary


@router.post("/")
async def compute_scores(
    city: str = Query(..., description="City slug (e.g., 'chicago')"),
    output_format: str = Query("geojson", description="Output format: geojson, table, summary"),
    force_recompute_stats: bool = Query(False, description="Force recomputation of city statistics"),
    response_model=None
):
    """Compute healthy city scores for all tracts in a city."""
    
    try:
        # Get city configuration
        city_config = get_city_config(city)
        
        # Load city data and compute statistics
        loader = CityDataLoader(city_config)
        
        print(f"Computing scores for city: {city}")
        
        # Get city statistics (computed or cached)
        city_stats = await loader.compute_city_stats(force_recompute_stats)
        
        if not city_stats:
            raise HTTPException(status_code=404, detail=f"No valid statistics found for city: {city}")
        
        # Load raster data
        rasters = loader.load_rasters()
        
        required_rasters = ['ndvi', 'lst', 'no2']
        missing_rasters = [name for name in required_rasters if name not in rasters]
        
        if missing_rasters:
            raise HTTPException(
                status_code=404, 
                detail=f"Required raster data missing for city {city}: {missing_rasters}"
            )
        
        # Initialize metrics computer
        metrics_computer = MetricsComputer(city_config, city_stats)
        
        print("Computing baseline scores...")
        
        # Compute baseline scores
        scored_tracts = metrics_computer.compute_baseline_scores(rasters)
        
        if output_format == "summary":
            # Return summary statistics
            summary = {
                "city": city_config.name,
                "tract_count": len(scored_tracts),
                "score_statistics": {
                    "hcs_mean": float(scored_tracts['hcs'].mean()),
                    "hcs_std": float(scored_tracts['hcs'].std()),
                    "hcs_min": float(scored_tracts['hcs'].min()),
                    "hcs_max": float(scored_tracts['hcs'].max()),
                    "heat_index_mean": float(scored_tracts['heat_index'].mean()),
                    "air_risk_mean": float(scored_tracts['air_risk_index'].mean()),
                    "green_access_mean": float(scored_tracts['green_access_index'].mean()),
                    "healthcare_access_mean": float(scored_tracts['healthcare_index'].mean())
                },
                "data_source_info": {
                    "used_rasters": list(rasters.keys()),
                    "computed_city_stats": list(city_stats.keys())
                }
            }
            
            return summary
        
        elif output_format == "table":
            # Return as simple table (no geometry)
            table_data = scored_tracts.drop(columns=['geometry']).to_dict(orient='records')
            
            return {
                "city": city_config.name,
                "tract_count": len(table_data),
                "data": table_data
            }
        
        else:  # Default to GeoJSON
            # Convert to GeoJSON
            scored_tracts_gdf = scored_tracts.copy()
            
            # Ensure CRS is set properly
            if scored_tracts_gdf.crs is None:
                scored_tracts_gdf.set_crs('EPSG:4326', inplace=True)
            
            # Convert to GeoJSON format
            geojson_output = json.loads(scored_tracts_gdf.to_json())
            
            # Add metadata
            geojson_output['metadata'] = {
                "city": city_config.name,
                "tract_count": len(scored_tracts_gdf),
                "score_statistics": {
                    "hcs_mean": float(scored_tracts_gdf['hcs'].mean()),
                    "hcs_std": float(scored_tracts_gdf['hcs'].std()),
                    "hcs_min": float(scored_tracts_gdf['hcs'].min()),
                    "hcs_max": float(scored_tracts_gdf['hcs'].max())
                },
                "computed_at": "2024-01-01T00:00:00Z",  # TODO: Add actual timestamp
                "data_sources": list(rasters.keys())
            }
            
            return geojson_output
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"City data not found: {city}")
    except Exception as e:
        print(f"Error computing scores: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/statistics")
async def get_city_statistics(
    city: str = Query(..., description="City slug (e.g., 'chicago')"),
    force_recompute: bool = Query(False, description="Force recomputation of statistics")
):
    """Get city-wide statistics used for normalization."""
    
    try:
        city_config = get_city_config(city)
        loader = CityDataLoader(city_config)
        
        city_stats = await loader.compute_city_stats(force_recompute)
        
        return {
            "city": city_config.name,
            "statistics": city_stats,
            "computed_at": "2024-01-01T00:00:00Z"  # TODO: Add actual timestamp
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tract/{tract_id}")
async def get_tract_score(
    city: str = Query(..., description="City slug"),
    tract_id: str = Path(..., description="Tract ID"),
    response_model=None
):
    """Get health score for a specific tract."""
    
    try:
        city_config = get_city_config(city)
        loader = CityDataLoader(city_config)
        city_stats = await loader.compute_city_stats()
        
        # Load data and compute scores for all tracts
        rasters = loader.load_rasters()
        metrics_computer = MetricsComputer(city_config, city_stats)
        scored_tracts = metrics_computer.compute_baseline_scores(rasters)
        
        # Find the specific tract
        tract_data = scored_tracts[scored_tracts['tract_id'] == tract_id]
        
        if tract_data.empty:
            raise HTTPException(status_code=404, detail=f"Tract {tract_id} not found in city {city}")
        
        tract = tract_data.iloc[0]
        
        # Return tract-specific data
        return {
            "tract_id": tract_id,
            "city": city_config.name,
            "health_city_score": float(tract['hcs']),
            "heat_index": float(tract['heat_index']),
            "air_risk_index": float(tract['air_risk_index']),
            "green_access_index": float(tract['green_access_index']),
            "healthcare_access_index": float(tract['healthcare_index']),
            "geometry": json.loads(tract.geometry.to_json())
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
