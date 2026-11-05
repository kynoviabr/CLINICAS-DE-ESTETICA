import { supabase } from '@/integrations/supabase/client';
import { ANAMNESE_TEMPLATES_KEY, buildAnamneseTemplate, type AnamneseTemplate } from '@/lib/anamnese/templates';
import { onlyDigits } from '@/lib/patients/validation';

/** clinic_settings: quando a implantação guiada terminou (ISO). Sem ele, o Dashboard lembra de terminar. */
export const SETUP_COMPLETED_KEY = 'setup_completed_at';

export const SETUP_STEPS = ['clinica', 'atendimento', 'tratamentos', 'documentos', 'equipe', 'pronto'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export const WEEK_DAYS = [
  { value: 1, short: 'Seg' },
  { value: 2, short: 'Ter' },
  { value: 3, short: 'Qua' },
  { value: 4, short: 'Qui' },
  { value: 5, short: 'Sex' },
  { value: 6, short: 'Sáb' },
  { value: 0, short: 'Dom' },
] as const;

/** CNPJ (14 dígitos) ou CPF (11), para quem trabalha como autônoma. Vai para o contrato. */
export function isValidDocument(value: string): boolean {
  const d = onlyDigits(value);
  return (d.length === 11 || d.length === 14) && !/^(\d)\1+$/.test(d);
}

export function formatDocument(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Horário válido "HH:MM" e fim depois do início. */
export function validHours(start: string, end: string): boolean {
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  return re.test(start) && re.test(end) && start < end;
}

/** professionalId = professionals.id (o cadastro, não o login). */
export function buildAvailabilityRows(clinicId: string, professionalId: string, days: number[], start: string, end: string) {
  return [...new Set(days)].sort().map((day) => ({
    clinic_id: clinicId,
    professional_id: professionalId,
    day_of_week: day,
    start_time: start,
    end_time: end,
    is_active: true,
  }));
}

export async function upsertClinicSetting(clinicId: string, key: string, value: string) {
  const { data: existing, error: lookupError } = await supabase
    .from('clinic_settings').select('id').eq('clinic_id', clinicId).eq('key', key).maybeSingle();
  if (lookupError) throw lookupError;
  const { error } = existing
    ? await supabase.from('clinic_settings').update({ value }).eq('id', existing.id)
    : await supabase.from('clinic_settings').insert({ clinic_id: clinicId, key, value });
  if (error) throw error;
}

export async function readClinicSetting(clinicId: string, key: string): Promise<string | null> {
  const { data } = await supabase.from('clinic_settings').select('value').eq('clinic_id', clinicId).eq('key', key).maybeSingle();
  return data?.value ?? null;
}

/** Junta modelos novos aos que a clínica já tem, sem duplicar categoria. */
export function mergeAnamneseTemplates(
  existing: AnamneseTemplate[],
  categories: Array<{ id: string; name: string }>,
): { templates: AnamneseTemplate[]; added: number } {
  const have = new Set(existing.map((template) => template.category_id));
  const missing = categories.filter((category) => !have.has(category.id)).map(buildAnamneseTemplate);
  return { templates: [...existing, ...missing], added: missing.length };
}

/** Cria a anamnese padrão de cada categoria ativa que ainda não tem. Retorna quantas criou. */
export async function ensureAnamneseTemplates(clinicId: string): Promise<number> {
  const { data: categories, error } = await supabase
    .from('treatment_categories').select('id, name').eq('clinic_id', clinicId).eq('status', 'active').order('name');
  if (error) throw error;
  let existing: AnamneseTemplate[] = [];
  const raw = await readClinicSetting(clinicId, ANAMNESE_TEMPLATES_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed;
    } catch {
      existing = [];
    }
  }
  const { templates, added } = mergeAnamneseTemplates(existing, categories || []);
  if (added > 0) await upsertClinicSetting(clinicId, ANAMNESE_TEMPLATES_KEY, JSON.stringify(templates));
  return added;
}
