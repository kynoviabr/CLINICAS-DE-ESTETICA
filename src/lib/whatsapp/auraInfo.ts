/** Tipos da sugestão de resposta da Aura IA (copiloto). */
/** Avisos da IA (vindos da Aura) que pedem atenção antes de enviar. */
export type SuggestionFlag = { code: string; text: string };
export type Suggestion = {
  id: string | null; text: string; outcome: string; handoff: boolean; flags: SuggestionFlag[];
  sources: { catalog: string; businessInfo: string };
};

/** Frase curta quando os dados da clínica não chegaram à IA. */
export function missingSourcesText(s: Suggestion): string | null {
  const off = [s.sources.catalog, s.sources.businessInfo].some((x) => x !== 'ok');
  return off ? 'A IA não conseguiu ler todos os dados da clínica; confira preços e horários antes de enviar.' : null;
}
