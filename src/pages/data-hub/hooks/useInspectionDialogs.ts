/**
 * useInspectionDialogs - Manages dialog state for InspectionPage
 * Extracts dialog logic to keep the page component focused
 */

import { useState, useCallback } from 'react';
import type { Scan, VesselImage } from '../../../hooks/queries/useDataHub';

type DrawingType = 'location' | 'ga';

interface DialogState {
    strakeManagement: boolean;
    imageUpload: boolean;
    drawingUpload: DrawingType | null;
    drawingAnnotation: DrawingType | null;
    scanReassign: Scan | null;
    imageLightbox: { images: VesselImage[]; initialIndex: number } | null;
}

const initialState: DialogState = {
    strakeManagement: false,
    imageUpload: false,
    drawingUpload: null,
    drawingAnnotation: null,
    scanReassign: null,
    imageLightbox: null,
};

export function useInspectionDialogs() {
    const [dialogs, setDialogs] = useState<DialogState>(initialState);

    // Strake Management Dialog
    const openStrakeManagement = useCallback(() => {
        setDialogs(prev => ({ ...prev, strakeManagement: true }));
    }, []);

    const closeStrakeManagement = useCallback(() => {
        setDialogs(prev => ({ ...prev, strakeManagement: false }));
    }, []);

    // Image Upload Dialog
    const openImageUpload = useCallback(() => {
        setDialogs(prev => ({ ...prev, imageUpload: true }));
    }, []);

    const closeImageUpload = useCallback(() => {
        setDialogs(prev => ({ ...prev, imageUpload: false }));
    }, []);

    // Drawing Upload Dialog
    const openDrawingUpload = useCallback((type: DrawingType) => {
        setDialogs(prev => ({ ...prev, drawingUpload: type }));
    }, []);

    const closeDrawingUpload = useCallback(() => {
        setDialogs(prev => ({ ...prev, drawingUpload: null }));
    }, []);

    // Drawing Annotation Dialog
    const openDrawingAnnotation = useCallback((type: DrawingType) => {
        setDialogs(prev => ({ ...prev, drawingAnnotation: type }));
    }, []);

    const closeDrawingAnnotation = useCallback(() => {
        setDialogs(prev => ({ ...prev, drawingAnnotation: null }));
    }, []);

    // Scan Reassign Dialog
    const openScanReassign = useCallback((scan: Scan) => {
        setDialogs(prev => ({ ...prev, scanReassign: scan }));
    }, []);

    const closeScanReassign = useCallback(() => {
        setDialogs(prev => ({ ...prev, scanReassign: null }));
    }, []);

    // Image Lightbox
    const openImageLightbox = useCallback((images: VesselImage[], initialIndex: number = 0) => {
        setDialogs(prev => ({ ...prev, imageLightbox: { images, initialIndex } }));
    }, []);

    const closeImageLightbox = useCallback(() => {
        setDialogs(prev => ({ ...prev, imageLightbox: null }));
    }, []);

    return {
        dialogs,

        // Strake Management
        openStrakeManagement,
        closeStrakeManagement,

        // Image Upload
        openImageUpload,
        closeImageUpload,

        // Drawing Upload
        openDrawingUpload,
        closeDrawingUpload,

        // Drawing Annotation
        openDrawingAnnotation,
        closeDrawingAnnotation,

        // Scan Reassign
        openScanReassign,
        closeScanReassign,

        // Image Lightbox
        openImageLightbox,
        closeImageLightbox,
    };
}

export type UseInspectionDialogsReturn = ReturnType<typeof useInspectionDialogs>;
