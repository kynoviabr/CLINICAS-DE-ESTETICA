// Regras do lembrete automático. Puras, para testar sem banco nem WhatsApp.
import { localIso } from "./agenda.ts";

/** Envia só entre 8h e 20h (Brasília), para não acordar o paciente. */
export function canSendNow(nowMs: number) {
  const h = Number(localIso(new Date(nowMs)).slice(11, 13));
  return h >= 8 && h < 20;
}

/** Atendimentos que entram na janela do lembrete: começam entre 1 h e N horas a partir de agora. */
export function reminderWindow(nowMs: number, hoursBefore: number) {
  return { from: new Date(nowMs + 3600_000).toISOString(), to: new Date(nowMs + hoursBefore * 3600_000).toISOString() };
}

const WEEK = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "sexta, 27/11 às 14:00" no horário de Brasília. */
export function whenLabel(startIso: string) {
  const l = localIso(new Date(startIso));
  const wd = new Date(`${l.slice(0, 10)}T12:00:00Z`).getUTCDay();
  return `${WEEK[wd]}, ${l.slice(8, 10)}/${l.slice(5, 7)} às ${l.slice(11, 16)}`;
}

/**
 * Parâmetros do modelo padrão aura_lembrete_horario:
 * "Olá {{1}}, lembrete do seu horário na {{2}}: {{3}}. Responda SIM para confirmar ou nos chame para remarcar."
 * O {{3}} leva a data e o link de confirmar/remarcar/cancelar.
 */
export function reminderParams(fullName: string, clinicName: string, startIso: string, url: string) {
  const first = (fullName || "").trim().split(/\s+/)[0] || "tudo bem";
  return [first, clinicName, `${whenLabel(startIso)}. Confirme, remarque ou cancele pelo link ${url}`];
}

/** Mensagem de erro curta para o histórico (sem dados pessoais). */
export function shortError(e: unknown) {
  return String((e as Error)?.message || e || "erro").replace(/\+?\d[\d\s().-]{8,}\d/g, "[telefone]").slice(0, 200);
}
