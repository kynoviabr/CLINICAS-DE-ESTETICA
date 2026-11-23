import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { changeDeadline, isToken, linkPermissions, sha256Hex } from '../../supabase/functions/_shared/patient-link';

const now = Date.parse('2026-11-20T12:00:00-03:00');
const at = (h: number) => new Date(now + h * 3600_000).toISOString();

describe('link do paciente', () => {
  it('prazo padrão de 24 h quando a clínica não definiu', () => {
    expect(changeDeadline(at(48), null).toISOString()).toBe(at(24));
    expect(changeDeadline(at(48), 6).toISOString()).toBe(at(42));
  });

  it('marcado e com folga: confirma e muda', () => {
    expect(linkPermissions({ start: at(48), status: 'scheduled' }, 24, now)).toEqual({ state: 'ok', canConfirm: true, canChange: true });
  });

  it('dentro do prazo mínimo: só confirma, não remarca nem cancela', () => {
    expect(linkPermissions({ start: at(10), status: 'scheduled' }, 24, now)).toEqual({ state: 'ok', canConfirm: true, canChange: false });
  });

  it('já confirmado: não confirma de novo, mas ainda pode mudar', () => {
    expect(linkPermissions({ start: at(48), status: 'confirmed' }, 24, now)).toEqual({ state: 'ok', canConfirm: false, canChange: true });
  });

  it('cancelado ou já passou', () => {
    expect(linkPermissions({ start: at(48), status: 'cancelled' }, 24, now).state).toBe('closed');
    expect(linkPermissions({ start: at(-1), status: 'scheduled' }, 24, now)).toEqual({ state: 'expired', canConfirm: false, canChange: false });
  });

  it('código e hash iguais aos do banco', async () => {
    expect(isToken('a'.repeat(64))).toBe(true);
    expect(isToken('xyz')).toBe(false);
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

import { appointmentLinkUrl, dayLabel, groupByDay, reminderMessage } from '@/lib/appointments/patientLink';

describe('link do paciente na tela', () => {
  it('url e mensagem', () => {
    const url = appointmentLinkUrl('https://app.x/', 'f'.repeat(64));
    expect(url).toBe(`https://app.x/agendamento/${'f'.repeat(64)}`);
    const m = reminderMessage({ firstName: 'Ana', clinicName: 'Clínica X', service: 'Limpeza', when: 'quinta, 20/11 às 14:00', professional: null, url });
    expect(m).toContain(url);
    expect(m).not.toContain('Com:');
  });
  it('dia da semana e agrupamento no horário de Brasília', () => {
    expect(dayLabel('2026-11-20')).toBe('Sexta, 20 de nov');
    expect(groupByDay([{ start: '2026-11-20T09:00:00-03:00' }, { start: '2026-11-20T09:30:00-03:00' }, { start: '2026-11-21T10:00:00-03:00' }]))
      .toEqual([{ date: '2026-11-20', times: ['09:00', '09:30'] }, { date: '2026-11-21', times: ['10:00'] }]);
  });
});
