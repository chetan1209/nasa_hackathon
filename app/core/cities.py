"""City data loading and validation utilities."""
from pathlib import Path
from typing import Dict, List, Any, Optional
import geopandas as gpd
import rioxarray as rio
import xarray as xr
import json
import numpy as np
from .config import CityConfig


class CityDataLoader:
    """Loads and validates city raster and vector data."""
    
    def __init__(self, city_config: CityConfig):
        self.config = city_config
        self.city_slug = city_config.city_slug
        self.stats_file = city_config.city_path / "city_stats.json"
        
    def load_rasters(self) -> Dict[str, xr.DataArray]:
        """Load all raster data for the city."""
        rasters = {}
        available_rasters = self.config.rasters
        
        for name, file_path in available_rasters.items():
            try:
                if Path(file_path).exists():
                    rasters[name] = rio.open_rasterio(file_path)
                else:
                    print(f"Warning: Raster file not found: {file_path}")
            except Exception as e:
                print(f"Error loading raster {name}: {e}")
        
        return rasters
    
    def load_vectors(self) -> Dict[str, gpd.GeoDataFrame]:
        """Load all vector data for the city."""
        vectors = {}
        available_vectors = self.config.vectors
        
        for name, file_path in available_vectors.items():
            try:
                if Path(file_path).exists():
                    vectors[name] = gpd.read_file(file_path)
                else:
                    print(f"Warning: Vector file not found: {file_path}")
            except Exception as e:
                print(f"Error loading vector {name}: {e}")
        
        return vectors
    
    def get_tracts_gdf(self) -> gpd.GeoDataFrame:
        """Get census tracts as GeoDataFrame."""
        vectors = self.load_vectors()
        if 'tracts' not in vectors:
            raise ValueError(f"No tracts data found for city: {self.city_slug}")
        return vectors['tracts']
    
    def get_clinics_gdf(self) -> Optional[gpd.GeoDataFrame]:
        """Get clinics as GeoDataFrame."""
        vectors = self.load_vectors()
        return vectors.get('clinics')
    
    def get_parks_gdf(self) -> Optional[gpd.GeoDataFrame]:
        """Get parks as GeoDataFrame."""
        vectors = self.load_vectors()
        return vectors.get('parks')
    
    async def compute_city_stats(self, force_recompute: bool = False) -> Dict[str, Any]:
        """Compute and cache city-wide statistics for normalization."""
        
        # Load existing stats if available and not forcing recomputation
        if self.stats_file.exists() and not force_recompute:
            try:
                with open(self.stats_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading cached stats: {e}")
        
        print("Computing city-wide statistics...")
        
        # Load raster data
        rasters = self.load_rasters()
        if not rasters:
            raise ValueError("No raster data available for statistics computation")
        
        stats = {}
        
        # Compute statistics for each raster
        for name, raster in rasters.items():
            try:
                            # Convert to numeric values, handling coordinate array structure
                if raster.ndim > 2:
                    values = raster.values.reshape(-1)
                else:
                    values = raster.values.flatten()
                # Flatten and remove NaN values
                values = values[~np.isnan(values)]
                
                if len(values) > 0:
                    stats[name] = {
                        'mean': float(np.mean(values)),
                        'std': float(np.std(values)),
                        'min': float(np.min(values)),
                        'max': float(np.max(values)),
                        'count': int(len(values))
                    }
                else:
                    print(f"Warning: No valid data found for raster: {name}")
            
            except Exception as e:
                print(f"Error computing stats for {name}: {e}")
        
        # Compute gravity model statistics for healthcare access
        clinics_gdf = self.get_clinics_gdf()
        if clinics_gdf is not None:
            try:
                gravity_stats = self._compute_gravity_stats(clinics_gdf)
                stats['gravity'] = gravity_stats
            except Exception as e:
                print(f"Error computing gravity stats: {e}")
        
        # Save stats to cache
        try:
            with open(self.stats_file, 'w') as f:
                json.dump(stats, f, indent=2)
        except Exception as e:
            print(f"Error saving stats cache: {e}")
        
        return stats
    
    def _compute_gravity_stats(self, clinics_gdf: gpd.GeoDataFrame) -> Dict[str, float]:
        """Compute gravity model statistics."""
        # This is a simplified implementation - gravity model would be implemented
        # in services/gravity.py with proper distance calculations
        
        # For now, return placeholder values based on clinic density
        tracts_gdf = self.get_tracts_gdf()
        
        # Simple clinic count per tract as proxy for gravity score
        clinic_counts = []
        
        for _, tract in tracts_gdf.iterrows():
            tract_geom = tract.geometry
            count = sum(
                1 for _, clinic in clinics_gdf.iterrows()
                if tract_geom.contains(clinic.geometry)
            )
            clinic_counts.append(count)
        
        clinic_counts = np.array(clinic_counts)
        clinic_counts = clinic_counts[~np.isnan(clinic_counts)]
        
        return {
            'mean': float(np.mean(clinic_counts)),
            'std': float(np.std(clinic_counts)),
            'min': float(np.min(clinic_counts)),
            'max': float(np.max(clinic_counts))
        }


def validate_city_data(city_slug: str) -> Dict[str, Any]:
    """Validate that all required city data files exist."""
    config = CityConfig(city_slug)
    validation_report = {
        'city_slug': city_slug,
        'city_name': config.name,
        'valid': True,
        'missing_files': [],
        'available_rasters': [],
        'available_vectors': []
    }
    
    # Check raster files
    for name, file_path in config.rasters.items():
        if Path(file_path).exists():
            validation_report['available_rasters'].append(name)
        else:
            validation_report['missing_files'].append(file_path)
            validation_report['valid'] = False
    
    # Check vector files
    for name, file_path in config.vectors.items():
        if Path(file_path).exists():
            validation_report['available_vectors'].append(name)
        else:
            validation_report['missing_files'].append(file_path)
            # Only invalidate if tracts are missing (critical)
            if name == 'tracts':
                validation_report['valid'] = False
    
    return validation_report
