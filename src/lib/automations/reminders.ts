/** Opções de antecedência do lembrete automático. */
export const HOURS_OPTIONS = [
  { value: 2, label: '2 horas antes' },
  { value: 6, label: '6 horas antes' },
  { value: 24, label: '1 dia antes' },
  { value: 48, label: '2 dias antes' },
];

export type AutomationRun = {
  id: string; kind: string; status: 'sent' | 'failed' | 'skipped'; detail: string | null;
  recipient_name: string | null; created_at: string; updated_at: string | null;
};

/** Contagem do mês atual (testes não contam). */
export function summarizeRuns(runs: AutomationRun[], now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const out = { sent: 0, failed: 0, skipped: 0 };
  for (const r of runs) {
    if (r.kind !== 'reminder' || (r.updated_at || r.created_at).slice(0, 7) !== month) continue;
    out[r.status] += 1;
  }
  return out;
}

/** Texto do modelo com dados de exemplo ({{1}} nome, {{2}} clínica, {{3}} data e link). */
export function previewReminder(body: string | null | undefined, clinicName: string) {
  if (!body) return '';
  const sample = ['Maria', clinicName, 'sexta, 27/11 às 14:00. Confirme, remarque ou cancele pelo link https://…/agendamento/…'];
  return body.replace(/\{\{(\d+)\}\}/g, (_m, n) => sample[Number(n) - 1] ?? `{{${n}}}`);
}
