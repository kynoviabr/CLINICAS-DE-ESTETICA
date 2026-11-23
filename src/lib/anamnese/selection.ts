// Escolha de quais anamneses enviar (inicial e/ou de tratamento) e situação de cada uma.
import { templateQuestions, type AnamneseTemplate } from './templates';

export type AnamneseSelection = { general: boolean; templateIds: string[] };

export type AnamneseState = 'valid' | 'expired' | 'pending' | 'none';

/** Modelos ativos e com perguntas, a partir do JSON salvo em Configurações. */
export function activeTemplates(raw: string | null | undefined): AnamneseTemplate[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as AnamneseTemplate[])
      .filter((t) => t && t.active && templateQuestions(t).length > 0)
      .sort((a, b) => (a.category_name || a.name).localeCompare(b.category_name || b.name));
  } catch {
    return [];
  }
}

/** Situação de uma anamnese pela linha do banco (mesma regra do resumo no cadastro da paciente). */
export function anamneseState(row: { status: string; expires_at: string | null } | null | undefined, now = new Date()): AnamneseState {
  if (!row) return 'none';
  const expired = row.expires_at ? new Date(row.expires_at) <= now : false;
  if ((row.status === 'validated' || row.status === 'filled') && !expired) return 'valid';
  if (row.status === 'expired' || expired) return 'expired';
  if (row.status === 'pending' || row.status === 'in_progress') return 'pending';
  return 'none';
}

/**
 * Sugestão inicial: a inicial quando ela não está válida; e o modelo de cada categoria
 * que a paciente vai fazer (contratada ou em proposta) e ainda não tem anamnese válida.
 */
export function suggestSelection(params: {
  templates: AnamneseTemplate[];
  categoryIds: Iterable<string>;
  validCategoryIds: Iterable<string>;
  generalState: AnamneseState;
}): AnamneseSelection {
  const wanted = new Set(params.categoryIds);
  const valid = new Set(params.validCategoryIds);
  const seen = new Set<string>();
  const templateIds: string[] = [];
  for (const t of params.templates) {
    if (!wanted.has(t.category_id) || valid.has(t.category_id) || seen.has(t.category_id)) continue;
    seen.add(t.category_id);
    templateIds.push(t.id);
  }
  return { general: params.generalState !== 'valid', templateIds };
}

/** Nomes do que foi escolhido, para a mensagem do WhatsApp. */
export function selectionNames(templates: AnamneseTemplate[], selection: AnamneseSelection): string[] {
  const names = selection.general ? ['inicial'] : [];
  for (const id of selection.templateIds) {
    const t = templates.find((x) => x.id === id);
    if (t) names.push(`de ${t.category_name || t.name}`);
  }
  return names;
}

export const isEmptySelection = (s: AnamneseSelection) => !s.general && s.templateIds.length === 0;
