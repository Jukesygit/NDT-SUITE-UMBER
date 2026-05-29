import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const MAX_PIXEL_RATIO = 2;

export class TopologySceneManager {
  private container: HTMLDivElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private surfaceMesh: THREE.Mesh | null = null;
  private plateMesh: THREE.Mesh | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private disposed = false;
  private needsRender = true;

  constructor(container: HTMLDivElement) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);

    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100000);
    this.camera.position.set(300, 400, 300);
    this.camera.up.set(0, 1, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.addEventListener('change', () => { this.needsRender = true; });
  }

  init(): void {
    this.container.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemi.position.set(0, 1, 0);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(200, 150, 200);
    this.scene.add(key);
    this.scene.add(key.target);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
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

    if (this.keyLight) {
      this.keyLight.position.set(
        center.x + size.x * 0.5,
        center.y + maxDim * 0.35,
        center.z - size.z * 0.3,
      );
      this.keyLight.target.position.copy(center);
    }

    this.needsRender = true;
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);

    // controls.update() drives damping and fires 'change' → sets needsRender
    this.controls.update();

    if (this.needsRender) {
      this.renderer.render(this.scene, this.camera);
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
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
