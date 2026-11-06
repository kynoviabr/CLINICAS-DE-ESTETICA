import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Copy, Link2, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BrandButton } from '@/components/ui/brand-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { whatsappLink } from '@/lib/proposals/sale';
import { anamneseLinkMessage, anamneseLinkUrl } from '@/lib/anamnese/link';

/** Gera o link da anamnese (7 dias, uso único) e manda pelo WhatsApp ou copia. */
export function SendAnamneseLink({ patientId, clinicName }: { patientId: string; clinicName?: string }) {
  const { toast } = useToast();
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: patient } = useQuery({
    queryKey: ['patient-contact', patientId],
    queryFn: async () => {
      const { data } = await supabase.from('patients').select('full_name, phone').eq('id', patientId).maybeSingle();
      return data;
    },
  });

  const generate = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('create_anamnese_link', { p_patient_id: patientId });
    setLoading(false);
    if (error) {
      toast({ title: 'Não foi possível gerar o link', description: error.message, variant: 'destructive' });
      return;
    }
    const r = data as { token: string; expires_at: string };
    setResult({ url: anamneseLinkUrl(window.location.origin, r.token), expiresAt: r.expires_at });
  };

  const message = result && patient ? anamneseLinkMessage(patient.full_name, clinicName, result.url) : '';

  return (
    <>
      <BrandButton variant="outline" onClick={generate} disabled={loading}>
        <Link2 className="h-4 w-4" /> {loading ? 'Gerando…' : 'Enviar por link'}
      </BrandButton>
      <Dialog open={!!result} onOpenChange={(o) => { if (!o) setResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link da anamnese</DialogTitle>
            <DialogDescription>
              A paciente confirma a data de nascimento e preenche pelo celular. Vale até {result && format(parseISO(result.expiresAt), 'dd/MM')} e só pode ser usado uma vez.
            </DialogDescription>
          </DialogHeader>
          {result && (
            <div className="space-y-3">
              <Input readOnly value={result.url} onFocus={(e) => e.target.select()} />
              <div className="grid grid-cols-2 gap-2">
                <BrandButton
                  variant="outline"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(message || result.url); toast({ title: 'Mensagem copiada' }); }
                    catch { toast({ title: 'Copie o link acima', variant: 'destructive' }); }
                  }}
                >
                  <Copy className="h-4 w-4" /> Copiar
                </BrandButton>
                <a href={whatsappLink(patient?.phone ?? '', message)} target="_blank" rel="noreferrer">
                  <BrandButton className="w-full" disabled={!patient?.phone}><MessageCircle className="h-4 w-4" /> WhatsApp</BrandButton>
                </a>
              </div>
              {!patient?.phone && <p className="text-xs text-muted-foreground">Sem telefone no cadastro: copie e envie pelo canal que preferir.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
