import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { onboardingItems, onboardingProgress, type OnboardingFacts } from '@/lib/setup/onboarding';

const DEFAULT_PRIMARY = '#1a7a6d';

/** Primeiros passos da clínica, a partir dos dados reais. */
export function useOnboardingStatus(clinicId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['onboarding-status', clinicId],
    enabled: enabled && !!clinicId,
    staleTime: 60_000,
    queryFn: async () => {
      const id = clinicId!;
      const count = { count: 'exact' as const, head: true };
      const [clinic, cnpj, hours, treatments, contract, whatsapp, hidden, brandOk] = await Promise.all([
        supabase.from('clinics').select('name, logo_url, primary_color').eq('id', id).maybeSingle(),
        supabase.from('clinic_settings').select('value').eq('clinic_id', id).eq('key', 'cnpj').maybeSingle(),
        supabase.from('professional_availability').select('id', count).eq('clinic_id', id).eq('is_active', true),
        supabase.from('treatments').select('id', count).eq('clinic_id', id).eq('is_active', true),
        supabase.from('contract_templates').select('id', count).eq('clinic_id', id).eq('status', 'active'),
        supabase.from('whatsapp_channels').select('status').eq('clinic_id', id).maybeSingle(),
        supabase.from('clinic_settings').select('value').eq('clinic_id', id).eq('key', 'onboarding_hidden_at').maybeSingle(),
        supabase.from('clinic_settings').select('value').eq('clinic_id', id).eq('key', 'brand_confirmed_at').maybeSingle(),
      ]);
      const c = clinic.data;
      const facts: OnboardingFacts = {
        hasClinicData: !!c?.name?.trim() && !!cnpj.data?.value,
        hasBrand: !!brandOk.data?.value || !!c?.logo_url || (!!c?.primary_color && c.primary_color.toLowerCase() !== DEFAULT_PRIMARY),
        hasHours: (hours.count || 0) > 0,
        treatments: treatments.count || 0,
        hasContract: (contract.count || 0) > 0,
        whatsappConnected: whatsapp.data?.status === 'connected',
      };
      const items = onboardingItems(facts);
      return { items, ...onboardingProgress(items), hidden: !!hidden.data?.value };
    },
  });
}
