import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Pencil, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCpf, formatPhone } from '@/lib/patients/validation';
import { localPhone, validateLeadSignup, type LeadSignupErrors, type LeadSignupForm } from '@/lib/crm/signupLink';

type LinkStatus = {
  status: 'ok' | 'used' | 'expired' | 'invalid';
  clinic_name?: string;
  logo_url?: string | null;
  first_name?: string | null;
  phone?: string | null;
};

const MESSAGES: Record<Exclude<LinkStatus['status'], 'ok'>, string> = {
  used: 'Seu cadastro já foi enviado. Obrigada!',
  expired: 'Este link venceu. Peça um novo à clínica pelo WhatsApp.',
  invalid: 'Link inválido. Confira se abriu o endereço completo.',
};

/** Página aberta pelo lead (sem login): faz o próprio cadastro básico antes de agendar. */
export default function PublicLeadSignupPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [link, setLink] = useState<LinkStatus | null>(null);
  const [form, setForm] = useState<LeadSignupForm>({ fullName: '', birthDate: '', cpf: '', phone: '', email: '', consent: false });
  const [errors, setErrors] = useState<LeadSignupErrors>({});
  const [serverError, setServerError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    supabase.rpc('lead_signup_status', { p_token: token }).then(({ data, error }) => {
      const result = error ? ({ status: 'invalid' } as LinkStatus) : (data as LinkStatus);
      setLink(result);
      if (result.phone) setForm((f) => ({ ...f, phone: formatPhone(localPhone(result.phone)) }));
    });
  }, [token]);

  const set = <K extends keyof LeadSignupForm>(key: K, value: LeadSignupForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    const found = validateLeadSignup(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setReviewing(true); // mostra o resumo antes de enviar
  };

  const send = async () => {
    setServerError('');
    setSending(true);
    const { data, error } = await supabase.rpc('lead_signup_submit', {
      p_token: token,
      p_full_name: form.fullName,
      p_birth_date: form.birthDate,
      p_cpf: form.cpf,
      p_phone: form.phone,
      p_consent: form.consent,
      ...(form.email.trim() ? { p_email: form.email.trim() } : {}),
    });
    setSending(false);
    if (error) { setServerError(error.message); return; }
    if ((data as { ok?: boolean })?.ok) setDone(true);
  };

  const fieldError = (key: keyof LeadSignupForm) => errors[key] && (
    <p id={`${key}-error`} className="text-xs text-destructive">{errors[key]}</p>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-md px-4 py-6">
        <header className="mb-5 flex items-center gap-3">
          {link?.logo_url && <img src={link.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />}
          <div>
            <p className="font-heading text-lg font-semibold">{link?.clinic_name || 'Cadastro'}</p>
            <p className="text-xs text-muted-foreground">Cadastro para agendamento</p>
          </div>
        </header>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          {!link ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
          ) : done ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
              <p className="text-lg font-semibold">Cadastro enviado!</p>
              <p className="mt-1 text-sm text-muted-foreground">Obrigada. Pode voltar ao WhatsApp para combinar seu horário.</p>
            </div>
          ) : link.status !== 'ok' ? (
            <p className="py-6 text-center text-sm">{MESSAGES[link.status]}</p>
          ) : reviewing ? (
            <div className="space-y-4">
              <div>
                <p className="font-medium">Confira seus dados</p>
                <p className="mt-1 text-sm text-muted-foreground">É isto que vai para a {link.clinic_name || 'clínica'}.</p>
              </div>
              <dl className="divide-y rounded-xl border text-sm">
                {[
                  ['Nome completo', form.fullName.trim().replace(/\s+/g, ' ')],
                  ['Data de nascimento', form.birthDate.split('-').reverse().join('/')],
                  ['CPF', form.cpf],
                  ['WhatsApp', form.phone],
                  ['E-mail', form.email.trim() || 'Não informado'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 px-3 py-2.5">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium break-all">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Você autorizou a clínica a usar esses dados para cadastro, agendamento e atendimento.
              </p>

              {serverError && <p className="text-sm text-destructive">{serverError}</p>}

              <p className="text-center font-medium">Confirmar e enviar?</p>
              <div className="flex gap-3">
                <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setReviewing(false)} disabled={sending}>
                  <Pencil className="h-4 w-4" /> Revisar
                </BrandButton>
                <BrandButton type="button" className="flex-1" onClick={send} disabled={sending}>
                  {sending ? 'Enviando…' : 'Confirmar e enviar'}
                </BrandButton>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <p className="font-medium">{link.first_name ? `Olá, ${link.first_name}!` : 'Olá!'} Falta pouco para agendar.</p>
                <p className="mt-1 text-sm text-muted-foreground">Preencha seus dados. Leva menos de um minuto.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input id="fullName" autoComplete="name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)}
                  aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? 'fullName-error' : undefined} />
                {fieldError('fullName')}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="birthDate">Data de nascimento</Label>
                <Input id="birthDate" type="date" autoComplete="bday" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)}
                  aria-invalid={!!errors.birthDate} aria-describedby={errors.birthDate ? 'birthDate-error' : undefined} />
                {fieldError('birthDate')}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cpf">CPF</Label>
                <Input id="cpf" inputMode="numeric" placeholder="000.000.000-00" value={form.cpf} onChange={(e) => set('cpf', formatCpf(e.target.value))}
                  aria-invalid={!!errors.cpf} aria-describedby={errors.cpf ? 'cpf-error' : undefined} />
                {fieldError('cpf')}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">WhatsApp com DDD</Label>
                <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" value={form.phone}
                  onChange={(e) => set('phone', formatPhone(e.target.value))}
                  aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'phone-error' : undefined} />
                {fieldError('phone')}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Input id="email" type="email" inputMode="email" autoComplete="email" placeholder="voce@email.com" value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} />
                {fieldError('email')}
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm">
                <Checkbox checked={form.consent} onCheckedChange={(v) => set('consent', v === true)} aria-label="Autorizo o uso dos meus dados" className="mt-0.5" />
                <span>Autorizo a clínica a usar meus dados (nome, data de nascimento, CPF, WhatsApp e e-mail) para cadastro, agendamento e atendimento.</span>
              </label>
              {fieldError('consent')}

              {serverError && <p className="text-sm text-destructive">{serverError}</p>}

              <BrandButton type="submit" className="w-full" disabled={sending}>
                Continuar
              </BrandButton>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Link pessoal, de uso único. Seus dados vão direto para a clínica.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
