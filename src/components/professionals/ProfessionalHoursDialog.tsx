import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { weekDays } from '@/lib/agenda/model';
import { draftFromRows, outsideClinicHours, rowsFromDraft, validateDraft, type HoursDraft } from '@/lib/agenda/professionalHours';

/** Horários de atendimento de um profissional. Usado no cadastro do profissional e nas pendências de Configurações > Atendimento. */
export default function ProfessionalHoursDialog({ professional, onClose }: { professional: { id: string; name: string } | null; onClose: () => void }) {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<HoursDraft>({});

  const { data, isLoading } = useQuery({
    queryKey: ['professional-hours', professional?.id],
    enabled: !!professional && !!clinicId,
    queryFn: async () => {
      const [avail, clinic] = await Promise.all([
        supabase.from('professional_availability').select('day_of_week, start_time, end_time, is_active').eq('clinic_id', clinicId!).eq('professional_id', professional!.id),
        supabase.from('clinic_business_hours').select('day_of_week, opens_at, closes_at').eq('clinic_id', clinicId!).order('opens_at'),
      ]);
      return { availability: avail.data || [], clinicHours: clinic.data || [] };
    },
  });
  useEffect(() => { if (data) setDraft(draftFromRows(data.availability, data.clinicHours)); }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const err = validateDraft(draft);
      if (err) throw new Error(err);
      const { error: delError } = await supabase.from('professional_availability').delete().eq('clinic_id', clinicId!).eq('professional_id', professional!.id);
      if (delError) throw delError;
      const rows = rowsFromDraft(draft, clinicId!, professional!.id);
      if (rows.length) {
        const { error } = await supabase.from('professional_availability').insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['professional-availability'] });
      qc.invalidateQueries({ queryKey: ['professional-hours'] });
      qc.invalidateQueries({ queryKey: ['service-settings'] });
      toast({ title: 'Horários salvos', description: `${professional?.name} já aparece na agenda e para a IA.` });
      onClose();
    },
    onError: (e: Error) => toast({ title: 'Não foi possível salvar', description: e.message, variant: 'destructive' }),
  });

  const outside = data ? outsideClinicHours(draft, data.clinicHours) : [];
  const set = (day: number, patch: Partial<HoursDraft[number]>) => setDraft((d) => ({ ...d, [day]: { ...d[day], ...patch } }));

  return (
    <Dialog open={!!professional} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Horários de atendimento · {professional?.name}</DialogTitle>
          <DialogDescription>Os dias e horários em que este profissional atende. A agenda e a IA só oferecem horários dentro destes e do horário da clínica.</DialogDescription>
        </DialogHeader>
        {isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p> : (
          <div className="space-y-2">
            {weekDays.map((d) => {
              const h = draft[d.value] || { isActive: false, start: '09:00', end: '18:00' };
              return (
                <div key={d.value} className="flex flex-wrap items-center gap-3 rounded-lg border p-2">
                  <label className="flex w-40 items-center gap-2 text-sm">
                    <Switch checked={h.isActive} onCheckedChange={(v) => set(d.value, { isActive: v })} aria-label={`Atende ${d.label}`} />
                    {d.label}
                  </label>
                  {h.isActive ? (
                    <div className="flex items-center gap-1">
                      <Input type="time" className="w-28" value={h.start} onChange={(e) => set(d.value, { start: e.target.value })} aria-label={`Início ${d.label}`} />
                      <span className="text-sm">às</span>
                      <Input type="time" className="w-28" value={h.end} onChange={(e) => set(d.value, { end: e.target.value })} aria-label={`Fim ${d.label}`} />
                    </div>
                  ) : <span className="text-sm text-muted-foreground">Não atende</span>}
                </div>
              );
            })}
            {outside.length > 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Fora do horário da clínica: {outside.join(', ')}. Esses horários não aparecem na agenda nem para a IA. Ajuste aqui ou em Configurações &gt; Atendimento.
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <BrandButton type="button" variant="outline" className="flex-1" onClick={onClose}>Agora não</BrandButton>
              <BrandButton className="flex-1" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar horários
              </BrandButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
