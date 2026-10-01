let scene, camera, renderer, controls;
let terrain, water;
let elevTexture, satTexture, maskTexture;
let elevationData = null;
let imgW = 2304, imgH = 3840;
let currentSeaLevel = 0;
let cinematicCam = true;

const skyColors = {
    dawn: new THREE.Color(0xff8c42),
    noon: new THREE.Color(0x668a99),
    dusk: new THREE.Color(0xcc6655),
    night: new THREE.Color(0x0a0c10)
};

let terrainUniforms, waterUniforms;

function init() {
    scene = new THREE.Scene();
    scene.background = skyColors.noon;
    scene.fog = new THREE.Fog(skyColors.noon, 50, 450);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 80, 120);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 250;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0.5, 1.0, 0.3);
    scene.add(dirLight);

    loadTextures();
}

function loadTextures() {
    const texLoader = new THREE.TextureLoader();
    let loadedCount = 0;

    function checkLoad() {
        loadedCount++;
        if (loadedCount === 3) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('ui').style.display = 'block';
            initTerrain();
            updateSunAndSky(); // initialize time of day
        }
    }

    elevTexture = texLoader.load('data/elev_extended.png', checkLoad);
    satTexture = texLoader.load('data/sat_extended.jpg', checkLoad);
    maskTexture = texLoader.load('data/elev_extended.png', () => {
        maskTexture.generateMipmaps = false;
        maskTexture.minFilter = THREE.NearestFilter;
        maskTexture.magFilter = THREE.NearestFilter;
        checkLoad();
    });

    const img = new Image();
    img.src = 'data/elev_extended.png';
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        elevationData = new Float32Array(img.width * img.height);
        for (let i = 0; i < elevationData.length; i++) {
            let idx = i * 4;
            let r = imgData.data[idx];
            let g = imgData.data[idx+1];
            let b = imgData.data[idx+2];
            elevationData[i] = (r * 256.0 + g + b / 256.0) - 32768.0;
        }
    };
}

function updateFloodMask(seaLevel) {
    if (!elevationData) return;
    const canvas = document.createElement('canvas');
    canvas.width = imgW;
    canvas.height = imgH;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(imgW, imgH);
    
    let visited = new Uint8Array(imgW * imgH);
    let queue = [];
    
    for (let y = 0; y < imgH; y++) {
        if (elevationData[y * imgW + 0] <= seaLevel) queue.push(y * imgW + 0);
        if (elevationData[y * imgW + (imgW - 1)] <= seaLevel) queue.push(y * imgW + (imgW - 1));
    }
    for (let x = 0; x < imgW; x++) {
        if (elevationData[0 * imgW + x] <= seaLevel) queue.push(0 * imgW + x);
        if (elevationData[(imgH - 1) * imgW + x] <= seaLevel) queue.push((imgH - 1) * imgW + x);
    }
    
    for (let i = 0; i < queue.length; i++) {
        visited[queue[i]] = 1;
    }
    
    let head = 0;
    while(head < queue.length) {
        let idx = queue[head++];
        let x = idx % imgW;
        let y = Math.floor(idx / imgW);
        
        let neighbors = [];
        if (x > 0) neighbors.push(idx - 1);
        if (x < imgW - 1) neighbors.push(idx + 1);
        if (y > 0) neighbors.push(idx - imgW);
        if (y < imgH - 1) neighbors.push(idx + imgW);
        
        for (let n of neighbors) {
            if (!visited[n] && elevationData[n] <= seaLevel) {
                visited[n] = 1;
                queue.push(n);
            }
        }
    }
    
    for (let i = 0; i < visited.length; i++) {
        let val = visited[i] ? 255 : 0;
        let idx = i * 4;
        imgData.data[idx] = val;
        imgData.data[idx+1] = val;
        imgData.data[idx+2] = val;
        imgData.data[idx+3] = 255;
    }
    
    ctx.putImageData(imgData, 0, 0);
    const newTex = new THREE.CanvasTexture(canvas);
    newTex.minFilter = THREE.NearestFilter;
    newTex.magFilter = THREE.NearestFilter;
    if (water) water.material.uniforms.tMaskInner.value = newTex;
}

function initTerrain() {
    buildMeshes();
}

function getSkyColor(time) {
    if (time < 6) return skyColors.night.clone().lerp(skyColors.dawn, (time - 5));
    if (time < 12) return skyColors.dawn.clone().lerp(skyColors.noon, (time - 6) / 6);
    if (time < 18) return skyColors.noon.clone().lerp(skyColors.dusk, (time - 12) / 6);
    return skyColors.dusk.clone().lerp(skyColors.night, (time - 18));
}

function updateSunAndSky() {
    const time = parseFloat(document.getElementById('timeOfDay').value);
    
    const currentColor = getSkyColor(time);
    scene.background = currentColor;
    scene.fog.color = currentColor;
    
    const angle = (time - 12) / 7 * (Math.PI / 2);
    const sy = Math.cos(angle);
    const sx = Math.sin(angle);
    const sz = 0.4;
    const sunVec = new THREE.Vector3(sx, sy, sz).normalize();
    
    let ambientIntensity = 0.65;
    let diffuseIntensity = 0.7;
    let lightColor = new THREE.Vector3(1.0, 1.0, 1.0); 
    
    if (time < 7 || time > 17) {
        lightColor = new THREE.Vector3(1.0, 0.7, 0.4);
        ambientIntensity = 0.4;
        diffuseIntensity = 0.9;
    } else if (time < 9 || time > 15) {
        lightColor = new THREE.Vector3(1.0, 0.9, 0.7);
    }
    
    if (terrainUniforms) {
        terrainUniforms.sunPosition.value.copy(sunVec);
        terrainUniforms.skyColor.value.set(currentColor.r, currentColor.g, currentColor.b);
        terrainUniforms.lightColor.value.copy(lightColor);
        terrainUniforms.ambientIntensity.value = ambientIntensity;
        terrainUniforms.diffuseIntensity.value = diffuseIntensity;
    }
    
    if (waterUniforms) {
        waterUniforms.sunPosition.value.copy(sunVec);
        waterUniforms.skyColor.value.set(currentColor.r, currentColor.g, currentColor.b);
        waterUniforms.lightColor.value.copy(lightColor);
    }
}

function buildMeshes() {
    terrainUniforms = {
        tDiffuse: { value: satTexture },
        tElevation: { value: elevTexture },
        exaggeration: { value: 0.5 },
        u_time: { value: 0.0 },
        marginX: { value: 0.26 },
        marginY: { value: 0.25 },
        cornerRoundness: { value: 0.18 },
        fogBlur: { value: 0.17 },
        sunPosition: { value: new THREE.Vector3(0.0, 1.0, 0.4).normalize() },
        skyColor: { value: new THREE.Vector3() },
        lightColor: { value: new THREE.Vector3(1,1,1) },
        ambientIntensity: { value: 0.65 },
        diffuseIntensity: { value: 0.7 },
        showContours: { value: 0.0 }
    };
    
    const vertexShader = `
        uniform sampler2D tElevation;
        uniform float exaggeration;
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying float vHeight;
        
        void main() {
            vUv = uv;
            vec4 elev = texture2D(tElevation, uv);
            float heightMeters = (elev.r * 255.0 * 256.0 + elev.g * 255.0 + elev.b * 255.0 / 256.0) - 32768.0;
            vHeight = heightMeters;
            
            float scaledHeight = heightMeters * 0.005 * exaggeration;
            vec3 newPosition = position + normal * scaledHeight;
            
            vec4 worldPosition = modelMatrix * vec4(newPosition, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `;
    
    const fragmentShader = `
        
        uniform sampler2D tDiffuse;
        uniform sampler2D tElevation;
        uniform float exaggeration;
        uniform float u_time;
        uniform float marginX;
        uniform float marginY;
        uniform float cornerRoundness;
        uniform float fogBlur;
        
        uniform vec3 sunPosition;
        uniform vec3 skyColor;
        uniform vec3 lightColor;
        uniform float ambientIntensity;
        uniform float diffuseIntensity;
        uniform float showContours;
        
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying float vHeight;
        
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
            float f = 0.0; float w = 0.5;
            for (int i = 0; i < 4; i++) { f += w * noise(p); p *= 2.0; w *= 0.5; }
            return f;
        }
        
        void main() {
            vec4 texColor = texture2D(tDiffuse, vUv);
            
            vec2 texel = vec2(1.0 / 2304.0, 1.0 / 3840.0);
            float hL = (texture2D(tElevation, vUv - vec2(texel.x, 0.0)).r * 255.0 * 256.0 + texture2D(tElevation, vUv - vec2(texel.x, 0.0)).g * 255.0) - 32768.0;
            float hR = (texture2D(tElevation, vUv + vec2(texel.x, 0.0)).r * 255.0 * 256.0 + texture2D(tElevation, vUv + vec2(texel.x, 0.0)).g * 255.0) - 32768.0;
            float hD = (texture2D(tElevation, vUv - vec2(0.0, texel.y)).r * 255.0 * 256.0 + texture2D(tElevation, vUv - vec2(0.0, texel.y)).g * 255.0) - 32768.0;
            float hU = (texture2D(tElevation, vUv + vec2(0.0, texel.y)).r * 255.0 * 256.0 + texture2D(tElevation, vUv + vec2(0.0, texel.y)).g * 255.0) - 32768.0;
            
            float zScale = 0.005 * exaggeration;
            vec3 va = normalize(vec3(texel.x * 360.0, 0.0, (hR - hL) * zScale));
            vec3 vb = normalize(vec3(0.0, texel.y * 600.0, (hU - hD) * zScale));
            vec3 macroNormal = normalize(cross(va, vb));
            
            float detailNoise = fbm(vUv * 6000.0);
            vec3 detailNormal = normalize(vec3(
                fbm(vUv * 6000.0 + vec2(0.01, 0.0)) - detailNoise,
                fbm(vUv * 6000.0 + vec2(0.0, 0.01)) - detailNoise,
                0.5
            ));
            
            vec3 finalNormal = normalize(macroNormal + detailNormal * 0.4);
            vec3 detailColor = mix(vec3(0.85), vec3(1.15), detailNoise);
            texColor.rgb *= mix(vec3(1.0), detailColor, 0.3);
            
            float diff = max(dot(finalNormal, sunPosition), 0.0);
            
            vec3 ambient = skyColor * ambientIntensity; 
            vec3 diffuse = lightColor * diffuseIntensity * diff;
            
            float ao = smoothstep(-0.2, 0.8, macroNormal.z); 
            vec3 finalLighting = texColor.rgb * (ambient + diffuse * ao) * 1.1;
            
            if (showContours > 0.5) {
                float line = abs(fract(vHeight / 50.0 - 0.5) - 0.5) / fwidth(vHeight / 50.0);
                float contour = 1.0 - clamp(line, 0.0, 1.0);
                float majorLine = abs(fract(vHeight / 250.0 - 0.5) - 0.5) / fwidth(vHeight / 250.0);
                float majorContour = 1.0 - clamp(majorLine, 0.0, 1.0);
                
                vec3 contourColor = mix(vec3(1.0, 1.0, 1.0), vec3(0.0, 0.8, 1.0), majorContour);
                finalLighting = mix(finalLighting, contourColor, max(contour * 0.4, majorContour * 0.8));
            }
            
            float isStaticWater = smoothstep(0.02, 0.15, texColor.b - max(texColor.r, texColor.g));
            if (isStaticWater > 0.0) {
                vec2 waveUv = vUv * 1500.0;
                vec3 waterNormal = normalize(vec3(
                    noise(waveUv + vec2(0.1, 0.0) + u_time * 0.5) - noise(waveUv - vec2(0.1, 0.0) - u_time * 0.5),
                    noise(waveUv + vec2(0.0, 0.1) + u_time * 0.5) - noise(waveUv - vec2(0.0, 0.1) - u_time * 0.5),
                    1.2 
                ));
                vec3 viewDir = normalize(cameraPosition - vWorldPosition); 
                vec3 halfVector = normalize(sunPosition + viewDir);
                float specular = pow(max(dot(waterNormal, halfVector), 0.0), 60.0);
                vec3 waterColor = texColor.rgb * 0.7 + lightColor * (specular * 0.7);
                finalLighting = mix(finalLighting, waterColor, isStaticWater);
            }
            
            vec2 p = vUv - 0.5;
            vec2 boxHalfSize = vec2(0.5 - marginX, 0.5 - marginY);
            float r = min(cornerRoundness, min(boxHalfSize.x, boxHalfSize.y));
            vec2 q = abs(p) - boxHalfSize + vec2(r);
            float dist = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
            
            float edgeFade = 1.0 - smoothstep(-fogBlur, fogBlur, dist);
            
            float camDist = distance(cameraPosition, vWorldPosition);
            float depthFog = 1.0 - exp(-camDist * 0.0035);
            
            float totalFog = max(1.0 - edgeFade, clamp(depthFog, 0.0, 1.0));
            finalLighting = mix(finalLighting, skyColor, totalFog);
            
            gl_FragColor = vec4(finalLighting, 1.0);
        }
    `;
    
    const geometry = new THREE.PlaneGeometry(360, 600, 767, 767);
    geometry.rotateX(-Math.PI / 2);
    
    terrain = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
        uniforms: terrainUniforms, vertexShader: vertexShader, fragmentShader: fragmentShader, side: THREE.DoubleSide,
        extensions: { derivatives: true }
    }));
    scene.add(terrain);

    waterUniforms = {
        tElevation: { value: elevTexture },
        tMaskInner: { value: maskTexture },
        exaggeration: { value: 0.5 },
        seaLevel: { value: 0.0 },
        u_time: { value: 0.0 },
        isMagma: { value: 0.0 },
        marginX: { value: 0.26 },
        marginY: { value: 0.25 },
        cornerRoundness: { value: 0.18 },
        fogBlur: { value: 0.17 },
        sunPosition: { value: new THREE.Vector3(0.0, 1.0, 0.4).normalize() },
        skyColor: { value: new THREE.Vector3() },
        lightColor: { value: new THREE.Vector3(1,1,1) }
    };
    
    const waterVert = `
        uniform sampler2D tElevation;
        uniform sampler2D tMaskInner;
        uniform float exaggeration;
        uniform float seaLevel;
        uniform float u_time;
        uniform float isMagma;
        varying vec2 vUv;
        varying float vIsWater;
        varying vec3 vWorldPosition;
        
        void main() {
            vUv = uv;
            vec2 innerUv = (uv - vec2(1.0/3.0)) * 3.0;
            float isWater = 0.0;
            
            if (innerUv.x >= 0.0 && innerUv.x <= 1.0 && innerUv.y >= 0.0 && innerUv.y <= 1.0) {
                isWater = texture2D(tMaskInner, innerUv).r;
            } else {
                vec4 elev = texture2D(tElevation, uv);
                float heightMeters = (elev.r * 255.0 * 256.0 + elev.g * 255.0 + elev.b * 255.0 / 256.0) - 32768.0;
                if (heightMeters <= seaLevel && heightMeters > -20000.0) {
                    isWater = 1.0;
                }
            }
            
            vIsWater = isWater;
            
            float wave = sin(uv.x * 180.0 + u_time * 2.0) * cos(uv.y * 180.0 + u_time * 1.5) * 0.3;
            float magmaWave = sin(uv.x * 60.0 + u_time * 0.5) * 0.5;
            float finalWave = isMagma < 0.5 ? wave : magmaWave;
            
            float height = isWater > 0.5 ? (seaLevel + 1.0 + finalWave) : 0.0;
            float scaledHeight = height * 0.005 * exaggeration;
            
            vec3 newPosition = position + normal * scaledHeight;
            vec4 worldPosition = modelMatrix * vec4(newPosition, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `;
    
    const waterFrag = `
        uniform sampler2D tElevation;
        uniform float seaLevel;
        uniform float u_time;
        uniform float isMagma;
        uniform float marginX;
        uniform float marginY;
        uniform float cornerRoundness;
        uniform float fogBlur;
        uniform vec3 sunPosition;
        uniform vec3 skyColor;
        uniform vec3 lightColor;
        
        varying vec2 vUv;
        varying float vIsWater;
        varying vec3 vWorldPosition;
        
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        
        void main() {
            if (vIsWater < 0.5) discard; 
            
            vec4 elevData = texture2D(tElevation, vUv);
            float elevation = (elevData.r * 255.0 * 256.0 + elevData.g * 255.0 + elevData.b * 255.0 / 256.0) - 32768.0;
            float depth = max(0.0, seaLevel - elevation);
            
            vec3 shallowWater = vec3(0.1, 0.7, 0.85);
            vec3 deepWater = vec3(0.0, 0.15, 0.4);
            float depthFactor = clamp(depth / 80.0, 0.0, 1.0);
            vec3 waterColor = mix(shallowWater, deepWater, depthFactor);
            
            vec3 magmaEdge = vec3(1.0, 0.2, 0.0); 
            vec3 magmaCore = vec3(1.0, 0.9, 0.3); 
            
            vec2 waveUv = vUv * 1500.0;
            vec3 normal = normalize(vec3(
                noise(waveUv + vec2(0.1, 0.0)) - noise(waveUv - vec2(0.1, 0.0)),
                noise(waveUv + vec2(0.0, 0.1)) - noise(waveUv - vec2(0.0, 0.1)),
                1.2 
            ));
            
            vec3 viewDir = normalize(cameraPosition - vWorldPosition);
            vec3 halfVector = normalize(sunPosition + viewDir);
            
            float specular = pow(max(dot(normal, halfVector), 0.0), 50.0) * (1.0 - isMagma);
            
            float foam = 0.0;
            if (depth < 8.0 && isMagma < 0.5) {
                float foamNoise = noise(waveUv * 5.0 - u_time * 3.0);
                foam = smoothstep(0.4, 0.8, foamNoise) * (1.0 - depth/8.0);
            }
            
            vec3 finalColor = waterColor + lightColor * (specular * 0.9) + vec3(foam);
            
            if (isMagma > 0.5) {
                float lavaFlow = noise(vUv * 240.0 + u_time * 0.3);
                float crustNoise = noise(vUv * 900.0 - u_time * 0.1);
                vec3 magmaColor = mix(magmaEdge, magmaCore, smoothstep(0.2, 0.8, lavaFlow));
                float crustThreshold = smoothstep(0.4, 0.7, crustNoise);
                vec3 crustColor = vec3(0.05, 0.02, 0.01);
                finalColor = mix(magmaColor * 1.5, crustColor, crustThreshold);
            }
            
            vec2 p = vUv - 0.5;
            vec2 boxHalfSize = vec2(0.5 - marginX, 0.5 - marginY);
            float r = min(cornerRoundness, min(boxHalfSize.x, boxHalfSize.y));
            vec2 q = abs(p) - boxHalfSize + vec2(r);
            float dist = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
            
            float edgeFade = 1.0 - smoothstep(-fogBlur, fogBlur, dist);
            
            float camDist = distance(cameraPosition, vWorldPosition);
            float depthFog = 1.0 - exp(-camDist * 0.0035);
            
            float totalFog = max(1.0 - edgeFade, clamp(depthFog, 0.0, 1.0));
            finalColor = mix(finalColor, skyColor, totalFog);
            
            float alpha = mix(clamp(depth / 10.0, 0.4, 0.98), 1.0, isMagma);
            gl_FragColor = vec4(finalColor, alpha);
        }
    `;
    
    water = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
        uniforms: waterUniforms, vertexShader: waterVert, fragmentShader: waterFrag,
        transparent: true, side: THREE.DoubleSide
    }));
    scene.add(water);
    
    const slider = document.getElementById('seaLevel');
    const valLabel = document.getElementById('valLevel');
    slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        valLabel.innerText = val.toFixed(1) + 'm';
        currentSeaLevel = val;
        updateFloodMask(val);
        waterUniforms.seaLevel.value = val;
    });
    
    const timeSlider = document.getElementById('timeOfDay');
    const timeLabel = document.getElementById('valTime');
    timeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const hours = Math.floor(val);
        const mins = Math.floor((val - hours) * 60).toString().padStart(2, '0');
        timeLabel.innerText = `${hours}:${mins}`;
        updateSunAndSky();
    });
    
    document.getElementById('magmaMode').addEventListener('change', (e) => {
        waterUniforms.isMagma.value = e.target.checked ? 1.0 : 0.0;
    });
    
    document.getElementById('showContours').addEventListener('change', (e) => {
        terrainUniforms.showContours.value = e.target.checked ? 1.0 : 0.0;
    });
    
    document.getElementById('cinematicCam').addEventListener('change', (e) => {
        cinematicCam = e.target.checked;
        controls.enableDamping = cinematicCam;
    });
}

const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    
    controls.target.x = Math.max(-40, Math.min(40, controls.target.x));
    controls.target.z = Math.max(-80, Math.min(80, controls.target.z));
    
    if (cinematicCam) {
        controls.update();
    } else {
        controls.update();
    }
    
    if (elevationData) {
        let cx = camera.position.x;
        let cz = camera.position.z;
        let u = (cx + 180.0) / 360.0;
        let v = (cz + 300.0) / 600.0;
        let h = currentSeaLevel * 0.005 * 0.5;
        
        if (u >= 1.0/3.0 && u <= 2.0/3.0 && v >= 1.0/3.0 && v <= 2.0/3.0) {
            let innerU = (u - 1.0/3.0) * 3.0;
            let innerV = (v - 1.0/3.0) * 3.0;
            let px = Math.floor(innerU * imgW);
            let py = Math.floor(innerV * imgH);
            px = Math.max(0, Math.min(imgW - 1, px));
            py = Math.max(0, Math.min(imgH - 1, py));
            h = elevationData[py * imgW + px] * 0.005 * 0.5;
        }
        
        if (camera.position.y < h + 2.0) {
            camera.position.y = h + 2.0;
            controls.target.y = Math.max(controls.target.y, h + 2.0 - 5.0); 
        }
    }
    
    if (terrain) terrain.material.uniforms.u_time.value = clock.getElapsedTime();
    if (water) water.material.uniforms.u_time.value = clock.getElapsedTime();
    
    renderer.render(scene, camera);
}

init();
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
