import { useQuery } from '@tanstack/react-query';

export interface CalibrationStep {
    nominalMm: number;
    measuredMm: number;
    stdMm: number;
    readingCount: number;
    isReference: boolean;
}

export interface CompanionCalibrationFile {
    filename: string;
    setupFile: string;
    calDate: string | null;
    scanStartMm: number;
    scanEndMm: number;
    velocity: number;
    refAWt: number | null;
    measAWt: number | null;
    equipment: { model: string; serial: string } | null;
    probe: { model: string; frequencyMhz: number } | null;
    wedge: { model: string } | null;
    material: string | null;
    beamCount: number;
    steps: CalibrationStep[];
}

export function useCompanionCalibrationFiles(port: number | null) {
    return useQuery({
        queryKey: ['companion-calibration-files', port],
        queryFn: async (): Promise<CompanionCalibrationFile[]> => {
            if (!port) return [];
            try {
                const res = await fetch(`http://localhost:${port}/calibration-files`);
                if (!res.ok) return [];
                const data = await res.json();
                return data.files ?? [];
            } catch {
                return [];
            }
        },
        enabled: !!port,
        retry: false,
        staleTime: 30_000,
        refetchInterval: 30_000,
    });
}
