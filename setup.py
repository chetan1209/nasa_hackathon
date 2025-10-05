#!/usr/bin/env python3
"""
Setup script for NASA MODIS Data Project
========================================

This script helps set up the environment and check for available data.
"""

import os
import sys
import subprocess
from pathlib import Path


def check_python_version():
    """Check if Python version is compatible."""
    if sys.version_info < (3, 8):
        print("Error: Python 3.8 or higher is required")
        return False
    print(f"✓ Python {sys.version_info.major}.{sys.version_info.minor} detected")
    return True


def install_requirements():
    """Install required packages."""
    print("\nInstalling required packages...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✓ Requirements installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ Error installing requirements: {e}")
        return False


def create_directories():
    """Create necessary directories."""
    directories = [
        "data",
        "data/raw",
        "data/processed",
        "data/output",
        "notebooks",
        "scripts",
        "docs"
    ]
    
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)
        print(f"✓ Created directory: {directory}")


def check_data_availability():
    """Check for existing NASA data files."""
    print("\nChecking for existing NASA data...")
    
    # Look for HDF files
    hdf_files = list(Path(".").rglob("*.hdf"))
    if hdf_files:
        print(f"✓ Found {len(hdf_files)} HDF files:")
        for file in hdf_files[:5]:  # Show first 5
            print(f"  - {file}")
        if len(hdf_files) > 5:
            print(f"  ... and {len(hdf_files) - 5} more")
    else:
        print("ℹ No HDF files found in current directory")
    
    # Look for other data formats
    data_extensions = [".nc", ".tif", ".tiff", ".npy", ".json"]
    for ext in data_extensions:
        files = list(Path(".").rglob(f"*{ext}"))
        if files:
            print(f"✓ Found {len(files)} {ext} files")


def run_data_explorer():
    """Run the data explorer to show available options."""
    print("\nRunning NASA Data Explorer...")
    try:
        subprocess.run([sys.executable, "explore_nasa_data.py", "--list-available"], check=True)
        print("\n" + "="*50)
        subprocess.run([sys.executable, "explore_nasa_data.py", "--data-access"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"✗ Error running data explorer: {e}")
    except FileNotFoundError:
        print("ℹ Data explorer script not found")


def main():
    """Main setup function."""
    print("NASA MODIS Data Project Setup")
    print("=" * 40)
    
    # Check Python version
    if not check_python_version():
        return
    
    # Create directories
    print("\nCreating project directories...")
    create_directories()
    
    # Install requirements
    if not install_requirements():
        print("Warning: Some packages may not have installed correctly")
    
    # Check for existing data
    check_data_availability()
    
    # Run data explorer
    run_data_explorer()
    
    print("\n" + "="*50)
    print("Setup complete!")
    print("\nNext steps:")
    print("1. Check the NASA_DATA_OVERVIEW.md file for detailed information")
    print("2. Run: python explore_nasa_data.py --help")
    print("3. If you have HDF files: python explore_nasa_data.py --analyze-dir data/")
    print("4. Visit NASA Earthdata to download data: https://search.earthdata.nasa.gov/")


if __name__ == "__main__":
    main()
