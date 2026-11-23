import { format } from 'date-fns';
import { formatBRL } from '@/lib/proposals/sale';
import { contractAmounts, type CreditDeposit } from '@/lib/finance/deposit';

/**
 * Resumo do pagamento ao gerar contrato: valor total, adiantamento (sinal pago via Pix), valor a pagar e a soma
 * das formas de pagamento informadas.
 */
export function ContractAdvanceSummary({ total, deposits, apply, onApplyChange, informed }: {
  total: number; deposits: CreditDeposit[]; apply: boolean; onApplyChange: (v: boolean) => void; informed: number;
}) {
  const used = apply ? deposits : [];
  const { advance, due } = contractAmounts(total, used);
  const short = informed + 0.0001 < due;
  return (
    <div className="space-y-2">
      {deposits.length > 0 && (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={apply} onChange={(e) => onApplyChange(e.target.checked)} />
          <span className="min-w-0">
            <span className="font-semibold">Usar o sinal pago como adiantamento</span>
            {deposits.map((d) => (
              <span key={d.id} className="block text-xs text-emerald-800">
                Pix de {formatBRL(Number(d.amount))}{d.paid_at ? ` em ${format(new Date(d.paid_at), 'dd/MM/yyyy')}` : ''}
                {d.payer_name ? `, por ${d.payer_name}` : ''}{d.receipt_number ? ` · recibo ${d.receipt_number}` : ''}
              </span>
            ))}
          </span>
        </label>
      )}
      <dl className="space-y-1 rounded-md border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex justify-between gap-2"><dt>Valor total (proposta)</dt><dd className="font-semibold text-foreground">{formatBRL(total)}</dd></div>
        {advance > 0 && (
          <>
            <div className="flex justify-between gap-2"><dt>Adiantamento (sinal via Pix)</dt><dd className="font-semibold text-emerald-700">− {formatBRL(advance)}</dd></div>
            <div className="flex justify-between gap-2 border-t pt-1"><dt className="font-medium text-foreground">Valor a pagar</dt><dd className="font-semibold text-foreground">{formatBRL(due)}</dd></div>
          </>
        )}
        <div className="flex justify-between gap-2"><dt>Soma das formas de pagamento</dt><dd className="font-semibold text-foreground">{formatBRL(informed)}</dd></div>
        {short && <p className="text-destructive">A soma das formas de pagamento deve cobrir o {advance > 0 ? 'valor a pagar' : 'valor da proposta'}.</p>}
      </dl>
    </div>
  );
}
