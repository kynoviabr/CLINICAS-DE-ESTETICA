import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2, SearchCheck, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { brasiliaDateTime } from '@/lib/documents/signatureSheet';
import { normalizeVerificationCode, verifyPath, verifyTexts, type VerifyResult } from '@/lib/documents/verify';

/** Página pública (sem login): confere o código de verificação da folha de assinatura. */
export default function PublicVerifyPage() {
  const { code: param = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [code, setCode] = useState(param);
  const [hash, setHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const check = async (c: string, h = '') => {
    setLoading(true);
    const { data, error } = await supabase.rpc('verify_document', { p_code: c, p_hash: h || null });
    setResult(error ? { found: false, reason: 'not_found' } : (data as unknown as VerifyResult));
    setLoading(false);
  };

  useEffect(() => {
    setCode(normalizeVerificationCode(param) ?? param);
    if (param) check(param);
    else setResult(null);
  }, [param]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeVerificationCode(code);
    if (!normalized) { setResult({ found: false, reason: 'format' }); return; }
    if (normalized !== param) navigate(verifyPath(normalized), { replace: true });
    check(normalized, hash.trim());
  };

  const texts = result ? verifyTexts(result) : null;
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-md px-4 py-6">
        <header className="mb-5">
          <p className="font-heading text-lg font-semibold">Conferir documento</p>
          <p className="text-sm text-muted-foreground">
            Digite o código de verificação que está na folha de assinatura, no fim do documento.
          </p>
        </header>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="code">Código de verificação</Label>
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="C22D0-E777D"
              autoCapitalize="characters" autoComplete="off" spellCheck={false} className="font-mono uppercase tracking-wider" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hash">Código de integridade SHA-256 (opcional)</Label>
            <Input id="hash" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Cole o código do PDF para comparar"
              autoComplete="off" spellCheck={false} className="font-mono text-xs" />
          </div>
          <BrandButton type="submit" className="w-full" disabled={loading || !code.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />} Conferir
          </BrandButton>
        </form>

        {result && texts && !loading && (
          <section aria-live="polite" className={`mt-4 space-y-3 rounded-2xl border p-5 text-sm shadow-sm ${
            !result.found ? 'border-border bg-card' : texts.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
            <p className="flex items-center gap-2 font-semibold">
              {!result.found ? <XCircle className="h-5 w-5 text-muted-foreground" />
                : texts.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 text-amber-700" />}
              {texts.title}
            </p>
            {result.found ? (
              <>
                <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                  <dt className="opacity-70">Documento</dt><dd>{result.document_label}</dd>
                  {result.clinic_name && <><dt className="opacity-70">Clínica</dt><dd>{result.clinic_name}</dd></>}
                  <dt className="opacity-70">Aceito em</dt><dd>{brasiliaDateTime(result.accepted_at)} (Brasília)</dd>
                  <dt className="opacity-70">Meio</dt><dd>{texts.method}</dd>
                  {result.signer_initials && <><dt className="opacity-70">Quem aceitou</dt><dd>{result.signer_initials}</dd></>}
                  <dt className="opacity-70">Código</dt><dd className="font-mono">{result.verification_code}</dd>
                </dl>
                <p>{texts.detail}</p>
                {texts.hash && <p className="font-medium">{texts.hash}</p>}
                <p className="break-all text-xs opacity-70">Código de integridade registrado (SHA-256): {result.document_hash}</p>
              </>
            ) : (
              <p className="text-muted-foreground">{texts.detail}</p>
            )}
          </section>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Assinatura eletrônica nos termos da Lei 14.063/2020 e da MP 2.200-2/2001, art. 10, § 2º.
          Por privacidade, esta página mostra só as iniciais de quem aceitou.
        </p>
      </div>
    </div>
  );
}
