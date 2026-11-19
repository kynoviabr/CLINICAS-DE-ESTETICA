import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { ACCESS_LABEL } from '@/lib/accessLog';

/** Registro de acessos (só administradores). Por paciente ou da clínica toda. */
export default function AccessLogList({ clinicId, patientId, showPatient = false }: { clinicId: string | null; patientId?: string; showPatient?: boolean }) {
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['access-log', clinicId, patientId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc('access_log_list', { p_clinic_id: clinicId!, p_patient_id: patientId ?? null, p_limit: 300 });
      if (e) throw e;
      return data || [];
    },
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (error) return <p className="text-sm text-muted-foreground">Só administradores veem o registro de acessos.</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nenhum acesso registrado ainda.</p>;
  return (
    <div className="divide-y rounded-lg border">
      {rows.map((r) => (
        <div key={r.id} className="flex flex-col gap-0.5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate"><span className="font-medium">{r.user_name || 'Usuário'}</span> · {ACCESS_LABEL[r.action] || r.action}{showPatient && r.patient_name ? ` · ${r.patient_name}` : ''}</p>
            {r.detail && <p className="truncate text-xs text-muted-foreground">{r.detail}</p>}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}</span>
        </div>
      ))}
    </div>
  );
}
