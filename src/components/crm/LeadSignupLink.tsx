import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, CheckCircle2, Copy, Link2, MessageCircle, UserPlus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
  cpf?: string | null;
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

type CpfMatch = { type: 'patient' | 'lead'; id: string; full_name: string; created_at: string; patient_id?: string | null };

/** Campo de CPF do lead na janela do CRM (para o "Não é a mesma pessoa" levar até ele). */
export const LEAD_CPF_INPUT_ID = 'lead-drawer-cpf';

/**
 * Selo "Cadastro feito pelo lead" e avisos para a equipe. CPF repetido vira uma decisão:
 * "É a mesma pessoa" (liga o lead à paciente que já existe) ou "Não é" (corrigir o CPF).
 */
export function LeadSignupStatus({ lead, onLinked }: { lead: Lead; onLinked?: (patientId: string) => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [correcting, setCorrecting] = useState(false);
  const hasDuplicate = (lead.signup_flags || []).includes('cpf_duplicate') && !lead.patient_id;

  const { data: matches = [] } = useQuery({
    queryKey: ['lead-cpf-matches', lead.id],
    enabled: !!lead.signup_completed_at && hasDuplicate,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('lead_cpf_matches', { p_lead_id: lead.id });
      if (error) throw error;
      return (data || []) as CpfMatch[];
    },
  });

  const link = useMutation({
    mutationFn: async (patientId: string) => {
      const { data, error } = await supabase.rpc('lead_link_to_patient', { p_lead_id: lead.id, p_patient_id: patientId });
      if (error) throw error;
      return data as { patient_id: string; patient_name: string };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      qc.invalidateQueries({ queryKey: ['lead-cpf-matches', lead.id] });
      toast({ title: 'Lead ligado à paciente', description: `${r.patient_name}: propostas, vendas e a conversa do WhatsApp passam a usar a ficha dela.` });
      onLinked?.(r.patient_id);
    },
    onError: (e: Error) => toast({ title: 'Não foi possível ligar', description: e.message, variant: 'destructive' }),
  });

  if (!lead.signup_completed_at) return null;
  const otherFlags = (lead.signup_flags || []).filter((f) => f !== 'cpf_duplicate' && SIGNUP_FLAG_LABELS[f]);
  const showDuplicate = hasDuplicate && matches.length > 0;

  const notSame = () => {
    setCorrecting(true);
    const input = document.getElementById(LEAD_CPF_INPUT_ID) as HTMLInputElement | null;
    input?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    input?.focus();
  };

  return (
    <div className={`mb-3 space-y-2 rounded-xl border px-3 py-2 text-sm ${showDuplicate ? 'border-amber-300 bg-amber-50/70' : 'border-emerald-200 bg-emerald-50/70'}`}>
      <p className="flex items-center gap-2 font-medium text-emerald-800">
        <CheckCircle2 className="h-4 w-4" /> Cadastro feito pelo lead em {format(parseISO(lead.signup_completed_at), 'dd/MM/yyyy HH:mm')}
      </p>

      {showDuplicate && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-white/70 p-3">
          <p className="flex items-start gap-2 font-medium text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Este CPF já está em outro cadastro. É a mesma pessoa?
          </p>
          {matches.map((m) => (
            <div key={`${m.type}-${m.id}`} className="flex flex-wrap items-center gap-2">
              <span className="text-foreground">
                {m.type === 'patient' ? 'Paciente' : 'Lead'} <strong>{m.full_name}</strong>
                <span className="text-muted-foreground"> · desde {format(parseISO(m.created_at), 'dd/MM/yyyy')}</span>
              </span>
              {m.type === 'patient' && (
                <>
                  <BrandButton size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => navigate(`/clinic/patients/${m.id}`)}>
                    Ver ficha
                  </BrandButton>
                  <BrandButton size="sm" className="h-7 px-2 text-xs" onClick={() => link.mutate(m.id)} disabled={link.isPending}>
                    <Link2 className="h-3.5 w-3.5" /> {link.isPending ? 'Ligando…' : 'É a mesma pessoa: ligar à paciente'}
                  </BrandButton>
                </>
              )}
              {m.type === 'lead' && m.patient_id && (
                <BrandButton size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => navigate(`/clinic/patients/${m.patient_id}`)}>
                  Ver paciente
                </BrandButton>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 border-t border-amber-200 pt-2">
            <BrandButton size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={notSame}>
              Não é a mesma pessoa
            </BrandButton>
            {correcting && (
              <span className="text-xs text-amber-900">Corrija o CPF em Dados Gerais e clique em Salvar alterações. O aviso some sozinho.</span>
            )}
          </div>
        </div>
      )}

      {otherFlags.map((f) => (
        <p key={f} className="flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {SIGNUP_FLAG_LABELS[f]}{f === 'phone_changed' && lead.signup_phone ? ` (${lead.signup_phone})` : ''}
        </p>
      ))}
    </div>
  );
}
