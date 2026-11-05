import { useQuery } from '@tanstack/react-query';
import { addDays, endOfDay, format, startOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  expiringEntries, forecastItems, plannedUsage,
  type PlannedAppointment, type RecipeLine, type StockEntry, type StockItem,
} from '@/lib/stock/forecast';

export type StockMaterial = StockItem & { type: string; unit_cost: number };

const PLANNED_STATUSES = ['scheduled', 'confirmed', 'in_progress'] as const;

/**
 * Estoque da clínica cruzado com a agenda: hoje e os próximos 7 dias.
 * Mão de obra (type = labor) não é estoque.
 */
export function useStock(clinicId: string | null | undefined) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['stock', clinicId],
    queryFn: async () => {
      const now = new Date();
      const weekEnd = endOfDay(addDays(now, 6));
      const [itemsRes, balancesRes, recipesRes, entriesRes, apptsRes] = await Promise.all([
        supabase.from('cost_items').select('id, name, unit, type, unit_cost, stock_min, status')
          .eq('clinic_id', clinicId!).neq('type', 'labor').order('name'),
        supabase.from('stock_balances').select('cost_item_id, balance').eq('clinic_id', clinicId!),
        supabase.from('treatment_cost_items').select('treatment_id, cost_item_id, quantity, treatments!inner(clinic_id)')
          .eq('treatments.clinic_id', clinicId!),
        supabase.from('stock_movements').select('cost_item_id, expires_at, quantity')
          .eq('clinic_id', clinicId!).eq('kind', 'entrada').not('expires_at', 'is', null),
        supabase.from('appointments').select('treatment_id, start_time')
          .eq('clinic_id', clinicId!).in('status', PLANNED_STATUSES)
          .gte('start_time', startOfDay(now).toISOString()).lte('start_time', weekEnd.toISOString()),
      ]);
      for (const res of [itemsRes, balancesRes, recipesRes, entriesRes, apptsRes]) if (res.error) throw res.error;
      const balances = new Map((balancesRes.data || []).map((b) => [b.cost_item_id, Number(b.balance)]));
      const materials: StockMaterial[] = (itemsRes.data || [])
        .filter((i) => i.status !== 'inactive')
        .map((i) => ({
          id: i.id, name: i.name, unit: i.unit, type: i.type, unit_cost: Number(i.unit_cost || 0),
          stock_min: Number(i.stock_min || 0), balance: balances.get(i.id) ?? 0,
        }));
      const recipes: RecipeLine[] = (recipesRes.data || []).map((r) => ({
        treatment_id: r.treatment_id, cost_item_id: r.cost_item_id, quantity: Number(r.quantity),
      }));
      const appointments = (apptsRes.data || []) as PlannedAppointment[];
      return { materials, recipes, appointments, entries: (entriesRes.data || []) as StockEntry[] };
    },
    enabled: !!clinicId,
  });

  const canManageQuery = useQuery({
    queryKey: ['can-manage-stock', clinicId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_manage_stock', { _user_id: user!.id, _clinic_id: clinicId! });
      if (error) return false;
      return !!data;
    },
    enabled: !!clinicId && !!user?.id,
  });

  const data = query.data;
  const today = format(new Date(), 'yyyy-MM-dd');
  const materials = data?.materials ?? [];
  const todayAppts = (data?.appointments ?? []).filter((a) => format(new Date(a.start_time), 'yyyy-MM-dd') === today);
  const week = forecastItems(materials, plannedUsage(data?.appointments ?? [], data?.recipes ?? []));
  const day = forecastItems(materials, plannedUsage(todayAppts, data?.recipes ?? []));
  const expiring = expiringEntries(data?.entries ?? [], materials, today);

  return {
    isLoading: query.isLoading,
    error: query.error,
    materials,
    week,
    day,
    expiring,
    hasRecipes: (data?.recipes ?? []).length > 0,
    canManage: !!canManageQuery.data,
    refetch: query.refetch,
  };
}
