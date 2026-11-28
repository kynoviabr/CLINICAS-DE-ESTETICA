import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';

/** Intervalo da agenda da clínica (Configurações > Atendimento > Regras da agenda). Padrão 30 min. */
export function useAgendaSlotMinutes() {
  const { clinicId } = useBranding();
  const { data } = useQuery({
    queryKey: ['agenda-slot-minutes', clinicId],
    enabled: !!clinicId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('clinic_service_settings').select('slot_minutes').eq('clinic_id', clinicId!).maybeSingle();
      return Number(data?.slot_minutes) || 30;
    },
  });
  return data ?? 30;
}
