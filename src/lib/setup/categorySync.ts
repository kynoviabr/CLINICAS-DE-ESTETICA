import { supabase } from '@/integrations/supabase/client';
import { ensureAnamneseTemplates } from '@/lib/setup/clinicSetup';

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Área do catálogo com o mesmo nome da categoria (ignora acento e maiúsculas). */
export function matchCatalogArea(name: string, areas: string[]): string | null {
  const key = normalize(name);
  return areas.find((area) => normalize(area) === key) ?? null;
}

export type CategorySyncResult = { added: number; reactivated: number; deactivated: number };

/**
 * Mantém o rol de tratamentos alinhado à categoria:
 * - ativa e do catálogo: traz os tratamentos do catálogo que faltam (não duplica);
 * - reativada: volta os tratamentos dela;
 * - desativada: tira os tratamentos dela do rol (ficam inativos, o histórico continua);
 * - renomeada: os tratamentos passam a mostrar o nome novo.
 */
export async function syncCategoryTreatments(
  clinicId: string,
  category: { id: string; name: string; status: string },
  previousStatus: string | null,
  catalogAreas: string[],
): Promise<CategorySyncResult> {
  const result: CategorySyncResult = { added: 0, reactivated: 0, deactivated: 0 };

  const { error: renameError } = await supabase.from('treatments').update({ category: category.name })
    .eq('clinic_id', clinicId).eq('category_id', category.id).neq('category', category.name);
  if (renameError) throw renameError;

  if (category.status !== 'active') {
    const { data, error } = await supabase.from('treatments').update({ is_active: false })
      .eq('clinic_id', clinicId).eq('category_id', category.id).eq('is_active', true).select('id');
    if (error) throw error;
    result.deactivated = data?.length ?? 0;
    return result;
  }

  if (previousStatus && previousStatus !== 'active') {
    const { data, error } = await supabase.from('treatments').update({ is_active: true })
      .eq('clinic_id', clinicId).eq('category_id', category.id).eq('is_active', false).select('id');
    if (error) throw error;
    result.reactivated = data?.length ?? 0;
  }

  const area = matchCatalogArea(category.name, catalogAreas);
  if (area) {
    if (normalize(area) === normalize(category.name) && area !== category.name) {
      // A função do catálogo liga pelo nome exato da área.
      const { error } = await supabase.from('treatment_categories').update({ name: area }).eq('id', category.id);
      if (error) throw error;
    }
    const { data, error } = await supabase.rpc('setup_clinic_defaults', { p_clinic_id: clinicId, p_categories: [area] });
    if (error) throw error;
    result.added = Number((data as { treatments?: number } | null)?.treatments ?? 0);
    await ensureAnamneseTemplates(clinicId);
  }
  return result;
}

export function syncMessage(r: CategorySyncResult): string | null {
  const parts = [
    r.added ? `${r.added} tratamento(s) do catálogo adicionados` : '',
    r.reactivated ? `${r.reactivated} tratamento(s) voltaram ao rol` : '',
    r.deactivated ? `${r.deactivated} tratamento(s) saíram do rol` : '',
  ].filter(Boolean);
  return parts.length ? `${parts.join(' · ')}.` : null;
}
