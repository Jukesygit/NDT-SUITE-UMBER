import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

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
  private gridHelper: THREE.GridHelper | null = null;
  private axesHelper: THREE.AxesHelper | null = null;
  private disposed = false;

  constructor(container: HTMLDivElement) {
    this.container = container;

    // --- Scene ---
    this.scene = new THREE.Scene();
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
  }

  /**
   * Initialize the scene: attach to DOM, add lights, start animation.
   * Call this once from a useEffect after mount.
   */
  init(): void {
    // Append the canvas to the container (not document.body)
    this.container.appendChild(this.renderer.domElement);
    this.container.appendChild(this.css2DRenderer.domElement);

    // --- Studio Lights ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    this.scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-10, -10, -5);
    this.scene.add(dirLight2);

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

    // Recursively dispose all objects in the scene
    this.disposeObject(this.scene);

    // Remove the canvas and CSS2D overlay from the container
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
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
  }

  /**
   * Update the scene background color at runtime.
   */
  setBackgroundColor(hex: string): void {
    this.scene.background = new THREE.Color(hex);
  }

  /**
   * Show or hide a reference grid on the ground plane.
   */
  setGridVisible(visible: boolean): void {
    if (visible && !this.gridHelper) {
      this.gridHelper = new THREE.GridHelper(30, 30, 0x444444, 0x222222);
      this.gridHelper.position.y = -0.01; // Slightly below origin to avoid z-fighting
      this.scene.add(this.gridHelper);
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
