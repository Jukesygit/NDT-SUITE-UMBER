import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

const MAX_PIXEL_RATIO = 2;

export class TopologySceneManager {
  private container: HTMLDivElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private css2DRenderer: CSS2DRenderer;
  private controls: OrbitControls;
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private surfaceMesh: THREE.Mesh | null = null;
  private plateMesh: THREE.Mesh | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private bgTexture: THREE.CanvasTexture | null = null;
  private groundShadow: THREE.Mesh | null = null;
  private disposed = false;
  private needsRender = true;
  private surfaceCenter = new THREE.Vector3();
  private surfaceRadius = 100;
  private lightAzimuth = 45;
  private lightElevation = 35;

  constructor(container: HTMLDivElement) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.applyGradientBackground();

    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100000);
    this.camera.position.set(300, 400, 300);
    this.camera.up.set(0, 1, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.css2DRenderer = new CSS2DRenderer();
    this.css2DRenderer.setSize(w, h);
    this.css2DRenderer.domElement.style.position = 'absolute';
    this.css2DRenderer.domElement.style.top = '0';
    this.css2DRenderer.domElement.style.left = '0';
    this.css2DRenderer.domElement.style.pointerEvents = 'none';

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.addEventListener('change', () => { this.needsRender = true; });
  }

  init(): void {
    this.container.appendChild(this.renderer.domElement);
    this.container.appendChild(this.css2DRenderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    hemi.position.set(0, 1, 0);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(200, 150, 200);
    key.castShadow = true;
    key.shadow.mapSize.width = 2048;
    key.shadow.mapSize.height = 2048;
    key.shadow.bias = -0.001;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    this.scene.add(key.target);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0xffffff, 0.2);
    fill.position.set(-200, 200, -200);
    this.scene.add(fill);

    this.resizeObserver = new ResizeObserver(() => {
      this.onResize();
      this.needsRender = true;
    });
    this.resizeObserver.observe(this.container);

    this.animate();
  }

  requestRender(): void {
    this.needsRender = true;
  }

  setSurfaceGeometry(geometry: THREE.BufferGeometry): void {
    if (this.surfaceMesh) {
      this.scene.remove(this.surfaceMesh);
      this.surfaceMesh.geometry.dispose();
      (this.surfaceMesh.material as THREE.Material).dispose();
    }
    this.clearPlateMesh();

    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 60,
      specular: new THREE.Color(0x333333),
      side: THREE.DoubleSide,
    });

    this.surfaceMesh = new THREE.Mesh(geometry, material);
    this.surfaceMesh.castShadow = true;
    this.surfaceMesh.receiveShadow = true;
    this.scene.add(this.surfaceMesh);
    this.fitCameraToSurface();
    this.needsRender = true;
  }

  setPlateGeometry(geometry: THREE.BufferGeometry): void {
    this.clearPlateMesh();

    const material = new THREE.MeshPhongMaterial({
      color: 0xb0b0b0,
      shininess: 80,
      specular: new THREE.Color(0x666666),
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    this.plateMesh = new THREE.Mesh(geometry, material);
    this.plateMesh.castShadow = true;
    this.plateMesh.receiveShadow = true;
    this.scene.add(this.plateMesh);
    this.needsRender = true;
  }

  private clearPlateMesh(): void {
    if (this.plateMesh) {
      this.scene.remove(this.plateMesh);
      this.plateMesh.geometry.dispose();
      (this.plateMesh.material as THREE.Material).dispose();
      this.plateMesh = null;
    }
  }

  getSurfaceMesh(): THREE.Mesh | null { return this.surfaceMesh; }
  getPlateMesh(): THREE.Mesh | null { return this.plateMesh; }
  getCamera(): THREE.PerspectiveCamera { return this.camera; }
  getControls(): OrbitControls { return this.controls; }
  getRenderer(): THREE.WebGLRenderer { return this.renderer; }
  getScene(): THREE.Scene { return this.scene; }

  async exportGLB(filename: string): Promise<void> {
    const group = new THREE.Group();
    if (this.surfaceMesh) group.add(this.surfaceMesh.clone());
    if (this.plateMesh) group.add(this.plateMesh.clone());
    if (group.children.length === 0) return;

    const exporter = new GLTFExporter();
    const glb = await exporter.parseAsync(group, { binary: true });
    const blob = new Blob([glb as ArrayBuffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  fitCameraToSurface(): void {
    if (!this.surfaceMesh) return;
    const box = new THREE.Box3().setFromObject(this.surfaceMesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const dist = maxDim / (2 * Math.tan(fov / 2)) * 1.5;

    this.camera.position.set(center.x, center.y + dist * 0.7, center.z + dist * 0.7);
    this.controls.target.copy(center);
    this.controls.update();

    this.surfaceCenter.copy(center);
    this.surfaceRadius = maxDim;
    this.applyLightAngles();
    this.syncGroundShadow(box);

    this.needsRender = true;
  }

  /** Reposition the key light by azimuth (0–360°) and elevation (0–90°). */
  setLightAngles(azimuthDeg: number, elevationDeg: number): void {
    this.lightAzimuth = azimuthDeg;
    this.lightElevation = elevationDeg;
    this.applyLightAngles();
    this.needsRender = true;
  }

  private applyLightAngles(): void {
    if (!this.keyLight) return;
    const az = (this.lightAzimuth * Math.PI) / 180;
    const el = (this.lightElevation * Math.PI) / 180;
    const r = this.surfaceRadius || 100;
    const c = this.surfaceCenter;
    // Place on a sphere around the model center. Direction is what matters for
    // a directional light, so radius only keeps it clear of the geometry.
    this.keyLight.position.set(
      c.x + r * Math.cos(el) * Math.cos(az),
      c.y + r * Math.sin(el),
      c.z + r * Math.cos(el) * Math.sin(az),
    );
    this.keyLight.target.position.copy(c);
    this.keyLight.target.updateMatrixWorld();

    // Size the orthographic shadow frustum to cover the model from any angle
    const shadowCam = this.keyLight.shadow.camera;
    const half = r * 0.75;
    shadowCam.left = -half;
    shadowCam.right = half;
    shadowCam.top = half;
    shadowCam.bottom = -half;
    shadowCam.near = r * 0.1;
    shadowCam.far = r * 2.5;
    shadowCam.updateProjectionMatrix();
  }

  private syncGroundShadow(box: THREE.Box3): void {
    if (!this.groundShadow) {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const cx = size / 2;
      const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      const tex = new THREE.CanvasTexture(canvas);
      const geo = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        color: 0xffffff,
        opacity: 0.5,
      });
      this.groundShadow = new THREE.Mesh(geo, mat);
      this.groundShadow.rotation.x = -Math.PI / 2;
      this.groundShadow.renderOrder = -1;
      this.scene.add(this.groundShadow);
    }

    const sizeVec = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const span = Math.max(sizeVec.x, sizeVec.z) * 2;
    this.groundShadow.scale.set(span, span, 1);
    const drop = Math.max(sizeVec.y * 0.5, 5);
    this.groundShadow.position.set(center.x, box.min.y - drop, center.z);
  }

  private applyGradientBackground(): void {
    const base = new THREE.Color(0xb0b0b0);
    const luminance = base.r * 0.299 + base.g * 0.587 + base.b * 0.114;

    const topColor = base.clone();
    const bottomColor = base.clone();
    if (luminance > 0.5) {
      topColor.lerp(new THREE.Color(0xffffff), 0.15);
      bottomColor.lerp(new THREE.Color(0x000000), 0.45);
    } else {
      topColor.lerp(new THREE.Color(0xffffff), 0.1);
      bottomColor.lerp(new THREE.Color(0x000000), 0.55);
    }
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
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.css2DRenderer.setSize(w, h);
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);

    // controls.update() drives damping and fires 'change' → sets needsRender
    this.controls.update();

    if (this.needsRender) {
      this.renderer.render(this.scene, this.camera);
      this.css2DRenderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
  };

  dispose(): void {
    this.disposed = true;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver?.disconnect();
    this.controls.removeEventListener('change', () => {});
    if (this.surfaceMesh) {
      this.surfaceMesh.geometry.dispose();
      (this.surfaceMesh.material as THREE.Material).dispose();
    }
    this.clearPlateMesh();
    if (this.groundShadow) {
      const mat = this.groundShadow.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      this.groundShadow.geometry.dispose();
      this.scene.remove(this.groundShadow);
      this.groundShadow = null;
    }
    if (this.bgTexture) {
      this.bgTexture.dispose();
      this.bgTexture = null;
    }
    this.renderer.dispose();
    if (this.css2DRenderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.css2DRenderer.domElement);
    }
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
