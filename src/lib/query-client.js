import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000,      // 5 minutes
            gcTime: 30 * 60 * 1000,        // 30 minutes (formerly cacheTime)
            retry: 1,
            refetchOnWindowFocus: false,   // Corporate app, disable aggressive refetch
        },
        mutations: {
            retry: 0,
        },
    },
});
