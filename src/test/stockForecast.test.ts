import { describe, expect, it } from 'vitest';
import { expiringEntries, forecastItems, plannedUsage } from '@/lib/stock/forecast';

const recipes = [
  { treatment_id: 'botox', cost_item_id: 'toxina', quantity: 0.5 },
  { treatment_id: 'botox', cost_item_id: 'luva', quantity: 2 },
  { treatment_id: 'peeling', cost_item_id: 'luva', quantity: 1 },
];

describe('estoque x agenda', () => {
  it('soma o material que a agenda vai gastar', () => {
    const appts = [
      ...Array.from({ length: 10 }, () => ({ treatment_id: 'botox', start_time: '2026-11-10T10:00:00' })),
      { treatment_id: 'peeling', start_time: '2026-11-11T10:00:00' },
      { treatment_id: null, start_time: '2026-11-11T11:00:00' },
    ];
    expect(plannedUsage(appts, recipes)).toEqual({ toxina: 5, luva: 21 });
  });

  it('10 botox na semana com 3 frascos: vai faltar 2', () => {
    const items = [
      { id: 'toxina', name: 'Toxina', unit: 'frasco', stock_min: 1, balance: 3 },
      { id: 'luva', name: 'Luva', unit: 'par', stock_min: 10, balance: 30 },
      { id: 'gaze', name: 'Gaze', unit: 'un', stock_min: 0, balance: 0 },
      { id: 'acido', name: 'Ácido', unit: 'ml', stock_min: 20, balance: 50 },
    ];
    const f = forecastItems(items, { toxina: 5, luva: 21, acido: 35 });
    expect(f.map((i) => [i.id, i.status, i.shortfall])).toEqual([
      ['toxina', 'vai_faltar', 2],
      ['luva', 'baixo', 0],
      ['gaze', 'zerado', 0],
      ['acido', 'baixo', 0],
    ]);
  });

  it('lote vencendo em até 10 dias, só de material com saldo', () => {
    const items = [
      { id: 'a', name: 'A', unit: null, stock_min: 0, balance: 2 },
      { id: 'b', name: 'B', unit: null, stock_min: 0, balance: 0 },
    ];
    const entries = [
      { cost_item_id: 'a', expires_at: '2026-11-15', quantity: 1 },
      { cost_item_id: 'a', expires_at: '2026-12-30', quantity: 1 },
      { cost_item_id: 'b', expires_at: '2026-11-06', quantity: 1 },
      { cost_item_id: 'a', expires_at: '2026-11-01', quantity: 1 },
    ];
    expect(expiringEntries(entries, items, '2026-11-05').map((e) => e.expires_at)).toEqual(['2026-11-01', '2026-11-15']);
  });

  it('material sem estoque lançado não gera alerta', () => {
    const f = forecastItems([{ id: 'x', name: 'X', unit: 'un', stock_min: 5, balance: 0, tracked: false }], { x: 3 });
    expect(f[0]).toMatchObject({ status: 'sem_controle', shortfall: 0 });
  });
});
