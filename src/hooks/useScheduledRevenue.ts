import { useQuery } from '@tanstack/react-query';
import { endOfDay, parseISO, startOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { monthBounds, summarizeScheduled, type ScheduledAppt } from '@/lib/finance/simpleFinance';

export type ScheduledApptRow = ScheduledAppt & { client: string | null };

/**
 * Atendimentos ainda por acontecer no mês (de hoje até o fim do mês) e quanto eles
 * devem faturar. Meses passados não têm previsto.
 */
export function useScheduledRevenue(clinicId: string | null | undefined, month: string) {
  const { start, end } = monthBounds(month);
  const todayStart = startOfDay(new Date());
  const from = parseISO(start) > todayStart ? parseISO(start) : todayStart;
  const to = endOfDay(parseISO(end));
  const past = to < todayStart;

  const query = useQuery({
    queryKey: ['scheduled-revenue', clinicId, month],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments')
        .select('id, start_time, status, appointment_type, contract_id, patients(full_name), leads!appointments_lead_id_fkey(full_name), treatments(name, price, default_price)')
        .eq('clinic_id', clinicId!)
        .gte('start_time', from.toISOString())
        .lte('start_time', to.toISOString())
        .in('status', ['scheduled', 'confirmed', 'in_progress'])
        .order('start_time')
        .limit(1000);
      if (error) throw error;
      type Raw = Omit<ScheduledAppt, 'treatment'> & {
        treatments: ScheduledAppt['treatment'];
        patients: { full_name: string | null } | null;
        leads: { full_name: string | null } | null;
      };
      return ((data || []) as unknown as Raw[]).map((r) => ({
        id: r.id,
        start_time: r.start_time,
        status: r.status,
        appointment_type: r.appointment_type,
        contract_id: r.contract_id,
        treatment: r.treatments,
        client: r.patients?.full_name || r.leads?.full_name || null,
      })) as ScheduledApptRow[];
    },
    enabled: !!clinicId && !past,
  });

  const rows = past ? [] : query.data ?? [];
  return { rows, summary: summarizeScheduled(rows), isLoading: query.isLoading && !past };
}
