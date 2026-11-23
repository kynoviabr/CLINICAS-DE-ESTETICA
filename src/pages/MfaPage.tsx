import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandButton } from '@/components/ui/brand-button';
import { cleanCode } from '@/lib/auth/mfa';

/**
 * Verificação em duas etapas.
 * - Sem autenticador cadastrado: mostra o QR Code para cadastrar (Google Authenticator, Microsoft Authenticator, Authy…).
 * - Com autenticador: pede o código de 6 dígitos.
 */
export default function MfaPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/clinic';
  const [mode, setMode] = useState<'loading' | 'enroll' | 'challenge'>('loading');
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login', { replace: true }); return; }
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = (data?.totp || []).find((f) => f.status === 'verified');
      if (verified) { setFactorId(verified.id); setMode('challenge'); return; }
      // Remove cadastros pela metade e começa um novo.
      for (const f of data?.all || []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: enrolled, error: e } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Kynovia Estética ${new Date().toISOString().slice(0, 10)}` });
      if (e || !enrolled) { setError(e?.message || 'Não foi possível iniciar o cadastro.'); return; }
      setFactorId(enrolled.id);
      setQr(enrolled.totp.qr_code);
      setSecret(enrolled.totp.secret);
      setMode('enroll');
    })();
  }, [user, loading, navigate]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (err) { setError('Código incorreto ou vencido. Confira o horário do celular e tente o código atual.'); setCode(''); return; }
    navigate(next, { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="text-center">
          <ShieldCheck className="mx-auto mb-2 h-10 w-10 text-primary" />
          <h1 className="text-lg font-semibold">Verificação em duas etapas</h1>
        </div>
        {mode === 'loading' ? (
          error ? <p className="text-center text-sm text-destructive">{error}</p>
            : <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            {mode === 'enroll' ? (
              <div className="space-y-3 text-sm">
                <p>Para proteger os dados dos pacientes, sua conta precisa de um código do celular além da senha.</p>
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>Instale um aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou Authy).</li>
                  <li>No aplicativo, toque em adicionar e leia o QR Code abaixo.</li>
                  <li>Digite o código de 6 números que aparecer.</li>
                </ol>
                {qr && <img src={qr} alt="QR Code para o aplicativo autenticador" className="mx-auto h-48 w-48 rounded-lg border bg-white p-2" />}
                <p className="break-all text-center text-xs text-muted-foreground">Sem câmera? Digite a chave: <code>{secret}</code></p>
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">Abra o aplicativo autenticador e digite o código de 6 números.</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="mfa-code">Código</Label>
              <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} className="h-12 text-center text-xl tracking-[0.4em]"
                value={code} onChange={(e) => setCode(cleanCode(e.target.value))} />
            </div>
            {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <BrandButton type="submit" className="h-12 w-full" disabled={busy || code.length !== 6}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {mode === 'enroll' ? 'Ativar' : 'Entrar'}
            </BrandButton>
            <button type="button" className="w-full text-xs text-muted-foreground underline" onClick={async () => { await supabase.auth.signOut(); navigate('/login', { replace: true }); }}>
              Sair{mode === 'challenge' ? ' · perdi o celular (peça a um administrador para zerar)' : ''}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
