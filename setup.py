"""Setup script for UrbanX Backend."""

def create_sample_raster_files():
    """Create sample dummy raster files for testing."""
    import numpy as np
    from pathlib import Path
    import json
    
    # Create directories
    raster_dir = Path("data/cities/chicago/rasters")
    raster_dir.mkdir(parents=True, exist_ok=True)
    
    print("📊 Creating sample raster files for testing...")
    
    try:
        # These would normally be generated from NASA data
        # For demo purposes, we'll create placeholder metadata
        raster_info = {
            "ndvi.tif": {
                "description": "Normalized Difference Vegetation Index",
                "data_range": [0, 1],
                "typical_values": {"downtown": 0.2, "park": 0.8, "residential": 0.4},
                "note": "Placeholder - replace with actual NASA Landsat NDVI data"
            },
            "lst.tif": {
                "description": "Land Surface Temperature", 
                "units": "Celsius",
                "typical_values": {"summer": 35, "winter": -5, "water": 10},
                "note": "Placeholder - replace with actual NASA MODIS LST data"
            },
            "no2.tif": {
                "description": "Nitrogen Dioxide concentration",
                "units": "μg/m³",
                "typical_values": {"clean": 10, "urban": 25, "industrial": 50},
                "note": "Placeholder - replace with actual NASA Aura OMI data"
            }
        }
        
        # Write metadata file
        with open(raster_dir / "README.json", "w") as f:
            json.dump(raster_info, f, indent=2)
        
        print("✅ Sample raster metadata created")
        print("📝 Please replace placeholder files with actual NASA data:")
        print("   - ndvi.tif (30m resolution Landsat imagery)") 
        print("   - lst.tif (MODIS thermal imagery)")
        print("   - no2.tif (Aura OMI air quality data)")
        
    except Exception as e:
        print(f"⚠️  Warning: Could not create sample files: {e}")


def validate_data_structure():
    """Validate the city data structure."""
    from pathlib import Path
    
    print("🔍 Validating data structure...")
    
    chicago_dir = Path("data/cities/chicago")
    required_files = {
        "city.yml": "City configuration",
        "vectors/tracts.geojson": "Census tracts",
        "vectors/clinics.geojson": "Healthcare facilities", 
        "vectors/parks.geojson": "Park polygons"
    }
    
    missing_files = []
    for file_path, description in required_files.items():
        full_path = chicago_dir / file_path
        if full_path.exists():
            print(f"✅ {file_path} ({description})")
        else:
            print(f"❌ {file_path} ({description}) - MISSING")
            missing_files.append(file_path)
    
    # Check raster files
    raster_dir = chicago_dir / "rasters"
    if raster_dir.exists():
        raster_files = list(raster_dir.glob("*.tif"))
        if raster_files:
            for f in raster_files:
                print(f"✅ rasters/{f.name}")
        else:
            print("⚠️  No .tif raster files found in rasters/ directory")
            missing_files.append("rasters/*.tif")
    else:
        missing_files.append("rasters/ directory")
    
    if missing_files:
        print(f"\n⚠️  Missing critical files: {missing_files}")
        print("💡 Please ensure these files are present before running the server")
        return False
    else:
        print("✅ All core files validated successfully")
        return True


def test_imports():
    """Test that all required packages can be imported."""
    print("🧪 Testing package imports...")
    
    packages = [
        ("fastapi", "Web API framework"),
        ("uvicorn", "ASGI server"),
        ("rioxarray", "Raster data processing"),
        ("geopandas", "Vector data handling"),
        ("xarray", "N-dimensional arrays"),
        ("numpy", "Numerical computing"),
        ("pandas", "Data manipulation"),
        ("shapely", "Geometric operations")
    ]
    
    failed_imports = []
    for package, description in packages:
        try:
            __import__(package)
            print(f"✅ {package} ({description})")
        except ImportError as e:
            print(f"❌ {package} ({description}) - NOT INSTALLED")
            failed_imports.append(package)
    
    if failed_imports:
        print(f"\n💡 Install missing packages with: pip install {' '.join(failed_imports)}")
        return False
    else:
        print("✅ All packages imported successfully")
        return True


if __name__ == "__main__":
    print("🚀 UrbanX Backend Setup")
    print("=" * 50)
    
    # Test imports
    imports_ok = test_imports()
    
    if imports_ok:
        # Validate data structure
        data_ok = validate_data_structure()
        
        # Create sample raster info
        create_sample_raster_files()
        
        print("\n🎉 Setup Complete!")
        print("📡 To start the server: python run_server.py")
        print("📚 API docs will be at: http://localhost:8000/docs")
        
    else:
        print("\n❌ Setup incomplete - please install missing dependencies")
        print("🔧 Run: pip install -r requirements.txt")
