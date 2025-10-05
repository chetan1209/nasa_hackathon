import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Cesium from 'cesium';
import SimpleAIExplain from './components/SimpleAIExplain';
import * as THREE from 'three'; // For the landing page animation
import * as turf from '@turf/turf'; // For robust point-in-polygon checks

// --- IMPORTANT ---
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyYjhjYmQ0YS1mMjJiLTRkZmUtYjg3OS0yNGQ4Y2EwNzNhMTYiLCJpZCI6MzQ3MDIzLCJpYXQiOjE3NTk1NTEzOTN9.CT2n4lChu6SwyXuoxjd_sxRTOsPrKz-d4KLTk5P-ca0'; // ❗️ PASTE YOUR TOKEN HERE

// --- THEME & DESIGN CONSTANTS ---
const THEME = {
  primary: '#4ade80',
  background: '#101010',
  panelBackground: 'rgba(26, 26, 26, 0.8)',
  panelBorder: 'rgba(74, 222, 128, 0.25)',
  textPrimary: '#f0f0f0',
  textSecondary: '#a3a3a3',
  shadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
};

// --- DESIGN PALETTE with impactFactor ---
const PALETTE_ITEMS = [
    { id: 'trees', name: 'Add Park', icon: '🌳', type: 'vegetation', placement: 'ground', modelUri: '/tree.glb', scale: 200.5, impactFactor: 2.0 },
    { id: 'cool_roof', name: 'Add Reflective Surfaces', icon: '⬜', type: 'building', placement: 'rooftop', modelUri: '/mirror.glb', scale: .4, impactFactor: 1.0 },
    { id: 'water_body', name: 'Add Water Body', icon: '💧', type: 'water', placement: 'ground', modelUri: '/cartoon_pond.glb', scale: 3, impactFactor: 2.2 }
];

// --- Mocks & Helpers ---
const mockAIScoring = (state) => new Promise(resolve => setTimeout(() => {
    const items = Object.values(state);
    const greenCount = items.filter(i => i.type === 'vegetation' || i.type === 'water').length;
    const energyCount = items.filter(i => i.type === 'energy').length;
    const score = Math.min(100, 70 + greenCount * 3 + energyCount * 5);
    resolve({
      overall_score: score,
      categories: { sustainability: Math.min(100, 70 + greenCount * 4 + energyCount * 2), livability: Math.min(100, 75 + greenCount * 2), efficiency: Math.min(100, 70 + energyCount * 8), aesthetics: Math.floor(Math.random() * 20) + 75 },
      summary: score > 85 ? 'Excellent sustainability improvements!' : 'Consider adding more green spaces or renewable energy.'
    });
}, 500));

// --- Backend Data Transformation ---
const transformBackendData = (backendData) => {
    console.log('🔄 Transforming backend data:', backendData);
    
    const { feature_scores, overall_scores, color_codes } = backendData;
    const transformed = {};
    
    // Convert backend z-scores to frontend health scores (0-100 scale)
    Object.keys(overall_scores).forEach(regionId => {
        const zScore = overall_scores[regionId];
        const aqiZScore = feature_scores.aqi[regionId] || 0;
        const tempZScore = feature_scores.temperature[regionId] || 0;
        const humidityZScore = feature_scores.water_vapour[regionId] || 0;
        
        // Convert z-scores to 0-100 scale (z-score of 0 = 50, ±2 = 0/100)
        const healthScore = Math.max(0, Math.min(100, 50 + (zScore * 25)));
        const aqiScore = Math.max(0, Math.min(100, 50 + (aqiZScore * 25)));
        const tempScore = Math.max(0, Math.min(100, 50 + (tempZScore * 25)));
        const humidityScore = Math.max(0, Math.min(100, 50 + (humidityZScore * 25)));
        
        transformed[regionId] = {
            health_score: Math.round(healthScore),
            name: `Region ${regionId}`,
            aqi_score: Math.round(aqiScore),
            temperature_score: Math.round(tempScore),
            humidity_score: Math.round(humidityScore),
            color_code: color_codes[regionId] || 'yellow'
        };
    });
    
    console.log('✅ Transformed data:', transformed);
    return transformed;
};


// --- UI Components ---

const DraggablePanel = ({ children, title, initialPosition, panelRef, onClose }) => {
    const [position, setPosition] = useState(initialPosition);
    const [isDragging, setIsDragging] = useState(false);
    const offset = useRef({ x: 0, y: 0 });

    const handleMouseDown = useCallback((e) => {
        setIsDragging(true);
        offset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    }, [position]);

    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - offset.current.x,
            y: e.clientY - offset.current.y
        });
    }, [isDragging]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    return (
        <div
            ref={panelRef}
            className="panel draggable-panel"
            style={{ left: position.x, top: position.y, cursor: isDragging ? 'grabbing' : 'grab', maxWidth: '260px',
              maxHeight: '1000px',
              overflow: 'auto',
            }}
        >
            <div className="panel-handle" onMouseDown={handleMouseDown}>
    <h3>{title}</h3>
    {onClose && (
        <button 
            onClick={onClose} 
            className="close-button" 
            style={{position: 'absolute', top: '16px', right: '16px', zIndex: 1}}
        >
            &times;
        </button>
    )}
</div>
            {children}
        </div>
    );
};

const Legend = () => (
    <div className="legend-panel">
        <h4>Regional Health</h4>
        <div className="legend-item">
            <div className="legend-color-box" style={{ background: 'rgb(46, 204, 113)' }}></div>
            <span>Good (70-100)</span>
        </div>
        <div className="legend-item">
            <div className="legend-color-box" style={{ background: 'rgb(241, 196, 15)' }}></div>
            <span>Moderate (40-69)</span>
        </div>
        <div className="legend-item">
            <div className="legend-color-box" style={{ background: 'rgb(231, 76, 60)' }}></div>
            <span>Poor (&lt; 40)</span>
        </div>
    </div>
);

const PaletteItem = ({ item, onDragStart, onDragEnd }) => {
  const [isDragging, setIsDragging] = useState(false);
  const handleDragStart = (e) => { setIsDragging(true); e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('application/json', JSON.stringify(item)); onDragStart(item); };
  const handleDragEnd = () => { setIsDragging(false); onDragEnd(); };
  return ( <div draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} className="palette-item" style={{ opacity: isDragging ? 0.4 : 1, transform: isDragging ? 'scale(0.95)' : 'scale(1)' }}> <span style={{ fontSize: '24px', marginRight: '16px' }}>{item.icon}</span> <div> <div style={{ fontSize: '15px', color: THEME.textPrimary }}>{item.name}</div> <div style={{ fontSize: '12px', color: THEME.textSecondary, marginTop: '2px', textTransform: 'capitalize' }}>{item.type}</div> </div> </div> );
};

const Guide = ({ currentStep, setStep, refs }) => {
    const guideBoxRef = useRef(null); const [arrowProps, setArrowProps] = useState(null); const steps = [ { title: "Welcome!", text: "This guide will walk you through the Urban Canvas AI.", target: null }, { title: "Design Palette", text: "Drag items like trees or solar panels from this panel directly onto the 3D map.", target: 'palettePanel' }, { title: "3D Viewport", text: "When you drag an item over the map, an area will be highlighted. Drop it to place it and see the impact.", target: null }, { title: "Urban Score", text: "As you make changes, our AI analyzes your design's impact. Watch your score change!", target: 'scorePanel' }, { title: "You're All Set!", text: "Now you're ready to start designing a greener Chicago. Enjoy!", target: null } ]; useEffect(() => { if (currentStep === null || !steps[currentStep].target) { setArrowProps(null); return; } const calculateArrow = () => { const step = steps[currentStep]; const targetRef = refs[step.target]; if (!guideBoxRef.current || !targetRef?.current) { setArrowProps(null); return; } const fromRect = guideBoxRef.current.getBoundingClientRect(); const toRect = targetRef.current.getBoundingClientRect(); const isTargetLeft = toRect.left < fromRect.left; setArrowProps({ x1: isTargetLeft ? fromRect.left : fromRect.right, y1: fromRect.top + fromRect.height / 2, x2: isTargetLeft ? toRect.right + 10 : toRect.left - 10, y2: toRect.top + toRect.height / 2 }); }; calculateArrow(); window.addEventListener('resize', calculateArrow); return () => window.removeEventListener('resize', calculateArrow); }, [currentStep, refs]); if (currentStep === null) return null; const step = steps[currentStep]; const isCentered = !step.target; const positionStyle = isCentered ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } : (step.target === 'palettePanel' ? { top: '200px', left: '380px' } : { top: '200px', right: '400px' }); return ( <div className="guide-overlay"> {arrowProps && ( <svg style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 2999, pointerEvents: 'none' }}> <defs> <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto"> <polygon points="0 0, 10 3.5, 0 7" fill={THEME.primary} /> </marker> </defs> <line x1={arrowProps.x1} y1={arrowProps.y1} x2={arrowProps.x2} y2={arrowProps.y2} stroke={THEME.primary} strokeWidth="2" strokeDasharray="5, 5" markerEnd="url(#arrowhead)" className="guide-arrow" /> </svg> )} <div ref={guideBoxRef} className="guide-box" style={positionStyle}> <button onClick={() => setStep(null)} className="close-button">&times;</button> <h3 style={{ margin: '0 0 12px 0', color: THEME.primary, fontSize: '20px' }}>{step.title}</h3> <p style={{ margin: '0 0 24px 0', fontSize: '14px', lineHeight: '1.6', color: THEME.textSecondary }}>{step.text}</p> <button onClick={() => { currentStep < steps.length - 1 ? setStep(currentStep + 1) : setStep(null); }} className="guide-button"> {currentStep < steps.length - 1 ? `Next` : "Finish"} </button> </div> </div> );
};

// Add this helper function before ChicagoUrbanPlanner component
const animateFallingEntity = (viewer, entity, startHeight, duration = 2000) => {
    const startPosition = entity.position.getValue(Cesium.JulianDate.now());
    const startCartographic = Cesium.Cartographic.fromCartesian(startPosition);
    const endCartographic = new Cesium.Cartographic(
        startCartographic.longitude,
        startCartographic.latitude,
        startCartographic.height
    );
    const startCartographicWithHeight = new Cesium.Cartographic(
        startCartographic.longitude,
        startCartographic.latitude,
        startCartographic.height + startHeight
    );

    const startTime = performance.now();
    
    const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease-out cubic
        
        const currentHeight = startCartographicWithHeight.height + 
            (endCartographic.height - startCartographicWithHeight.height) * easeProgress;
        
        const currentCartographic = new Cesium.Cartographic(
            startCartographic.longitude,
            startCartographic.latitude,
            currentHeight
        );
        
        entity.position = Cesium.Cartographic.toCartesian(currentCartographic);
        
        if (progress < 1 && viewer && !viewer.isDestroyed()) {
            requestAnimationFrame(animate);
        }
    };
    
    animate();
};

// --- Main Planner View ---
const ChicagoUrbanPlanner = ({ onStartGuide }) => {
    const cesiumContainerRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [cityState, setCityState] = useState({});
    
    // --- EDITED: History now stores more info for precise undo ---
    const [history, setHistory] = useState([]);
    
    const [aiScore, setAiScore] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);
    const [showAIExplain, setShowAIExplain] = useState(false);
    const [scoreKey, setScoreKey] = useState(0);

    const viewerRef = useRef(null);
    const osmBuildingsTilesetRef = useRef(null);
    const handlerRef = useRef(null);
    const highlightBlockRef = useRef(null);
    const customDataSourceRef = useRef(null);
    
    // --- NEW: State for temporary user feedback messages ---
    const [impactAnalysis, setImpactAnalysis] = useState(null);
    
    const [hiddenAreas, setHiddenAreas] = useState([]);
    const palettePanelRef = useRef(null);
    const scorePanelRef = useRef(null);
    const onStartGuideWithRefs = () => onStartGuide({ palettePanel: palettePanelRef, scorePanel: scorePanelRef });

    const [regionalScores, setRegionalScores] = useState(null);
    const [regionGeoJson, setRegionGeoJson] = useState(null);
    const [selectedRegionId, setSelectedRegionId] = useState(null);
    const [showAiScorePanel, setShowAiScorePanel] = useState(false);
    
    const [mouseCoordinates, setMouseCoordinates] = useState(null);

    const getColorStringForScore = (score) => {
        if (score >= 70) return "rgb(46, 204, 113)"; // Green
        if (score >= 40) return "rgb(241, 196, 15)";  // Yellow
        return "rgb(231, 76, 60)";     // Red
    };

    const getGlobeCoordinatesFromMovement = useCallback((movement) => {
        const viewer = viewerRef.current;
        if (!viewer) return null;
        const scene = viewer.scene;
        // Try picking a position on a 3D object first
        const pickedPosition = viewer.scene.pickPosition(movement.endPosition || movement.position);
        if (Cesium.defined(pickedPosition)) {
            return Cesium.Cartographic.fromCartesian(pickedPosition);
        }
        // Fallback to the globe surface if no object is picked
        const cartesian = scene.camera.pickEllipsoid(movement.endPosition || movement.position, scene.globe.ellipsoid);
        return cartesian ? Cesium.Cartographic.fromCartesian(cartesian) : null;
    }, []);

    // --- Main Cesium Initialization (Unchanged) ---
    useEffect(() => {
        let viewer;
        const cesiumWidgetsCss = document.createElement('link');
        cesiumWidgetsCss.href = 'https://cesium.com/downloads/cesiumjs/releases/1.117/Build/Cesium/Widgets/widgets.css';
        cesiumWidgetsCss.rel = 'stylesheet';
        document.head.appendChild(cesiumWidgetsCss);

        if (cesiumContainerRef.current && !viewerRef.current) {
            viewer = new Cesium.Viewer(cesiumContainerRef.current, {
                terrain: Cesium.Terrain.fromWorldTerrain(),
                infoBox: false,
                selectionIndicator: false,
                shouldAnimate: true,
                navigationHelpButton: false,
                baseLayerPicker: false,
                timeline: false,
                animation: false,
                geocoder: false,
                homeButton: false,
                sceneModePicker: false
            });
            viewer.bottomContainer.style.display = "none";

            viewerRef.current = viewer;
            handlerRef.current = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            customDataSourceRef.current = new Cesium.CustomDataSource('customData');
            viewer.dataSources.add(customDataSourceRef.current);
            
            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(-87.6398, 41.8681, 2350),
                orientation: { heading: Cesium.Math.toRadians(15), pitch: Cesium.Math.toRadians(-43), roll: 0 },
            });

            (async () => {
                try {
                    // Try API endpoints first, fallback to static files
                    const [regionGeometry, backendData, tileset] = await Promise.all([
                        fetch('http://localhost:5001/api/regions').then(res => {
                            if (!res.ok) throw new Error('API not available');
                            return res.json();
                        }).catch(() => fetch('/chicago-regions.json').then(res => res.json())),
                        fetch('http://localhost:5001/api/polygon-scores').then(res => {
                            if (!res.ok) throw new Error('API not available');
                            return res.json();
                        }).catch(() => fetch('/polygon_scoring_results.json').then(res => res.json())),
                        Cesium.createOsmBuildingsAsync()
                    ]);

                    setRegionGeoJson(regionGeometry);
                    
                    // Transform backend data to match frontend expectations
                    const transformedScores = transformBackendData(backendData);
                    setRegionalScores(transformedScores);

                    if (viewer && !viewer.isDestroyed()) {
                        viewer.scene.primitives.add(tileset);
                        osmBuildingsTilesetRef.current = tileset;
                    }

                } catch (error) {
                    console.error('Failed to load data:', error);
                } finally {
                    setIsLoading(false);
                }
            })();

            mockAIScoring({}).then(setAiScore);
        }
        return () => { if (viewer && !viewer.isDestroyed()) { viewer.destroy(); viewerRef.current = null; } if (document.head.contains(cesiumWidgetsCss)) { document.head.removeChild(cesiumWidgetsCss); } };
    }, []);
    
    // --- Dynamic Building Styling Effect (Unchanged) ---
    useEffect(() => {
        const tileset = osmBuildingsTilesetRef.current;
        if (!tileset || !regionalScores || !regionGeoJson) return;
        
        const conditions = [];
        regionGeoJson.features.forEach(feature => {
            const regionId = feature.properties.id;
            const scoreData = regionalScores[regionId];
            if (!scoreData) return;

            const color = getColorStringForScore(scoreData.health_score);
            const bbox = turf.bbox(feature.geometry);
            const bboxCondition = `(\${feature["cesium#longitude"]} > ${bbox[0]} && \${feature["cesium#longitude"]} < ${bbox[2]} && \${feature["cesium#latitude"]} > ${bbox[1]} && \${feature["cesium#latitude"]} < ${bbox[3]})`;
            
            conditions.push([bboxCondition, `color('${color}')`]);
        });
        
        conditions.push(['true', "color('white', 0.7)"]);
        
        let buildingShowCondition = 'true';
        if (hiddenAreas.length > 0) {
            const hideConditions = hiddenAreas.map(area =>
                `!((${'${feature["cesium#longitude"]}'} > ${area.west} && ${'${feature["cesium#longitude"]}'} < ${area.east}) && (${'${feature["cesium#latitude"]}'} > ${area.south} && ${'${feature["cesium#latitude"]}'} < ${area.north}))`
            );
            buildingShowCondition = hideConditions.join(' && ');
        }

        tileset.style = new Cesium.Cesium3DTileStyle({
            show: buildingShowCondition,
            color: { conditions: conditions }
        });

    }, [regionalScores, regionGeoJson, hiddenAreas]);

    // --- EDITED: More Robust Region Click Handler ---
    useEffect(() => {
        const viewer = viewerRef.current;
        const handler = handlerRef.current;
        if (!viewer || !handler || !regionGeoJson) return;

        handler.setInputAction((movement) => {
            const cartographic = getGlobeCoordinatesFromMovement(movement);
            if (!cartographic) {
                // If user clicks empty space, deselect region
                setShowAiScorePanel(false);
                setSelectedRegionId(null);
                return;
            }
            
            const clickLon = Cesium.Math.toDegrees(cartographic.longitude);
            const clickLat = Cesium.Math.toDegrees(cartographic.latitude);
            const clickPoint = turf.point([clickLon, clickLat]);
            
            let foundRegionId = null;
            for (const featureGeo of regionGeoJson.features) {
                if (turf.booleanPointInPolygon(clickPoint, featureGeo.geometry)) {
                    foundRegionId = featureGeo.properties.id;
                    break;
                }
            }

            if (foundRegionId) {
                // Toggle behavior: if clicking the same region, close panel. Otherwise, open it.
                if (foundRegionId === selectedRegionId) {
                    setShowAiScorePanel(false);
                    setSelectedRegionId(null);
                } else {
                    setSelectedRegionId(foundRegionId);
                    setShowAiScorePanel(true);
                }
            } else {
                // If the click was outside any defined region
                setShowAiScorePanel(false);
                setSelectedRegionId(null);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        return () => {
            if (handler && !handler.isDestroyed()) {
                 handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
            }
        };
    // --- EDITED: Dependency array is cleaner and more correct ---
    }, [regionGeoJson, getGlobeCoordinatesFromMovement, selectedRegionId]); // selectedRegionId is needed for toggle logic

    // --- Mouse Coordinate Display Handler (Unchanged) ---
    useEffect(() => {
        const viewer = viewerRef.current;
        const handler = handlerRef.current;
        if (!viewer || !handler) return;

        handler.setInputAction((movement) => {
            const cartographic = getGlobeCoordinatesFromMovement(movement);
            if (cartographic) {
                const lon = Cesium.Math.toDegrees(cartographic.longitude).toFixed(4);
                const lat = Cesium.Math.toDegrees(cartographic.latitude).toFixed(4);
                const alt = cartographic.height.toFixed(2);
                setMouseCoordinates({ lon, lat, alt });
            } else {
                setMouseCoordinates(null);
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        return () => {
            if (handler && !handler.isDestroyed()) {
                handler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
            }
        };
    }, [getGlobeCoordinatesFromMovement]);

    // Drag and Drop Logic (handleDragLeave, handleMapDragOver are unchanged)
    const handleDragLeave = useCallback(() => { const viewer = viewerRef.current; if (highlightBlockRef.current && viewer?.entities) { viewer.entities.remove(highlightBlockRef.current); highlightBlockRef.current = null; } }, []);
    const handleMapDragOver = useCallback((e) => { 
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'copy'; 
    const viewer = viewerRef.current; 
    if (!viewer || !draggedItem) return; 
    
    const cartographic = getGlobeCoordinatesFromMovement({ endPosition: new Cesium.Cartesian2(e.clientX, e.clientY) }); 
    if (!cartographic) { 
        if (highlightBlockRef.current) handleDragLeave(); 
        return; 
    } 
    
    const offset = 0.0005; 
    const centerLon = Cesium.Math.toDegrees(cartographic.longitude);
    const centerLat = Cesium.Math.toDegrees(cartographic.latitude);
    const [w, s, e_lon, n] = [centerLon - offset, centerLat - offset, centerLon + offset, centerLat + offset]; 
    
    // Create a tall box instead of flat polygon
    const boxHeight = 150; // Height of the highlight box in meters
    const groundHeight = cartographic.height;
    
    if (!highlightBlockRef.current) { 
        highlightBlockRef.current = viewer.entities.add({ 
            name: 'Highlight Block', 
            position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, groundHeight + boxHeight / 2),
            box: {
                dimensions: new Cesium.Cartesian3(
                    Cesium.Cartesian3.distance(
                        Cesium.Cartesian3.fromDegrees(w, centerLat, 0),
                        Cesium.Cartesian3.fromDegrees(e_lon, centerLat, 0)
                    ),
                    Cesium.Cartesian3.distance(
                        Cesium.Cartesian3.fromDegrees(centerLon, s, 0),
                        Cesium.Cartesian3.fromDegrees(centerLon, n, 0)
                    ),
                    boxHeight
                ),
                material: Cesium.Color.CYAN.withAlpha(0.15),
                outline: true,
                outlineColor: Cesium.Color.CYAN.withAlpha(0.9),
                outlineWidth: 3
            }
        }); 
    } else { 
        highlightBlockRef.current.position = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, groundHeight + boxHeight / 2);
        highlightBlockRef.current.box.dimensions = new Cesium.Cartesian3(
            Cesium.Cartesian3.distance(
                Cesium.Cartesian3.fromDegrees(w, centerLat, 0),
                Cesium.Cartesian3.fromDegrees(e_lon, centerLat, 0)
            ),
            Cesium.Cartesian3.distance(
                Cesium.Cartesian3.fromDegrees(centerLon, s, 0),
                Cesium.Cartesian3.fromDegrees(centerLon, n, 0)
            ),
            boxHeight
        );
    } 
}, [draggedItem, getGlobeCoordinatesFromMovement, handleDragLeave]);

    const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    const viewer = viewerRef.current; 
    const customDataSource = customDataSourceRef.current; 
    const itemData = e.dataTransfer.getData('application/json');
    setDraggedItem(null); 
    handleDragLeave();
    if (!viewer || !customDataSource || !itemData || !regionGeoJson) return;
    const item = JSON.parse(itemData);

    const cartographic = getGlobeCoordinatesFromMovement({ endPosition: new Cesium.Cartesian2(e.clientX, e.clientY) });
    if (!cartographic) return;

    const dropLon = Cesium.Math.toDegrees(cartographic.longitude);
    const dropLat = Cesium.Math.toDegrees(cartographic.latitude);
    const dropPoint = turf.point([dropLon, dropLat]);

    let targetRegion = null;
    for (const feature of regionGeoJson.features) {
        if (turf.booleanPointInPolygon(dropPoint, feature.geometry)) {
            targetRegion = feature.properties;
            break;
        }
    }
    
    const placementId = `placement_${Date.now()}`;
    const addedEntityIds = [];
    const addedHiddenArea = [];

    if (targetRegion) {
        const currentScore = regionalScores[targetRegion.id].health_score;
        const qualityMultiplier = (100 - currentScore) / 100;
        const scoreIncrease = item.impactFactor * qualityMultiplier * 5;
        const newScore = Math.min(100, currentScore + scoreIncrease);

        setRegionalScores(prevScores => ({ ...prevScores, [targetRegion.id]: { ...prevScores[targetRegion.id], health_score: newScore } }));
        setImpactAnalysis({ title: `Impact in ${regionalScores[targetRegion.id].name}`, airQuality: `+${scoreIncrease.toFixed(1)} pts`, propertyValue: `+${(Math.random()*5+2).toFixed(1)}%`, summary: `New Health Score: ${newScore.toFixed(1)}` });
        setSelectedRegionId(targetRegion.id);
        setShowAiScorePanel(true);
    } else {
        setImpactAnalysis({ title: "No Impact Calculated", summary: "The item was placed outside of a designated analysis region.", airQuality: "+0.0 pts", propertyValue: "+0.0%" });
    }
    
    let finalPosition = null; 
    let isRooftopPlacement = false;
    if (item.placement === 'rooftop') { 
        const pickedObject = viewer.scene.pick({x: e.clientX, y: e.clientY}); 
        if (pickedObject?.primitive) { 
            const pickedPosition = viewer.scene.pickPosition({x: e.clientX, y: e.clientY}); 
            if (Cesium.defined(pickedPosition)) { 
                finalPosition = pickedPosition; 
                isRooftopPlacement = true; 
            } 
        } 
    }
    if (!finalPosition) { 
        const [terrainSampledPos] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [cartographic]); 
        finalPosition = Cesium.Cartographic.toCartesian(terrainSampledPos); 
    }
    
    if (item.id === 'trees' || item.id === 'water_body') { 
        const centerCartographic = Cesium.Cartographic.fromCartesian(finalPosition); 
        const [centerLon, centerLat] = [Cesium.Math.toDegrees(centerCartographic.longitude), Cesium.Math.toDegrees(centerCartographic.latitude)]; 
        const offset = 0.0005; 
        const [w, s, e_lon, n] = [centerLon - offset, centerLat - offset, centerLon + offset, centerLat + offset]; 
        const newHiddenArea = { west: w, south: s, east: e_lon, north: n, placementId }; 
        addedHiddenArea.push(newHiddenArea); 
        setHiddenAreas(prev => [...prev, newHiddenArea]); 
        
        if (item.id === 'trees') { 
            const positions = Array.from({ length: 20 }, () => Cesium.Cartographic.fromDegrees(w + Math.random() * (e_lon - w), s + Math.random() * (n - s))); 
            const updatedPos = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, positions); 
            updatedPos.forEach((carto) => { 
                const entity = customDataSource.entities.add({ 
                    id: `${placementId}_${addedEntityIds.length}`, 
                    model: { uri: item.modelUri, scale: item.scale }, 
                    position: Cesium.Cartographic.toCartesian(carto) 
                }); 
                addedEntityIds.push(entity.id);
                animateFallingEntity(viewer, entity, 500, 1500);
            }); 
        } else { 
            const entity = customDataSource.entities.add({ 
                id: `${placementId}_0`, 
                model: { uri: item.modelUri, scale: item.scale }, 
                position: finalPosition 
            }); 
            addedEntityIds.push(entity.id);
            animateFallingEntity(viewer, entity, 600, 2000);
        } 
    } else { 
        let positionWithOffset = finalPosition; 
        if (isRooftopPlacement) { 
            const heightOffset = 1.0; 
            const surfaceNormal = Cesium.Cartesian3.normalize(finalPosition, new Cesium.Cartesian3()); 
            const offsetVector = Cesium.Cartesian3.multiplyByScalar(surfaceNormal, heightOffset, new Cesium.Cartesian3()); 
            positionWithOffset = Cesium.Cartesian3.add(finalPosition, offsetVector, new Cesium.Cartesian3()); 
        } 
        const entity = customDataSource.entities.add({ 
            id: `${placementId}_0`, 
            model: { uri: item.modelUri, scale: item.scale }, 
            position: positionWithOffset 
        }); 
        addedEntityIds.push(entity.id);
        animateFallingEntity(viewer, entity, 300, 1200);
    }

    const parcelId = `parcel_${Date.now()}`; 
    const newState = { ...cityState, [parcelId]: item }; 
    setHistory([...history, { cityState, entityIds: addedEntityIds, hiddenArea: addedHiddenArea[0], regionalScores }]);
    setCityState(newState);
}, [getGlobeCoordinatesFromMovement, handleDragLeave, cityState, history, regionGeoJson, regionalScores]);

    // --- EDITED: Precise Undo function ---
    const handleUndo = () => {
        if (history.length === 0) return;

        const lastAction = history[history.length - 1];
        const newHistory = history.slice(0, -1);
        
        // Revert city state and history
        setCityState(lastAction.cityState);
        setHistory(newHistory);
        
        // Revert regional scores to their previous state
        setRegionalScores(lastAction.regionalScores);

        // Remove the specific entities from the last action
        if (customDataSourceRef.current) {
            lastAction.entityIds.forEach(id => {
                const entity = customDataSourceRef.current.entities.getById(id);
                if (entity) {
                    customDataSourceRef.current.entities.remove(entity);
                }
            });
        }
        
        // Remove the specific hidden area from the last action
        if (lastAction.hiddenArea) {
            setHiddenAreas(prev => prev.filter(area => area.placementId !== lastAction.hiddenArea.placementId));
        }

        // Close panels that might be open from the last action
        setImpactAnalysis(null);
    };

    const handleExport = () => { const data = { ts: new Date().toISOString(), cityState, aiScore, regionalScores }; const str = JSON.stringify(data, null, 2); const blob = new Blob([str], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'chicago-design.json'; a.click(); URL.revokeObjectURL(url); };

    // --- EDITED: Memoized for performance with real backend data ---
    const currentAiScoreDisplay = React.useMemo(() => {
        if (selectedRegionId && regionalScores && regionalScores[selectedRegionId]) {
            const regionData = regionalScores[selectedRegionId];
            return {
                overall_score: regionData.health_score.toFixed(0),
                categories: {
                    AQI: regionData.aqi_score.toFixed(0),
                    Temperature: regionData.temperature_score.toFixed(0),
                    Humidity: regionData.humidity_score.toFixed(0),
                },
                summary: regionData.health_score >= 70 ? 'This region boasts excellent environmental health!' :
                         regionData.health_score >= 40 ? 'Moderate environmental health. Consider improvements for a greener future.' :
                         'This region requires significant environmental improvements.',
                regionName: regionData.name,
                colorCode: regionData.color_code
            };
        }
        return aiScore;
    }, [selectedRegionId, regionalScores, aiScore]);


    // --- RETURN JSX (unchanged from your original) ---
    return (
        <>
            <div className="planner-container">
                <div ref={cesiumContainerRef} onDragOver={handleMapDragOver} onDrop={handleDrop} onDragLeave={handleDragLeave} className="cesium-container" />
                
                <button 
                    onClick={() => setShowAIExplain(true)} 
                    style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 1000, padding: '8px 16px', background: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22c55e', borderRadius: '6px', color: '#22c55e', fontSize: '14px', cursor: 'pointer', backdropFilter: 'blur(10px)'}}
                >
                    🤖 AI Explain
                </button>
                
                <Legend />

                {mouseCoordinates && (
                    <div className="coordinates-display">
                        <span>Lon: {mouseCoordinates.lon}°</span>
                        <span>Lat: {mouseCoordinates.lat}°</span>
                        <span>Alt: {mouseCoordinates.alt} m</span>
                    </div>
                )}

                {isLoading && <div className="loading-overlay"> <div className="spinner" /> <h1>Loading Chicago...</h1> </div>}

                <DraggablePanel title="Design Palette" initialPosition={{ x: 20, y: 20 }} panelRef={palettePanelRef}>
                    <p style={{ fontSize: '12px', color: THEME.textSecondary, marginBottom: '16px' }}>Drag items onto the map</p>
                    {PALETTE_ITEMS.map(item => <PaletteItem key={item.id} item={item} onDragStart={setDraggedItem} onDragEnd={() => setDraggedItem(null)} />)}
                    <div className="panel-actions">
                        <button onClick={handleUndo} disabled={history.length === 0} className="action-button primary">Undo ({history.length})</button>
                        <button onClick={handleExport} className="action-button secondary">Export Design</button>
                    </div>
                </DraggablePanel>
                
                {showAiScorePanel && currentAiScoreDisplay && (
    <DraggablePanel 
        title={`What Ifs: ${currentAiScoreDisplay.regionName || 'Overall'}`} 
        initialPosition={{ x: window.innerWidth - 300, y: 80 }} 
        panelRef={scorePanelRef}
        onClose={() => setShowAiScorePanel(false)}
    >
        <div className="score-card" style={{padding: '16px', marginBottom: '12px'}}>
            <div key={scoreKey} className="score-value pulse-glow" style={{ 
                color: getColorStringForScore(currentAiScoreDisplay.overall_score),
                fontSize: '42px'
            }}>
                {currentAiScoreDisplay.overall_score}
            </div>
            <div className="score-label">Health Score</div>
        </div>
        
        <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
            {Object.entries(currentAiScoreDisplay.categories).map(([key, value]) => (
                <div key={key} className="category-card" style={{
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '10px 14px'
                }}>
                    <div className="category-label" style={{
                        fontSize: '13px',
                        textAlign: 'left',
                        textTransform: 'capitalize'
                    }}>{key}</div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <span style={{fontSize: '16px', color: THEME.primary}}>
                            {Math.random() > 0.5 ? '↑' : '↓'}
                        </span>
                        <div className="category-value" style={{fontSize: '22px'}}>{value}</div>
                    </div>
                </div>
            ))}
            
            {/* Overall Change - Highlighted */}
            {impactAnalysis && (
                <div style={{
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '12px 14px',
                    background: 'rgba(74, 222, 128, 0.2)',
                    border: '1px solid ' + THEME.primary,
                    borderRadius: '8px',
                    marginTop: '4px'
                }}>
                    <div style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        textAlign: 'left',
                        color: THEME.primary
                    }}>Overall Change</div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <span style={{fontSize: '18px', color: THEME.primary}}>
                            {impactAnalysis.airQuality.startsWith('+') ? '↑' : '↓'}
                        </span>
                        <div style={{fontSize: '22px', fontWeight: '700', color: THEME.primary}}>
                            {impactAnalysis.airQuality}
                        </div>
                    </div>
                </div>
            )}
        </div>
    </DraggablePanel>
)}

            </div>
            
            <SimpleAIExplain 
                cityState={cityState}
                aiScore={aiScore}
                impactAnalysis={impactAnalysis}
                visible={showAIExplain}
                onClose={() => setShowAIExplain(false)}
            />
        </>
    );
};
const LandingPage = ({ onStart }) => { 
    const mountRef = useRef(null); 
    
    useEffect(() => { 
        if (!mountRef.current) return; 
        const mount = mountRef.current; 
        let renderer; 
        
        try { 
            const scene = new THREE.Scene(); 
            const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000); 
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); 
            renderer.setSize(mount.clientWidth, mount.clientHeight); 
            renderer.setPixelRatio(window.devicePixelRatio); 
            mount.appendChild(renderer.domElement); 
            
            // Main torus
            const torusGeom = new THREE.TorusGeometry(1.8, 0.5, 32, 100); 
            const torusMat = new THREE.MeshStandardMaterial({ color: THEME.primary, wireframe: true }); 
            const torus = new THREE.Mesh(torusGeom, torusMat); 
            scene.add(torus); 
            
            // Add floating cubes
            const cubes = [];
            for (let i = 0; i < 12; i++) {
                const size = Math.random() * 0.3 + 0.2;
                const cubeGeom = new THREE.BoxGeometry(size, size, size);
                const cubeMat = new THREE.MeshStandardMaterial({ 
                    color: THEME.primary, 
                    wireframe: true,
                    transparent: true,
                    opacity: 0.6
                });
                const cube = new THREE.Mesh(cubeGeom, cubeMat);
                cube.position.set(
                    (Math.random() - 0.5) * 15,
                    (Math.random() - 0.5) * 10,
                    (Math.random() - 0.5) * 10
                );
                cube.userData.speed = Math.random() * 0.01 + 0.005;
                cube.userData.rotSpeed = Math.random() * 0.02 + 0.01;
                cubes.push(cube);
                scene.add(cube);
            }
            

            // Particle system
            const particleCount = 200;
            const particleGeom = new THREE.BufferGeometry();
            const positions = new Float32Array(particleCount * 3);
            const velocities = [];
            
            for (let i = 0; i < particleCount; i++) {
                positions[i * 3] = (Math.random() - 0.5) * 30;
                positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
                positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
                velocities.push({
                    x: (Math.random() - 0.5) * 0.02,
                    y: (Math.random() - 0.5) * 0.02,
                    z: (Math.random() - 0.5) * 0.02
                });
            }
            
            particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const particleMat = new THREE.PointsMaterial({ 
                color: THEME.primary, 
                size: 0.08,
                transparent: true,
                opacity: 0.6,
                blending: THREE.AdditiveBlending
            });
            const particles = new THREE.Points(particleGeom, particleMat);
            scene.add(particles);
            
            // Lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); 
            scene.add(ambientLight); 
            
            const pointLight1 = new THREE.PointLight(THEME.primary, 2); 
            pointLight1.position.set(5, 5, 5); 
            scene.add(pointLight1); 
            
            const pointLight2 = new THREE.PointLight(0x4ade80, 1.5); 
            pointLight2.position.set(-5, -3, 3); 
            scene.add(pointLight2); 
            
            camera.position.z = 5; 
            
            const handleResize = () => { 
                camera.aspect = mount.clientWidth / mount.clientHeight; 
                camera.updateProjectionMatrix(); 
                renderer.setSize(mount.clientWidth, mount.clientHeight); 
            }; 
            window.addEventListener('resize', handleResize); 
            // hi 
            let animationFrameId;
            let time = 0;
            
            const animate = () => { 
                animationFrameId = requestAnimationFrame(animate); 
                time += 0.01;
                
                // Animate main torus
                torus.rotation.x += 0.002; 
                torus.rotation.y += 0.003; 
                torus.rotation.z -= 0.001; 
                
                // Animate cubes
                cubes.forEach(cube => {
                    cube.rotation.x += cube.userData.rotSpeed;
                    cube.rotation.y += cube.userData.rotSpeed;
                    cube.position.y += Math.sin(time + cube.position.x) * 0.005;
                });
                
                // Animate particles
                const pos = particles.geometry.attributes.position.array;
                for (let i = 0; i < particleCount; i++) {
                    pos[i * 3] += velocities[i].x;
                    pos[i * 3 + 1] += velocities[i].y;
                    pos[i * 3 + 2] += velocities[i].z;
                    
                    // Boundary check and reverse
                    if (Math.abs(pos[i * 3]) > 15) velocities[i].x *= -1;
                    if (Math.abs(pos[i * 3 + 1]) > 10) velocities[i].y *= -1;
                    if (Math.abs(pos[i * 3 + 2]) > 10) velocities[i].z *= -1;
                }
                particles.geometry.attributes.position.needsUpdate = true;
                
                // Animate lights
                pointLight1.position.x = Math.sin(time * 0.5) * 7;
                pointLight1.position.z = Math.cos(time * 0.5) * 7;
                
                renderer.render(scene, camera); 
            }; 
            animate(); 
            
            return () => { 
                window.removeEventListener('resize', handleResize); 
                cancelAnimationFrame(animationFrameId); 
                if (renderer) renderer.dispose(); 
                if (mount && renderer.domElement) mount.removeChild(renderer.domElement); 
            }; 
        } catch (error) { 
            console.error("Failed to create WebGL context for landing page:", error); 
            if (renderer && mount && renderer.domElement) mount.removeChild(renderer.domElement); 
        } 
    }, []); 
    
    return ( 
        <div className="landing-container"> 
            <div ref={mountRef} className="landing-background" /> 
            <div className="landing-content"> 
                <h1 className="landing-title">UrbanX Canvas <sup>AI</sup></h1> 
                <p className="landing-subtitle">Reimagine Chicago's future. Utilize generative AI to design a sustainable and vibrant urban landscape. Your vision, powered by data.</p> 
                <button onClick={onStart} className="landing-button"> 
                    Start Designing <span>&rarr;</span> 
                </button> 
            </div> 
        </div> 
    ); 
};
// --- App Component (Parent) ---
const App = () => {
    const [view, setView] = useState('landing');
    const [guideStep, setGuideStep] = useState(null);
    const [guideRefs, setGuideRefs] = useState({});
    const startPlanner = () => setView('planner');
    const startGuide = (refs) => { setGuideRefs(refs); setGuideStep(0); };

    return (
        <div style={{ width: '100vw', height: '100vh', background: THEME.background }}>
            <style>{`
                :root { --primary: ${THEME.primary}; --background: ${THEME.background}; --panel-bg: ${THEME.panelBackground}; --panel-border: ${THEME.panelBorder}; --text-primary: ${THEME.textPrimary}; --text-secondary: ${THEME.textSecondary}; }
                body { margin: 0; font-family: 'Inter', sans-serif; background-color: var(--background); color: var(--text-primary); }
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');

                .landing-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
                .landing-background { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; }
                .landing-content { text-align: center; z-index: 2; animation: fadeIn 2s ease-out; }
                .landing-title { font-size: 4.5rem; font-weight: 800; margin: 0 0 1rem 0; letter-spacing: -2px; }
                .landing-title sup { font-size: 1.5rem; color: var(--primary); }
                .landing-subtitle { font-size: 1.2rem; max-width: 600px; margin: 0 auto 2.5rem auto; color: var(--text-secondary); line-height: 1.7; }
                .landing-button { padding: 1rem 2.5rem; font-size: 1.1rem; font-weight: bold; color: var(--background); background: var(--primary); border: none; border-radius: 50px; cursor: pointer; box-shadow: 0 4px 20px rgba(74, 222, 128, 0.4); transition: all 0.3s ease; }
                .landing-button:hover { transform: translateY(-3px); box-shadow: 0 8px 25px rgba(74, 222, 128, 0.5); }
                .landing-button span { margin-left: 10px; transition: transform 0.3s ease; display: inline-block; }
                .landing-button:hover span { transform: translateX(5px); }
                .planner-container { width: 100%; height: 100%; position: relative; overflow: hidden; }
                .cesium-container { width: 100%; height: 100%; position: absolute; top: 0; left: 0; }
                .cesium-widget-credits, .cesium-viewer-toolbar, .cesium-viewer-bottom { display: none !important; }
                .cesium-viewer-animationContainer, .cesium-viewer-timelineContainer, .cesium-viewer-fullscreenContainer, .cesium-performanceDisplay-default, .cesium-widget-credits { display: none !important; }
                .loading-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--panel-bg); padding: 32px 48px; border-radius: 16px; border: 1px solid var(--panel-border); text-align: center; z-index: 2000; backdrop-filter: blur(10px); }
                .loading-overlay h1 { color: var(--text-primary); font-size: 18px; margin: 0; }
                .spinner { width: 50px; height: 50px; border: 4px solid var(--panel-border); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
                
                .panel { position: absolute; background: var(--panel-bg); backdrop-filter: blur(12px); border-radius: 16px; border: 1px solid var(--panel-border); color: var(--text-primary); box-shadow: ${THEME.shadow}; z-index: 100; padding: 0 20px 20px 20px; max-height: calc(100vh - 40px); overflow-y: hidden; width: 320px; display: flex; flex-direction: column; }
                .panel.draggable-panel { animation: fadeIn 0.5s ease-out; }
                .panel-handle { cursor: grab; padding: 16px 0; }
                .panel-handle:active { cursor: grabbing; }
                .panel-handle h3 { margin: 0; color: var(--primary); font-size: 20px; font-weight: 700; border-bottom: 1px solid var(--panel-border); padding-bottom: 12px; }
                .panel-content { overflow-y: auto; }
                
                .palette-item { display: flex; align-items: center; padding: 12px 16px; margin: 8px 0; background-color: rgba(255, 255, 255, 0.05); border-radius: 8px; cursor: move; border: 1px solid transparent; transition: all 0.3s ease; }
                .palette-item:hover { border-color: var(--primary); background: rgba(74, 222, 128, 0.1); transform: translateX(5px); }
                .panel-actions { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--panel-border); }
                .action-button { width: 100%; padding: 12px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; }
                .action-button.primary { background: var(--primary); color: var(--background); }
                .action-button.primary:disabled { background: rgba(255, 255, 255, 0.1); color: var(--text-secondary); cursor: not-allowed; }
                .action-button.primary:hover:not(:disabled) { filter: brightness(1.2); }
                .action-button.secondary { background: transparent; border: 1px solid var(--primary); color: var(--primary); margin-top: 8px; }
                .action-button.secondary:hover { background: var(--primary); color: var(--background); }
                
                .score-card { background: rgba(74, 222, 128, 0.1); padding: 20px; border-radius: 12px; margin-bottom: 16px; text-align: center; }
                .score-value { font-size: 52px; font-weight: 700; }
                .score-label { font-size: 14px; color: var(--text-secondary); }
                .categories-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
                .category-card { background: rgba(255, 255, 255, 0.05); padding: 12px; border-radius: 8px; text-align: center; }
                .category-value { font-size: 24px; font-weight: 700; color: var(--primary); }
                .category-label { font-size: 11px; color: var(--text-secondary); text-transform: capitalize; }
                .summary-card { background: rgba(255, 255, 255, 0.05); border: 1px solid var(--panel-border); padding: 12px; border-radius: 8px; font-size: 13px; color: var(--text-primary); line-height: 1.6; }
                
                .impact-panel { position: absolute; width: 450px; bottom: 20px; left: 50%; transform: translateX(-50%); animation: slideInUp 0.5s ease-out; }
                .panel-header { display: flex; justify-content: space-between; align-items: center; }
                .close-button { background: transparent; border: none; color: var(--text-secondary); font-size: 24px; cursor: pointer; line-height: 1; padding: 0; }
                .impact-metrics { display: flex; gap: 16px; margin-top: 12px; text-align: center; }
                .metric-card { background: rgba(74, 222, 128, 0.1); padding: 12px; border-radius: 8px; flex: 1; }
                .metric-value { font-size: 20px; font-weight: bold; color: var(--text-primary); }
                .metric-label { font-size: 12px; color: var(--text-secondary); }
                
                .guide-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); z-index: 3000; backdrop-filter: blur(5px); }
                .guide-box { position: absolute; background: var(--panel-bg); backdrop-filter: blur(12px); box-shadow: ${THEME.shadow}; padding: 24px; border-radius: 12px; border: 1px solid var(--panel-border); width: 280px; color: white; animation: fadeIn 0.5s ease; z-index: 3001; }
                .guide-button { padding: 10px 20px; background: var(--primary); border: none; border-radius: 8px; color: var(--background); font-weight: 600; cursor: pointer; transition: transform 0.2s; }
                .guide-button:hover { transform: scale(1.05); }
                .guide-arrow { animation: dash 2s linear infinite; }
                
                .legend-panel { position: absolute; bottom: 20px; right: 20px; background: var(--panel-bg); backdrop-filter: blur(12px); border-radius: 12px; border: 1px solid var(--panel-border); padding: 12px 16px; z-index: 100; box-shadow: ${THEME.shadow}; animation: slideInRight 0.7s ease-out; }
                .legend-panel h4 { margin: 0 0 10px 0; font-size: 14px; color: var(--text-primary); font-weight: 600; }
                .legend-item { display: flex; align-items: center; margin-bottom: 6px; }
                .legend-item:last-child { margin-bottom: 0; }
                .legend-color-box { width: 16px; height: 16px; border-radius: 4px; margin-right: 10px; border: 1px solid rgba(255, 255, 255, 0.2); }
                .legend-item span { font-size: 12px; color: var(--text-secondary); }

                /* NEW: Coordinates Display */
                .coordinates-display { position: absolute; bottom: 20px; left: 20px; background: var(--panel-bg); backdrop-filter: blur(12px); border-radius: 12px; border: 1px solid var(--panel-border); padding: 8px 12px; z-index: 100; box-shadow: ${THEME.shadow}; color: var(--text-secondary); font-size: 12px; display: flex; gap: 16px; animation: slideInLeft 0.7s ease-out; }
                .coordinates-display span { font-family: monospace; }
                
                /* Animations */
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slideInLeft { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
                @keyframes slideInRight { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
                @keyframes slideInUp { from { opacity: 0; transform: translate(-50%, 30px); } to { opacity: 1; transform: translate(-50%, 0); } }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse-glow { 0%, 100% { transform: scale(1); text-shadow: 0 0 5px transparent; } 50% { transform: scale(1.05); text-shadow: 0 0 20px var(--primary); } }
                @keyframes dash { to { stroke-dashoffset: -20; } }
            `}</style>
            
            {view === 'landing' ? ( <LandingPage onStart={startPlanner} /> ) : ( <> <ChicagoUrbanPlanner onStartGuide={startGuide} /> <Guide currentStep={guideStep} setStep={setGuideStep} refs={guideRefs} /> </> )}
        </div>
    );
};

export default App;