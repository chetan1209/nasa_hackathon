# Chicago Raster Data

This directory contains the Cloud Optimized GeoTIFF (COG) raster files for Chicago urban health analysis.

## Required Files

### NDVI (Normalized Difference Vegetation Index)
- **File**: `ndvi.tif`
- **Description**: Vegetation health and greenness index (0-1 scale)
- **Source**: NASA Landsat imagery processed with NDVI algorithm
- **Resolution**: 30m per pixel
- **NoData Value**: 0 or NaN for water/urban areas

### LST (Land Surface Temperature)
- **File**: `lst.tif`
- **Description**: Surface temperature in Celsius degrees
- **Source**: NASA MODIS/Terra Thermal bands
- **Resolution**: 30m per pixel  
- **NoData Value**: NaN or extreme outliers

### NO2 (Nitrogen Dioxide Concentration)
- **File**: `no2.tif`
- **Description**: Air quality pollutant concentration (μg/m³)
- **Source**: NASA Aura OMI satellite data
- **Resolution**: Adjusted to 30m for consistency
- **NoData Value**: NaN for gaps in satellite coverage

## Data Processing Notes

All raster files should be:
1. **Cloud Optimized GeoTIFFs (COGs)** for efficient web serving
2. **Georeferenced** to WGS84 (EPSG:4326) coordinate system
3. **Clipped** to Chicago city boundaries  
4. **Normalized** or scaled appropriately for spatial analysis
5. **Compressed** to reduce file size while maintaining precision

## Usage in UrbanX Backend

These rasters are automatically loaded by the `CityDataLoader` and used for:
- Zonal statistics computation per census tract
- Baseline Health City Score calculation
- Simulation delta modeling for urban interventions

## Data Sources

- **Imagery**: NASA Landsat Collection 2 Level-2 Science Products
- **Thermal**: NASA MODIS Land Surface Temperature Daily L3 Global 1km
- **Air Quality**: NASA Aura OMI Nitrogen Dioxide (NO2) Total Column Daily L3 Global 13x12km
- **Processing**: Google Earth Engine + Python GDAL/rio-calc workflows

## Example Commands

```bash
# Validate raster files
gdalinfo ndvi.tif
gdalinfo lst.tif  
gdalinfo no2.tif

# Check COG compliance
rio cogeo validate ndvi.tif

# Basic statistics
rio info ndvi.tif
rio stats ndvi.tif
```
