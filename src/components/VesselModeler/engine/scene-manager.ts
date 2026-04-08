import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * SceneManager - Core Three.js lifecycle manager for the Vessel Modeler.
 *
 * Wraps imperative Three.js setup (scene, camera, renderer, controls, lights)
 * in a class that a React component can init/dispose via useEffect.
 *
 * Key differences from the standalone HTML version:
 * - Renders into a container div (not document.body)
 * - Uses ResizeObserver on the container (not window resize)
 * - Proper cleanup of all GPU resources on dispose
 * - preserveDrawingBuffer enabled for screenshot export
 */
export class SceneManager {
  private container: HTMLDivElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private css2DRenderer: CSS2DRenderer;
  private controls: OrbitControls;
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  private vesselGroup: THREE.Group | null = null;
  private pipelineGroup: THREE.Group | null = null;
  private gridHelper: THREE.GridHelper | null = null;
  private axesHelper: THREE.AxesHelper | null = null;
  private bgTexture: THREE.CanvasTexture | null = null;
  private groundShadow: THREE.Mesh | null = null;
  private shadowPlane: THREE.Mesh | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private cardinalGroup: THREE.Group | null = null;
  private disposed = false;
  private boundContextLost: (e: Event) => void;
  private boundContextRestored: () => void;

  /** Optional callback invoked each frame before rendering (e.g. camera animation). */
  public onBeforeRender: ((camera: THREE.PerspectiveCamera, controls: OrbitControls) => void) | null = null;

  /** Optional callback invoked when the WebGL context is restored after loss. */
  public onContextRestored: (() => void) | null = null;

  constructor(container: HTMLDivElement) {
    this.container = container;

    // --- Scene ---
    this.scene = new THREE.Scene();
    // Gradient background is applied by setBackgroundColor, called from the visuals effect.
    // Set a temporary flat color until the first visuals sync runs.
    this.scene.background = new THREE.Color(0x111111);

    // --- Camera ---
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(15, 8, 15);
    this.camera.lookAt(0, 0, 0);

    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true, // Required for screenshot export
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // --- CSS2D Renderer (for annotation labels) ---
    this.css2DRenderer = new CSS2DRenderer();
    this.css2DRenderer.setSize(width, height);
    this.css2DRenderer.domElement.style.position = 'absolute';
    this.css2DRenderer.domElement.style.top = '0';
    this.css2DRenderer.domElement.style.left = '0';
    this.css2DRenderer.domElement.style.pointerEvents = 'none';

    // --- Controls ---
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.target.set(0, 0, 0);

    // --- WebGL context loss/restore handlers ---
    this.boundContextLost = (e: Event) => {
      e.preventDefault(); // Allow context restoration
      console.warn('WebGL context lost — pausing render loop');
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    };
    this.boundContextRestored = () => {
      console.warn('WebGL context restored — resuming');
      if (!this.disposed) {
        this.animate();
        this.onContextRestored?.();
      }
    };
  }

  /**
   * Initialize the scene: attach to DOM, add lights, start animation.
   * Call this once from a useEffect after mount.
   */
  init(): void {
    // Append the canvas to the container (not document.body)
    this.container.appendChild(this.renderer.domElement);
    this.container.appendChild(this.css2DRenderer.domElement);

    // Listen for WebGL context loss/restore on the canvas
    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', this.boundContextLost);
    canvas.addEventListener('webglcontextrestored', this.boundContextRestored);

    // --- Studio Lights ---
    // Hemisphere light: sky color on top, ground color on bottom (replaces flat ambient)
    const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x222222, 0.7);
    this.scene.add(hemiLight);

    // Key light — main directional light with shadow casting
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(8, 15, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 60;
    keyLight.shadow.camera.left = -20;
    keyLight.shadow.camera.right = 20;
    keyLight.shadow.camera.top = 20;
    keyLight.shadow.camera.bottom = -20;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    keyLight.shadow.radius = 4; // Soft shadow blur
    this.scene.add(keyLight);
    this.keyLight = keyLight;

    // Fill light — softer, opposite side
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-6, 8, -4);
    this.scene.add(fillLight);

    // Rim / back lights — positioned behind the object to create edge highlights
    const rimLight1 = new THREE.DirectionalLight(0xaaccff, 0.6);
    rimLight1.position.set(-8, 4, -12);
    this.scene.add(rimLight1);

    const rimLight2 = new THREE.DirectionalLight(0xaaccff, 0.4);
    rimLight2.position.set(8, 2, -10);
    this.scene.add(rimLight2);

    // --- ResizeObserver (debounced at 350ms, matching CscanVisualizer) ---
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeTimeout !== null) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => {
        this.handleResize();
      }, 350);
    });
    this.resizeObserver.observe(this.container);

    // --- Start animation loop ---
    this.animate();
  }

  /**
   * Tear down everything: stop loop, disconnect observers, dispose GPU resources.
   * Call this from the useEffect cleanup function.
   */
  dispose(): void {
    this.disposed = true;

    // Stop animation loop
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Clear resize debounce timer
    if (this.resizeTimeout !== null) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }

    // Disconnect ResizeObserver
    if (this.resizeObserver !== null) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Dispose OrbitControls
    this.controls.dispose();

    // Dispose gradient background texture
    if (this.bgTexture) {
      this.bgTexture.dispose();
      this.bgTexture = null;
    }

    // Dispose ground shadow plane
    if (this.groundShadow) {
      const mat = this.groundShadow.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      this.groundShadow.geometry.dispose();
      this.scene.remove(this.groundShadow);
      this.groundShadow = null;
    }

    // Dispose shadow-receiving plane
    if (this.shadowPlane) {
      (this.shadowPlane.material as THREE.Material).dispose();
      this.shadowPlane.geometry.dispose();
      this.scene.remove(this.shadowPlane);
      this.shadowPlane = null;
    }

    // Recursively dispose all objects in the scene
    this.disposeObject(this.scene);

    // Remove WebGL context event listeners
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.boundContextLost);
    canvas.removeEventListener('webglcontextrestored', this.boundContextRestored);

    // Remove the canvas and CSS2D overlay from the container
    if (canvas.parentNode === this.container) {
      this.container.removeChild(canvas);
    }
    if (this.css2DRenderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.css2DRenderer.domElement);
    }

    // Dispose the renderer (releases WebGL context)
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  getControls(): OrbitControls {
    return this.controls;
  }

  getCSS2DRenderer(): CSS2DRenderer {
    return this.css2DRenderer;
  }

  getVesselGroup(): THREE.Group | null {
    return this.vesselGroup;
  }

  setVesselGroup(group: THREE.Group | null): void {
    this.vesselGroup = group;
    // Enable castShadow on all meshes if shadows are active
    if (group && this.keyLight?.castShadow) {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
        }
      });
    }
    this.syncGroundLevel();
  }

  getPipelineGroup(): THREE.Group | null {
    return this.pipelineGroup;
  }

  /**
   * Replace the pipeline group. The old group is disposed and the new one
   * is added as a child of the vessel group so it inherits transforms.
   */
  setPipelineGroup(group: THREE.Group | null): void {
    // Dispose old pipeline group
    if (this.pipelineGroup) {
      if (this.pipelineGroup.parent) {
        this.pipelineGroup.parent.remove(this.pipelineGroup);
      }
      this.disposeObject(this.pipelineGroup);
      this.pipelineGroup = null;
    }
    if (group && this.vesselGroup) {
      this.vesselGroup.add(group);
      this.pipelineGroup = group;
    }
  }

  /**
   * Update the scene background to a vertical gradient derived from `hex`.
   * Produces a Microsoft 3D Viewer-style look: lighter at top, darker at bottom.
   */
  setBackgroundColor(hex: string): void {
    const base = new THREE.Color(hex);
    const luminance = base.r * 0.299 + base.g * 0.587 + base.b * 0.114;

    // Shift lighter for top, darker for bottom — the bright ground spotlight
    // sits on top of the darker lower portion, creating the 3D Viewer look.
    const topColor = base.clone();
    const bottomColor = base.clone();
    if (luminance > 0.5) {
      topColor.lerp(new THREE.Color(0xffffff), 0.15);
      bottomColor.lerp(new THREE.Color(0x000000), 0.45);
    } else {
      topColor.lerp(new THREE.Color(0xffffff), 0.1);
      bottomColor.lerp(new THREE.Color(0x000000), 0.55);
    }

    // Three-stop gradient: light top → mid-tone horizon → dark floor
    const midColor = base.clone().lerp(new THREE.Color(0x000000), luminance > 0.5 ? 0.15 : 0.25);

    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, `#${topColor.getHexString()}`);
    gradient.addColorStop(0.45, `#${midColor.getHexString()}`);
    gradient.addColorStop(1, `#${bottomColor.getHexString()}`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 512);

    if (this.bgTexture) this.bgTexture.dispose();
    this.bgTexture = new THREE.CanvasTexture(canvas);
    this.bgTexture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.bgTexture;

    // Update ground shadow opacity to suit the theme
    this.updateGroundShadow(luminance);
  }

  /**
   * Create or update a soft radial "spotlight" on the ground plane
   * (Microsoft 3D Viewer style — bright pool of light under the object).
   */
  private updateGroundShadow(bgLuminance: number): void {
    if (!this.groundShadow) {
      // Radial gradient: white center fading to transparent
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const cx = size / 2;
      const gradient = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.55, 'rgba(255,255,255,0.35)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      const tex = new THREE.CanvasTexture(canvas);
      const geo = new THREE.PlaneGeometry(50, 50);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        color: 0xffffff,
      });
      this.groundShadow = new THREE.Mesh(geo, mat);
      this.groundShadow.rotation.x = -Math.PI / 2;
      this.groundShadow.renderOrder = -1;
      this.scene.add(this.groundShadow);
    }

    // Brighter spotlight on dark backgrounds, subtler on light ones
    const mat = this.groundShadow.material as THREE.MeshBasicMaterial;
    mat.opacity = bgLuminance > 0.5 ? 0.5 : 0.7;

    // Position at the bottom of the vessel
    this.syncGroundLevel();
  }

  /**
   * Compute the bottom Y of the vessel bounding box and align the grid
   * and ground shadow to that level.
   */
  syncGroundLevel(): void {
    let groundY = 0;
    if (this.vesselGroup) {
      const box = new THREE.Box3().setFromObject(this.vesselGroup);
      if (!box.isEmpty()) {
        groundY = box.min.y;
      }
    }
    if (this.gridHelper) {
      this.gridHelper.position.y = groundY - 0.01;
    }
    if (this.groundShadow) {
      this.groundShadow.position.y = groundY - 0.02;
    }
    if (this.shadowPlane) {
      this.shadowPlane.position.y = groundY - 0.03;
    }
  }

  /**
   * Show or hide a reference grid on the ground plane.
   */
  setGridVisible(visible: boolean): void {
    if (visible && !this.gridHelper) {
      // Size the grid to fit the vessel (or use a sensible default)
      let gridSize = 30;
      if (this.vesselGroup) {
        const box = new THREE.Box3().setFromObject(this.vesselGroup);
        if (!box.isEmpty()) {
          const size = new THREE.Vector3();
          box.getSize(size);
          gridSize = Math.max(30, Math.max(size.x, size.z) * 1.5);
        }
      }
      this.gridHelper = new THREE.GridHelper(gridSize, 30, 0x444444, 0x222222);
      this.scene.add(this.gridHelper);
      this.syncGroundLevel();
    } else if (!visible && this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.dispose();
      this.gridHelper = null;
    }
  }

  /**
   * Update grid colors to contrast with the background.
   */
  updateGridColors(bgHex: string): void {
    if (!this.gridHelper) return;
    const bg = new THREE.Color(bgHex);
    const luminance = bg.r * 0.299 + bg.g * 0.587 + bg.b * 0.114;
    if (luminance > 0.5) {
      // Light background → dark grid
      (this.gridHelper.material as THREE.Material).opacity = 0.3;
      (this.gridHelper.material as THREE.Material).transparent = true;
      this.gridHelper.material = new THREE.LineBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.4 });
    } else {
      // Dark background → light grid
      this.gridHelper.material = new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.6 });
    }
  }

  /**
   * Show or hide XYZ axes helper.
   */
  setAxesVisible(visible: boolean): void {
    if (visible && !this.axesHelper) {
      this.axesHelper = new THREE.AxesHelper(5);
      this.scene.add(this.axesHelper);
    } else if (!visible && this.axesHelper) {
      this.scene.remove(this.axesHelper);
      this.axesHelper.dispose();
      this.axesHelper = null;
    }
  }

  /**
   * Show or hide N/S/E/W cardinal direction labels at the edges of the floor grid.
   * @param rotationDeg - rotate the labels by 0/90/180/270 degrees around Y axis
   */
  setCardinalDirectionsVisible(visible: boolean, rotationDeg: number = 0): void {
    // Remove existing group first (recreate on rotation change)
    if (this.cardinalGroup) {
      this.scene.remove(this.cardinalGroup);
      this.cardinalGroup.traverse((obj) => {
        if (obj instanceof CSS2DObject && obj.element.parentNode) {
          obj.element.parentNode.removeChild(obj.element);
        }
      });
      this.cardinalGroup = null;
    }

    if (!visible) return;

    this.cardinalGroup = new THREE.Group();
    this.cardinalGroup.userData.type = 'cardinalDirections';

    const dist = 16; // just outside the 30-unit grid (radius 15)
    const labels: { text: string; x: number; z: number; primary?: boolean }[] = [
      { text: 'N', x: 0, z: -dist, primary: true },
      { text: 'S', x: 0, z: dist },
      { text: 'E', x: dist, z: 0 },
      { text: 'W', x: -dist, z: 0 },
    ];

    for (const { text, x, z, primary } of labels) {
      const el = document.createElement('div');
      el.className = `vm-cardinal-label${primary ? ' vm-cardinal-primary' : ''}`;
      el.textContent = text;
      const label = new CSS2DObject(el);
      label.position.set(x, 0, z);
      this.cardinalGroup.add(label);
    }

    this.cardinalGroup.rotation.y = THREE.MathUtils.degToRad(rotationDeg);
    this.scene.add(this.cardinalGroup);
  }

  /**
   * Enable or disable real-time shadows.
   * When enabled, the key directional light casts shadows onto a ground plane,
   * and all vessel meshes are set to cast shadows.
   */
  setShadowsEnabled(enabled: boolean, intensity: number = 0.35): void {
    if (this.keyLight) {
      this.keyLight.castShadow = enabled;
    }

    // Create or remove the shadow-receiving ground plane
    if (enabled && !this.shadowPlane) {
      const geo = new THREE.PlaneGeometry(80, 80);
      const mat = new THREE.ShadowMaterial({ opacity: intensity });
      this.shadowPlane = new THREE.Mesh(geo, mat);
      this.shadowPlane.rotation.x = -Math.PI / 2;
      this.shadowPlane.receiveShadow = true;
      this.shadowPlane.renderOrder = -2;
      this.scene.add(this.shadowPlane);
      this.syncGroundLevel();
    } else if (enabled && this.shadowPlane) {
      // Update intensity on existing shadow plane
      (this.shadowPlane.material as THREE.ShadowMaterial).opacity = intensity;
    } else if (!enabled && this.shadowPlane) {
      this.scene.remove(this.shadowPlane);
      (this.shadowPlane.material as THREE.Material).dispose();
      this.shadowPlane.geometry.dispose();
      this.shadowPlane = null;
    }

    // Toggle castShadow/receiveShadow on all meshes in the vessel group
    if (this.vesselGroup) {
      this.vesselGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = enabled;
          obj.receiveShadow = enabled;
        }
      });
    }
  }

  /**
   * Enable or disable an environment map for reflections.
   * Uses a simple procedural gradient environment (no external HDRI).
   */
  setEnvironmentMap(enabled: boolean): void {
    if (enabled) {
      const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      pmremGenerator.compileEquirectangularShader();

      // Create a simple gradient environment scene
      const envScene = new THREE.Scene();
      const envGeo = new THREE.SphereGeometry(10, 32, 16);
      const envMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          topColor: { value: new THREE.Color(0x88aacc) },
          bottomColor: { value: new THREE.Color(0x222222) },
        },
        vertexShader: `
          varying vec3 vWorldPosition;
          void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPos.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 topColor;
          uniform vec3 bottomColor;
          varying vec3 vWorldPosition;
          void main() {
            float h = normalize(vWorldPosition).y * 0.5 + 0.5;
            gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
          }
        `,
      });
      envScene.add(new THREE.Mesh(envGeo, envMat));

      const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
      this.scene.environment = envMap;
      pmremGenerator.dispose();
      envGeo.dispose();
      envMat.dispose();
    } else {
      if (this.scene.environment) {
        this.scene.environment.dispose();
        this.scene.environment = null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Camera helpers
  // ---------------------------------------------------------------------------

  /**
   * Reset the camera to the default isometric viewpoint, looking at the origin.
   */
  resetCamera(): void {
    this.camera.position.set(15, 8, 15);
    this.controls.target.set(0, 0, 0);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
  }

  // ---------------------------------------------------------------------------
  // Private: resize handling
  // ---------------------------------------------------------------------------

  /**
   * Respond to container size changes.
   * Uses container dimensions (not window) so the scene works inside any layout.
   */
  private handleResize(): void {
    if (this.disposed) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.css2DRenderer.setSize(width, height);
  }

  // ---------------------------------------------------------------------------
  // Private: animation loop
  // ---------------------------------------------------------------------------

  /**
   * requestAnimationFrame loop.
   * Updates OrbitControls damping and renders the scene.
   */
  private animate(): void {
    if (this.disposed) return;

    this.animationFrameId = requestAnimationFrame(() => this.animate());
    this.onBeforeRender?.(this.camera, this.controls);
    this.controls.update(); // Required for damping
    this.renderer.render(this.scene, this.camera);
    this.css2DRenderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------------------
  // Scene disposal helper
  // ---------------------------------------------------------------------------

  /**
   * Recursively dispose all geometries, materials, and textures on an Object3D
   * and its descendants. Use this when tearing down the scene or replacing the
   * vessel model to avoid GPU memory leaks.
   */
  disposeObject(obj: THREE.Object3D): void {
    // Process children first (copy array since we mutate during iteration)
    const children = [...obj.children];
    for (const child of children) {
      this.disposeObject(child);
    }

    // Dispose geometry
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
      if (obj.geometry) {
        obj.geometry.dispose();
      }

      // Dispose material(s)
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const material of materials) {
          this.disposeMaterial(material);
        }
      }
    }

    // Remove from parent
    if (obj.parent) {
      obj.parent.remove(obj);
    }
  }

  /**
   * Dispose a single material and any textures it holds.
   */
  private disposeMaterial(material: THREE.Material): void {
    // Iterate over all own properties looking for textures
    const record = material as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const value = record[key];
      if (value instanceof THREE.Texture) {
        value.dispose();
      }
    }
    material.dispose();
  }
}
