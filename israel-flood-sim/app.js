// Provide a fallback token from Cesium's public examples if the default one is missing.
Cesium.Ion.defaultAccessToken = Cesium.Ion.defaultAccessToken || ''; 

const viewer = new Cesium.Viewer('cesiumContainer', {
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    baseLayerPicker: false,
    baseLayer: false, // Explicitly disable default Bing Maps to prevent Ion auth errors
    infoBox: false
});

// Display errors on screen for debugging
const showError = (msg) => {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'absolute';
    errorDiv.style.bottom = '10px';
    errorDiv.style.left = '10px';
    errorDiv.style.color = 'red';
    errorDiv.style.background = 'white';
    errorDiv.style.padding = '5px';
    errorDiv.style.zIndex = '9999';
    errorDiv.textContent = msg;
    document.body.appendChild(errorDiv);
};

// 1. Add OpenStreetMap Base Layer using the modern async API
Cesium.OpenStreetMapImageryProvider.fromUrl('https://tile.openstreetmap.org/')
    .then(provider => {
        viewer.imageryLayers.addLayer(new Cesium.ImageryLayer(provider));
    })
    .catch(err => showError('Map tiles failed to load: ' + err.message));

// 2. Add High-Res Terrain
Cesium.Terrain.fromWorldTerrain({
    requestVertexNormals: true, // Needed for lighting
    requestWaterMask: false
}).then(terrain => {
    viewer.scene.setTerrain(terrain);
}).catch(err => {
    showError('3D Terrain failed to load (might need an Ion Token). Using flat map.');
    console.error(err);
});

// Remove default entity double click tracking
viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

// Bounding box for Israel (approximate)
const west = 33.5;
const south = 29.3;
const east = 36.0;
const north = 33.5;

// Fly to Israel
viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(34.8, 31.5, 300000.0), // Long, Lat, Height
    orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: Cesium.Math.toRadians(-45.0),
        roll: 0.0
    },
    duration: 3
});

// Create a water plane
const waterPlane = viewer.entities.add({
    name: 'Flood Water',
    polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
            west, south,
            east, south,
            east, north,
            west, north
        ]),
        material: new Cesium.Color(0.0, 0.4, 0.8, 0.6), // Semi-transparent blue
        height: 0, // Initial sea level
        extrudedHeight: 0 // Keep it flat for now
    }
});

// UI Controls
const seaLevelInput = document.getElementById('sea-level');
const seaLevelValue = document.getElementById('sea-level-value');

seaLevelInput.addEventListener('input', (e) => {
    const level = parseFloat(e.target.value);
    seaLevelValue.textContent = level;
    
    // Update the water plane height
    waterPlane.polygon.height = level;
    waterPlane.polygon.extrudedHeight = level > 0 ? 0 : undefined;
});
