import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { BrandBadge } from '@/components/ui/brand-badge';
import { statusConfig } from '@/lib/agenda/model';
import type { AgendaPageController } from './useAgendaPage';

/** Busca um paciente e mostra os dias em que ele tem agendamento (próximos e anteriores). */
export function PatientSearchDialog({ ctx, open, onOpenChange }: { ctx: AgendaPageController; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { clinicId, setCurrentDate, setViewMode } = ctx;
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [patient, setPatient] = useState<{ id: string; full_name: string } | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(term.trim()), 300); return () => clearTimeout(t); }, [term]);
  useEffect(() => { if (!open) { setTerm(''); setPatient(null); } }, [open]);

  const { data: patients = [], isFetching } = useQuery({
    queryKey: ['agenda-patient-search', clinicId, debounced],
    enabled: !!clinicId && debounced.length >= 2 && !patient,
    queryFn: async () => {
      const digits = debounced.replace(/\D/g, '');
      const safe = debounced.replace(/[,()%*]/g, ' ');
      let q = supabase.from('patients').select('id, full_name, phone').eq('clinic_id', clinicId!).is('anonymized_at', null).order('full_name').limit(10);
      q = digits.length >= 4 ? q.or(`full_name.ilike.%${safe}%,phone.ilike.%${digits}%`) : q.ilike('full_name', `%${safe}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: appts = [], isLoading } = useQuery({
    queryKey: ['agenda-patient-appts', clinicId, patient?.id],
    enabled: !!clinicId && !!patient,
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments').select('id, start_time, status, appointment_type')
        .eq('clinic_id', clinicId!).eq('patient_id', patient!.id).order('start_time', { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  const now = Date.now();
  const upcoming = appts.filter((a) => new Date(a.start_time).getTime() >= now).reverse();
  const past = appts.filter((a) => new Date(a.start_time).getTime() < now);

  const goTo = (iso: string) => { setCurrentDate(new Date(iso)); setViewMode('day'); onOpenChange(false); };

  const row = (a: (typeof appts)[number]) => (
    <button key={a.id} type="button" onClick={() => goTo(a.start_time)} className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted">
      <span className="capitalize">{format(new Date(a.start_time), "EEE, dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
      <BrandBadge status={statusConfig[a.status]?.badge || 'default'}>{statusConfig[a.status]?.label || a.status}</BrandBadge>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Buscar paciente na agenda</DialogTitle></DialogHeader>
        {!patient ? (
          <div className="space-y-2">
            <Input autoFocus placeholder="Nome ou telefone" value={term} onChange={(e) => setTerm(e.target.value)} />
            {debounced.length >= 2 && !isFetching && patients.length === 0 && <p className="text-sm text-muted-foreground">Nenhum paciente encontrado.</p>}
            {patients.map((p) => (
              <button key={p.id} type="button" onClick={() => setPatient(p)} className="flex w-full justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted">
                <span>{p.full_name}</span><span className="text-muted-foreground">{p.phone}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">{patient.full_name}</p>
              <button type="button" className="text-sm text-primary underline" onClick={() => setPatient(null)}>Trocar paciente</button>
            </div>
            {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : appts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este paciente não tem agendamentos.</p>
            ) : (
              <div className="max-h-[50vh] space-y-3 overflow-y-auto">
                <div className="space-y-1"><p className="text-xs font-semibold uppercase text-muted-foreground">Próximos ({upcoming.length})</p>{upcoming.length ? upcoming.map(row) : <p className="text-sm text-muted-foreground">Nenhum.</p>}</div>
                {past.length > 0 && <div className="space-y-1"><p className="text-xs font-semibold uppercase text-muted-foreground">Anteriores ({past.length})</p>{past.map(row)}</div>}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Clique em um dia para abrir a agenda nele.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
