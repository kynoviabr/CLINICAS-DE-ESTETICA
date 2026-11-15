import { useQuery } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import { publicBookingUrl } from '@/lib/booking/online';

/** Liga o agendamento online (link público de avaliação e marcação pelo portal) e mostra o link para Instagram e site. */
export default function OnlineBookingCard({ clinicId, canEdit, enabled, onChange }: { clinicId: string | null; canEdit: boolean; enabled: boolean; onChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const { data: slug } = useQuery({
    queryKey: ['clinic-slug', clinicId],
    enabled: !!clinicId,
    queryFn: async () => (await supabase.from('clinics').select('slug').eq('id', clinicId!).maybeSingle()).data?.slug || null,
  });
  const url = slug ? publicBookingUrl(window.location.origin, slug) : '';

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Agendamento online</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Novos clientes marcam avaliação por um link (Instagram, site) e pacientes marcam a próxima sessão pelo portal. Usa os mesmos horários livres da agenda.</p>
        </div>
        <Switch disabled={!canEdit} checked={enabled} onCheckedChange={onChange} aria-label="Agendamento online" />
      </CardHeader>
      {enabled && url && (
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">Link para a bio do Instagram e para o site (salve as alterações para ativar):</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">{url}</code>
            <BrandButton size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(url); toast({ title: 'Link copiado' }); }}>
              <Copy className="h-4 w-4" /> Copiar
            </BrandButton>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
