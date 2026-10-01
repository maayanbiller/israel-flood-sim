const scene = new THREE.Scene();

// 3D Skybox
const vertexShaderSky = `
    varying vec3 vWorldPosition;
    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;
const fragmentShaderSky = `
    varying vec3 vWorldPosition;
    void main() {
        vec3 skyColor = vec3(5.0/255.0, 13.0/255.0, 31.0/255.0);
        vec3 horizonColor = vec3(102.0/255.0, 138.0/255.0, 153.0/255.0); 
        float mixVal = smoothstep(400.0, 1000.0, vWorldPosition.y);
        gl_FragColor = vec4(mix(horizonColor, skyColor, mixVal), 1.0);
    }
`;
const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 15), new THREE.ShaderMaterial({
    vertexShader: vertexShaderSky, fragmentShader: fragmentShaderSky, side: THREE.BackSide, depthWrite: false
}));
scene.add(sky);

// Dense fog exactly matching horizon to hide mesh boundaries
scene.fog = new THREE.Fog(0x668a99, 80, 250); 
scene.background = new THREE.Color(0x668a99);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 4000);
camera.position.set(0, 80, 180);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = false; 
controls.maxPolarAngle = Math.PI / 2 - 0.01; 
controls.minDistance = 2;
controls.maxDistance = 150; 
controls.enablePan = true; 

const textureLoader = new THREE.TextureLoader();
const satTexture = textureLoader.load('data/sat_extended.jpg', () => checkLoad());
const elevTexture = textureLoader.load('data/elev_extended.png', () => checkLoad());
const elevInner = textureLoader.load('data/elev.png', () => checkLoad());

satTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
elevTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

let loadedCount = 0;
let elevationData = null; 
let maskData = null; 
let maskTexture = null;
let imgW = 768; 
let imgH = 1280; 
let currentSeaLevel = 0;
let terrain = null;
let water = null;

function checkLoad() {
    loadedCount++;
    if (loadedCount === 3) initTerrain();
}

function initTerrain() {
    const img = elevInner.image;
    imgW = img.width;
    imgH = img.height;
    
    const canvas = document.createElement('canvas');
    canvas.width = imgW;
    canvas.height = imgH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, imgW, imgH).data;
    
    elevationData = new Float32Array(imgW * imgH);
    maskData = new Uint8Array(imgW * imgH);
    
    for (let i = 0; i < imgW * imgH; i++) {
        const r = imgData[i*4];
        const g = imgData[i*4+1];
        const b = imgData[i*4+2];
        elevationData[i] = (r * 256.0 + g + b / 256.0) - 32768.0;
    }
    
    maskTexture = new THREE.DataTexture(maskData, imgW, imgH, THREE.LuminanceFormat, THREE.UnsignedByteType);
    maskTexture.magFilter = THREE.NearestFilter;
    maskTexture.minFilter = THREE.NearestFilter;
    maskTexture.needsUpdate = true;
    maskTexture.flipY = true;
    
    buildMeshes();
    updateFloodMask(0); 
    
    document.getElementById('loading').style.display = 'none';
    document.getElementById('controls').style.display = 'flex';
}

function updateFloodMask(seaLevel) {
    if (!elevationData) return;
    for (let i = 0; i < maskData.length; i++) maskData[i] = 0;
    
    const queue = new Int32Array(imgW * imgH); 
    let head = 0, tail = 0;
    
    queue[tail++] = 0;
    maskData[0] = 255; 
    
    const redSeaIdx = (imgH - 1) * imgW + 400;
    if (elevationData[redSeaIdx] <= seaLevel) {
        queue[tail++] = redSeaIdx;
        maskData[redSeaIdx] = 255;
    }
    
    const dirs = [-1, 1, -imgW, imgW];
    while (head < tail) {
        const idx = queue[head++];
        const x = idx % imgW;
        for (let d = 0; d < 4; d++) {
            if (d === 0 && x === 0) continue; 
            if (d === 1 && x === imgW - 1) continue;
            const nIdx = idx + dirs[d];
            if (nIdx >= 0 && nIdx < elevationData.length) {
                if (maskData[nIdx] === 0 && elevationData[nIdx] <= seaLevel) {
                    maskData[nIdx] = 255;
                    queue[tail++] = nIdx;
                }
            }
        }
    }
    maskTexture.needsUpdate = true;
}

let terrainUniforms = null;
let waterUniforms = null;

function buildMeshes() {
    terrainUniforms = {
        tDiffuse: { value: satTexture },
        tElevation: { value: elevTexture },
        exaggeration: { value: 0.5 },
        u_time: { value: 0.0 }
    };
    
    const vertexShader = `
        uniform sampler2D tElevation;
        uniform float exaggeration;
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        
        void main() {
            vUv = uv;
            vec4 elev = texture2D(tElevation, uv);
            float heightMeters = (elev.r * 255.0 * 256.0 + elev.g * 255.0 + elev.b * 255.0 / 256.0) - 32768.0;
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
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        
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
            
            vec3 sunDir = normalize(vec3(-0.5, 1.0, 0.3));
            float diff = max(dot(finalNormal, sunDir), 0.0);
            
            vec3 ambient = vec3(0.65, 0.65, 0.7); 
            vec3 diffuse = vec3(0.5, 0.45, 0.4) * diff;
            
            vec3 finalLighting = texColor.rgb * (ambient + diffuse) * 1.1;
            
            // --- STATIC WATER VISUALS ---
            // Detect deep blue pixels in the satellite image to mark natural water bodies
            float isStaticWater = smoothstep(0.02, 0.15, texColor.b - max(texColor.r, texColor.g));
            
            if (isStaticWater > 0.0) {
                vec2 waveUv = vUv * 1500.0;
                vec3 waterNormal = normalize(vec3(
                    noise(waveUv + vec2(0.1, 0.0) + u_time * 0.5) - noise(waveUv - vec2(0.1, 0.0) - u_time * 0.5),
                    noise(waveUv + vec2(0.0, 0.1) + u_time * 0.5) - noise(waveUv - vec2(0.0, 0.1) - u_time * 0.5),
                    1.2 
                ));
                
                vec3 viewDir = normalize(cameraPosition - vWorldPosition); 
                vec3 halfVector = normalize(sunDir + viewDir);
                float specular = pow(max(dot(waterNormal, halfVector), 0.0), 40.0);
                
                vec3 waterColor = texColor.rgb * 0.7 + vec3(specular * 0.5);
                finalLighting = mix(finalLighting, waterColor, isStaticWater);
            }
            // -----------------------------
            
            // INFINITE HORIZON: Bulletproof elliptical fade
            float distFromCenter = length((vUv - 0.5) * 2.0); 
            // Fade starts earlier at 0.4 for a softer, more gradual atmospheric vignette
            float edgeFade = 1.0 - smoothstep(0.4, 0.95, distFromCenter);
            
            vec3 perfectSky = vec3(102.0/255.0, 138.0/255.0, 153.0/255.0);
            finalLighting = mix(perfectSky, finalLighting, edgeFade);
            
            gl_FragColor = vec4(finalLighting, 1.0);
        }
    `;
    
    const geometry = new THREE.PlaneGeometry(360, 600, 767, 767);
    geometry.rotateX(-Math.PI / 2);
    
    terrain = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
        uniforms: terrainUniforms, vertexShader: vertexShader, fragmentShader: fragmentShader, side: THREE.DoubleSide
    }));
    scene.add(terrain);

    waterUniforms = {
        tElevation: { value: elevTexture },
        tMaskInner: { value: maskTexture },
        exaggeration: { value: 0.5 },
        seaLevel: { value: 0.0 },
        u_time: { value: 0.0 },
        isMagma: { value: 0.0 }
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
            
            vec3 shallowWater = vec3(0.0, 0.8, 0.9);
            vec3 deepWater = vec3(0.0, 0.1, 0.4);
            float depthFactor = clamp(depth / 150.0, 0.0, 1.0);
            vec3 waterColor = mix(shallowWater, deepWater, depthFactor);
            
            vec3 magmaEdge = vec3(1.0, 0.2, 0.0); 
            vec3 magmaCore = vec3(1.0, 0.9, 0.3); 
            
            vec2 waveUv = vUv * 1500.0;
            vec3 normal = normalize(vec3(
                noise(waveUv + vec2(0.1, 0.0)) - noise(waveUv - vec2(0.1, 0.0)),
                noise(waveUv + vec2(0.0, 0.1)) - noise(waveUv - vec2(0.0, 0.1)),
                1.2 
            ));
            
            vec3 sunDir = normalize(vec3(1.0, 1.0, 0.8));
            vec3 viewDir = normalize(cameraPosition - vWorldPosition);
            vec3 halfVector = normalize(sunDir + viewDir);
            
            float specular = pow(max(dot(normal, halfVector), 0.0), 40.0) * (1.0 - isMagma);
            
            float foam = 0.0;
            if (depth < 12.0 && isMagma < 0.5) {
                foam = smoothstep(0.3, 1.0, noise(waveUv * 4.0 + u_time * 2.0)) * (1.0 - depth/12.0);
            }
            
            vec3 finalColor = waterColor + vec3(specular * 0.8) + vec3(foam);
            
            if (isMagma > 0.5) {
                float lavaFlow = noise(vUv * 240.0 + u_time * 0.3);
                float crustNoise = noise(vUv * 900.0 - u_time * 0.1);
                vec3 magmaColor = mix(magmaEdge, magmaCore, smoothstep(0.2, 0.8, lavaFlow));
                float crustThreshold = smoothstep(0.4, 0.7, crustNoise);
                vec3 crustColor = vec3(0.05, 0.02, 0.01);
                finalColor = mix(magmaColor * 1.5, crustColor, crustThreshold);
            }
            
            float distFromCenter = length((vUv - 0.5) * 2.0);
            float edgeFade = 1.0 - smoothstep(0.4, 0.95, distFromCenter);
            
            vec3 perfectSky = vec3(102.0/255.0, 138.0/255.0, 153.0/255.0); 
            finalColor = mix(perfectSky, finalColor, edgeFade);
            
            float alpha = mix(clamp(depth / 15.0, 0.6, 0.95), 1.0, isMagma);
            gl_FragColor = vec4(finalColor, alpha);
        }
    `;
    
    water = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
        uniforms: waterUniforms, vertexShader: waterVert, fragmentShader: waterFrag,
        transparent: true, side: THREE.DoubleSide
    }));
    scene.add(water);
    
    const slider = document.getElementById('seaLevel');
    const valLabel = document.getElementById('val');
    slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        valLabel.innerText = val;
        currentSeaLevel = val;
        updateFloodMask(val);
        waterUniforms.seaLevel.value = val;
    });
    
    document.getElementById('magmaMode').addEventListener('change', (e) => {
        waterUniforms.isMagma.value = e.target.checked ? 1.0 : 0.0;
    });
}

const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    
    controls.target.x = Math.max(-40, Math.min(40, controls.target.x));
    controls.target.z = Math.max(-80, Math.min(80, controls.target.z));
    
    controls.update();
    
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
        
        if (camera.position.y < h + 1.5) {
            camera.position.y = h + 1.5;
        }
    }
    
    if (terrain) {
        terrain.material.uniforms.u_time.value = clock.getElapsedTime();
    }
    if (water) {
        water.material.uniforms.u_time.value = clock.getElapsedTime();
    }
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
