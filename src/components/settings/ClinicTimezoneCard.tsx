import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CLINIC_TIMEZONES } from '@/lib/clinic/timezones';

/** Fuso horário da clínica: usado nos horários do agendamento online, da IA, dos lembretes e dos links do paciente. */
export default function ClinicTimezoneCard({ clinicId, canEdit }: { clinicId: string | null; canEdit: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: tz } = useQuery({
    queryKey: ['clinic-timezone', clinicId],
    enabled: !!clinicId,
    queryFn: async () => (await supabase.from('clinics').select('timezone').eq('id', clinicId!).maybeSingle()).data?.timezone || 'America/Sao_Paulo',
  });
  const save = async (v: string) => {
    const { error } = await supabase.from('clinics').update({ timezone: v }).eq('id', clinicId!);
    if (error) { toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['clinic-timezone', clinicId] });
    toast({ title: 'Fuso horário salvo' });
  };
  return (
    <Card className="shadow-card">
      <CardHeader><CardTitle className="text-base">Fuso horário da clínica</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        <Select disabled={!canEdit || !tz} value={tz} onValueChange={save}>
          <SelectTrigger className="sm:max-w-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{CLINIC_TIMEZONES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Vale para horários livres, IA, lembretes e links enviados ao paciente.</p>
      </CardContent>
    </Card>
  );
}
