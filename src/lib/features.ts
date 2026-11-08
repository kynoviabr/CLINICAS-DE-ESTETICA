/**
 * Funcionalidades que a clínica liga e desliga em Configurações › Geral.
 * Guardadas em clinic_settings ('on' | 'off'). Sem registro = ligada.
 * Desligar só esconde (menu, Meu dia, avisos); os dados ficam.
 */
export const FEATURES = {
  finance: { key: 'feature_finance', label: 'Financeiro', description: 'Controle de parcelas, recebimentos de contratos e previsão financeira.' },
  expenses: { key: 'feature_expenses', label: 'Despesas e DRE', description: 'Lançar despesas (aluguel, anúncios, contador...) e ver o resultado do mês.' },
  stock: { key: 'feature_stock', label: 'Estoque', description: 'Material, entradas, baixa automática nas sessões e previsão pela agenda.' },
  automations: { key: 'feature_automations', label: 'Automações', description: 'Disparos automáticos de lembretes, pedidos de confirmação e réguas com a Aura IA.' },
} as const;

export type FeatureName = keyof typeof FEATURES;

export function featureEnabled(settings: Record<string, string | null | undefined>, feature: FeatureName): boolean {
  return settings[FEATURES[feature].key] !== 'off';
}
