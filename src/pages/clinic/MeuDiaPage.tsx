import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, endOfDay, format, startOfDay, startOfMonth, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowRight, CalendarPlus, Check, MessageCircle, Plus, ShoppingBag, UserPlus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { useAgendaProfessionals } from '@/hooks/useAgendaProfessionals';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { todayIso } from '@/lib/finance/installments';
import { MONTHLY_GOAL_KEY, goalProgress, monthBounds, parseGoal, summarizeMonth } from '@/lib/finance/simpleFinance';
import { SETUP_COMPLETED_KEY, readClinicSetting } from '@/lib/setup/clinicSetup';
import { formatBRL, whatsappLink } from '@/lib/proposals/sale';
import { formatPhone } from '@/lib/patients/validation';
import { buildEvaluationScheduleLink, lostReasons } from '@/lib/crm/model';
import { errorMessage } from '@/lib/errors';
import {
  FUNNEL_COLUMNS, buildDayTasks, clientsToRenew, daysWithoutContact, freeSlots, funnelColumnOf, moneyInsight, type FunnelColumnKey,
} from '@/lib/home/meuDia';

type Person = { full_name: string | null; phone: string | null } | null;
type ApptRow = {
  id: string; start_time: string; end_time: string; status: string; appointment_type: string | null;
  professional_id: string | null; patient_id: string | null; lead_id: string | null;
  patients: Person; leads: Person; treatments: { name: string | null } | null;
};
type LeadRow = {
  id: string; full_name: string; phone: string | null; kanban_stage: string; stage_changed_at: string | null;
  last_interaction_at: string | null; created_at: string; proposal_id: string | null; assigned_to: string | null;
  notes: string | null; treatments_of_interest: string[] | null; patient_id: string | null;
  proposals: { final_amount: number | null; status: string | null } | null;
};

const DONE_PREFIX = 'meudia-feito';
const readDone = (key: string): string[] => {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
};
const writeDone = (key: string, ids: string[]) => {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* sem armazenamento: só não lembra */ }
};

const statusLabel = (s: string) => (s === 'confirmed' ? 'Confirmada' : s === 'completed' ? 'Atendida' : s === 'in_progress' ? 'Em atendimento' : s === 'no_show' ? 'Faltou' : 'A confirmar');

export default function MeuDiaPage() {
  const { clinicId, role } = useUserRole();
  const { user } = useAuth();
  const { clinicName } = useBranding();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { professionalIdForUser } = useAgendaProfessionals(clinicId, user?.id);

  const now = useMemo(() => new Date(), []);
  const today = todayIso(now);
  const tomorrow = addDays(now, 1);
  const month = today.slice(0, 7);
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const doneKey = `${DONE_PREFIX}-${clinicId}-${today}`;
  const [done, setDone] = useState<string[]>(() => readDone(doneKey));
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [leadForm, setLeadForm] = useState({ name: '', phone: '', interest: '' });
  const [lostLead, setLostLead] = useState<LeadRow | null>(null);
  const [lostReason, setLostReason] = useState(lostReasons[0]);
  const [busy, setBusy] = useState<string | null>(null);

  const enabled = !!clinicId;

  const { data: setupDone } = useQuery({
    queryKey: ['setup-status', clinicId],
    queryFn: async () => !!(await readClinicSetting(clinicId!, SETUP_COMPLETED_KEY)),
    enabled: enabled && role === 'admin',
  });

  const { data: appts = [] } = useQuery({
    queryKey: ['meudia-appts', clinicId, today],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments')
        .select('id, start_time, end_time, status, appointment_type, professional_id, patient_id, lead_id, patients(full_name, phone), leads!appointments_lead_id_fkey(full_name, phone), treatments(name)')
        .eq('clinic_id', clinicId!)
        .gte('start_time', startOfDay(now).toISOString())
        .lte('start_time', endOfDay(tomorrow).toISOString())
        .not('status', 'in', '(cancelled,rescheduled)')
        .order('start_time');
      if (error) throw error;
      return (data || []) as unknown as ApptRow[];
    },
    enabled,
  });

  const { data: windowsTomorrow = [] } = useQuery({
    queryKey: ['meudia-availability', clinicId, tomorrow.getDay()],
    queryFn: async () => {
      const { data, error } = await supabase.from('professional_availability')
        .select('professional_id, start_time, end_time').eq('clinic_id', clinicId!).eq('day_of_week', tomorrow.getDay()).eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled,
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['meudia-leads', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads')
        .select('id, full_name, phone, kanban_stage, stage_changed_at, last_interaction_at, created_at, proposal_id, assigned_to, notes, treatments_of_interest, patient_id, proposals(final_amount, status)')
        .eq('clinic_id', clinicId!).is('deleted_at', null).neq('kanban_stage', 'closed_lost')
        .order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data || []) as unknown as LeadRow[];
    },
    enabled,
  });

  const { data: openProposals = [] } = useQuery({
    queryKey: ['meudia-proposals', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('proposals')
        .select('id, proposal_number, final_amount, valid_until, patients(full_name, phone)')
        .eq('clinic_id', clinicId!).eq('status', 'sent').order('valid_until');
      if (error) throw error;
      return (data || []) as unknown as Array<{ id: string; proposal_number: string; final_amount: number | null; valid_until: string | null; patients: Person }>;
    },
    enabled,
  });

  const { data: finance = [] } = useQuery({
    queryKey: ['meudia-finance', clinicId, month],
    queryFn: async () => {
      const sel = 'id, status, due_date, amount, paid_at, paid_amount, contracts!inner(patients(full_name, phone))';
      const [paid, open] = await Promise.all([
        supabase.from('contract_installments').select(sel).eq('clinic_id', clinicId!).eq('status', 'pago').gte('paid_at', monthStart).lte('paid_at', monthEnd).limit(1000),
        supabase.from('contract_installments').select(sel).eq('clinic_id', clinicId!).eq('status', 'previsto').lte('due_date', monthEnd).order('due_date').limit(1000),
      ]);
      if (paid.error) throw paid.error;
      if (open.error) throw open.error;
      return [...(paid.data || []), ...(open.data || [])] as unknown as Array<{ id: string; status: string; due_date: string | null; amount: number; paid_at: string | null; paid_amount: number | null; contracts: { patients: Person } | null }>;
    },
    enabled,
  });

  const { data: goal = null } = useQuery({
    queryKey: ['monthly-goal', clinicId],
    queryFn: async () => parseGoal(await readClinicSetting(clinicId!, MONTHLY_GOAL_KEY)),
    enabled,
  });

  const { data: renew = [] } = useQuery({
    queryKey: ['meudia-renew', clinicId, today],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments').select('patient_id, start_time, status')
        .eq('clinic_id', clinicId!).gte('start_time', subDays(now, 180).toISOString()).not('patient_id', 'is', null).limit(3000);
      if (error) throw error;
      const list = clientsToRenew((data || []) as Array<{ patient_id: string | null; start_time: string; status: string }>, now).slice(0, 10);
      if (list.length === 0) return [];
      const { data: pts } = await supabase.from('patients').select('id, full_name, phone').in('id', list.map((r) => r.patientId));
      const byId = new Map((pts || []).map((p) => [p.id, p]));
      return list.map((r) => ({ ...r, name: byId.get(r.patientId)?.full_name || 'Cliente', phone: byId.get(r.patientId)?.phone ?? null }));
    },
    enabled,
  });

  // ---------- derivados ----------
  const personOf = (a: ApptRow) => a.patients?.full_name ? a.patients : a.leads;
  const todayAppts = appts.filter((a) => new Date(a.start_time).toDateString() === now.toDateString());
  const tomorrowAppts = appts.filter((a) => new Date(a.start_time).toDateString() === tomorrow.toDateString());
  const tomorrowUnconfirmed = tomorrowAppts.filter((a) => a.status === 'scheduled');
  const slots = freeSlots(windowsTomorrow, tomorrowAppts.map((a) => ({ start: new Date(a.start_time), end: new Date(a.end_time) })));

  const money = summarizeMonth(finance, month, today);
  const negotiatingList = openProposals.filter((p) => !p.valid_until || p.valid_until >= today);
  const negotiating = negotiatingList.reduce((s, p) => s + Number(p.final_amount || 0), 0);
  const progress = goalProgress(money.received, goal);

  const columns = useMemo(() => {
    const map: Record<FunnelColumnKey, LeadRow[]> = { interessada: [], avaliacao: [], proposta: [], fechou: [] };
    for (const l of leads) {
      const col = funnelColumnOf(l.kanban_stage);
      if (!col) continue;
      if (col === 'fechou' && (l.stage_changed_at || '').slice(0, 10) < monthStart) continue;
      map[col].push(l);
    }
    return map;
  }, [leads, monthStart]);

  const tasks = buildDayTasks({
    now,
    clinicName,
    tomorrowUnconfirmed: tomorrowUnconfirmed.map((a) => ({ id: a.id, name: personOf(a)?.full_name || 'Cliente', phone: personOf(a)?.phone ?? null, start_time: a.start_time, service: a.treatments?.name || (a.appointment_type === 'evaluation' ? 'Avaliação' : null) })),
    coldLeads: leads
      .filter((l) => ['interessada', 'avaliacao', 'proposta'].includes(funnelColumnOf(l.kanban_stage) || '') && daysWithoutContact(l, now) >= 3)
      .map((l) => ({ id: l.id, name: l.full_name, phone: l.phone, days: daysWithoutContact(l, now), interest: l.treatments_of_interest?.[0] || null }))
      .sort((a, b) => b.days - a.days),
    expiringProposals: negotiatingList
      .filter((p) => p.valid_until && p.valid_until <= format(addDays(now, 2), 'yyyy-MM-dd'))
      .map((p) => ({ id: p.id, name: p.patients?.full_name || 'Cliente', phone: p.patients?.phone ?? null, valid_until: p.valid_until!, total: Number(p.final_amount || 0), number: p.proposal_number })),
    overdue: finance.filter((r) => r.status === 'previsto' && r.due_date && r.due_date < today)
      .map((r) => ({ id: r.id, name: r.contracts?.patients?.full_name || 'Cliente', phone: r.contracts?.patients?.phone ?? null, amount: Number(r.amount), due_date: r.due_date! })),
    toRenew: renew,
  });
  const pendingTasks = tasks.filter((t) => !done.includes(t.id));

  const refresh = () => ['meudia-appts', 'meudia-leads', 'meudia-proposals', 'crm-leads', 'proposals'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const toggleDone = (id: string) => {
    const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
    setDone(next);
    writeDone(doneKey, next);
  };

  const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast({ title: ok });
      refresh();
    } catch (err) {
      toast({ title: 'Não foi possível concluir', description: errorMessage(err, 'Tente novamente.'), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const confirmAppt = (a: ApptRow) => run(`c-${a.id}`, async () => {
    const { error } = await supabase.from('appointments').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', a.id);
    if (error) throw error;
  }, 'Atendimento confirmado');

  const saveLead = () => run('lead', async () => {
    if (!leadForm.name.trim()) throw new Error('Informe o nome.');
    const { error } = await supabase.from('leads').insert({
      clinic_id: clinicId!,
      full_name: leadForm.name.trim(),
      phone: leadForm.phone.trim() || null,
      treatments_of_interest: leadForm.interest.trim() ? [leadForm.interest.trim()] : null,
      kanban_stage: 'new_lead',
      source: 'manual',
      assigned_to: user?.id ?? null,
      created_by: user?.id ?? null,
    });
    if (error) throw error;
    setLeadForm({ name: '', phone: '', interest: '' });
    setNewLeadOpen(false);
  }, 'Interessada cadastrada');

  const markLost = () => run('lost', async () => {
    if (!lostLead) return;
    const { error } = await supabase.from('leads').update({ kanban_stage: 'closed_lost', lost_reason: lostReason }).eq('id', lostLead.id);
    if (error) throw error;
    setLostLead(null);
  }, 'Marcada como perdida (fica no histórico do CRM)');

  const closeProposal = (l: LeadRow) => run(`f-${l.id}`, async () => {
    if (!l.proposal_id) throw new Error('Esta interessada não tem proposta ligada.');
    const { error } = await supabase.from('proposals').update({ status: 'accepted' }).eq('id', l.proposal_id);
    if (error) throw error;
    await supabase.from('leads').update({ kanban_stage: 'closed_won', converted_at: new Date().toISOString() }).eq('id', l.id);
    navigate(`/clinic/contracts?emitir=${l.proposal_id}&returnTo=proposals`);
  }, 'Venda fechada! Confira e emita o contrato.');

  const firstName = ((user?.user_metadata?.full_name as string | undefined) || '').split(' ')[0];
  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const dateLabel = format(now, "EEEE, d 'de' MMMM", { locale: ptBR });

  const leadAction = (col: FunnelColumnKey, l: LeadRow) => {
    if (col === 'interessada') return (
      <BrandButton size="sm" onClick={() => navigate(buildEvaluationScheduleLink(l.id, professionalIdForUser(l.assigned_to)))}>
        <CalendarPlus className="h-3.5 w-3.5" /> Marcar avaliação
      </BrandButton>
    );
    if (col === 'avaliacao') return (
      <BrandButton size="sm" onClick={() => navigate(`/clinic/vendas/nova?leadId=${l.id}`)}>
        <ShoppingBag className="h-3.5 w-3.5" /> Fazer venda
      </BrandButton>
    );
    if (col === 'proposta') return (
      <BrandButton size="sm" onClick={() => closeProposal(l)} disabled={busy === `f-${l.id}` || !l.proposal_id}>
        <Check className="h-3.5 w-3.5" /> Fechou!
      </BrandButton>
    );
    return null;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{dateLabel}</p>
          <h1 className="mt-1 text-2xl font-heading font-semibold text-foreground">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <BrandButton variant="outline" onClick={() => navigate('/clinic/appointments?openNew=1')}><CalendarPlus className="h-4 w-4" /> Agendar</BrandButton>
          <BrandButton variant="outline" onClick={() => setNewLeadOpen(true)}><UserPlus className="h-4 w-4" /> Interessada</BrandButton>
          <BrandButton onClick={() => navigate('/clinic/vendas/nova')}><Plus className="h-4 w-4" /> Nova venda</BrandButton>
        </div>
      </div>

      {role === 'admin' && setupDone === false && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Termine a implantação da clínica</p>
              <p className="text-sm text-muted-foreground">Dados do contrato, seus horários e tratamentos. Cerca de 5 minutos.</p>
            </div>
            <BrandButton onClick={() => navigate('/clinic/implantacao')}>Continuar <ArrowRight className="h-4 w-4" /></BrandButton>
          </CardContent>
        </Card>
      )}

      {/* Dinheiro do mês */}
      <Card className="shadow-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold first-letter:uppercase">Dinheiro de {format(now, 'MMMM', { locale: ptBR })}</h2>
            <Link to="/clinic/financeiro" className="text-sm font-medium text-primary underline-offset-2 hover:underline">{goal ? `Meta: ${formatBRL(goal)}` : 'Definir meta'}</Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recebido</p>
              <p className="text-3xl font-heading font-semibold">{formatBRL(money.received)}</p>
              {progress && <Progress value={progress.pct} className="mt-2 h-2" aria-label={`${progress.pct}% da meta`} />}
              {progress && <p className="mt-1 text-xs text-muted-foreground">{progress.missing > 0 ? `${progress.pct}% da meta · faltam ${formatBRL(progress.missing)}` : 'Meta batida!'}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">A receber no mês</p>
              <p className="text-3xl font-heading font-semibold">{formatBRL(money.toReceive)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{money.toReceiveCount} parcela(s){money.overdueCount ? ` · ${money.overdueCount} atrasada(s): ${formatBRL(money.overdue)}` : ''}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Em negociação</p>
              <p className="text-3xl font-heading font-semibold">{formatBRL(negotiating)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{negotiatingList.length} proposta(s) em aberto</p>
            </div>
          </div>
          <p className="rounded-lg bg-primary/5 px-4 py-3 text-sm font-medium text-foreground">
            {moneyInsight({ received: money.received, goal, toReceive: money.toReceive, negotiating, negotiatingCount: negotiatingList.length })}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Agenda */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <div className="flex items-baseline justify-between gap-2">
              <CardTitle className="text-base">Agenda de hoje</CardTitle>
              <Link to="/clinic/appointments" className="text-sm font-medium text-primary underline-offset-2 hover:underline">Abrir agenda</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayAppts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum atendimento hoje.</p>
            ) : (
              <ul className="divide-y">
                {todayAppts.map((a) => {
                  const person = personOf(a);
                  return (
                    <li key={a.id} className="flex items-start gap-3 py-3">
                      <span className="w-12 shrink-0 font-heading font-semibold">{format(new Date(a.start_time), 'HH:mm')}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{person?.full_name || 'Cliente'}</p>
                        <p className="truncate text-sm text-muted-foreground">{a.treatments?.name || (a.appointment_type === 'evaluation' ? 'Avaliação' : 'Atendimento')}</p>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.status === 'scheduled' ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'}`}>{statusLabel(a.status)}</span>
                      </div>
                      {a.status === 'scheduled' && (
                        <BrandButton size="sm" variant="outline" onClick={() => confirmAppt(a)} disabled={busy === `c-${a.id}`}>Confirmar</BrandButton>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-col gap-2 rounded-lg bg-warning/10 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="font-semibold">Amanhã: {tomorrowAppts.length} atendimento(s){tomorrowUnconfirmed.length ? ` · ${tomorrowUnconfirmed.length} a confirmar` : ''}</p>
                <p className="text-muted-foreground">{slots.length ? `${slots.length} horário(s) livre(s): ${slots.slice(0, 5).join(', ')}${slots.length > 5 ? '…' : ''}` : 'Sem horários livres (ou sem expediente cadastrado).'}</p>
              </div>
              {slots.length > 0 && <BrandButton size="sm" variant="outline" onClick={() => navigate('/clinic/appointments?openNew=1')}>Preencher</BrandButton>}
            </div>
          </CardContent>
        </Card>

        {/* O que fazer hoje */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <div className="flex items-baseline justify-between gap-2">
              <CardTitle className="text-base">O que fazer hoje</CardTitle>
              <span className="text-sm text-muted-foreground">{tasks.length - pendingTasks.length} de {tasks.length} feitas</span>
            </div>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tudo em dia por aqui.</p>
            ) : (
              <ul className="divide-y">
                {tasks.map((t) => {
                  const isDone = done.includes(t.id);
                  return (
                    <li key={t.id} className={`flex items-start gap-3 py-3 ${isDone ? 'opacity-50' : ''}`}>
                      <Checkbox className="mt-1" checked={isDone} onCheckedChange={() => toggleDone(t.id)} aria-label={`Marcar como feito: ${t.title}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium ${isDone ? 'line-through' : ''}`}>{t.title}</p>
                        <p className="text-sm text-muted-foreground">{t.detail}</p>
                      </div>
                      <a href={whatsappLink(t.phone, t.message)} target="_blank" rel="noopener noreferrer" onClick={() => !isDone && toggleDone(t.id)}
                        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-btn border border-border px-3 text-sm font-medium hover:bg-muted">
                        <MessageCircle className="h-4 w-4" /> WhatsApp
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Interessadas */}
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-base">Interessadas</CardTitle>
            <Link to="/clinic/crm" className="text-sm font-medium text-primary underline-offset-2 hover:underline">Ver todas</Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {FUNNEL_COLUMNS.map((c) => {
              const list = columns[c.key];
              const value = list.reduce((s, l) => s + Number(l.proposals?.final_amount || 0), 0);
              return (
                <div key={c.key} className="space-y-2 rounded-xl bg-muted/50 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold">{c.label} · {list.length}</p>
                    {value > 0 && <p className="text-xs text-muted-foreground">{formatBRL(value)}</p>}
                  </div>
                  {list.length === 0 && <p className="text-xs text-muted-foreground">Ninguém aqui.</p>}
                  {list.slice(0, 6).map((l) => {
                    const days = daysWithoutContact(l, now);
                    return (
                      <div key={l.id} className="space-y-1.5 rounded-lg border bg-card p-3">
                        <p className="truncate font-medium" title={l.full_name}>{l.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {l.treatments_of_interest?.[0] || (l.phone ? formatPhone(l.phone) : 'Sem telefone')}
                          {l.proposals?.final_amount ? ` · ${formatBRL(Number(l.proposals.final_amount))}` : ''}
                        </p>
                        {c.key !== 'fechou' && days >= 3 && <p className="text-xs font-semibold text-warning">{days} dias sem contato</p>}
                        {c.key !== 'fechou' && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {leadAction(c.key, l)}
                            <a href={whatsappLink(l.phone, `Oi ${l.full_name.split(' ')[0]}! Aqui é da ${clinicName}.`)} target="_blank" rel="noopener noreferrer"
                              aria-label={`WhatsApp de ${l.full_name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-btn border border-border hover:bg-muted">
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                            <button type="button" aria-label={`Marcar ${l.full_name} como perdida`} onClick={() => { setLostLead(l); setLostReason(lostReasons[0]); }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-btn border border-border text-muted-foreground hover:bg-muted">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {list.length > 6 && <Link to="/clinic/crm" className="block text-xs font-medium text-primary">+ {list.length - 6} no CRM</Link>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={newLeadOpen} onOpenChange={setNewLeadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova interessada</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveLead(); }}>
            <div className="space-y-1.5"><Label htmlFor="nl-name">Nome *</Label><Input id="nl-name" value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="nl-phone">WhatsApp</Label><Input id="nl-phone" inputMode="tel" value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: formatPhone(e.target.value) })} placeholder="(11) 99999-9999" /></div>
            <div className="space-y-1.5"><Label htmlFor="nl-int">O que procura</Label><Input id="nl-int" value={leadForm.interest} onChange={(e) => setLeadForm({ ...leadForm, interest: e.target.value })} placeholder="Ex.: melasma, flacidez" /></div>
            <div className="flex justify-end gap-2 pt-1">
              <BrandButton type="button" variant="outline" onClick={() => setNewLeadOpen(false)}>Cancelar</BrandButton>
              <BrandButton type="submit" disabled={busy === 'lead'}>Salvar</BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lostLead} onOpenChange={(o) => !o && setLostLead(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Marcar {lostLead?.full_name} como perdida</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="lost-reason">Motivo</Label>
            <Select value={lostReason} onValueChange={setLostReason}>
              <SelectTrigger id="lost-reason"><SelectValue /></SelectTrigger>
              <SelectContent>{lostReasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Ela sai do Meu dia e fica no histórico do CRM.</p>
            <div className="flex justify-end gap-2">
              <BrandButton variant="outline" onClick={() => setLostLead(null)}>Cancelar</BrandButton>
              <BrandButton onClick={markLost} disabled={busy === 'lost'}>Confirmar</BrandButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
