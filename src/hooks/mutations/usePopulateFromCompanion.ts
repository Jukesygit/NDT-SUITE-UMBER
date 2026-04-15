/**
 * Hook to populate inspection project forms from companion app NDE file metadata.
 *
 * Reads equipment, specimen, and scan data from companion files and writes them
 * into the project vessel, scan log, and calibration log — skipping any fields
 * or entries that already have values.
 */

import { useCallback, useState } from 'react';
import { useCompanionApp } from '../queries/useCompanionApp';
import { useCompanionFiles } from '../queries/useCompanionFiles';
import {
    useUpdateProjectVessel,
    useCreateScanLogEntry,
    useCreateCalibrationLogEntry,
} from './useInspectionProjectMutations';
import type {
    ProjectVessel,
    VesselEquipmentConfig,
    UpdateVesselParams,
    ScanLogEntry,
    CalibrationLogEntry,
} from '../../types/inspection-project';

interface PopulateResult {
    equipmentUpdated: boolean;
    vesselDetailsUpdated: boolean;
    scanLogAdded: number;
    calLogAdded: number;
    skipped: number;
}

function formatNdeDate(iso: string | null): string | null {
    if (!iso) return null;
    try {
        return new Date(iso).toISOString().split('T')[0];
    } catch {
        return null;
    }
}

function parseDatumFromFilename(filename: string): string | null {
    const match = filename.match(/\s(\d+)-(\d+)[_\s]/);
    return match ? match[1] : null;
}

export function usePopulateFromCompanion() {
    const { connected, port } = useCompanionApp();
    const { data: companionFiles } = useCompanionFiles(port);
    const updateVessel = useUpdateProjectVessel();
    const createScanEntry = useCreateScanLogEntry();
    const createCalEntry = useCreateCalibrationLogEntry();
    const [populating, setPopulating] = useState(false);

    const populate = useCallback(async (
        vessel: ProjectVessel,
        projectId: string,
        existingScanEntries: ScanLogEntry[],
        existingCalEntries: CalibrationLogEntry[],
    ): Promise<PopulateResult> => {
        if (!companionFiles || companionFiles.length === 0) {
            throw new Error('No NDE files available from companion app');
        }

        setPopulating(true);
        const result: PopulateResult = {
            equipmentUpdated: false,
            vesselDetailsUpdated: false,
            scanLogAdded: 0,
            calLogAdded: 0,
            skipped: 0,
        };

        try {
            const ref = companionFiles[0];

            // --- Equipment Config ---
            const equipmentConfig: VesselEquipmentConfig = { ...vessel.equipment_config };
            let equipmentChanged = false;

            if (ref.equipment && !equipmentConfig.model) {
                equipmentConfig.model = ref.equipment.model;
                equipmentChanged = true;
            }
            if (ref.equipment && !equipmentConfig.serial_no) {
                equipmentConfig.serial_no = ref.equipment.serialNumber;
                equipmentChanged = true;
            }
            if (ref.probe && !equipmentConfig.probe) {
                equipmentConfig.probe = ref.probe.model;
                equipmentChanged = true;
            }
            if (ref.wedge && !equipmentConfig.wedge) {
                equipmentConfig.wedge = ref.wedge.model;
                equipmentChanged = true;
            }
            if (ref.scanner && !equipmentConfig.scanner_frame) {
                equipmentConfig.scanner_frame = ref.scanner.name;
                equipmentChanged = true;
            }

            // --- Vessel Details ---
            const vesselUpdates: UpdateVesselParams = {};
            if (ref.specimen && !vessel.material) {
                vesselUpdates.material = ref.specimen.materialName;
            }
            if (ref.specimen && !vessel.nominal_thickness) {
                vesselUpdates.nominalThickness = `${ref.specimen.nominalThicknessMm} mm`;
            }
            const vesselDetailsChanged = Object.keys(vesselUpdates).length > 0;

            if (equipmentChanged || vesselDetailsChanged) {
                await updateVessel.mutateAsync({
                    id: vessel.id,
                    projectId,
                    params: {
                        ...(equipmentChanged ? { equipmentConfig } : {}),
                        ...vesselUpdates,
                    },
                });
                result.equipmentUpdated = equipmentChanged;
                result.vesselDetailsUpdated = vesselDetailsChanged;
            }

            // --- Scan Log Entries ---
            const existingScanFilenames = new Set(
                existingScanEntries.map(e => e.filename?.toLowerCase()).filter(Boolean)
            );

            for (let i = 0; i < companionFiles.length; i++) {
                const file = companionFiles[i];
                if (existingScanFilenames.has(file.filename.toLowerCase())) {
                    result.skipped++;
                    continue;
                }

                await createScanEntry.mutateAsync({
                    projectVesselId: vessel.id,
                    filename: file.filename,
                    dateInspected: formatNdeDate(file.creationDate) ?? undefined,
                    scanStartX: file.scanRangeMm[0],
                    scanEndX: file.scanRangeMm[1],
                    indexStartY: file.indexRangeMm[0],
                    indexEndY: file.indexRangeMm[1],
                    scanIndexDatum: parseDatumFromFilename(file.filename) ?? undefined,
                    sortOrder: existingScanEntries.length + result.scanLogAdded,
                });
                result.scanLogAdded++;
            }

            // --- Calibration Log ---
            const existingCalVelocities = new Set(
                existingCalEntries.map(e => e.velocity).filter(v => v != null)
            );
            const velocity = ref.velocity;

            if (velocity && !existingCalVelocities.has(velocity)) {
                await createCalEntry.mutateAsync({
                    projectVesselId: vessel.id,
                    filename: ref.filename,
                    velocity,
                    calDate: formatNdeDate(ref.creationDate) ?? undefined,
                    scanStart: `${ref.scanRangeMm[0]}`,
                    scanEnd: `${ref.scanRangeMm[1]}`,
                    sortOrder: existingCalEntries.length,
                });
                result.calLogAdded++;
            }

            return result;
        } finally {
            setPopulating(false);
        }
    }, [companionFiles, updateVessel, createScanEntry, createCalEntry]);

    return {
        populate,
        populating,
        connected,
        fileCount: companionFiles?.length ?? 0,
    };
}
