import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BrandButton } from '@/components/ui/brand-button';
import {
  installmentSituation,
  paymentMethodLabel,
  SITUATION_LABELS,
  type ContractInstallment,
  type InstallmentSituation,
} from '@/lib/finance/installments';

const situationClass: Record<InstallmentSituation, string> = {
  paga: 'bg-green-100 text-green-700',
  atrasada: 'bg-red-100 text-red-700',
  a_vencer: 'bg-amber-100 text-amber-700',
  cancelada: 'bg-muted text-muted-foreground',
};

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string | null) => (value ? format(new Date(`${value}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR }) : '—');

type Row = ContractInstallment & { patient_name?: string | null; contract_number?: string | null };

type Props = {
  installments: Row[];
  showContract?: boolean;
  onRegister?: (installment: ContractInstallment) => void;
  onUndo?: (installment: ContractInstallment) => void;
  busy?: boolean;
  emptyText?: string;
};

export function InstallmentsTable({ installments, showContract, onRegister, onUndo, busy, emptyText = 'Sem parcelas.' }: Props) {
  const canAct = !!onRegister || !!onUndo;
  const columns = 5 + (showContract ? 1 : 0) + (canAct ? 1 : 0);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {showContract && <TableHead>Paciente / contrato</TableHead>}
            <TableHead>Parcela</TableHead>
            <TableHead>Forma</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Situação</TableHead>
            {canAct && <TableHead className="text-right">Ação</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {installments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns} className="text-center text-muted-foreground">{emptyText}</TableCell>
            </TableRow>
          ) : (
            installments.map((inst) => {
              const situation = installmentSituation(inst);
              return (
                <TableRow key={inst.id}>
                  {showContract && (
                    <TableCell>
                      <p className="font-medium">{inst.patient_name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{inst.contract_number || '—'}</p>
                    </TableCell>
                  )}
                  <TableCell>{inst.installment_number}/{inst.installments_count}</TableCell>
                  <TableCell>{paymentMethodLabel(inst.payment_method)}</TableCell>
                  <TableCell>{date(inst.due_date)}</TableCell>
                  <TableCell className="text-right">{money(Number(inst.amount || 0))}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${situationClass[situation]}`}>
                      {SITUATION_LABELS[situation]}
                    </span>
                    {inst.status === 'pago' && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {money(Number(inst.paid_amount || 0))} em {date(inst.paid_at)} · {paymentMethodLabel(inst.paid_method)}
                      </p>
                    )}
                  </TableCell>
                  {canAct && (
                    <TableCell className="text-right">
                      {inst.status === 'previsto' && onRegister && (
                        <BrandButton size="sm" disabled={busy} onClick={() => onRegister(inst)}>Registrar pagamento</BrandButton>
                      )}
                      {inst.status === 'pago' && onUndo && (
                        <BrandButton size="sm" variant="ghost" disabled={busy} onClick={() => onUndo(inst)}>Estornar</BrandButton>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
