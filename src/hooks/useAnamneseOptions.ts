import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { readClinicSetting } from '@/lib/setup/clinicSetup';
import { ANAMNESE_TEMPLATES_KEY } from '@/lib/anamnese/templates';
import { activeTemplates, anamneseState, suggestSelection } from '@/lib/anamnese/selection';

const CLOSED_PROPOSAL = new Set(['rejected', 'expired', 'cancelled']);

/**
 * O que dá para enviar a uma paciente: modelos ativos, situação da inicial e de cada categoria,
 * e a sugestão (inicial se não estiver válida + categorias que ela vai fazer sem anamnese válida).
 * `treatmentId` (ex.: do agendamento) entra na sugestão junto com contratos e propostas.
 */
export function useAnamneseOptions(patientId: string | null | undefined, enabled: boolean, treatmentId?: string | null) {
  const { clinicId } = useBranding();

  return useQuery({
    queryKey: ['anamnese-options', clinicId, patientId, treatmentId || null],
    enabled: enabled && !!clinicId && !!patientId,
    queryFn: async () => {
      const [raw, patientRes, anamnesesRes, contractsRes, proposalsRes] = await Promise.all([
        readClinicSetting(clinicId!, ANAMNESE_TEMPLATES_KEY),
        supabase.from('patients').select('current_anamnese_status').eq('id', patientId!).maybeSingle(),
        supabase.from('patient_anamneses').select('category_id, status, expires_at')
          .eq('patient_id', patientId!).eq('kind', 'treatment').eq('is_current', true),
        supabase.from('contracts').select('proposal_id, status').eq('patient_id', patientId!),
        supabase.from('proposals').select('id, status').eq('patient_id', patientId!),
      ]);
      const templates = activeTemplates(raw);

      const proposalIds = new Set<string>();
      (contractsRes.data || []).forEach((c) => { if (c.proposal_id && c.status !== 'cancelled') proposalIds.add(c.proposal_id); });
      (proposalsRes.data || []).forEach((p) => { if (!CLOSED_PROPOSAL.has(String(p.status))) proposalIds.add(p.id); });

      const treatmentIds = new Set<string>(treatmentId ? [treatmentId] : []);
      if (proposalIds.size > 0) {
        const { data: items } = await supabase.from('proposal_items').select('treatment_id').in('proposal_id', [...proposalIds]);
        (items || []).forEach((i) => { if (i.treatment_id) treatmentIds.add(i.treatment_id); });
      }
      const categoryIds = new Set<string>();
      if (treatmentIds.size > 0) {
        const { data: treatments } = await supabase.from('treatments').select('id, category_id').in('id', [...treatmentIds]);
        (treatments || []).forEach((t) => { if (t.category_id) categoryIds.add(t.category_id); });
      }

      const categoryStates = new Map<string, ReturnType<typeof anamneseState>>();
      (anamnesesRes.data || []).forEach((a) => { if (a.category_id) categoryStates.set(a.category_id, anamneseState(a)); });
      const validCategoryIds = [...categoryStates].filter(([, s]) => s === 'valid').map(([id]) => id);

      const generalStatus = patientRes.data?.current_anamnese_status;
      const generalState = generalStatus === 'valid' ? 'valid' : generalStatus === 'expired' ? 'expired' : generalStatus === 'pending' ? 'pending' : 'none';

      return {
        templates,
        generalState,
        categoryStates,
        categoryIds,
        suggestion: suggestSelection({ templates, categoryIds, validCategoryIds, generalState }),
      } as const;
    },
  });
}
