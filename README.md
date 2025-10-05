# NASA Hackathon - Polygon Scoring System

A comprehensive environmental polygon scoring system that analyzes temperature, air quality (AQI), and water vapour data to provide color-coded environmental assessments for different regions.

## 🎯 Features

- **Multi-Feature Analysis**: Temperature, AQI, and Water Vapour
- **Area-Weighted Polygon Means**: Accurate spatial analysis
- **Z-Score Normalization**: Statistical standardization
- **Color-Coded Results**: Green (good), Yellow (moderate), Red (poor)
- **Real Data Integration**: MODIS and OMI satellite data

## 📊 Data Sources

- **Temperature**: MODIS MOD11A1 Land Surface Temperature
- **AQI**: MODIS MOD04 Aerosol Optical Thickness
- **Water Vapour**: MODIS MOD05 Water Vapour

## 🚀 Quick Start

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install frontend dependencies and build the production bundle
cd my-app
npm install
npm run build
cd ..

# Start the Flask backend (serves APIs and the built frontend)
python backend_server.py
```

The Flask server now hosts the compiled React app from `my-app/dist`, so once it is running you can navigate to `http://localhost:5001` to interact with the frontend and API together.

## 📁 Project Structure

```
├── data/
│   ├── raw/                    # Raw satellite data files
│   │   ├── AQI.nc              # MODIS aerosol data
│   │   ├── Temp.hdf            # MODIS temperature data
│   │   └── water_vapour.hdf    # MODIS water vapour data
│   ├── output/                 # Results and visualizations
│   │   ├── polygon_scoring_results.json
│   │   └── polygon_scoring_results.png
│   └── chicago_polygons.geojson # Polygon definitions
├── polygon_scoring_system.py   # Main scoring system
├── NASA_DATA_OVERVIEW.md       # Data documentation
├── requirements.txt            # Python dependencies
└── README.md                   # This file
```

## 📈 Output

The system generates:
- **JSON Results**: Detailed scoring data (`data/output/polygon_scoring_results.json`)
- **Visualization**: 4-panel dashboard (`data/output/polygon_scoring_results.png`)

## 🔧 Technical Details

- **Native Resolution Processing**: Each dataset processed at original resolution
- **Area-Weighted Means**: Proper polygon sampling for accurate results
- **Statistical Normalization**: Z-score standardization for fair comparison
- **Realistic AQI Variations**: Local microclimate variations for urban areas

## 📊 Results Interpretation

| Color | Meaning | Score Range |
|-------|---------|-------------|
| 🟢 Green | Good environmental conditions | Below average |
| 🟡 Yellow | Moderate environmental conditions | Around average |
| 🔴 Red | Poor environmental conditions | Above average |

## 🎯 Use Cases

- Urban environmental monitoring
- Climate change impact assessment
- Environmental policy planning
- Public health risk evaluation

## 🧪 Validation

The system has been validated against environmental science principles:
- ✅ Urban heat island effects
- ✅ Air quality gradients
- ✅ Moisture retention patterns
- ✅ Green area benefits