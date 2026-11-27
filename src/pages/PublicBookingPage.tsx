import { useCallback, useEffect, useState } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, MapPin, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SlotPicker, { type SlotWeek } from '@/components/public/SlotPicker';
import { bookingError, callBooking, isFail, type OnlineSlot } from '@/lib/booking/online';
import { dayLabel, localParts } from '@/lib/appointments/patientLink';

type Page = { ok: boolean; clinic: { name: string; logo_url: string | null; primary_color: string | null; phone: string | null; address: string | null }; evaluation: { minutes: number; free: boolean; price: number | null } };

/** Link público (Instagram, site): novo cliente marca avaliação sozinho. */
export default function PublicBookingPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [page, setPage] = useState<Page | null>(null);
  useDocumentTitle(page?.clinic?.name ? `Agende sua avaliação · ${page.clinic.name}` : null);
  const [missing, setMissing] = useState(false);
  const [picked, setPicked] = useState<OnlineSlot | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [interest, setInterest] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ start: string; professionalName: string | null } | null>(null);

  useEffect(() => {
    supabase.rpc('public_booking_page', { p_slug: slug }).then(({ data }) => { if (!data) setMissing(true); else setPage(data as Page); });
  }, [slug]);

  const load = useCallback(async (from: string | null) => {
    const r = await callBooking<SlotWeek & { ok: true }>({ action: 'public_slots', slug, from });
    return isFail(r) ? null : r;
  }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked) return;
    setBusy(true);
    setError('');
    const r = await callBooking<{ ok: true; start: string; professionalName: string | null }>({ action: 'public_book', slug, start: picked.start, professionalId: picked.professionalId, name, phone, interest });
    setBusy(false);
    if (isFail(r)) { setError(bookingError(r.reason)); if (r.reason === 'slot_unavailable') setPicked(null); return; }
    setDone(r);
  };

  const color = page?.clinic.primary_color || '#059669';
  if (missing) return <div className="flex min-h-screen items-center justify-center p-4"><p className="text-sm">Página não encontrada.</p></div>;
  if (!page) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        <header className="flex items-center gap-3">
          {page.clinic.logo_url && <img src={page.clinic.logo_url} alt="" className="h-12 w-12 rounded-lg object-cover" />}
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-semibold">{page.clinic.name}</p>
            <p className="text-xs text-muted-foreground">Agende sua avaliação{page.evaluation.free ? ' gratuita' : ''} · {page.evaluation.minutes} min</p>
          </div>
        </header>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          {!page.ok ? (
            <p className="text-sm">O agendamento online está desligado no momento. {page.clinic.phone ? `Fale com a clínica: ${page.clinic.phone}.` : ''}</p>
          ) : done ? (
            <div className="py-4 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12" style={{ color }} />
              <p className="text-lg font-semibold">Avaliação marcada!</p>
              <p className="mt-1 text-sm text-muted-foreground">{dayLabel(localParts(done.start).date)} às {localParts(done.start).time}{done.professionalName ? ` com ${done.professionalName}` : ''}.</p>
              <p className="mt-2 text-sm text-muted-foreground">A clínica vai confirmar pelo WhatsApp.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <SlotPicker load={load} color={color} picked={picked} onPick={setPicked} />
              {picked && (
                <div className="space-y-3 border-t pt-4">
                  <p className="text-sm font-medium">{dayLabel(localParts(picked.start).date)} às {localParts(picked.start).time}{picked.professionalName ? ` · ${picked.professionalName}` : ''}</p>
                  <div className="space-y-1.5"><Label htmlFor="bk-name">Nome completo</Label><Input id="bk-name" autoComplete="name" className="h-12 text-base" value={name} onChange={(e) => setName(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label htmlFor="bk-phone">WhatsApp com DDD</Label><Input id="bk-phone" inputMode="tel" autoComplete="tel" className="h-12 text-base" placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label htmlFor="bk-int">O que você quer tratar? (opcional)</Label><Input id="bk-int" className="h-12 text-base" value={interest} onChange={(e) => setInterest(e.target.value)} /></div>
                  {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
                  <button type="submit" disabled={busy || name.trim().split(/\s+/).length < 2 || phone.replace(/\D/g, '').length < 10}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white disabled:opacity-50" style={{ backgroundColor: color }}>
                    {busy && <Loader2 className="h-5 w-5 animate-spin" />} Confirmar avaliação
                  </button>
                </div>
              )}
              {error && !picked && <p className="text-sm text-red-700">{error}</p>}
            </form>
          )}
        </div>

        {(page.clinic.address || page.clinic.phone) && (
          <div className="space-y-1.5 px-1 text-sm text-muted-foreground">
            {page.clinic.address && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {page.clinic.address}</p>}
            {page.clinic.phone && <a href={`tel:${page.clinic.phone}`} className="flex items-center gap-2"><Phone className="h-4 w-4" /> {page.clinic.phone}</a>}
          </div>
        )}
      </div>
    </div>
  );
}
