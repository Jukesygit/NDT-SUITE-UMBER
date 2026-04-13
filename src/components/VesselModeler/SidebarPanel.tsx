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
    ThicknessThresholds,
    PipeSegmentType,
} from './types';
import type { PipeSegment } from './types';
import { useState, useCallback } from 'react';
import { GitBranch, Layers, ClipboardCheck } from 'lucide-react';
import type * as THREE from 'three';
import {
    Section,
    DimensionsSection,
    VisualsSection,
    NozzleSection,
    LiftingLugSection,
    WeldSection,
    SaddleSection,
    ImageOverlaySection,
    ScanCompositeSection,
    AnnotationSection,
    CoverageSection,
    InspectionImageSection,
    ProjectInfoSection,
    PipingSection,
    ReportExportSection,
} from './sidebar';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SidebarPanelProps {
    vesselState: VesselState;
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
    onUpdateThicknessThresholds: (thresholds: ThicknessThresholds) => void;
    // Pipeline props
    selectedPipelineId: string;
    selectedSegmentIdx: number;
    onAddPipeline: (nozzleIndex: number, segmentType: PipeSegmentType) => void;
    onAddSegment: (pipelineId: string, segmentType: PipeSegmentType) => void;
    onUpdateSegment: (pipelineId: string, segmentId: string, updates: Partial<PipeSegment>) => void;
    onRemoveSegment: (pipelineId: string, segmentIndex: number) => void;
    onRemovePipeline: (pipelineId: string) => void;
    onSelectPipeSegment: (pipelineId: string, segmentIndex: number) => void;
    // Report generation
    onGenerateReport: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// SidebarPanel - Orchestrator
// ---------------------------------------------------------------------------

export default function SidebarPanel(props: SidebarPanelProps) {
    const { vesselState } = props;

    // Accordion: only one parent section open at a time. Default to Project Info.
    const [openSection, setOpenSection] = useState<string>('project-info');
    const toggle = useCallback((id: string) => {
        setOpenSection(prev => prev === id ? '' : id);
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Title */}
            <div style={{ padding: '12px 15px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <h2 style={{ margin: 0, fontSize: '1rem', color: 'white', fontWeight: 600 }}>
                    Vessel Modeler
                </h2>
            </div>

            {/* Scrollable sections */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                <ProjectInfoSection
                    vesselState={vesselState}
                    onUpdateDimensions={props.onUpdateDimensions}
                    open={openSection === 'project-info'}
                    onToggle={() => toggle('project-info')}
                />
                <DimensionsSection
                    vesselState={vesselState}
                    onUpdateDimensions={props.onUpdateDimensions}
                    open={openSection === 'dimensions'}
                    onToggle={() => toggle('dimensions')}
                />
                <VisualsSection
                    vesselState={vesselState}
                    onUpdateDimensions={props.onUpdateDimensions}
                    open={openSection === 'visuals'}
                    onToggle={() => toggle('visuals')}
                />
                <Section title="Attachments" icon={<GitBranch size={14} style={{ marginRight: 6 }} />} open={openSection === 'attachments'} onToggle={() => toggle('attachments')} count={
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
                    />
                    <LiftingLugSection
                        vesselState={vesselState}
                        selectedLugIndex={props.selectedLugIndex}
                        onAddLug={props.onAddLug}
                        onUpdateLug={props.onUpdateLug}
                        onRemoveLug={props.onRemoveLug}
                        onSelectLug={props.onSelectLug}
                    />
                    <WeldSection
                        vesselState={vesselState}
                        selectedWeldIndex={props.selectedWeldIndex}
                        onAddWeld={props.onAddWeld}
                        onUpdateWeld={props.onUpdateWeld}
                        onRemoveWeld={props.onRemoveWeld}
                        onSelectWeld={props.onSelectWeld}
                    />
                    <SaddleSection
                        vesselState={vesselState}
                        selectedSaddleIndex={props.selectedSaddleIndex}
                        onAddSaddle={props.onAddSaddle}
                        onUpdateSaddle={props.onUpdateSaddle}
                        onUpdateAllSaddleHeights={props.onUpdateAllSaddleHeights}
                        onRemoveSaddle={props.onRemoveSaddle}
                        onSelectSaddle={props.onSelectSaddle}
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
                        onAddSegment={props.onAddSegment}
                        onUpdateSegment={props.onUpdateSegment}
                        onRemoveSegment={props.onRemoveSegment}
                        onRemovePipeline={props.onRemovePipeline}
                        onSelectPipeSegment={props.onSelectPipeSegment}
                    />
                </Section>
                <Section title="Scan Overlay" icon={<Layers size={14} style={{ marginRight: 6 }} />} open={openSection === 'scan-overlay'} onToggle={() => toggle('scan-overlay')} count={
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
                    />
                </Section>
                <Section title="Inspection" icon={<ClipboardCheck size={14} style={{ marginRight: 6 }} />} open={openSection === 'inspection'} onToggle={() => toggle('inspection')} count={
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
                    />
                    <ReportExportSection
                        vesselState={vesselState}
                        onUpdateAnnotation={props.onUpdateAnnotation}
                        onGenerateReport={props.onGenerateReport}
                    />
                </Section>
            </div>
        </div>
    );
}
