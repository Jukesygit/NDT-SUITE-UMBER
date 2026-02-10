import { useState, useRef, useCallback, lazy, Suspense, type ChangeEvent } from 'react';
import { Lock, Unlock, Save, Upload, RotateCcw, PanelLeftClose, PanelLeft, FileUp, Camera } from 'lucide-react';
import ThreeViewport from './ThreeViewport';
import type { ThreeViewportHandle } from './ThreeViewport';
import SidebarPanel from './SidebarPanel';
import StatusBar from './StatusBar';
import {
    DEFAULT_VESSEL_STATE,
    type VesselState,
    type NozzleConfig,
    type SaddleConfig,
    type TextureConfig,
    type VesselCallbacks,
} from './types';
import type { ExtractionResult } from './engine/drawing-parser';
import './vessel-modeler.css';
import type * as THREE from 'three';

const DrawingImportModal = lazy(() => import('./DrawingImportModal'));
const ScreenshotMode = lazy(() => import('./ScreenshotMode'));

export default function VesselModeler() {
    // Core vessel state
    const [vesselState, setVesselState] = useState<VesselState>({ ...DEFAULT_VESSEL_STATE });

    // Selection state
    const [selectedNozzleIndex, setSelectedNozzleIndex] = useState(-1);
    const [selectedSaddleIndex, setSelectedSaddleIndex] = useState(-1);
    const [selectedTextureId, setSelectedTextureId] = useState(-1);

    // UI state
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showDrawingImport, setShowDrawingImport] = useState(false);
    const [showScreenshotMode, setShowScreenshotMode] = useState(false);
    const [isLoading] = useState(false);
    const [loadingMessage] = useState('');

    // Lock state
    const [nozzlesLocked, setNozzlesLocked] = useState(false);
    const [saddlesLocked, setSaddlesLocked] = useState(false);
    const [texturesLocked, setTexturesLocked] = useState(false);

    // Three.js texture objects (imperative, not React state)
    const textureObjectsRef = useRef<Record<number, THREE.Texture>>({});
    const [, setTextureObjectsVersion] = useState(0);
    const nextTextureIdRef = useRef(1);

    // Viewport ref
    const viewportRef = useRef<ThreeViewportHandle>(null);

    // --- Vessel dimension handlers ---
    const updateDimensions = useCallback((updates: Partial<VesselState>) => {
        setVesselState(prev => ({ ...prev, ...updates, hasModel: true }));
    }, []);

    // --- Nozzle handlers ---
    const addNozzle = useCallback((nozzle: NozzleConfig) => {
        setVesselState(prev => ({
            ...prev,
            nozzles: [...prev.nozzles, nozzle],
            hasModel: true,
        }));
    }, []);

    const updateNozzle = useCallback((index: number, updates: Partial<NozzleConfig>) => {
        setVesselState(prev => ({
            ...prev,
            nozzles: prev.nozzles.map((n, i) => i === index ? { ...n, ...updates } : n),
        }));
    }, []);

    const removeNozzle = useCallback((index: number) => {
        setVesselState(prev => ({
            ...prev,
            nozzles: prev.nozzles.filter((_, i) => i !== index),
        }));
        setSelectedNozzleIndex(-1);
    }, []);

    // --- Saddle handlers ---
    const addSaddle = useCallback((saddle: SaddleConfig) => {
        setVesselState(prev => ({
            ...prev,
            saddles: [...prev.saddles, saddle],
        }));
    }, []);

    const updateSaddle = useCallback((index: number, updates: Partial<SaddleConfig>) => {
        setVesselState(prev => ({
            ...prev,
            saddles: prev.saddles.map((s, i) => i === index ? { ...s, ...updates } : s),
        }));
    }, []);

    const removeSaddle = useCallback((index: number) => {
        setVesselState(prev => ({
            ...prev,
            saddles: prev.saddles.filter((_, i) => i !== index),
        }));
        setSelectedSaddleIndex(-1);
    }, []);

    // --- Texture handlers ---
    const addTexture = useCallback((texture: TextureConfig, threeTexture: THREE.Texture) => {
        textureObjectsRef.current[Number(texture.id)] = threeTexture;
        setTextureObjectsVersion(v => v + 1);
        setVesselState(prev => ({
            ...prev,
            textures: [...prev.textures, texture],
        }));
    }, []);

    const updateTexture = useCallback((id: number, updates: Partial<TextureConfig>) => {
        setVesselState(prev => ({
            ...prev,
            textures: prev.textures.map(t => Number(t.id) === id ? { ...t, ...updates } : t),
        }));
    }, []);

    const removeTexture = useCallback((id: number) => {
        const tex = textureObjectsRef.current[id];
        if (tex) {
            tex.dispose();
            delete textureObjectsRef.current[id];
            setTextureObjectsVersion(v => v + 1);
        }
        setVesselState(prev => ({
            ...prev,
            textures: prev.textures.filter(t => Number(t.id) !== id),
        }));
        setSelectedTextureId(-1);
    }, []);

    const getNextTextureId = useCallback(() => {
        return nextTextureIdRef.current++;
    }, []);

    // --- Interaction callbacks (from Three.js viewport) ---
    const vesselCallbacks: VesselCallbacks = {
        onNozzleSelected: (idx) => {
            setSelectedNozzleIndex(idx);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(-1);
        },
        onSaddleSelected: (idx) => {
            setSelectedNozzleIndex(-1);
            setSelectedSaddleIndex(idx);
            setSelectedTextureId(-1);
        },
        onTextureSelected: (id) => {
            setSelectedNozzleIndex(-1);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(id);
        },
        onDeselect: () => {
            setSelectedNozzleIndex(-1);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(-1);
        },
        onNozzleMoved: (idx, pos, angle) => {
            updateNozzle(idx, { pos: Math.round(pos), angle: Math.round(angle) });
        },
        onSaddleMoved: (idx, pos) => {
            updateSaddle(idx, { pos: Math.round(pos) });
        },
        onTextureMoved: (id, pos, angle) => {
            updateTexture(id, { pos: Math.round(pos), angle: Math.round(angle) });
        },
        onDragEnd: () => {
            // No-op, state is already updated per-move
        },
    };

    // --- Save/Load ---
    const saveProject = useCallback(() => {
        const projectData = {
            version: 1,
            timestamp: new Date().toISOString(),
            vessel: {
                id: vesselState.id,
                length: vesselState.length,
                headRatio: vesselState.headRatio,
                orientation: vesselState.orientation,
            },
            nozzles: vesselState.nozzles.map(n => ({
                name: n.name, pos: n.pos, proj: n.proj,
                angle: n.angle, size: n.size,
            })),
            saddles: vesselState.saddles.map(s => ({
                pos: s.pos, color: s.color || '#2244ff',
            })),
            textures: vesselState.textures.map(t => ({
                id: t.id, name: t.name, imageData: t.imageData,
                pos: t.pos, angle: t.angle,
                scaleX: t.scaleX || 1.0, scaleY: t.scaleY || 1.0,
                rotation: t.rotation || 0,
                flipH: t.flipH || false, flipV: t.flipV || false,
            })),
            visuals: { ...vesselState.visuals },
        };

        const defaultName = `vessel_project_${new Date().toISOString().slice(0, 10)}`;
        const filename = prompt('Enter filename:', defaultName);
        if (!filename) return;

        const json = JSON.stringify(projectData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [vesselState]);

    const loadProject = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const projectData = JSON.parse(e.target?.result as string);
                if (!projectData.vessel || !projectData.version) {
                    throw new Error('Invalid project file format');
                }

                const newState: VesselState = {
                    id: projectData.vessel.id || 3000,
                    length: projectData.vessel.length || 8000,
                    headRatio: projectData.vessel.headRatio || 2.0,
                    orientation: projectData.vessel.orientation || 'horizontal',
                    nozzles: projectData.nozzles || [],
                    saddles: (projectData.saddles || []).map((s: any) =>
                        typeof s === 'number' ? { pos: s, color: '#2244ff' } : { pos: s.pos, color: s.color || '#2244ff' }
                    ),
                    textures: projectData.textures || [],
                    hasModel: true,
                    visuals: { ...DEFAULT_VESSEL_STATE.visuals, ...(projectData.visuals || {}) },
                };

                // Update next texture ID to avoid conflicts
                const maxId = newState.textures.reduce((max: number, t: TextureConfig) => Math.max(max, Number(t.id) || 0), 0);
                nextTextureIdRef.current = maxId + 1;

                setVesselState(newState);
                setSelectedNozzleIndex(-1);
                setSelectedSaddleIndex(-1);
                setSelectedTextureId(-1);

                // TODO: Load texture images from project data into Three.js textures
            } catch (error: any) {
                alert('Error loading project: ' + error.message);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }, []);

    // --- Drawing import apply handler ---
    const handleDrawingApply = useCallback((result: ExtractionResult) => {
        setVesselState(prev => ({
            ...prev,
            id: result.id,
            length: result.length,
            headRatio: result.headRatio,
            orientation: result.orientation,
            nozzles: result.nozzles.map(n => ({
                name: n.name,
                pos: n.pos,
                proj: n.proj,
                angle: n.angle,
                size: n.size,
            })),
            saddles: result.saddles.map(s => ({
                pos: s.pos,
                color: '#2244ff',
            })),
            hasModel: true,
        }));
        setSelectedNozzleIndex(-1);
        setSelectedSaddleIndex(-1);
        setSelectedTextureId(-1);
    }, []);

    // --- Hint text ---
    const getHintText = () => {
        const locked = [];
        if (nozzlesLocked) locked.push('Nozzles');
        if (saddlesLocked) locked.push('Saddles');
        if (texturesLocked) locked.push('Textures');

        if (locked.length === 3) return 'All Components Locked - Camera Only Mode';
        if (locked.length > 0) return `${locked.join(', ')} Locked | Other components can be repositioned`;
        return 'Drag from Library to Add | Click & Drag Nozzles, Supports, or Textures to Reposition';
    };

    return (
        <div className="h-full w-full flex flex-col overflow-hidden" style={{ background: '#111111' }}>
            {/* Main content area */}
            <div className="flex-1 relative overflow-hidden">
                {/* Three.js viewport (z-0) */}
                <ThreeViewport
                    ref={viewportRef}
                    vesselState={vesselState}
                    selectedNozzleIndex={selectedNozzleIndex}
                    selectedSaddleIndex={selectedSaddleIndex}
                    selectedTextureId={selectedTextureId}
                    textureObjects={textureObjectsRef.current}
                    callbacks={vesselCallbacks}
                />

                {/* Sidebar (z-20) */}
                <div className={`vm-sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
                    <SidebarPanel
                        vesselState={vesselState}
                        selectedNozzleIndex={selectedNozzleIndex}
                        selectedSaddleIndex={selectedSaddleIndex}
                        selectedTextureId={selectedTextureId}
                        onUpdateDimensions={updateDimensions}
                        onAddNozzle={addNozzle}
                        onUpdateNozzle={updateNozzle}
                        onRemoveNozzle={removeNozzle}
                        onSelectNozzle={setSelectedNozzleIndex}
                        onAddSaddle={addSaddle}
                        onUpdateSaddle={updateSaddle}
                        onRemoveSaddle={removeSaddle}
                        onSelectSaddle={setSelectedSaddleIndex}
                        onAddTexture={addTexture}
                        onUpdateTexture={updateTexture}
                        onRemoveTexture={removeTexture}
                        onSelectTexture={setSelectedTextureId}
                        getNextTextureId={getNextTextureId}
                        renderer={viewportRef.current?.getRenderer() ?? null}
                    />
                </div>

                {/* Toggle sidebar button */}
                <button
                    className={`vm-toggle-sidebar ${sidebarOpen ? '' : 'sidebar-collapsed'}`}
                    onClick={() => setSidebarOpen(o => !o)}
                    title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                >
                    {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
                </button>

                {/* Lock controls */}
                <div className="vm-lock-controls" style={{ left: sidebarOpen ? 400 : 60 }}>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginRight: 4 }}>Lock:</span>
                    <button
                        className={`vm-lock-btn ${nozzlesLocked ? 'locked' : ''}`}
                        onClick={() => setNozzlesLocked(l => !l)}
                        title={nozzlesLocked ? 'Unlock nozzles' : 'Lock nozzles'}
                    >
                        {nozzlesLocked ? <Lock size={12} /> : <Unlock size={12} />}
                        N
                    </button>
                    <button
                        className={`vm-lock-btn ${saddlesLocked ? 'locked' : ''}`}
                        onClick={() => setSaddlesLocked(l => !l)}
                        title={saddlesLocked ? 'Unlock saddles' : 'Lock saddles'}
                    >
                        {saddlesLocked ? <Lock size={12} /> : <Unlock size={12} />}
                        S
                    </button>
                    <button
                        className={`vm-lock-btn ${texturesLocked ? 'locked' : ''}`}
                        onClick={() => setTexturesLocked(l => !l)}
                        title={texturesLocked ? 'Unlock textures' : 'Lock textures'}
                    >
                        {texturesLocked ? <Lock size={12} /> : <Unlock size={12} />}
                        T
                    </button>
                </div>

                {/* Quick action buttons */}
                <div className="vm-quick-actions">
                    <button className="vm-quick-btn" onClick={() => setShowDrawingImport(true)} title="Import from Drawing">
                        <FileUp size={16} /> Import
                    </button>
                    <button className="vm-quick-btn" onClick={() => setShowScreenshotMode(true)} title="Screenshot Mode">
                        <Camera size={16} /> Screenshot
                    </button>
                    <button className="vm-quick-btn" onClick={() => viewportRef.current?.resetCamera()} title="Reset Camera">
                        <RotateCcw size={16} /> Reset
                    </button>
                    <button className="vm-quick-btn" onClick={saveProject} title="Save Project">
                        <Save size={16} /> Save
                    </button>
                    <label className="vm-quick-btn" title="Load Project" style={{ cursor: 'pointer' }}>
                        <Upload size={16} /> Load
                        <input type="file" accept=".json" onChange={loadProject} style={{ display: 'none' }} />
                    </label>
                </div>

                {/* Interaction hint */}
                <div className="vm-hint">
                    {getHintText()}
                </div>

                {/* Loading overlay */}
                {isLoading && (
                    <div className="vm-loader">
                        <div className="spinner" />
                        <div className="status-text">{loadingMessage}</div>
                        <div className="status-detail">This may take up to 30 seconds...</div>
                    </div>
                )}
            </div>

            {/* Status bar */}
            <StatusBar vesselState={vesselState} />

            {/* Drawing Import Modal */}
            {showDrawingImport && (
                <Suspense fallback={null}>
                    <DrawingImportModal
                        isOpen={showDrawingImport}
                        onClose={() => setShowDrawingImport(false)}
                        onApply={handleDrawingApply}
                    />
                </Suspense>
            )}

            {/* Screenshot Mode Overlay */}
            {showScreenshotMode &&
              viewportRef.current?.getRenderer() &&
              viewportRef.current?.getScene() &&
              viewportRef.current?.getCamera() &&
              viewportRef.current?.getSceneManager()?.getControls() && (
                <Suspense fallback={null}>
                    <ScreenshotMode
                        renderer={viewportRef.current.getRenderer()!}
                        scene={viewportRef.current.getScene()!}
                        camera={viewportRef.current.getCamera()!}
                        controls={viewportRef.current.getSceneManager()!.getControls()!}
                        vesselLength={vesselState.length}
                        onExit={() => setShowScreenshotMode(false)}
                    />
                </Suspense>
            )}
        </div>
    );
}
