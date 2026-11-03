import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import type { ModuleSet } from '@/lib/plans';

export interface ClinicPlan {
  planKey: string | null;
  planName: string | null;
  maxUsers: number | null;
  /** null = não foi possível ler os módulos: a tela não esconde nada. */
  modules: ModuleSet;
}

const UNKNOWN: ClinicPlan = { planKey: null, planName: null, maxUsers: null, modules: null };

export function useClinicPlan() {
  const { clinicId, loading: roleLoading } = useUserRole();

  const query = useQuery({
    queryKey: ['clinic-plan', clinicId],
    queryFn: async (): Promise<ClinicPlan> => {
      const [modulesRes, clinicRes] = await Promise.all([
        supabase.rpc('clinic_modules', { p_clinic_id: clinicId! }),
        supabase.from('clinics').select('plan_name').eq('id', clinicId!).maybeSingle(),
      ]);
      // Banco ainda sem planos (ex.: migração não aplicada): segue mostrando tudo.
      if (modulesRes.error || !Array.isArray(modulesRes.data)) return UNKNOWN;

      const planKey = clinicRes.data?.plan_name ?? null;
      let planName: string | null = null;
      let maxUsers: number | null = null;
      if (planKey) {
        const { data: plan } = await supabase.from('plans').select('name, max_users').eq('key', planKey).maybeSingle();
        planName = plan?.name ?? null;
        maxUsers = plan?.max_users ?? null;
      }
      return { planKey, planName, maxUsers, modules: new Set(modulesRes.data as string[]) };
    },
    enabled: !!clinicId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    ...(query.data ?? UNKNOWN),
    loading: roleLoading || (!!clinicId && query.isLoading),
  };
}
