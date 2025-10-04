"""Configuration and environment management for UrbanX backend."""
import os
from pathlib import Path
from typing import Dict, Any
import yaml
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # API Configuration
    app_name: str = "UrbanX Backend"
    version: str = "1.0.0"
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    
    # Data paths
    data_root: Path = Path("data/cities")
 
    class Config:
        env_file = ".env"


settings = Settings()


class CityConfig:
    """Configuration loaded from individual city.yml files."""
    
    def __init__(self, city_slug: str):
        self.city_slug = city_slug
        self.city_path = settings.data_root / city_slug
        self.config_path = self.city_path / "city.yml"
        
        if not self.city_path.exists():
            raise ValueError(f"City data not found: {city_slug}")
        
        self._config = self._load_city_config()
    
    def _load_city_config(self) -> Dict[str, Any]:
        """Load city configuration from city.yml"""
        if not self.config_path.exists():
            raise ValueError(f"city.yml not found for city: {self.city_slug}")
        
        with open(self.config_path, 'r') as f:
            return yaml.safe_load(f)
    
    @property
    def name(self) -> str:
        return self._config.get('name', self.city_slug.title())
    
    @property
    def bounds(self) -> Dict[str, float]:
        return self._config.get('bounds', {})
    
    @property
    def projections(self) -> Dict[str, str]:
        return self._config.get('projections', {})
    
    @property
    def rasters(self) -> Dict[str, str]:
        """Available raster layers and their file paths."""
        rasters_config = self._config.get('rasters', {})
        return {
            name: str(self.city_path / "rasters" / filename)
            for name, filename in rasters_config.items()
        }
    
    @property
    def vectors(self) -> Dict[str, str]:
        """Available vector layers and their file paths."""
        vectors_config = self._config.get('vectors', {})
        return {
            name: str(self.city_path / "vectors" / filename)
            for name, filename in vectors_config.items()
        }
    
    @property
    def web_mercator_crs(self) -> str:
        """EPSG:3857 Web Mercator CRS for tiling."""
        return "EPSG:3857"
    
    @property
    def geographic_crs(self) -> str:
        """EPSG:4326 Geographic CRS."""
        return "EPSG:4326"


def get_city_config(city_slug: str) -> CityConfig:
    """Get configuration for a specific city."""
    return CityConfig(city_slug)


def list_available_cities() -> list[str]:
    """List all available cities in the data directory."""
    if not settings.data_root.exists():
        return []
    
    cities = []
    for city_dir in settings.data_root.iterdir():
        if city_dir.is_dir() and (city_dir / "city.yml").exists():
            cities.append(city_dir.name)
    
    return sorted(cities)