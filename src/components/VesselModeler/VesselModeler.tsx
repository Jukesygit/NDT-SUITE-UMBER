import { useState, useRef, useCallback, useEffect, lazy, Suspense, type ChangeEvent } from 'react';
import { Lock, Unlock, Save, Upload, RotateCcw, PanelLeftClose, PanelLeft, FileUp, Camera, ChevronDown, Trash2, Cloud } from 'lucide-react';
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
    type LiftingLugConfig,
    type AnnotationShapeConfig,
    type AnnotationShapeType,
    type CoverageRectConfig,
    type RulerConfig,
    type InspectionImageConfig,
    type MeasurementConfig,
    type VesselCallbacks,
    type WeldConfig,
    type ScanCompositeConfig,
} from './types';
import type { ExtractionResult } from './engine/drawing-parser';
import { loadTextureFromData, clearHeatmapCache } from './engine/texture-manager';
import { useScanCompositeList } from '../../hooks/queries/useScanComposites';
import { getScanComposite } from '../../services/scan-composite-service';
import './vessel-modeler.css';
import * as THREE from 'three';

import CoveragePanel from './CoveragePanel';

const DrawingImportModal = lazy(() => import('./DrawingImportModal'));
const ScreenshotMode = lazy(() => import('./ScreenshotMode'));
const InspectionImageViewer = lazy(() => import('./InspectionImageViewer'));

export default function VesselModeler() {
    // Core vessel state
    const [vesselState, setVesselState] = useState<VesselState>({ ...DEFAULT_VESSEL_STATE });

    // Selection state
    const [selectedNozzleIndex, setSelectedNozzleIndex] = useState(-1);
    const [selectedSaddleIndex, setSelectedSaddleIndex] = useState(-1);
    const [selectedTextureId, setSelectedTextureId] = useState(-1);
    const [selectedLugIndex, setSelectedLugIndex] = useState(-1);
    const [selectedAnnotationId, setSelectedAnnotationId] = useState(-1);
    const [selectedRulerId, setSelectedRulerId] = useState(-1);
    const [selectedWeldIndex, setSelectedWeldIndex] = useState(-1);

    // Draw mode
    const [drawMode, setDrawMode] = useState<AnnotationShapeType | null>(null);
    const [previewAnnotation, setPreviewAnnotation] = useState<AnnotationShapeConfig | null>(null);
    const nextAnnotationIdRef = useRef(1);

    // Coverage state
    const [selectedCoverageRectId, setSelectedCoverageRectId] = useState(-1);
    const [coverageDrawMode, setCoverageDrawMode] = useState(false);
    const [previewCoverageRect, setPreviewCoverageRect] = useState<CoverageRectConfig | null>(null);
    const nextCoverageRectIdRef = useRef(1);

    // Ruler state
    const [rulerDrawMode, setRulerDrawMode] = useState(false);
    const [previewRuler, setPreviewRuler] = useState<RulerConfig | null>(null);
    const nextRulerIdRef = useRef(1);

    // Inspection image state
    const [selectedInspectionImageId, setSelectedInspectionImageId] = useState(-1);
    const [viewingInspectionImageId, setViewingInspectionImageId] = useState(-1);
    const nextInspectionImageIdRef = useRef(1);

    // Scan composite state
    const [selectedScanCompositeId, setSelectedScanCompositeId] = useState('');
    const [hoverData, setHoverData] = useState<{
        thickness: number | null;
        scanMm: number;
        indexMm: number;
    } | null>(null);
    const [showImportComposite, setShowImportComposite] = useState(false);
    const [importPlacement, setImportPlacement] = useState({
        indexStartMm: 0,
        scanDirection: 'cw' as 'cw' | 'ccw',
        indexDirection: 'forward' as 'forward' | 'reverse',
    });
    const [importingCompositeId, setImportingCompositeId] = useState<string | null>(null);
    const [scanCompositesOpen, setScanCompositesOpen] = useState(true);

    // Cloud composites query
    const { data: cloudComposites } = useScanCompositeList();

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
    const [lugsLocked, setLugsLocked] = useState(false);
    const [weldsLocked, setWeldsLocked] = useState(false);

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

    // --- Lifting lug handlers ---
    const addLug = useCallback((lug: LiftingLugConfig) => {
        setVesselState(prev => ({
            ...prev,
            liftingLugs: [...prev.liftingLugs, lug],
            hasModel: true,
        }));
    }, []);

    const updateLug = useCallback((index: number, updates: Partial<LiftingLugConfig>) => {
        setVesselState(prev => ({
            ...prev,
            liftingLugs: prev.liftingLugs.map((l, i) => i === index ? { ...l, ...updates } : l),
        }));
    }, []);

    const removeLug = useCallback((index: number) => {
        setVesselState(prev => ({
            ...prev,
            liftingLugs: prev.liftingLugs.filter((_, i) => i !== index),
        }));
        setSelectedLugIndex(-1);
    }, []);

    // --- Weld handlers ---
    const addWeld = useCallback((weld: WeldConfig) => {
        setVesselState(prev => ({
            ...prev,
            welds: [...prev.welds, weld],
            hasModel: true,
        }));
    }, []);

    const updateWeld = useCallback((index: number, updates: Partial<WeldConfig>) => {
        setVesselState(prev => ({
            ...prev,
            welds: prev.welds.map((w, i) => i === index ? { ...w, ...updates } : w),
        }));
    }, []);

    const removeWeld = useCallback((index: number) => {
        setVesselState(prev => ({
            ...prev,
            welds: prev.welds.filter((_, i) => i !== index),
        }));
        setSelectedWeldIndex(-1);
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

    // --- Annotation handlers ---
    const addAnnotation = useCallback((annotation: AnnotationShapeConfig) => {
        setVesselState(prev => ({
            ...prev,
            annotations: [...prev.annotations, annotation],
        }));
    }, []);

    const updateAnnotation = useCallback((id: number, updates: Partial<AnnotationShapeConfig>) => {
        setVesselState(prev => ({
            ...prev,
            annotations: prev.annotations.map(a => a.id === id ? { ...a, ...updates } : a),
        }));
    }, []);

    const removeAnnotation = useCallback((id: number) => {
        setVesselState(prev => ({
            ...prev,
            annotations: prev.annotations.filter(a => a.id !== id),
        }));
        setSelectedAnnotationId(-1);
    }, []);

    const updateMeasurementConfig = useCallback((updates: Partial<MeasurementConfig>) => {
        setVesselState(prev => ({
            ...prev,
            measurementConfig: { ...prev.measurementConfig, ...updates },
        }));
    }, []);

    const getNextAnnotationId = useCallback(() => {
        return nextAnnotationIdRef.current++;
    }, []);

    // --- Coverage rect handlers ---
    const addCoverageRect = useCallback((rect: CoverageRectConfig) => {
        setVesselState(prev => ({
            ...prev,
            coverageRects: [...prev.coverageRects, rect],
        }));
    }, []);

    const updateCoverageRect = useCallback((id: number, updates: Partial<CoverageRectConfig>) => {
        setVesselState(prev => ({
            ...prev,
            coverageRects: prev.coverageRects.map(r => r.id === id ? { ...r, ...updates } : r),
        }));
    }, []);

    const removeCoverageRect = useCallback((id: number) => {
        setVesselState(prev => ({
            ...prev,
            coverageRects: prev.coverageRects.filter(r => r.id !== id),
        }));
        setSelectedCoverageRectId(-1);
    }, []);

    const getNextCoverageRectId = useCallback(() => {
        return nextCoverageRectIdRef.current++;
    }, []);

    // --- Ruler handlers ---
    const addRuler = useCallback((ruler: RulerConfig) => {
        setVesselState(prev => ({
            ...prev,
            rulers: [...prev.rulers, ruler],
        }));
    }, []);

    const removeRuler = useCallback((id: number) => {
        setVesselState(prev => ({
            ...prev,
            rulers: prev.rulers.filter(r => r.id !== id),
        }));
        setSelectedRulerId(prev => prev === id ? -1 : prev);
    }, []);

    const updateRuler = useCallback((id: number, updates: Partial<RulerConfig>) => {
        setVesselState(prev => ({
            ...prev,
            rulers: prev.rulers.map(r => r.id === id ? { ...r, ...updates } : r),
        }));
    }, []);

    const getNextRulerId = useCallback(() => {
        return nextRulerIdRef.current++;
    }, []);

    // --- Inspection image handlers ---
    const addInspectionImage = useCallback((img: InspectionImageConfig) => {
        setVesselState(prev => ({
            ...prev,
            inspectionImages: [...prev.inspectionImages, img],
        }));
    }, []);

    const updateInspectionImage = useCallback((id: number, updates: Partial<InspectionImageConfig>) => {
        setVesselState(prev => ({
            ...prev,
            inspectionImages: prev.inspectionImages.map(i => i.id === id ? { ...i, ...updates } : i),
        }));
    }, []);

    const removeInspectionImage = useCallback((id: number) => {
        setVesselState(prev => ({
            ...prev,
            inspectionImages: prev.inspectionImages.filter(i => i.id !== id),
        }));
        setSelectedInspectionImageId(-1);
        if (viewingInspectionImageId === id) setViewingInspectionImageId(-1);
    }, [viewingInspectionImageId]);

    const toggleInspectionImageVisible = useCallback((id: number) => {
        setVesselState(prev => ({
            ...prev,
            inspectionImages: prev.inspectionImages.map(i =>
                i.id === id ? { ...i, visible: i.visible === false ? true : false } : i,
            ),
        }));
    }, []);

    const toggleInspectionImageLocked = useCallback((id: number) => {
        setVesselState(prev => ({
            ...prev,
            inspectionImages: prev.inspectionImages.map(i =>
                i.id === id ? { ...i, locked: !i.locked } : i,
            ),
        }));
    }, []);

    const toggleAnnotationVisible = useCallback((id: number) => {
        setVesselState(prev => ({
            ...prev,
            annotations: prev.annotations.map(a =>
                a.id === id ? { ...a, visible: a.visible === false ? true : false } : a,
            ),
        }));
    }, []);

    const toggleAnnotationLocked = useCallback((id: number) => {
        setVesselState(prev => ({
            ...prev,
            annotations: prev.annotations.map(a =>
                a.id === id ? { ...a, locked: !a.locked } : a,
            ),
        }));
    }, []);

    const getNextInspectionImageId = useCallback(() => {
        return nextInspectionImageIdRef.current++;
    }, []);

    // --- Scan composite handlers ---
    const handleImportComposite = useCallback(async () => {
        if (!importingCompositeId) return;
        try {
            const composite = await getScanComposite(importingCompositeId);
            const newConfig: ScanCompositeConfig = {
                id: `sc_${Date.now()}`,
                name: composite.name,
                cloudId: composite.id,
                data: composite.thickness_data,
                xAxis: composite.x_axis,
                yAxis: composite.y_axis,
                stats: composite.stats || { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 },
                indexStartMm: importPlacement.indexStartMm,
                scanDirection: importPlacement.scanDirection,
                indexDirection: importPlacement.indexDirection,
                colorScale: 'Jet',
                rangeMin: null,
                rangeMax: null,
                opacity: 1,
            };
            setVesselState(prev => ({
                ...prev,
                scanComposites: [...prev.scanComposites, newConfig],
            }));
            setShowImportComposite(false);
            setImportingCompositeId(null);
            setImportPlacement({ indexStartMm: 0, scanDirection: 'cw', indexDirection: 'forward' });
        } catch (err) {
            console.error('Failed to import composite:', err);
        }
    }, [importingCompositeId, importPlacement]);

    const handleRemoveScanComposite = useCallback((id: string) => {
        clearHeatmapCache(id);
        setVesselState(prev => ({
            ...prev,
            scanComposites: prev.scanComposites.filter(sc => sc.id !== id),
        }));
        if (selectedScanCompositeId === id) setSelectedScanCompositeId('');
    }, [selectedScanCompositeId]);

    const handleUpdateScanComposite = useCallback((id: string, updates: Partial<ScanCompositeConfig>) => {
        clearHeatmapCache(id);
        setVesselState(prev => ({
            ...prev,
            scanComposites: prev.scanComposites.map(sc =>
                sc.id === id ? { ...sc, ...updates } : sc
            ),
        }));
    }, []);

    // --- Interaction callbacks (from Three.js viewport) ---
    const vesselCallbacks: VesselCallbacks = {
        onNozzleSelected: (idx) => {
            setSelectedNozzleIndex(idx);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(-1);
            setSelectedLugIndex(-1);
            setSelectedAnnotationId(-1);
            setSelectedInspectionImageId(-1);
            setSelectedWeldIndex(-1);
        },
        onSaddleSelected: (idx) => {
            setSelectedNozzleIndex(-1);
            setSelectedSaddleIndex(idx);
            setSelectedTextureId(-1);
            setSelectedLugIndex(-1);
            setSelectedAnnotationId(-1);
            setSelectedInspectionImageId(-1);
            setSelectedWeldIndex(-1);
        },
        onTextureSelected: (id) => {
            setSelectedNozzleIndex(-1);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(id);
            setSelectedLugIndex(-1);
            setSelectedAnnotationId(-1);
            setSelectedInspectionImageId(-1);
            setSelectedWeldIndex(-1);
        },
        onLugSelected: (idx) => {
            setSelectedNozzleIndex(-1);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(-1);
            setSelectedLugIndex(idx);
            setSelectedAnnotationId(-1);
            setSelectedInspectionImageId(-1);
            setSelectedWeldIndex(-1);
        },
        onAnnotationSelected: (id) => {
            setSelectedNozzleIndex(-1);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(-1);
            setSelectedLugIndex(-1);
            setSelectedAnnotationId(id);
            setSelectedInspectionImageId(-1);
            setSelectedWeldIndex(-1);
        },
        onAnnotationMoved: (id, pos, angle) => {
            updateAnnotation(id, { pos: Math.round(pos), angle: Math.round(angle) });
        },
        onAnnotationLabelOffsetChanged: (id, offset) => {
            updateAnnotation(id, { labelOffset: offset });
        },
        onAnnotationCreated: (type, pos, angle, width, height) => {
            const id = getNextAnnotationId();
            const annNum = vesselState.annotations.length + 1;
            addAnnotation({
                id,
                name: `A${annNum}`,
                type,
                pos: Math.round(pos),
                angle: Math.round(angle),
                width: Math.round(width),
                height: Math.round(height),
                color: '#ff3333',
                lineWidth: 2,
                showLabel: true,
            });
            setSelectedAnnotationId(id);
            setPreviewAnnotation(null);
            setDrawMode(null);
        },
        onAnnotationPreview: (type, pos, angle, width, height) => {
            setPreviewAnnotation({
                id: -1,
                name: 'Preview',
                type,
                pos: Math.round(pos),
                angle: Math.round(angle),
                width: Math.round(width),
                height: Math.round(height),
                color: '#ff3333',
                lineWidth: 2,
                showLabel: false,
            });
        },
        onRulerCreated: (startPos, startAngle, endPos, endAngle) => {
            const id = getNextRulerId();
            const num = vesselState.rulers.length + 1;
            addRuler({
                id,
                name: `R${num}`,
                startPos: Math.round(startPos),
                startAngle: Math.round(startAngle),
                endPos: Math.round(endPos),
                endAngle: Math.round(endAngle),
                color: '#ffaa00',
                showLabel: true,
            });
            setPreviewRuler(null);
            setRulerDrawMode(false);
        },
        onRulerPreview: (startPos, startAngle, endPos, endAngle) => {
            setPreviewRuler({
                id: -1,
                name: 'Preview',
                startPos: Math.round(startPos),
                startAngle: Math.round(startAngle),
                endPos: Math.round(endPos),
                endAngle: Math.round(endAngle),
                color: '#ffaa00',
                showLabel: true,
            });
        },
        onCoverageRectCreated: (pos, angle, width, height) => {
            const id = getNextCoverageRectId();
            const num = vesselState.coverageRects.length + 1;
            addCoverageRect({
                id,
                name: `C${num}`,
                pos: Math.round(pos),
                angle: Math.round(angle),
                width: Math.round(width),
                height: Math.round(height),
                color: '#00cc66',
                lineWidth: 2,
                filled: true,
                fillOpacity: 0.2,
            });
            setSelectedCoverageRectId(id);
            setPreviewCoverageRect(null);
            setCoverageDrawMode(false);
        },
        onCoverageRectPreview: (pos, angle, width, height) => {
            setPreviewCoverageRect({
                id: -1,
                name: 'Preview',
                pos: Math.round(pos),
                angle: Math.round(angle),
                width: Math.round(width),
                height: Math.round(height),
                color: '#00cc66',
                lineWidth: 2,
                filled: false,
                fillOpacity: 0.2,
            });
        },
        onCoverageRectSelected: (id) => {
            setSelectedNozzleIndex(-1);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(-1);
            setSelectedLugIndex(-1);
            setSelectedAnnotationId(-1);
            setSelectedCoverageRectId(id);
            setSelectedInspectionImageId(-1);
            setSelectedWeldIndex(-1);
        },
        onCoverageRectMoved: (id, pos, angle) => {
            updateCoverageRect(id, { pos: Math.round(pos), angle: Math.round(angle) });
        },
        onInspectionImageSelected: (id) => {
            setSelectedNozzleIndex(-1);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(-1);
            setSelectedLugIndex(-1);
            setSelectedAnnotationId(-1);
            setSelectedCoverageRectId(-1);
            setSelectedInspectionImageId(id);
            setSelectedWeldIndex(-1);
        },
        onInspectionImageMoved: (id, pos, angle) => {
            updateInspectionImage(id, { pos: Math.round(pos), angle: Math.round(angle) });
        },
        onInspectionImageLabelOffsetChanged: (id, offset) => {
            updateInspectionImage(id, { labelOffset: offset });
        },
        onWeldSelected: (idx) => {
            setSelectedNozzleIndex(-1);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(-1);
            setSelectedLugIndex(-1);
            setSelectedAnnotationId(-1);
            setSelectedCoverageRectId(-1);
            setSelectedInspectionImageId(-1);
            setSelectedWeldIndex(idx);
        },
        onWeldMoved: (idx, pos, angle) => {
            const weld = vesselState.welds[idx];
            if (weld?.type === 'circumferential') {
                updateWeld(idx, { pos: Math.round(pos) });
            } else {
                // For longitudinal welds, move shifts the start pos while keeping length
                const delta = Math.round(pos) - weld.pos;
                updateWeld(idx, { pos: Math.round(pos), endPos: (weld.endPos ?? vesselState.length) + delta, angle: Math.round(angle) });
            }
        },
        onScanCompositeHover: (_id, thickness, scanMm, indexMm) => {
            if (thickness !== null) {
                setHoverData({ thickness, scanMm, indexMm });
            } else {
                setHoverData(null);
            }
        },
        onDeselect: () => {
            setSelectedNozzleIndex(-1);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(-1);
            setSelectedLugIndex(-1);
            setSelectedAnnotationId(-1);
            setSelectedCoverageRectId(-1);
            setSelectedInspectionImageId(-1);
            setSelectedWeldIndex(-1);
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
        onLugMoved: (idx, pos, angle) => {
            updateLug(idx, { pos: Math.round(pos), angle: Math.round(angle) });
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
                orientationMode: n.orientationMode,
                flangeOD: n.flangeOD, flangeThk: n.flangeThk, pipeOD: n.pipeOD,
            })),
            liftingLugs: vesselState.liftingLugs.map(l => ({
                name: l.name, pos: l.pos, angle: l.angle,
                style: l.style, swl: l.swl,
                width: l.width, height: l.height,
                thickness: l.thickness, holeDiameter: l.holeDiameter,
            })),
            saddles: vesselState.saddles.map(s => ({
                pos: s.pos, color: s.color || '#2244ff',
                height: s.height,
            })),
            welds: vesselState.welds.map(w => ({
                name: w.name, type: w.type, pos: w.pos,
                endPos: w.endPos, angle: w.angle, color: w.color,
            })),
            textures: vesselState.textures.map(t => ({
                id: t.id, name: t.name, imageData: t.imageData,
                pos: t.pos, angle: t.angle,
                scaleX: t.scaleX || 1.0, scaleY: t.scaleY || 1.0,
                rotation: t.rotation || 0,
                flipH: t.flipH || false, flipV: t.flipV || false,
            })),
            annotations: vesselState.annotations.map(a => ({
                id: a.id, name: a.name, type: a.type,
                pos: a.pos, angle: a.angle, width: a.width, height: a.height,
                color: a.color, lineWidth: a.lineWidth, showLabel: a.showLabel,
                leaderLength: a.leaderLength, labelOffset: a.labelOffset, visible: a.visible, locked: a.locked,
            })),
            rulers: vesselState.rulers.map(r => ({
                id: r.id, name: r.name,
                startPos: r.startPos, startAngle: r.startAngle,
                endPos: r.endPos, endAngle: r.endAngle,
                color: r.color, showLabel: r.showLabel,
            })),
            coverageRects: vesselState.coverageRects.map(r => ({
                id: r.id, name: r.name,
                pos: r.pos, angle: r.angle, width: r.width, height: r.height,
                color: r.color, lineWidth: r.lineWidth,
                filled: r.filled, fillOpacity: r.fillOpacity, locked: r.locked,
            })),
            inspectionImages: vesselState.inspectionImages.map(i => ({
                id: i.id, name: i.name, imageData: i.imageData,
                pos: i.pos, angle: i.angle,
                description: i.description, date: i.date,
                inspector: i.inspector, method: i.method, result: i.result,
                leaderLength: i.leaderLength, labelOffset: i.labelOffset, visible: i.visible, locked: i.locked,
            })),
            scanComposites: vesselState.scanComposites.map(sc => ({
                id: sc.id,
                name: sc.name,
                cloudId: sc.cloudId,
                data: sc.data,
                xAxis: sc.xAxis,
                yAxis: sc.yAxis,
                stats: sc.stats,
                indexStartMm: sc.indexStartMm,
                scanDirection: sc.scanDirection,
                indexDirection: sc.indexDirection,
                colorScale: sc.colorScale,
                rangeMin: sc.rangeMin,
                rangeMax: sc.rangeMax,
                opacity: sc.opacity,
            })),
            measurementConfig: { ...vesselState.measurementConfig },
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
        reader.onload = async (e) => {
            try {
                const projectData = JSON.parse(e.target?.result as string);
                if (!projectData.vessel || !projectData.version) {
                    throw new Error('Invalid project file format');
                }

                // Dispose existing textures before loading new ones
                for (const key of Object.keys(textureObjectsRef.current)) {
                    textureObjectsRef.current[Number(key)].dispose();
                }
                textureObjectsRef.current = {};

                // Reconstruct Three.js textures from saved base64 imageData
                const renderer = viewportRef.current?.getRenderer();
                const loadedTextures: TextureConfig[] = [];
                const savedTextures = projectData.textures || [];

                if (renderer && savedTextures.length > 0) {
                    for (const texData of savedTextures) {
                        if (!texData.imageData) continue;
                        try {
                            const result = await loadTextureFromData(texData.imageData, renderer);
                            textureObjectsRef.current[Number(texData.id)] = result.texture;
                            loadedTextures.push({
                                id: texData.id,
                                name: texData.name || 'Untitled',
                                imageData: texData.imageData,
                                pos: texData.pos ?? 0,
                                angle: texData.angle ?? 90,
                                scaleX: texData.scaleX ?? texData.scale ?? 1.0,
                                scaleY: texData.scaleY ?? texData.scale ?? 1.0,
                                rotation: texData.rotation || 0,
                                flipH: texData.flipH || false,
                                flipV: texData.flipV || false,
                                aspectRatio: result.aspectRatio,
                            });
                        } catch {
                            // Skip textures that fail to load
                        }
                    }
                }

                const newState: VesselState = {
                    id: projectData.vessel.id || 3000,
                    length: projectData.vessel.length || 8000,
                    headRatio: projectData.vessel.headRatio || 2.0,
                    orientation: projectData.vessel.orientation || 'horizontal',
                    nozzles: (projectData.nozzles || []).map((n: any) => ({
                        name: n.name || 'N', pos: n.pos ?? 0, proj: n.proj ?? 200,
                        angle: n.angle ?? 90, size: n.size ?? 100,
                        orientationMode: n.orientationMode,
                        flangeOD: n.flangeOD, flangeThk: n.flangeThk, pipeOD: n.pipeOD,
                    })),
                    liftingLugs: (projectData.liftingLugs || []).map((l: any) => ({
                        name: l.name || 'L', pos: l.pos ?? 0, angle: l.angle ?? 90,
                        style: l.style || 'padEye', swl: l.swl || '5t',
                        width: l.width, height: l.height,
                        thickness: l.thickness, holeDiameter: l.holeDiameter,
                    })),
                    saddles: (projectData.saddles || []).map((s: any) =>
                        typeof s === 'number' ? { pos: s, color: '#2244ff' } : { pos: s.pos, color: s.color || '#2244ff', height: s.height }
                    ),
                    welds: (projectData.welds || []).map((w: any) => ({
                        name: w.name || 'W', type: w.type || 'circumferential',
                        pos: w.pos ?? 0, endPos: w.endPos, angle: w.angle,
                        color: w.color || '#888888',
                    })),
                    textures: loadedTextures,
                    annotations: (projectData.annotations || []).map((a: any) => ({
                        id: a.id || 0, name: a.name || 'A', type: a.type || 'circle',
                        pos: a.pos ?? 0, angle: a.angle ?? 90,
                        width: a.width ?? 100, height: a.height ?? 100,
                        color: a.color || '#ff3333', lineWidth: a.lineWidth ?? 2,
                        showLabel: a.showLabel !== false,
                        leaderLength: a.leaderLength, labelOffset: a.labelOffset, visible: a.visible, locked: a.locked,
                    })),
                    rulers: (projectData.rulers || []).map((r: any) => ({
                        id: r.id || 0, name: r.name || 'R',
                        startPos: r.startPos ?? 0, startAngle: r.startAngle ?? 90,
                        endPos: r.endPos ?? 100, endAngle: r.endAngle ?? 90,
                        color: r.color || '#ffaa00', showLabel: r.showLabel !== false,
                    })),
                    coverageRects: (projectData.coverageRects || []).map((r: any) => ({
                        id: r.id || 0, name: r.name || 'C',
                        pos: r.pos ?? 0, angle: r.angle ?? 90,
                        width: r.width ?? 300, height: r.height ?? 200,
                        color: r.color || '#00cc66', lineWidth: r.lineWidth ?? 2,
                        filled: r.filled ?? true, fillOpacity: r.fillOpacity ?? 0.2, locked: r.locked,
                    })),
                    inspectionImages: (projectData.inspectionImages || []).map((i: any) => ({
                        id: i.id || 0, name: i.name || 'IMG', imageData: i.imageData || '',
                        pos: i.pos ?? 0, angle: i.angle ?? 90,
                        description: i.description, date: i.date,
                        inspector: i.inspector, method: i.method, result: i.result,
                        leaderLength: i.leaderLength, labelOffset: i.labelOffset, visible: i.visible, locked: i.locked,
                    })),
                    scanComposites: projectData.scanComposites || [],
                    measurementConfig: {
                        ...DEFAULT_VESSEL_STATE.measurementConfig,
                        ...(projectData.measurementConfig || {}),
                    },
                    hasModel: true,
                    visuals: { ...DEFAULT_VESSEL_STATE.visuals, ...(projectData.visuals || {}) },
                };

                // Clear heatmap cache to avoid stale scan composite textures
                clearHeatmapCache();

                // Update next texture ID to avoid conflicts
                const maxId = loadedTextures.reduce((max: number, t: TextureConfig) => Math.max(max, Number(t.id) || 0), 0);
                nextTextureIdRef.current = maxId + 1;

                // Update next annotation ID to avoid conflicts
                const maxAnnId = newState.annotations.reduce((max: number, a: AnnotationShapeConfig) => Math.max(max, a.id || 0), 0);
                nextAnnotationIdRef.current = maxAnnId + 1;

                // Update next coverage rect ID to avoid conflicts
                const maxCovId = newState.coverageRects.reduce((max: number, r: CoverageRectConfig) => Math.max(max, r.id || 0), 0);
                nextCoverageRectIdRef.current = maxCovId + 1;

                // Update next ruler ID to avoid conflicts
                const maxRulerId = newState.rulers.reduce((max: number, r: RulerConfig) => Math.max(max, r.id || 0), 0);
                nextRulerIdRef.current = maxRulerId + 1;

                // Update next inspection image ID to avoid conflicts
                const maxImgId = newState.inspectionImages.reduce((max: number, i: InspectionImageConfig) => Math.max(max, i.id || 0), 0);
                nextInspectionImageIdRef.current = maxImgId + 1;

                setVesselState(newState);
                setTextureObjectsVersion(v => v + 1);
                setSelectedNozzleIndex(-1);
                setSelectedSaddleIndex(-1);
                setSelectedTextureId(-1);
                setSelectedLugIndex(-1);
                setSelectedAnnotationId(-1);
                setSelectedCoverageRectId(-1);
                setSelectedInspectionImageId(-1);
                setSelectedWeldIndex(-1);
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
                color: s.color || '#2244ff',
            })),
            hasModel: true,
        }));
        setSelectedNozzleIndex(-1);
        setSelectedSaddleIndex(-1);
        setSelectedTextureId(-1);
        setSelectedLugIndex(-1);
    }, []);

    // --- Escape key cancels draw mode ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (drawMode) {
                    setDrawMode(null);
                    setPreviewAnnotation(null);
                }
                if (coverageDrawMode) {
                    setCoverageDrawMode(false);
                    setPreviewCoverageRect(null);
                }
                if (rulerDrawMode) {
                    setRulerDrawMode(false);
                    setPreviewRuler(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [drawMode, coverageDrawMode, rulerDrawMode]);

    // --- Nozzle library drag-and-drop onto 3D canvas ---
    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('application/x-nozzle-pipe') ||
            e.dataTransfer.types.includes('application/x-lifting-lug')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    }, []);

    const SCALE = 0.001; // Matches vessel-geometry scale

    const handleNozzleDrop = useCallback((e: React.DragEvent) => {
        const data = e.dataTransfer.getData('application/x-nozzle-pipe');
        if (!data) return;
        e.preventDefault();

        const pipe = JSON.parse(data);
        const cam = viewportRef.current?.getCamera();
        const rendererEl = viewportRef.current?.getRenderer()?.domElement;
        const sceneManager = viewportRef.current?.getSceneManager();
        if (!cam || !rendererEl || !sceneManager) return;

        const vesselGroup = sceneManager.getVesselGroup();
        if (!vesselGroup) return;

        // Raycast from drop position
        const rect = rendererEl.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, cam);

        // Find shell meshes to intersect
        const shells: THREE.Object3D[] = [];
        vesselGroup.traverse((child: THREE.Object3D) => {
            if (child.userData.isShell) shells.push(child);
        });
        const intersects = raycaster.intersectObjects(shells);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            const isVertical = vesselState.orientation === 'vertical';

            // Calculate position from intersection point
            let newPos = isVertical
                ? (point.y / SCALE) + (vesselState.length / 2)
                : (point.x / SCALE) + (vesselState.length / 2);
            const headDepth = vesselState.id / (2 * vesselState.headRatio);
            newPos = Math.max(-headDepth, Math.min(vesselState.length + headDepth, newPos));

            // Calculate angle from intersection
            const rad = isVertical
                ? Math.atan2(point.z, point.x)
                : Math.atan2(point.y, point.z);
            let deg = (rad * 180) / Math.PI;
            if (deg < 0) deg += 360;

            // Find a unique name
            let nozzleNum = vesselState.nozzles.length + 1;
            let name = 'N' + nozzleNum;
            while (vesselState.nozzles.some(n => n.name === name)) {
                nozzleNum++;
                name = 'N' + nozzleNum;
            }

            const defaultProj = (vesselState.id / 2) + 200;

            addNozzle({
                name,
                pos: Math.round(newPos),
                proj: defaultProj,
                angle: Math.round(deg),
                size: pipe.id,
                flangeOD: pipe.flangeOD,
                flangeThk: pipe.flangeThk,
                pipeOD: pipe.od,
            });
        } else {
            // Dropped on canvas but missed the vessel - add at center
            let nozzleNum = vesselState.nozzles.length + 1;
            let name = 'N' + nozzleNum;
            while (vesselState.nozzles.some(n => n.name === name)) {
                nozzleNum++;
                name = 'N' + nozzleNum;
            }
            addNozzle({
                name,
                pos: vesselState.length / 2,
                proj: pipe.od * 2,
                angle: 90,
                size: pipe.id,
                flangeOD: pipe.flangeOD,
                flangeThk: pipe.flangeThk,
                pipeOD: pipe.od,
            });
        }
    }, [vesselState, addNozzle]);

    // --- Lifting lug drag-and-drop onto 3D canvas ---
    const handleLugDrop = useCallback((e: React.DragEvent) => {
        const data = e.dataTransfer.getData('application/x-lifting-lug');
        if (!data) return;
        e.preventDefault();

        const lugData = JSON.parse(data);
        const cam = viewportRef.current?.getCamera();
        const rendererEl = viewportRef.current?.getRenderer()?.domElement;
        const sceneManager = viewportRef.current?.getSceneManager();
        if (!cam || !rendererEl || !sceneManager) return;

        const vesselGroup = sceneManager.getVesselGroup();
        if (!vesselGroup) return;

        const rect = rendererEl.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, cam);

        const shells: THREE.Object3D[] = [];
        vesselGroup.traverse((child: THREE.Object3D) => {
            if (child.userData.isShell) shells.push(child);
        });
        const intersects = raycaster.intersectObjects(shells);

        let newPos: number;
        let deg: number;

        if (intersects.length > 0) {
            const point = intersects[0].point;
            const isVertical = vesselState.orientation === 'vertical';
            newPos = isVertical
                ? (point.y / SCALE) + (vesselState.length / 2)
                : (point.x / SCALE) + (vesselState.length / 2);
            const headDepth = vesselState.id / (2 * vesselState.headRatio);
            newPos = Math.max(-headDepth, Math.min(vesselState.length + headDepth, newPos));

            const rad = isVertical
                ? Math.atan2(point.z, point.x)
                : Math.atan2(point.y, point.z);
            deg = (rad * 180) / Math.PI;
            if (deg < 0) deg += 360;
        } else {
            newPos = vesselState.length / 2;
            deg = 90;
        }

        let lugNum = vesselState.liftingLugs.length + 1;
        let name = 'L' + lugNum;
        while (vesselState.liftingLugs.some(l => l.name === name)) {
            lugNum++;
            name = 'L' + lugNum;
        }

        addLug({
            name,
            pos: Math.round(newPos),
            angle: Math.round(deg),
            style: lugData.style || 'padEye',
            swl: lugData.label,
        });
    }, [vesselState, addLug]);

    // --- Combined drop handler ---
    const handleDrop = useCallback((e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('application/x-nozzle-pipe')) {
            handleNozzleDrop(e);
        } else if (e.dataTransfer.types.includes('application/x-lifting-lug')) {
            handleLugDrop(e);
        }
    }, [handleNozzleDrop, handleLugDrop]);

    // --- Hint text ---
    const getHintText = () => {
        if (rulerDrawMode) {
            return 'Drawing Ruler - Click on vessel to set start point, drag to end point | Press Esc to cancel';
        }
        if (coverageDrawMode) {
            return 'Drawing Coverage Rectangle - Click on vessel to start, drag to size | Press Esc to cancel';
        }
        if (drawMode) {
            return `Drawing ${drawMode === 'circle' ? 'Circle' : 'Rectangle'} - Click on vessel to start, drag to size | Press Esc to cancel`;
        }
        const locked = [];
        if (nozzlesLocked) locked.push('Nozzles');
        if (lugsLocked) locked.push('Lugs');
        if (saddlesLocked) locked.push('Saddles');
        if (texturesLocked) locked.push('Textures');
        if (weldsLocked) locked.push('Welds');

        if (locked.length > 0) return `${locked.join(', ')} Locked | Other components can be repositioned`;
        return 'Drag from Library to Add | Click & Drag Nozzles, Supports, or Textures to Reposition';
    };

    return (
        <div className="h-full w-full flex flex-col overflow-hidden" style={{ background: '#111111' }}>
            {/* Main content area */}
            <div
                className={`flex-1 relative overflow-hidden ${drawMode || coverageDrawMode || rulerDrawMode ? 'vm-draw-mode-active' : ''}`}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {/* Three.js viewport (z-0) */}
                <ThreeViewport
                    ref={viewportRef}
                    vesselState={vesselState}
                    selectedNozzleIndex={selectedNozzleIndex}
                    selectedLugIndex={selectedLugIndex}
                    selectedSaddleIndex={selectedSaddleIndex}
                    selectedTextureId={selectedTextureId}
                    selectedAnnotationId={selectedAnnotationId}
                    textureObjects={textureObjectsRef.current}
                    callbacks={vesselCallbacks}
                    nozzlesLocked={nozzlesLocked}
                    saddlesLocked={saddlesLocked}
                    texturesLocked={texturesLocked}
                    lugsLocked={lugsLocked}

                    weldsLocked={weldsLocked}
                    selectedWeldIndex={selectedWeldIndex}
                    selectedInspectionImageId={selectedInspectionImageId}
                    onInspectionImageThumbnailClick={(id) => setViewingInspectionImageId(id)}
                    drawMode={drawMode}
                    coverageDrawMode={coverageDrawMode}
                    previewAnnotation={previewAnnotation}
                    previewCoverageRect={previewCoverageRect}
                    rulerDrawMode={rulerDrawMode}
                    previewRuler={previewRuler}
                    selectedScanCompositeId={selectedScanCompositeId}
                />

                {/* Scan composite hover tooltip */}
                {hoverData && hoverData.thickness !== null && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-gray-900/90 text-white px-4 py-2 rounded-lg text-sm z-50 flex items-center gap-4 pointer-events-none backdrop-blur-sm border border-gray-700">
                        <div>
                            <span className="text-gray-400 text-xs">Thickness</span>
                            <div className="font-bold text-lg">{hoverData.thickness.toFixed(2)} mm</div>
                        </div>
                        <div className="w-px h-8 bg-gray-600" />
                        <div>
                            <span className="text-gray-400 text-xs">Scan</span>
                            <div>{hoverData.scanMm.toFixed(1)} mm</div>
                        </div>
                        <div className="w-px h-8 bg-gray-600" />
                        <div>
                            <span className="text-gray-400 text-xs">Index</span>
                            <div>{hoverData.indexMm.toFixed(1)} mm</div>
                        </div>
                    </div>
                )}

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
                        selectedLugIndex={selectedLugIndex}
                        onAddLug={addLug}
                        onUpdateLug={updateLug}
                        onRemoveLug={removeLug}
                        onSelectLug={setSelectedLugIndex}
                        onAddSaddle={addSaddle}
                        onUpdateSaddle={updateSaddle}
                        onRemoveSaddle={removeSaddle}
                        onSelectSaddle={setSelectedSaddleIndex}
                        selectedWeldIndex={selectedWeldIndex}
                        onAddWeld={addWeld}
                        onUpdateWeld={updateWeld}
                        onRemoveWeld={removeWeld}
                        onSelectWeld={setSelectedWeldIndex}
                        onAddTexture={addTexture}
                        onUpdateTexture={updateTexture}
                        onRemoveTexture={removeTexture}
                        onSelectTexture={setSelectedTextureId}
                        getNextTextureId={getNextTextureId}
                        renderer={viewportRef.current?.getRenderer() ?? null}
                        selectedAnnotationId={selectedAnnotationId}
                        drawMode={drawMode}
                        onSetDrawMode={(mode) => { setDrawMode(mode); if (mode) { setCoverageDrawMode(false); setRulerDrawMode(false); } }}
                        onAddAnnotation={addAnnotation}
                        onUpdateAnnotation={updateAnnotation}
                        onRemoveAnnotation={removeAnnotation}
                        onSelectAnnotation={setSelectedAnnotationId}
                        onUpdateMeasurementConfig={updateMeasurementConfig}
                        getNextAnnotationId={getNextAnnotationId}
                        coverageDrawMode={coverageDrawMode}
                        onSetCoverageDrawMode={(active) => { setCoverageDrawMode(active); if (active) { setDrawMode(null); setRulerDrawMode(false); } }}
                        onAddCoverageRect={addCoverageRect}
                        onUpdateCoverageRect={updateCoverageRect}
                        onRemoveCoverageRect={removeCoverageRect}
                        onSelectCoverageRect={setSelectedCoverageRectId}
                        selectedCoverageRectId={selectedCoverageRectId}
                        getNextCoverageRectId={getNextCoverageRectId}
                        rulerDrawMode={rulerDrawMode}
                        onSetRulerDrawMode={(active) => { setRulerDrawMode(active); if (active) { setDrawMode(null); setCoverageDrawMode(false); } }}
                        onRemoveRuler={removeRuler}
                        onUpdateRuler={updateRuler}
                        selectedRulerId={selectedRulerId}
                        onSelectRuler={setSelectedRulerId}
                        selectedInspectionImageId={selectedInspectionImageId}
                        onAddInspectionImage={addInspectionImage}
                        onUpdateInspectionImage={updateInspectionImage}
                        onRemoveInspectionImage={removeInspectionImage}
                        onSelectInspectionImage={setSelectedInspectionImageId}
                        onToggleInspectionImageVisible={toggleInspectionImageVisible}
                        onToggleInspectionImageLocked={toggleInspectionImageLocked}
                        onToggleAnnotationVisible={toggleAnnotationVisible}
                        onToggleAnnotationLocked={toggleAnnotationLocked}
                        onViewInspectionImage={(id) => setViewingInspectionImageId(id)}
                        getNextInspectionImageId={getNextInspectionImageId}
                    />

                    {/* Scan Composites Section */}
                    <div className="border-t border-gray-700">
                        <button
                            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700/50"
                            onClick={() => setScanCompositesOpen(o => !o)}
                        >
                            <span className="flex items-center gap-2">
                                Scan Composites
                                {vesselState.scanComposites.length > 0 && (
                                    <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                                        {vesselState.scanComposites.length}
                                    </span>
                                )}
                            </span>
                            <ChevronDown size={14} className={`transition-transform ${scanCompositesOpen ? '' : '-rotate-90'}`} />
                        </button>

                        {scanCompositesOpen && (
                            <div className="px-3 pb-3 space-y-2">
                                <button
                                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded"
                                    onClick={() => setShowImportComposite(true)}
                                >
                                    <Cloud size={12} /> Import from Cloud
                                </button>

                                {vesselState.scanComposites.length === 0 && (
                                    <p className="text-xs text-gray-500 text-center py-2">No scan composites placed</p>
                                )}

                                {vesselState.scanComposites.map(sc => {
                                    const isSelected = selectedScanCompositeId === sc.id;
                                    const widthMm = sc.xAxis.length > 0 ? Math.round(sc.xAxis[sc.xAxis.length - 1] - sc.xAxis[0]) : 0;
                                    const heightMm = sc.yAxis.length > 0 ? Math.round(sc.yAxis[sc.yAxis.length - 1] - sc.yAxis[0]) : 0;
                                    return (
                                        <div
                                            key={sc.id}
                                            className={`rounded border p-2 cursor-pointer text-xs space-y-1.5 ${isSelected ? 'border-blue-500 bg-blue-900/30' : 'border-gray-600 bg-gray-800 hover:border-gray-500'}`}
                                            onClick={() => setSelectedScanCompositeId(isSelected ? '' : sc.id)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-gray-200 truncate">{sc.name}</span>
                                                <button
                                                    className="text-red-400 hover:text-red-300 p-0.5"
                                                    onClick={(e) => { e.stopPropagation(); handleRemoveScanComposite(sc.id); }}
                                                    title="Remove"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                            <div className="text-gray-400">{widthMm} x {heightMm} mm</div>

                                            {isSelected && (
                                                <div className="space-y-1.5 pt-1 border-t border-gray-700">
                                                    {/* Colorscale */}
                                                    <label className="flex items-center justify-between">
                                                        <span className="text-gray-400">Colorscale</span>
                                                        <select
                                                            className="bg-gray-700 text-gray-200 text-xs rounded px-1.5 py-0.5 border border-gray-600"
                                                            value={sc.colorScale}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => handleUpdateScanComposite(sc.id, { colorScale: e.target.value })}
                                                        >
                                                            <option value="Jet">Jet</option>
                                                            <option value="Viridis">Viridis</option>
                                                            <option value="Hot">Hot</option>
                                                            <option value="Blues">Blues</option>
                                                        </select>
                                                    </label>

                                                    {/* Opacity */}
                                                    <label className="flex items-center justify-between">
                                                        <span className="text-gray-400">Opacity</span>
                                                        <input
                                                            type="range"
                                                            min={0} max={1} step={0.1}
                                                            value={sc.opacity}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => handleUpdateScanComposite(sc.id, { opacity: parseFloat(e.target.value) })}
                                                            className="w-20"
                                                        />
                                                    </label>

                                                    {/* Range Min */}
                                                    <label className="flex items-center justify-between">
                                                        <span className="text-gray-400">Min</span>
                                                        <input
                                                            type="number"
                                                            className="w-16 bg-gray-700 text-gray-200 text-xs rounded px-1.5 py-0.5 border border-gray-600"
                                                            placeholder="Auto"
                                                            value={sc.rangeMin ?? ''}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => handleUpdateScanComposite(sc.id, {
                                                                rangeMin: e.target.value === '' ? null : parseFloat(e.target.value),
                                                            })}
                                                        />
                                                    </label>

                                                    {/* Range Max */}
                                                    <label className="flex items-center justify-between">
                                                        <span className="text-gray-400">Max</span>
                                                        <input
                                                            type="number"
                                                            className="w-16 bg-gray-700 text-gray-200 text-xs rounded px-1.5 py-0.5 border border-gray-600"
                                                            placeholder="Auto"
                                                            value={sc.rangeMax ?? ''}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => handleUpdateScanComposite(sc.id, {
                                                                rangeMax: e.target.value === '' ? null : parseFloat(e.target.value),
                                                            })}
                                                        />
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
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
                    <button
                        className={`vm-lock-btn ${lugsLocked ? 'locked' : ''}`}
                        onClick={() => setLugsLocked(l => !l)}
                        title={lugsLocked ? 'Unlock lifting lugs' : 'Lock lifting lugs'}
                    >
                        {lugsLocked ? <Lock size={12} /> : <Unlock size={12} />}
                        L
                    </button>
                    <button
                        className={`vm-lock-btn ${weldsLocked ? 'locked' : ''}`}
                        onClick={() => setWeldsLocked(l => !l)}
                        title={weldsLocked ? 'Unlock welds' : 'Lock welds'}
                    >
                        {weldsLocked ? <Lock size={12} /> : <Unlock size={12} />}
                        W
                    </button>
                </div>

                {/* Quick action buttons */}
                <div className="vm-quick-actions">
                    <button className="vm-quick-btn" onClick={() => setShowDrawingImport(true)} title="Import General Arrangement Drawing">
                        <FileUp size={16} /> Import GA
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

                {/* Coverage overlay */}
                <CoveragePanel vesselState={vesselState} sidebarOpen={sidebarOpen} />

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

            {/* Inspection Image Viewer Modal */}
            {viewingInspectionImageId >= 0 && (() => {
                const viewImg = vesselState.inspectionImages.find(i => i.id === viewingInspectionImageId);
                if (!viewImg) return null;
                return (
                    <Suspense fallback={null}>
                        <InspectionImageViewer
                            image={viewImg}
                            onClose={() => setViewingInspectionImageId(-1)}
                            onUpdate={updateInspectionImage}
                        />
                    </Suspense>
                );
            })()}

            {/* Scan Composite Import Modal */}
            {showImportComposite && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="bg-gray-800 rounded-lg shadow-xl w-[480px] max-h-[80vh] flex flex-col border border-gray-600">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                            <h2 className="text-sm font-semibold text-white">Import Scan Composite</h2>
                            <button
                                className="text-gray-400 hover:text-white text-lg leading-none"
                                onClick={() => { setShowImportComposite(false); setImportingCompositeId(null); }}
                            >
                                &times;
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {!importingCompositeId ? (
                                <>
                                    <p className="text-xs text-gray-400">Select a composite to import:</p>
                                    {(!cloudComposites || cloudComposites.length === 0) ? (
                                        <p className="text-sm text-gray-500 text-center py-6">No composites saved yet</p>
                                    ) : (
                                        <div className="space-y-1">
                                            {cloudComposites.map(c => (
                                                <button
                                                    key={c.id}
                                                    className="w-full text-left px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-gray-500 text-xs"
                                                    onClick={() => setImportingCompositeId(c.id)}
                                                >
                                                    <div className="font-medium text-gray-200">{c.name}</div>
                                                    <div className="text-gray-400 mt-0.5">
                                                        {c.width} x {c.height} mm &middot; {new Date(c.created_at).toLocaleDateString()}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <p className="text-xs text-gray-400">
                                        Placing: <span className="text-gray-200 font-medium">{cloudComposites?.find(c => c.id === importingCompositeId)?.name}</span>
                                    </p>

                                    {/* Index start position */}
                                    <label className="block">
                                        <span className="text-xs text-gray-400">Index start position (mm from tangent line)</span>
                                        <input
                                            type="number"
                                            className="mt-1 w-full bg-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 border border-gray-600"
                                            value={importPlacement.indexStartMm}
                                            onChange={(e) => setImportPlacement(p => ({ ...p, indexStartMm: parseFloat(e.target.value) || 0 }))}
                                        />
                                    </label>

                                    {/* Scan direction */}
                                    <div>
                                        <span className="text-xs text-gray-400">Scan direction from TDC</span>
                                        <div className="flex gap-1 mt-1">
                                            <button
                                                className={`flex-1 text-xs py-1.5 rounded ${importPlacement.scanDirection === 'cw' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                                onClick={() => setImportPlacement(p => ({ ...p, scanDirection: 'cw' }))}
                                            >
                                                CW
                                            </button>
                                            <button
                                                className={`flex-1 text-xs py-1.5 rounded ${importPlacement.scanDirection === 'ccw' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                                onClick={() => setImportPlacement(p => ({ ...p, scanDirection: 'ccw' }))}
                                            >
                                                CCW
                                            </button>
                                        </div>
                                    </div>

                                    {/* Index direction */}
                                    <div>
                                        <span className="text-xs text-gray-400">Index direction along vessel</span>
                                        <div className="flex gap-1 mt-1">
                                            <button
                                                className={`flex-1 text-xs py-1.5 rounded ${importPlacement.indexDirection === 'forward' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                                onClick={() => setImportPlacement(p => ({ ...p, indexDirection: 'forward' }))}
                                            >
                                                Forward
                                            </button>
                                            <button
                                                className={`flex-1 text-xs py-1.5 rounded ${importPlacement.indexDirection === 'reverse' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                                onClick={() => setImportPlacement(p => ({ ...p, indexDirection: 'reverse' }))}
                                            >
                                                Reverse
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
                            {importingCompositeId && (
                                <button
                                    className="px-3 py-1.5 text-xs text-gray-300 bg-gray-700 hover:bg-gray-600 rounded"
                                    onClick={() => setImportingCompositeId(null)}
                                >
                                    Back
                                </button>
                            )}
                            <button
                                className="px-3 py-1.5 text-xs text-gray-300 bg-gray-700 hover:bg-gray-600 rounded"
                                onClick={() => { setShowImportComposite(false); setImportingCompositeId(null); }}
                            >
                                Cancel
                            </button>
                            {importingCompositeId && (
                                <button
                                    className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded"
                                    onClick={handleImportComposite}
                                >
                                    Import
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
