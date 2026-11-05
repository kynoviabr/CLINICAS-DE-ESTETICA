/**
 * Funcionalidades que a clínica liga e desliga em Configurações › Geral.
 * Guardadas em clinic_settings ('on' | 'off'). Sem registro = ligada.
 * Desligar só esconde (menu, Meu dia, avisos); os dados ficam.
 */
export const FEATURES = {
  stock: { key: 'feature_stock', label: 'Estoque', description: 'Material, entradas, baixa automática nas sessões e previsão pela agenda.' },
  expenses: { key: 'feature_expenses', label: 'Despesas e DRE', description: 'Lançar despesas (aluguel, anúncios, contador...) e ver o resultado do mês.' },
} as const;

export type FeatureName = keyof typeof FEATURES;

export function featureEnabled(settings: Record<string, string | null | undefined>, feature: FeatureName): boolean {
  return settings[FEATURES[feature].key] !== 'off';
}
