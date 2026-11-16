import { useQuery } from '@tanstack/react-query';
import { useUrlState } from '@/hooks/useUrlState';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { type BadgeStatus } from '@/components/ui/brand-badge';
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek,
  subDays, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval, addDays
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { todayIso } from '@/lib/finance/installments';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { PERIOD_PRESETS, resolvePeriod, type PeriodPreset } from '@/lib/commercial/period';
import { buildSellerPerformance } from '@/lib/commercial/sellerPerformance';
import { SETUP_COMPLETED_KEY, readClinicSetting } from '@/lib/setup/clinicSetup';
import { useMemo } from 'react';
import type { Database } from '@/integrations/supabase/types';


const DASHBOARD_TABS = ['executivo', 'comercial', 'financeiro', 'operacao', 'pessoas'] as const;
type DashboardTab = (typeof DASHBOARD_TABS)[number];

type ContractStatusRow = Pick<Database['public']['Tables']['contracts']['Row'], 'process_status'>;
type AnamneseRow = Pick<Database['public']['Tables']['patient_anamneses']['Row'], 'patient_id' | 'uploaded_at'>;
type RevenueInstallmentRow = Pick<Database['public']['Tables']['contract_installments']['Row'], 'paid_amount' | 'paid_at'>;
type SessionRecordRow = Pick<Database['public']['Tables']['session_records']['Row'], 'performed_at'>;
type PatientCreatedRow = Pick<Database['public']['Tables']['patients']['Row'], 'created_at'>;
type AppointmentTreatmentRow = {
  treatment_id: string | null;
  treatments?: { name?: string | null } | null;
};
type AppointmentStartRow = Pick<Database['public']['Tables']['appointments']['Row'], 'start_time'>;
type SalesProposalRow = Pick<Database['public']['Tables']['proposals']['Row'], 'id' | 'final_amount' | 'created_by' | 'created_at'>;
type SalesGoalRow = Pick<Database['public']['Tables']['sales_goals']['Row'], 'user_id' | 'goal_amount'>;
type RenewalTaskMetricRow = {
  id: string;
  status: string;
  created_at: string;
  converted_proposal_id: string | null;
  discarded_reason: string | null;
  sla_red_at: string | null;
};
type ClinicSettingRow = { key: string; value: string };


const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);


/** Estado, dados e ações da tela (a tela em DashboardPage.tsx só desenha). */
export function useDashboardData() {
  const { clinicId } = useBranding();
  const { role } = useUserRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = new Date();
  const sixMonthsAgo = subMonths(today, 5);
  const months = eachMonthOfInterval({ start: startOfMonth(sixMonthsAgo), end: endOfMonth(today) });
  const currentMonth = format(today, 'yyyy-MM');

  // Período da área Comercial (fica na URL: ?periodo=&de=&ate=)
  const [periodPreset, setPeriodPreset] = useUrlState<PeriodPreset>('periodo', 'mes', PERIOD_PRESETS);
  const [customStart, setCustomStart] = useUrlState<string>('de', '');
  const [customEnd, setCustomEnd] = useUrlState<string>('ate', '');
  const period = resolvePeriod(periodPreset, customStart, customEnd, today);
  const periodStartIso = period.start.toISOString();
  const periodEndIso = period.end.toISOString();
  const periodStartDay = format(period.start, 'yyyy-MM-dd');
  const periodEndDay = format(period.end, 'yyyy-MM-dd');
  const periodKey = `${periodStartDay}_${periodEndDay}`;

  const isAdmin = role === 'admin';
  const { data: setupDone } = useQuery({
    queryKey: ['setup-status', clinicId],
    queryFn: async () => !!(await readClinicSetting(clinicId!, SETUP_COMPLETED_KEY)),
    enabled: !!clinicId && role === 'admin',
  });
  const isSales = role === 'sales';
  const isStaff = ['admin', 'receptionist'].includes(role || '');
  const showCommercial = isAdmin || isSales;

  const { data: dashboardAlertSettings } = useQuery({
    queryKey: ['dashboard-alert-settings', clinicId],
    queryFn: async () => {
      const keys = [
        'dashboard_alert_overdue_payments_threshold',
        'dashboard_alert_anamnese_expiry_window_days',
        'dashboard_alert_dissatisfaction_threshold',
        'dashboard_alert_contract_review_window_days',
      ];
      const { data } = await supabase
        .from('clinic_settings' as never)
        .select('key, value')
        .eq('clinic_id', clinicId!)
        .in('key', keys);
      const map = new Map<string, string>();
      ((data ?? []) as unknown as ClinicSettingRow[]).forEach((item) => map.set(item.key, item.value));
      return {
        overduePaymentsThreshold: Number(map.get('dashboard_alert_overdue_payments_threshold') ?? 1),
        anamneseExpiryWindowDays: Number(map.get('dashboard_alert_anamnese_expiry_window_days') ?? 7),
        dissatisfactionThreshold: Number(map.get('dashboard_alert_dissatisfaction_threshold') ?? 1),
        contractReviewWindowDays: Number(map.get('dashboard_alert_contract_review_window_days') ?? 7),
      };
    },
    enabled: !!clinicId,
  });

  // ── Common Stats ──
  const { data: patientCount = 0 } = useQuery({
    queryKey: ['dashboard-patients', clinicId],
    queryFn: async () => {
      const { count } = await supabase.from('patients').select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId!).eq('status', 'active');
      return count || 0;
    },
    enabled: !!clinicId,
  });

  const { data: todaySessions = [] } = useQuery({
    queryKey: ['dashboard-today', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('appointments').select('*, patients(full_name), treatments(name)')
        .eq('clinic_id', clinicId!).gte('start_time', startOfDay(today).toISOString())
        .lte('start_time', endOfDay(today).toISOString()).order('start_time');
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: weekSessions = 0 } = useQuery({
    queryKey: ['dashboard-week', clinicId],
    queryFn: async () => {
      const { count } = await supabase.from('appointments').select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId!).gte('start_time', startOfWeek(today, { locale: ptBR }).toISOString())
        .lte('start_time', endOfWeek(today, { locale: ptBR }).toISOString());
      return count || 0;
    },
    enabled: !!clinicId,
  });

  const { data: avgRating } = useQuery({
    queryKey: ['dashboard-rating', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('session_feedback').select('rating')
        .eq('clinic_id', clinicId!).gte('created_at', subDays(today, 30).toISOString());
      if (!data?.length) return null;
      return { avg: (data.reduce((s, f) => s + f.rating, 0) / data.length).toFixed(1), count: data.length };
    },
    enabled: !!clinicId,
  });

  const { data: overduePayments = 0 } = useQuery({
    queryKey: ['dashboard-overdue', clinicId],
    queryFn: async () => {
      // Atraso é derivado: parcela prevista com vencimento antes de hoje.
      const { count } = await supabase.from('contract_installments')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId!).eq('status', 'previsto').lt('due_date', todayIso());
      return count || 0;
    },
    enabled: !!clinicId,
  });

  const { data: contractAlerts } = useQuery({
    queryKey: ['dashboard-contract-alerts', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, process_status')
        .eq('clinic_id', clinicId!);
      if (error) throw error;
      const contracts = data || [];
      return {
        pendingUpload: contracts.filter((contract: ContractStatusRow) => contract.process_status === 'pending_upload').length,
        pendingConfirmation: contracts.filter((contract: ContractStatusRow) => contract.process_status === 'pending_confirmation').length,
        overdue: contracts.filter((contract: ContractStatusRow) => contract.process_status === 'overdue').length,
      };
    },
    enabled: !!clinicId && !isSales,
  });



  // Anamnese alerts
  const { data: anamneseAlerts } = useQuery({
    queryKey: ['dashboard-anamnese-alerts', clinicId],
    queryFn: async () => {
      const { data: settingsData } = await supabase.from('clinic_settings')
        .select('value').eq('clinic_id', clinicId!).eq('key', 'anamnese_validity_days').maybeSingle();
      const validityDays = settingsData ? parseInt(settingsData.value) || 45 : 45;
      const { data: patients } = await supabase.from('patients').select('id').eq('clinic_id', clinicId!).eq('status', 'active');
      const patientIds = (patients || []).map(p => p.id);
      if (patientIds.length === 0) return { expired: 0, expiring: 0 };
      const { data: anamneses } = await supabase.from('patient_anamneses')
        .select('patient_id, uploaded_at').eq('clinic_id', clinicId!).order('uploaded_at', { ascending: false });
      const latestMap: Record<string, string> = {};
      (anamneses || []).forEach((a: AnamneseRow) => { if (!latestMap[a.patient_id]) latestMap[a.patient_id] = a.uploaded_at; });
      let expired = 0, expiring = 0;
      const now = new Date();
      const warningDate = addDays(now, dashboardAlertSettings?.anamneseExpiryWindowDays ?? 7);
      patientIds.forEach(pid => {
        const uploadedAt = latestMap[pid];
        if (!uploadedAt) { expired++; return; }
        const expiryDate = addDays(new Date(uploadedAt), validityDays);
        if (expiryDate < now) expired++;
        else if (expiryDate < warningDate) expiring++;
      });
      return { expired, expiring };
    },
    enabled: !!clinicId && isStaff,
  });

  // ── Conversion Funnel (admin) ──
  const { data: funnelData } = useQuery({
    queryKey: ['dashboard-funnel', clinicId, periodKey],
    queryFn: async () => {
      const [proposals, contracts, payments] = await Promise.all([
        supabase.from('proposals').select('id, status', { count: 'exact', head: false })
          .eq('clinic_id', clinicId!).gte('created_at', periodStartIso).lte('created_at', periodEndIso),
        supabase.from('contracts').select('id, status', { count: 'exact', head: false })
          .eq('clinic_id', clinicId!).gte('created_at', periodStartIso).lte('created_at', periodEndIso),
        supabase.from('contract_installments')
          .select('id', { count: 'exact', head: false })
          .eq('clinic_id', clinicId!).eq('status', 'pago')
          .gte('paid_at', periodStartDay).lte('paid_at', periodEndDay),
      ]);
      const totalProposals = proposals.data?.length || 0;
      const acceptedProposals = proposals.data?.filter(p => p.status === 'accepted').length || 0;
      const activeContracts = contracts.data?.filter(c => c.status === 'active').length || 0;
      const paidInstallments = payments.data?.length || 0;
      return { totalProposals, acceptedProposals, activeContracts, paidInstallments };
    },
    enabled: !!clinicId && isAdmin,
  });

  // ── Growth metrics (MoM comparisons) ──
  const { data: growthMetrics } = useQuery({
    queryKey: ['dashboard-growth', clinicId],
    queryFn: async () => {
      const currStart = startOfMonth(today).toISOString();
      const currEnd = endOfMonth(today).toISOString();
      const prevStart = startOfMonth(subMonths(today, 1)).toISOString();
      const prevEnd = endOfMonth(subMonths(today, 1)).toISOString();

      const [currPatients, prevPatients, currSessions, prevSessions, currRevenue, prevRevenue, dissatisfied] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId!).gte('created_at', currStart).lte('created_at', currEnd),
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId!).gte('created_at', prevStart).lte('created_at', prevEnd),
        supabase.from('session_records').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId!).gte('performed_at', currStart).lte('performed_at', currEnd),
        supabase.from('session_records').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId!).gte('performed_at', prevStart).lte('performed_at', prevEnd),
        supabase.from('contract_installments').select('paid_amount, paid_at').eq('clinic_id', clinicId!).eq('status', 'pago').gte('paid_at', currStart.slice(0, 10)).lte('paid_at', currEnd.slice(0, 10)),
        supabase.from('contract_installments').select('paid_amount, paid_at').eq('clinic_id', clinicId!).eq('status', 'pago').gte('paid_at', prevStart.slice(0, 10)).lte('paid_at', prevEnd.slice(0, 10)),
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId!).eq('dissatisfaction_flag', true),
      ]);

      const currRev = (currRevenue.data || []).reduce((s: number, r: RevenueInstallmentRow) => s + Number(r.paid_amount || 0), 0);
      const prevRev = (prevRevenue.data || []).reduce((s: number, r: RevenueInstallmentRow) => s + Number(r.paid_amount || 0), 0);

      return {
        newPatients: { current: currPatients.count || 0, previous: prevPatients.count || 0 },
        sessions: { current: currSessions.count || 0, previous: prevSessions.count || 0 },
        revenue: { current: currRev, previous: prevRev },
        dissatisfied: dissatisfied.count || 0,
      };
    },
    enabled: !!clinicId && !isSales,
  });

  // ── LTV (avg revenue per patient) ──
  const { data: ltvData } = useQuery({
    queryKey: ['dashboard-ltv', clinicId],
    queryFn: async () => {
      const { data: plans } = await supabase.from('contract_payment_plans')
        .select('patient_id, total_contract_value').eq('clinic_id', clinicId!);
      if (!plans?.length) return null;
      const byPatient: Record<string, number> = {};
      plans.forEach(p => { if (p.patient_id) byPatient[p.patient_id] = (byPatient[p.patient_id] || 0) + Number(p.total_contract_value); });
      const values = Object.values(byPatient);
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      return { avg, total: values.length };
    },
    enabled: !!clinicId && isAdmin,
  });

  // ── Commercial data (admin + sales) ──
  const { data: salesData } = useQuery({
    queryKey: ['dashboard-sales', clinicId, periodKey, period.goalMonth],
    queryFn: async () => {
      let query = supabase.from('proposals')
        .select('id, final_amount, created_by, created_at')
        .eq('clinic_id', clinicId!)
        .eq('status', 'accepted')
        .gte('updated_at', periodStartIso).lte('updated_at', periodEndIso);
      if (isSales) query = query.eq('created_by', user!.id);
      const { data: proposals } = await query;
      const { data: staffData } = await supabase.from('user_roles')
        .select('user_id, role').eq('clinic_id', clinicId!).eq('is_active', true);
      // Metas são mensais: só valem quando o período é um mês fechado.
      const { data: goalsData } = period.goalMonth
        ? await supabase.from('sales_goals')
          .select('*').eq('clinic_id', clinicId!).eq('period_reference', period.goalMonth)
        : { data: [] };
      return { proposals: (proposals as SalesProposalRow[]) || [], staff: staffData || [], goals: (goalsData as SalesGoalRow[]) || [] };
    },
    enabled: !!clinicId && showCommercial,
  });

  const { data: renewalMetrics } = useQuery({
    queryKey: ['dashboard-renewal-metrics', clinicId, periodKey],
    queryFn: async () => {
      const monthStart = periodStartIso;
      const monthEnd = periodEndIso;
      const { data: tasks, error } = await supabase
        .from('renewal_tasks')
        .select('id, status, created_at, converted_proposal_id, discarded_reason, sla_red_at')
        .eq('clinic_id', clinicId!)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);
      if (error) throw error;

      const taskRows = (tasks || []) as RenewalTaskMetricRow[];
      const generated = taskRows.length;
      const convertedRows = taskRows.filter((task) => task.status === 'converted' && !!task.converted_proposal_id);
      const converted = convertedRows.length;
      const conversionRate = generated > 0 ? Math.round((converted / generated) * 100) : 0;
      const slaOverdue = taskRows.filter((task) => !!task.sla_red_at && task.status !== 'converted' && task.status !== 'discarded').length;

      const proposalIds = Array.from(new Set(convertedRows.map((task) => task.converted_proposal_id).filter(Boolean))) as string[];
      let renewalRevenue = 0;
      if (proposalIds.length > 0) {
        const { data: proposals } = await supabase
          .from('proposals')
          .select('id, final_amount')
          .in('id', proposalIds);
        renewalRevenue = (proposals || []).reduce((sum, proposal) => sum + Number(proposal.final_amount || 0), 0);
      }

      return {
        generated,
        converted,
        conversionRate,
        renewalRevenue,
        slaOverdue,
      };
    },
    enabled: !!clinicId && isAdmin,
  });

  // ── Charts ──
  // ── Avaliações por vendedor (conversão avaliação → venda) ──
  const { data: evaluationRows = [] } = useQuery({
    queryKey: ['dashboard-evaluations', clinicId, periodKey],
    queryFn: async () => {
      const { data: appts, error } = await supabase.from('appointments')
        .select('id, status, start_time, lead_id, created_by')
        .eq('clinic_id', clinicId!)
        .eq('appointment_type', 'evaluation')
        .gte('start_time', periodStartIso).lte('start_time', periodEndIso);
      if (error) throw error;
      const leadIds = [...new Set((appts || []).map((a) => a.lead_id).filter(Boolean))] as string[];
      const leadsById = new Map<string, { assigned_to: string | null; converted_at: string | null; proposal_id: string | null }>();
      const acceptedProposals = new Set<string>();
      if (leadIds.length > 0) {
        const { data: leads } = await supabase.from('leads')
          .select('id, assigned_to, converted_at, proposal_id').in('id', leadIds);
        (leads || []).forEach((l) => leadsById.set(l.id, l));
        const proposalIds = [...new Set((leads || []).map((l) => l.proposal_id).filter(Boolean))] as string[];
        if (proposalIds.length > 0) {
          const { data: props } = await supabase.from('proposals').select('id, status').in('id', proposalIds);
          (props || []).forEach((pr) => { if (pr.status === 'accepted') acceptedProposals.add(pr.id); });
        }
      }
      return (appts || []).map((a) => {
        const lead = a.lead_id ? leadsById.get(a.lead_id) : undefined;
        return {
          sellerId: lead?.assigned_to || a.created_by || null,
          status: a.status as string,
          startTime: a.start_time,
          converted: !!lead && (!!lead.converted_at || (!!lead.proposal_id && acceptedProposals.has(lead.proposal_id))),
        };
      });
    },
    enabled: !!clinicId && showCommercial,
  });
  const { byUserId: staffById } = useStaffDirectory(showCommercial ? clinicId : null);

  const { data: revenueSessionsData = [] } = useQuery({
    queryKey: ['dashboard-revenue-sessions-chart', clinicId],
    queryFn: async () => {
      const [revenueRes, sessionsRes] = await Promise.all([
        supabase.from('contract_installments')
          .select('paid_amount, paid_at')
          .eq('clinic_id', clinicId!).eq('status', 'pago')
          .gte('paid_at', startOfMonth(sixMonthsAgo).toISOString().slice(0, 10)),
        supabase.from('session_records').select('performed_at')
          .eq('clinic_id', clinicId!).gte('performed_at', startOfMonth(sixMonthsAgo).toISOString()),
      ]);
      const revByMonth: Record<string, number> = {};
      const sessByMonth: Record<string, number> = {};
      months.forEach(m => { const k = format(m, 'yyyy-MM'); revByMonth[k] = 0; sessByMonth[k] = 0; });
      (revenueRes.data || []).forEach((inst: RevenueInstallmentRow) => {
        if (inst.paid_at) { const k = inst.paid_at.slice(0, 7); if (revByMonth[k] !== undefined) revByMonth[k] += Number(inst.paid_amount || 0); }
      });
      (sessionsRes.data || []).forEach((s: SessionRecordRow) => {
        const k = s.performed_at.slice(0, 7); if (sessByMonth[k] !== undefined) sessByMonth[k]++;
      });
      return months.map(m => {
        const k = format(m, 'yyyy-MM');
        return { month: format(m, 'MMM', { locale: ptBR }), receita: revByMonth[k], sessoes: sessByMonth[k] };
      });
    },
    enabled: !!clinicId && !isSales,
  });

  const { data: patientsData = [] } = useQuery({
    queryKey: ['dashboard-patients-chart', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('patients').select('created_at')
        .eq('clinic_id', clinicId!).gte('created_at', startOfMonth(sixMonthsAgo).toISOString());
      const byMonth: Record<string, number> = {};
      months.forEach(m => { byMonth[format(m, 'yyyy-MM')] = 0; });
      (data || []).forEach((p: PatientCreatedRow) => { const key = p.created_at.slice(0, 7); if (byMonth[key] !== undefined) byMonth[key]++; });
      let acc = 0;
      return months.map(m => { const k = format(m, 'yyyy-MM'); acc += byMonth[k]; return { month: format(m, 'MMM', { locale: ptBR }), novos: byMonth[k], acumulado: acc }; });
    },
    enabled: !!clinicId && !isSales,
  });

  const { data: topTreatments = [] } = useQuery({
    queryKey: ['dashboard-treatments', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('appointments').select('treatment_id, treatments(name)')
        .eq('clinic_id', clinicId!).not('treatment_id', 'is', null);
      if (!data) return [];
      const counts: Record<string, { name: string; count: number }> = {};
      data.forEach((a: AppointmentTreatmentRow) => { const name = a.treatments?.name || 'Outro'; const tid = a.treatment_id; if (!tid) return; if (!counts[tid]) counts[tid] = { name, count: 0 }; counts[tid].count++; });
      return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 6);
    },
    enabled: !!clinicId && !isSales,
  });

  // ── Occupancy by day of week ──
  const { data: occupancyData = [] } = useQuery({
    queryKey: ['dashboard-occupancy', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('appointments').select('start_time')
        .eq('clinic_id', clinicId!).gte('start_time', subDays(today, 60).toISOString())
        .in('status', ['scheduled', 'confirmed', 'completed', 'in_progress']);
      const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const counts = [0, 0, 0, 0, 0, 0, 0];
      const weeksCounted = Math.ceil(60 / 7);
      (data || []).forEach((a: AppointmentStartRow) => { counts[new Date(a.start_time).getDay()]++; });
      return days.map((d, i) => ({ day: d, media: Math.round(counts[i] / weeksCounted * 10) / 10 }));
    },
    enabled: !!clinicId && !isSales,
  });

  // Sales computed values
  const totalSalesMonth = salesData?.proposals.reduce((s, p: SalesProposalRow) => s + Number(p.final_amount || 0), 0) || 0;
  const approvedCount = salesData?.proposals.length || 0;
  const ticketMedio = approvedCount > 0 ? totalSalesMonth / approvedCount : 0;
  const myGoal = salesData?.goals.find((g: SalesGoalRow) => g.user_id === user?.id);
  const myGoalAmount = myGoal ? Number(myGoal.goal_amount) : 0;
  const myPct = myGoalAmount > 0 ? Math.round((totalSalesMonth / myGoalAmount) * 100) : 0;

  // Desempenho por vendedor (admin vê todos; comercial vê só o próprio)
  const sellerRows = useMemo(() => {
    if (!salesData) return [];
    const goals = period.goalMonth
      ? Object.fromEntries(salesData.goals.map((g: SalesGoalRow) => [g.user_id, Number(g.goal_amount)]))
      : null;
    const rows = buildSellerPerformance(
      evaluationRows,
      salesData.proposals.map((p: SalesProposalRow) => ({ sellerId: p.created_by, amount: Number(p.final_amount || 0) })),
      goals,
    );
    return isSales ? rows.filter((r) => r.sellerId === user?.id) : rows;
  }, [salesData, evaluationRows, period.goalMonth, isSales, user?.id]);
  const myEvaluationRow = sellerRows.find((r) => r.sellerId === user?.id);

  const totalRevenue = revenueSessionsData.reduce((s, d) => s + d.receita, 0);

  // Funnel conversion rates
  const funnelSteps = useMemo(() => {
    if (!funnelData) return [];
    const { totalProposals, acceptedProposals, activeContracts, paidInstallments } = funnelData;
    return [
      { label: 'Propostas', value: totalProposals, color: 'hsl(var(--muted-foreground))' },
      { label: 'Aprovadas', value: acceptedProposals, color: 'hsl(var(--accent))' },
      { label: 'Contratos', value: activeContracts, color: 'hsl(var(--primary))' },
      { label: 'Pagamentos', value: paidInstallments, color: '#34d399' },
    ];
  }, [funnelData]);

  const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' };
  const [activeTab, setActiveTab] = useUrlState<DashboardTab>('aba', 'executivo', DASHBOARD_TABS);

  const executiveSemaphores = useMemo(() => {
    const commercialRevenue = totalSalesMonth;
    const overdueContracts = contractAlerts?.overdue || 0;
    const overdueBills = overduePayments;
    const expiredAnamneses = anamneseAlerts?.expired || 0;
    const lowSatisfaction = growthMetrics?.dissatisfied || 0;
    const overduePaymentsThreshold = dashboardAlertSettings?.overduePaymentsThreshold ?? 1;
    const dissatisfactionThreshold = dashboardAlertSettings?.dissatisfactionThreshold ?? 1;

    const commercialStatus: BadgeStatus = commercialRevenue > 0 ? 'confirmed' : approvedCount > 0 ? 'scheduled' : 'pending';
    const financialStatus: BadgeStatus = overdueBills >= overduePaymentsThreshold ? 'overdue' : overdueContracts > 0 ? 'pending' : 'confirmed';
    const operationStatus: BadgeStatus = expiredAnamneses > 0 ? 'pending' : (todaySessions.length > 0 ? 'confirmed' : 'scheduled');
    const peopleStatus: BadgeStatus = lowSatisfaction >= dissatisfactionThreshold ? 'pending' : (avgRating ? 'confirmed' : 'scheduled');

    return [
      {
        id: 'comercial' as const,
        title: 'Comercial',
        status: commercialStatus,
        metric: `${approvedCount} propostas aprovadas`,
        alert: commercialRevenue > 0 ? `${formatCurrency(commercialRevenue)} no mês` : 'Nenhuma venda concluída no mês',
      },
      {
        id: 'financeiro' as const,
        title: 'Financeiro',
        status: financialStatus,
        metric: `${overdueBills} parcelas vencidas`,
        alert: overdueContracts > 0 ? `${overdueContracts} contratos com revisão pendente` : 'Sem alertas críticos',
      },
      {
        id: 'operacao' as const,
        title: 'Operação',
        status: operationStatus,
        metric: `${todaySessions.length} atendimentos hoje`,
        alert: expiredAnamneses > 0 ? `${expiredAnamneses} anamneses vencidas` : 'Agenda sob controle',
      },
      {
        id: 'pessoas' as const,
        title: 'Pessoas',
        status: peopleStatus,
        metric: avgRating ? `Satisfação ${avgRating.avg}/5` : 'Sem avaliações recentes',
        alert: lowSatisfaction >= dissatisfactionThreshold ? `${lowSatisfaction} pacientes com alerta de insatisfação` : 'Sem alertas de relacionamento',
      },
    ];
  }, [
    totalSalesMonth,
    contractAlerts?.overdue,
    overduePayments,
    anamneseAlerts?.expired,
    growthMetrics?.dissatisfied,
    approvedCount,
    todaySessions.length,
    avgRating,
    dashboardAlertSettings?.overduePaymentsThreshold,
    dashboardAlertSettings?.dissatisfactionThreshold,
  ]);

  const showTab = (tab: typeof activeTab) => activeTab === 'executivo' || activeTab === tab;

  return {
    clinicId,
    role,
    user,
    navigate,
    today,
    sixMonthsAgo,
    months,
    currentMonth,
    periodPreset,
    setPeriodPreset,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    period,
    periodStartIso,
    periodEndIso,
    periodStartDay,
    periodEndDay,
    periodKey,
    isAdmin,
    setupDone,
    isSales,
    isStaff,
    showCommercial,
    dashboardAlertSettings,
    patientCount,
    todaySessions,
    weekSessions,
    avgRating,
    overduePayments,
    contractAlerts,
    anamneseAlerts,
    funnelData,
    growthMetrics,
    ltvData,
    salesData,
    renewalMetrics,
    evaluationRows,
    staffById,
    revenueSessionsData,
    patientsData,
    topTreatments,
    occupancyData,
    totalSalesMonth,
    approvedCount,
    ticketMedio,
    myGoal,
    myGoalAmount,
    myPct,
    sellerRows,
    myEvaluationRow,
    totalRevenue,
    funnelSteps,
    tooltipStyle,
    activeTab,
    setActiveTab,
    executiveSemaphores,
    showTab,
  };
}
