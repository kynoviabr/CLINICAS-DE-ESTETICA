import { formatBRL } from '@/lib/proposals/sale';

/** Barras horizontais com valor: usadas em Despesas (por categoria) e no Financeiro (receitas e despesas). */
export function BreakdownBars({ rows, barClassName = 'bg-primary' }: { rows: Array<[string, number]>; barClassName?: string }) {
  const total = rows.reduce((s, [, v]) => s + v, 0);
  return (
    <ul className="space-y-2.5">
      {rows.map(([label, value]) => {
        const pct = total ? Math.round((value / total) * 100) : 0;
        return (
          <li key={label} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="truncate">{label}</span>
              <span className="shrink-0 font-medium">
                {formatBRL(value)} <span className="font-normal text-muted-foreground">· {pct}%</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div className={`h-1.5 rounded-full ${barClassName}`} style={{ width: `${Math.max(2, total ? (value / total) * 100 : 0)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
