// 3D Viewer Tool Module - Complete with all features (Part 1/3)
import dataManager from '../data-manager.js';

// Three.js and addons will be dynamically imported
let THREE, OrbitControls, TransformControls, OBJLoader;

let container, scene, camera, renderer, orbitControls, transformControls, model, decalMaterial, directionalLight;
let layers = [], selectedLayer = null, needsRender = true, continuousRender = false, animationFrameId;
const MAX_LAYERS = 8;
let domElements = {};

const HTML = `
<div id="ui-container" class="viewer3d-ui">
    <!-- File Management Panel -->
    <div class="viewer3d-panel glass-panel">
        <div class="viewer3d-panel-header" data-target="upload-content">
            <span class="viewer3d-panel-title">File Management</span>
            <svg class="viewer3d-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
            </svg>
        </div>
        <div id="upload-content" class="viewer3d-panel-content">
            <label for="model-upload" class="viewer3d-btn viewer3d-btn-primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                Choose .obj File
            </label>
            <input type="file" id="model-upload" class="viewer3d-hidden" accept=".obj" aria-label="Upload 3D model file">
            <div id="model-file-name" class="viewer3d-file-name">Default Cylinder</div>
            <button id="export-to-hub-btn" class="viewer3d-btn viewer3d-btn-secondary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M16 12l-4 4-4-4M12 16V4"/></svg>
                Export to Hub
            </button>
        </div>
    </div>

    <!-- Layers Panel -->
    <div class="viewer3d-panel glass-panel">
        <div class="viewer3d-panel-header" data-target="layers-content">
            <span class="viewer3d-panel-title">Layers</span>
            <svg class="viewer3d-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
            </svg>
        </div>
        <div id="layers-content" class="viewer3d-panel-content">
            <div id="layer-list" class="viewer3d-layer-list"></div>
            <div class="viewer3d-btn-group">
                <button id="add-layer-btn" class="viewer3d-btn viewer3d-btn-primary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    Upload
                </button>
                <button id="pick-scan-btn" class="viewer3d-btn viewer3d-btn-secondary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    From Scans
                </button>
            </div>
            <input type="file" id="texture-upload" class="viewer3d-hidden" accept="image/png" aria-label="Upload texture image">
        </div>
    </div>

    <!-- Controls (shown when layer selected) -->
    <div id="controls-wrapper" class="viewer3d-hidden">
        <!-- Gizmo Mode -->
        <div class="viewer3d-panel glass-panel">
            <div class="viewer3d-panel-header" data-target="gizmo-content">
                <span class="viewer3d-panel-title">Gizmo Mode</span>
                <svg class="viewer3d-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </div>
            <div id="gizmo-content" class="viewer3d-panel-content">
                <div class="viewer3d-toggle-group">
                    <button id="translate-btn" class="viewer3d-toggle active">Translate</button>
                    <button id="rotate-btn" class="viewer3d-toggle">Rotate</button>
                </div>
            </div>
        </div>

        <!-- Model Rotation -->
        <div class="viewer3d-panel glass-panel">
            <div class="viewer3d-panel-header" data-target="model-rotation-content">
                <span class="viewer3d-panel-title">Model Rotation</span>
                <svg class="viewer3d-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </div>
            <div id="model-rotation-content" class="viewer3d-panel-content">
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Rotate X (°)</label>
                    <div class="viewer3d-slider-row">
                        <button data-action="dec-model-rotate-x" class="viewer3d-step-btn" aria-label="Decrease">−</button>
                        <input type="range" id="model-rotate-x" min="-180" max="180" step="1" value="0" class="viewer3d-slider">
                        <button data-action="inc-model-rotate-x" class="viewer3d-step-btn" aria-label="Increase">+</button>
                        <input type="number" id="model-rotate-x-value" min="-180" max="180" step="1" value="0" class="viewer3d-number-input">
                    </div>
                </div>
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Rotate Y (°)</label>
                    <div class="viewer3d-slider-row">
                        <button data-action="dec-model-rotate-y" class="viewer3d-step-btn" aria-label="Decrease">−</button>
                        <input type="range" id="model-rotate-y" min="-180" max="180" step="1" value="0" class="viewer3d-slider">
                        <button data-action="inc-model-rotate-y" class="viewer3d-step-btn" aria-label="Increase">+</button>
                        <input type="number" id="model-rotate-y-value" min="-180" max="180" step="1" value="0" class="viewer3d-number-input">
                    </div>
                </div>
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Rotate Z (°)</label>
                    <div class="viewer3d-slider-row">
                        <button data-action="dec-model-rotate-z" class="viewer3d-step-btn" aria-label="Decrease">−</button>
                        <input type="range" id="model-rotate-z" min="-180" max="180" step="1" value="0" class="viewer3d-slider">
                        <button data-action="inc-model-rotate-z" class="viewer3d-step-btn" aria-label="Increase">+</button>
                        <input type="number" id="model-rotate-z-value" min="-180" max="180" step="1" value="0" class="viewer3d-number-input">
                    </div>
                </div>
                <button id="reset-model-rotation-btn" class="viewer3d-btn viewer3d-btn-ghost">Reset Rotation</button>
            </div>
        </div>

        <!-- Lighting Controls -->
        <div class="viewer3d-panel glass-panel">
            <div class="viewer3d-panel-header" data-target="lighting-content">
                <span class="viewer3d-panel-title">Lighting</span>
                <svg class="viewer3d-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </div>
            <div id="lighting-content" class="viewer3d-panel-content">
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Brightness</label>
                    <input type="range" id="light-intensity" min="0" max="3" step="0.1" value="1.5" class="viewer3d-slider">
                </div>
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Azimuth</label>
                    <input type="range" id="light-azimuth" min="0" max="360" step="1" value="45" class="viewer3d-slider">
                </div>
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Elevation</label>
                    <input type="range" id="light-elevation" min="0" max="180" step="1" value="45" class="viewer3d-slider">
                </div>
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Distance</label>
                    <input type="range" id="light-distance" min="20" max="500" step="1" value="500" class="viewer3d-slider">
                </div>
            </div>
        </div>

        <!-- Texture Controls -->
        <div class="viewer3d-panel glass-panel">
            <div class="viewer3d-panel-header" data-target="texture-content">
                <span class="viewer3d-panel-title">Texture Controls</span>
                <svg class="viewer3d-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </div>
            <div id="texture-content" class="viewer3d-panel-content">
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Projection Axis</label>
                    <div class="viewer3d-toggle-group viewer3d-toggle-group-3">
                        <button id="axis-x-btn" class="viewer3d-toggle">X</button>
                        <button id="axis-y-btn" class="viewer3d-toggle">Y</button>
                        <button id="axis-z-btn" class="viewer3d-toggle active">Z</button>
                    </div>
                </div>
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Offset (Circumference)</label>
                    <div class="viewer3d-slider-row">
                        <button data-action="dec-offset-u" class="viewer3d-step-btn" aria-label="Decrease">−</button>
                        <input type="range" id="offset-u" min="-1" max="1" step="0.01" value="0" class="viewer3d-slider">
                        <button data-action="inc-offset-u" class="viewer3d-step-btn" aria-label="Increase">+</button>
                        <input type="number" id="offset-u-value" min="-1" max="1" step="0.001" value="0" class="viewer3d-number-input">
                    </div>
                </div>
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Offset (Length)</label>
                    <div class="viewer3d-slider-row">
                        <button data-action="dec-offset-v" class="viewer3d-step-btn" aria-label="Decrease">−</button>
                        <input type="range" id="offset-v" min="-1" max="1" step="0.01" value="0" class="viewer3d-slider">
                        <button data-action="inc-offset-v" class="viewer3d-step-btn" aria-label="Increase">+</button>
                        <input type="number" id="offset-v-value" min="-1" max="1" step="0.001" value="0" class="viewer3d-number-input">
                    </div>
                </div>
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Scale</label>
                    <div class="viewer3d-slider-row">
                        <button data-action="dec-scale" class="viewer3d-step-btn" aria-label="Decrease">−</button>
                        <input type="range" id="uniform-scale" min="0.01" max="2" step="0.01" value="1" class="viewer3d-slider">
                        <button data-action="inc-scale" class="viewer3d-step-btn" aria-label="Increase">+</button>
                        <input type="number" id="uniform-scale-value" min="0.01" max="2" step="0.001" value="1" class="viewer3d-number-input">
                    </div>
                </div>
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Rotation</label>
                    <div class="viewer3d-slider-row">
                        <button data-action="dec-rotation" class="viewer3d-step-btn" aria-label="Decrease">−</button>
                        <input type="range" id="rotation" min="-3.141" max="3.141" step="0.01" value="0" class="viewer3d-slider">
                        <button data-action="inc-rotation" class="viewer3d-step-btn" aria-label="Increase">+</button>
                        <input type="number" id="rotation-value" min="-3.141" max="3.141" step="0.001" value="0" class="viewer3d-number-input">
                    </div>
                </div>
                <div class="viewer3d-toggle-group">
                    <button id="flip-x-btn" class="viewer3d-toggle">Flip H</button>
                    <button id="flip-y-btn" class="viewer3d-toggle">Flip V</button>
                </div>
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Projection Start</label>
                    <input type="range" id="clamp-min" min="-0.5" max="1.5" step="0.01" value="0.15" class="viewer3d-slider">
                </div>
                <div class="viewer3d-control-group">
                    <label class="viewer3d-label">Projection End</label>
                    <input type="range" id="clamp-max" min="-0.5" max="1.5" step="0.01" value="0.85" class="viewer3d-slider">
                </div>
                <button id="reset-controls-btn" class="viewer3d-btn viewer3d-btn-ghost">Reset All</button>
            </div>
        </div>
    </div>
</div>

<div id="renderer-container"></div>

<!-- Message Toast -->
<div id="message-box" class="viewer3d-toast viewer3d-hidden">
    <p id="message-text"></p>
</div>

<!-- Scan Picker Modal -->
<div id="scan-picker-modal" class="viewer3d-modal viewer3d-hidden">
    <div class="viewer3d-modal-backdrop"></div>
    <div class="viewer3d-modal-content glass-panel">
        <div class="viewer3d-modal-header">
            <h3 class="viewer3d-modal-title">Select Scan Image</h3>
            <button id="close-picker-btn" class="viewer3d-modal-close" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <div id="scan-picker-content" class="viewer3d-modal-body"></div>
    </div>
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
varying vec3 vLocalPosition;
varying vec3 vNormal;

void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vLocalPosition = position;
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
    // Check if normal is valid
    if (length(normal) < 0.1) {
        // Invalid normal - use a default
        normal = vec3(0.0, 0.0, 1.0);
    }
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
        pickScanBtn: query('#pick-scan-btn'),
        exportToHubBtn: query('#export-to-hub-btn'),
        scanPickerModal: query('#scan-picker-modal'),
        scanPickerContent: query('#scan-picker-content'),
        closePickerBtn: query('#close-picker-btn'),
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
        offsetUValue: query('#offset-u-value'),
        offsetVValue: query('#offset-v-value'),
        uniformScaleValue: query('#uniform-scale-value'),
        rotationValue: query('#rotation-value'),
        flipXBtn: query('#flip-x-btn'),
        flipYBtn: query('#flip-y-btn'),
        clampMinSlider: query('#clamp-min'),
        clampMaxSlider: query('#clamp-max'),
        resetControlsBtn: query('#reset-controls-btn'),
        lightIntensitySlider: query('#light-intensity'),
        lightAzimuthSlider: query('#light-azimuth'),
        lightElevationSlider: query('#light-elevation'),
        lightDistanceSlider: query('#light-distance'),
        modelRotateXSlider: query('#model-rotate-x'),
        modelRotateYSlider: query('#model-rotate-y'),
        modelRotateZSlider: query('#model-rotate-z'),
        modelRotateXValue: query('#model-rotate-x-value'),
        modelRotateYValue: query('#model-rotate-y-value'),
        modelRotateZValue: query('#model-rotate-z-value'),
        resetModelRotationBtn: query('#reset-model-rotation-btn'),
        panelHeaders: container.querySelectorAll('.viewer3d-panel-header')
    };
}

function doInit() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const { rendererContainer } = domElements;

    // Get container dimensions - try multiple methods
    let width = rendererContainer.clientWidth;
    let height = rendererContainer.clientHeight;

    // Try getBoundingClientRect if clientWidth/Height are 0
    if (width === 0 || height === 0) {
        const rect = rendererContainer.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
    }

    // Try parent container dimensions
    if (width === 0 || height === 0) {
        width = container.clientWidth;
        height = container.clientHeight;
    }

    // Final fallback: use window dimensions and set explicit size on renderer container
    if (width === 0 || height === 0) {
        console.warn('3D Viewer: Container still has 0 dimensions in doInit, using window size');
        width = window.innerWidth;
        height = window.innerHeight - 140; // Account for header + banner
        // Set explicit dimensions on the renderer container
        rendererContainer.style.width = width + 'px';
        rendererContainer.style.height = height + 'px';
    }

    console.log(`3D Viewer: Initializing with dimensions ${width}x${height}`);

    camera = new THREE.PerspectiveCamera(
        75,
        width / height,
        0.1,
        1000
    );
    camera.position.set(0, 15, 50);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
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
    console.log('setModel() called with:', newModel);
    if (model) scene.remove(model);
    model = newModel;

    // Calculate bounding box before adding to scene
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    console.log('Model bounds:', {
        min: box.min,
        max: box.max,
        size: size,
        center: center
    });

    // Center the model at origin
    model.position.sub(center);

    // Add to scene AFTER centering
    scene.add(model);

    // Now calculate the bounding box in world space (centered at origin)
    const centeredBox = new THREE.Box3().setFromObject(model);

    console.log('Centered model bounds:', {
        min: centeredBox.min,
        max: centeredBox.max
    });

    decalMaterial.uniforms.uModelSize.value = size;
    decalMaterial.uniforms.uModelMin.value = centeredBox.min;

    console.log('Material uniforms:', {
        uBaseColor: decalMaterial.uniforms.uBaseColor.value,
        uModelSize: decalMaterial.uniforms.uModelSize.value,
        uModelMin: decalMaterial.uniforms.uModelMin.value,
        uLayerCount: decalMaterial.uniforms.uLayerCount.value
    });

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    camera.position.z = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
    camera.far = camera.position.z + maxDim * 2;
    camera.updateProjectionMatrix();

    console.log('Camera position:', camera.position, 'far:', camera.far);

    orbitControls.target.set(0, 0, 0);
    orbitControls.update();

    layers.forEach(layer => {
        recalculateAspectRatio(layer);
        layer.needsUpdate = true;
    });
    batchUpdateShaderUniforms();
    decalMaterial.needsUpdate = true;
    requestRender();
    console.log('setModel() complete, render requested');
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
            if (child.isMesh) {
                child.material = decalMaterial;
                // Ensure geometry has proper attributes
                if (child.geometry && !child.geometry.attributes.normal) {
                    child.geometry.computeVertexNormals();
                }
            }
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
    domElements.controlsWrapper.classList.remove('viewer3d-hidden');
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
            domElements.controlsWrapper.classList.add('viewer3d-hidden');
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
        item.className = 'viewer3d-layer-item';
        if (layer === selectedLayer) item.classList.add('selected');
        // SECURITY: Build layer item safely without innerHTML to prevent XSS
        const nameSpan = document.createElement('span');
        nameSpan.className = 'viewer3d-layer-name';
        nameSpan.textContent = layer.fileName; // textContent auto-escapes
        item.appendChild(nameSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'viewer3d-layer-actions';

        const visibleBtn = document.createElement('button');
        visibleBtn.dataset.action = 'visible';
        visibleBtn.className = 'viewer3d-layer-btn';
        visibleBtn.setAttribute('aria-label', layer.visible ? 'Hide layer' : 'Show layer');
        visibleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${layer.visible
                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                : '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
            }
        </svg>`;
        actionsDiv.appendChild(visibleBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.dataset.action = 'delete';
        deleteBtn.className = 'viewer3d-layer-btn';
        deleteBtn.setAttribute('aria-label', 'Delete layer');
        deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
        actionsDiv.appendChild(deleteBtn);

        item.appendChild(actionsDiv);
        item.addEventListener('click', (e) => !e.target.closest('[data-action]') && selectLayer(layer));
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
    const { offsetUSlider, offsetVSlider, uniformScaleSlider, rotationSlider, offsetUValue, offsetVValue, uniformScaleValue, rotationValue, clampMinSlider, clampMaxSlider, flipXBtn, flipYBtn, axisXBtn, axisYBtn, axisZBtn } = domElements;

    offsetUSlider.value = uniforms.uOffset.x;
    offsetVSlider.value = uniforms.uOffset.y;
    uniformScaleSlider.value = uniforms.uScale.x;
    rotationSlider.value = uniforms.uRotation;
    offsetUValue.value = uniforms.uOffset.x.toFixed(3);
    offsetVValue.value = uniforms.uOffset.y.toFixed(3);
    uniformScaleValue.value = uniforms.uScale.x.toFixed(3);
    rotationValue.value = uniforms.uRotation.toFixed(3);
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
function throttledSliderUpdate(updateValues = true) {
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

        if (updateValues) {
            domElements.offsetUValue.value = layer.uniforms.uOffset.x.toFixed(3);
            domElements.offsetVValue.value = layer.uniforms.uOffset.y.toFixed(3);
            domElements.uniformScaleValue.value = coverage.toFixed(3);
            domElements.rotationValue.value = layer.uniforms.uRotation.toFixed(3);
        }

        layer.needsUpdate = true;
        batchUpdateShaderUniforms();
        requestRender();
        sliderUpdateFrame = null;
    });
}

function syncValueToSlider(slider, valueInput) {
    if (!selectedLayer) return;
    const val = parseFloat(valueInput.value);
    const min = parseFloat(valueInput.min);
    const max = parseFloat(valueInput.max);
    const clampedVal = Math.max(min, Math.min(max, val));
    valueInput.value = clampedVal.toFixed(3);
    slider.value = clampedVal;
    throttledSliderUpdate(false);
}

function adjustValue(slider, valueInput, delta) {
    if (!selectedLayer) return;
    const currentVal = parseFloat(slider.value);
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const newVal = Math.max(min, Math.min(max, currentVal + delta));
    slider.value = newVal;
    valueInput.value = newVal.toFixed(3);
    throttledSliderUpdate(false);
}

// Serialize the current 3D viewer state
async function serializeState() {
    const state = {
        modelFileName: domElements.modelFileNameSpan.textContent,
        modelData: null, // Will be populated if custom model is loaded
        modelRotation: {
            x: parseFloat(domElements.modelRotateXSlider.value),
            y: parseFloat(domElements.modelRotateYSlider.value),
            z: parseFloat(domElements.modelRotateZSlider.value)
        },
        layers: [],
        lighting: {
            intensity: parseFloat(domElements.lightIntensitySlider.value),
            azimuth: parseFloat(domElements.lightAzimuthSlider.value),
            elevation: parseFloat(domElements.lightElevationSlider.value),
            distance: parseFloat(domElements.lightDistanceSlider.value)
        },
        camera: {
            position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
            target: { x: orbitControls.target.x, y: orbitControls.target.y, z: orbitControls.target.z }
        }
    };

    // Serialize each layer
    for (const layer of layers) {
        const layerData = {
            id: layer.id,
            fileName: layer.fileName,
            visible: layer.visible,
            textureDataURL: null,
            uniforms: {
                uScale: { x: layer.uniforms.uScale.x, y: layer.uniforms.uScale.y },
                uOffset: { x: layer.uniforms.uOffset.x, y: layer.uniforms.uOffset.y },
                uRotation: layer.uniforms.uRotation,
                uFlip: { x: layer.uniforms.uFlip.x, y: layer.uniforms.uFlip.y },
                uProjectionAxis: { x: layer.uniforms.uProjectionAxis.x, y: layer.uniforms.uProjectionAxis.y, z: layer.uniforms.uProjectionAxis.z },
                uClamp: { x: layer.uniforms.uClamp.x, y: layer.uniforms.uClamp.y }
            },
            aspectCorrectionFactor: layer.aspectCorrectionFactor
        };

        // Convert texture to data URL
        if (layer.texture && layer.texture.image) {
            const canvas = document.createElement('canvas');
            canvas.width = layer.texture.image.width;
            canvas.height = layer.texture.image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(layer.texture.image, 0, 0);
            layerData.textureDataURL = canvas.toDataURL('image/png');
        }

        state.layers.push(layerData);
    }

    // If using custom model (not default cylinder), serialize it
    if (domElements.modelFileNameSpan.textContent !== 'Default Cylinder') {
        // Export the model geometry to OBJ format
        state.modelData = await exportModelToOBJ();
    }

    return state;
}

// Export model to OBJ format
async function exportModelToOBJ() {
    if (!model) return null;

    let objContent = '# Exported from NDT Suite 3D Viewer\n';
    let vertexOffset = 0;

    model.traverse((child) => {
        if (child.isMesh && child.geometry) {
            const geometry = child.geometry;
            const vertices = geometry.attributes.position;
            const indices = geometry.index;

            // Export vertices
            for (let i = 0; i < vertices.count; i++) {
                const x = vertices.getX(i);
                const y = vertices.getY(i);
                const z = vertices.getZ(i);
                objContent += `v ${x} ${y} ${z}\n`;
            }

            // Export faces (with corrected vertex offset for multiple meshes)
            if (indices) {
                for (let i = 0; i < indices.count; i += 3) {
                    const a = indices.getX(i) + vertexOffset + 1;
                    const b = indices.getX(i + 1) + vertexOffset + 1;
                    const c = indices.getX(i + 2) + vertexOffset + 1;
                    objContent += `f ${a} ${b} ${c}\n`;
                }
            }

            vertexOffset += vertices.count;
        }
    });

    // Convert to data URL
    const blob = new Blob([objContent], { type: 'text/plain' });
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

// Generate thumbnail of current 3D view
async function generateThumbnail() {
    if (!renderer) return null;

    // Render a frame
    renderer.render(scene, camera);

    // Get canvas data as image
    const dataURL = renderer.domElement.toDataURL('image/png');
    return dataURL;
}

// Export to Hub
async function exportToHub() {
    if (layers.length === 0 && domElements.modelFileNameSpan.textContent === 'Default Cylinder') {
        showMessage('Nothing to export. Add some layers first.', 'error');
        return;
    }

    showMessage('Preparing export...');

    // Ensure data manager is initialized
    await dataManager.ensureInitialized();

    // Get assets
    const assets = dataManager.getAssets();

    // Create modal dialog
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 class="text-xl font-bold mb-4 dark:text-white">Export 3D Project to Hub</h2>

            <div class="mb-4">
                <label class="block text-sm font-medium mb-2 dark:text-gray-200">Project Name</label>
                <input type="text" id="project-name-input" placeholder="e.g., Tank A Inspection Model"
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white">
            </div>

            <div class="mb-4">
                <label class="block text-sm font-medium mb-2 dark:text-gray-200">Asset</label>
                <select id="asset-select" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white">
                    <option value="">-- Select Asset --</option>
                    ${assets.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
                </select>
                <button id="new-asset-btn" class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">+ Create New Asset</button>
            </div>

            <div class="mb-4" id="vessel-section" style="display:none;">
                <label class="block text-sm font-medium mb-2 dark:text-gray-200">Vessel</label>
                <select id="vessel-select" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white">
                    <option value="">-- Select Vessel --</option>
                </select>
                <button id="new-vessel-btn" class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">+ Create New Vessel</button>
            </div>

            <div class="flex gap-3 mt-6">
                <button id="export-confirm-btn" class="flex-1 bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700 transition-colors">Export</button>
                <button id="export-cancel-btn" class="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const projectNameInput = modal.querySelector('#project-name-input');
    const assetSelect = modal.querySelector('#asset-select');
    const vesselSelect = modal.querySelector('#vessel-select');
    const vesselSection = modal.querySelector('#vessel-section');
    const newAssetBtn = modal.querySelector('#new-asset-btn');
    const newVesselBtn = modal.querySelector('#new-vessel-btn');
    const confirmBtn = modal.querySelector('#export-confirm-btn');
    const cancelBtn = modal.querySelector('#export-cancel-btn');

    // Set default project name
    projectNameInput.value = `3D Model - ${new Date().toLocaleDateString()}`;

    // Asset selection handler
    assetSelect.addEventListener('change', () => {
        const assetId = assetSelect.value;
        if (assetId) {
            const asset = dataManager.getAsset(assetId);
            vesselSection.style.display = 'block';
            vesselSelect.innerHTML = '<option value="">-- Select Vessel --</option>' +
                asset.vessels.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
        } else {
            vesselSection.style.display = 'none';
        }
    });

    // New asset handler
    newAssetBtn.addEventListener('click', async () => {
        const name = prompt('Enter asset name:');
        if (name) {
            const asset = await dataManager.createAsset(name);
            // SECURITY: Use DOM API instead of innerHTML to prevent XSS
            const option = document.createElement('option');
            option.value = asset.id;
            option.textContent = asset.name;
            option.selected = true;
            assetSelect.appendChild(option);
            assetSelect.dispatchEvent(new Event('change'));
        }
    });

    // New vessel handler
    newVesselBtn.addEventListener('click', async () => {
        const assetId = assetSelect.value;
        if (!assetId) {
            alert('Please select an asset first');
            return;
        }
        const name = prompt('Enter vessel name:');
        if (name) {
            const vessel = await dataManager.createVessel(assetId, name);
            // SECURITY: Use DOM API instead of innerHTML to prevent XSS
            const option = document.createElement('option');
            option.value = vessel.id;
            option.textContent = vessel.name;
            option.selected = true;
            vesselSelect.appendChild(option);
        }
    });

    // Confirm export
    confirmBtn.addEventListener('click', async () => {
        const projectName = projectNameInput.value.trim();
        const assetId = assetSelect.value;
        const vesselId = vesselSelect.value;

        if (!projectName) {
            alert('Please enter a project name');
            return;
        }
        if (!assetId) {
            alert('Please select an asset');
            return;
        }
        if (!vesselId) {
            alert('Please select a vessel');
            return;
        }

        try {
            // Serialize the state
            const state = await serializeState();

            // Generate thumbnail
            const thumbnail = await generateThumbnail();

            const scanData = {
                name: projectName,
                toolType: '3dview',
                data: state,
                thumbnail: thumbnail,
                heatmapOnly: null
            };

            const scan = await dataManager.createScan(assetId, vesselId, scanData);

            if (scan) {
                document.body.removeChild(modal);
                showMessage('3D project exported to hub successfully!');
            } else {
                alert('Failed to export project');
            }
        } catch (error) {
            console.error('Export error:', error);
            alert('Failed to export: ' + error.message);
        }
    });

    // Cancel handler
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

function addEventListeners() {
    window.addEventListener('resize', onWindowResize);
    orbitControls.addEventListener('change', requestRender);
    domElements.modelUploadInput.addEventListener('change', handleModelUpload);
    domElements.textureUploadInput.addEventListener('change', handleTextureUpload);
    domElements.addLayerBtn.addEventListener('click', () => domElements.textureUploadInput.click());
    domElements.pickScanBtn.addEventListener('click', showScanPicker);
    domElements.exportToHubBtn.addEventListener('click', exportToHub);
    domElements.closePickerBtn.addEventListener('click', closeScanPicker);
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
        el.addEventListener('input', () => throttledSliderUpdate(true));
        el.addEventListener('mousedown', () => continuousRender = true);
        el.addEventListener('mouseup', () => continuousRender = false);
    });

    // Value input listeners
    domElements.offsetUValue.addEventListener('change', () => syncValueToSlider(domElements.offsetUSlider, domElements.offsetUValue));
    domElements.offsetVValue.addEventListener('change', () => syncValueToSlider(domElements.offsetVSlider, domElements.offsetVValue));
    domElements.uniformScaleValue.addEventListener('change', () => syncValueToSlider(domElements.uniformScaleSlider, domElements.uniformScaleValue));
    domElements.rotationValue.addEventListener('change', () => syncValueToSlider(domElements.rotationSlider, domElements.rotationValue));

    // Step button listeners
    container.querySelector('[data-action="dec-offset-u"]').addEventListener('click', () => adjustValue(domElements.offsetUSlider, domElements.offsetUValue, -0.01));
    container.querySelector('[data-action="inc-offset-u"]').addEventListener('click', () => adjustValue(domElements.offsetUSlider, domElements.offsetUValue, 0.01));
    container.querySelector('[data-action="dec-offset-v"]').addEventListener('click', () => adjustValue(domElements.offsetVSlider, domElements.offsetVValue, -0.01));
    container.querySelector('[data-action="inc-offset-v"]').addEventListener('click', () => adjustValue(domElements.offsetVSlider, domElements.offsetVValue, 0.01));
    container.querySelector('[data-action="dec-scale"]').addEventListener('click', () => adjustValue(domElements.uniformScaleSlider, domElements.uniformScaleValue, -0.01));
    container.querySelector('[data-action="inc-scale"]').addEventListener('click', () => adjustValue(domElements.uniformScaleSlider, domElements.uniformScaleValue, 0.01));
    container.querySelector('[data-action="dec-rotation"]').addEventListener('click', () => adjustValue(domElements.rotationSlider, domElements.rotationValue, -0.01));
    container.querySelector('[data-action="inc-rotation"]').addEventListener('click', () => adjustValue(domElements.rotationSlider, domElements.rotationValue, 0.01));
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

    // Model rotation controls
    [domElements.modelRotateXSlider, domElements.modelRotateYSlider, domElements.modelRotateZSlider].forEach(el => {
        el.addEventListener('input', updateModelRotation);
        el.addEventListener('mousedown', () => continuousRender = true);
        el.addEventListener('mouseup', () => continuousRender = false);
    });

    // Model rotation value inputs
    domElements.modelRotateXValue.addEventListener('change', () => syncRotationValueToSlider(domElements.modelRotateXSlider, domElements.modelRotateXValue));
    domElements.modelRotateYValue.addEventListener('change', () => syncRotationValueToSlider(domElements.modelRotateYSlider, domElements.modelRotateYValue));
    domElements.modelRotateZValue.addEventListener('change', () => syncRotationValueToSlider(domElements.modelRotateZSlider, domElements.modelRotateZValue));

    // Model rotation step buttons
    container.querySelector('[data-action="dec-model-rotate-x"]').addEventListener('click', () => adjustRotationValue(domElements.modelRotateXSlider, domElements.modelRotateXValue, -5));
    container.querySelector('[data-action="inc-model-rotate-x"]').addEventListener('click', () => adjustRotationValue(domElements.modelRotateXSlider, domElements.modelRotateXValue, 5));
    container.querySelector('[data-action="dec-model-rotate-y"]').addEventListener('click', () => adjustRotationValue(domElements.modelRotateYSlider, domElements.modelRotateYValue, -5));
    container.querySelector('[data-action="inc-model-rotate-y"]').addEventListener('click', () => adjustRotationValue(domElements.modelRotateYSlider, domElements.modelRotateYValue, 5));
    container.querySelector('[data-action="dec-model-rotate-z"]').addEventListener('click', () => adjustRotationValue(domElements.modelRotateZSlider, domElements.modelRotateZValue, -5));
    container.querySelector('[data-action="inc-model-rotate-z"]').addEventListener('click', () => adjustRotationValue(domElements.modelRotateZSlider, domElements.modelRotateZValue, 5));

    // Reset model rotation button
    domElements.resetModelRotationBtn.addEventListener('click', resetModelRotation);
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
            const chevron = header.querySelector('.viewer3d-chevron');
            content.classList.toggle('collapsed');
            if (chevron) chevron.classList.toggle('collapsed');
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

// Update model rotation
function updateModelRotation() {
    if (!model) return;

    const rotX = THREE.MathUtils.degToRad(parseFloat(domElements.modelRotateXSlider.value));
    const rotY = THREE.MathUtils.degToRad(parseFloat(domElements.modelRotateYSlider.value));
    const rotZ = THREE.MathUtils.degToRad(parseFloat(domElements.modelRotateZSlider.value));

    model.rotation.set(rotX, rotY, rotZ);

    // Update value displays
    domElements.modelRotateXValue.value = parseFloat(domElements.modelRotateXSlider.value);
    domElements.modelRotateYValue.value = parseFloat(domElements.modelRotateYSlider.value);
    domElements.modelRotateZValue.value = parseFloat(domElements.modelRotateZSlider.value);

    requestRender();
}

// Sync rotation value input to slider
function syncRotationValueToSlider(slider, valueInput) {
    const val = parseFloat(valueInput.value);
    const min = parseFloat(valueInput.min);
    const max = parseFloat(valueInput.max);
    const clampedVal = Math.max(min, Math.min(max, val));
    valueInput.value = clampedVal;
    slider.value = clampedVal;
    updateModelRotation();
}

// Adjust rotation value
function adjustRotationValue(slider, valueInput, delta) {
    const currentVal = parseFloat(slider.value);
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const newVal = Math.max(min, Math.min(max, currentVal + delta));
    slider.value = newVal;
    valueInput.value = newVal;
    updateModelRotation();
}

// Reset model rotation
function resetModelRotation() {
    domElements.modelRotateXSlider.value = 0;
    domElements.modelRotateYSlider.value = 0;
    domElements.modelRotateZSlider.value = 0;
    domElements.modelRotateXValue.value = 0;
    domElements.modelRotateYValue.value = 0;
    domElements.modelRotateZValue.value = 0;
    updateModelRotation();
}

function onWindowResize() {
    if (!renderer || !camera || !domElements.rendererContainer) return;

    // Get dimensions with fallback
    let width = domElements.rendererContainer.clientWidth;
    let height = domElements.rendererContainer.clientHeight;

    // Skip resize if dimensions are 0 (container hidden or not ready)
    if (width === 0 || height === 0) {
        console.warn('3D Viewer: Skipping resize, container has 0 dimensions');
        return;
    }

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    requestRender();
}

function showMessage(text, type = 'info') {
    domElements.messageText.textContent = text;
    const typeClass = type === 'error' ? 'viewer3d-toast-error' : type === 'success' ? 'viewer3d-toast-success' : '';
    domElements.messageBox.className = `viewer3d-toast ${typeClass}`;
    domElements.messageBox.style.opacity = '1';
    setTimeout(() => {
        domElements.messageBox.style.opacity = '0';
        setTimeout(() => {
            domElements.messageBox.classList.add('viewer3d-hidden');
        }, 300);
    }, 3000);
}

async function showScanPicker() {
    await dataManager.ensureInitialized();
    const assets = dataManager.getAssets();

    if (assets.length === 0) {
        showMessage('No scans available. Save scans from NDT tools first.', 'error');
        return;
    }

    // Collect all scans with thumbnails
    const scansWithThumbnails = [];
    assets.forEach(asset => {
        asset.vessels.forEach(vessel => {
            vessel.scans.forEach(scan => {
                if (scan.thumbnail) {
                    scansWithThumbnails.push({
                        ...scan,
                        assetName: asset.name,
                        vesselName: vessel.name
                    });
                }
            });
        });
    });

    if (scansWithThumbnails.length === 0) {
        showMessage('No scans with images found.', 'error');
        return;
    }

    // Render scan grid
    domElements.scanPickerContent.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            ${scansWithThumbnails.map(scan => `
                <div class="scan-picker-item cursor-pointer bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all"
                     data-scan-id="${scan.id}"
                     data-thumbnail="${scan.thumbnail}"
                     ${scan.heatmapOnly ? `data-heatmaponly="${scan.heatmapOnly}"` : ''}>
                    <div class="aspect-video bg-gray-200 dark:bg-gray-600">
                        <img src="${scan.thumbnail}" alt="${scan.name}" class="w-full h-full object-cover">
                    </div>
                    <div class="p-3">
                        <div class="font-semibold text-sm text-gray-900 dark:text-white truncate">${scan.name}</div>
                        <div class="text-xs text-gray-600 dark:text-gray-400 truncate">${scan.assetName} / ${scan.vesselName}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            <span class="px-1.5 py-0.5 rounded ${
                                scan.toolType === 'pec' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                scan.toolType === 'cscan' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                            }">${scan.toolType.toUpperCase()}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Add click handlers
    domElements.scanPickerContent.querySelectorAll('.scan-picker-item').forEach(item => {
        item.addEventListener('click', () => {
            // Use heatmapOnly if available, otherwise fall back to thumbnail
            const heatmapOnly = item.dataset.heatmaponly;
            const thumbnail = item.dataset.thumbnail;
            const textureDataURL = heatmapOnly || thumbnail;
            const scanName = item.querySelector('.font-semibold').textContent;

            console.log('Loading scan texture:', {
                scanName,
                hasHeatmapOnly: !!heatmapOnly,
                hasThumbnail: !!thumbnail,
                usingHeatmapOnly: !!heatmapOnly
            });

            loadTextureFromDataURL(textureDataURL, scanName);
            closeScanPicker();
        });
    });

    domElements.scanPickerModal.classList.remove('viewer3d-hidden');
}

function closeScanPicker() {
    domElements.scanPickerModal.classList.add('viewer3d-hidden');
}

function loadTextureFromDataURL(dataURL, fileName) {
    if (layers.length >= MAX_LAYERS) {
        showMessage(`Maximum of ${MAX_LAYERS} layers reached.`, 'error');
        return;
    }

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(dataURL, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.generateMipmaps = false;

        const newLayer = new Layer(texture, fileName);
        layers.push(newLayer);
        recalculateAspectRatio(newLayer);
        selectLayer(newLayer);
        updateLayerList();
        batchUpdateShaderUniforms();
        requestRender();
    });
}

function animate() {
    animationFrameId = requestAnimationFrame(animate);
    if (continuousRender) needsRender = true;
    if (needsRender && renderer && scene && camera) {
        renderer.render(scene, camera);
        needsRender = false;
    }
}

// Restore state from saved data
async function restoreState(state) {
    if (!state) return;

    try {
        showMessage('Loading saved 3D project...');

        // Clear existing layers
        layers.forEach(layer => {
            if (layer.texture) layer.texture.dispose();
        });
        layers = [];
        selectedLayer = null;
        transformControls.detach();
        domElements.controlsWrapper.classList.add('viewer3d-hidden');

        // Restore model
        if (state.modelData) {
            // Load custom model from data URL
            domElements.modelFileNameSpan.textContent = state.modelFileName || 'Custom Model';
            await loadModelFromDataURL(state.modelData, state.modelFileName);
        } else {
            // Use default cylinder
            domElements.modelFileNameSpan.textContent = state.modelFileName || 'Default Cylinder';
            loadDefaultModel();
        }

        // Restore layers
        for (const layerData of state.layers) {
            if (!layerData.textureDataURL) continue;

            await new Promise((resolve) => {
                const textureLoader = new THREE.TextureLoader();
                textureLoader.load(layerData.textureDataURL, (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.wrapS = THREE.ClampToEdgeWrapping;
                    texture.wrapT = THREE.ClampToEdgeWrapping;
                    texture.generateMipmaps = false;

                    const newLayer = new Layer(texture, layerData.fileName);
                    newLayer.id = layerData.id;
                    newLayer.visible = layerData.visible;
                    newLayer.aspectCorrectionFactor = layerData.aspectCorrectionFactor || 1.0;

                    // Restore uniforms
                    if (layerData.uniforms) {
                        newLayer.uniforms.uScale.set(layerData.uniforms.uScale.x, layerData.uniforms.uScale.y);
                        newLayer.uniforms.uOffset.set(layerData.uniforms.uOffset.x, layerData.uniforms.uOffset.y);
                        newLayer.uniforms.uRotation = layerData.uniforms.uRotation;
                        newLayer.uniforms.uFlip.set(layerData.uniforms.uFlip.x, layerData.uniforms.uFlip.y);
                        newLayer.uniforms.uProjectionAxis.set(
                            layerData.uniforms.uProjectionAxis.x,
                            layerData.uniforms.uProjectionAxis.y,
                            layerData.uniforms.uProjectionAxis.z
                        );
                        newLayer.uniforms.uClamp.set(layerData.uniforms.uClamp.x, layerData.uniforms.uClamp.y);

                        // Update transform target position and rotation
                        newLayer.transformTarget.position.set(
                            layerData.uniforms.uOffset.x * 100,
                            layerData.uniforms.uOffset.y * 100,
                            0
                        );
                        newLayer.transformTarget.rotation.z = layerData.uniforms.uRotation;
                    }

                    newLayer.needsUpdate = true;
                    layers.push(newLayer);
                    resolve();
                });
            });
        }

        // Restore model rotation
        if (state.modelRotation) {
            domElements.modelRotateXSlider.value = state.modelRotation.x || 0;
            domElements.modelRotateYSlider.value = state.modelRotation.y || 0;
            domElements.modelRotateZSlider.value = state.modelRotation.z || 0;
            domElements.modelRotateXValue.value = state.modelRotation.x || 0;
            domElements.modelRotateYValue.value = state.modelRotation.y || 0;
            domElements.modelRotateZValue.value = state.modelRotation.z || 0;
            updateModelRotation();
        }

        // Restore lighting settings
        if (state.lighting) {
            domElements.lightIntensitySlider.value = state.lighting.intensity || 1.5;
            domElements.lightAzimuthSlider.value = state.lighting.azimuth || 45;
            domElements.lightElevationSlider.value = state.lighting.elevation || 45;
            domElements.lightDistanceSlider.value = state.lighting.distance || 500;
            updateLighting();
        }

        // Restore camera position
        if (state.camera) {
            camera.position.set(
                state.camera.position.x,
                state.camera.position.y,
                state.camera.position.z
            );
            orbitControls.target.set(
                state.camera.target.x,
                state.camera.target.y,
                state.camera.target.z
            );
            orbitControls.update();
        }

        // Select the first layer if available
        if (layers.length > 0) {
            selectLayer(layers[0]);
        }

        // Update UI
        updateLayerList();
        batchUpdateShaderUniforms();
        requestRender();

        showMessage('3D project loaded successfully!');
    } catch (error) {
        console.error('Error restoring state:', error);
        showMessage('Failed to load 3D project: ' + error.message, 'error');
    }
}

// Handle load 3D project event from data hub (loadScanData is the generic event)
function handleLoad3DProjectEvent(event) {
    const { scanData } = event.detail;

    if (!scanData || scanData.toolType !== '3dview') return;

    if (scanData.data) {
        restoreState(scanData.data);
    }
}

// Helper to wait for container to have valid dimensions
function waitForDimensions(element, maxAttempts = 100) {
    return new Promise((resolve) => {
        let attempts = 0;

        function check() {
            attempts++;

            // Try both clientWidth/Height and getBoundingClientRect
            let width = element.clientWidth;
            let height = element.clientHeight;

            // getBoundingClientRect is more reliable for absolute positioned elements
            if (width === 0 || height === 0) {
                const rect = element.getBoundingClientRect();
                width = rect.width;
                height = rect.height;
            }

            if (width > 0 && height > 0) {
                console.log(`3D Viewer: Container ready with dimensions ${width}x${height} after ${attempts} attempts`);
                resolve({ width, height });
            } else if (attempts >= maxAttempts) {
                // Fallback to window dimensions if container never gets size
                const fallbackWidth = window.innerWidth;
                const fallbackHeight = window.innerHeight - 140; // Account for header + banner
                console.warn(`3D Viewer: Container dimensions not ready after ${attempts} attempts, using fallback ${fallbackWidth}x${fallbackHeight}`);
                resolve({ width: fallbackWidth, height: fallbackHeight, fallback: true });
            } else {
                requestAnimationFrame(check);
            }
        }

        // Start checking on next frame to allow layout to settle
        requestAnimationFrame(check);
    });
}

export default {
    init: async (toolContainer) => {
        container = toolContainer;
        container.innerHTML = HTML;
        container.style.overflow = 'hidden';
        cacheDomElements();

        // Dynamically import Three.js and addons only when 3D viewer is loaded
        const [threeModule, orbitControlsModule, transformControlsModule, objLoaderModule] = await Promise.all([
            import('three'),
            import('three/addons/controls/OrbitControls.js'),
            import('three/addons/controls/TransformControls.js'),
            import('three/addons/loaders/OBJLoader.js')
        ]);

        THREE = threeModule;
        OrbitControls = orbitControlsModule.OrbitControls;
        TransformControls = transformControlsModule.TransformControls;
        OBJLoader = objLoaderModule.OBJLoader;

        // Wait for the tool container (parent) to have valid dimensions before initializing Three.js
        // The renderer-container is absolutely positioned, so it inherits size from parent
        const dims = await waitForDimensions(container);

        // If we got fallback dimensions, set them explicitly on the renderer container
        if (dims.fallback) {
            domElements.rendererContainer.style.width = dims.width + 'px';
            domElements.rendererContainer.style.height = dims.height + 'px';
        }

        doInit();

        // Trigger a resize after a short delay to handle late CSS application
        setTimeout(() => {
            onWindowResize();
            console.log('3D Viewer: Delayed resize triggered');
        }, 100);

        // Listen for 3D model loading events from data hub
        window.addEventListener('load3DModel', handleLoad3DModelEvent);
        window.addEventListener('loadScanData', handleLoad3DProjectEvent);

        // Check if there's pending model data from app
        if (window.ndtApp && window.ndtApp.pending3DModelData) {
            handleLoad3DModelEvent({ detail: window.ndtApp.pending3DModelData });
            window.ndtApp.pending3DModelData = null;
        }
    },
    
    destroy: () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', onWindowResize);
        window.removeEventListener('load3DModel', handleLoad3DModelEvent);
        window.removeEventListener('loadScanData', handleLoad3DProjectEvent);
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

async function handleLoad3DModelEvent(event) {
    const { modelData, fileName } = event.detail;
    await loadModelFromDataURL(modelData, fileName);
}

async function loadModelFromDataURL(dataURL, fileName) {
    domElements.modelFileNameSpan.textContent = fileName || 'Model from Data Hub';

    try {
        console.log('Loading model from data URL...');
        const response = await fetch(dataURL);
        const objText = await response.text();
        console.log('OBJ text length:', objText.length);

        const loader = new OBJLoader();
        const object = loader.parse(objText);
        console.log('Parsed OBJ object:', object);

        // Ensure decalMaterial exists before assigning
        if (!decalMaterial) {
            console.error('Decal material not initialized');
            showMessage('3D viewer not fully initialized', 'error');
            return;
        }

        let meshCount = 0;
        object.traverse(child => {
            if (child.isMesh) {
                meshCount++;
                console.log(`Processing mesh ${meshCount}:`, {
                    vertexCount: child.geometry?.attributes?.position?.count,
                    hasNormals: !!child.geometry?.attributes?.normal
                });
                // Ensure geometry has proper attributes
                if (child.geometry) {
                    if (!child.geometry.attributes.normal) {
                        console.log('Computing normals...');
                        child.geometry.computeVertexNormals();
                    }
                    // Make sure geometry is not empty
                    if (!child.geometry.attributes.position || child.geometry.attributes.position.count === 0) {
                        console.error('Geometry has no vertices');
                        return;
                    }
                }
                child.material = decalMaterial;
                console.log('Material assigned, material:', decalMaterial);
            }
        });
        console.log(`Total meshes processed: ${meshCount}`);
        setModel(object);
        console.log('setModel() completed');
    } catch (err) {
        console.error('Error loading 3D model:', err);
        showMessage('Failed to load 3D model', 'error');
    }
}

