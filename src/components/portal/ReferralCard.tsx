import { publicOrigin } from '@/lib/publicOrigin';
import { useQuery } from '@tanstack/react-query';
import { Gift, Share2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { useBranding } from '@/contexts/BrandingContext';
import { referralShareText, referralUrl } from '@/lib/referral/referral';

/** Portal: link pessoal para indicar amigos. Aparece só com a indicação ligada na clínica. */
export default function ReferralCard() {
  const { clinicName } = useBranding();
  const { data } = useQuery({
    queryKey: ['my-referral'],
    queryFn: async () => (await supabase.rpc('my_referral')).data as { enabled: boolean; code?: string; reward?: string | null; referred?: number; closed?: number } | null,
  });
  if (!data?.enabled || !data.code) return null;
  const url = referralUrl(publicOrigin(), data.code);
  const text = referralShareText(clinicName || 'clínica', url);
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelado */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };
  return (
    <Card className="shadow-card">
      <CardContent className="space-y-2 p-4">
        <p className="flex items-center gap-2 font-semibold"><Gift className="h-4 w-4 text-primary" /> Indique e ganhe</p>
        <p className="text-sm text-muted-foreground">{data.reward ? `Quando um amigo seu fechar tratamento, você ganha: ${data.reward}.` : 'Indique amigos para conhecerem a clínica.'}</p>
        {!!data.referred && <p className="text-xs text-muted-foreground">Você já indicou {data.referred} pessoa(s){data.closed ? `, ${data.closed} fechou` : ''}.</p>}
        <button type="button" onClick={share} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
          <Share2 className="h-4 w-4" /> Compartilhar meu link
        </button>
      </CardContent>
    </Card>
  );
}
