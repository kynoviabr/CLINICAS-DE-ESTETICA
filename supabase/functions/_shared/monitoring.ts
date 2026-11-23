/**
 * Monitoramento de erros das funções (Sentry), sem dependência externa.
 * Desligado sem o segredo SENTRY_DSN. Envia só o erro, a função e a rota,
 * com e-mails, CPFs e telefones mascarados. Nunca envia corpo de requisição.
 */

declare const Deno: { env: { get(name: string): string | undefined } };

const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;

export function scrub(text: string): string {
  return text.replace(EMAIL, "[email]").replace(CPF, "[cpf]").replace(PHONE, "[telefone]");
}

type Dsn = { url: string; key: string };

export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!u.username || !projectId) return null;
    return { url: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, key: u.username };
  } catch {
    return null;
  }
}

export function buildEvent(fn: string, err: unknown, tags: Record<string, string | null | undefined> = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  const cleanTags: Record<string, string> = { function: fn };
  for (const [k, v] of Object.entries(tags)) if (v) cleanTags[k] = scrub(String(v)).slice(0, 200);
  return {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    environment: Deno.env.get("SENTRY_ENVIRONMENT") || "homolog",
    server_name: fn,
    tags: cleanTags,
    exception: {
      values: [{
        type: e.name || "Error",
        value: scrub(e.message || "").slice(0, 1000),
        stacktrace: e.stack ? { frames: stackFrames(e.stack) } : undefined,
      }],
    },
  };
}

function stackFrames(stack: string) {
  return stack.split("\n").slice(1, 30).reverse().map((line) => {
    const m = line.match(/at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
    return m ? { function: m[1] || "?", filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) } : { function: line.trim() };
  });
}

/** Registra o erro no console e, se configurado, no Sentry. Nunca lança erro. */
export async function captureError(fn: string, err: unknown, tags: Record<string, string | null | undefined> = {}) {
  console.error(fn, tags.route || "", err);
  const dsn = parseDsn(Deno.env.get("SENTRY_DSN"));
  if (!dsn) return;
  try {
    const event = buildEvent(fn, err, tags);
    const body = `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
    await fetch(dsn.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=klinova-edge/1.0`,
      },
      body,
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.warn("sentry", (e as Error).message);
  }
}
