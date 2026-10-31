import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
  a_vencer: 'bg-yellow-100 text-yellow-700',
  cancelada: 'bg-muted text-muted-foreground',
};

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PortalPaymentsPage() {
  const { user } = useAuth();

  // O RLS só devolve as parcelas dos contratos do próprio paciente.
  const { data: installments = [], isLoading } = useQuery({
    queryKey: ['portal-installments', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_installments')
        .select('id, contract_id, installment_number, installments_count, payment_method, due_date, amount, status, paid_at, paid_amount, paid_method')
        .order('due_date');
      if (error) throw error;
      return (data || []) as ContractInstallment[];
    },
    enabled: !!user,
  });

  if (isLoading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const active = installments.filter((i) => i.status !== 'cancelado');
  const totalPaid = active.filter((i) => i.status === 'pago').reduce((s, i) => s + Number(i.paid_amount ?? i.amount), 0);
  const totalPending = active.filter((i) => i.status !== 'pago').reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold text-foreground">Pagamentos</h2>

      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-card"><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Pago</p>
          <p className="text-lg font-bold text-green-600">{money(totalPaid)}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Pendente</p>
          <p className="text-lg font-bold text-yellow-600">{money(totalPending)}</p>
        </CardContent></Card>
      </div>

      {installments.length === 0 ? (
        <Card className="shadow-card"><CardContent className="py-12 text-center">
          <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Nenhum pagamento encontrado</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {installments.map((inst) => {
            const situation = installmentSituation(inst);
            return (
              <Card key={inst.id} className="shadow-card">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Parcela {inst.installment_number}/{inst.installments_count} · {paymentMethodLabel(inst.payment_method)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {inst.paid_at
                        ? `Pago em ${format(new Date(`${inst.paid_at}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR })}`
                        : inst.due_date
                          ? `Venc: ${format(new Date(`${inst.due_date}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR })}`
                          : 'Sem vencimento'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{money(Number(inst.paid_amount ?? inst.amount))}</p>
                    <Badge className={`text-xs ${situationClass[situation]}`}>{SITUATION_LABELS[situation]}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
