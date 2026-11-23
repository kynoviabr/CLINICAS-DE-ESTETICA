import { describe, expect, it } from 'vitest';
import { canSendNow, reminderParams, reminderWindow, shortError, whenLabel } from '../../supabase/functions/_shared/reminders';

const at = (iso: string) => Date.parse(iso);

describe('lembrete automático', () => {
  it('só envia entre 8h e 20h de Brasília', () => {
    expect(canSendNow(at('2026-11-20T07:59:00-03:00'))).toBe(false);
    expect(canSendNow(at('2026-11-20T08:00:00-03:00'))).toBe(true);
    expect(canSendNow(at('2026-11-20T19:59:00-03:00'))).toBe(true);
    expect(canSendNow(at('2026-11-20T20:00:00-03:00'))).toBe(false);
  });

  it('janela: de 1 h até N horas à frente', () => {
    const now = at('2026-11-20T10:00:00-03:00');
    expect(reminderWindow(now, 24)).toEqual({ from: '2026-11-20T14:00:00.000Z', to: '2026-11-21T13:00:00.000Z' });
  });

  it('parâmetros do modelo com data e link', () => {
    expect(whenLabel('2026-11-27T17:00:00.000Z')).toBe('sexta, 27/11 às 14:00');
    expect(reminderParams('Ana Lima', 'Clínica X', '2026-11-27T17:00:00.000Z', 'https://x/agendamento/abc'))
      .toEqual(['Ana', 'Clínica X', 'sexta, 27/11 às 14:00. Confirme, remarque ou cancele pelo link https://x/agendamento/abc']);
  });

  it('erro do histórico sem telefone', () => {
    expect(shortError(new Error('Falhou para 5511950210668'))).toBe('Falhou para [telefone]');
  });
});

import { previewReminder, summarizeRuns } from '@/lib/automations/reminders';

describe('tela de automações', () => {
  it('prévia troca os campos do modelo', () => {
    expect(previewReminder('Olá {{1}}, lembrete na {{2}}: {{3}}.', 'Clínica X')).toContain('Olá Maria, lembrete na Clínica X: sexta');
    expect(previewReminder(null, 'X')).toBe('');
  });
  it('conta só lembretes do mês, sem testes', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    const base = { id: '1', detail: null, recipient_name: null, updated_at: null };
    expect(summarizeRuns([
      { ...base, kind: 'reminder', status: 'sent', created_at: '2026-11-02T10:00:00Z' },
      { ...base, kind: 'reminder', status: 'failed', created_at: '2026-11-03T10:00:00Z' },
      { ...base, kind: 'reminder', status: 'sent', created_at: '2026-10-30T10:00:00Z' },
      { ...base, kind: 'reminder_test', status: 'sent', created_at: '2026-11-04T10:00:00Z' },
    ], now)).toEqual({ sent: 1, failed: 1, skipped: 0 });
  });
});
