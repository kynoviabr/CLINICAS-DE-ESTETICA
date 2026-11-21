import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { readClinicSetting } from '@/lib/setup/clinicSetup';
import { ANAMNESE_TEMPLATES_KEY } from '@/lib/anamnese/templates';
import { activeTemplates, anamneseState } from '@/lib/anamnese/selection';
import { SendAnamneseLink } from './SendAnamneseLink';

/**
 * Aviso no agendamento: o tratamento escolhido tem anamnese específica e a paciente
 * ainda não tem uma válida (ou venceu). Oferece o envio já com ela marcada.
 */
export function TreatmentAnamneseAlert({ patientId, treatmentId }: { patientId?: string | null; treatmentId?: string | null }) {
  const { clinicId, clinicName } = useBranding();

  const { data } = useQuery({
    queryKey: ['treatment-anamnese-alert', clinicId, patientId, treatmentId],
    enabled: !!clinicId && !!patientId && !!treatmentId,
    queryFn: async () => {
      const { data: treatment } = await supabase
        .from('treatments').select('category_id').eq('id', treatmentId!).maybeSingle();
      if (!treatment?.category_id) return null;
      const template = activeTemplates(await readClinicSetting(clinicId!, ANAMNESE_TEMPLATES_KEY))
        .find((t) => t.category_id === treatment.category_id);
      if (!template) return null;
      const { data: current } = await supabase
        .from('patient_anamneses').select('status, expires_at')
        .eq('patient_id', patientId!).eq('kind', 'treatment').eq('category_id', treatment.category_id).eq('is_current', true)
        .maybeSingle();
      const state = anamneseState(current);
      if (state === 'valid') return null;
      return { category: template.category_name || template.name, state };
    },
  });

  if (!data || !patientId) return null;
  const text = data.state === 'expired'
    ? `A anamnese de ${data.category} desta paciente está vencida.`
    : data.state === 'pending'
      ? `A anamnese de ${data.category} ainda não foi respondida.`
      : `Falta a anamnese de ${data.category}.`;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 space-y-2">
        <p>{text} Ela trata dos princípios e riscos deste tratamento.</p>
        <SendAnamneseLink patientId={patientId} treatmentId={treatmentId} clinicName={clinicName || undefined} label="Enviar anamnese" size="sm" />
      </div>
    </div>
  );
}
