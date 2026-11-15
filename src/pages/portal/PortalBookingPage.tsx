import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import SlotPicker, { type SlotWeek } from '@/components/public/SlotPicker';
import { bookingError, callBooking, isFail, type OnlineSlot } from '@/lib/booking/online';
import { dayLabel, localParts } from '@/lib/appointments/patientLink';

/** Portal: o paciente marca a próxima sessão dos tratamentos do contrato (ou uma avaliação). */
export default function PortalBookingPage() {
  const [options, setOptions] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState('');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [picked, setPicked] = useState<OnlineSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ start: string; professionalName: string | null } | null>(null);

  useEffect(() => {
    callBooking<{ ok: true; options: { id: string; name: string }[] }>({ action: 'portal_options' }).then((r) => {
      if (isFail(r)) setError(bookingError(r.reason)); else { setOptions(r.options); if (r.options.length === 1) setServiceId(r.options[0].id); }
    });
  }, []);

  const load = useCallback(async (from: string | null) => {
    if (!serviceId) return null;
    const r = await callBooking<SlotWeek & { ok: true }>({ action: 'portal_slots', serviceId, from });
    return isFail(r) ? null : r;
  }, [serviceId]);

  const book = async () => {
    if (!picked || !serviceId) return;
    setBusy(true);
    setError('');
    const r = await callBooking<{ ok: true; start: string; professionalName: string | null }>({ action: 'portal_book', serviceId, start: picked.start, professionalId: picked.professionalId });
    setBusy(false);
    if (isFail(r)) { setError(bookingError(r.reason)); setPicked(null); return; }
    setDone(r);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Agendar</h2>
      <Card className="shadow-card"><CardContent className="space-y-4 p-4">
        {done ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-600" />
            <p className="font-semibold">Horário marcado!</p>
            <p className="text-sm text-muted-foreground">{dayLabel(localParts(done.start).date)} às {localParts(done.start).time}{done.professionalName ? ` com ${done.professionalName}` : ''}.</p>
          </div>
        ) : error && !options ? <p className="text-sm">{error}</p> : !options ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {options.map((o) => (
                <button key={o.id} type="button" onClick={() => { setServiceId(o.id); setPicked(null); }}
                  className={`h-10 rounded-full border px-4 text-sm ${serviceId === o.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}>
                  {o.name}
                </button>
              ))}
            </div>
            {serviceId && <SlotPicker key={serviceId} load={load} picked={picked} onPick={setPicked} />}
            {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            {picked && (
              <button type="button" onClick={book} disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60">
                {busy && <Loader2 className="h-5 w-5 animate-spin" />} Marcar {dayLabel(localParts(picked.start).date).toLowerCase()} às {localParts(picked.start).time}
              </button>
            )}
          </>
        )}
      </CardContent></Card>
    </div>
  );
}
