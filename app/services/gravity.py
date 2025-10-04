"""Gravity model implementation for healthcare access scoring."""
from typing import List, Dict, Any
import geopandas as gpd
import pandas as pd
import numpy as np
from shapely.geometry import Point
from scipy.spatial.distance import cdist
import pyproj
from functools import lru_cache


def compute_distance_matrix(points1: gpd.GeoSeries, points2: gpd.GeoSeries, 
                          crs: str = 'EPSG:4326') -> np.ndarray:
    """Compute distance matrix between two sets of geographic points."""
    
    if len(points1) == 0 or len(points2) == 0:
        return np.array([]).reshape(len(points1), len(points2))
    
    # Convert to projected CRS for accurate distances (UTM or similar)
    # This is a simplified implementation - in production, you'd use the appropriate UTM zone
    
    # Create transformer from WGS84 to Web Mercator (good enough for city-scale distances)
    transformer = pyproj.Transformer.from_crs(
        crs_from=pyproj.CRS(crs), 
        crs_to=pyproj.CRS('EPSG:3857'),  # Web Mercator
        always_xy=True
    )
    
    # Convert geometries to coordinate arrays
    coords1 = np.array([
        transformer.transform(geom.x, geom.y) 
        for geom in points1.geometry
    ])
    
    coords2 = np.array([
        transformer.transform(geom.x, geom.y) 
        for geom in points2.geometry
    ])
    
    # Compute Euclidean distance matrix (in meters)
    distance_matrix = cdist(coords1, coords2, 'euclidean')
    
    return distance_matrix


@lru_cache(maxsize=128)
def gravity_function(distance: float, facility_capacity: int = 1000, 
                    decay_factor: float = 0.001) -> float:
    """Compute gravity attraction value for a distance-capacity pair."""
    if distance <= 0:
        return float('inf')
    
    # Gravity function: capacity / (1 + decay_factor * distance^2)
    attraction = facility_capacity / (1 + decay_factor * (distance ** 2))
    
    # Cap at reasonable maximum to avoid numerical issues
    return min(attraction, 1e6)


def compute_gravity_scores(tracts_gdf: gpd.GeoDataFrame, 
                         clinics_gdf: gpd.GeoDataFrame,
                         distance_threshold: float = 5000) -> List[float]:
    """Compute gravity-based healthcare access scores for all tracts."""
    
    if clinics_gdf.empty:
        # No clinics data - return zero scores
        return [0.0] * len(tracts_gdf)
    
    # Convert tract geometries to centroids
    tract_centroids = tracts_gdf.geometry.centroid
    clinic_locations = clinics_gdf.geometry
    
    # Compute distance matrix (tracts x clinics)
    distances = compute_distance_matrix(
        gpd.GeoSeries(tract_centroids, crs=tracts_gdf.crs),
        gpd.GeoSeries(clinic_locations, crs=clinics_gdf.crs)
    )
    
    # Get clinic capacities (assume standardized capacity if not provided)
    clinic_capacites = clinics_gdf.get('capacity', np.full(len(clinics_gdf), 1000))
    
    gravity_scores = []
    
    for i, tract_distances in enumerate(distances):
        total_gravity = 0.0
        
        # Consider clinics within distance threshold
        nearby_mask = tract_distances <= distance_threshold
        
        for j, (distance, clinic_capacity) in enumerate(
            zip(tract_distances[nearby_mask], clinic_capacites[nearby_mask])
        ):
            if distance > 0:  # Skip tracts at clinic locations
                gravity = gravity_function(distance, int(clinic_capacity))
                total_gravity += gravity
        
        gravity_scores.append(total_gravity)
    
    return gravity_scores


def compute_tract_to_facility_access(tract_centroid: Point, 
                                   facilities_gdf: gpd.GeoDataFrame,
                                   crs: str = 'EPSG:4326') -> Dict[str, Any]:
    """Compute access metrics from a single tract to all facilities."""
    
    # Get distances to all facilities
    tract_series = gpd.GeoSeries([tract_centroid], crs=crs)
    facility_series = gpd.GeoSeries(facilities_gdf.geometry, crs=crs)
    
    distances = compute_distance_matrix(tract_series, facility_series, crs)[0]
    
    # Find nearest facility
    if len(distances) > 0:
        nearest_idx = np.argmin(distances)
        nearest_distance = distances[nearest_idx]
        nearest_facility = facilities_gdf.iloc[nearest_idx]
    else:
        nearest_idx = None
        nearest_distance = float('inf')
        nearest_facility = None
    
    # Count facilities within various distance bands
    access_bands = {
        '500m': np.sum(distances <= 500),
        '1km': np.sum(distances <= 1000),
        '2km': np.sum(distances <= 2000),
        '5km': np.sum(distances <= 5000),
        '10km': np.sum(distances <= 10000)
    }
    
    return {
        'nearest_distance': nearest_distance,
        'nearest_facility': nearest_facility.to_dict() if nearest_facility is not None else None,
        'access_bands': access_bands,
        'total_facilities': len(facilities_gdf),
        'all_distances': distances.tolist()
    }


def simulate_new_clinic(tracts_gdf: gpd.GeoDataFrame,
                       existing_clinics_gdf: gpd.GeoDataFrame,
                       new_clinic_location: Point,
                       new_clinic_capacity: int = 1000) -> Dict[str, List[float]]:
    """Simulate the effect of adding a new clinic on tract gravity scores."""
    
    # Compute current scores
    current_o1_scores = compute_gravity_scores(tracts_gdf, existing_clinics_gdf)
    
    # Add new clinic to existing clinics
    new_clinic_gdf = gpd.GeoDataFrame({
        'geometry': [new_clinic_location],
        'capacity': [new_clinic_capacity],
        'facility_type': ['healthcare_clinic']
    }, crs=existing_clinics_gdf.crs)
    
    updated_clinics_gdf = gpd.GeoDataFrame(
        pd.concat([existing_clinics_gdf, new_clinic_gdf], ignore_index=True),
        crs=existing_clinics_gdf.crs
    )
    
    # Compute updated scores
    updated_gravity_scores = compute_gravity_scores(tracts_gdf, updated_clinics_gdf)
    
    # Compute deltas
    gravity_deltas = [
        new_score - old_score 
        for new_score, old_score in zip(updated_gravity_scores, current_o1_scores)
    ]
    
    return {
        'current_scores': current_o1_scores,
        'updated_scores': updated_gravity_scores,
        'score_deltas': gravity_deltas
    }
