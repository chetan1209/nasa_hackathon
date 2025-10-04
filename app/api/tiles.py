"""TiTiler integration API endpoints."""
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, List, Any, Optional
from urllib.parse import urlencode
from pathlib import Path

from ..core.config import get_city_config

router = APIRouter()

# TiTiler server configuration
TITILER_BASE_URL = "http://localhost:8080"  # Default TiTiler instance


@router.get("/")
async def get_tile_urls(
    city: str = Query(..., description="City slug"),
    format: str = Query("png", description="Tile format: png, jpg, webp"),
    max_zoom: int = Query(18, description="Maximum zoom level"),
    min_zoom: int = Query(0, description="Minimum zoom level")
):
    """Get TiTiler URLs for city raster layers."""
    
    try:
        city_config = get_city_config(city)
        
        # Check which raster files exist
        available_layers = {}
        raster_files = city_config.rasters
        
        for layer_name, file_path in raster_files.items():
            if Path(file_path).exists():
                available_layers[layer_name] = {
                    "name": layer_name,
                    "file_path": file_path,
                    "tile_urls": _build_tile_urls(layer_name, file_path, format, min_zoom, max_zoom),
                    "metadata_url": f"{TITILER_BASE_URL}/info",
                    "color_map_suggestions": _get_color_maps(layer_name)
                }
        
        if not available_layers:
            raise HTTPException(
                status_code=404,
                detail=f"No raster layers available for city: {city}"
            )
        
        return {
            "city": city_config.name,
            "tile_server": TITILER_BASE_URL,
            "layers": available_layers,
            "zoom_range": {"min": min_zoom, "max": max_zoom},
            "format": format,
            "usage": {
                "url_template": "{tile_url_template}",
                "parameters": "z/x/y?params=...",
                "example": f"{TITILER_BASE_URL}/tilejson.json?url={{file_path}}&bidx=1"
            }
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/layer/{city}/{layer}")
async def get_layer_tile_info(
    city: str,
    layer: str,
    band: int = Query(1, description="Band index (1-based)"),
    colormap: Optional[str] = Query(None, description="Built-in colormap name")
):
    """Get detailed tile information for a specific layer."""
    
    try:
        city_config = get_city_config(city)
        
        if layer not in city_config.rasters:
            raise HTTPException(
                status_code=404,
                detail=f"Layer '{layer}' not found for city: {city}"
            )
        
        file_path = city_config.rasters[layer]
        
        if not Path(file_path).exists():
            raise HTTPException(
                status_code=404,
                detail=f"Data file not found for layer: {layer}"
            )
        
        # Build TiTiler URLs
        base_params = {
            "url": file_path,
            "bidx": band
        }
        
        if colormap:
            base_params["colormap_name"] = colormap
        
        # TileJSON endpoint
        tilejson_params = urlencode(base_params)
        tilejson_url = f"{TITILER_BASE_URL}/tilejson.json?{tilejson_params}"
        
        # Metadata endpoint  
        metadata_url = f"{TITILER_BASE_URL}/info?url={file_path}"
        
        # Statistics endpoint
        stats_params = urlencode(base_params)
        stats_url = f"{TITILER_BASE_URL}/preview?{stats_params}"
        
        # Tile endpoint
        tile_template = f"{TITILER_BASE_URL}/tiles/{{z}}/{{x}}/{{y}}?url={file_path}&bidx={band}"
        if colormap:
            tile_template += f"&colormap_name={colormap}"
        
        layer_info = {
            "layer_name": layer,
            "city": city_config.name,
            "file_path": file_path,
            "band_index": band,
            "colormap": colormap,
            "urls": {
                "tilejson": tilejson_url,
                "metadata": metadata_url,
                "statistics": stats_url,
                "tile_template": tile_template
            },
            "recommended_settings": _get_layer_settings(layer)
        }
        
        return layer_info
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _build_tile_urls(layer_name: str, file_path: str, format: str, 
                    min_zoom: int, max_zoom: int) -> Dict[str, str]:
    """Build TiTiler URLs for a layer."""
    
    base_params = {
        "url": file_path,
        "bidx": 1,  # Single band
        "format": format,
        "resampling": "bilinear"
    }
    
    # TileJSON URL
    params = urlencode(base_params)
    tilejson_url = f"{TITILER_BASE_URL}/tilejson.json?{params}"
    
    # Template URL for individual tiles
    tile_template = f"{TITILER_BASE_URL}/tiles/{{z}}/{{x}}/{{y}}.{format}?"
    tile_template += f"url={file_path}&bidx=1&resampling=bilinear"
    
    # Add colormap if recommended
    colormap = _get_recommended_colormap(layer_name)
    if colormap:
        tile_template += f"&colormap_name={colormap}"
        colormap_params = urlencode({**base_params, "colormap_name": colormap})
        tilejson_url = f"{TITILER_BASE_URL}/tilejson.json?{colormap_params}"
    
    return {
        "tilejson": tilejson_url,
        "tile_template": tile_template,
        "format": format,
        "zoom_range": {"min": min_zoom, "max": max_zoom}
    }


def _get_color_maps(layer_name: str) -> Dict[str, Any]:
    """Get recommended color maps for different layer types."""
    
    colormaps = {
        "ndvi": {
            "recommended": "rdylgr",  # Red-Yellow-Green
            "alternatives": ["viridis", "greens", "spectral"],
            "description": "Vegetation index (green = more vegetation)"
        },
        "lst": {
            "recommended": "thermal", 
            "alternatives": ["hot", "inferno", "plasma"],
            "description": "Temperature (red = hotter)"
        },
        "no2": {
            "recommended": "blues",
            "alternatives": ["viridis", "plasma", "turbo"],
            "description": "Air pollution (darker = higher concentration)"
        }
    }
    
    return colormaps.get(layer_name, {
        "recommended": "viridis",
        "alternatives": ["gray", "jet"],
        "description": "Generic visualization"
    })


def _get_recommended_colormap(layer_name: str) -> Optional[str]:
    """Get the recommended color map name for a layer."""
    colormaps = {
        "ndvi": "rdylgr",
        "lst": "thermal", 
        "no2": "blues"
    }
    return colormaps.get(layer_name)


def _get_layer_settings(layer_name: str) -> Dict[str, Any]:
    """Get recommended rendering settings for a layer."""
    
    settings = {
        "ndvi": {
            "scale_range": [0, 1],
            "no_data_value": 0,
            "color_map": "rdylgr",
            "opacity": 0.8,
            "description": "Normalized Difference Vegetation Index"
        },
        "lst": {
            "scale_range": "auto",  # TiTiler auto-scaling
            "no_data_value": "nan",
            "color_map": "thermal", 
            "opacity": 0.9,
            "description": "Land Surface Temperature in Celsius"
        },
        "no2": {
            "scale_range": "auto",
            "no_data_value": "nan", 
            "color_map": "blues",
            "opacity": 0.85,
            "description": "Nitrogen Dioxide concentration (μg/m³)"
        }
    }
    
    return settings.get(layer_name, {
        "scale_range": "auto",
        "color_map": "viridis",
        "opacity": 0.8,
        "description": "Environmental data layer"
    })


@router.get("/titiler-health")
async def check_titiler_health():
    """Check if TiTiler server is accessible."""
    
    import httpx
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{TITILER_BASE_URL}/health", timeout=5.0)
            
            if response.status_code == 200:
                return {
                    "status": "healthy",
                    "titiler_url": TITILER_BASE_URL,
                    "response": response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
                }
            else:
                return {
                    "status": "unhealthy",
                    "titiler_url": TITILER_BASE_URL,
                    "http_code": response.status_code,
                    "error": "TiTiler server returned non-200 status"
                }
                
    except Exception as e:
        return {
            "status": "unreachable",
            "titiler_url": TITILER_BASE_URL,
            "error": str(e),
            "message": "TiTiler server is not accessible. Please ensure it's running."
        }