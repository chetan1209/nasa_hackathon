# UrbanX Backend

🌍 **Urban Health Scoring and Simulation API** - A comprehensive backend system that processes NASA-derived environmental data to compute urban health scores and simulate the impact of public health interventions.

## 🎯 Overview

UrbanX Backend provides a robust API for:

- **Health City Scoring**: Computes baseline health scores using NASA satellite data (NDVI, LST, NO₂)
- **Urban Simulation**: Models the impact of interventions like parks, trees, clinics on health outcomes
- **Real-time Visualization**: Serves map tiles and geoJSON data for frontend visualization
- **Spatial Analysis**: Performs zonal statistics and gravity modeling for healthcare access

## 🏗️ Architecture

```
app/
├── api/           # FastAPI endpoints
│   ├── score.py      # Health score computation
│   ├── simulate.py   # Action simulation
│   ├── capabilities.py # Data layer listing
│   └── tiles.py      # TiTiler integration
├── services/      # Core business logic
│   ├── metrics.py     # Scoring algorithms
│   ├── sim_actions.py # Parametric deltas
│   └── gravity.py    # Healthcare access modeling
├── core/         # Configuration & data loading
│   ├── config.py    # Environment settings
│   └── cities.py    # Data validation & loading
└── data/cities/  # City-specific datasets
    └── chicago/     # Example city data
```

## 📊 Health City Score Algorithm

### Baseline Scoring
1. **Zonal Statistics**: Compute mean NDVI, LST, NO₂ per census tract
2. **Normalization**: Convert to z-scores using city-wide statistics  
3. **Index Computation**:
   - `HeatIndex = LST_z - 0.7*NDVI_z` (lower is better)
   - `AirRisk = NO₂_z` (lower is better)
   - `GreenAccess = NDVI_z` (higher is better)
   - `HealthcareAccess = gravity_score` (gravity model)
4. **Final Score**:
   ```
   HCS = 100 - (0.35*HeatIndex + 0.25*AirRisk) 
            + (0.25*GreenAccess + 0.15*HealthcareAccess)
   ```

### Simulation Actions
| Action | Effect | Typical ΔHCS | Parameters |
|--------|---------|---------------|------------|
| `add_park` | ↑NDVI, ↓LST | +5-10 | Size, vegetation density |
| `add_trees` | ↑NDVI, ↓LST, ↓NO₂ | +2-5 | Line/polygon geometry |
| `cool_roof` | ↓LST | +3-7 | Roof type, area |
| `add_clinic` | ↑HealthcareAccess | +2-6 | Capacity, location |
| `ev_zone` | ↓NO₂ | +2-5 | Zone size, enforcement |

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd nasa_hackathon/nasa_hackathon

# Install dependencies
pip install -r requirements.txt
```

### 2. Data Setup

```bash
# Ensure city data structure exists
mkdir -p data/cities/chicago/{rasters,vectors}

# Place your raster files in rasters/:
# - ndvi.tif (vegetation index)
# - lst.tif (land surface temperature) 
# - no2.tif (nitrogen dioxide concentration)

# Vector files are already created in vectors/:
# - tracts.geojson (census tracts)
# - clinics.geojson (healthcare facilities)
# - parks.geojson (green spaces)
```

### 3. Run the Server

```bash
python main.py
```

The API will be available at `http://localhost:8000` with interactive docs at `/docs`.

## 📡 API Endpoints

### City Capabilities
```bash
GET /capabilities?city=chicago
# Returns available data layers and validation status
```

### Health Score Computation  
```bash
POST /score?city=chicago&format=geojson
# Computes baseline healthy city scores for all tracts
```

### Simulation
```bash
POST /simulate
# Apply urban interventions and return impact assessment

# Example payload:
{
  "city": "chicago",
  "actions": [{
    "action_type": "add_park",
    "geometry": {
      "type": "Polygon", 
      "coordinates": [[[-87.6298, 41.8781], [-87.6298, 41.8801], [-87.6278, 41.8801], [-87.6278, 41.8781], [-87.6298, 41.8781]]]
    }
  }]
}
```

### Map Tiles (TiTiler Integration)
```bash
GET /tiles?city=chicago
# Returns TiTiler URLs for NDVI/LST/NO₂ layers
```

## 🗄️ Data Contract

### City Configuration (`city.yml`)
```yaml
name: "Chicago"
bounds:
  west: -87.9401
  east: -87.5240
  north: 42.0230
  south: 41.6445

rasters:
  ndvi: "ndvi.tif"
  lst: "lst.tif"  
  no2: "no2.tif"

vectors:
  tracts: "tracts.geojson"
  clinics: "clinics.geojson"
  parks: "parks.geojson"
```

### Required Data Formats

**Rasters**: Cloud Optimized GeoTIFFs (COGs), WGS84, ~30m resolution
**Vectors**: GeoJSON with standardized properties (`tract_id`, `capacity`, etc.)

## 🧮 Gravity Model for Healthcare Access

Healthcare access uses a gravity model:

```
Attraction = Facility_Capacity / (1 + decay_factor * distance²)
```

- **Distance decay**: 5km catchment radius
- **Capacity weighting**: Larger facilities have greater influence
- **Spatial aggregation**: Tract centroids → facility locations

## 🔧 Dependencies

### Core Libraries
- **FastAPI**: Web API framework
- **rioxarray**: Raster data processing  
- **geopandas**: Vector data handling
- **xarray**: N-dimensional arrays with geographic metadata
- **scipy**: Spatial distance calculations
- **pyproj**: Coordinate transformation

### Optional Services
- **TiTiler**: For map tile serving and visualization
- **PostGIS**: For enterprise spatial data management

## 🌡️ Environment Configuration

Create a `.env` file:

```
# API Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=false

# Data paths
DATA_ROOT=data/cities

# TiTiler Integration  
TITILER_BASE_URL=http://localhost:8080
```

## 📈 Performance Considerations

- **Raster Statistics**: Pre-computed and cached as `city_stats.json`
- **Zonal Operations**: Optimized with rioxarray's native clipping
- **Spatial Indexing**: Uses geopandas spatial indexing for geometry operations
- **Memory Management**: Processes tracts in batches for large cities

## 🧪 Example Usage

### Basic Health Score Computation

```python
import requests

# Compute scores for Chicago
response = requests.post(
    "http://localhost:8000/score",
    params={"city": "chicago", "output_format": "geojson"}
)

scores_data = response.json()
print(f"Processed {len(scores_data['features'])} tracts")

# Access individual tract scores
for feature in scores_data['features']:
    tract_score = feature['properties']['hcs']
    print(f"Tract {feature['properties']['tract_id']}: HCS = {tract_score}")
```

### Urban Intervention Simulation

```python
# Simulate adding a park
simulation_request = {
    "city": "chicago",
    "actions": [{
        "action_type": "add_park", 
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[-87.6298, 41.8781], [-87.6298, 41.8801], [-87.6278, 41.8801], [-87.6278, 41.8781], [-87.6298, 41.8781]]]
        }
    }]
}

response = requests.post("http://localhost:8000/simulate", json=simulation_request)
impact = response.json()

print(f"Actions applied: {impact['actions_applied']}")
print(f"Tracts affected: {impact['affected_tracts']}")
print(f"Total HCS delta: {impact['total_hcs_delta']:+.1f}")
```

## 🛠️ Development

### Testing
```bash
# Run the server in development mode
uvicorn main:app --reload --host 0.0.0 H.0 --port 8000

# Test endpoints
curl http://localhost:8000/health
curl http://localhost:8000/capabilities?city=chicago
```

### Adding New Cities

1. Create city directory: `data/cities/<city_slug>/`
2. Add `city.yml` configuration file
3. Place raster files in `rasters/` directory  
4. Create vector files in `vectors/` directory
5. Test with `/capabilities` endpoint

### Extending Simulation Actions

Add new action types in `app/services/sim_actions.py`:

```python
"new_intervention": {
    "description": "Description of the new intervention",
    "parameters": {
        "ndvi_delta": 0.02,
        "lst_delta": -0.5,
        # ... other parameter effects
    },
    "require_geometry": True,
    "default_geometry_type": "Polygon"
}
```

## 📚 Additional Resources

- **NASA Data Sources**: Landsat imagery, MODIS thermal, Aura OMI air quality
- **TiTiler Documentation**: https://titiler.github.io/
- **FastAPI Documentation**: https://fastapi.tiangolo.com/
- **GeoPandas Tutorial**: https://geopandas.org/getting_started/overview.html

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Built for NASA Space Apps Challenge 2024** 🚀  
*Empowering data-driven urban health decisions*
