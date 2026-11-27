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
import { MonthCashPanel } from '@/components/finance/MonthCashPanel';
import { useMonthDeposits } from '@/hooks/useMonthDeposits';
import { RegisterPaymentDialog } from '@/components/finance/RegisterPaymentDialog';
import { CorrectPaymentDialog } from '@/components/finance/CorrectPaymentDialog';
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
  // Sinais pagos (e retidos) também são dinheiro recebido no mês; o abatido já virou parcela paga do contrato.
  const monthDeposits = useMonthDeposits(clinicId, start, end);
  const depositsTotal = monthDeposits.reduce((sum, d) => sum + Number(d.amount), 0);
  const received = summary.received + depositsTotal;
  const progress = goalProgress(received, goal);
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
  const potential = monthPotential(received, summary.toReceive, scheduled.summary.total);
  const potentialPct = goal ? Math.round((potential / goal) * 100) : null;

  const tabs: Array<{ key: ListKey; label: string; count: number; total: number; unit: [string, string] }> = [
    { key: 'atrasadas', label: 'Atrasadas', count: summary.overdueCount, total: summary.overdue, unit: ['parcela', 'parcelas'] },
    { key: 'receber', label: 'A receber', count: summary.toReceiveCount, total: summary.toReceive, unit: ['parcela', 'parcelas'] },
    { key: 'previsto', label: 'Previsto na agenda', count: scheduled.summary.count, total: scheduled.summary.total, unit: ['atendimento', 'atendimentos'] },
    { key: 'recebidas', label: 'Recebidas', count: summary.receivedCount + monthDeposits.length, total: received, unit: ['recebimento', 'recebimentos'] },
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

      {/* Resumo do mês compacto: mês, recebido, meta e potencial numa faixa só. */}
      <Card className="shadow-card">
        <CardContent className="space-y-2.5 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="flex items-center gap-1">
              <BrandButton variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(start.slice(0, 7), -1))}><ChevronLeft className="h-4 w-4" /></BrandButton>
              <p className="min-w-40 text-center font-heading text-base font-semibold">{monthLabel(start.slice(0, 7))}</p>
              <BrandButton variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(start.slice(0, 7), 1))}><ChevronRight className="h-4 w-4" /></BrandButton>
              {!isCurrentMonth && <BrandButton variant="ghost" size="sm" onClick={() => setMonth(today.slice(0, 7))}>Hoje</BrandButton>}
            </div>
            <div className="flex flex-1 flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <p className="flex items-baseline gap-2">Recebido <span className="font-heading text-xl font-semibold text-foreground">{formatBRL(received)}</span></p>
              <p className="flex items-baseline gap-1.5">
                Potencial <span className="font-semibold text-foreground">{formatBRL(potential)}</span>
                {potentialPct !== null && <span>({potentialPct}% da meta)</span>}
              </p>
            </div>
            {editingGoal ? (
              <div className="flex items-center gap-2">
                <Input aria-label="Meta do mês em reais" inputMode="decimal" className="h-8 w-28" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} placeholder="16.000" />
                <BrandButton size="sm" onClick={saveGoal}>Salvar</BrandButton>
                <BrandButton size="sm" variant="ghost" onClick={() => setEditingGoal(false)}>Cancelar</BrandButton>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Target className="h-4 w-4" aria-hidden />
                <span>{goal ? `Meta ${formatBRL(goal)}` : 'Sem meta'}</span>
                {role === 'admin' && (
                  <button type="button" aria-label="Editar meta" className="rounded p-1 hover:bg-muted"
                    onClick={() => { setGoalInput(goal ? String(goal) : ''); setEditingGoal(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
          {progress && (
            <div className="flex items-center gap-3">
              <Progress value={progress.pct} className="h-2 flex-1" aria-label={`${progress.pct}% da meta`} />
              <span className="shrink-0 text-xs text-muted-foreground">
                {progress.missing > 0 ? `${progress.pct}% · faltam ${formatBRL(progress.missing)}` : 'Meta batida!'}
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Potencial = recebido {formatBRL(received)} + a receber {formatBRL(summary.toReceive)} + previsto na agenda {formatBRL(scheduled.summary.total)}
          </p>
        </CardContent>
      </Card>

      <div role="tablist" aria-label="Parcelas" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {tabs.map((t) => {
          const alert = t.key === 'atrasadas' && t.count > 0;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={list === t.key} onClick={() => setList(t.key)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${list === t.key ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/50'} ${alert && list !== t.key ? 'border-destructive/40' : ''}`}>
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{t.label}</span>
                <span className="text-xs text-muted-foreground">{t.count} {t.count === 1 ? t.unit[0] : t.unit[1]}</span>
              </span>
              <span className={`block font-heading text-lg font-semibold ${alert ? 'text-destructive' : ''}`}>{formatBRL(t.total)}</span>
            </button>
          );
        })}
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {list === 'previsto' ? (
            scheduled.rows.length === 0 && scheduled.summary.packageSessions === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum atendimento agendado daqui até o fim do mês.</p>
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
            <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
          ) : current.length === 0 && (list !== 'recebidas' || monthDeposits.length === 0) ? (
            <p className="p-4 text-sm text-muted-foreground">
              {list === 'atrasadas' ? 'Nenhuma parcela atrasada.' : list === 'receber' ? 'Nada a receber neste mês a partir de hoje.' : 'Nenhum recebimento neste mês ainda.'}
            </p>
          ) : (
            <ul className="divide-y">
              {list === 'recebidas' && monthDeposits.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{d.client_name || 'Cliente'}</p>
                    <p className="text-xs text-muted-foreground">
                      Sinal do agendamento · Pix{d.receipt_number ? ` · recibo ${d.receipt_number}` : ''}{d.status === 'retained' ? ' · retido (falta)' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">Recebido em {d.paid_at ? format(new Date(d.paid_at), 'dd/MM/yyyy') : '—'}</p>
                  </div>
                  <span className="font-semibold">{formatBRL(Number(d.amount))}</span>
                </li>
              ))}
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
                        <BrandButton size="sm" variant="ghost" onClick={() => payments.setCorrecting(r)} disabled={payments.undo.isPending} title="Pagamento registrado por engano">
                          <RotateCcw className="h-4 w-4" /> Corrigir baixa
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

      {clinicId && (
        <MonthCashPanel clinicId={clinicId} month={start.slice(0, 7)} received={[...lists.recebidas, ...monthDeposits.map((d) => ({ paid_method: 'Sinal (Pix)', amount: Number(d.amount) }))]} showExpenses={isEnabled('expenses')} />
      )}

      <CorrectPaymentDialog installment={payments.correcting} busy={payments.undo.isPending} onCancel={() => payments.setCorrecting(null)} onConfirm={(reason) => payments.undo.mutate(reason)} />
      <RegisterPaymentDialog
        installment={payments.paying}
        saving={payments.register.isPending}
        onClose={() => payments.setPaying(null)}
        onConfirm={(payment) => payments.register.mutate(payment)}
      />
    </div>
  );
}
