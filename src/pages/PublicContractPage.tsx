import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, FileSignature, Loader2, Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import AcceptForm from '@/components/public/AcceptForm';
import { sanitizeContractTemplate } from '@/lib/contractTemplateRenderer';
import { signingError, type IdentityCheck } from '@/lib/signing/acceptance';

type PublicContract = {
  ok: true;
  contract_number: string;
  html: string;
  patient_name: string;
  clinic: { name: string; phone: string | null; logo_url: string | null; primary_color: string | null };
  identity_check: IdentityCheck;
  signature: { signed_at: string; signer_name: string; document_hash: string } | null;
  can_sign: boolean;
};

/** Paciente (sem login) lê e assina o contrato pelo celular. */
export default function PublicContractPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicContract | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [signError, setSignError] = useState('');

  useEffect(() => {
    supabase.rpc('get_public_contract', { p_token: token }).then(({ data: r, error: e }) => {
      const res = r as (PublicContract | { ok: false; reason: string }) | null;
      if (e || !res || res.ok === false) setError(signingError((res as { reason?: string } | null)?.reason));
      else setData(res as PublicContract);
    });
  }, [token]);

  const html = useMemo(() => sanitizeContractTemplate(data?.html || ''), [data?.html]);

  const sign = async (fullName: string, identity: string) => {
    setBusy(true);
    setSignError('');
    const { data: r, error: e } = await supabase.rpc('sign_public_contract', { p_token: token, p_full_name: fullName, p_identity: identity });
    setBusy(false);
    const res = r as { ok?: boolean; reason?: string; attempts_left?: number; document_hash?: string } | null;
    if (e || !res?.ok) { setSignError(signingError(res?.reason, res?.attempts_left)); return; }
    setData((d) => d && ({ ...d, can_sign: false, signature: { signed_at: new Date().toISOString(), signer_name: fullName.trim(), document_hash: res.document_hash || '' } }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (error) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><p className="max-w-sm rounded-2xl border bg-white p-6 text-center text-sm">{error}</p></div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;

  const color = data.clinic.primary_color || '#059669';
  return (
    <div className="min-h-screen bg-slate-100/70 pb-10">
      <header className="sticky top-0 z-20 border-b bg-white shadow-sm print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {data.clinic.logo_url && <img src={data.clinic.logo_url} alt="" className="h-9 max-w-[120px] rounded object-contain" />}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{data.clinic.name}</p>
              <p className="text-[11px] text-slate-500">Contrato nº {data.contract_number}</p>
            </div>
          </div>
          <button type="button" onClick={() => window.print()} className="flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700">
            <Printer className="h-4 w-4" /> Salvar PDF
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {data.signature && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            <div className="min-w-0 text-sm text-emerald-900">
              <p className="font-semibold">Contrato assinado</p>
              <p>Por {data.signature.signer_name} em {format(new Date(data.signature.signed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.</p>
              <p className="mt-1 break-all text-[11px] text-emerald-800">Código de integridade: {data.signature.document_hash}</p>
            </div>
          </div>
        )}

        <article className="prose prose-sm max-w-none overflow-x-auto rounded-2xl bg-white p-5 shadow-sm sm:p-8" dangerouslySetInnerHTML={{ __html: html }} />

        {data.can_sign && (
          <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm print:hidden">
            <p className="flex items-center gap-2 text-base font-bold text-slate-900"><FileSignature className="h-5 w-5" style={{ color }} /> Assinar contrato</p>
            <AcceptForm
              identityCheck={data.identity_check}
              agreeText={`Li todo o contrato nº ${data.contract_number} e concordo com os termos. Esta assinatura eletrônica tem a mesma validade da minha assinatura no papel.`}
              buttonLabel="Assinar contrato"
              busy={busy}
              error={signError}
              color={color}
              onSubmit={sign}
            />
          </section>
        )}
      </main>
    </div>
  );
}
