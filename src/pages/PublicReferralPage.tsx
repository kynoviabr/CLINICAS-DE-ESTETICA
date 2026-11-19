import { publicOrigin } from '@/lib/publicOrigin';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { publicBookingUrl } from '@/lib/booking/online';
import { referralError } from '@/lib/referral/referral';

type Page = { ok: boolean; referrer_first_name: string; clinic: { name: string; logo_url: string | null; primary_color: string | null; slug: string }; online_booking: boolean };

/** Página do amigo indicado: deixa nome e WhatsApp e a clínica chama. */
export default function PublicReferralPage() {
  const { code = '' } = useParams<{ code: string }>();
  const [page, setPage] = useState<Page | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => { supabase.rpc('public_referral_page', { p_code: code }).then(({ data }) => setPage((data as Page) || null)); }, [code]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { data } = await supabase.rpc('submit_referral', { p_code: code, p_name: name, p_phone: phone });
    setBusy(false);
    const r = data as { ok?: boolean; reason?: string } | null;
    if (!r?.ok) { setError(referralError(r?.reason)); return; }
    setDone(true);
  };

  if (page === undefined) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!page || !page.ok) return <div className="flex min-h-screen items-center justify-center p-4"><p className="text-sm">Este link de indicação não está ativo.</p></div>;
  const color = page.clinic.primary_color || '#059669';

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        {page.clinic.logo_url && <img src={page.clinic.logo_url} alt="" className="mx-auto h-12 object-contain" />}
        {done ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-2 h-12 w-12" style={{ color }} />
            <p className="text-lg font-semibold">Recebemos seu contato!</p>
            <p className="text-sm text-muted-foreground">A {page.clinic.name} vai te chamar no WhatsApp.</p>
            {page.online_booking && (
              <a href={publicBookingUrl(publicOrigin(), page.clinic.slug)} className="mt-4 flex h-12 items-center justify-center rounded-xl text-base font-semibold text-white" style={{ backgroundColor: color }}>
                Já quero marcar minha avaliação
              </a>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-center">
              <p className="text-lg font-semibold">{page.referrer_first_name} indicou você!</p>
              <p className="text-sm text-muted-foreground">Deixe seu contato e a {page.clinic.name} te chama para conhecer.</p>
            </div>
            <div className="space-y-1.5"><Label htmlFor="rf-name">Nome completo</Label><Input id="rf-name" autoComplete="name" className="h-12 text-base" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="rf-phone">WhatsApp com DDD</Label><Input id="rf-phone" inputMode="tel" autoComplete="tel" className="h-12 text-base" placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <button type="submit" disabled={busy || name.trim().split(/\s+/).length < 2 || phone.replace(/\D/g, '').length < 10}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white disabled:opacity-50" style={{ backgroundColor: color }}>
              {busy && <Loader2 className="h-5 w-5 animate-spin" />} Quero conhecer
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
