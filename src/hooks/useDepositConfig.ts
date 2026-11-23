import { useQuery } from '@tanstack/react-query';
import { readClinicSetting } from '@/lib/setup/clinicSetup';
import { DEPOSIT_CONFIG_KEY, depositReady, parseDepositConfig } from '@/lib/finance/deposit';

/** Configuração do sinal da clínica (chave Pix, valores, prazos e política). */
export function useDepositConfig(clinicId: string | null | undefined) {
  const q = useQuery({
    queryKey: ['deposit-config', clinicId],
    queryFn: async () => parseDepositConfig(await readClinicSetting(clinicId!, DEPOSIT_CONFIG_KEY)),
    enabled: !!clinicId,
    staleTime: 5 * 60 * 1000,
  });
  return { config: q.data ?? parseDepositConfig(null), ready: q.data ? depositReady(q.data) : false, isLoading: q.isLoading };
}
