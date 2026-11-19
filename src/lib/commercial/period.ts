import { endOfDay, endOfMonth, format, isValid, parseISO, startOfDay, startOfMonth, subDays, subMonths } from 'date-fns';

export const PERIOD_PRESETS = ['mes', 'mes-anterior', '7d', '30d', '90d', 'personalizado'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  mes: 'Este mês',
  'mes-anterior': 'Mês anterior',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  personalizado: 'Personalizado',
};

export interface PeriodRange {
  start: Date;
  end: Date;
  /** 'yyyy-MM' quando o período é exatamente um mês inteiro; senão null. Metas são mensais. */
  goalMonth: string | null;
  label: string;
}

function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

/** Converte a escolha de período em datas. Personalizado inválido cai para o mês atual. */
export function resolvePeriod(preset: PeriodPreset, customStart?: string | null, customEnd?: string | null, today = new Date()): PeriodRange {
  const monthRange = (ref: Date): PeriodRange => ({
    start: startOfMonth(ref),
    end: endOfMonth(ref),
    goalMonth: format(ref, 'yyyy-MM'),
    label: PERIOD_LABELS[preset],
  });
  const lastDays = (n: number): PeriodRange => ({
    start: startOfDay(subDays(today, n - 1)),
    end: endOfDay(today),
    goalMonth: null,
    label: PERIOD_LABELS[preset],
  });

  switch (preset) {
    case 'mes-anterior':
      return monthRange(subMonths(today, 1));
    case '7d':
      return lastDays(7);
    case '30d':
      return lastDays(30);
    case '90d':
      return lastDays(90);
    case 'personalizado': {
      const s = parseDay(customStart);
      const e = parseDay(customEnd);
      if (!s || !e || s > e) return { ...monthRange(today), label: PERIOD_LABELS.mes };
      const start = startOfDay(s);
      const end = endOfDay(e);
      const isFullMonth =
        start.getTime() === startOfMonth(start).getTime() && format(end, 'yyyy-MM-dd') === format(endOfMonth(start), 'yyyy-MM-dd');
      return {
        start,
        end,
        goalMonth: isFullMonth ? format(start, 'yyyy-MM') : null,
        label: `${format(start, 'dd/MM/yyyy')} a ${format(end, 'dd/MM/yyyy')}`,
      };
    }
    case 'mes':
    default:
      return monthRange(today);
  }
}
