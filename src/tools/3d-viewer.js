// 3D Viewer Tool Module - Complete with all features (Part 1/3)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

let container, scene, camera, renderer, orbitControls, transformControls, model, decalMaterial, directionalLight;
let layers = [], selectedLayer = null, needsRender = true, continuousRender = false, animationFrameId;
const MAX_LAYERS = 8;
let domElements = {};

const HTML = `
<div id="ui-container">
    <div class="control-panel">
        <div class="panel-header" data-target="upload-content">
            <h3 class="font-bold text-lg">File Management</h3>
            <svg class="arrow-icon w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
        </div>
        <div id="upload-content" class="panel-content">
            <label for="model-upload" class="upload-label">Choose an .obj File</label>
            <input type="file" id="model-upload" class="hidden" accept=".obj">
            <span id="model-file-name" class="text-sm text-gray-600 mt-1 block">Default Cylinder</span>
        </div>
    </div>
    
    <div class="control-panel">
        <div class="panel-header" data-target="layers-content">
            <h3 class="font-bold text-lg">Layers</h3>
            <svg class="arrow-icon w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
        </div>
        <div id="layers-content" class="panel-content">
            <div id="layer-list" class="flex flex-col gap-2"></div>
            <button id="add-layer-btn" class="action-btn mt-4">Add New Layer</button>
            <input type="file" id="texture-upload" class="hidden" accept="image/png">
        </div>
    </div>
    
    <div id="controls-wrapper" class="hidden">
        <div class="control-panel">
            <div class="panel-header" data-target="gizmo-content">
                <h3 class="font-bold text-lg">Gizmo Mode</h3>
                <svg class="arrow-icon w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </div>
            <div id="gizmo-content" class="panel-content flex gap-2">
                <button id="translate-btn" class="mode-btn active">Translate</button>
                <button id="rotate-btn" class="mode-btn">Rotate</button>
            </div>
        </div>
        
        <div class="control-panel">
            <div class="panel-header" data-target="lighting-content">
                <h3 class="font-bold text-lg">Lighting Controls</h3>
                <svg class="arrow-icon w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </div>
            <div id="lighting-content" class="panel-content">
                <div><label for="light-intensity">Brightness</label><input type="range" id="light-intensity" min="0" max="3" step="0.1" value="1.5"></div>
                <div class="mt-2"><label for="light-azimuth">Azimuth</label><input type="range" id="light-azimuth" min="0" max="360" step="1" value="45"></div>
                <div class="mt-2"><label for="light-elevation">Elevation</label><input type="range" id="light-elevation" min="0" max="180" step="1" value="45"></div>
                <div class="mt-2"><label for="light-distance">Distance</label><input type="range" id="light-distance" min="20" max="500" step="1" value="500"></div>
            </div>
        </div>
        
        <div class="control-panel">
            <div class="panel-header" data-target="texture-content">
                <h3 class="font-bold text-lg">Texture Controls</h3>
                <svg class="arrow-icon w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </div>
            <div id="texture-content" class="panel-content">
                <div>
                    <label class="mb-1">Projection Axis</label>
                    <div class="flex gap-2">
                        <button id="axis-x-btn" class="mode-btn w-1/3">X</button>
                        <button id="axis-y-btn" class="mode-btn w-1/3">Y</button>
                        <button id="axis-z-btn" class="mode-btn w-1/3 active">Z</button>
                    </div>
                </div>
                <div class="mt-2"><label for="offset-u">Offset (Circumference)</label><input type="range" id="offset-u" min="-1" max="1" step="0.01" value="0"></div>
                <div class="mt-2"><label for="offset-v">Offset (Length)</label><input type="range" id="offset-v" min="-1" max="1" step="0.01" value="0"></div>
                <div class="mt-2"><label for="uniform-scale">Scale (Coverage)</label><input type="range" id="uniform-scale" min="0.01" max="2" step="0.01" value="1"></div>
                <div class="mt-2"><label for="rotation">Rotation</label><input type="range" id="rotation" min="-3.141" max="3.141" step="0.01" value="0"></div>
                <div class="mt-4 flex gap-2">
                    <button id="flip-x-btn" class="mode-btn w-1/2">Flip H</button>
                    <button id="flip-y-btn" class="mode-btn w-1/2">Flip V</button>
                </div>
                <div class="mt-2"><label for="clamp-min">Projection Start</label><input type="range" id="clamp-min" min="-0.5" max="1.5" step="0.01" value="0.15"></div>
                <div class="mt-2"><label for="clamp-max">Projection End</label><input type="range" id="clamp-max" min="-0.5" max="1.5" step="0.01" value="0.85"></div>
                <button id="reset-controls-btn" class="w-full mt-4 bg-gray-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors">Reset All</button>
            </div>
        </div>
    </div>
</div>
<div id="renderer-container" class="w-full h-full"></div>
<div id="message-box" class="hidden fixed bottom-5 left-1/2 -translate-x-1/2 bg-red-500 text-white py-2 px-5 rounded-lg shadow-xl transition-opacity duration-300">
    <p id="message-text"></p>
</div>
`;

class Layer {
    constructor(texture, fileName) {
        this.id = THREE.MathUtils.generateUUID();
        this.texture = texture;
        this.fileName = fileName;
        this.visible = true;
        this.transformTarget = new THREE.Object3D();
        this.uniforms = {
            uScale: new THREE.Vector2(1, 1),
            uOffset: new THREE.Vector2(0, 0),
            uRotation: 0.0,
            uFlip: new THREE.Vector2(1, 1),
            uProjectionAxis: new THREE.Vector3(0, 0, 1),
            uClamp: new THREE.Vector2(0, 1),
        };
        this.aspectCorrectionFactor = 1.0;
        this.needsUpdate = true;
    }
}

// 3D Viewer Tool Module - Part 2/3 (Shader Code and Core Functions)

const vertexShader = `
varying vec3 vWorldPosition;
varying vec3 vNormal;

void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const fragmentShader = `
#define MAX_LAYERS ${MAX_LAYERS}

uniform sampler2D uDecalTextures[MAX_LAYERS];
uniform vec3 uBaseColor;
uniform int uLayerCount;
uniform vec2 uScales[MAX_LAYERS];
uniform vec2 uOffsets[MAX_LAYERS];
uniform float uRotations[MAX_LAYERS];
uniform vec2 uFlips[MAX_LAYERS];
uniform vec3 uProjectionAxes[MAX_LAYERS];
uniform vec2 uClamps[MAX_LAYERS];
uniform float uVisibles[MAX_LAYERS];
uniform vec3 uLightPosition;
uniform float uLightIntensity;
uniform vec3 uModelMin;
uniform vec3 uModelSize;

varying vec3 vWorldPosition;
varying vec3 vNormal;

const float PI = 3.14159265359;

void main() {
    vec3 normal = normalize(vNormal);
    if (!gl_FrontFacing) normal = -normal;
    
    vec3 finalColor = uBaseColor;
    
    for (int i = 0; i < MAX_LAYERS; ++i) {
        if (i >= uLayerCount || uVisibles[i] < 0.5) continue;
        
        float circumferentialAngle, vPos;
        vec3 projAxis = uProjectionAxes[i];
        
        if (projAxis.x > 0.5) {
            circumferentialAngle = atan(vWorldPosition.z, vWorldPosition.y) / (2.0 * PI) + 0.5;
            vPos = (vWorldPosition.x - uModelMin.x) / uModelSize.x;
        } else if (projAxis.y > 0.5) {
            circumferentialAngle = atan(vWorldPosition.x, vWorldPosition.z) / (2.0 * PI) + 0.5;
            vPos = (vWorldPosition.y - uModelMin.y) / uModelSize.y;
        } else {
            circumferentialAngle = atan(vWorldPosition.y, vWorldPosition.x) / (2.0 * PI) + 0.5;
            vPos = (vWorldPosition.z - uModelMin.z) / uModelSize.z;
        }
        
        float coverage = uScales[i].x;
        float center = uOffsets[i].x + 0.5;
        float startAngle = center - coverage / 2.0;
        float endAngle = center + coverage / 2.0;
        bool inCircumferentialRange = false;
        float remappedU = 0.0;
        
        if (startAngle < 0.0) {
            if (circumferentialAngle > startAngle + 1.0 || circumferentialAngle < endAngle) {
                inCircumferentialRange = true;
                remappedU = (circumferentialAngle > endAngle) ? 
                    (circumferentialAngle - 1.0 - startAngle) / coverage : 
                    (circumferentialAngle - startAngle) / coverage;
            }
        } else if (endAngle > 1.0) {
            if (circumferentialAngle > startAngle || circumferentialAngle < endAngle - 1.0) {
                inCircumferentialRange = true;
                remappedU = (circumferentialAngle < startAngle) ? 
                    (circumferentialAngle + 1.0 - startAngle) / coverage : 
                    (circumferentialAngle - startAngle) / coverage;
            }
        } else {
            if (circumferentialAngle > startAngle && circumferentialAngle < endAngle) {
                inCircumferentialRange = true;
                remappedU = (circumferentialAngle - startAngle) / coverage;
            }
        }
        
        if (vPos > uClamps[i].x && vPos < uClamps[i].y && inCircumferentialRange) {
            vec2 uv = vec2(remappedU, (vPos + uOffsets[i].y) * uScales[i].y);
            uv = (uv - 0.5) * uFlips[i] + 0.5;
            mat2 rotMat = mat2(cos(uRotations[i]), -sin(uRotations[i]), 
                              sin(uRotations[i]), cos(uRotations[i]));
            uv = rotMat * (uv - 0.5) + 0.5;
            
            if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
                vec4 decalColor = vec4(0.0);
                
                if (i == 0) decalColor = texture2D(uDecalTextures[0], uv);
                else if (i == 1) decalColor = texture2D(uDecalTextures[1], uv);
                else if (i == 2) decalColor = texture2D(uDecalTextures[2], uv);
                else if (i == 3) decalColor = texture2D(uDecalTextures[3], uv);
                else if (i == 4) decalColor = texture2D(uDecalTextures[4], uv);
                else if (i == 5) decalColor = texture2D(uDecalTextures[5], uv);
                else if (i == 6) decalColor = texture2D(uDecalTextures[6], uv);
                else if (i == 7) decalColor = texture2D(uDecalTextures[7], uv);
                
                if (decalColor.a > 0.1) {
                    finalColor = mix(finalColor, decalColor.rgb, decalColor.a);
                }
            }
        }
    }
    
    float ambientStrength = 0.5;
    vec3 ambient = ambientStrength * vec3(1.0);
    vec3 lightDir = normalize(uLightPosition - vWorldPosition);
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diff * vec3(1.0) * uLightIntensity;
    vec3 lighting = ambient + diffuse;
    
    gl_FragColor = vec4(finalColor * lighting, 1.0);
}
`;

function cacheDomElements() {
    const query = (selector) => container.querySelector(selector);
    domElements = {
        rendererContainer: query('#renderer-container'),
        modelUploadInput: query('#model-upload'),
        textureUploadInput: query('#texture-upload'),
        modelFileNameSpan: query('#model-file-name'),
        messageBox: query('#message-box'),
        messageText: query('#message-text'),
        layerList: query('#layer-list'),
        addLayerBtn: query('#add-layer-btn'),
        controlsWrapper: query('#controls-wrapper'),
        translateBtn: query('#translate-btn'),
        rotateBtn: query('#rotate-btn'),
        axisXBtn: query('#axis-x-btn'),
        axisYBtn: query('#axis-y-btn'),
        axisZBtn: query('#axis-z-btn'),
        offsetUSlider: query('#offset-u'),
        offsetVSlider: query('#offset-v'),
        uniformScaleSlider: query('#uniform-scale'),
        rotationSlider: query('#rotation'),
        flipXBtn: query('#flip-x-btn'),
        flipYBtn: query('#flip-y-btn'),
        clampMinSlider: query('#clamp-min'),
        clampMaxSlider: query('#clamp-max'),
        resetControlsBtn: query('#reset-controls-btn'),
        lightIntensitySlider: query('#light-intensity'),
        lightAzimuthSlider: query('#light-azimuth'),
        lightElevationSlider: query('#light-elevation'),
        lightDistanceSlider: query('#light-distance'),
        panelHeaders: container.querySelectorAll('.panel-header')
    };
}

function doInit() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    
    const { rendererContainer } = domElements;
    camera = new THREE.PerspectiveCamera(
        75,
        rendererContainer.clientWidth / rendererContainer.clientHeight,
        0.1,
        1000
    );
    camera.position.set(0, 15, 50);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(rendererContainer.clientWidth, rendererContainer.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererContainer.appendChild(renderer.domElement);
    
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    scene.add(directionalLight);
    
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = false;
    
    transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls);
    
    createDecalMaterial();
    loadDefaultModel();
    addEventListeners();
    updateLighting();
    animate();
}

function createDecalMaterial() {
    const uniforms = {
        uBaseColor: { value: new THREE.Color(0x888888) },
        uLayerCount: { value: 0 },
        uLightPosition: { value: new THREE.Vector3() },
        uLightIntensity: { value: 1.5 },
        uModelMin: { value: new THREE.Vector3(0, 0, 0) },
        uModelSize: { value: new THREE.Vector3(1, 1, 1) },
        uDecalTextures: { value: [] },
        uScales: { value: [] },
        uOffsets: { value: [] },
        uRotations: { value: [] },
        uFlips: { value: [] },
        uProjectionAxes: { value: [] },
        uClamps: { value: [] },
        uVisibles: { value: [] }
    };
    
    for (let i = 0; i < MAX_LAYERS; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, 1, 1);
        
        uniforms.uDecalTextures.value.push(new THREE.CanvasTexture(canvas));
        uniforms.uScales.value.push(new THREE.Vector2(1, 1));
        uniforms.uOffsets.value.push(new THREE.Vector2(0, 0));
        uniforms.uRotations.value.push(0.0);
        uniforms.uFlips.value.push(new THREE.Vector2(1, 1));
        uniforms.uProjectionAxes.value.push(new THREE.Vector3(0, 0, 1));
        uniforms.uClamps.value.push(new THREE.Vector2(0, 1));
        uniforms.uVisibles.value.push(0.0);
    }
    
    decalMaterial = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide
    });
}

function loadDefaultModel() {
    const geometry = new THREE.CylinderGeometry(10, 10, 30, 32);
    setModel(new THREE.Mesh(geometry, decalMaterial));
}

function setModel(newModel) {
    if (model) scene.remove(model);
    model = newModel;
    scene.add(model);
    
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    decalMaterial.uniforms.uModelSize.value = size;
    decalMaterial.uniforms.uModelMin.value = box.min;
    model.position.sub(center);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    camera.position.z = center.z + Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
    camera.far = camera.position.z + maxDim * 2;
    camera.updateProjectionMatrix();
    
    orbitControls.target.copy(center);
    orbitControls.update();
    
    layers.forEach(layer => {
        recalculateAspectRatio(layer);
        layer.needsUpdate = true;
    });
    batchUpdateShaderUniforms();
    requestRender();
}

// 3D Viewer Tool Module - Part 3/3 (Event Handlers and Export)

function handleModelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    domElements.modelFileNameSpan.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
        const loader = new OBJLoader();
        const object = loader.parse(e.target.result);
        object.traverse(child => {
            if (child.isMesh) child.material = decalMaterial;
        });
        setModel(object);
    };
    reader.readAsText(file);
}

function handleTextureUpload(event) {
    const file = event.target.files[0];
    if (!file || layers.length >= MAX_LAYERS) {
        if (layers.length >= MAX_LAYERS) showMessage(`Maximum of ${MAX_LAYERS} layers reached.`, 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(e.target.result, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.generateMipmaps = false;
            
            const newLayer = new Layer(texture, file.name);
            layers.push(newLayer);
            recalculateAspectRatio(newLayer);
            selectLayer(newLayer);
            updateLayerList();
            batchUpdateShaderUniforms();
            requestRender();
        });
    };
    reader.readAsDataURL(file);
}

function selectLayer(layer) {
    if (selectedLayer === layer) return;
    selectedLayer = layer;
    transformControls.attach(layer.transformTarget);
    scene.add(layer.transformTarget);
    updateControlsToLayerState();
    updateLayerList();
    domElements.controlsWrapper.classList.remove('hidden');
    requestRender();
}

function deleteLayer(layerToDelete) {
    const index = layers.findIndex(l => l.id === layerToDelete.id);
    if (index === -1) return;
    layers.splice(index, 1);
    
    if (selectedLayer === layerToDelete) {
        selectedLayer = layers.length > 0 ? layers[Math.max(0, index - 1)] : null;
        if (selectedLayer) {
            selectLayer(selectedLayer);
        } else {
            transformControls.detach();
            domElements.controlsWrapper.classList.add('hidden');
        }
    }
    updateLayerList();
    batchUpdateShaderUniforms();
    requestRender();
}

function updateLayerList() {
    domElements.layerList.innerHTML = '';
    layers.forEach(layer => {
        const item = document.createElement('div');
        item.className = 'layer-item';
        if (layer === selectedLayer) item.classList.add('selected');
        item.innerHTML = `
            <span class="flex-grow truncate">${layer.fileName}</span>
            <button data-action="visible" class="p-1 rounded-md hover:bg-gray-300">${layer.visible ? '👁️' : '🙈'}</button>
            <button data-action="delete" class="p-1 rounded-md hover:bg-red-200 text-red-600">✕</button>
        `;
        item.addEventListener('click', (e) => !e.target.dataset.action && selectLayer(layer));
        item.querySelector('[data-action="visible"]').addEventListener('click', () => {
            layer.visible = !layer.visible;
            layer.needsUpdate = true;
            batchUpdateShaderUniforms();
            updateLayerList();
            requestRender();
        });
        item.querySelector('[data-action="delete"]').addEventListener('click', () => deleteLayer(layer));
        domElements.layerList.appendChild(item);
    });
}

function updateControlsToLayerState() {
    if (!selectedLayer) return;
    const { uniforms } = selectedLayer;
    const { offsetUSlider, offsetVSlider, uniformScaleSlider, rotationSlider, clampMinSlider, clampMaxSlider, flipXBtn, flipYBtn, axisXBtn, axisYBtn, axisZBtn } = domElements;
    
    offsetUSlider.value = uniforms.uOffset.x;
    offsetVSlider.value = uniforms.uOffset.y;
    uniformScaleSlider.value = uniforms.uScale.x;
    rotationSlider.value = uniforms.uRotation;
    clampMinSlider.value = uniforms.uClamp.x;
    clampMaxSlider.value = uniforms.uClamp.y;
    flipXBtn.classList.toggle('active', uniforms.uFlip.x < 0);
    flipYBtn.classList.toggle('active', uniforms.uFlip.y < 0);
    
    const axis = uniforms.uProjectionAxis;
    axisXBtn.classList.toggle('active', axis.x > 0.5);
    axisYBtn.classList.toggle('active', axis.y > 0.5);
    axisZBtn.classList.toggle('active', axis.z > 0.5);
}

function recalculateAspectRatio(layer) {
    if (!layer || !layer.texture || !layer.texture.image.height) return;
    const textureAR = layer.texture.image.width / layer.texture.image.height;
    const modelSize = decalMaterial.uniforms.uModelSize.value;
    const projAxis = layer.uniforms.uProjectionAxis;
    let modelHeight, modelDiameter;
    
    if (projAxis.x > 0.5) {
        modelHeight = modelSize.x;
        modelDiameter = (modelSize.y + modelSize.z) / 2;
    } else if (projAxis.y > 0.5) {
        modelHeight = modelSize.y;
        modelDiameter = (modelSize.x + modelSize.z) / 2;
    } else {
        modelHeight = modelSize.z;
        modelDiameter = (modelSize.x + modelSize.y) / 2;
    }
    
    if (modelHeight > 0 && modelDiameter > 0) {
        const modelAR = (Math.PI * modelDiameter) / modelHeight;
        layer.aspectCorrectionFactor = textureAR / modelAR;
    } else {
        layer.aspectCorrectionFactor = 1.0;
    }
    domElements.uniformScaleSlider.value = layer.aspectCorrectionFactor;
}

function batchUpdateShaderUniforms() {
    decalMaterial.uniforms.uLayerCount.value = layers.length;
    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        if (layer.needsUpdate) {
            decalMaterial.uniforms.uDecalTextures.value[i] = layer.texture;
            decalMaterial.uniforms.uScales.value[i].copy(layer.uniforms.uScale);
            decalMaterial.uniforms.uOffsets.value[i].copy(layer.uniforms.uOffset);
            decalMaterial.uniforms.uRotations.value[i] = layer.uniforms.uRotation;
            decalMaterial.uniforms.uFlips.value[i].copy(layer.uniforms.uFlip);
            decalMaterial.uniforms.uProjectionAxes.value[i].copy(layer.uniforms.uProjectionAxis);
            decalMaterial.uniforms.uClamps.value[i].copy(layer.uniforms.uClamp);
            decalMaterial.uniforms.uVisibles.value[i] = layer.visible ? 1.0 : 0.0;
            layer.needsUpdate = false;
        }
    }
    for (let i = layers.length; i < MAX_LAYERS; i++) {
        decalMaterial.uniforms.uVisibles.value[i] = 0.0;
    }
}

function requestRender() {
    needsRender = true;
}

let sliderUpdateFrame = null;
function throttledSliderUpdate() {
    if (sliderUpdateFrame) return;
    sliderUpdateFrame = requestAnimationFrame(() => {
        if (!selectedLayer) {
            sliderUpdateFrame = null;
            return;
        }
        const layer = selectedLayer;
        layer.uniforms.uOffset.set(
            parseFloat(domElements.offsetUSlider.value),
            parseFloat(domElements.offsetVSlider.value)
        );
        layer.uniforms.uRotation = parseFloat(domElements.rotationSlider.value);
        layer.uniforms.uClamp.set(
            parseFloat(domElements.clampMinSlider.value),
            parseFloat(domElements.clampMaxSlider.value)
        );
        const coverage = parseFloat(domElements.uniformScaleSlider.value);
        const safeCoverage = Math.max(coverage, 0.0001);
        const tiling = layer.aspectCorrectionFactor / safeCoverage;
        layer.uniforms.uScale.set(coverage, tiling);
        layer.transformTarget.position.set(layer.uniforms.uOffset.x * 100, layer.uniforms.uOffset.y * 100, 0);
        layer.transformTarget.rotation.z = layer.uniforms.uRotation;
        layer.needsUpdate = true;
        batchUpdateShaderUniforms();
        requestRender();
        sliderUpdateFrame = null;
    });
}

function addEventListeners() {
    window.addEventListener('resize', onWindowResize);
    orbitControls.addEventListener('change', requestRender);
    domElements.modelUploadInput.addEventListener('change', handleModelUpload);
    domElements.textureUploadInput.addEventListener('change', handleTextureUpload);
    domElements.addLayerBtn.addEventListener('click', () => domElements.textureUploadInput.click());
    transformControls.addEventListener('objectChange', requestRender);
    transformControls.addEventListener('dragging-changed', (event) => {
        orbitControls.enabled = !event.value;
        continuousRender = event.value;
    });
    domElements.translateBtn.addEventListener('click', () => {
        transformControls.setMode('translate');
        domElements.translateBtn.classList.add('active');
        domElements.rotateBtn.classList.remove('active');
        requestRender();
    });
    domElements.rotateBtn.addEventListener('click', () => {
        transformControls.setMode('rotate');
        domElements.rotateBtn.classList.add('active');
        domElements.translateBtn.classList.remove('active');
        requestRender();
    });
    [domElements.offsetUSlider, domElements.offsetVSlider, domElements.uniformScaleSlider, domElements.rotationSlider, domElements.clampMinSlider, domElements.clampMaxSlider].forEach(el => {
        el.addEventListener('input', throttledSliderUpdate);
        el.addEventListener('mousedown', () => continuousRender = true);
        el.addEventListener('mouseup', () => continuousRender = false);
    });
    [domElements.flipXBtn, domElements.flipYBtn].forEach(el => {
        el.addEventListener('click', () => {
            if (!selectedLayer) return;
            el.classList.toggle('active');
            selectedLayer.uniforms.uFlip.set(
                domElements.flipXBtn.classList.contains('active') ? -1 : 1,
                domElements.flipYBtn.classList.contains('active') ? -1 : 1
            );
            selectedLayer.needsUpdate = true;
            batchUpdateShaderUniforms();
            requestRender();
        });
    });
    [domElements.axisXBtn, domElements.axisYBtn, domElements.axisZBtn].forEach(el => {
        el.addEventListener('click', () => {
            if (!selectedLayer) return;
            [domElements.axisXBtn, domElements.axisYBtn, domElements.axisZBtn].forEach(btn => btn.classList.remove('active'));
            el.classList.add('active');
            const axis = el.id === 'axis-x-btn' ? new THREE.Vector3(1, 0, 0) :
                        el.id === 'axis-y-btn' ? new THREE.Vector3(0, 1, 0) :
                        new THREE.Vector3(0, 0, 1);
            selectedLayer.uniforms.uProjectionAxis.copy(axis);
            recalculateAspectRatio(selectedLayer);
            updateControlsToLayerState();
            selectedLayer.needsUpdate = true;
            batchUpdateShaderUniforms();
            requestRender();
        });
    });
    [domElements.lightIntensitySlider, domElements.lightAzimuthSlider, domElements.lightElevationSlider, domElements.lightDistanceSlider].forEach(el => {
        el.addEventListener('input', () => {
            updateLighting();
            requestRender();
        });
        el.addEventListener('mousedown', () => continuousRender = true);
        el.addEventListener('mouseup', () => continuousRender = false);
    });
    domElements.resetControlsBtn.addEventListener('click', () => {
        if (!selectedLayer) return;
        selectedLayer.uniforms.uOffset.set(0, 0);
        selectedLayer.uniforms.uRotation = 0;
        selectedLayer.uniforms.uClamp.set(0, 1);
        selectedLayer.uniforms.uFlip.set(1, 1);
        recalculateAspectRatio(selectedLayer);
        selectedLayer.transformTarget.position.set(0, 0, 0);
        selectedLayer.transformTarget.rotation.z = 0;
        updateControlsToLayerState();
        selectedLayer.needsUpdate = true;
        batchUpdateShaderUniforms();
        requestRender();
    });
    domElements.panelHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const content = container.querySelector('#' + header.dataset.target);
            const arrow = header.querySelector('.arrow-icon');
            content.classList.toggle('collapsed');
            arrow.classList.toggle('collapsed');
        });
    });
}

function updateLighting() {
    const intensity = parseFloat(domElements.lightIntensitySlider.value);
    const azimuth = THREE.MathUtils.degToRad(parseFloat(domElements.lightAzimuthSlider.value));
    const elevation = THREE.MathUtils.degToRad(parseFloat(domElements.lightElevationSlider.value));
    const distance = parseFloat(domElements.lightDistanceSlider.value);
    
    directionalLight.intensity = intensity;
    directionalLight.position.set(
        distance * Math.sin(elevation) * Math.cos(azimuth),
        distance * Math.cos(elevation),
        distance * Math.sin(elevation) * Math.sin(azimuth)
    );
    decalMaterial.uniforms.uLightIntensity.value = intensity;
    decalMaterial.uniforms.uLightPosition.value.copy(directionalLight.position);
}

function onWindowResize() {
    if (!renderer || !camera || !domElements.rendererContainer) return;
    camera.aspect = domElements.rendererContainer.clientWidth / domElements.rendererContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(domElements.rendererContainer.clientWidth, domElements.rendererContainer.clientHeight);
    requestRender();
}

function showMessage(text, type = 'info') {
    domElements.messageText.textContent = text;
    domElements.messageBox.className = `fixed bottom-5 left-1/2 -translate-x-1/2 text-white py-2 px-5 rounded-lg shadow-xl transition-opacity duration-300 opacity-100 ${
        type === 'error' ? 'bg-red-500' : 'bg-blue-500'
    }`;
    setTimeout(() => {
        domElements.messageBox.classList.replace('opacity-100', 'opacity-0');
    }, 3000);
}

function animate() {
    animationFrameId = requestAnimationFrame(animate);
    if (continuousRender) needsRender = true;
    if (needsRender && renderer && scene && camera) {
        renderer.render(scene, camera);
        needsRender = false;
    }
}

export default {
    init: async (toolContainer) => {
        container = toolContainer;
        container.innerHTML = HTML;
        container.style.overflow = 'hidden';
        cacheDomElements();
        doInit();
    },
    
    destroy: () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', onWindowResize);
        if (orbitControls) orbitControls.dispose();
        if (transformControls) transformControls.dispose();
        if (scene) {
            scene.traverse(object => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
        }
        if (renderer) {
            renderer.dispose();
            if (renderer.domElement.parentElement) {
                renderer.domElement.parentElement.removeChild(renderer.domElement);
            }
        }
        container.innerHTML = '';
        container.style.overflow = 'auto';
    }
};

