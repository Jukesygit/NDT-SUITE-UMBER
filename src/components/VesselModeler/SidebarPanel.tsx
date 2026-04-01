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
} from './types';
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
}

// ---------------------------------------------------------------------------
// SidebarPanel - Orchestrator
// ---------------------------------------------------------------------------

export default function SidebarPanel(props: SidebarPanelProps) {
    const { vesselState } = props;

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
                <DimensionsSection
                    vesselState={vesselState}
                    onUpdateDimensions={props.onUpdateDimensions}
                />
                <VisualsSection
                    vesselState={vesselState}
                    onUpdateDimensions={props.onUpdateDimensions}
                />
                <Section title="Attachments" defaultOpen={false} count={
                    vesselState.nozzles.length +
                    vesselState.liftingLugs.length +
                    vesselState.welds.length +
                    vesselState.saddles.length
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
                        onRemoveSaddle={props.onRemoveSaddle}
                        onSelectSaddle={props.onSelectSaddle}
                    />
                </Section>
                <Section title="Scan Overlay" defaultOpen={false} count={
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
                <Section title="Inspection" defaultOpen={false} count={
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
                </Section>
            </div>
        </div>
    );
}
