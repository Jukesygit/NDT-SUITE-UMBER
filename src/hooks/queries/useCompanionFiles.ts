import { useQuery } from '@tanstack/react-query';

interface CompanionFileGate {
  id: number;
  name: string;
  detection: string;
}

interface CompanionFileProbe {
  model: string;
  serie: string;
  frequencyMhz: number;
}

interface CompanionFileWedge {
  model: string;
  serie: string;
}

interface CompanionFileEquipment {
  model: string;
  serialNumber: string;
  platform: string;
}

interface CompanionFileSpecimen {
  materialName: string;
  nominalThicknessMm: number;
  longitudinalVelocity: number;
}

interface CompanionFileScanner {
  name: string;
  encoderMode: string;
}

export interface CompanionFile {
  filename: string;
  sizeMb: number;
  indexRangeMm: [number, number];
  scanRangeMm: [number, number];
  gates: CompanionFileGate[];
  beamCount: number;
  validPointCount: number;
  thicknessProcess: {
    minMm: number | null;
    maxMm: number | null;
    gateIds: number[];
    gateDetection: string;
  } | null;
  // Rich metadata
  creationDate: string | null;
  modificationDate: string | null;
  probe: CompanionFileProbe | null;
  wedge: CompanionFileWedge | null;
  equipment: CompanionFileEquipment | null;
  specimen: CompanionFileSpecimen | null;
  scanner: CompanionFileScanner | null;
  velocity: number;
}

export function useCompanionFiles(port: number | null) {
  return useQuery({
    queryKey: ['companion-files', port],
    queryFn: async (): Promise<CompanionFile[]> => {
      if (!port) return [];
      const res = await fetch(`http://localhost:${port}/files`);
      const data = await res.json();
      return data.files ?? [];
    },
    enabled: !!port,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
