import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { PageHeader } from '@/components/ui/page-header';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Check } from 'lucide-react';

export default function PaymentsPage() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['payment-plans', clinicId],
    queryFn: async () => {
      const { data } = await supabase
        .from('payment_plans')
        .select('*, patients(full_name), payment_installments(*)')
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!clinicId,
  });

  const markPaidMutation = useMutation({
    mutationFn: async (installmentId: string) => {
      const { error } = await supabase
        .from('payment_installments')
        .update({ status: 'paid' as any, paid_date: new Date().toISOString().split('T')[0] })
        .eq('id', installmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-plans'] });
      toast({ title: 'Parcela marcada como paga!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const statusColor = (s: string) => {
    if (s === 'paid') return 'text-success bg-success/10';
    if (s === 'overdue') return 'text-destructive bg-destructive/10';
    return 'text-warning bg-warning/10';
  };

  return (
    <div>
      <PageHeader title="Pagamentos" description="Gestão de pagamentos e parcelamento" />

      {isLoading && <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}</div>}

      {!isLoading && plans.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhum plano de pagamento</h3>
          <p className="text-sm text-muted-foreground">Planos são gerados a partir de contratos</p>
        </div>
      )}

      {!isLoading && plans.length > 0 && (
        <div className="space-y-6">
          {plans.map((plan: any) => {
            const installments = (plan.payment_installments || []).sort((a: any, b: any) => a.installment_number - b.installment_number);
            return (
              <Card key={plan.id} className="shadow-card animate-fade-in">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{(plan.patients as any)?.full_name}</CardTitle>
                    <BrandBadge status={plan.status as BadgeStatus} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    R$ {Number(plan.total_amount).toFixed(2)} em {plan.num_installments}x
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {installments.map((inst: any) => (
                      <div key={inst.id} className={`flex items-center justify-between p-3 rounded-lg ${statusColor(inst.status)}`}>
                        <div>
                          <span className="text-sm font-medium">Parcela {inst.installment_number}</span>
                          <span className="text-xs ml-2">Vencimento: {new Date(inst.due_date).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold">R$ {Number(inst.amount).toFixed(2)}</span>
                          {inst.status !== 'paid' && (
                            <BrandButton size="sm" onClick={() => markPaidMutation.mutate(inst.id)}>
                              <Check className="w-3 h-3" /> Pago
                            </BrandButton>
                          )}
                        </div>
                      </div>
                    ))}
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
