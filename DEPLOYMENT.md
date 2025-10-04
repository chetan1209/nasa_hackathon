# UrbanX Backend Deployment Guide

## 🚀 Quick Deployment Steps

### 1. Install Dependencies

```bash
# Install Python packages
pip install -r requirements.txt

# Additional geospatial dependencies (if needed)
pip install rioxarray geopandas rasterio pyproj
```

### 2. Verify Data Structure

```bash
# Run setup validation
python setup.py
```

### 3. Start the Server

```bash
# Development mode (auto-reload on changes)
python run_server.py

# Production mode
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

## 🗂️ Data Requirements

### Chicago City Data Structure
```
data/cities/chicago/
├── city.yml              ✅ (configured)
├── rasters/
│   ├── ndvi.tif         📝 (NASA Landsat NDVI)
│   ├── lst.tif          📝 (NASA MODIS LST)
│   └── no2.tif          📝 (NASA Aura OMI NO₂)
└── vectors/
    ├── tracts.geojson   ✅ (census tracts)
    ├── clinics.geojson  ✅ (healthcare facilities)
    └── parks.geojson    ✅ (park polygons)
```

### Adding NASA Data

Replace the placeholder raster files with actual NASA data:

1. **NDVI (Vegetation)**: Download Landsat Collection 2 Level-2 imagery
2. **LST (Temperature)**: NASA MODIS Land Surface Temperature Daily L3 data
3. **NO₂ (Air Quality)**: NASA Aura OMI Nitrogen Dioxide data

Process the data to:
- Cloud Optimized GeoTIFF (COG) format
- WGS84 coordinate system (EPSG:4326)
- ~30m resolution for consistency
- Clipped to Chicago city boundaries

## 🧪 Testing the API

### Health Check
```bash
curl http://localhost:8000/health
```

### City Capabilities
```bash
curl "http://localhost:8000/capabilities?city=chicago"
```

### Score Computation
```bash
curl -X POST "http://localhost:8000/score?city=chicago&format=summary"
```

### Urban Simulation Example
```bash
curl -X POST "http://localhost:8000/simulate" \
  -H "Content-Type: application/json" \
  -d '{
    "city": "chicago_kota",
    "actions": [{
      "action_type": "add_park",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-87.6298, 41.8781], [-87.6298, 41.8801], [-87.6278, 41.8801], [-87.6278, 41.8781], [-87.6298, 41.8781]]]
      }
    }]
  }'
```

## 🔧 Configuration

### Environment Variables
```bash
# Copy and customize
cp .env.example .env

# Key settings:
HOST=0.0.0.0
PORT=8000
DEBUG=true
DATA_ROOT=data/cities
TITILER_BASE_URL=http://localhost:8080  # Optional: for tile serving
```

### TiTiler Integration (Optional)

For map tile serving:

1. **Install TiTiler**: `pip install titiler[server]`
2. **Start TiTiler**: `titiler server --host 0.0.0.0 --port 8080`
3. **Test Integration**: `curl "http://localhost:8000/tiTiler-health"`

## 🏗️ Production Deployment

### Docker Deployment

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 8000

CMD ["python", "run_server.py"]
```

### Environment Setup
```bash
# Production environment variables
export HOST=0.0.0.0
export PORT=8000
export DEBUG=false
export DATA_ROOT=/app/data/cities

# Run with multiple workers
uvicorn main:app --host $HOST --port $PORT --workers 4
```

## 📊 Performance Optimization

### Raster Data Optimization
- Ensure COG format for efficient web serving
- Pre-compute city statistics (`city_stats.json`)
- Use spatial indexing for large vector datasets

### API Response Optimization
- Enable gzip compression
- Cache city statistics locally
- Implement Redis caching for frequent requests

### Monitoring
- Health check endpoint: `/health`
- Metrics endpoint: Custom monitoring integration
- Log structured data for debugging

## 🔍 Troubleshooting

### Common Issues

**1. Import Errors**
```bash
# Solution: Install missing geospatial packages
pip install rioxarray geopandas rasterio pyproj shapely="2.0.2
```

**2. Missing Raster Data**
```bash
# Solution: Upload actual NASA data files
# Ensure files are COGs with proper geographic metadata
rio cogeo validate data/cities/chicago/rasters/ndvi.tif
```

**3. TiTiler Connection Issues**
```bash
# Solution: Check TiTiler server status
curl "http://localhost:8080/health"
# Start TiTiler if not running
titiler server --host 0.0.0.0 --port 8080
```

**4. Memory Issues with Large Cities**
```bash
# Solution: Process tracts in batches, increase server memory
# Consider using PostGIS for very large datasets
```

## 📈 Scaling Considerations

### Horizontal Scaling
- Deploy behind load balancer (nginx/traefik)
- Use Redis for session/cache sharing
- Consider GeoTileDB for tile caching

### Data Scaling  
- Move to PostGIS for enterprise use
- Implement data versioning
- Use AWS S3/Google Cloud Storage for raster assets

## 🔐 Security

### API Security
- Rate limiting per IP
- API key authentication for production
- HTTPS termination at reverse proxy

### Data Security
- Access control for sensitive health data
- Audit logging for data access
- Compliance with healthcare data regulations

---

**Ready for NASA Space Apps Challenge! 🚀**

Once deployed, the API will be available at `http://your-server:8000/docs` for interactive testing and frontend integration.
