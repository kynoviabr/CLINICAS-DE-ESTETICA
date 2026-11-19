import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { addDaysIso, dayLabel, localParts } from '@/lib/appointments/patientLink';
import type { OnlineSlot } from '@/lib/booking/online';

export type SlotWeek = { from: string; to: string; lastDay: string; slots: OnlineSlot[] };

/** Escolha de horário semana a semana (celular primeiro). */
export default function SlotPicker({ load, color, picked, onPick }: {
  load: (from: string | null) => Promise<SlotWeek | null>;
  color?: string | null;
  picked: OnlineSlot | null;
  onPick: (s: OnlineSlot) => void;
}) {
  const [from, setFrom] = useState<string | null>(null);
  const [week, setWeek] = useState<SlotWeek | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load(from).then((w) => { if (alive) { setWeek(w); setLoading(false); } });
    return () => { alive = false; };
  }, [from, load]);

  const days = new Map<string, OnlineSlot[]>();
  for (const s of week?.slots || []) {
    const d = localParts(s.start).date;
    days.set(d, [...(days.get(d) || []), s]);
  }
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Semana anterior" className="rounded-lg p-2 disabled:opacity-30" disabled={!week || !from}
          onClick={() => week && setFrom(addDaysIso(week.from, -7) <= today ? null : addDaysIso(week.from, -7))}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-sm font-medium">Escolha um horário</p>
        <button type="button" aria-label="Próxima semana" className="rounded-lg p-2 disabled:opacity-30" disabled={!week || addDaysIso(week.to, 1) > week.lastDay}
          onClick={() => week && setFrom(addDaysIso(week.to, 1))}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando horários…</p>
      ) : !week || days.size === 0 ? (
        <p className="text-sm text-muted-foreground">Sem horários livres nesta semana. Veja a próxima.</p>
      ) : (
        <div className="max-h-[50vh] space-y-3 overflow-y-auto">
          {[...days.entries()].map(([date, list]) => (
            <div key={date}>
              <p className="mb-1.5 text-sm font-medium">{dayLabel(date)}</p>
              <div className="grid grid-cols-4 gap-2">
                {list.map((s) => {
                  const on = picked?.start === s.start && picked?.professionalId === s.professionalId;
                  return (
                    <button key={`${s.start}-${s.professionalId}`} type="button" onClick={() => onPick(s)}
                      className={`h-11 rounded-lg border text-sm ${on ? 'border-transparent text-white' : 'bg-background'}`}
                      style={on ? { backgroundColor: color || 'hsl(var(--primary))' } : undefined}>
                      {localParts(s.start).time}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
