// Fluxo de caixa: entradas e saídas realizadas e previstas, agrupadas por dia, semana ou mês, com saldo acumulado.

export type Movement = {
  date: string;              // AAAA-MM-DD (data em que o dinheiro entra/sai)
  amount: number;            // positivo = entrada, negativo = saída
  realized: boolean;         // já aconteceu (true) ou é previsão (false)
  source: 'installment' | 'card' | 'deposit' | 'expense' | 'refund';
  label: string;
};

export type Group = 'day' | 'week' | 'month';

export type CashRow = {
  key: string; label: string; from: string;
  inRealized: number; inForecast: number; outRealized: number; outForecast: number;
  net: number; balance: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function weekStart(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  const dow = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

const br = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function groupKey(iso: string, group: Group): { key: string; label: string; from: string } {
  if (group === 'day') return { key: iso, label: br(iso), from: iso };
  if (group === 'week') {
    const ws = weekStart(iso);
    const we = new Date(`${ws}T12:00:00`); we.setDate(we.getDate() + 6);
    return { key: ws, label: `${br(ws)} a ${br(we.toISOString().slice(0, 10))}`, from: ws };
  }
  const m = iso.slice(0, 7);
  return { key: m, label: `${MONTHS[Number(m.slice(5)) - 1]}/${m.slice(0, 4)}`, from: `${m}-01` };
}

/** Agrupa os movimentos do período e calcula o saldo a partir do saldo inicial. */
export function buildCashFlow(movements: Movement[], group: Group, opening = 0): { rows: CashRow[]; totals: Omit<CashRow, 'key' | 'label' | 'from'> } {
  const map = new Map<string, CashRow>();
  for (const m of movements) {
    if (!m.date || !Number.isFinite(m.amount) || m.amount === 0) continue;
    const g = groupKey(m.date, group);
    const row = map.get(g.key) ?? { ...g, inRealized: 0, inForecast: 0, outRealized: 0, outForecast: 0, net: 0, balance: 0 };
    if (m.amount > 0) { if (m.realized) row.inRealized += m.amount; else row.inForecast += m.amount; }
    else if (m.realized) row.outRealized += -m.amount; else row.outForecast += -m.amount;
    map.set(g.key, row);
  }
  let balance = opening;
  const rows = [...map.values()].sort((a, b) => a.from.localeCompare(b.from)).map((r) => {
    const net = r2(r.inRealized + r.inForecast - r.outRealized - r.outForecast);
    balance = r2(balance + net);
    return { ...r, inRealized: r2(r.inRealized), inForecast: r2(r.inForecast), outRealized: r2(r.outRealized), outForecast: r2(r.outForecast), net, balance };
  });
  const sum = (k: 'inRealized' | 'inForecast' | 'outRealized' | 'outForecast') => r2(rows.reduce((s, r) => s + r[k], 0));
  const totals = { inRealized: sum('inRealized'), inForecast: sum('inForecast'), outRealized: sum('outRealized'), outForecast: sum('outForecast'), net: 0, balance };
  totals.net = r2(totals.inRealized + totals.inForecast - totals.outRealized - totals.outForecast);
  return { rows, totals };
}
