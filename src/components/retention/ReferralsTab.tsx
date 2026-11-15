import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Gift } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import { STAGE_LABEL } from '@/lib/referral/referral';

/** Retorno > Indicações: quem indicou quem, quem fechou e as recompensas a entregar. */
export default function ReferralsTab({ clinicId }: { clinicId: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['referrals', clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('referral_list', { p_clinic_id: clinicId! });
      if (error) throw error;
      return data || [];
    },
  });
  const reward = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase.rpc('mark_referral_reward', { p_lead_id: leadId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['referrals', clinicId] }); toast({ title: 'Recompensa marcada como entregue' }); },
    onError: (e: Error) => toast({ title: 'Não foi possível marcar', description: e.message, variant: 'destructive' }),
  });
  const pending = rows.filter((r) => r.lead_stage === 'closed_won' && !r.reward_given_at).length;

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{rows.length} indicação(ões) · {pending} recompensa(s) a entregar. Ligue a indicação em Configurações &gt; Atendimento.</p>
      {rows.length === 0 ? (
        <Card className="shadow-card"><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhuma indicação ainda.</CardContent></Card>
      ) : (
        <Card className="shadow-card"><CardContent className="divide-y p-0">
          {rows.map((r) => (
            <div key={r.lead_id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.lead_name} <span className="text-xs font-normal text-muted-foreground">· {STAGE_LABEL[r.lead_stage] || r.lead_stage}</span></p>
                <p className="text-xs text-muted-foreground">Indicado(a) por {r.referrer_name} em {format(new Date(r.created_at), 'dd/MM/yyyy')}</p>
              </div>
              {r.reward_given_at ? (
                <span className="text-xs text-emerald-700">Recompensa entregue em {format(new Date(r.reward_given_at), 'dd/MM')}</span>
              ) : r.lead_stage === 'closed_won' ? (
                <BrandButton size="sm" onClick={() => reward.mutate(r.lead_id)} disabled={reward.isPending}><Gift className="h-4 w-4" /> Entreguei a recompensa</BrandButton>
              ) : <span className="text-xs text-muted-foreground">Recompensa quando fechar</span>}
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  );
}
