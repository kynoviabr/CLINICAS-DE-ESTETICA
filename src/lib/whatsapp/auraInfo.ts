/** Informações da clínica para a IA da Aura (clinic_settings, chave aura_info). Lidas pela função aura-api. */
export type PriceDisplay = 'exact' | 'from' | 'hidden';

export type AuraInfo = {
  hours?: string;
  payment?: string;
  policies?: string;
  parking?: string;
  notes?: string;
  faq?: { question: string; answer: string }[];
  priceDisplay?: PriceDisplay;
  priceOverrides?: Record<string, PriceDisplay>;
};

export const PRICE_DISPLAY_LABEL: Record<PriceDisplay, string> = {
  exact: 'Informar o preço',
  from: 'Dizer "a partir de" e convidar para avaliação',
  hidden: 'Não informar (só após avaliação)',
};

export function parseAuraInfo(value: string | null | undefined): AuraInfo {
  const empty: AuraInfo = { priceDisplay: 'exact', faq: [], priceOverrides: {} };
  if (!value) return empty;
  try {
    const v = JSON.parse(value) as AuraInfo;
    return { ...empty, ...v, faq: Array.isArray(v.faq) ? v.faq : [], priceOverrides: v.priceOverrides || {} };
  } catch {
    return empty;
  }
}

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
