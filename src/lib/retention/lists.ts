export type RetentionKind = 'maintenance' | 'package_ending' | 'inactive' | 'birthday';
export type RetentionRow = {
  kind: string; patient_id: string; full_name: string; phone: string | null;
  treatment_id: string | null; treatment_name: string | null; reference_date: string; detail: string;
};

export const RETENTION_TABS: { kind: RetentionKind; label: string; hint: string }[] = [
  { kind: 'maintenance', label: 'Manutenção', hint: 'Tratamentos com manutenção vencendo ou vencida (configure os dias em Tratamentos).' },
  { kind: 'package_ending', label: 'Pacote no fim', hint: 'Pacientes na última sessão do pacote: hora de oferecer a renovação.' },
  { kind: 'inactive', label: 'Sumidos', hint: 'Sem visita há mais de 60 dias e sem horário marcado.' },
  { kind: 'birthday', label: 'Aniversários', hint: 'Aniversariantes dos próximos 7 dias.' },
];

/** Mensagem pronta para o WhatsApp, por motivo. */
export function retentionMessage(row: Pick<RetentionRow, 'kind' | 'full_name' | 'treatment_name'>, clinicName: string) {
  const first = row.full_name.trim().split(/\s+/)[0] || '';
  const hi = `Olá${first ? `, ${first}` : ''}! Aqui é da ${clinicName}.`;
  switch (row.kind) {
    case 'maintenance':
      return `${hi} Está chegando a hora da manutenção do seu ${row.treatment_name || 'tratamento'} para manter o resultado. Quer que a gente reserve um horário para você?`;
    case 'package_ending':
      return `${hi} Seu pacote de ${row.treatment_name || 'tratamento'} está terminando. Que tal conversarmos sobre a continuidade para manter os resultados? Temos condições especiais para renovação.`;
    case 'inactive':
      return `${hi} Sentimos sua falta! Que tal agendar uma avaliação para planejarmos seus próximos cuidados?`;
    default:
      return `${hi} Feliz aniversário! 🎉 Preparamos um presente especial para você no seu mês. Quer saber qual é?`;
  }
}

export function groupRetention(rows: RetentionRow[]) {
  const out: Record<RetentionKind, RetentionRow[]> = { maintenance: [], package_ending: [], inactive: [], birthday: [] };
  for (const r of rows) if (r.kind in out) out[r.kind as RetentionKind].push(r);
  return out;
}
