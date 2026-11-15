import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { identityLabel, identityReady, signingError, type IdentityCheck } from '@/lib/signing/acceptance';

type Status = { ok: true; clinic: { name: string; logo_url: string | null; primary_color: string | null }; first_name: string; identity_check: IdentityCheck };

/** Entrada no portal pelo link do WhatsApp: confirma um dado e entra, sem senha. */
export default function PortalEntryPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [identity, setIdentity] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('portal_link_status', { p_token: token }).then(({ data, error: e }) => {
      const r = data as Status | { ok: false; reason: string } | null;
      if (e || !r || r.ok === false) setError(signingError((r as { reason?: string } | null)?.reason));
      else setStatus(r as Status);
    });
  }, [token]);

  const enter = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    const { data, error: fnError } = await supabase.functions.invoke('portal-acesso', { body: { token, identity } });
    const r = (data || (await (fnError as { context?: Response } | null)?.context?.json?.().catch(() => null))) as { ok?: boolean; reason?: string; attempts_left?: number; token_hash?: string } | null;
    if (!r?.ok || !r.token_hash) { setBusy(false); setError(signingError(r?.reason, r?.attempts_left)); return; }
    const { error: otpError } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: r.token_hash });
    if (otpError) { setBusy(false); setError('Não foi possível entrar. Tente de novo.'); return; }
    navigate('/portal', { replace: true });
  };

  useEffect(() => {
    if (status?.identity_check === 'none' && !busy) void enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const color = status?.clinic.primary_color || '#059669';
  const label = status ? identityLabel(status.identity_check) : null;
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
        {status?.clinic.logo_url && <img src={status.clinic.logo_url} alt="" className="mx-auto h-12 object-contain" />}
        {error && !status ? <p className="text-center text-sm">{error}</p> : !status ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
        ) : (
          <form onSubmit={enter} className="space-y-4">
            <div className="text-center">
              <p className="text-lg font-semibold">Olá, {status.first_name}!</p>
              <p className="text-sm text-muted-foreground">Seu espaço na {status.clinic.name}: sessões, contrato, pagamentos e fotos.</p>
            </div>
            {label && (
              <div className="space-y-1.5">
                <Label htmlFor="pid">{label}</Label>
                {status.identity_check === 'birth_date'
                  ? <Input id="pid" type="date" value={identity} onChange={(e) => setIdentity(e.target.value)} className="h-12 text-base" />
                  : <Input id="pid" inputMode="numeric" maxLength={3} value={identity} onChange={(e) => setIdentity(e.target.value.replace(/\D/g, ''))} className="h-12 text-base" placeholder="000" />}
              </div>
            )}
            {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <button type="submit" disabled={busy || !identityReady(status.identity_check, identity)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white disabled:opacity-50" style={{ backgroundColor: color }}>
              {busy && <Loader2 className="h-5 w-5 animate-spin" />} Entrar
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Sem senha. Você continua conectado neste aparelho.</p>
          </form>
        )}
      </div>
    </div>
  );
}
