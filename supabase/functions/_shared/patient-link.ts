// Regras do link do paciente (confirmar, remarcar, cancelar). Puras, para testar sem banco.

/** Horas antes do atendimento até quando o paciente pode remarcar ou cancelar pelo link. Sem valor na clínica: 24 h. */
export const DEFAULT_NOTICE_HOURS = 24;

export function changeDeadline(startIso: string, noticeHours: number | null | undefined): Date {
  const h = noticeHours == null || Number.isNaN(Number(noticeHours)) ? DEFAULT_NOTICE_HOURS : Math.max(0, Number(noticeHours));
  return new Date(Date.parse(startIso) - h * 3600_000);
}

export type LinkState = "ok" | "expired" | "closed";

/** O que o paciente pode fazer agora. */
export function linkPermissions(a: { start: string; status: string }, noticeHours: number | null | undefined, now = Date.now()) {
  const started = Date.parse(a.start) <= now;
  const open = ["scheduled", "confirmed"].includes(a.status);
  const beforeDeadline = now < changeDeadline(a.start, noticeHours).getTime();
  return {
    state: (started ? "expired" : open ? "ok" : "closed") as LinkState,
    canConfirm: !started && a.status === "scheduled",
    canChange: !started && open && beforeDeadline,
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const isToken = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f]{64}$/.test(t);
