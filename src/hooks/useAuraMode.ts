import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AuraMode = 'copilot' | 'auto' | 'off';

/** Modo da IA da clínica: copilot (sugerir resposta) ou auto (a IA responde sozinha e marca horários). */
export function useAuraMode(clinicId: string | null | undefined) {
  return useQuery({
    queryKey: ['aura-mode', clinicId],
    enabled: !!clinicId,
    queryFn: async (): Promise<AuraMode> => {
      const { data } = await supabase.from('clinic_settings').select('value').eq('clinic_id', clinicId!).eq('key', 'aura_ai_mode').maybeSingle();
      return (['copilot', 'auto', 'off'].includes(String(data?.value)) ? data!.value : 'copilot') as AuraMode;
    },
  });
}
