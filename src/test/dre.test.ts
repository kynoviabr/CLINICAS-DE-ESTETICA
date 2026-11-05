import { describe, expect, it } from 'vitest';
import { buildDre, buildDreTable, dreInsight, sumMonths } from '@/lib/finance/dre';

const month = {
  received: 20000,
  materialUsed: 3000,
  materialLost: 200,
  expenses: [
    { category: 'Aluguel', amount: 3500 },
    { category: 'Impostos', amount: 1200 },
    { category: 'Marketing e anúncios', amount: 1500 },
    { category: 'Compra de material', amount: 2800 },
    { category: 'Refeições', amount: 300 },
  ],
};

const val = (lines: ReturnType<typeof buildDre>['lines'], key: string) => lines.find((l) => l.key === key)?.value;

describe('DRE simplificado', () => {
  it('com estoque: custo é o material usado, compra não conta duas vezes', () => {
    const { lines, result, margin } = buildDre(month, true);
    expect(val(lines, 'net')).toBe(18800);
    expect(val(lines, 'gross')).toBe(15600);
    expect(val(lines, 'expenses_total')).toBe(5300);
    expect(result).toBe(10300);
    expect(margin).toBe(51.5);
    expect(val(lines, 'info_purchases')).toBe(2800);
    expect(lines.filter((l) => l.kind === 'expense').map((l) => l.label)).toEqual(['(−) Aluguel', '(−) Marketing e anúncios', '(−) Refeições']);
  });

  it('sem estoque: custo é a compra de material', () => {
    const { lines, result } = buildDre(month, false);
    expect(val(lines, 'material_purchase')).toBe(2800);
    expect(val(lines, 'material_used')).toBeUndefined();
    expect(result).toBe(18800 - 2800 - 5300);
  });

  it('acumulado soma os meses', () => {
    const total = sumMonths([month, { received: 1000, materialUsed: 0, materialLost: 0, expenses: [{ category: 'Aluguel', amount: 3500 }] }]);
    expect(total.received).toBe(21000);
    expect(val(buildDre(total, true).lines, 'exp:Aluguel')).toBe(7000);
  });

  it('frase do mês', () => {
    expect(dreInsight(month, true).replace(/\s/g, ' ')).toBe('Sobrou R$ 10.300,00 (51,5% do que entrou). Maior despesa: Aluguel (R$ 3.500,00).');
    expect(dreInsight({ received: 1000, materialUsed: 0, materialLost: 0, expenses: [{ category: 'Aluguel', amount: 3000 }] }, true).replace(/\s/g, ' '))
      .toMatch(/^Faltou R\$ 2\.000,00/);
  });

  it('tabela com colunas alinhadas por linha', () => {
    const prev = { received: 5000, materialUsed: 100, materialLost: 0, expenses: [{ category: 'Contador', amount: 400 }] };
    const rows = buildDreTable([month, prev], true);
    const row = (k: string) => rows.find((r) => r.key === k)!;
    expect(row('exp:Contador').values).toEqual([0, 400]);
    expect(row('exp:Aluguel').values).toEqual([3500, 0]);
    expect(row('result').values).toEqual([10300, 4500]);
    expect(rows[0].key).toBe('received');
  });
});
