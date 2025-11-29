/**
 * InspectionPage - Full inspection workflow for a vessel
 * Displays scans, strakes, drawings, and images with full dialog support
 */

import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createModernHeader } from '../../components/modern-header.js';
import { MatrixLogoRacer } from '../../components/MatrixLogoLoader';
import { assetService } from '../../services/asset-service.js';
import {
    useVesselScans,
    useVesselStrakes,
    useVesselImages,
    type Scan,
    type VesselImage,
} from '../../hooks/queries/useDataHub';
import {
    useDeleteScan,
    useDeleteVesselImage,
    useRenameVesselImage,
    useCreateStrake,
    useUpdateStrake,
    useDeleteStrake,
    useUpdateScan,
    useUploadVesselImages,
    useUploadDrawing,
    useUpdateDrawingAnnotations,
    useRemoveDrawing,
} from '../../hooks/mutations/useInspectionMutations';
import { useInspectionDialogs } from './hooks/useInspectionDialogs';

// Components
import ScansGrid from './components/ScansGrid';
import VesselImagesSection from './components/VesselImagesSection';
import DrawingsSection from './components/DrawingsSection';

// Dialogs
import StrakeManagementDialog from './components/StrakeManagementDialog';
import ImageUploadDialog from './components/ImageUploadDialog';
import DrawingUploadDialog from './components/DrawingUploadDialog';
import DrawingAnnotationDialog from './components/DrawingAnnotationDialog';
import ScanReassignDialog from './components/ScanReassignDialog';
import ImageLightbox from './components/ImageLightbox';

interface VesselWithDrawings {
    id: string;
    name: string;
    asset_id: string;
    location_drawing?: { image_url: string; annotations?: Array<{ id: string; type: 'marker' | 'box'; x: number; y: number; width?: number; height?: number; label: string }>; comment?: string } | null;
    ga_drawing?: { image_url: string; annotations?: Array<{ id: string; type: 'marker' | 'box'; x: number; y: number; width?: number; height?: number; label: string }>; comment?: string } | null;
}

export default function InspectionPage() {
    const { assetId, vesselId } = useParams<{ assetId: string; vesselId: string }>();
    const navigate = useNavigate();
    const dialogState = useInspectionDialogs();

    // Fetch vessel with drawings
    const { data: vessel, isLoading: vesselLoading } = useQuery({
        queryKey: ['vessel-details', vesselId],
        queryFn: async (): Promise<VesselWithDrawings | null> => {
            if (!vesselId) return null;
            return await assetService.getVesselWithDrawings(vesselId);
        },
        enabled: !!vesselId,
    });

    // Fetch parent asset
    const { data: asset, isLoading: assetLoading } = useQuery({
        queryKey: ['asset', assetId],
        queryFn: async () => assetId ? await assetService.getAsset(assetId) : null,
        enabled: !!assetId,
    });

    // Fetch scans, strakes, and images
    const { data: scans = [], isLoading: scansLoading } = useVesselScans(vesselId || null);
    const { data: strakes = [], isLoading: strakesLoading } = useVesselStrakes(vesselId || null);
    const { data: images = [], isLoading: imagesLoading } = useVesselImages(vesselId || null);

    // Mutations
    const deleteScan = useDeleteScan();
    const deleteImage = useDeleteVesselImage();
    const renameImage = useRenameVesselImage();
    const createStrake = useCreateStrake();
    const updateStrake = useUpdateStrake();
    const deleteStrake = useDeleteStrake();
    const updateScan = useUpdateScan();
    const uploadImages = useUploadVesselImages();
    const uploadDrawing = useUploadDrawing();
    const updateAnnotations = useUpdateDrawingAnnotations();
    const removeDrawing = useRemoveDrawing();

    // Initialize modern header
    useEffect(() => {
        const container = document.getElementById('inspection-header');
        if (container && container.children.length === 0) {
            const header = createModernHeader('Inspection', vessel?.name ? `Inspecting ${vessel.name}` : 'Loading...', {
                showParticles: true, particleCount: 15, gradientColors: ['#f59e0b', '#ef4444'], height: '80px', showLogo: false
            });
            container.appendChild(header);
        }
    }, [vessel?.name]);

    // Scan handlers
    const handleScanClick = (scan: Scan) => {
        const routes: Record<string, string> = { pec: '/pec-visualizer', cscan: '/cscan-visualizer', '3dview': '/3d-viewer' };
        const route = routes[scan.tool_type];
        if (route) navigate(`${route}?scanId=${scan.id}&vesselId=${vesselId}&assetId=${assetId}`);
    };

    const handleDeleteScan = async (scan: Scan) => {
        if (!confirm(`Delete scan "${scan.name}"?`) || !vesselId) return;
        await deleteScan.mutateAsync({ scanId: scan.id, vesselId });
    };

    const handleReassignScan = async (scanId: string, strakeId: string | null) => {
        if (!vesselId) return;
        await updateScan.mutateAsync({ scanId, vesselId, updates: { strake_id: strakeId } });
    };

    // Image handlers
    const handleViewImage = (image: VesselImage) => {
        const index = images.findIndex(i => i.id === image.id);
        dialogState.openImageLightbox(images, index);
    };

    const handleRenameImage = async (image: VesselImage) => {
        const newName = prompt('Enter new name:', image.name);
        if (newName && newName !== image.name && vesselId) {
            await renameImage.mutateAsync({ imageId: image.id, vesselId, newName });
        }
    };

    const handleDeleteImage = async (image: VesselImage) => {
        if (!confirm(`Delete image "${image.name}"?`) || !vesselId) return;
        await deleteImage.mutateAsync({ imageId: image.id, vesselId });
    };

    const handleUploadImages = async (files: File[]) => {
        if (!vesselId) return;
        await uploadImages.mutateAsync({ vesselId, files });
    };

    // Drawing handlers
    const handleUploadDrawing = async (file: File) => {
        if (!vesselId || !dialogState.dialogs.drawingUpload) return;
        await uploadDrawing.mutateAsync({ vesselId, drawingType: dialogState.dialogs.drawingUpload, file });
    };

    const handleSaveAnnotations = async (annotations: Array<{ id: string; type: 'marker' | 'box'; x: number; y: number; width?: number; height?: number; label: string }>, comment: string) => {
        if (!vesselId || !dialogState.dialogs.drawingAnnotation) return;
        await updateAnnotations.mutateAsync({ vesselId, drawingType: dialogState.dialogs.drawingAnnotation, annotations, comment });
    };

    const handleRemoveDrawing = async (type: 'location' | 'ga') => {
        if (!confirm(`Remove ${type} drawing?`) || !vesselId) return;
        await removeDrawing.mutateAsync({ vesselId, drawingType: type });
    };

    // Strake handlers
    const handleCreateStrake = async (data: { name: string; totalArea: number; requiredCoverage: number }) => {
        if (vesselId) await createStrake.mutateAsync({ vesselId, data });
    };

    const handleUpdateStrake = async (strakeId: string, updates: { name?: string; total_area?: number; required_coverage?: number }) => {
        if (vesselId) await updateStrake.mutateAsync({ strakeId, vesselId, updates });
    };

    const handleDeleteStrake = async (strakeId: string) => {
        if (vesselId) await deleteStrake.mutateAsync({ strakeId, vesselId });
    };

    // Loading state
    const isLoading = vesselLoading || assetLoading || scansLoading || strakesLoading || imagesLoading;
    if (isLoading) {
        return (
            <div className="h-full flex flex-col">
                <div id="inspection-header" style={{ flexShrink: 0 }}></div>
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <MatrixLogoRacer size={160} duration={4} />
                    <div className="text-gray-400 animate-pulse">Loading inspection data...</div>
                </div>
            </div>
        );
    }

    const locationDrawing = vessel?.location_drawing || null;
    const gaDrawing = vessel?.ga_drawing || null;

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div id="inspection-header" style={{ flexShrink: 0 }}></div>

            {/* Breadcrumb + Actions Bar */}
            <div className="flex items-center justify-between px-6 py-3" style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div className="flex items-center text-sm">
                    <button onClick={() => navigate('/')} className="hover:underline" style={{ color: 'var(--accent-primary)' }}>Data Hub</button>
                    <span style={{ margin: '0 8px', color: 'rgba(255, 255, 255, 0.3)' }}>/</span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>{asset?.name}</span>
                    <span style={{ margin: '0 8px', color: 'rgba(255, 255, 255, 0.3)' }}>/</span>
                    <button onClick={() => navigate(`/vessel/${assetId}/${vesselId}`)} className="hover:underline" style={{ color: 'var(--accent-primary)' }}>{vessel?.name}</button>
                    <span style={{ margin: '0 8px', color: 'rgba(255, 255, 255, 0.3)' }}>/</span>
                    <span style={{ color: 'var(--text-primary)' }}>Inspection</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span><strong style={{ color: 'var(--text-primary)' }}>{scans.length}</strong> scans</span>
                        <span><strong style={{ color: 'var(--text-primary)' }}>{images.length}</strong> images</span>
                        {strakes.length > 0 && <span><strong style={{ color: 'var(--text-primary)' }}>{strakes.length}</strong> strakes</span>}
                    </div>
                    <button className="btn btn-primary text-xs flex items-center" style={{ gap: '6px', padding: '8px 14px' }} onClick={() => alert('Report generation coming soon')}>
                        <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Generate Report
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto glass-scrollbar p-6">
                <div className="grid grid-cols-1 lg:grid-cols-5" style={{ gap: 'var(--spacing-lg)' }}>
                    <div className="lg:col-span-2 order-2 lg:order-1">
                        <ScansGrid scans={scans} strakes={strakes} onScanClick={handleScanClick} onDeleteScan={handleDeleteScan} onReassignScan={(scan) => dialogState.openScanReassign(scan)} onAddScans={() => alert('Scan upload coming soon')} onManageStrakes={dialogState.openStrakeManagement} />
                    </div>
                    <div className="lg:col-span-3 order-1 lg:order-2" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                        <DrawingsSection locationDrawing={locationDrawing} gaDrawing={gaDrawing} onUploadLocation={() => dialogState.openDrawingUpload('location')} onUploadGA={() => dialogState.openDrawingUpload('ga')} onAnnotateLocation={() => locationDrawing && dialogState.openDrawingAnnotation('location')} onAnnotateGA={() => gaDrawing && dialogState.openDrawingAnnotation('ga')} onRemoveLocation={() => handleRemoveDrawing('location')} onRemoveGA={() => handleRemoveDrawing('ga')} onViewDrawing={(type) => window.open(type === 'location' ? locationDrawing?.image_url : gaDrawing?.image_url, '_blank')} />
                        <VesselImagesSection images={images} onUploadImage={dialogState.openImageUpload} onViewImage={handleViewImage} onRenameImage={handleRenameImage} onDeleteImage={handleDeleteImage} />
                    </div>
                </div>
            </div>

            {/* Dialogs */}
            <StrakeManagementDialog isOpen={dialogState.dialogs.strakeManagement} onClose={dialogState.closeStrakeManagement} vesselName={vessel?.name || ''} strakes={strakes} scans={scans} onCreateStrake={handleCreateStrake} onUpdateStrake={handleUpdateStrake} onDeleteStrake={handleDeleteStrake} />

            <ImageUploadDialog isOpen={dialogState.dialogs.imageUpload} onClose={dialogState.closeImageUpload} vesselName={vessel?.name || ''} onUpload={handleUploadImages} />

            {dialogState.dialogs.drawingUpload && (
                <DrawingUploadDialog isOpen={true} onClose={dialogState.closeDrawingUpload} drawingType={dialogState.dialogs.drawingUpload} vesselName={vessel?.name || ''} onUpload={handleUploadDrawing} />
            )}

            {dialogState.dialogs.drawingAnnotation && (dialogState.dialogs.drawingAnnotation === 'location' ? locationDrawing : gaDrawing) && (
                <DrawingAnnotationDialog isOpen={true} onClose={dialogState.closeDrawingAnnotation} drawingType={dialogState.dialogs.drawingAnnotation} vesselName={vessel?.name || ''} drawing={(dialogState.dialogs.drawingAnnotation === 'location' ? locationDrawing : gaDrawing)!} onSave={handleSaveAnnotations} />
            )}

            {dialogState.dialogs.scanReassign && (
                <ScanReassignDialog isOpen={true} onClose={dialogState.closeScanReassign} scan={dialogState.dialogs.scanReassign} strakes={strakes} onReassign={handleReassignScan} />
            )}

            {dialogState.dialogs.imageLightbox && (
                <ImageLightbox isOpen={true} onClose={dialogState.closeImageLightbox} images={dialogState.dialogs.imageLightbox.images} initialIndex={dialogState.dialogs.imageLightbox.initialIndex} />
            )}
        </div>
    );
}
