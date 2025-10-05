#!/usr/bin/env python3
"""
Simple backend server to serve polygon scoring data via API endpoints.
"""

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import json
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend access

@app.route('/api/polygon-scores')
def get_polygon_scores():
    """Serve the polygon scoring results."""
    try:
        with open('data/output/polygon_scoring_results.json', 'r') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        return jsonify({'error': 'Polygon scoring data not found'}), 404

@app.route('/api/regions')
def get_regions():
    """Serve the Chicago regions GeoJSON data."""
    try:
        with open('data/chicago_polygons.geojson', 'r') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        return jsonify({'error': 'Regions data not found'}), 404

@app.route('/api/health')
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'message': 'Backend API is running'})

if __name__ == '__main__':
    print("🚀 Starting backend server...")
    print("📊 Serving polygon scoring data at /api/polygon-scores")
    print("🗺️  Serving regions data at /api/regions")
    print("💚 Health check at /api/health")
    app.run(debug=True, port=5001, host='0.0.0.0')
