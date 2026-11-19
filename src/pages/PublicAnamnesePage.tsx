import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AnamnesisFormModal from '@/components/patient/AnamnesisFormModal';
import type { AnamneseTemplate } from '@/lib/anamnese/templates';
import type { Json } from '@/integrations/supabase/types';

type LinkStatus = { status: 'ok' | 'used' | 'expired' | 'locked' | 'invalid'; clinic_name?: string; logo_url?: string | null };

const MESSAGES: Record<Exclude<LinkStatus['status'], 'ok'>, string> = {
  used: 'Esta anamnese já foi enviada. Obrigada!',
  expired: 'Este link venceu. Peça um novo à clínica.',
  locked: 'Este link foi bloqueado por tentativas erradas. Peça um novo à clínica.',
  invalid: 'Link inválido. Confira se copiou o endereço completo.',
};

/**
 * Página aberta pela paciente (sem login): confirma a data de nascimento, preenche a anamnese no celular
 * e envia direto para o cadastro dela na clínica.
 */
export default function PublicAnamnesePage() {
  const { token = '' } = useParams<{ token: string }>();
  const [link, setLink] = useState<LinkStatus | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState<{ firstName: string; templates: AnamneseTemplate[] } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.rpc('anamnese_link_status', { p_token: token }).then(({ data, error: err }) => {
      setLink(err ? { status: 'invalid' } : (data as LinkStatus));
    });
  }, [token]);

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError('');
    const { data, error: err } = await supabase.rpc('anamnese_link_open', { p_token: token, p_birth_date: birthDate });
    setChecking(false);
    if (err) { setError(err.message); return; }
    const result = data as { ok: boolean; message?: string; first_name?: string; templates?: string };
    if (!result.ok) { setError(result.message || 'Não foi possível confirmar.'); return; }
    let templates: AnamneseTemplate[] = [];
    try { templates = JSON.parse(result.templates || '[]'); } catch { templates = []; }
    setOpened({ firstName: result.first_name || '', templates: Array.isArray(templates) ? templates : [] });
  };

  const submit = async (formData: Json) => {
    const { data, error: err } = await supabase.rpc('anamnese_link_submit', { p_token: token, p_birth_date: birthDate, p_form_data: formData });
    if (err) throw new Error(err.message);
    const result = data as { ok: boolean; message?: string };
    if (!result.ok) throw new Error(result.message || 'Não foi possível enviar.');
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <header className="mb-5 flex items-center gap-3">
          {link?.logo_url && <img src={link.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />}
          <div>
            <p className="font-heading text-lg font-semibold">{link?.clinic_name || 'Anamnese'}</p>
            <p className="text-xs text-muted-foreground">Ficha de anamnese</p>
          </div>
        </header>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          {!link ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
          ) : done ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
              <p className="text-lg font-semibold">Anamnese enviada!</p>
              <p className="mt-1 text-sm text-muted-foreground">Obrigada, {opened?.firstName}. A clínica já recebeu suas respostas. Pode fechar esta página.</p>
            </div>
          ) : link.status !== 'ok' ? (
            <p className="py-6 text-center text-sm">{MESSAGES[link.status]}</p>
          ) : !opened ? (
            <form onSubmit={confirm} className="space-y-4">
              <div>
                <p className="font-medium">Olá! Antes de começar, confirme que é você.</p>
                <p className="mt-1 text-sm text-muted-foreground">Leva uns 5 minutos. Suas respostas vão direto e com segurança para a sua ficha na clínica.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="birth">Sua data de nascimento</Label>
                <Input id="birth" type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <BrandButton type="submit" className="w-full" disabled={checking || !birthDate}>
                {checking ? 'Confirmando…' : 'Começar'}
              </BrandButton>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Link pessoal, de uso único. Não compartilhe.</p>
            </form>
          ) : (
            <>
              <p className="mb-3 text-sm">Olá, <strong>{opened.firstName}</strong>! Responda com calma; dá para voltar às etapas anteriores.</p>
              <AnamnesisFormModal
                variant="page"
                open
                onOpenChange={() => undefined}
                patientId=""
                clinicId=""
                validityDays={180}
                templatesOverride={opened.templates}
                onSubmitForm={submit}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
