import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarCheck2, CalendarClock, CalendarX2, CheckCircle2, ChevronLeft, ChevronRight, Loader2, MapPin, Phone } from 'lucide-react';
import { BrandButton } from '@/components/ui/brand-button';
import { Textarea } from '@/components/ui/textarea';
import {
  addDaysIso, callPatientLink, dayLabel, groupByDay, isFail, localParts, patientLinkError,
  type PatientSlots, type PatientView,
} from '@/lib/appointments/patientLink';

type Mode = 'main' | 'reschedule' | 'cancel';

const STATUS: Record<string, { label: string; tone: string }> = {
  scheduled: { label: 'Aguardando sua confirmação', tone: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmado', tone: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelado', tone: 'bg-red-100 text-red-700' },
  rescheduled: { label: 'Remarcado', tone: 'bg-slate-100 text-slate-700' },
  completed: { label: 'Realizado', tone: 'bg-slate-100 text-slate-700' },
  no_show: { label: 'Não compareceu', tone: 'bg-slate-100 text-slate-700' },
  in_progress: { label: 'Em atendimento', tone: 'bg-sky-100 text-sky-800' },
};

/** Página do paciente (sem login, feita para o celular): confirmar, remarcar ou cancelar o atendimento. */
export default function PublicAppointmentPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [view, setView] = useState<PatientView | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<Mode>('main');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [slots, setSlots] = useState<PatientSlots | null>(null);
  const [weekFrom, setWeekFrom] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    callPatientLink<PatientView>(token, 'view').then((r) => (isFail(r) ? setError(patientLinkError(r.reason)) : setView(r)));
  }, [token]);

  useEffect(() => {
    if (mode !== 'reschedule') return;
    setSlots(null);
    setPicked(null);
    callPatientLink<PatientSlots>(token, 'slots', weekFrom ? { from: weekFrom } : {}).then((r) => {
      if (isFail(r)) { setNotice(patientLinkError(r.reason)); setMode('main'); }
      else setSlots(r);
    });
  }, [mode, weekFrom, token]);

  const act = async (action: string, extra: Record<string, unknown>, done: string) => {
    setBusy(true);
    setNotice('');
    const r = await callPatientLink<PatientView>(token, action, extra);
    setBusy(false);
    if (isFail(r)) setNotice(patientLinkError(r.reason));
    else { setView(r); setMode('main'); setNotice(done); }
  };

  const color = view?.clinic?.primary_color || undefined;
  const brand = color ? { backgroundColor: color, borderColor: color } : undefined;
  const a = view?.appointment;
  const start = a ? localParts(a.start) : null;
  const status = a ? STATUS[a.status] || { label: a.status, tone: 'bg-slate-100 text-slate-700' } : null;
  const deadline = view ? localParts(view.changeDeadline) : null;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-md px-4 py-6">
        <header className="mb-5 flex items-center gap-3">
          {view?.clinic?.logo_url && <img src={view.clinic.logo_url} alt="" className="h-11 w-11 rounded-lg object-cover" />}
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-semibold">{view?.clinic?.name || 'Seu atendimento'}</p>
            <p className="text-xs text-muted-foreground">Seu atendimento</p>
          </div>
        </header>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          {error ? (
            <p className="py-6 text-center text-sm">{error}</p>
          ) : !view || !a || !start ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
          ) : (
            <div className="space-y-4">
              <p className="text-base">Olá, <strong>{view.firstName}</strong>!</p>

              <div className="space-y-2 rounded-xl bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">{a.serviceName}{a.professionalName ? ` · ${a.professionalName}` : ''}</p>
                <p className="text-xl font-semibold">{dayLabel(start.date)}</p>
                <p className="text-3xl font-bold" style={{ color }}>{start.time}</p>
                {status && <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${status.tone}`}>{status.label}</span>}
              </div>

              {notice && <p className="rounded-lg border bg-background p-3 text-sm">{notice}</p>}

              {mode === 'main' && view.state === 'ok' && (
                <div className="space-y-2">
                  {view.canConfirm && (
                    <BrandButton className="h-12 w-full text-base" style={brand} disabled={busy} onClick={() => act('confirm', {}, 'Presença confirmada. Até lá!')}>
                      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarCheck2 className="h-5 w-5" />} Confirmar presença
                    </BrandButton>
                  )}
                  {a.status === 'confirmed' && !notice && (
                    <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Sua presença está confirmada.</p>
                  )}
                  {view.canReschedule && (
                    <BrandButton variant="outline" className="h-12 w-full text-base" onClick={() => { setNotice(''); setWeekFrom(null); setMode('reschedule'); }}>
                      <CalendarClock className="h-5 w-5" /> Remarcar
                    </BrandButton>
                  )}
                  {view.canChange && (
                    <button type="button" className="h-11 w-full text-sm text-muted-foreground underline" onClick={() => { setNotice(''); setMode('cancel'); }}>
                      Não vou poder ir · cancelar
                    </button>
                  )}
                  {!view.canChange && deadline && (
                    <p className="text-xs text-muted-foreground">Para remarcar ou cancelar agora, fale com a clínica (pelo link, só até {deadline.date.split('-').reverse().slice(0, 2).join('/')} às {deadline.time}).</p>
                  )}
                </div>
              )}

              {mode === 'main' && view.state === 'expired' && <p className="text-sm text-muted-foreground">Este atendimento já passou.</p>}

              {mode === 'reschedule' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <button type="button" aria-label="Semana anterior" className="rounded-lg p-2 disabled:opacity-30"
                      disabled={!slots || !weekFrom} onClick={() => slots && setWeekFrom(addDaysIso(slots.from, -7) <= new Date().toISOString().slice(0, 10) ? null : addDaysIso(slots.from, -7))}>
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <p className="text-sm font-medium">Escolha um novo horário</p>
                    <button type="button" aria-label="Próxima semana" className="rounded-lg p-2 disabled:opacity-30"
                      disabled={!slots || addDaysIso(slots.to, 1) > slots.lastDay} onClick={() => slots && setWeekFrom(addDaysIso(slots.to, 1))}>
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                  {!slots ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando horários…</p>
                  ) : slots.slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem horários livres nesta semana. Veja a próxima.</p>
                  ) : (
                    <div className="max-h-[50vh] space-y-3 overflow-y-auto">
                      {groupByDay(slots.slots).map((d) => (
                        <div key={d.date}>
                          <p className="mb-1.5 text-sm font-medium">{dayLabel(d.date)}</p>
                          <div className="grid grid-cols-4 gap-2">
                            {d.times.map((t) => {
                              const iso = `${d.date}T${t}:00-03:00`;
                              return (
                                <button key={iso} type="button" onClick={() => setPicked(iso)}
                                  className={`h-11 rounded-lg border text-sm ${picked === iso ? 'border-transparent text-white' : 'bg-background'}`}
                                  style={picked === iso ? { backgroundColor: color || 'hsl(var(--primary))' } : undefined}>
                                  {t}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <BrandButton className="h-12 w-full text-base" style={brand} disabled={!picked || busy}
                    onClick={() => picked && act('reschedule', { start: picked }, 'Pronto! Seu atendimento foi remarcado e já está confirmado.')}>
                    {busy && <Loader2 className="h-5 w-5 animate-spin" />}
                    {picked ? `Remarcar para ${dayLabel(picked.slice(0, 10)).toLowerCase()} às ${picked.slice(11, 16)}` : 'Escolha um horário'}
                  </BrandButton>
                  <button type="button" className="h-10 w-full text-sm text-muted-foreground" onClick={() => setMode('main')}>Voltar</button>
                </div>
              )}

              {mode === 'cancel' && (
                <div className="space-y-3">
                  <p className="text-sm">Tem certeza? O horário fica livre para outra pessoa.</p>
                  <Textarea placeholder="Quer contar o motivo? (opcional)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
                  <BrandButton variant="outline" className="h-12 w-full border-red-300 text-base text-red-700" disabled={busy}
                    onClick={() => act('cancel', { reason }, 'Atendimento cancelado. Quando quiser remarcar, fale com a clínica.')}>
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarX2 className="h-5 w-5" />} Cancelar atendimento
                  </BrandButton>
                  <button type="button" className="h-10 w-full text-sm text-muted-foreground" onClick={() => setMode('main')}>Voltar</button>
                </div>
              )}

              {(view.clinic?.phone || view.clinic?.address) && (
                <div className="space-y-1.5 border-t pt-4 text-sm text-muted-foreground">
                  {view.clinic?.address && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {[view.clinic.address, view.clinic.city, view.clinic.state].filter(Boolean).join(', ')}</p>}
                  {view.clinic?.phone && <a href={`tel:${view.clinic.phone}`} className="flex items-center gap-2"><Phone className="h-4 w-4" /> {view.clinic.phone}</a>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
