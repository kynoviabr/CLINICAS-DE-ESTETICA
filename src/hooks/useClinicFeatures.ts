import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { FEATURES, featureEnabled, type FeatureName } from '@/lib/features';

/** Estoque, Despesas... ligados para a clínica? Enquanto carrega, considera ligado. */
export function useClinicFeatures() {
  const { clinicId } = useUserRole();
  const query = useQuery({
    queryKey: ['clinic-features', clinicId],
    queryFn: async () => {
      const keys = Object.values(FEATURES).map((f) => f.key);
      const { data } = await supabase.from('clinic_settings').select('key, value').eq('clinic_id', clinicId!).in('key', keys);
      return Object.fromEntries((data || []).map((r) => [r.key, r.value])) as Record<string, string | null>;
    },
    enabled: !!clinicId,
    staleTime: 5 * 60 * 1000,
  });
  const settings = query.data ?? {};
  return {
    isEnabled: (feature: FeatureName) => featureEnabled(settings, feature),
    loading: query.isLoading,
  };
}
