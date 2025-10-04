import React, { useEffect, useRef, useState, useCallback } from 'react';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import * as Cesium from 'cesium';

// --- IMPORTANT ---
// 1. SET YOUR CESIUM ION ACCESS TOKEN HERE
//    Get one for free at https://ion.cesium.com/
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyYjhjYmQ0YS1mMjJiLTRkZmUtYjg3OS0yNGQ4Y2EwNzNhMTYiLCJpZCI6MzQ3MDIzLCJpYXQiOjE3NTk1NTEzOTN9.CT2n4lChu6SwyXuoxjd_sxRTOsPrKz-d4KLTk5P-ca0';
const PALETTE_ITEMS = [
  { id: 'tree', name: 'Tree', icon: '🌳', color: '#22c55e', type: 'vegetation' },
  { id: 'park', name: 'Park', icon: '🏞️', color: '#84cc16', type: 'vegetation' },
  { id: 'bench', name: 'Bench', icon: '🪑', color: '#a3e635', type: 'furniture' },
  { id: 'apartment', name: 'Apartment', icon: '🏢', color: '#3b82f6', type: 'building' },
  { id: 'office', name: 'Office', icon: '🏛️', color: '#8b5cf6', type: 'building' },
  { id: 'solar', name: 'Solar Panel', icon: '☀️', color: '#fbbf24', type: 'energy' },
  { id: 'road', name: 'Road', icon: '🛣️', color: '#64748b', type: 'infrastructure' }
];

// --- Mocks & Helpers ---
const mockAIScoring = (state) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const items = Object.values(state);
      const greenCount = items.filter(i => i.type === 'vegetation').length;
      const energyCount = items.filter(i => i.type === 'energy').length;
      const score = Math.min(100, 70 + greenCount * 3 + energyCount * 5);
      resolve({
        overall_score: score,
        categories: {
          sustainability: Math.min(100, 70 + greenCount * 4),
          livability: Math.min(100, 75 + greenCount * 2),
          efficiency: Math.min(100, 70 + energyCount * 8),
          aesthetics: Math.floor(Math.random() * 20) + 75
        },
        summary: score > 85 ? 'Excellent sustainability!' : 'Consider adding more green spaces.'
      });
    }, 500);
  });
};

const PaletteItem = ({ item, onDragStart }) => {
  const [isDragging, setIsDragging] = useState(false);
  const handleDragStart = (e) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    onDragStart(item);
  };
  const handleDragEnd = () => setIsDragging(false);

  return (
    <div draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} style={{ padding: '12px 16px', margin: '6px 0', background: isDragging ? 'rgba(59, 130, 246, 0.3)' : 'rgba(51, 65, 85, 0.5)', borderRadius: '8px', cursor: 'move', border: `2px solid ${item.color}`, transition: 'all 0.2s', opacity: isDragging ? 0.5 : 1, transform: isDragging ? 'scale(0.95)' : 'scale(1)', userSelect: 'none' }}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{item.icon} {item.name}</div>
      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>{item.type}</div>
    </div>
  );
};

// --- Guide Component ---
const Guide = ({ currentStep, setStep }) => {
    const steps = [
        { title: "Welcome!", text: "This guide will walk you through the main features.", position: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } },
        { title: "Design Palette", text: "Drag items like trees from this panel directly onto the 3D map of Chicago.", position: { top: '120px', left: '320px' } },
        { title: "3D Viewport", text: "When you drag an item over the map, an area will be highlighted. Drop it to place it and see the impact.", position: { top: '30%', left: '50%', transform: 'translateX(-50%)' } },
        { title: "AI Urban Score", text: "As you make changes, our AI analyzes your design's impact. Watch your score change!", position: { top: '120px', right: '360px' } },
        { title: "You're All Set!", text: "Now you're ready to start designing a greener Chicago. Enjoy!", position: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } }
    ];

    if (currentStep === null) return null;
    const step = steps[currentStep];

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.6)', zIndex: 3000 }}>
            <div style={{ position: 'absolute', ...step.position, background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)', padding: '24px', borderRadius: '12px', border: '1px solid #3b82f6', width: '300px', color: 'white', textAlign: 'center' }}>
                <button onClick={() => setStep(null)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}>&times;</button>
                <h3 style={{ margin: '0 0 12px 0', color: '#60a5fa' }}>{step.title}</h3>
                <p style={{ margin: '0 0 20px 0', fontSize: '14px', lineHeight: '1.6' }}>{step.text}</p>
                <button onClick={() => { currentStep < steps.length - 1 ? setStep(currentStep + 1) : setStep(null); }} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                    {currentStep < steps.length - 1 ? `Next (${currentStep + 1}/${steps.length - 1})` : "Finish"}
                </button>
            </div>
        </div>
    );
};

// --- Main Planner View ---
const ChicagoUrbanPlanner = ({ onStartGuide }) => {
  const cesiumContainerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cityState, setCityState] = useState({});
  const [history, setHistory] = useState([]);
  const [aiScore, setAiScore] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);
  
  const viewerRef = useRef(null);
  const customDataSourceRef = useRef(null); 
  const [impactAnalysis, setImpactAnalysis] = useState(null); 
  const classificationPrimitivesRef = useRef({});

  const highlightBlockRef = useRef(null); 

  useEffect(() => {
    let viewer;
    const cesiumWidgetsCss = document.createElement('link');
    cesiumWidgetsCss.href = 'https://cesium.com/downloads/cesiumjs/releases/1.117/Build/Cesium/Widgets/widgets.css';
    cesiumWidgetsCss.rel = 'stylesheet';
    document.head.appendChild(cesiumWidgetsCss);

    if (cesiumContainerRef.current && !viewerRef.current) {
      viewer = new Cesium.Viewer(cesiumContainerRef.current, {
        terrain: Cesium.Terrain.fromWorldTerrain(),
        infoBox: false, selectionIndicator: false, shouldAnimate: true,
        animation: false, timeline: false, geocoder: false, homeButton: false, 
        sceneModePicker: false, baseLayerPicker: false, navigationHelpButton: false,
      });
      viewer.bottomContainer.style.display = "none";
      viewerRef.current = viewer;

      viewer.scene.screenSpaceCameraController.enableRotate = true;
      viewer.scene.screenSpaceCameraController.enableTranslate = true;
      viewer.scene.screenSpaceCameraController.enableZoom = true;
      viewer.scene.screenSpaceCameraController.enableTilt = true;
      viewer.scene.screenSpaceCameraController.enableLook = true;

      customDataSourceRef.current = new Cesium.CustomDataSource('customData');
      viewer.dataSources.add(customDataSourceRef.current);

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-87.6298, 41.8781, 2500),
        orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-45), roll: 0 },
      });

      (async () => {
        try {
          if (!viewerRef.current) return;
          const tileset = await Cesium.createGooglePhotorealistic3DTileset();
          viewerRef.current.scene.primitives.add(tileset);
          setIsLoading(false);
        } catch (error) { console.error('Failed to load Photorealistic Tiles:', error); setIsLoading(false); }
      })();
      
      mockAIScoring({}).then(setAiScore);
    }
    
    return () => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
        viewerRef.current = null;
      }
      if (document.head.contains(cesiumWidgetsCss)) {
        document.head.removeChild(cesiumWidgetsCss);
      }
    };
  }, []);

  const getGlobeCoordinates = useCallback((e) => {
    const viewer = viewerRef.current;
    if (!viewer) return null;
    const cartesian = viewer.scene.camera.pickEllipsoid(new Cesium.Cartesian2(e.clientX, e.clientY), viewer.scene.globe.ellipsoid);
    if (!cartesian) return null;
    return Cesium.Cartographic.fromCartesian(cartesian);
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    const viewer = viewerRef.current; if (!viewer) return;
    const cartographic = getGlobeCoordinates(e); if (!cartographic) return; 

    const offset = 0.0005; 
    const west = Cesium.Math.toDegrees(cartographic.longitude) - offset;
    const south = Cesium.Math.toDegrees(cartographic.latitude) - offset;
    const east = Cesium.Math.toDegrees(cartographic.longitude) + offset;
    const north = Cesium.Math.toDegrees(cartographic.latitude) + offset;
    const coordinates = Cesium.Cartesian3.fromDegreesArray([west, south, east, south, east, north, west, north, west, south]);
    
    if (!highlightBlockRef.current) {
      highlightBlockRef.current = viewer.entities.add({ 
        name: 'Highlight Block', 
        polygon: { 
            hierarchy: coordinates, 
            material: Cesium.Color.DODGERBLUE.withAlpha(0.4), 
            outline: true, 
            outlineColor: Cesium.Color.WHITE, 
            height: cartographic.height + 0.5
        } 
    });
    } else {
      highlightBlockRef.current.polygon.hierarchy = new Cesium.PolygonHierarchy(coordinates);
      highlightBlockRef.current.polygon.height = cartographic.height + 0.5;
    }
  };

  const handleDragLeave = () => {
    const viewer = viewerRef.current;
    if (highlightBlockRef.current && viewer && viewer.entities && !viewer.isDestroyed()) {
      viewer.entities.remove(highlightBlockRef.current);
      highlightBlockRef.current = null;
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault(); handleDragLeave();
    const viewer = viewerRef.current; const dataSource = customDataSourceRef.current; if (!viewer || viewer.isDestroyed() || !dataSource) return;
    const itemData = JSON.parse(e.dataTransfer.getData('application/json'));
    if (itemData.id !== 'tree') return;
    const cartographic = getGlobeCoordinates(e); if (!cartographic) return;

    const dropId = `drop-${Date.now()}`;
    const centerLon = Cesium.Math.toDegrees(cartographic.longitude);
    const centerLat = Cesium.Math.toDegrees(cartographic.latitude);
    const radius = 60; const offset = 0.0005;
    const west = centerLon - offset; const south = centerLat - offset; const east = centerLon + offset; const north = centerLat + offset;
    
    const classificationPrimitive = new Cesium.ClassificationPrimitive({
        geometryInstances: new Cesium.GeometryInstance({
          geometry: new Cesium.PolygonGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray([west, south, east, south, east, north, west, north])),
            height: -10, extrudedHeight: 1000.0,
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.WHITE) },
        }),
        classificationType: Cesium.ClassificationType.CESIUM_3D_TILE,
    });
    viewer.scene.primitives.add(classificationPrimitive);
    classificationPrimitivesRef.current[dropId] = classificationPrimitive;

    const startTime = viewer.clock.currentTime;
    viewer.entities.add({ id: dropId, position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, cartographic.height), ellipse: { semiMinorAxis: new Cesium.CallbackProperty((time) => { const e = Cesium.JulianDate.secondsDifference(time, startTime); return radius * ((e % 2.0) / 2.0); }, false), semiMajorAxis: new Cesium.CallbackProperty((time) => { const e = Cesium.JulianDate.secondsDifference(time, startTime); return radius * ((e % 2.0) / 2.0); }, false), material: new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty((time) => { const e = Cesium.JulianDate.secondsDifference(time, startTime); return Cesium.Color.AQUAMARINE.withAlpha(1.0 - (e % 2.0) / 2.0); }, false)), height: cartographic.height + 0.1 } });

    const treeUrl = '/tree.glb'; const terrainProvider = viewer.terrainProvider;
    const positionsToSample = [];
    for (let i = 0; i < 20; i++) { positionsToSample.push(Cesium.Cartographic.fromDegrees(west + Math.random() * (east - west), south + Math.random() * (north - south))); }
    const updatedPositions = await Cesium.sampleTerrainMostDetailed(terrainProvider, positionsToSample);

    updatedPositions.forEach((pos) => {
      const dropStartTime = viewer.clock.currentTime; const dropDuration = 1.5 + Math.random() * 0.5;
      const finalPosition = Cesium.Cartographic.toCartesian(pos);
      const startPosition = new Cesium.Cartographic(pos.longitude, pos.latitude, pos.height + 500);
      dataSource.entities.add({ properties: { dropId }, model: { uri: treeUrl, minimumPixelSize: 64, maximumScale: 200, scale: 2.5, }, position: new Cesium.CallbackProperty((time) => { const e = Cesium.JulianDate.secondsDifference(time, dropStartTime); if (e >= dropDuration) return finalPosition; const t = e / dropDuration; const cH = Cesium.Math.lerp(startPosition.height, pos.height, t); return Cesium.Cartographic.toCartesian(new Cesium.Cartographic(pos.longitude, pos.latitude, cH)); }, false), });
    });

    setImpactAnalysis({ id: `block-${Date.now()}`, title: 'Greenspace Impact Analysis', airQuality: `+${(Math.random() * 15 + 5).toFixed(1)}%`, propertyValue: `+${(Math.random() * 5 + 2).toFixed(1)}%`, summary: 'Adding this greenspace significantly improves local air quality and provides a recreational area.', });
    const parcelId = `parcel_${Date.now()}`;
    setHistory(prev => [...prev, { cityState, dropId }]); setCityState(prev => ({ ...prev, [parcelId]: itemData }));
    const score = await mockAIScoring(cityState); setAiScore(score); setDraggedItem(null);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const viewer = viewerRef.current;
    const lastAction = history[history.length - 1];
    
    if (viewer && !viewer.isDestroyed()) {
        viewer.entities.removeById(lastAction.dropId);
        const primitiveToRemove = classificationPrimitivesRef.current[lastAction.dropId];
        if (primitiveToRemove) {
            viewer.scene.primitives.remove(primitiveToRemove);
            delete classificationPrimitivesRef.current[lastAction.dropId];
        }
    }
    
    if (customDataSourceRef.current) {
        const entitiesToRemove = customDataSourceRef.current.entities.values.filter(
            (entity) => entity.properties && entity.properties.dropId && entity.properties.dropId.getValue() === lastAction.dropId
        );
        entitiesToRemove.forEach(entity => customDataSourceRef.current.entities.remove(entity));
    }
    
    setCityState(lastAction.cityState);
    setHistory(prev => prev.slice(0, -1));
  };
  const handleExport = () => { const d = { timestamp: new Date().toISOString(), cityState, aiScore }; const s = JSON.stringify(d, null, 2); const b = new Blob([s], { type: 'application/json' }); const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = 'chicago-design.json'; document.body.appendChild(l); l.click(); document.body.removeChild(l); URL.revokeObjectURL(u); };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div ref={cesiumContainerRef} onDragOver={handleDragOver} onDrop={handleDrop} onDragLeave={handleDragLeave} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />
      {isLoading && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(15, 23, 42, 0.95)', padding: '32px 48px', borderRadius: '16px', border: '1px solid #3b82f6', textAlign: 'center', zIndex: 2000 }}> <div style={{ width: '50px', height: '50px', border: '4px solid rgba(59, 130, 246, 0.3)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} /> <h1 style={{ color: '#fff', fontSize: '18px', margin: 0 }}>Loading Chicago...</h1> </div>}
      
      <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
        <button onClick={onStartGuide} style={{ padding: '8px 16px', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #3b82f6', borderRadius: '6px', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>Guide</button>
      </div>

      <div style={{ position: 'absolute', left: '20px', top: '20px', width: '280px', maxHeight: 'calc(100vh - 40px)', background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)', borderRadius: '16px', padding: '20px', border: '1px solid #3b82f6', overflowY: 'auto', zIndex: 100 }}> <h3 style={{ margin: '0 0 16px 0', color: '#60a5fa', fontSize: '18px', fontWeight: 700 }}>Design Palette</h3> {PALETTE_ITEMS.map(item => <PaletteItem key={item.id} item={item} onDragStart={setDraggedItem} />)} <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(71, 85, 105, 0.3)' }}> <button onClick={handleUndo} disabled={history.length === 0} style={{ width: '100%', padding: '12px', background: history.length > 0 ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(51, 65, 85, 0.3)', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: history.length > 0 ? 'pointer' : 'not-allowed', marginBottom: '8px' }}>Undo ({history.length})</button> <button onClick={handleExport} style={{ width: '100%', padding: '12px', background: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22c55e', borderRadius: '8px', color: '#22c55e', fontWeight: 600, cursor: 'pointer' }}>Export Design</button> </div> </div>
      {aiScore && <div style={{ position: 'absolute', right: '20px', top: '20px', width: '320px', background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)', borderRadius: '16px', padding: '20px', border: '1px solid #3b82f6', zIndex: 100 }}> <h3 style={{ margin: '0 0 16px 0', color: '#60a5fa', fontSize: '18px', fontWeight: 700 }}>AI Urban Score</h3> <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '20px', borderRadius: '12px', marginBottom: '16px', textAlign: 'center' }}> <div style={{ fontSize: '48px', fontWeight: 700, color: aiScore.overall_score > 85 ? '#22c55e' : aiScore.overall_score > 70 ? '#eab308' : '#ef4444' }}>{aiScore.overall_score}</div> <div style={{ fontSize: '14px', color: '#94a3b8' }}>Overall Score</div> </div> <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}> {Object.entries(aiScore.categories).map(([key, value]) => ( <div key={key} style={{ background: 'rgba(51, 65, 85, 0.4)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}> <div style={{ fontSize: '24px', fontWeight: 700, color: '#60a5fa' }}>{value}</div> <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'capitalize' }}>{key}</div> </div> ))} </div> <div style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', padding: '12px', borderRadius: '8px', fontSize: '13px', color: '#e2e8f0', lineHeight: 1.6 }}>{aiScore.summary}</div> </div>}
      {impactAnalysis && (
        <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', width: '400px', background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)', borderRadius: '16px', padding: '20px', border: '1px solid #22c55e', zIndex: 100, color: 'white' }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}> <h3 style={{ margin: 0, color: '#22c55e' }}>{impactAnalysis.title}</h3> <button onClick={() => setImpactAnalysis(null)} style={{background: 'transparent', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer', padding: '0', lineHeight: '1'}}>&times;</button> </div>
            <p style={{fontSize: '14px', color: '#cbd5e1', marginTop: '16px'}}>{impactAnalysis.summary}</p>
            <div style={{display: 'flex', gap: '16px', marginTop: '16px', textAlign: 'center'}}>
                <div style={{background: 'rgba(34, 197, 94, 0.2)', padding: '12px', borderRadius: '8px', flex: 1}}> <div style={{fontSize: '20px', fontWeight: 'bold'}}>{impactAnalysis.airQuality}</div> <div style={{fontSize: '12px', color: '#94a3b8'}}>Air Quality</div> </div>
                <div style={{background: 'rgba(34, 197, 94, 0.2)', padding: '12px', borderRadius: '8px', flex: 1}}> <div style={{fontSize: '20px', fontWeight: 'bold'}}>{impactAnalysis.propertyValue}</div> <div style={{fontSize: '12px', color: '#94a3b8'}}>Property Value</div> </div>
            </div>
        </div>
      )}
    </div>
  );
};

// --- App Component (Parent) ---
const App = () => {
    const [view, setView] = useState('landing'); // 'landing' or 'planner'
    const [guideStep, setGuideStep] = useState(null);

    const startPlanner = () => {
        setView('planner');
        setTimeout(() => setGuideStep(0), 500); 
    };

    if (view === 'landing') {
        return (
            <div style={{ width: '100vw', height: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'sans-serif' }}>
                <div className="landing-content" style={{ textAlign: 'center', animation: 'fadeIn 2s ease-in-out' }}>
                    <h1 style={{ fontSize: '4rem', marginBottom: '1rem', animation: 'float 6s ease-in-out infinite' }}>Urban Canvas</h1>
                    <p style={{ fontSize: '1.2rem', maxWidth: '600px', marginBottom: '2rem', color: '#94a3b8' }}>
                        Reimagine Chicago's skyline. Use AI-driven insights to design a sustainable and vibrant city of the future. Drag, drop, and innovate.
                    </p>
                    <button onClick={startPlanner} style={{ padding: '1rem 2rem', fontSize: '1.1rem', fontWeight: 'bold', color: 'white', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', borderRadius: '50px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)', transition: 'transform 0.2s, box-shadow 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(59, 130, 246, 0.4)'; }} onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)'; }}>
                        Start Designing
                    </button>
                </div>
                <style>{`
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }
    
    return (
        <div style={{ width: '100vw', height: '100vh', background: '#0f172a' }}>
            <ChicagoUrbanPlanner onStartGuide={() => setGuideStep(0)} />
            <Guide currentStep={guideStep} setStep={setGuideStep} />
        </div>
    );
};

export default App;