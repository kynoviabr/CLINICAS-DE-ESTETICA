import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, FileBarChart, Wallet, MessageCircle, Pencil, Receipt, RotateCcw, Target } from 'lucide-react';
import { useClinicFeatures } from '@/hooks/useClinicFeatures';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useUrlState } from '@/hooks/useUrlState';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { RegisterPaymentDialog } from '@/components/finance/RegisterPaymentDialog';
import { useInstallmentPayments } from '@/components/finance/useInstallmentPayments';
import { useScheduledRevenue } from '@/hooks/useScheduledRevenue';
import { paymentMethodLabel, todayIso, type ContractInstallment } from '@/lib/finance/installments';
import {
  MONTHLY_GOAL_KEY, chargeMessage, daysLate, goalProgress, monthBounds, monthLabel, monthPotential, parseGoal, shiftMonth, summarizeMonth,
} from '@/lib/finance/simpleFinance';
import { readClinicSetting, upsertClinicSetting } from '@/lib/setup/clinicSetup';
import { formatBRL, whatsappLink } from '@/lib/proposals/sale';
import { errorMessage } from '@/lib/errors';

type Row = ContractInstallment & {
  contract_number: string | null;
  patient_name: string | null;
  patient_phone: string | null;
};

const LISTS = ['atrasadas', 'receber', 'previsto', 'recebidas'] as const;
type ListKey = (typeof LISTS)[number];

const SELECT = 'id, contract_id, installment_number, installments_count, payment_method, due_date, amount, status, paid_at, paid_amount, paid_method, contracts!inner(contract_number, patients(full_name, phone))';

type RawRow = ContractInstallment & { contracts?: { contract_number?: string | null; patients?: { full_name?: string | null; phone?: string | null } | null } | null };
const toRow = (r: RawRow): Row => ({
  ...r,
  contract_number: r.contracts?.contract_number ?? null,
  patient_name: r.contracts?.patients?.full_name ?? null,
  patient_phone: r.contracts?.patients?.phone ?? null,
});

export default function SimpleFinancePage() {
  const { clinicId, role } = useUserRole();
  const { clinicName } = useBranding();
  const { toast } = useToast();
  const { isEnabled } = useClinicFeatures();
  const qc = useQueryClient();
  const today = todayIso();
  const [month, setMonth] = useUrlState<string>('mes', today.slice(0, 7));
  const [list, setList] = useUrlState<ListKey>('lista', 'atrasadas', LISTS);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const payments = useInstallmentPayments();
  const { start, end } = monthBounds(/^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7));

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['simple-finance', clinicId, start],
    queryFn: async () => {
      const [paid, open] = await Promise.all([
        supabase.from('contract_installments').select(SELECT).eq('clinic_id', clinicId!).eq('status', 'pago')
          .gte('paid_at', start).lte('paid_at', end).order('paid_at', { ascending: false }).limit(500),
        supabase.from('contract_installments').select(SELECT).eq('clinic_id', clinicId!).eq('status', 'previsto')
          .lte('due_date', end).order('due_date').limit(500),
      ]);
      if (paid.error) throw paid.error;
      if (open.error) throw open.error;
      return [...(paid.data as RawRow[]), ...(open.data as RawRow[])].map(toRow);
    },
    enabled: !!clinicId,
  });

  const { data: goal = null } = useQuery({
    queryKey: ['monthly-goal', clinicId],
    queryFn: async () => parseGoal(await readClinicSetting(clinicId!, MONTHLY_GOAL_KEY)),
    enabled: !!clinicId,
  });

  const summary = summarizeMonth(rows, start.slice(0, 7), today);
  const progress = goalProgress(summary.received, goal);
  const isCurrentMonth = start.slice(0, 7) === today.slice(0, 7);

  const lists = useMemo(() => ({
    atrasadas: rows.filter((r) => r.status === 'previsto' && r.due_date && r.due_date < today),
    receber: rows.filter((r) => r.status === 'previsto' && r.due_date && r.due_date >= today && r.due_date >= start && r.due_date <= end),
    recebidas: rows.filter((r) => r.status === 'pago'),
  }), [rows, today, start, end]);

  const saveGoal = async () => {
    const value = parseGoal(goalInput);
    if (!value) { toast({ title: 'Informe a meta em reais', variant: 'destructive' }); return; }
    try {
      await upsertClinicSetting(clinicId!, MONTHLY_GOAL_KEY, String(value));
      qc.invalidateQueries({ queryKey: ['monthly-goal'] });
      setEditingGoal(false);
      toast({ title: 'Meta do mês salva' });
    } catch (err) {
      toast({ title: 'Não foi possível salvar a meta', description: errorMessage(err, 'Tente novamente.'), variant: 'destructive' });
    }
  };

  const scheduled = useScheduledRevenue(clinicId, start.slice(0, 7));
  const potential = monthPotential(summary.received, summary.toReceive, scheduled.summary.total);
  const potentialPct = goal ? Math.round((potential / goal) * 100) : null;

  const tabs: Array<{ key: ListKey; label: string; count: number; total: number; hint: string }> = [
    { key: 'atrasadas', label: 'Atrasadas', count: summary.overdueCount, total: summary.overdue, hint: 'parcela(s) até hoje' },
    { key: 'receber', label: 'A receber', count: summary.toReceiveCount, total: summary.toReceive, hint: 'parcela(s) neste mês' },
    { key: 'previsto', label: 'Previsto na agenda', count: scheduled.summary.count, total: scheduled.summary.total, hint: 'atendimento(s) agendado(s)' },
    { key: 'recebidas', label: 'Recebidas', count: summary.receivedCount, total: summary.received, hint: 'parcela(s) neste mês' },
  ];
  const current = list === 'previsto' ? [] : lists[list];

  return (
    <div className="space-y-5">
      <PageHeader title="Financeiro" description="O que entrou, o que vai entrar e quem está em atraso.">
        <Link to="/clinic/finance/contracts" className="text-sm font-medium text-primary underline-offset-2 hover:underline">Ver por contrato</Link>
        {isEnabled('expenses') && (
          <Link to="/clinic/despesas"><BrandButton variant="outline"><Receipt className="h-4 w-4" /> Despesas</BrandButton></Link>
        )}
        <Link to="/clinic/financeiro/recebimentos"><BrandButton variant="outline"><Wallet className="h-4 w-4" /> Por forma de pagamento</BrandButton></Link>
        <Link to="/clinic/financeiro/dre"><BrandButton><FileBarChart className="h-4 w-4" /> DRE</BrandButton></Link>
      </PageHeader>

      <div className="flex items-center gap-2">
        <BrandButton variant="outline" size="sm" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(start.slice(0, 7), -1))}><ChevronLeft className="h-4 w-4" /></BrandButton>
        <p className="min-w-44 text-center font-heading text-lg font-semibold">{monthLabel(start.slice(0, 7))}</p>
        <BrandButton variant="outline" size="sm" aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(start.slice(0, 7), 1))}><ChevronRight className="h-4 w-4" /></BrandButton>
        {!isCurrentMonth && <BrandButton variant="ghost" size="sm" onClick={() => setMonth(today.slice(0, 7))}>Hoje</BrandButton>}
      </div>

      <Card className="shadow-card">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recebido no mês</p>
              <p className="text-3xl font-heading font-semibold">{formatBRL(summary.received)}</p>
            </div>
            <div className="text-right">
              {editingGoal ? (
                <div className="flex items-center gap-2">
                  <Input aria-label="Meta do mês em reais" inputMode="decimal" className="w-32" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} placeholder="16.000" />
                  <BrandButton size="sm" onClick={saveGoal}>Salvar</BrandButton>
                  <BrandButton size="sm" variant="ghost" onClick={() => setEditingGoal(false)}>Cancelar</BrandButton>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{goal ? `Meta: ${formatBRL(goal)}` : 'Sem meta definida'}</span>
                  {role === 'admin' && (
                    <button type="button" aria-label="Editar meta" className="rounded p-1 text-muted-foreground hover:bg-muted"
                      onClick={() => { setGoalInput(goal ? String(goal) : ''); setEditingGoal(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {progress && (
            <>
              <Progress value={progress.pct} className="h-2.5" aria-label={`${progress.pct}% da meta`} />
              <p className="text-sm text-muted-foreground">
                {progress.missing > 0 ? `${progress.pct}% da meta · faltam ${formatBRL(progress.missing)}` : 'Meta do mês batida!'}
                {progress.missing > 0 && summary.toReceive > 0 && ` · ${formatBRL(summary.toReceive)} ainda a receber neste mês`}
              </p>
            </>
          )}
          <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm">
            <p>
              <span className="font-semibold">Potencial do mês: {formatBRL(potential)}</span>
              {potentialPct !== null && <span className="text-muted-foreground"> · {potentialPct}% da meta</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              Recebido {formatBRL(summary.received)} + a receber {formatBRL(summary.toReceive)} + previsto na agenda {formatBRL(scheduled.summary.total)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div role="tablist" aria-label="Parcelas" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={list === t.key} onClick={() => setList(t.key)}
            className={`rounded-xl border p-4 text-left transition-colors ${list === t.key ? 'border-primary ring-2 ring-primary/30 bg-card' : 'bg-card hover:bg-muted/50'} ${t.key === 'atrasadas' && t.count > 0 ? 'border-destructive/40' : ''}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.label}</p>
            <p className={`text-2xl font-heading font-semibold ${t.key === 'atrasadas' && t.count > 0 ? 'text-destructive' : ''}`}>{formatBRL(t.total)}</p>
            <p className="text-xs text-muted-foreground">{t.count} {t.hint}</p>
          </button>
        ))}
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {list === 'previsto' ? (
            scheduled.rows.length === 0 && scheduled.summary.packageSessions === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">Nenhum atendimento agendado daqui até o fim do mês.</p>
            ) : (
              <div className="divide-y">
                <div className="space-y-1 p-4 text-sm">
                  <p className="font-semibold">Por tratamento (avulsos agendados, pelo preço do tratamento)</p>
                  {scheduled.summary.byTreatment.length === 0 && <p className="text-muted-foreground">Nenhum avulso com valor agendado.</p>}
                  {scheduled.summary.byTreatment.map((t) => (
                    <p key={t.name} className="flex justify-between gap-2"><span>{t.count}× {t.name}</span><span className="font-medium">{formatBRL(t.total)}</span></p>
                  ))}
                  {scheduled.summary.packageSessions > 0 && (
                    <p className="pt-1 text-xs text-muted-foreground">
                      + {scheduled.summary.packageSessions} sessão(ões) de pacotes já vendidos: o valor delas já está nas parcelas a receber.
                    </p>
                  )}
                </div>
                <ul className="divide-y">
                  {scheduled.rows.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{a.client || 'Cliente'}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(a.start_time), 'dd/MM HH:mm')} · {a.treatment?.name || (a.appointment_type === 'evaluation' ? 'Avaliação' : 'Atendimento')}
                          {a.contract_id ? ' · pacote já vendido' : a.appointment_type === 'evaluation' ? ' · sem valor' : ''}
                        </p>
                      </div>
                      <span className={a.contract_id || a.appointment_type === 'evaluation' ? 'text-muted-foreground' : 'font-semibold'}>
                        {a.contract_id || a.appointment_type === 'evaluation' || !a.treatment ? '—' : formatBRL(Number(a.treatment.default_price ?? a.treatment.price ?? 0))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          ) : isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">Carregando...</p>
          ) : current.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              {list === 'atrasadas' ? 'Nenhuma parcela atrasada.' : list === 'receber' ? 'Nada a receber neste mês a partir de hoje.' : 'Nenhum recebimento neste mês ainda.'}
            </p>
          ) : (
            <ul className="divide-y">
              {current.map((r) => {
                const late = list === 'atrasadas' && r.due_date ? daysLate(r.due_date, today) : 0;
                const installmentLabel = `${r.installment_number}/${r.installments_count}`;
                return (
                  <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{r.patient_name || 'Cliente'}</p>
                      <p className="text-xs text-muted-foreground">
                        Contrato {r.contract_number || '—'} · parcela {installmentLabel} · {paymentMethodLabel(r.status === 'pago' ? r.paid_method : r.payment_method)}
                      </p>
                      <p className={`text-xs ${late ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                        {r.status === 'pago'
                          ? `Recebido em ${r.paid_at ? format(parseISO(r.paid_at), 'dd/MM/yyyy') : '—'}`
                          : `Vence ${r.due_date ? format(parseISO(r.due_date), 'dd/MM/yyyy') : '—'}${late ? ` · ${late} dia(s) de atraso` : ''}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span className="mr-2 font-semibold">{formatBRL(Number(r.status === 'pago' ? r.paid_amount ?? r.amount : r.amount))}</span>
                      {list === 'atrasadas' && r.due_date && (
                        <a href={whatsappLink(r.patient_phone, chargeMessage({ clientName: r.patient_name || '', clinicName, amount: Number(r.amount), dueDate: r.due_date, installment: installmentLabel }))}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-btn border border-border px-3 text-sm font-medium hover:bg-muted">
                          <MessageCircle className="h-4 w-4" /> Cobrar
                        </a>
                      )}
                      {r.status === 'previsto' && (
                        <BrandButton size="sm" onClick={() => payments.setPaying(r)} disabled={payments.register.isPending}>Recebi</BrandButton>
                      )}
                      {r.status === 'pago' && role === 'admin' && (
                        <BrandButton size="sm" variant="ghost" onClick={() => payments.undo.mutate(r)} disabled={payments.undo.isPending} title="Desfazer o recebimento">
                          <RotateCcw className="h-4 w-4" /> Estornar
                        </BrandButton>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <RegisterPaymentDialog
        installment={payments.paying}
        saving={payments.register.isPending}
        onClose={() => payments.setPaying(null)}
        onConfirm={(payment) => payments.register.mutate(payment)}
      />
    </div>
  );
}
