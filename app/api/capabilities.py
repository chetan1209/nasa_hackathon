"""City capabilities API endpoints."""
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, List, Any
import json

from ..core.config import get_city_config, list_available_cities

router = APIRouter()


@router.get("/")
async def get_city_capabilities(
    city: str = Query(..., description="City slug (e.g., 'chicago')")
):
    """Get available data layers and capabilities for a city."""
    
    try:
        city_config = get_city_config(city)
        
        # Validate city data files
        from ..core.cities import validate_city_data
        validation_report = validate_city_data(city)
        
        # Get available layers
        from pathlib import Path
        
        capabilities = {
            "city": {
                "slug": city_config.city_slug,
                "name": city_config.name,
                "bounds": city_config.bounds,
                "projections": city_config.projections
            },
            "data_layers": {
                "rasters": {},
                "vectors": {}
            },
            "computation_status": validation_report,
            "available_endpoints": {
                "score": f"/score?city={city}&format=geojson",
                "simulate": "/simulate",
                "tiles": f"/tiles?city={city}"
            }
        }
        
        # Check available raster layers
        raster_files = city_config.rasters
        for raster_name, file_path in raster_files.items():
            file_exists = Path(file_path).exists()
            
            capabilities["data_layers"]["rasters"][raster_name] = {
                "file_path": file_path,
                "available": file_exists,
                "description": {
                    "ndvi": "Normalized Difference Vegetation Index (greenness)",
                    "lst": "Land Surface Temperature (°C)",
                    "no2": "Nitrogen Dioxide concentration (air quality)"
                }.get(raster_name, f"{raster_name} raster data")
            }
        
        # Check available vector layers  
        vector_files = city_config.vectors
        for vector_name, file_path in vector_files.items():
            file_exists = Path(file_path).exists()
            
            capabilities["data_layers"]["vectors"][vector_name] = {
                "file_path": file_path,
                "available": file_exists,
                "description": {
                    "tracts": "Census tracts for score computation",
                    "clinics": "Healthcare clinic locations",
                    "parks": "Park and green space polygons"
                }.get(vector_name, f"{vector_name} vector data")
            }
        
        # Add statistics status
        stats_file = city_config.city_path / "city_stats.json"
        capabilities["statistics"] = {
            "computed": stats_file.exists(),
            "statistics_file": str(stats_file),
            "required_for_scoring": True
        }
        
        return capabilities
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_cities():
    """List all available cities."""
    
    try:
        available_cities = list_available_cities()
        
        # Get basic info for each city
        city_info = []
        for city_slug in available_cities:
            try:
                city_config = get_city_config(city_slug)
                
                # Check data availability
                from ..core.cities import validate_city_data
                validation_report = validate_city_data(city_slug)
                
                city_info.append({
                    "slug": city_slug,
                    "name": city_config.name,
                    "data_valid": validation_report["valid"],
                    "available_rasters": validation_report["available_rasters"],
                    "available_vectors": validation_report["available_vectors"],
                    "missing_files": validation_report["missing_files"]
                })
                
            except Exception as e:
                city_info.append({
                    "slug": city_slug,
                    "name": city_slug.title(),
                    "data_valid": False,
                    "error": str(e)
                })
        
        return {
            "available_cities": city_info,
            "total_cities": len(available_cities)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/layers/{city}")
async def get_layer_info(
    city: str,
    layer_type: str = Query(None, description="Filter by layer type: raster, vector, all"),
    layer_name: str = Query(None, description="Specific layer name")
):
    """Get detailed information about specific layers."""
    
    try:
        city_config = get_city_config(city)
        
        layer_info = {}
        
        # Get raster layers
        if layer_type in [None, "all", "raster"]:
            raster_files = city_config.rasters
            for name, file_path in raster_files.items():
                if layer_name and layer_name != name:
                    continue
                
                layer_info[name] = {
                    "type": "raster",
                    "file_path": file_path,
                    "available": Path(file_path).exists(),
                    "format": "COG",  # Cloud Optimized GeoTIFF
                    "band_count": 1,  # Assume single band
                    "data_type": "float32",
                    "description": self._get_raster_description(name),
                    "use_case": "Health scoring computation"
                }
        
        # Get vector layers
        if layer_type in [None, "all", "vector"]:
            vector_files = city_config.vectors
            for name, file_path in vector_files.items():
                if layer_name and layer_name != name:
                    continue
                
                layer_info[name] = {
                    "type": "vector", 
                    "file_path": file_path,
                    "available": Path(file_path).exists(),
                    "format": "GeoJSON",
                    "description": self._get_vector_description(name),
                    "use_case": "Geographic analysis and overlay"
                }
        
        if not layer_info:
            raise HTTPException(
                status_code=404, 
                detail=f"Layer '{layer_name}' of type '{layer_type}' not found"
            )
        
        return {
            "city": city_config.name,
            "layers": layer_info,
            "filter_applied": {
                "type": layer_type,
                "name": layer_name
            }
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/bounds/{city}")
async def get_city_bounds(city: str):
    """Get geographic bounds for a city."""
    
    try:
        city_config = get_city_config(city)
        
        return {
            "city": city_config.name,
            "bounds": city_config.bounds,
            "projections": {
                "geographic": city_config.geographic_crs,
                "web_mercator": city_config.web_mercator_crs
            }
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _get_raster_description(name: str) -> str:
    """Get human-readable description for raster layers."""
    descriptions = {
        "ndvi": "Normalized Difference Vegetation Index - measures greenness and vegetation health (0-1 scale)",
        "lst": "Land Surface Temperature - thermal data in Celsius degrees",
        "no2": "Nitrogen Dioxide concentration - air quality indicator (micrograms per cubic meter)",
        "albedo": "Surface albedo - reflectivity of earth surface (0-1 scale)",
        "precipitation": "Precipitation data (millimeters)"
    }
    return descriptions.get(name, f"{name} satellite-derived environmental data")


def _get_vector_description(name: str) -> str:
    """Get human-readable description for vector layers."""
    descriptions = {
        "tracts": "Census tracts - administrative boundaries for population and demographic analysis",
        "clinics": "Healthcare facility locations - hospitals, clinics, and medical centers",
        'parks': "Park and green space polygons - recreational and natural areas",
        "schools": "Educational facility locations",
        "transit": "Public transit stops and routes",
        "roads": "Road network and street centerlines"
    }
    return descriptions.get(name, f"{name} geographic vector data")
