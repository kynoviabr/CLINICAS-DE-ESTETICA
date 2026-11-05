import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, MessageCircle, Pencil, RotateCcw, Target } from 'lucide-react';
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
import { paymentMethodLabel, todayIso, type ContractInstallment } from '@/lib/finance/installments';
import {
  MONTHLY_GOAL_KEY, chargeMessage, daysLate, goalProgress, monthBounds, monthLabel, parseGoal, shiftMonth, summarizeMonth,
} from '@/lib/finance/simpleFinance';
import { readClinicSetting, upsertClinicSetting } from '@/lib/setup/clinicSetup';
import { formatBRL, whatsappLink } from '@/lib/proposals/sale';
import { errorMessage } from '@/lib/errors';

type Row = ContractInstallment & {
  contract_number: string | null;
  patient_name: string | null;
  patient_phone: string | null;
};

const LISTS = ['atrasadas', 'receber', 'recebidas'] as const;
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

  const tabs: Array<{ key: ListKey; label: string; count: number; total: number }> = [
    { key: 'atrasadas', label: 'Atrasadas', count: summary.overdueCount, total: summary.overdue },
    { key: 'receber', label: 'A receber', count: summary.toReceiveCount, total: summary.toReceive },
    { key: 'recebidas', label: 'Recebidas', count: summary.receivedCount, total: summary.received },
  ];
  const current = lists[list];

  return (
    <div className="space-y-5">
      <PageHeader title="Financeiro" description="O que entrou, o que vai entrar e quem está em atraso.">
        <Link to="/clinic/finance/contracts" className="text-sm font-medium text-primary underline-offset-2 hover:underline">Ver por contrato</Link>
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
        </CardContent>
      </Card>

      <div role="tablist" aria-label="Parcelas" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={list === t.key} onClick={() => setList(t.key)}
            className={`rounded-xl border p-4 text-left transition-colors ${list === t.key ? 'border-primary ring-2 ring-primary/30 bg-card' : 'bg-card hover:bg-muted/50'} ${t.key === 'atrasadas' && t.count > 0 ? 'border-destructive/40' : ''}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.label}</p>
            <p className={`text-2xl font-heading font-semibold ${t.key === 'atrasadas' && t.count > 0 ? 'text-destructive' : ''}`}>{formatBRL(t.total)}</p>
            <p className="text-xs text-muted-foreground">{t.count} parcela(s){t.key === 'atrasadas' ? ' até hoje' : t.key === 'receber' ? ' neste mês' : ' neste mês'}</p>
          </button>
        ))}
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {isLoading ? (
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
