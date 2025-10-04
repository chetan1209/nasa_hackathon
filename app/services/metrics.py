"""Core metrics computation including zonal statistics and scoring algorithms."""
from typing import Dict, List, Any, Tuple, Optional
import numpy as np
import geopandas as gpd
from shapely.geometry import Point, Polygon, LineString
import rioxarray as rio
import xarray as xr
import pandas as pd
import pyproj
from .gravity import compute_gravity_scores


class MetricsComputer:
    """Computes health scores and zonal statistics for urban areas."""
    
    def __init__(self, city_config, city_stats: Dict[str, Any]):
        self.config = city_config
        self.city_stats = city_stats
        self.tracts_gdf = None
        self.clinics_gdf = None
    
    def load_required_data(self):
        """Load necessary vector data for computations."""
        from ..core.cities import CityDataLoader
        
        loader = CityDataLoader(self.config)
        
        vectors = loader.load_vectors()
        self.tracts_gdf = vectors.get('tracts')
        self.clinics_gdf = vectors.get('clinics')
        
        if self.tracts_gdf is None:
            raise ValueError("Tracts data is required but not available")
    
    def normalize_to_zscore(self, values: np.ndarray, raster_name: str) -> np.ndarray:
        """Normalize values to z-scores using city-wide statistics."""
        if raster_name not in self.city_stats:
            # Return zeros if no stats available
            return np.zeros_like(values)
        
        stats = self.city_stats[raster_name]
        mean = stats['mean']
        std = stats['std']
        
        if std == 0:
            return np.zeros_like(values)
        
        return (values - mean) / std
    
    def compute_indices(self, ndvi_mean: float, lst_mean: float, 
                       no2_mean: float, gravity_score: float = 0.0) -> Dict[str, float]:
        """Compute health indices using normalized values."""
        
        ndvi_z = self.normalize_to_zscore(np.array([ndvi_mean]), 'ndvi')[0]
        lst_z = self.normalize_to_zscore(np.array([lst_mean]), 'lst')[0]
        no2_z = self.normalize_to_zscore(np.array([no2_mean]), 'no2')[0]
        gravity_z = self.normalize_to_zscore(np.array([gravity_score]), 'gravity')[0]
        
        # Compute sub-indices
        heat_index = lst_z - 0.7 * ndvi_z  # Higher is worse
        air_risk = no2_z  # Higher is worse
        green_access = ndvi_z  # Higher is better
        healthcare_access = gravity_z  # Higher is better
        
        indices = {
            'heat_index': heat_index,
            'air_risk': air_risk,
            'green_access': green_access,
            'healthcare_access': healthcare_access
        }
        
        return indices
    
    def compute_hcs(self, indices: Dict[str, float], vulnerability_factor: float = 0.0) -> Dict[str, float]:
        """Compute Healthy City Score and equity-adjusted score."""
        
        # Base Healthy City Score
        base_hcs = (
            100 
            - (0.35 * indices['heat_index'] + 0.25 * indices['air_risk'])
            + (0.25 * indices['green_access'] + 0.15 * indices['healthcare_access'])
        )
        
        # Equity-adjusted score (reduced by vulnerability)
        equity_adjusted_hcs = base_hcs * (1 - 0.4 * vulnerability_factor)
        
        return {
            'hcs': base_hcs,
            'hcs_equity': equity_adjusted_hcs
        }
    
    def compute_zonal_stats(self, raster: xr.DataArray, 
                          tracts_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
        """Compute zonal statistics for rasters clipped to tract polygons."""
        
        zonal_data = []
        
        for idx, tract in tracts_gdf.iterrows():
            tract_data = {
                'tract_id': tract.get('tract_id', idx),
                'geometry': tract.geometry
            }
            
            try:
                # Clip raster to tract polygon
                clipped = raster.rio.clip([tract.geometry], crs=tracts_gdf.crs, drop=True)
                
                if clipped.size > 0:
                    values = clipped.values.flatten()
                    values = values[~np.isnan(values)]
                    
                    if len(values) > 0:
                        tract_data.update({
                            'mean': float(np.mean(values)),
                            'std': float(np.std(values)),
                            'min': float(np.min(values)),
                            'max': float(np.max(values)),
                            'count': int(len(values))
                        })
                    else:
                        tract_data.update({
                            'mean': np.nan,
                            'std': np.nan,
                            'min': np.nan,
                            'max': np.nan,
                            'count': 0
                        })
                else:
                    tract_data.update({
                        'mean': np.nan,
                        'std': np.nan,
                        'min': np.nan,
                        'max': np.nan,
                        'count': 0
                    })
                    
            except Exception as e:
                print(f"Error processing tract {tract_data['tract_id']}: {e}")
                tract_data.update({
                    'mean': np.nan,
                    'std': np.nan,
                    'min': np.nan,
                    'max': np.nan,
                    'count': 0
                })
            
            zonal_data.append(tract_data)
        
        return pd.DataFrame(zonal_data)
    
    def compute_baseline_scores(self, rasters: Dict[str, xr.DataArray]) -> gpd.GeoDataFrame:
        """Compute baseline health scores for all tracts."""
        
        if self.tracts_gdf is None:
            self.load_required_data()
        
        tracts = self.tracts_gdf.copy()
        
        # Compute zonal statistics for each raster
        raster_property_map = {
            'ndvi': 'greenness_mean',
            'lst': 'temp_mean', 
            'no2': 'pollution_mean'
        }
        
        for raster_name, raster in rasters.items():
            if raster_name in raster_property_map:
                print(f"Computing zonal stats for {raster_name}...")
                zonal_stats = self.compute_zonal_stats(raster, tracts)
                
                # Merge zonal stats back to tracts
                property_name = raster_property_map[raster_name]
                tracts = tracts.merge(
                    zonal_stats[['tract_id', 'mean']].rename(columns={'mean': property_name}),
                    on='tract_id',
                    how='left'
                )
        
        # Compute gravity scores for healthcare access
        if self.clinics_gdf is not None:
            tracts['gravity_score'] = compute_gravity_scores(tracts, self.clinics_gdf)
        else:
            tracts['gravity_score'] = 0.0
        
        # Compute health scores for each tract
        tracts['indices'] = tracts.apply(
            lambda row: self.compute_indices(
                row.get('greenness_mean', 0),
                row.get('temp_mean', 0),
                row.get('pollution_mean', 0),
                row.get('gravity_score', 0)
            ), axis=1
        )
        
        # Compute HCS scores
        tracts['hcs'] = tracts.apply(
            lambda row: self.compute_hcs(
                row['indices'],
                row.get('vulnerability_factor', 0.0)
            )['hcs_equity'], axis=1
        )
        
        # Compute sub-indices
        tracts['heat_index'] = tracts['indices'].apply(lambda x: x['heat_index'])
        tracts['air_risk_index'] = tracts['indices'].apply(lambda x: x['air_risk'])
        tracts['green_access_index'] = tracts['indices'].apply(lambda x: x['green_access'])
        tracts['healthcare_index'] = tracts['indices'].apply(lambda x: x['healthcare_access'])
        
        # Clean up indices column
        tracts = tracts.drop(columns=['indices'])
        
        return tracts
    
    def compute_delta_scores(self, original_scores: gpd.GeoDataFrame,
                           raster_deltas: Dict[str, float],
                           affected_tracts: gpd.GeoDataFrame) -> Dict[str, pd.DataFrame]:
        """Compute score changes for affected tracts given raster deltas."""
        
        # Create modified datasets
        modified_scores = affected_tracts.copy()
        
        # Apply raster deltas
        delta_mapping = {
            'ndvi': 'greenness_mean',
            'lst': 'temp_mean',
            'no2': 'pollution_mean'
        }
        
        for raster_name, delta in raster_deltas.items():
            if raster_name in delta_mapping:
                property_name = delta_mapping[raster_name]
                if property_name in modified_scores.columns:
                    modified_scores[property_name] += delta
        
        # Recompute indices and scores for affected tracts
        modified_scores['indices'] = modified_scores.apply(
            lambda row: self.compute_indices(
                row.get('greenness_mean', 0),
                row.get('temp_mean', 0),
                row.get('pollution_mean', 0),
                row.get('gravity_score', 0)
            ), axis=1
        )
        
        modified_scores['hcs'] = modified_scores.apply(
            lambda row: self.compute_hcs(
                row['indices'],
                row.get('vulnerability_factor', 0.0)
            )['hcs_equity'], axis=1
        )
        
        # Drop indices column
        modified_scores = modified_scores.drop(columns=['indices'])
        
        # Compute deltas
        original_subset = original_scores[original_scores['tract_id'].isin(modified_scores['tract_id'])]
        
        delta_summary = pd.DataFrame({
            'tract_id': modified_scores['tract_id'],
            'hcs_before': original_subset['hcs'].values,
            'hcs_after': modified_scores['hcs'].values,
            'hcs_delta': modified_scores['hcs'].values - original_subset['hcs'].values,
            'geometry': modified_scores['geometry']
        })
        
        return {
            'original': original_subset,
            'modified': modified_scores,
            'delta': delta_summary
        }
