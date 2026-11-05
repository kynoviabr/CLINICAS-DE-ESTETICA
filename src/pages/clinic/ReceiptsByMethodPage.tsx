import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, parseISO } from 'date-fns';
import { ArrowLeft, Banknote, ChevronLeft, ChevronRight, CreditCard, FileSpreadsheet, FileText, Landmark, QrCode, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useBranding } from '@/contexts/BrandingContext';
import { supabase } from '@/integrations/supabase/client';
import { paymentMethodLabel, todayIso } from '@/lib/finance/installments';
import { methodOf, summarizeByMethod, variation } from '@/lib/finance/receiptsByMethod';
import { monthLabel, shiftMonth } from '@/lib/finance/simpleFinance';
import { exportReportExcel, exportReportPdf, type ExportReport } from '@/lib/exportTable';
import { formatBRL } from '@/lib/proposals/sale';

const ICONS: Record<string, LucideIcon> = { pix: QrCode, card: CreditCard, credit: CreditCard, debit: CreditCard, cash: Banknote, boleto: Landmark, transfer: Landmark };

type PaidDetail = {
  id: string; paid_at: string | null; paid_amount: number | null; paid_method: string | null; payment_method: string | null;
  installment_number: number; installments_count: number;
  contracts?: { contract_number?: string | null; patients?: { full_name?: string | null } | null } | null;
};

/** Financeiro › Recebimentos por forma: quanto entrou em Pix, cartão, dinheiro, boleto... */
export default function ReceiptsByMethodPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { clinicId } = useUserRole();
  const { clinicName } = useBranding();
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [filter, setFilter] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const prev = shiftMonth(month, -1);
  const today = todayIso();

  const { data, isLoading } = useQuery({
    queryKey: ['receipts-by-method', clinicId, month],
    queryFn: async () => {
      const from = `${prev}-01`;
      const to = format(endOfMonth(parseISO(`${month}-01`)), 'yyyy-MM-dd');
      const [paidRes, openRes] = await Promise.all([
        supabase.from('contract_installments')
          .select('id, paid_at, paid_amount, paid_method, payment_method, installment_number, installments_count, contracts!inner(contract_number, patients(full_name))')
          .eq('clinic_id', clinicId!).eq('status', 'pago').gte('paid_at', from).lte('paid_at', to)
          .order('paid_at', { ascending: false }).limit(5000),
        supabase.from('contract_installments').select('due_date, amount, payment_method')
          .eq('clinic_id', clinicId!).eq('status', 'previsto').gte('due_date', `${month}-01`).lte('due_date', to).limit(5000),
      ]);
      if (paidRes.error) throw paidRes.error;
      if (openRes.error) throw openRes.error;
      return { paid: paidRes.data as unknown as PaidDetail[], open: openRes.data || [] };
    },
    enabled: !!clinicId,
  });

  const summary = useMemo(
    () => summarizeByMethod(data?.paid ?? [], (data?.open ?? []).map((o) => ({ ...o, amount: Number(o.amount) })), month, prev, today),
    [data, month, prev, today],
  );
  const details = (data?.paid ?? [])
    .filter((p) => p.paid_at?.slice(0, 7) === month)
    .filter((p) => !filter || methodOf(p) === filter);
  const totalVar = variation(summary.total, summary.previousTotal);

  const doExport = async (kind: 'xlsx' | 'pdf') => {
    setExporting(kind);
    try {
      const allDetails = (data?.paid ?? []).filter((p) => p.paid_at?.slice(0, 7) === month);
      const report: ExportReport = {
        clinicName,
        title: 'Recebimentos por forma de pagamento',
        subtitle: monthLabel(month),
        fileName: `Recebimentos ${monthLabel(month)}`,
        sections: [
          {
            title: 'Resumo',
            head: ['Forma', 'Pagamentos', 'Recebido', '% do mês', monthLabel(prev), 'A receber no mês'],
            rows: [
              ...summary.methods.map((m) => [m.label, m.count, m.total, `${String(m.pct).replace('.', ',')}%`, m.previousTotal, m.toReceive]),
              ['Total', summary.count, summary.total, '100%', summary.previousTotal, summary.toReceive],
            ],
            moneyColumns: [2, 4, 5],
            boldLastRow: true,
          },
          {
            title: 'Pagamentos do mês',
            head: ['Data', 'Cliente', 'Contrato', 'Parcela', 'Forma', 'Valor'],
            rows: allDetails.map((p) => [
              p.paid_at ? format(parseISO(p.paid_at), 'dd/MM/yyyy') : '',
              p.contracts?.patients?.full_name || '',
              p.contracts?.contract_number || '',
              `${p.installment_number}/${p.installments_count}`,
              paymentMethodLabel(methodOf(p)),
              Number(p.paid_amount || 0),
            ]),
            moneyColumns: [5],
          },
        ],
        note: 'Recebido = parcelas pagas no mês, pela data do pagamento. A receber = parcelas previstas que ainda vencem neste mês.',
      };
      if (kind === 'xlsx') await exportReportExcel(report);
      else await exportReportPdf(report);
    } catch (err) {
      toast({ title: 'Não foi possível exportar', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div>
      <PageHeader title="Recebimentos por forma" description="Quanto entrou no Pix, no cartão, em dinheiro e no boleto.">
        <BrandButton variant="ghost" onClick={() => navigate('/clinic/financeiro')}><ArrowLeft className="h-4 w-4" /> Financeiro</BrandButton>
        <BrandButton variant="outline" onClick={() => doExport('xlsx')} disabled={!data || !!exporting}>
          <FileSpreadsheet className="h-4 w-4" /> {exporting === 'xlsx' ? 'Gerando…' : 'Excel'}
        </BrandButton>
        <BrandButton variant="outline" onClick={() => doExport('pdf')} disabled={!data || !!exporting}>
          <FileText className="h-4 w-4" /> {exporting === 'pdf' ? 'Gerando…' : 'PDF'}
        </BrandButton>
      </PageHeader>

      <div className="mb-4 flex items-center gap-2">
        <button type="button" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg p-2 hover:bg-secondary"><ChevronLeft className="h-5 w-5" /></button>
        <h2 className="min-w-[180px] text-center text-lg font-semibold">{monthLabel(month)}</h2>
        <button type="button" aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg p-2 hover:bg-secondary"><ChevronRight className="h-5 w-5" /></button>
      </div>

      <Card className="mb-4 shadow-card"><CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recebido no mês</p>
          <p className="text-3xl font-heading font-semibold">{formatBRL(summary.total)}</p>
          <p className="text-xs text-muted-foreground">
            {summary.count} pagamento(s)
            {totalVar !== null && <> · <span className={totalVar >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{totalVar >= 0 ? '+' : ''}{String(totalVar).replace('.', ',')}%</span> vs {monthLabel(prev).toLowerCase()}</>}
          </p>
        </div>
        {summary.toReceive > 0 && (
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ainda a receber no mês</p>
            <p className="text-xl font-semibold">{formatBRL(summary.toReceive)}</p>
          </div>
        )}
      </CardContent></Card>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : summary.methods.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum recebimento em {monthLabel(month).toLowerCase()}.</p>
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {summary.methods.map((m) => {
            const Icon = ICONS[m.method] ?? Wallet;
            const v = variation(m.total, m.previousTotal);
            const active = filter === m.method;
            return (
              <button
                type="button"
                key={m.method}
                onClick={() => setFilter(active ? null : m.method)}
                className={`rounded-xl border bg-card p-4 text-left shadow-card transition-colors ${active ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/40'}`}
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" /> {m.label}</div>
                <p className="mt-1 text-xl font-semibold">{formatBRL(m.total)}</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, m.pct)}%` }} /></div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {String(m.pct).replace('.', ',')}% · {m.count} pagamento(s)
                  {v !== null && <> · <span className={v >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{v >= 0 ? '+' : ''}{String(v).replace('.', ',')}%</span></>}
                </p>
                {m.toReceive > 0 && <p className="text-xs text-muted-foreground">+ {formatBRL(m.toReceive)} a receber</p>}
              </button>
            );
          })}
        </div>
      )}

      <Card className="shadow-card"><CardContent className="p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Pagamentos do mês{filter ? ` · ${paymentMethodLabel(filter)}` : ''}</p>
          {filter && <button type="button" className="text-xs text-primary hover:underline" onClick={() => setFilter(null)}>Ver todas as formas</button>}
        </div>
        {details.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhum pagamento.</p>
        ) : (
          <ul className="divide-y">
            {details.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-12 text-xs text-muted-foreground">{p.paid_at ? format(parseISO(p.paid_at), 'dd/MM') : ''}</span>
                <span className="min-w-0 flex-1 truncate">{p.contracts?.patients?.full_name || 'Cliente'}
                  <span className="text-xs text-muted-foreground"> · parcela {p.installment_number}/{p.installments_count}</span>
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{paymentMethodLabel(methodOf(p))}</span>
                <span className="w-28 text-right font-medium">{formatBRL(Number(p.paid_amount || 0))}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>
    </div>
  );
}
