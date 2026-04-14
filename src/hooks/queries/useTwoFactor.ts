import { useQuery } from '@tanstack/react-query';
import { twoFactorService, type TwoFactorStatus } from '../../services/two-factor-service';

export function useTwoFactorStatus() {
  return useQuery<TwoFactorStatus>({
    queryKey: ['two-factor', 'status'],
    queryFn: () => twoFactorService.getStatus(),
    staleTime: 5 * 60 * 1000,
  });
}
