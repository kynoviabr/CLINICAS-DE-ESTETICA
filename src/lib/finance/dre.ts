/**
 * DRE simplificado da clínica (por mês), sem burocracia:
 *
 *   Receita (recebido no mês)
 *   (−) Impostos
 *   = Receita líquida
 *   (−) Custo dos atendimentos: material usado + perdas (com Estoque) ou compra de material (sem Estoque)
 *   = Lucro bruto
 *   (−) Despesas por categoria
 *   = Resultado do mês
 *
 * Com Estoque ligado, "Compra de material" não entra no resultado: a compra vira estoque e o custo
 * aparece quando o material é usado. Assim não conta duas vezes.
 */
export const EXPENSE_CATEGORIES = [
  'Aluguel',
  'Energia e água',
  'Internet e celular',
  'Transporte',
  'Compra de material',
  'Marketing e anúncios',
  'Contador',
  'Impostos',
  'Equipe e comissões',
  'Brindes',
  'Refeições',
  'Manutenção e equipamentos',
  'Outros',
] as const;

export const TAX_CATEGORY = 'Impostos';
export const MATERIAL_PURCHASE_CATEGORY = 'Compra de material';

export type MonthInput = {
  received: number;
  materialUsed: number;
  materialLost: number;
  expenses: Array<{ category: string; amount: number }>;
};

export type DreLine = {
  key: string;
  label: string;
  kind: 'revenue' | 'deduction' | 'subtotal' | 'cost' | 'expense' | 'result' | 'info';
  value: number;
  /** Sinal visual: linhas de dedução/custo/despesa aparecem como negativas. */
  negative?: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildDre(input: MonthInput, stockEnabled: boolean): { lines: DreLine[]; result: number; margin: number | null } {
  const byCat = new Map<string, number>();
  input.expenses.forEach((e) => byCat.set(e.category, r2((byCat.get(e.category) ?? 0) + Number(e.amount))));

  const taxes = byCat.get(TAX_CATEGORY) ?? 0;
  const purchases = byCat.get(MATERIAL_PURCHASE_CATEGORY) ?? 0;
  const net = r2(input.received - taxes);
  const cost = stockEnabled ? r2(input.materialUsed + input.materialLost) : purchases;
  const gross = r2(net - cost);

  const opCats = [...byCat.entries()]
    .filter(([cat]) => cat !== TAX_CATEGORY && cat !== MATERIAL_PURCHASE_CATEGORY)
    .sort((a, b) => b[1] - a[1]);
  const opTotal = r2(opCats.reduce((s, [, v]) => s + v, 0));
  const result = r2(gross - opTotal);

  const lines: DreLine[] = [
    { key: 'received', label: 'Receita (recebido no mês)', kind: 'revenue', value: r2(input.received) },
    { key: 'taxes', label: '(−) Impostos', kind: 'deduction', value: taxes, negative: true },
    { key: 'net', label: '= Receita líquida', kind: 'subtotal', value: net },
  ];
  if (stockEnabled) {
    lines.push(
      { key: 'material_used', label: '(−) Material usado nos atendimentos', kind: 'cost', value: r2(input.materialUsed), negative: true },
      { key: 'material_lost', label: '(−) Perdas de material', kind: 'cost', value: r2(input.materialLost), negative: true },
    );
  } else {
    lines.push({ key: 'material_purchase', label: '(−) Compra de material', kind: 'cost', value: purchases, negative: true });
  }
  lines.push({ key: 'gross', label: '= Lucro bruto', kind: 'subtotal', value: gross });
  opCats.forEach(([cat, value]) => lines.push({ key: `exp:${cat}`, label: `(−) ${cat}`, kind: 'expense', value, negative: true }));
  lines.push({ key: 'expenses_total', label: 'Total de despesas', kind: 'subtotal', value: opTotal });
  lines.push({ key: 'result', label: '= Resultado do mês', kind: 'result', value: result });
  if (stockEnabled && purchases > 0) {
    lines.push({ key: 'info_purchases', label: 'Compras de material (foram para o estoque)', kind: 'info', value: purchases });
  }
  return { lines, result, margin: input.received > 0 ? Math.round((result / input.received) * 1000) / 10 : null };
}

/** Junta vários meses (ex.: acumulado do ano) somando as entradas. */
export function sumMonths(months: MonthInput[]): MonthInput {
  return {
    received: r2(months.reduce((s, m) => s + m.received, 0)),
    materialUsed: r2(months.reduce((s, m) => s + m.materialUsed, 0)),
    materialLost: r2(months.reduce((s, m) => s + m.materialLost, 0)),
    expenses: months.flatMap((m) => m.expenses),
  };
}

/** Frase direta sobre o mês. */
export function dreInsight(input: MonthInput, stockEnabled: boolean): string {
  const { result, margin, lines } = buildDre(input, stockEnabled);
  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (input.received === 0 && input.expenses.length === 0) return 'Sem movimento neste mês ainda.';
  const biggest = lines.filter((l) => l.kind === 'expense').sort((a, b) => b.value - a.value)[0];
  const head = result >= 0
    ? `Sobrou ${fmt(result)}${margin !== null ? ` (${String(margin).replace('.', ',')}% do que entrou)` : ''}.`
    : `Faltou ${fmt(Math.abs(result))}: as saídas passaram do que entrou.`;
  return biggest ? `${head} Maior despesa: ${biggest.label.replace('(−) ', '')} (${fmt(biggest.value)}).` : head;
}

export type DreTableRow = { key: string; label: string; kind: DreLine['kind']; values: number[] };

/**
 * Várias colunas (ex.: mês, mês anterior, acumulado) com as mesmas linhas:
 * toda categoria que aparece em alguma coluna aparece em todas (com zero).
 */
export function buildDreTable(columns: MonthInput[], stockEnabled: boolean): DreTableRow[] {
  const cats = new Set(columns.flatMap((c) => c.expenses.map((e) => e.category)));
  const padded = columns.map((c) => ({
    ...c,
    expenses: [...c.expenses, ...[...cats].map((category) => ({ category, amount: 0 }))],
  }));
  const built = padded.map((c) => buildDre(c, stockEnabled).lines);
  // Ordem das despesas: maior no primeiro mês.
  const order = built[0].map((l) => l.key);
  const keys = [...new Set([...order, ...built.flatMap((ls) => ls.map((l) => l.key))])];
  return keys
    .map((key) => {
      const ref = built.map((ls) => ls.find((l) => l.key === key)).find(Boolean)!;
      return { key, label: ref.label, kind: ref.kind, values: built.map((ls) => ls.find((l) => l.key === key)?.value ?? 0) };
    })
    .filter((row) => !(row.kind === 'expense' && row.values.every((v) => v === 0)))
    .filter((row) => !(row.kind === 'info' && row.values.every((v) => v === 0)));
}
