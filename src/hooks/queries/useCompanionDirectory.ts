import { useQuery } from '@tanstack/react-query';

interface DirectoryEntry {
  name: string;
  isDir: boolean;
}

interface DirectoryListing {
  entries: DirectoryEntry[];
  path: string;
}

export function useCompanionDirectory(port: number | null, path: string) {
  return useQuery<DirectoryListing>({
    queryKey: ['companion-directory', port, path],
    queryFn: async () => {
      if (!port) throw new Error('No port');
      const params = new URLSearchParams();
      if (path) params.set('path', path);
      const res = await fetch(`http://localhost:${port}/list-directory?${params}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`List directory failed: ${res.status}`);
      return res.json();
    },
    enabled: port !== null,
    staleTime: 10_000,
  });
}
