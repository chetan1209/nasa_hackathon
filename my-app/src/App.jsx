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
    { id: 'trees', name: 'Add Park', icon: '🌳', type: 'vegetation', placement: 'ground', modelUri: '/tree.glb', scale: 2.5, impactFactor: 2.0 },
    { id: 'cool_roof', name: 'Add Reflective Surfaces', icon: '⬜', type: 'building', placement: 'rooftop', modelUri: '/cool_roof.glb', scale: 8, impactFactor: 1.0 },
    { id: 'water_body', name: 'Add Water Body', icon: '💧', type: 'water', placement: 'ground', modelUri: '/fountain.glb', scale: 15, impactFactor: 2.2 }
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


// --- UI Components ---

const DraggablePanel = ({ children, title, initialPosition, panelRef }) => {
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
            style={{ left: position.x, top: position.y, cursor: isDragging ? 'grabbing' : 'grab' }}
        >
            <div className="panel-handle" onMouseDown={handleMouseDown}>
                <h3>{title}</h3>
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
  return ( <div draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} className="palette-item" style={{ opacity: isDragging ? 0.4 : 1, transform: isDragging ? 'scale(0.95)' : 'scale(1)' }}> <span style={{ fontSize: '24px', marginRight: '16px' }}>{item.icon}</span> <div> <div style={{ fontSize: '15px', fontWeight: 600, color: THEME.textPrimary }}>{item.name}</div> <div style={{ fontSize: '12px', color: THEME.textSecondary, marginTop: '2px', textTransform: 'capitalize' }}>{item.type}</div> </div> </div> );
};

const Guide = ({ currentStep, setStep, refs }) => {
    const guideBoxRef = useRef(null); const [arrowProps, setArrowProps] = useState(null); const steps = [ { title: "Welcome!", text: "This guide will walk you through the Urban Canvas AI.", target: null }, { title: "Design Palette", text: "Drag items like trees or solar panels from this panel directly onto the 3D map.", target: 'palettePanel' }, { title: "3D Viewport", text: "When you drag an item over the map, an area will be highlighted. Drop it to place it and see the impact.", target: null }, { title: "AI Urban Score", text: "As you make changes, our AI analyzes your design's impact. Watch your score change!", target: 'scorePanel' }, { title: "You're All Set!", text: "Now you're ready to start designing a greener Chicago. Enjoy!", target: null } ]; useEffect(() => { if (currentStep === null || !steps[currentStep].target) { setArrowProps(null); return; } const calculateArrow = () => { const step = steps[currentStep]; const targetRef = refs[step.target]; if (!guideBoxRef.current || !targetRef?.current) { setArrowProps(null); return; } const fromRect = guideBoxRef.current.getBoundingClientRect(); const toRect = targetRef.current.getBoundingClientRect(); const isTargetLeft = toRect.left < fromRect.left; setArrowProps({ x1: isTargetLeft ? fromRect.left : fromRect.right, y1: fromRect.top + fromRect.height / 2, x2: isTargetLeft ? toRect.right + 10 : toRect.left - 10, y2: toRect.top + toRect.height / 2 }); }; calculateArrow(); window.addEventListener('resize', calculateArrow); return () => window.removeEventListener('resize', calculateArrow); }, [currentStep, refs]); if (currentStep === null) return null; const step = steps[currentStep]; const isCentered = !step.target; const positionStyle = isCentered ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } : (step.target === 'palettePanel' ? { top: '200px', left: '380px' } : { top: '200px', right: '400px' }); return ( <div className="guide-overlay"> {arrowProps && ( <svg style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 2999, pointerEvents: 'none' }}> <defs> <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto"> <polygon points="0 0, 10 3.5, 0 7" fill={THEME.primary} /> </marker> </defs> <line x1={arrowProps.x1} y1={arrowProps.y1} x2={arrowProps.x2} y2={arrowProps.y2} stroke={THEME.primary} strokeWidth="2" strokeDasharray="5, 5" markerEnd="url(#arrowhead)" className="guide-arrow" /> </svg> )} <div ref={guideBoxRef} className="guide-box" style={positionStyle}> <button onClick={() => setStep(null)} className="close-button">&times;</button> <h3 style={{ margin: '0 0 12px 0', color: THEME.primary, fontSize: '20px' }}>{step.title}</h3> <p style={{ margin: '0 0 24px 0', fontSize: '14px', lineHeight: '1.6', color: THEME.textSecondary }}>{step.text}</p> <button onClick={() => { currentStep < steps.length - 1 ? setStep(currentStep + 1) : setStep(null); }} className="guide-button"> {currentStep < steps.length - 1 ? `Next` : "Finish"} </button> </div> </div> );
};

// --- Main Planner View ---
const ChicagoUrbanPlanner = ({ onStartGuide }) => {
    const cesiumContainerRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [cityState, setCityState] = useState({});
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
    const [impactAnalysis, setImpactAnalysis] = useState(null);
    const [hiddenAreas, setHiddenAreas] = useState([]);
    const palettePanelRef = useRef(null);
    const scorePanelRef = useRef(null);
    const groundPlanesRef = useRef({});
    const onStartGuideWithRefs = () => onStartGuide({ palettePanel: palettePanelRef, scorePanel: scorePanelRef });

    const [regionalScores, setRegionalScores] = useState(null);
    const [regionGeoJson, setRegionGeoJson] = useState(null);
    const [selectedRegionId, setSelectedRegionId] = useState(null);
    const [showAiScorePanel, setShowAiScorePanel] = useState(false);
    
    // --- NEW --- State for mouse coordinates
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
        const pickedObject = viewer.scene.pick(movement.endPosition);
        if (Cesium.defined(pickedObject)) {
            const pickedPosition = viewer.scene.pickPosition(movement.endPosition);
            if (Cesium.defined(pickedPosition)) {
                return Cesium.Cartographic.fromCartesian(pickedPosition);
            }
        }
        const cartesian = scene.camera.pickEllipsoid(movement.endPosition, scene.globe.ellipsoid);
        return cartesian ? Cesium.Cartographic.fromCartesian(cartesian) : null;
    }, []);

    // --- Main Cesium Initialization ---
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
                    const [regionGeometry, healthData, tileset] = await Promise.all([
                        fetch('/chicago-regions.json').then(res => res.json()),
                        fetch('/health-scores.json').then(res => res.json()),
                        Cesium.createOsmBuildingsAsync()
                    ]);

                    setRegionGeoJson(regionGeometry);
                    setRegionalScores(healthData);

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
    
    // --- NEW & IMPROVED DYNAMIC STYLING EFFECT (ensures all buildings in polygon are colored) ---
    useEffect(() => {
        const tileset = osmBuildingsTilesetRef.current;
        if (!tileset || !regionalScores || !regionGeoJson) return;
        
        const conditions = [];

        regionGeoJson.features.forEach(feature => {
            const regionId = feature.properties.id;
            const scoreData = regionalScores[regionId];
            if (!scoreData) return;

            const color = getColorStringForScore(scoreData.health_score);
            
            const bbox = turf.bbox(feature.geometry); // [minLon, minLat, maxLon, maxLat]
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

    // --- Region Click Handler ---
    useEffect(() => {
        const viewer = viewerRef.current;
        const handler = handlerRef.current;
        if (!viewer || !handler || !regionGeoJson || !regionalScores) return;

        handler.setInputAction((movement) => {
            const pickedObject = viewer.scene.pick(movement.position);
            if (Cesium.defined(pickedObject) && pickedObject.id instanceof Cesium.Cesium3DTileFeature) {
                const feature = pickedObject.id;
                const lon = feature.getProperty("cesium#longitude");
                const lat = feature.getProperty("cesium#latitude");

                if (Cesium.defined(lon) && Cesium.defined(lat)) {
                    const clickPoint = turf.point([lon, lat]);
                    let foundRegionId = null;

                    for (const featureGeo of regionGeoJson.features) {
                        if (turf.booleanPointInPolygon(clickPoint, featureGeo.geometry)) {
                            foundRegionId = featureGeo.properties.id;
                            break;
                        }
                    }

                    if (foundRegionId && foundRegionId !== selectedRegionId) {
                        setSelectedRegionId(foundRegionId);
                        setShowAiScorePanel(true);
                    } else if (foundRegionId === selectedRegionId) {
                        setShowAiScorePanel(false);
                        setSelectedRegionId(null);
                    }
                }
            } else {
                 setShowAiScorePanel(false);
                 setSelectedRegionId(null);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        return () => {
            handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
        };
    }, [regionGeoJson, regionalScores, selectedRegionId]);

    // --- NEW --- Mouse Coordinate Display Handler ---
    useEffect(() => {
        const viewer = viewerRef.current;
        const handler = handlerRef.current;
        if (!viewer || !handler) return;

        handler.setInputAction((movement) => {
            const cartographic = getGlobeCoordinatesFromMovement(movement);

            if (cartographic) {
                const lon = Cesium.Math.toDegrees(cartographic.longitude).toFixed(4);
                const lat = Cesium.Math.toDegrees(cartographic.latitude).toFixed(4);
                const alt = cartographic.height.toFixed(2); // Height above the WGS84 ellipsoid
                setMouseCoordinates({ lon, lat, alt });
            } else {
                setMouseCoordinates(null);
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        return () => {
            handler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        };
    }, [getGlobeCoordinatesFromMovement]);


    useEffect(() => { if (aiScore) setScoreKey(prev => prev + 1); }, [aiScore]);
    
    const handleDragLeave = useCallback(() => { const viewer = viewerRef.current; if (highlightBlockRef.current && viewer?.entities) { viewer.entities.remove(highlightBlockRef.current); highlightBlockRef.current = null; } }, []);
    
    const handleMapDragOver = useCallback((e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        const viewer = viewerRef.current;
        if (!viewer || !draggedItem) return;

        const dummyMovement = {
            endPosition: new Cesium.Cartesian2(e.clientX, e.clientY)
        };
        const cartographic = getGlobeCoordinatesFromMovement(dummyMovement);
        
        if (!cartographic) {
            if (highlightBlockRef.current) handleDragLeave();
            return;
        }
        
        const offset = 0.0005;
        const west = Cesium.Math.toDegrees(cartographic.longitude) - offset;
        const south = Cesium.Math.toDegrees(cartographic.latitude) - offset;
        const east = Cesium.Math.toDegrees(cartographic.longitude) + offset;
        const north = Cesium.Math.toDegrees(cartographic.latitude) + offset;
        const coordinates = Cesium.Cartesian3.fromDegreesArray([west, south, east, south, east, north, west, north, west, south]);
        
        if (!highlightBlockRef.current) {
            highlightBlockRef.current = viewer.entities.add({ name: 'Highlight Block', polygon: { hierarchy: coordinates, material: Cesium.Color.DODGERBLUE.withAlpha(0.4), outline: true, outlineColor: Cesium.Color.WHITE, clampToGround: true } });
        } else {
            highlightBlockRef.current.polygon.hierarchy = new Cesium.PolygonHierarchy(coordinates);
        }
    }, [draggedItem, getGlobeCoordinatesFromMovement, handleDragLeave]);
    
    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        const viewer = viewerRef.current; const customDataSource = customDataSourceRef.current; const itemData = e.dataTransfer.getData('application/json');
        setDraggedItem(null); handleDragLeave();
        if (!viewer || !customDataSource || !itemData || !regionGeoJson) return;
        const item = JSON.parse(itemData);

        const dummyMovement = {
            endPosition: new Cesium.Cartesian2(e.clientX, e.clientY)
        };
        const cartographic = getGlobeCoordinatesFromMovement(dummyMovement);
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
        
        if (targetRegion) {
            const currentScore = regionalScores[targetRegion.id].health_score;
            const qualityMultiplier = (100 - currentScore) / 100;
            const scoreIncrease = item.impactFactor * qualityMultiplier * 5;
            const newScore = Math.min(100, currentScore + scoreIncrease);

            setRegionalScores(prevScores => ({ ...prevScores, [targetRegion.id]: { ...prevScores[targetRegion.id], health_score: newScore } }));
            setImpactAnalysis({ title: `Impact in ${regionalScores[targetRegion.id].name}`, airQuality: `+${scoreIncrease.toFixed(1)} pts`, propertyValue: `+${(Math.random()*5+2).toFixed(1)}%`, summary: `New Health Score: ${newScore.toFixed(1)}` });
            setSelectedRegionId(targetRegion.id);
            setShowAiScorePanel(true);
        }
        
        let finalPosition = null; let isRooftopPlacement = false;
        if (item.placement === 'rooftop') { const pickedObject = viewer.scene.pick(dummyMovement.endPosition); if (pickedObject instanceof Cesium.Cesium3DTileFeature) { const pickedPosition = viewer.scene.pickPosition(dummyMovement.endPosition); if (Cesium.defined(pickedPosition)) { finalPosition = pickedPosition; isRooftopPlacement = true; } } }
        if (!finalPosition) { const [terrainSampledPos] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [cartographic]); finalPosition = Cesium.Cartographic.toCartesian(terrainSampledPos); }
        if (item.id === 'trees' || item.id === 'water_body') { const centerCartographic = Cesium.Cartographic.fromCartesian(finalPosition); const centerLon = Cesium.Math.toDegrees(centerCartographic.longitude); const centerLat = Cesium.Math.toDegrees(centerCartographic.latitude); const offset = 0.0005; const [w, s, e_lon, n] = [centerLon - offset, centerLat - offset, centerLon + offset, centerLat + offset]; setHiddenAreas(prev => [...prev, { west: w, south: s, east: e_lon, north: n }]); if (item.id === 'trees') { const positions = Array.from({ length: 20 }, () => Cesium.Cartographic.fromDegrees(w + Math.random() * (e_lon - w), s + Math.random() * (n - s))); const updatedPos = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, positions); updatedPos.forEach((carto) => { customDataSource.entities.add({ model: { uri: item.modelUri, minimumPixelSize: 32, maximumScale: 200, scale: item.scale }, position: Cesium.Cartographic.toCartesian(carto) }); }); } else { customDataSource.entities.add({ model: { uri: item.modelUri, minimumPixelSize: 64, maximumScale: 500, scale: item.scale }, position: finalPosition, orientation: Cesium.Transforms.headingPitchRollQuaternion(finalPosition, new Cesium.HeadingPitchRoll(Math.random() * 6.28, 0, 0)), }); } } else { let positionWithOffset = finalPosition; if (isRooftopPlacement) { const heightOffset = 0.5; const surfaceNormal = Cesium.Cartesian3.normalize(finalPosition, new Cesium.Cartesian3()); const offsetVector = Cesium.Cartesian3.multiplyByScalar(surfaceNormal, heightOffset, new Cesium.Cartesian3()); positionWithOffset = Cesium.Cartesian3.add(finalPosition, offsetVector, new Cesium.Cartesian3()); } customDataSource.entities.add({ model: { uri: item.modelUri, minimumPixelSize: 64, maximumScale: 500, scale: item.scale }, position: positionWithOffset, orientation: Cesium.Transforms.headingPitchRollQuaternion(positionWithOffset, new Cesium.HeadingPitchRoll(Math.random() * 6.28, 0, 0)), }); }

        const parcelId = `parcel_${Date.now()}`; const newState = { ...cityState, [parcelId]: item }; setHistory([...history, cityState]); setCityState(newState); const score = await mockAIScoring(newState); setAiScore(score);

    }, [getGlobeCoordinatesFromMovement, handleDragLeave, cityState, history, regionGeoJson, regionalScores, selectedRegionId]);

    const handleUndo = () => { if (history.length > 0) { const prevState = history[history.length - 1]; setCityState(prevState); setHistory(history.slice(0, -1)); if (customDataSourceRef.current) { customDataSourceRef.current.entities.removeAll(); } setHiddenAreas(prev => prev.slice(0, -1)); } };
    const handleExport = () => { const data = { ts: new Date().toISOString(), cityState, aiScore, regionalScores }; const str = JSON.stringify(data, null, 2); const blob = new Blob([str], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'chicago-design.json'; a.click(); URL.revokeObjectURL(url); };

    const currentAiScoreDisplay = selectedRegionId && regionalScores && regionalScores[selectedRegionId]
        ? {
            overall_score: regionalScores[selectedRegionId].health_score.toFixed(0),
            categories: {
                sustainability: Math.min(100, regionalScores[selectedRegionId].health_score + Math.floor(Math.random()*10)).toFixed(0),
                livability: Math.min(100, regionalScores[selectedRegionId].health_score + Math.floor(Math.random()*5)).toFixed(0),
                efficiency: Math.min(100, regionalScores[selectedRegionId].health_score - Math.floor(Math.random()*5)).toFixed(0),
                aesthetics: Math.min(100, regionalScores[selectedRegionId].health_score + Math.floor(Math.random()*8)).toFixed(0),
            },
            summary: regionalScores[selectedRegionId].health_score >= 70 ? 'This region boasts excellent health and sustainability!' :
                     regionalScores[selectedRegionId].health_score >= 40 ? 'Moderate health. Consider improvements for a greener future.' :
                     'This region requires significant improvements in urban health.',
            regionName: regionalScores[selectedRegionId].name
        }
        : aiScore;


    return (
        <>
            <div className="planner-container">
                <div ref={cesiumContainerRef} onDragOver={handleMapDragOver} onDrop={handleDrop} onDragLeave={handleDragLeave} className="cesium-container" />
                
                {/* AI Explain Button - Separate from original design */}
                <button 
                    onClick={() => setShowAIExplain(true)} 
                    style={{ 
                        position: 'absolute', 
                        top: '20px', 
                        right: '20px', 
                        zIndex: 1000, 
                        padding: '8px 16px', 
                        background: 'rgba(34, 197, 94, 0.2)', 
                        border: '1px solid #22c55e', 
                        borderRadius: '6px', 
                        color: '#22c55e', 
                        fontSize: '14px', 
                        cursor: 'pointer',
                        backdropFilter: 'blur(10px)'
                    }}
                >
                    🤖 AI Explain
                </button>
                
                <Legend />

                {/* --- NEW --- Coordinate Display Panel */}
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
                    <DraggablePanel title={`AI Urban Score: ${currentAiScoreDisplay.regionName || 'Overall'}`} initialPosition={{ x: window.innerWidth - 360, y: 80 }} panelRef={scorePanelRef}>
                        <div className="score-card">
                            <div key={scoreKey} className="score-value pulse-glow" style={{ color: getColorStringForScore(currentAiScoreDisplay.overall_score) }}>
                                {currentAiScoreDisplay.overall_score}
                            </div>
                            <div className="score-label">Health Score</div>
                        </div>
                        <div className="categories-grid">
                            {Object.entries(currentAiScoreDisplay.categories).map(([key, value]) => (
                                <div key={key} className="category-card">
                                    <div className="category-value">{value}</div>
                                    <div className="category-label">{key}</div>
                                </div>
                            ))}
                        </div>
                        <div className="summary-card">{currentAiScoreDisplay.summary}</div>
                    </DraggablePanel>
                )}

                {impactAnalysis && (<div className="panel slide-in-up impact-panel">
                    <div className="panel-header"><h3>{impactAnalysis.title}</h3><button onClick={() => setImpactAnalysis(null)} className="close-button">&times;</button></div> <p>{impactAnalysis.summary}</p> <div className="impact-metrics"> <div className="metric-card"> <div className="metric-value">{impactAnalysis.airQuality}</div> <div className="metric-label">Health Score Change</div> </div> <div className="metric-card"> <div className="metric-value">{impactAnalysis.propertyValue}</div> <div className="metric-label">Property Value</div> </div> </div>
                </div>)}
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

const LandingPage = ({ onStart }) => { const mountRef = useRef(null); useEffect(() => { if (!mountRef.current) return; const mount = mountRef.current; let renderer; try { const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000); renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setSize(mount.clientWidth, mount.clientHeight); renderer.setPixelRatio(window.devicePixelRatio); mount.appendChild(renderer.domElement); const geometry = new THREE.TorusGeometry(1.8, 0.5, 32, 100); const material = new THREE.MeshStandardMaterial({ color: THEME.primary, wireframe: true }); const torus = new THREE.Mesh(geometry, material); scene.add(torus); const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); scene.add(ambientLight); const pointLight = new THREE.PointLight(0xffffff, 1); pointLight.position.set(5, 5, 5); scene.add(pointLight); camera.position.z = 5; const handleResize = () => { camera.aspect = mount.clientWidth / mount.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(mount.clientWidth, mount.clientHeight); }; window.addEventListener('resize', handleResize); let animationFrameId; const animate = () => { animationFrameId = requestAnimationFrame(animate); torus.rotation.x += 0.002; torus.rotation.y += 0.003; torus.rotation.z -= 0.001; renderer.render(scene, camera); }; animate(); return () => { window.removeEventListener('resize', handleResize); cancelAnimationFrame(animationFrameId); if (renderer) renderer.dispose(); if (mount && renderer.domElement) mount.removeChild(renderer.domElement); }; } catch (error) { console.error("Failed to create WebGL context for landing page:", error); if (renderer && mount && renderer.domElement) mount.removeChild(renderer.domElement); } }, []); return ( <div className="landing-container"> <div ref={mountRef} className="landing-background" /> <div className="landing-content"> <h1 className="landing-title">Urban Canvas <sup>AI</sup></h1> <p className="landing-subtitle">Reimagine Chicago's future. Utilize generative AI to design a sustainable and vibrant urban landscape. Your vision, powered by data.</p> <button onClick={onStart} className="landing-button"> Start Designing <span>&rarr;</span> </button> </div> </div> ); };

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
                .guide-box { position: absolute; background: var(--panel-bg); backdrop-filter: blur(12px); box-shadow: ${THEME.shadow}; padding: 24px; border-radius: 12px; border: 1px solid var(--panel-border); width: 320px; color: white; animation: fadeIn 0.5s ease; z-index: 3001; }
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