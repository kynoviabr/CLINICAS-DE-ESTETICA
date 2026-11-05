/**
 * Estoque x agenda: quanto de cada material os atendimentos marcados vão gastar,
 * e se o saldo dá conta. Também avisa material abaixo do mínimo e lote vencendo.
 */
export type StockItem = { id: string; name: string; unit: string | null; stock_min: number; balance: number };
export type RecipeLine = { treatment_id: string; cost_item_id: string; quantity: number };
export type PlannedAppointment = { treatment_id: string | null; start_time: string };
export type StockEntry = { cost_item_id: string; expires_at: string | null; quantity: number };

export type ItemStatus = 'ok' | 'baixo' | 'zerado' | 'vai_faltar';

export type ItemForecast = StockItem & {
  needed: number;
  /** Quanto falta comprar para atender a agenda (0 = dá conta). */
  shortfall: number;
  status: ItemStatus;
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Material que a agenda vai consumir, por item. */
export function plannedUsage(appointments: PlannedAppointment[], recipes: RecipeLine[]): Record<string, number> {
  const byTreatment = new Map<string, RecipeLine[]>();
  recipes.forEach((r) => byTreatment.set(r.treatment_id, [...(byTreatment.get(r.treatment_id) ?? []), r]));
  const usage: Record<string, number> = {};
  appointments.forEach((a) => {
    if (!a.treatment_id) return;
    (byTreatment.get(a.treatment_id) ?? []).forEach((r) => {
      usage[r.cost_item_id] = round((usage[r.cost_item_id] ?? 0) + Number(r.quantity));
    });
  });
  return usage;
}

export function forecastItems(items: StockItem[], usage: Record<string, number>): ItemForecast[] {
  return items.map((item) => {
    const needed = usage[item.id] ?? 0;
    const shortfall = Math.max(0, round(needed - item.balance));
    const status: ItemStatus = shortfall > 0
      ? 'vai_faltar'
      : item.balance <= 0
        ? 'zerado'
        : item.stock_min > 0 && item.balance - needed < item.stock_min
          ? 'baixo'
          : 'ok';
    return { ...item, needed, shortfall, status };
  });
}

/** Lotes que vencem em até `days` dias (inclui vencidos), de material que ainda tem saldo. */
export function expiringEntries(entries: StockEntry[], items: StockItem[], today: string, days = 10) {
  const limit = new Date(`${today}T12:00:00`);
  limit.setDate(limit.getDate() + days);
  const limitIso = limit.toISOString().slice(0, 10);
  const withBalance = new Set(items.filter((i) => i.balance > 0).map((i) => i.id));
  return entries
    .filter((e) => e.expires_at && e.quantity > 0 && e.expires_at <= limitIso && withBalance.has(e.cost_item_id))
    .sort((a, b) => (a.expires_at! < b.expires_at! ? -1 : 1));
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  ok: 'OK',
  baixo: 'Acabando',
  zerado: 'Zerado',
  vai_faltar: 'Vai faltar',
};

export function formatQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}
