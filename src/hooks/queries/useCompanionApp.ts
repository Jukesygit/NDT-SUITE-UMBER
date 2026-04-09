import { useQuery } from '@tanstack/react-query';

async function discoverCompanionPort(): Promise<number | null> {
  for (let port = 18923; port <= 18932; port++) {
    try {
      const res = await fetch(`http://localhost:${port}/status`, {
        signal: AbortSignal.timeout(500),
      });
      const data = await res.json();
      if (data.app === 'matrix-ndt-companion') return port;
    } catch {
      continue;
    }
  }
  return null;
}

interface CompanionStatus {
  connected: boolean;
  port: number | null;
  directory: string | null;
  fileCount: number;
}

export function useCompanionApp(): CompanionStatus {
  const { data } = useQuery({
    queryKey: ['companion-status'],
    queryFn: async () => {
      const port = await discoverCompanionPort();
      if (!port) return null;
      const res = await fetch(`http://localhost:${port}/status`);
      return { ...(await res.json()), port };
    },
    retry: false,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  return {
    connected: !!data?.running,
    port: data?.port ?? null,
    directory: data?.directory ?? null,
    fileCount: data?.fileCount ?? 0,
  };
}
