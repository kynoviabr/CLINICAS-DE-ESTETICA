import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from 'lucide-react';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useBranding } from '@/contexts/BrandingContext';
import { useClinicFeatures } from '@/hooks/useClinicFeatures';
import { useDreData } from '@/hooks/useDreData';
import { buildDreTable, dreInsight, sumMonths, type DreTableRow } from '@/lib/finance/dre';
import { exportDreExcel, exportDrePdf } from '@/lib/finance/dreExport';
import { monthLabel, shiftMonth } from '@/lib/finance/simpleFinance';
import { formatBRL } from '@/lib/proposals/sale';

const ROW_STYLE: Record<DreTableRow['kind'], string> = {
  revenue: 'font-semibold',
  deduction: 'font-semibold text-amber-800 bg-amber-50/70',
  subtotal: 'font-semibold bg-muted/40',
  cost: 'text-muted-foreground',
  expense: 'text-muted-foreground',
  result: 'font-bold text-base bg-primary/5',
  info: 'italic text-xs text-muted-foreground',
};

const signed = (row: DreTableRow, v: number) => (['deduction', 'cost', 'expense'].includes(row.kind) && v !== 0 ? -v : v);

/** DRE simplificado em tela cheia: mês, mês anterior e acumulado do ano. Exporta Excel e PDF. */
export default function DrePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { clinicId } = useUserRole();
  const { clinicName } = useBranding();
  const { isEnabled } = useClinicFeatures();
  const stock = isEnabled('stock');
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const { data, isLoading } = useDreData(clinicId, month);

  const prev = shiftMonth(month, -1);
  const columns = [monthLabel(month), monthLabel(prev), `Acumulado ${month.slice(0, 4)}`];
  const rows = data ? buildDreTable([data.current, data.previous, sumMonths(data.yearMonths)], stock) : [];
  const received = data?.current.received ?? 0;
  const insight = data ? dreInsight(data.current, stock) : '';
  const note = stock
    ? 'Receita = parcelas recebidas no mês. Material = o que foi usado nas sessões (baixa do estoque) e perdas, pelo custo médio. Compras de material vão para o estoque e não entram de novo no resultado.'
    : 'Receita = parcelas recebidas no mês. Despesas = lançadas em Despesas pela data. Compra de material entra como custo no mês da compra.';

  const doExport = async (kind: 'xlsx' | 'pdf') => {
    setExporting(kind);
    try {
      const payload = { clinicName, title: monthLabel(month), columns, rows, note };
      if (kind === 'xlsx') await exportDreExcel(payload);
      else await exportDrePdf(payload);
    } catch (err) {
      toast({ title: 'Não foi possível exportar', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandButton variant="ghost" onClick={() => navigate(-1)} aria-label="Voltar"><ArrowLeft className="h-4 w-4" /> Voltar</BrandButton>
            <div>
              <h1 className="font-heading text-2xl font-bold">DRE simplificado</h1>
              <p className="text-sm text-muted-foreground">{clinicName}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <BrandButton variant="outline" onClick={() => doExport('xlsx')} disabled={!data || !!exporting}>
              <FileSpreadsheet className="h-4 w-4" /> {exporting === 'xlsx' ? 'Gerando…' : 'Excel'}
            </BrandButton>
            <BrandButton variant="outline" onClick={() => doExport('pdf')} disabled={!data || !!exporting}>
              <FileText className="h-4 w-4" /> {exporting === 'pdf' ? 'Gerando…' : 'PDF'}
            </BrandButton>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <button type="button" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg p-2 hover:bg-secondary"><ChevronLeft className="h-5 w-5" /></button>
          <h2 className="min-w-[180px] text-center text-lg font-semibold">{monthLabel(month)}</h2>
          <button type="button" aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg p-2 hover:bg-secondary"><ChevronRight className="h-5 w-5" /></button>
        </div>

        {insight && <p className="mb-4 rounded-lg bg-primary/5 px-4 py-3 text-sm font-medium">{insight}</p>}

        {!isEnabled('expenses') && (
          <p className="mb-4 text-xs text-muted-foreground">Despesas está desligado: o DRE mostra só receita e material. Ligue em Configurações › Geral › Funcionalidades.</p>
        )}

        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-2.5 font-medium" />
                  <th className="px-4 py-2.5 text-right font-medium">{columns[0]}</th>
                  <th className="px-4 py-2.5 text-right font-medium">% da receita</th>
                  <th className="px-4 py-2.5 text-right font-medium">{columns[1]}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{columns[2]}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className={`border-b last:border-b-0 ${ROW_STYLE[row.kind]}`}>
                    <td className={`px-4 py-2 ${row.kind === 'expense' || row.kind === 'cost' ? 'pl-8' : ''}`}>{row.label}</td>
                    {row.values.map((v, i) => {
                      const value = signed(row, v);
                      const negativeResult = row.kind === 'result' && value < 0;
                      return [
                        <td key={`v${i}`} className={`px-4 py-2 text-right tabular-nums ${negativeResult ? 'text-destructive' : row.kind === 'result' ? 'text-emerald-700' : ''}`}>
                          {formatBRL(value)}
                        </td>,
                        i === 0 ? (
                          <td key="pct" className="px-4 py-2 text-right text-xs tabular-nums text-muted-foreground">
                            {received > 0 && row.kind !== 'info' ? `${((value / received) * 100).toFixed(1).replace('.', ',')}%` : ''}
                          </td>
                        ) : null,
                      ];
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}
