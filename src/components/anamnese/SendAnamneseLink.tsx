import { publicOrigin } from '@/lib/publicOrigin';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Copy, Link2, Loader2, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BrandButton } from '@/components/ui/brand-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAnamneseOptions } from '@/hooks/useAnamneseOptions';
import { whatsappLink } from '@/lib/proposals/sale';
import { anamneseLinkMessage, anamneseLinkUrl } from '@/lib/anamnese/link';
import { isEmptySelection, selectionNames, type AnamneseSelection } from '@/lib/anamnese/selection';
import { AnamneseChooser } from './AnamneseChooser';

type Props = {
  patientId: string;
  clinicName?: string;
  /** Tratamento do agendamento, para já sugerir a anamnese dele. */
  treatmentId?: string | null;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
};

/**
 * A Dra escolhe quais anamneses a paciente responde (inicial e/ou de tratamento),
 * gera um link único (7 dias, uso único) e manda pelo WhatsApp ou copia.
 */
export function SendAnamneseLink({ patientId, clinicName, treatmentId, label = 'Enviar por link', size, disabled }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<AnamneseSelection>({ general: true, templateIds: [] });
  const [result, setResult] = useState<{ url: string; expiresAt: string; names: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const options = useAnamneseOptions(patientId, open, treatmentId);

  // Cada vez que abre, começa pela sugestão (uma vez só, para não desfazer o que a Dra marcou).
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!open) { setSeeded(false); return; }
    if (!seeded && options.data) {
      setSelection(options.data.suggestion);
      setSeeded(true);
    }
  }, [open, seeded, options.data]);

  const { data: patient } = useQuery({
    queryKey: ['patient-contact', patientId],
    queryFn: async () => {
      const { data } = await supabase.from('patients').select('full_name, phone').eq('id', patientId).maybeSingle();
      return data;
    },
    enabled: open,
  });

  const close = (o: boolean) => {
    setOpen(o);
    if (!o) setResult(null);
  };

  const generate = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('create_anamnese_link', {
      p_patient_id: patientId,
      p_include_general: selection.general,
      p_template_ids: selection.templateIds,
    });
    setLoading(false);
    if (error) {
      toast({ title: 'Não foi possível gerar o link', description: error.message, variant: 'destructive' });
      return;
    }
    const r = data as { token: string; expires_at: string };
    setResult({
      url: anamneseLinkUrl(publicOrigin(), r.token),
      expiresAt: r.expires_at,
      names: selectionNames(options.data?.templates || [], selection),
    });
  };

  const message = result && patient ? anamneseLinkMessage(patient.full_name, clinicName, result.url, result.names) : '';

  return (
    <>
      <BrandButton variant="outline" size={size} onClick={() => setOpen(true)} disabled={disabled}>
        <Link2 className="h-4 w-4" /> {label}
      </BrandButton>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-md">
          {!result ? (
            <>
              <DialogHeader>
                <DialogTitle>Quais anamneses enviar?</DialogTitle>
                <DialogDescription>
                  Vai tudo num único link. Já deixamos marcadas a inicial (se não estiver válida) e as dos tratamentos da paciente.
                </DialogDescription>
              </DialogHeader>
              {options.isLoading || !options.data ? (
                <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
              ) : (
                <AnamneseChooser
                  templates={options.data.templates}
                  generalState={options.data.generalState}
                  categoryStates={options.data.categoryStates}
                  categoryIds={options.data.categoryIds}
                  value={selection}
                  onChange={setSelection}
                />
              )}
              <BrandButton onClick={generate} disabled={loading || !options.data || isEmptySelection(selection)}>
                {loading ? 'Gerando…' : 'Gerar link'}
              </BrandButton>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Link da anamnese</DialogTitle>
                <DialogDescription>
                  A paciente confirma a data de nascimento e responde pelo celular: {result.names.join(', ')}. Vale até {format(parseISO(result.expiresAt), 'dd/MM')} e só pode ser usado uma vez.
                </DialogDescription>
              </DialogHeader>
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
