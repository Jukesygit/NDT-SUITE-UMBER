import { useQuery } from '@tanstack/react-query';

interface CompanionFileGate {
  id: number;
  name: string;
  detection: string;
}

export interface CompanionFile {
  filename: string;
  sizeMb: number;
  indexRangeMm: [number, number];
  scanRangeMm: [number, number];
  gates: CompanionFileGate[];
  beamCount: number;
  validPointCount: number;
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
