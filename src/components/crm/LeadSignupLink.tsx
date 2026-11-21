import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, CheckCircle2, Copy, MessageCircle, UserPlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BrandButton } from '@/components/ui/brand-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useBranding } from '@/contexts/BrandingContext';
import { publicOrigin } from '@/lib/publicOrigin';
import { whatsappLink } from '@/lib/proposals/sale';
import { leadSignupMessage, leadSignupUrl, SIGNUP_FLAG_LABELS } from '@/lib/crm/signupLink';

type Lead = {
  id: string;
  full_name: string;
  phone?: string | null;
  patient_id?: string | null;
  signup_completed_at?: string | null;
  signup_flags?: string[] | null;
  signup_phone?: string | null;
};

/** Gera o link para o lead fazer o próprio cadastro e manda pelo WhatsApp (ou copia). */
export function LeadSignupButton({ lead, className }: { lead: Lead; className?: string }) {
  const { clinicName } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);

  if (lead.patient_id) return null;

  const generate = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('create_lead_signup_link', { p_lead_id: lead.id });
    setBusy(false);
    if (error) {
      toast({ title: 'Não foi possível gerar o link', description: error.message, variant: 'destructive' });
      return;
    }
    const r = data as { token: string; expires_at: string };
    setResult({ url: leadSignupUrl(publicOrigin(), r.token), expiresAt: r.expires_at });
    qc.invalidateQueries({ queryKey: ['crm-leads'] });
  };

  const message = result ? leadSignupMessage(lead.full_name, clinicName || undefined, result.url) : '';

  return (
    <>
      <BrandButton size="sm" variant="outline" className={className} onClick={generate} disabled={busy}>
        <UserPlus className="w-4 h-4" />
        {busy ? 'Gerando…' : lead.signup_completed_at ? 'Reenviar link de cadastro' : 'Enviar link de cadastro'}
      </BrandButton>
      <Dialog open={!!result} onOpenChange={(o) => { if (!o) setResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link de cadastro</DialogTitle>
            <DialogDescription>
              O lead preenche nome completo, data de nascimento, CPF e WhatsApp. Vale até {result && format(parseISO(result.expiresAt), 'dd/MM')} e só pode ser usado uma vez; um link novo cancela o anterior.
            </DialogDescription>
          </DialogHeader>
          {result && (
            <div className="space-y-3">
              <Input readOnly value={result.url} onFocus={(e) => e.target.select()} aria-label="Link de cadastro" />
              <div className="grid grid-cols-2 gap-2">
                <BrandButton
                  variant="outline"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(message); toast({ title: 'Mensagem copiada' }); }
                    catch { toast({ title: 'Copie o link acima', variant: 'destructive' }); }
                  }}
                >
                  <Copy className="h-4 w-4" /> Copiar
                </BrandButton>
                <a href={whatsappLink(lead.phone ?? '', message)} target="_blank" rel="noreferrer">
                  <BrandButton className="w-full" disabled={!lead.phone}><MessageCircle className="h-4 w-4" /> WhatsApp</BrandButton>
                </a>
              </div>
              {!lead.phone && <p className="text-xs text-muted-foreground">Lead sem telefone: copie e envie pelo canal da conversa.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Selo "Cadastro completo" e avisos (CPF repetido, outro WhatsApp) para a equipe. */
export function LeadSignupStatus({ lead }: { lead: Lead }) {
  if (!lead.signup_completed_at) return null;
  const flags = (lead.signup_flags || []).filter((f) => SIGNUP_FLAG_LABELS[f]);
  return (
    <div className="mb-3 space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm">
      <p className="flex items-center gap-2 font-medium text-emerald-800">
        <CheckCircle2 className="h-4 w-4" /> Cadastro feito pelo lead em {format(parseISO(lead.signup_completed_at), 'dd/MM/yyyy HH:mm')}
      </p>
      {flags.map((f) => (
        <p key={f} className="flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {SIGNUP_FLAG_LABELS[f]}{f === 'phone_changed' && lead.signup_phone ? ` (${lead.signup_phone})` : ''}
        </p>
      ))}
    </div>
  );
}
