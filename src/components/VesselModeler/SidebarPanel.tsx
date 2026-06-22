import { useState, useCallback } from 'react';
import type {
    VesselState,
    NozzleConfig,
    SaddleConfig,
    TextureConfig,
    LiftingLugConfig,
    AnnotationShapeConfig,
    AnnotationShapeType,
    CoverageRectConfig,
    InspectionImageConfig,
    MeasurementConfig,
    WeldConfig,
    ScanCompositeConfig,
    DomeScanConfig,
    ThicknessThresholds,
    WallLossGroupConfig,
    PipeSegmentType,
} from './types';
import type { FreeOrigin, PipeSegment } from './types';
import type { ProjectImage } from '../../types/inspection-project';
import { GitBranch, Layers, ClipboardCheck, Ruler } from 'lucide-react';
import type * as THREE from 'three';
import {
    SliderRow,
    Section,
    DimensionsSection,
    VisualsSection,
    NozzleSection,
    LiftingLugSection,
    WeldSection,
    SaddleSection,
    ImageOverlaySection,
    ScanCompositeSection,
    DomeScanSection,
    AnnotationSection,
    WallLossConfigSection,
    CoverageSection,
    InspectionImageSection,
    ProjectInfoSection,
    PipingSection,
    ReportExportSection,
    VesselDetailsSection,
} from './sidebar';

export type ModelMode = 'vessel' | 'pipe';
type SidebarSectionId = 'projectInfo' | 'dimensions' | 'vesselDetails' | 'visuals' | 'attachments' | 'scanOverlay' | 'inspection' | 'piping';
type AttachmentSubId = 'nozzles' | 'liftingLugs' | 'welds' | 'supports' | 'piping';
type ScanOverlaySubId = 'imageOverlays' | 'scanComposites' | 'domeScanComposites';
type InspectionSubId = 'annotations' | 'coverage' | 'inspectionImages' | 'reportExport';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SidebarPanelProps {
    vesselState: VesselState;
    modelMode: ModelMode;
    onSetModelMode: (mode: ModelMode) => void;
    selectedNozzleIndex: number;
    selectedSaddleIndex: number;
    selectedTextureId: number;
    onUpdateDimensions: (updates: Partial<VesselState>) => void;
    onAddNozzle: (nozzle: NozzleConfig) => void;
    onUpdateNozzle: (index: number, updates: Partial<NozzleConfig>) => void;
    onRemoveNozzle: (index: number) => void;
    onSelectNozzle: (index: number) => void;
    // Lifting lug props
    selectedLugIndex: number;
    onAddLug: (lug: LiftingLugConfig) => void;
    onUpdateLug: (index: number, updates: Partial<LiftingLugConfig>) => void;
    onRemoveLug: (index: number) => void;
    onSelectLug: (index: number) => void;
    onAddSaddle: (saddle: SaddleConfig) => void;
    onUpdateSaddle: (index: number, updates: Partial<SaddleConfig>) => void;
    onUpdateAllSaddleHeights: (height: number) => void;
    onUpdateAllSaddleDepths: (depth: number) => void;
    onRemoveSaddle: (index: number) => void;
    onSelectSaddle: (index: number) => void;
    // Weld props
    selectedWeldIndex: number;
    onAddWeld: (weld: WeldConfig) => void;
    onUpdateWeld: (index: number, updates: Partial<WeldConfig>) => void;
    onRemoveWeld: (index: number) => void;
    onSelectWeld: (index: number) => void;
    onAddTexture: (texture: TextureConfig, threeTexture: THREE.Texture) => void;
    onUpdateTexture: (id: number, updates: Partial<TextureConfig>) => void;
    onRemoveTexture: (id: number) => void;
    onSelectTexture: (id: number) => void;
    getNextTextureId: () => number;
    renderer: THREE.WebGLRenderer | null;
    // Annotation props
    selectedAnnotationId: number;
    drawMode: AnnotationShapeType | null;
    onSetDrawMode: (mode: AnnotationShapeType | null) => void;
    onAddAnnotation: (config: AnnotationShapeConfig) => void;
    onUpdateAnnotation: (id: number, updates: Partial<AnnotationShapeConfig>) => void;
    onRemoveAnnotation: (id: number) => void;
    onSelectAnnotation: (id: number) => void;
    onUpdateMeasurementConfig: (updates: Partial<MeasurementConfig>) => void;
    getNextAnnotationId: () => number;
    // Coverage props
    coverageDrawMode: boolean;
    onSetCoverageDrawMode: (active: boolean) => void;
    onAddCoverageRect: (rect: CoverageRectConfig) => void;
    onUpdateCoverageRect: (id: number, updates: Partial<CoverageRectConfig>) => void;
    onRemoveCoverageRect: (id: number) => void;
    onSelectCoverageRect: (id: number) => void;
    selectedCoverageRectId: number;
    getNextCoverageRectId: () => number;
    // Inspection image props
    selectedInspectionImageId: number;
    onAddInspectionImage: (img: InspectionImageConfig) => void;
    onUpdateInspectionImage: (id: number, updates: Partial<InspectionImageConfig>) => void;
    onRemoveInspectionImage: (id: number) => void;
    onSelectInspectionImage: (id: number) => void;
    onToggleInspectionImageVisible: (id: number) => void;
    onToggleInspectionImageLocked: (id: number) => void;
    onToggleAnnotationVisible: (id: number) => void;
    onToggleAnnotationLocked: (id: number) => void;
    onViewInspectionImage: (id: number) => void;
    getNextInspectionImageId: () => number;
    // Ruler props
    rulerDrawMode: boolean;
    onSetRulerDrawMode: (active: boolean) => void;
    onRemoveRuler: (id: number) => void;
    onUpdateRuler: (id: number, updates: Partial<import('./types').RulerConfig>) => void;
    selectedRulerId: number;
    onSelectRuler: (id: number) => void;
    // Scan composite props
    selectedScanCompositeId: string;
    onSelectScanComposite: (id: string) => void;
    onImportComposite: (compositeId: string, placement: { scanDirection: 'cw' | 'ccw'; indexDirection: 'forward' | 'reverse' }) => void;
    onUpdateScanComposite: (id: string, updates: Partial<ScanCompositeConfig>) => void;
    onRemoveScanComposite: (id: string) => void;
    cloudComposites: Array<{ id: string; name: string; width: number; height: number; created_at: string }> | undefined;
    cloudCompositesLoading: boolean;
    cloudCompositesError: Error | null;
    // Dome scan props
    selectedDomeScanId: string;
    onSelectDomeScan: (id: string) => void;
    onImportDomeComposite: (compositeId: string, head: 'left' | 'right') => void;
    onUpdateDomeScan: (id: string, updates: Partial<DomeScanConfig>) => void;
    onRemoveDomeScan: (id: string) => void;
    cloudDomeComposites: Array<{ id: string; name: string; width: number; height: number; section_type: string | null; created_at: string }> | undefined;
    cloudDomeCompositesLoading: boolean;
    cloudDomeCompositesError: Error | null;
    onUpdateThicknessThresholds: (thresholds: ThicknessThresholds) => void;
    onUpdateWallLossGroups: (config: WallLossGroupConfig) => void;
    // Pipeline props
    selectedPipelineId: string;
    selectedSegmentIdx: number;
    onAddPipeline: (nozzleIndex: number, segmentType: PipeSegmentType) => void;
    onAddFreePipeline: (pipeDiameter: number, segmentType: PipeSegmentType) => void;
    onUpdateFreePipelineOrigin: (pipelineId: string, updates: Partial<FreeOrigin>) => void;
    onAddSegment: (pipelineId: string, segmentType: PipeSegmentType) => void;
    onUpdateSegment: (pipelineId: string, segmentId: string, updates: Partial<PipeSegment>) => void;
    onRemoveSegment: (pipelineId: string, segmentIndex: number) => void;
    onRemovePipeline: (pipelineId: string) => void;
    onSelectPipeSegment: (pipelineId: string, segmentIndex: number) => void;
    // Report generation
    onGenerateReport: () => Promise<void>;
    // Project image pool
    projectImages?: ProjectImage[];
}

// ---------------------------------------------------------------------------
// SidebarPanel - Orchestrator
// ---------------------------------------------------------------------------

export default function SidebarPanel(props: SidebarPanelProps) {
    const { vesselState, modelMode } = props;
    const isPipeMode = modelMode === 'pipe';

    // Accordion: only one top-level section open at a time
    const [activeSection, setActiveSection] = useState<SidebarSectionId | null>(isPipeMode ? 'dimensions' : 'projectInfo');
    const toggle = useCallback((id: SidebarSectionId) => {
        setActiveSection(prev => prev === id ? null : id);
    }, []);

    // Sub-accordions — none open by default
    const [activeAttachmentSub, setActiveAttachmentSub] = useState<AttachmentSubId | null>(null);
    const toggleAttSub = useCallback((id: AttachmentSubId) => {
        setActiveAttachmentSub(prev => prev === id ? null : id);
    }, []);

    const [activeScanOverlaySub, setActiveScanOverlaySub] = useState<ScanOverlaySubId | null>(null);
    const toggleScanSub = useCallback((id: ScanOverlaySubId) => {
        setActiveScanOverlaySub(prev => prev === id ? null : id);
    }, []);

    const [activeInspectionSub, setActiveInspectionSub] = useState<InspectionSubId | null>(null);
    const toggleInspSub = useCallback((id: InspectionSubId) => {
        setActiveInspectionSub(prev => prev === id ? null : id);
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Title + mode toggle */}
            <div style={{
                padding: '14px 15px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.03)',
            }}>
                <h2 style={{
                    margin: '0 0 8px 0', fontSize: '0.95rem', color: 'rgba(255,255,255,0.95)',
                    fontWeight: 700, letterSpacing: '0.02em',
                }}>
                    {isPipeMode ? 'Pipe Modeler' : 'Vessel Modeler'}
                </h2>
                <div className="vm-toggle-group" style={{ width: '100%' }}>
                    <button
                        className={`vm-toggle-btn ${!isPipeMode ? 'active' : ''}`}
                        onClick={() => { props.onSetModelMode('vessel'); setActiveSection('projectInfo'); }}
                        style={{ flex: 1 }}
                    >
                        Vessel
                    </button>
                    <button
                        className={`vm-toggle-btn ${isPipeMode ? 'active' : ''}`}
                        onClick={() => { props.onSetModelMode('pipe'); setActiveSection('dimensions'); }}
                        style={{ flex: 1 }}
                    >
                        Pipe
                    </button>
                </div>
            </div>

            {/* Scrollable sections */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* ── Pipe mode: piping-only sidebar ── */}
                {isPipeMode && (
                    <>
                        <Section title="Pipe Dimensions" icon={<Ruler size={14} style={{ marginRight: 6 }} />} isOpen={activeSection === 'dimensions'} onToggle={() => toggle('dimensions')}>
                            <SliderRow
                                label="Outer Diameter (mm)"
                                value={vesselState.id}
                                min={10}
                                max={3000}
                                step={10}
                                onChange={v => props.onUpdateDimensions({ id: v })}
                            />
                            <SliderRow
                                label="Length (mm)"
                                value={vesselState.length}
                                min={50}
                                max={50000}
                                step={50}
                                onChange={v => props.onUpdateDimensions({ length: v })}
                            />
                        </Section>
                        <PipingSection
                            vesselState={vesselState}
                            selectedPipelineId={props.selectedPipelineId}
                            selectedSegmentIdx={props.selectedSegmentIdx}
                            selectedNozzleIndex={props.selectedNozzleIndex}
                            onAddNozzle={props.onAddNozzle}
                            onUpdateNozzle={props.onUpdateNozzle}
                            onRemoveNozzle={props.onRemoveNozzle}
                            onSelectNozzle={props.onSelectNozzle}
                            onAddPipeline={props.onAddPipeline}
                            onAddFreePipeline={props.onAddFreePipeline}
                            onUpdateFreePipelineOrigin={props.onUpdateFreePipelineOrigin}
                            onAddSegment={props.onAddSegment}
                            onUpdateSegment={props.onUpdateSegment}
                            pipeOnly
                            onRemoveSegment={props.onRemoveSegment}
                            onRemovePipeline={props.onRemovePipeline}
                            onSelectPipeSegment={props.onSelectPipeSegment}
                            isOpen={activeSection === 'piping'}
                            onToggle={() => toggle('piping')}
                        />
                    </>
                )}

                {/* ── Vessel mode: full sidebar ── */}
                {!isPipeMode && (
                    <>
                        <ProjectInfoSection
                            vesselState={vesselState}
                            onUpdateDimensions={props.onUpdateDimensions}
                            isOpen={activeSection === 'projectInfo'}
                            onToggle={() => toggle('projectInfo')}
                        />
                        <DimensionsSection
                            vesselState={vesselState}
                            onUpdateDimensions={props.onUpdateDimensions}
                            isOpen={activeSection === 'dimensions'}
                            onToggle={() => toggle('dimensions')}
                        />
                        <VesselDetailsSection
                            vesselState={vesselState}
                            onUpdateDimensions={props.onUpdateDimensions}
                            isOpen={activeSection === 'vesselDetails'}
                            onToggle={() => toggle('vesselDetails')}
                        />
                        <VisualsSection
                            vesselState={vesselState}
                            onUpdateDimensions={props.onUpdateDimensions}
                            isOpen={activeSection === 'visuals'}
                            onToggle={() => toggle('visuals')}
                        />
                        <Section title="Attachments" defaultOpen={false} icon={<GitBranch size={14} style={{ marginRight: 6 }} />} isOpen={activeSection === 'attachments'} onToggle={() => toggle('attachments')} count={
                            vesselState.nozzles.length +
                            vesselState.liftingLugs.length +
                            vesselState.welds.length +
                            vesselState.saddles.length +
                            vesselState.pipelines.length
                        }>
                            <NozzleSection
                                vesselState={vesselState}
                                selectedNozzleIndex={props.selectedNozzleIndex}
                                onAddNozzle={props.onAddNozzle}
                                onUpdateNozzle={props.onUpdateNozzle}
                                onRemoveNozzle={props.onRemoveNozzle}
                                onSelectNozzle={props.onSelectNozzle}
                                isOpen={activeAttachmentSub === 'nozzles'}
                                onToggle={() => toggleAttSub('nozzles')}
                            />
                            <LiftingLugSection
                                vesselState={vesselState}
                                selectedLugIndex={props.selectedLugIndex}
                                onAddLug={props.onAddLug}
                                onUpdateLug={props.onUpdateLug}
                                onRemoveLug={props.onRemoveLug}
                                onSelectLug={props.onSelectLug}
                                isOpen={activeAttachmentSub === 'liftingLugs'}
                                onToggle={() => toggleAttSub('liftingLugs')}
                            />
                            <WeldSection
                                vesselState={vesselState}
                                selectedWeldIndex={props.selectedWeldIndex}
                                onAddWeld={props.onAddWeld}
                                onUpdateWeld={props.onUpdateWeld}
                                onRemoveWeld={props.onRemoveWeld}
                                onSelectWeld={props.onSelectWeld}
                                isOpen={activeAttachmentSub === 'welds'}
                                onToggle={() => toggleAttSub('welds')}
                            />
                            <SaddleSection
                                vesselState={vesselState}
                                selectedSaddleIndex={props.selectedSaddleIndex}
                                onAddSaddle={props.onAddSaddle}
                                onUpdateSaddle={props.onUpdateSaddle}
                                onUpdateAllSaddleHeights={props.onUpdateAllSaddleHeights}
                                onUpdateAllSaddleDepths={props.onUpdateAllSaddleDepths}
                                onRemoveSaddle={props.onRemoveSaddle}
                                onSelectSaddle={props.onSelectSaddle}
                                isOpen={activeAttachmentSub === 'supports'}
                                onToggle={() => toggleAttSub('supports')}
                            />
                            <PipingSection
                                vesselState={vesselState}
                                selectedPipelineId={props.selectedPipelineId}
                                selectedSegmentIdx={props.selectedSegmentIdx}
                                selectedNozzleIndex={props.selectedNozzleIndex}
                                onAddNozzle={props.onAddNozzle}
                                onUpdateNozzle={props.onUpdateNozzle}
                                onRemoveNozzle={props.onRemoveNozzle}
                                onSelectNozzle={props.onSelectNozzle}
                                onAddPipeline={props.onAddPipeline}
                                onAddFreePipeline={props.onAddFreePipeline}
                                onUpdateFreePipelineOrigin={props.onUpdateFreePipelineOrigin}
                                onAddSegment={props.onAddSegment}
                                onUpdateSegment={props.onUpdateSegment}
                                onRemoveSegment={props.onRemoveSegment}
                                onRemovePipeline={props.onRemovePipeline}
                                onSelectPipeSegment={props.onSelectPipeSegment}
                                isOpen={activeAttachmentSub === 'piping'}
                                onToggle={() => toggleAttSub('piping')}
                            />
                        </Section>
                        <Section title="Scan Overlay" defaultOpen={false} icon={<Layers size={14} style={{ marginRight: 6 }} />} isOpen={activeSection === 'scanOverlay'} onToggle={() => toggle('scanOverlay')} count={
                            vesselState.textures.length +
                            vesselState.scanComposites.length +
                            vesselState.domeScanComposites.length
                        }>
                            <ImageOverlaySection
                                vesselState={vesselState}
                                selectedTextureId={props.selectedTextureId}
                                onAddTexture={props.onAddTexture}
                                onUpdateTexture={props.onUpdateTexture}
                                onRemoveTexture={props.onRemoveTexture}
                                onSelectTexture={props.onSelectTexture}
                                getNextTextureId={props.getNextTextureId}
                                renderer={props.renderer}
                                isOpen={activeScanOverlaySub === 'imageOverlays'}
                                onToggle={() => toggleScanSub('imageOverlays')}
                            />
                            <ScanCompositeSection
                                vesselState={vesselState}
                                selectedScanCompositeId={props.selectedScanCompositeId}
                                onSelectScanComposite={props.onSelectScanComposite}
                                onImportComposite={props.onImportComposite}
                                onUpdateScanComposite={props.onUpdateScanComposite}
                                onRemoveScanComposite={props.onRemoveScanComposite}
                                cloudComposites={props.cloudComposites}
                                cloudCompositesLoading={props.cloudCompositesLoading}
                                cloudCompositesError={props.cloudCompositesError}
                                isOpen={activeScanOverlaySub === 'scanComposites'}
                                onToggle={() => toggleScanSub('scanComposites')}
                            />
                            {vesselState.vesselShape !== 'pipe' && (
                                <DomeScanSection
                                    vesselState={vesselState}
                                    selectedDomeScanId={props.selectedDomeScanId}
                                    onSelectDomeScan={props.onSelectDomeScan}
                                    onImportDomeComposite={props.onImportDomeComposite}
                                    onUpdateDomeScan={props.onUpdateDomeScan}
                                    onRemoveDomeScan={props.onRemoveDomeScan}
                                    cloudDomeComposites={props.cloudDomeComposites}
                                    cloudDomeCompositesLoading={props.cloudDomeCompositesLoading}
                                    cloudDomeCompositesError={props.cloudDomeCompositesError}
                                    isOpen={activeScanOverlaySub === 'domeScanComposites'}
                                    onToggle={() => toggleScanSub('domeScanComposites')}
                                />
                            )}
                        </Section>
                        <Section title="Inspection" defaultOpen={false} icon={<ClipboardCheck size={14} style={{ marginRight: 6 }} />} isOpen={activeSection === 'inspection'} onToggle={() => toggle('inspection')} count={
                            vesselState.annotations.length +
                            vesselState.rulers.length +
                            vesselState.coverageRects.length +
                            vesselState.inspectionImages.length
                        }>
                            <AnnotationSection
                                vesselState={vesselState}
                                selectedAnnotationId={props.selectedAnnotationId}
                                drawMode={props.drawMode}
                                onSetDrawMode={props.onSetDrawMode}
                                onAddAnnotation={props.onAddAnnotation}
                                onUpdateAnnotation={props.onUpdateAnnotation}
                                onRemoveAnnotation={props.onRemoveAnnotation}
                                onSelectAnnotation={props.onSelectAnnotation}
                                onUpdateMeasurementConfig={props.onUpdateMeasurementConfig}
                                getNextAnnotationId={props.getNextAnnotationId}
                                onToggleAnnotationVisible={props.onToggleAnnotationVisible}
                                onToggleAnnotationLocked={props.onToggleAnnotationLocked}
                                rulerDrawMode={props.rulerDrawMode}
                                onSetRulerDrawMode={props.onSetRulerDrawMode}
                                onRemoveRuler={props.onRemoveRuler}
                                onUpdateRuler={props.onUpdateRuler}
                                selectedRulerId={props.selectedRulerId}
                                onSelectRuler={props.onSelectRuler}
                                onUpdateThicknessThresholds={props.onUpdateThicknessThresholds}
                                projectImages={props.projectImages}
                                isOpen={activeInspectionSub === 'annotations'}
                                onToggle={() => toggleInspSub('annotations')}
                            />
                            <WallLossConfigSection
                                config={vesselState.wallLossGroups}
                                onUpdate={props.onUpdateWallLossGroups}
                                corrosionAllowance={vesselState.corrosionAllowance}
                                shellNominalThickness={vesselState.shellNominalThickness}
                                domeNominalThickness={vesselState.domeNominalThickness}
                            />
                            <CoverageSection
                                vesselState={vesselState}
                                coverageDrawMode={props.coverageDrawMode}
                                onSetCoverageDrawMode={props.onSetCoverageDrawMode}
                                onAddCoverageRect={props.onAddCoverageRect}
                                onUpdateCoverageRect={props.onUpdateCoverageRect}
                                onRemoveCoverageRect={props.onRemoveCoverageRect}
                                onSelectCoverageRect={props.onSelectCoverageRect}
                                selectedCoverageRectId={props.selectedCoverageRectId}
                                getNextCoverageRectId={props.getNextCoverageRectId}
                                isOpen={activeInspectionSub === 'coverage'}
                                onToggle={() => toggleInspSub('coverage')}
                            />
                            <InspectionImageSection
                                vesselState={vesselState}
                                selectedInspectionImageId={props.selectedInspectionImageId}
                                onAddInspectionImage={props.onAddInspectionImage}
                                onUpdateInspectionImage={props.onUpdateInspectionImage}
                                onRemoveInspectionImage={props.onRemoveInspectionImage}
                                onSelectInspectionImage={props.onSelectInspectionImage}
                                onToggleInspectionImageVisible={props.onToggleInspectionImageVisible}
                                onToggleInspectionImageLocked={props.onToggleInspectionImageLocked}
                                onViewInspectionImage={props.onViewInspectionImage}
                                getNextInspectionImageId={props.getNextInspectionImageId}
                                projectImages={props.projectImages}
                                isOpen={activeInspectionSub === 'inspectionImages'}
                                onToggle={() => toggleInspSub('inspectionImages')}
                            />
                            <ReportExportSection
                                vesselState={vesselState}
                                onUpdateAnnotation={props.onUpdateAnnotation}
                                onGenerateReport={props.onGenerateReport}
                                isOpen={activeInspectionSub === 'reportExport'}
                                onToggle={() => toggleInspSub('reportExport')}
                            />
                        </Section>
                    </>
                )}

                {/* Sections available in both modes */}
                {isPipeMode && (
                    <>
                        <VisualsSection
                            vesselState={vesselState}
                            onUpdateDimensions={props.onUpdateDimensions}
                            isOpen={activeSection === 'visuals'}
                            onToggle={() => toggle('visuals')}
                        />
                        <Section title="Scan Overlay" defaultOpen={false} icon={<Layers size={14} style={{ marginRight: 6 }} />} isOpen={activeSection === 'scanOverlay'} onToggle={() => toggle('scanOverlay')} count={
                            vesselState.textures.length +
                            vesselState.scanComposites.length
                        }>
                            <ImageOverlaySection
                                vesselState={vesselState}
                                selectedTextureId={props.selectedTextureId}
                                onAddTexture={props.onAddTexture}
                                onUpdateTexture={props.onUpdateTexture}
                                onRemoveTexture={props.onRemoveTexture}
                                onSelectTexture={props.onSelectTexture}
                                getNextTextureId={props.getNextTextureId}
                                renderer={props.renderer}
                                isOpen={activeScanOverlaySub === 'imageOverlays'}
                                onToggle={() => toggleScanSub('imageOverlays')}
                            />
                            <ScanCompositeSection
                                vesselState={vesselState}
                                selectedScanCompositeId={props.selectedScanCompositeId}
                                onSelectScanComposite={props.onSelectScanComposite}
                                onImportComposite={props.onImportComposite}
                                onUpdateScanComposite={props.onUpdateScanComposite}
                                onRemoveScanComposite={props.onRemoveScanComposite}
                                cloudComposites={props.cloudComposites}
                                cloudCompositesLoading={props.cloudCompositesLoading}
                                cloudCompositesError={props.cloudCompositesError}
                                isOpen={activeScanOverlaySub === 'scanComposites'}
                                onToggle={() => toggleScanSub('scanComposites')}
                            />
                        </Section>
                        <Section title="Inspection" defaultOpen={false} icon={<ClipboardCheck size={14} style={{ marginRight: 6 }} />} isOpen={activeSection === 'inspection'} onToggle={() => toggle('inspection')} count={
                            vesselState.annotations.length +
                            vesselState.rulers.length +
                            vesselState.coverageRects.length +
                            vesselState.inspectionImages.length
                        }>
                            <AnnotationSection
                                vesselState={vesselState}
                                selectedAnnotationId={props.selectedAnnotationId}
                                drawMode={props.drawMode}
                                onSetDrawMode={props.onSetDrawMode}
                                onAddAnnotation={props.onAddAnnotation}
                                onUpdateAnnotation={props.onUpdateAnnotation}
                                onRemoveAnnotation={props.onRemoveAnnotation}
                                onSelectAnnotation={props.onSelectAnnotation}
                                onUpdateMeasurementConfig={props.onUpdateMeasurementConfig}
                                getNextAnnotationId={props.getNextAnnotationId}
                                onToggleAnnotationVisible={props.onToggleAnnotationVisible}
                                onToggleAnnotationLocked={props.onToggleAnnotationLocked}
                                rulerDrawMode={props.rulerDrawMode}
                                onSetRulerDrawMode={props.onSetRulerDrawMode}
                                onRemoveRuler={props.onRemoveRuler}
                                onUpdateRuler={props.onUpdateRuler}
                                selectedRulerId={props.selectedRulerId}
                                onSelectRuler={props.onSelectRuler}
                                onUpdateThicknessThresholds={props.onUpdateThicknessThresholds}
                                projectImages={props.projectImages}
                                isOpen={activeInspectionSub === 'annotations'}
                                onToggle={() => toggleInspSub('annotations')}
                            />
                            <WallLossConfigSection
                                config={vesselState.wallLossGroups}
                                onUpdate={props.onUpdateWallLossGroups}
                                corrosionAllowance={vesselState.corrosionAllowance}
                                shellNominalThickness={vesselState.shellNominalThickness}
                                domeNominalThickness={vesselState.domeNominalThickness}
                            />
                            <CoverageSection
                                vesselState={vesselState}
                                coverageDrawMode={props.coverageDrawMode}
                                onSetCoverageDrawMode={props.onSetCoverageDrawMode}
                                onAddCoverageRect={props.onAddCoverageRect}
                                onUpdateCoverageRect={props.onUpdateCoverageRect}
                                onRemoveCoverageRect={props.onRemoveCoverageRect}
                                onSelectCoverageRect={props.onSelectCoverageRect}
                                selectedCoverageRectId={props.selectedCoverageRectId}
                                getNextCoverageRectId={props.getNextCoverageRectId}
                                isOpen={activeInspectionSub === 'coverage'}
                                onToggle={() => toggleInspSub('coverage')}
                            />
                            <InspectionImageSection
                                vesselState={vesselState}
                                selectedInspectionImageId={props.selectedInspectionImageId}
                                onAddInspectionImage={props.onAddInspectionImage}
                                onUpdateInspectionImage={props.onUpdateInspectionImage}
                                onRemoveInspectionImage={props.onRemoveInspectionImage}
                                onSelectInspectionImage={props.onSelectInspectionImage}
                                onToggleInspectionImageVisible={props.onToggleInspectionImageVisible}
                                onToggleInspectionImageLocked={props.onToggleInspectionImageLocked}
                                onViewInspectionImage={props.onViewInspectionImage}
                                getNextInspectionImageId={props.getNextInspectionImageId}
                                projectImages={props.projectImages}
                                isOpen={activeInspectionSub === 'inspectionImages'}
                                onToggle={() => toggleInspSub('inspectionImages')}
                            />
                            <ReportExportSection
                                vesselState={vesselState}
                                onUpdateAnnotation={props.onUpdateAnnotation}
                                onGenerateReport={props.onGenerateReport}
                                isOpen={activeInspectionSub === 'reportExport'}
                                onToggle={() => toggleInspSub('reportExport')}
                            />
                        </Section>
                    </>
                )}
            </div>
        </div>
    );
}
