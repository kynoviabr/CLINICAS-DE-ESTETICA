/**
 * Monitoramento de erros (Sentry).
 * Desligado sem VITE_SENTRY_DSN. Não envia dados de paciente: só a mensagem do erro,
 * a tela, a clínica (id) e o papel do usuário. E-mails, CPFs e telefones são mascarados.
 */
import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
let enabled = false;

const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;
const TOKEN = /(\/anamnese\/|\/proposta\/|\/p\/)[^/?#\s]+/gi;

/** Mascara dados pessoais em um texto. */
export function scrub(text: string): string {
  return text.replace(EMAIL, '[email]').replace(CPF, '[cpf]').replace(PHONE, '[telefone]').replace(TOKEN, '$1[id]');
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  delete event.user;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    if (event.request.url) event.request.url = scrub(event.request.url.split('?')[0]);
    delete event.request.query_string;
  }
  if (event.message) event.message = scrub(event.message);
  for (const ex of event.exception?.values || []) if (ex.value) ex.value = scrub(ex.value);
  for (const b of event.breadcrumbs || []) {
    if (b.message) b.message = scrub(b.message);
    if (b.data?.url) b.data.url = scrub(String(b.data.url).split('?')[0]);
    if (b.data && 'body' in b.data) delete b.data.body;
  }
  return event;
}

export function initMonitoring() {
  if (!dsn || enabled) return;
  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_APP_ENV as string | undefined) || import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: (b) => (b.category === 'ui.input' ? null : b),
  });
  enabled = true;
}

/** Marca a clínica e o papel do usuário nos próximos erros (sem nome nem e-mail). */
export function setMonitoringContext(ctx: { clinicId?: string | null; role?: string | null }) {
  if (!enabled) return;
  Sentry.setTag('clinic_id', ctx.clinicId || 'none');
  Sentry.setTag('role', ctx.role || 'none');
}

export function captureError(err: unknown, extra?: Record<string, unknown>) {
  if (!enabled) { console.error(err); return; }
  Sentry.captureException(err, extra ? { extra } : undefined);
}

export const ErrorBoundary = Sentry.ErrorBoundary;
