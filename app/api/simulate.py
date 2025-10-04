"""Simulation API endpoints for applying urban interventions."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import json

from ..core.config import get_city_config, CityConfig
from ..core.cities import CityDataLoader
from ..services.metrics import MetricsComputer
from ..services.sim_actions import ActionApplicator, create_action_geometry
from ..services.gravity import simulate_new_clinic

router = APIRouter()


class SimulationAction(BaseModel):
    """Individual simulation action."""
    action_type: str = Field(..., description="Type of action: add_park, add_trees, cool_roof, add_clinic, ev_zone, green_infrastructure")
    geometry: Dict[str, Any] = Field(..., description="GeoJSON geometry for the action")
    parameters: Optional[Dict[str, Any]] = Field(default={}, description="Additional parameters for the action")


class SimulationRequest(BaseModel):
    """Request model for simulation."""
    city: str = Field(..., description="City slug")
    actions: List[SimulationAction] = Field(..., description="List of actions to apply")
    return_format: str = Field(default="geojson", description="Output format: geojson, table, summary")


class SimulationResponse(BaseModel):
    """Response model for simulation results."""
    city: str
    actions_applied: int
    affected_tracts: int
    total_hcs_delta: float
    individual_impacts: List[Dict[str, Any]]
    before_after_data: Optional[Dict[str, Any]]
    confidence_score: Optional[float]


@router.post("/", response_model=SimulationResponse)
async def simulate_actions(request: SimulationRequest):
    """Apply urban intervention actions and return their impacts."""
    
    try:
        # Get city configuration
        city_config = get_city_config(request.city)
        
        # Load city data
        loader = CityDataLoader(city_config)
        city_stats = await loader.compute_city_stats()
        rasters = loader.load_rasters()
        
        # Initialize services
        metrics_computer = MetricsComputer(city_config, city_stats)
        action_applicator = ActionApplicator(city_config, city_stats)
        
        # Compute baseline scores for comparison
        print("Computing baseline scores...")
        baseline_scores = metrics_computer.compute_baseline_scores(rasters)
        
        # Process each action
        individual_impacts = []
        cumulative_deltas = {}
        affected_tract_ids = set()
        
        print(f"Processing {len(request.actions)} actions...")
        
        for i, action in enumerate(request.actions):
            print(f"Processing action {i+1}: {action.action_type}")
            
            # Validate action
            validation = action_applicator.validate_action(
                action.action_type, 
                action.geometry, 
                **action.parameters
            )
            
            if not validation['valid']:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid action {i+1}: {'; '.join(validation['errors'])}"
                )
            
            # Create geometry from GeoJSON
            try:
                # Convert GeoJSON to GeoDataFrame
                import geopandas as gpd
                action_gdf = gpd.GeoDataFrame.from_features([action.geometry])
                
                # Apply action and get effects
                action_result = action_applicator.apply_action(
                    action.action_type,
                    action_gdf,
                    baseline_scores,
                    **action.parameters.get('additional_params', {})
                )
                
                # Collect affecting tracts
                affected_tracts = action_result['affected_tracts']
                
                if len(affected_tracts) > 0:
                    affected_tract_ids.update(affected_tracts['tract_id'].tolist())
                    
                    # Accumulate raster deltas
                    raster_deltas = action_result['raster_deltas']
                    for param, delta in raster_deltas.items():
                        cumulative_deltas[param] = cumulative_deltas.get(param, 0) + delta
                
                # Store individual action impact
                individual_impacts.append({
                    "action_index": i + 1,
                    "action_type": action.action_type,
                    "action_description": action_result['action_summary']['description'],
                    "affected_tract_count": len(affected_tracts),
                    "expected_hcs_delta_range": action_result['expected_hcs_delta_range'],
                    "healthcare_effect": action_result['healthcare_effect'],
                    "raster_deltas": raster_deltas,
                    "validation_warnings": validation.get('warnings', [])
                })
                
            except Exception as e:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Error processing action {i+1} ({action.action_type}): {str(e)}"
                )
        
        # Compute final scores with all accumulated changes
        if len(affected_tract_ids) > 0:
            print("Computing modified scores...")
            
            # Get affected tracts from baseline
            affected_baseline = baseline_scores[baseline_scores['tract_id'].isin(affected_tract_ids)]
            
            # Apply cumulative deltas to affected tracts
            score_changes = metrics_computer.compute_delta_scores(
                baseline_scores,
                cumulative_deltas,
                affected_baseline
            )
            
            # Calculate total HCS delta
            total_hcs_delta = score_changes['delta']['hcs_delta'].sum()
            
            # Get before/after data for response
            before_after_data = {
                "before_scores": score_changes['original'][['tract_id', 'hcs']].to_dict(orient='records'),
                "after_scores": score_changes['modified'][['tract_id', 'hcs']].to_dict(orient='records'),
                "delta_scores": score_changes['delta'][['tract_id', 'hcs_delta']].to_dict(orient='records')
            }
            
        else:
            total_hcs_delta = 0.0
            before_after_data = None
        
        # Calculate confidence score based on number of actions and affected tracts
        confidence_score = min(0.95, 0.5 + (len(affected_tract_ids) * 0.01))
        
        response = SimulationResponse(
            city=city_config.name,
            actions_applied=len(request.actions),
            affected_tracts=len(affected_tract_ids),
            total_hcs_delta=float(total_hcs_delta),
            individual_impacts=individual_impacts,
            before_after_data=before_after_data,
            confidence_score=confidence_score
        )
        
        return response
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error in simulation: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/available-actions")
async def get_available_actions():
    """Get list of available simulation actions with their parameters."""
    
    from ..services.sim_actions import ACTIONS
    
    action_info = {}
    
    for action_name, action_def in ACTIONS.items():
        action_info[action_name] = {
            "description": action_def["description"],
            "parameters": action_def["parameters"],
            "requires_geometry": action_def.get("input_geometry_required", True),
            "default_geometry_type": action_def.get("default_geometry_type", "Polygon"),
            "additional_parameters": action_def.get("additional_params", {})
        }
    
    return {
        "available_actions": action_info,
        "total_actions": len(ACTIONS)
    }


@router.post("/validate-action")
async def validate_single_action(action: SimulationAction):
    """Validate a single simulation action without applying it."""
    
    try:
        # Temporary city config for validation (could be made more generic)
        temp_city_slug = "chicago"  # Default for validation
        city_config = get_city_config(temp_city_slug)
        city_stats = await CityDataLoader(city_config).compute_city_stats()
        
        action_applicator = ActionApplicator(city_config, city_stats)
        
        validation = action_applicator.validate_action(
            action.action_type,
            action.geometry,
            **action.parameters
        )
        
        return {
            "valid": validation['valid'],
            "errors": validation.get('errors', []),
            "warnings": validation.get('warnings', []),
            "action_type": action.action_type,
            "action_info": {
                "description": "Action validation completed",
                "requires_geometry": True
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/example-scenarios/{city}")
async def get_example_scenarios(
    city: str,
    scenario_type: Optional[str] = None
):
    """Get example simulation scenarios for a city."""
    
    scenarios = {
        "park_addition": {
            "description": "Add a 10-acre neighborhood park",
            "actions": [
                {
                    "action_type": "add_park",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[-87.6298, 41.8781], [-87.6298, 41.8801], [-87.6278, 41.8801], [-87.6278, 41.8781], [-87.6298, 41.8781]]]
                    }
                }
            ]
        },
        "street_trees": {
            "description": "Plant trees along main street corridor",
            "actions": [
                {
                    "action_type": "add_trees",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[-87.63, 41.88], [-87.63, 41.89], [-87.62, 41.89]]
                    }
                }
            ]
        },
        "mixed_intervention": {
            "description": "Combined park, trees, and cool roof intervention",
            "actions": [
                {
                    "action_type": "add_park",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[-87.63, 41.88], [-87.63, 41.881], [-87.629, 41.881], [-87.629, 41.88], [-87.63, 41.88]]]
                    }
                },
                {
                    "action_type": "add_trees",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[-87.631, 41.88], [-87.631, 41.882]]
                    }
                },
                {
                    "action_type": "cool_roof",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[-87.628, 41.878], [-87.628, 41.879], [-87.627, 41.879], [-87.627, 41.878], [-87.628, 41.878]]]
                    }
                }
            ]
        }
    }
    
    if scenario_type:
        if scenario_type not in scenarios:
            raise HTTPException(
                status_code=404, 
                detail=f"Scenario type '{scenario_type}' not found"
            )
        return scenarios[scenario_type]
    
    return {
        "available_scenarios": list(scenarios.keys()),
        "scenarios": scenarios
    }
