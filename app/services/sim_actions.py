"""Simulation action definitions and parametric effects."""
from typing import Dict, Any, List, Optional
import geopandas as gpd
import numpy as np
from shapely.geometry import Point, Polygon, LineString
from shapely.ops import unary_union
import geopy.distance


# Action parameter definitions
ACTIONS = {
    "add_park": {
        "description": "Add a new park or green space",
        "parameters": {
            "ndvi_delta": 0.08,  # Increase NDVI (greenness)
            "lst_factor": -0.6,  # LST decrease factor
            "no2_delta": 0.0,    # No direct effect on air quality
            "healthcare_delta": 0.0  # No effect on healthcare access
        },
        "input_geometry_required": True,
        "default_geometry_type": "Polygon"
    },
    
    "add_trees": {
        "description": "Plant trees along streets or in areas",
        "parameters": {
            "ndvi_delta": 0.04,  # Moderate increase in greenness
            "lst_factor": -0.3,  # Smaller temperature reduction
            "no2_delta": -0.05,  # Small improvement in air quality
            "healthcare_delta": 0.0
        },
        "input_geometry_required": True,
        "default_geometry_type": "LineString"  # Street trees
    },
    
    "cool_roof": {
        "description": "Install cool roof technology",
        "parameters": {
            "ndvi_delta": 0.0,   # No vegetation change
            "lst_delta": -0.8,   # Direct temperature reduction (°C)
            "no2_delta": 0.0,    # No air quality effect
            "healthcare_delta": 0.0
        },
        "input_geometry_required": True,
        "default_geometry_type": "Polygon"
    },
    
    "add_clinic": {
        "description": "Add a new healthcare clinic",
        "parameters": {
            "ndvi_delta": 0.0,     # No environmental change
            "lst_delta": 0.0,      # No temperature effect
            "no2_delta": 0.0,      # No air quality change
            "healthcare_delta": "gravity_recompute"  # Special handling
        },
        "input_geometry_required": True,
        "default_geometry_type": "Point",
        "additional_params": {
            "capacity": 1000,
            "facility_type": "healthcare_clinic"
        }
    },
    
    "ev_zone": {
        "description": "Establish electric vehicle only zone",
        "parameters": {
            "ndvi_delta": 0.0,   # No vegetation change
            "lst_delta": 0.0,    # No temperature effect
            "no2_z_delta": -0.3, # Z-score reduction in NO2
            "healthcare_delta": 0.0
        },
        "input_geometry_required": True,
        "default_geometry_type": "Polygon"
    },
    
    "green_infrastructure": {
        "description": "Install rain gardens, bioswales, etc.",
        "parameters": {
            "ndvi_delta": 0.03,  # Small increase in vegetation
            "lst_factor": -0.2,  # Moderate cooling
            "no2_delta": -0.02,  # Small air quality improvement
            "healthcare_delta": 0.0
        },
        "input_geometry_required": True,
        "default_geometry_type": "Polygon"
    }
}


class ActionApplicator:
    """Applies simulation actions and computes their effects."""
    
    def __init__(self, city_config, city_stats: Dict[str, Any]):
        self.config = city_config
        self.city_stats = city_stats
        self.action_definitions = ACTIONS
    
    def validate_action(self, action_type: str, geometry=None, **kwargs) -> Dict[str, Any]:
        """Validate an action request and check parameters."""
        
        if action_type not in self.action_definitions:
            raise ValueError(f"Unknown action type: {action_type}")
        
        action_def = self.action_definitions[action_type]
        
        validation = {
            'valid': True,
            'errors': [],
            'warnings': []
        }
        
        # Check if geometry is required
        if action_def.get('input_geometry_required', True) and geometry is None:
            validation['valid'] = False
            validation['errors'].append(f"{action_type} requires input geometry")
        
        # Validate geometry type
        if geometry is not None:
            expected_type = action_def.get('default_geometry_type', 'Polygon')
            geom_type = geometry.geometry.geom_type if hasattr(geometry, 'geometry') else type(geometry).__name__
            
            if expected_type != 'Any' and expected_type not in geom_type:
                validation['warnings'].append(
                    f"Expected {expected_type} geometry, got {geom_type}"
                )
        
        return validation
    
    def apply_action(self, action_type: str, geometry, 
                   affected_tracts_gdf: gpd.GeoDataFrame,
                   **kwargs) -> Dict[str, Any]:
        """Apply a simulation action and return the effects."""
        
        if action_type not in self.action_definitions:
            raise ValueError(f"Unknown action type: {action_type}")
        
        action_def = self.action_definitions[action_type]
        params = action_def['parameters'].copy()
        
        # Create geometry GeoDataFrame if it's a shapely geometry
        if hasattr(geometry, '__geo_interface__') or hasattr(geometry, 'geom_type'):
            gdf = gpd.GeoDataFrame({'geometry': [geometry]})
        else:
            gdf = geometry
        
        # Apply parameter modifications based on action type
        raster_deltas = {}
        
        # Handle normal raster deltas
        for param_name, delta_value in params.items():
            if param_name.endswith('_delta') and isinstance(delta_value, (int, float)):
                raster_name = param_name.replace('_delta', '')
                raster_deltas[raster_name] = delta_value
        
        # Handle LST factor-based deltas
        if 'lst_factor' in params:
            lst_factor = params['lst_factor']
            ndvi_delta = params.get('ndvi_delta', 0)
            
            # LST change based on NDVI change: ΔLST ≈ lst_factor * (ΔNDVI/0.1) * std_dev_LST
            lst_stats = self.city_stats.get('lst', {})
            lst_std = lst_stats.get('std', 1.0)
            
            lst_change = lst_factor * (ndvi_delta / 0.1) * lst_std
            
            # If there's also a direct LST delta, add it
            direct_lst_delta = params.get('lst_delta', 0)
            raster_deltas['lst'] = lst_change + direct_lst_delta
        
        # Handle z-score deltas (standardized reductions)
        if 'no2_z_delta' in params:
            no2_stats = self.city_stats.get('no2', {})
            no2_std = no2_stats.get('std', 1.0)
            raster_deltas['no2'] = params['no2_z_delta'] * no2_std
        
        # Special handling for healthcare actions
        healthcare_delta = params.get('healthcare_delta', 0)
        if healthcare_delta == "gravity_recompute":
            # This will be handled separately by the gravity model
            healthcare_delta = kwargs.get('capacity', action_def.get('additional_params', {}).get('capacity', 1000))
        
        # Find intersecting tracts
        intersecting_tracts = self._find_intersecting_tracts(gdf, affected_tracts_gdf)
        
        if len(intersecting_tracts) == 0:
            return {
                'affected_tracts': intersecting_tracts,
                'raster_deltas': raster_deltas,
                'healthcare_effect': {'type': 'none', 'facilities_added': 0},
                'expected_hcs_delta_range': (0, 0)
            }
        
        # Compute expected score deltas
        hcs_range = self._estimate_hcs_delta(raster_deltas, healthcare_delta)
        
        result = {
            'affected_tracts': intersecting_tracts,
            'raster_deltas': raster_deltas,
            'healthcare_effect': self._compute_healthcare_effect(action_type, geometry, healthcare_delta, kwargs),
            'expected_hcs_delta_range': hcs_range,
            'action_summary': {
                'type': action_type,
                'description': action_def['description'],
                'affected_tract_count': len(intersecting_tracts),
                'parameters_applied': params
            }
        }
        
        return result
    
    def _find_intersecting_tracts(self, action_geometry: gpd.GeoDataFrame,
                                tracts_gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
        """Find tracts that intersect with the action geometry."""
        
        # Buffer point geometries slightly for tract intersection
        if action_geometry.geometry.iloc[0].geom_type == 'Point':
            buffered = action_geometry.copy()
            buffered.geometry = buffered.geometry.buffer(100)  # 100m buffer for points
            intersecting = tracts_gdf[tracts_gdf.geometry.intersects(
                buffered.geometry.iloc[0]
            )]
        else:
            intersecting = tracts_gdf[tracts_gdf.geometry.intersects(
                action_geometry.geometry.iloc[0]
            )]
        
        return intersecting.copy()
    
    def _estimate_hcs_delta(self, raster_deltas: Dict[str, float], 
                          healthcare_delta: float) -> tuple:
        """Estimate the range of HCS delta based on parameter changes."""
        
        # Simplified HCS formula: 
        # HCS = 100 - (0.35*HeatIndex + 0.25*AirRisk) + (0.25*GreenAccess + 0.15*Healthcare)
        
        total_delta = 0.0
        
        # Heat index effect (NDVI + LST)
        if 'ndvi' in raster_deltas and 'lst' in raster_deltas:
            # HeatIndex = LST_z - 0.7*NDVI_z
            heat_effect = -(0.35 * (raster_deltas['lst'] - 0.7 * raster_deltas['ndvi']))
            total_delta += heat_effect
        
        # Air risk effect (NO2)
        if 'no2' in raster_deltas:
            air_effect = -(0.25 * raster_deltas['no2'])
            total_delta += air_effect
        
        # Green access effect (NDVI)
        if 'ndvi' in raster_deltas:
            green_effect = 0.25 * raster_deltas['ndvi']
            total_delta += green_effect
        
        # Healthcare access effect
        if healthcare_delta > 0:
            healthcare_effect = 0.15 * healthcare_delta
            total_delta += healthcare_effect
        
        # Provide range (±20% uncertainty)
        uncertainty = abs(total_delta) * 0.2
        return (total_delta - uncertainty, total_delta + uncertainty)
    
    def _compute_healthcare_effect(self, action_type: str, geometry,
                                 healthcare_delta: float, kwargs: Dict[str, Any]) -> Dict[str, Any]:
        """Compute healthcare access effects for clinic additions."""
        
        if action_type != "add_clinic" or healthcare_delta <= 0:
            return {'type': None, 'facilities_added': 0}
        
        # For clinic additions, return the facility details
        clinic_location = geometry if hasattr(geometry, 'x') else geometry.iloc[0]
        capacity = kwargs.get('capacity', 1000)
        
        return {
            'type': 'add_clinic',
            'facilities_added': 1,
            'facility_location': {
                'x': clinic_location.x if hasattr(clinic_location, 'x') else clinic_location.geometry.x,
                'y': clinic_location.y if hasattr(clinic_location, 'y') else clinic_location.geometry.y
            },
            'facility_capacity': capacity,
            'gravity_impact_radius': 5000  # 5km default impact radius
        }


def create_action_geometry(action_type: str, coordinates: List, 
                         geometry_type: str = None) -> gpd.GeoDataFrame:
    """Create appropriate geometry for an action from coordinates."""
    
    if action_type not in ACTIONS:
        raise ValueError(f"Unknown action type: {action_type}")
    
    action_def = ACTIONS[action_type]
    expected_type = geometry_type or action_def.get('default_geometry_type', 'Polygon')
    
    if expected_type == 'Point':
        geometry = Point(coordinates[0], coordinates[1])
    elif expected_type == 'LineString':
        geometry = LineString(coordinates)
    elif expected_type == 'Polygon':
        geometry = Polygon(coordinates)
    else:
        raise ValueError(f"Unsupported geometry type: {expected_type}")
    
    return gpd.GeoDataFrame({'geometry': [geometry]}, crs='EPSG:4326')
