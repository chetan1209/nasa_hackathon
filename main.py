"""FastAPI application entry point for UrbanX backend."""
from fastapi import FastAPI, Query, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Dict, Any
import uvicorn

from app.core.config import settings
from app.api import capabilities, score, simulate, tiles

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="UrbanX Backend: Urban health scoring and simulation API",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(capabilities.router, prefix="/capabilities", tags=["capabilities"])
app.include_router(score.router, prefix="/score", tags=["scoring"])
app.include_router(simulate.router, prefix="/simulate", tags=["simulation"])
app.include_router(tiles.router, prefix="/tiles", tags=["tiles"])


@app.get("/")
async def root():
    """Root endpoint with basic API information."""
    return {
        "name": settings.app_name,
        "version": settings.version,
        "description": "UrbanX Backend: Urban health scoring and simulation API",
        "endpoints": {
            "capabilities": "/capabilities?city=<city_slug>",
            "score": "/score?city=<city_slug>&format=geojson",
            "simulate": "/simulate",
            "tiles": "/tiles?city=<city_slug>",
            "docs": "/docs",
            "redoc": "/redoc"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": settings.version}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )
