import { describe, expect, it, vi } from 'vitest';
import { scrub } from '@/lib/monitoring';
import { buildEvent, parseDsn, scrub as edgeScrub } from '../../supabase/functions/_shared/monitoring';

vi.stubGlobal('Deno', { env: { get: () => undefined } });

describe('monitoramento de erros', () => {
  it('mascara e-mail, CPF, telefone e links de paciente', () => {
    const t = scrub('Falhou para ana@clinica.com.br cpf 123.456.789-09 tel (11) 95021-0668 em /anamnese/abc123?x=1');
    expect(t).not.toContain('ana@');
    expect(t).not.toContain('123.456');
    expect(t).not.toContain('95021');
    expect(t).not.toContain('abc123');
    expect(t).toContain('[email]');
    expect(t).toContain('/anamnese/[id]');
  });

  it('funções: mesma máscara', () => {
    expect(edgeScrub('x 12345678909 y@z.com')).toBe('x [cpf] [email]');
  });

  it('lê o DSN do Sentry', () => {
    expect(parseDsn('https://abc@o1.ingest.sentry.io/42')).toEqual({ url: 'https://o1.ingest.sentry.io/api/42/envelope/', key: 'abc' });
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn('lixo')).toBeNull();
  });

  it('evento da função leva só erro, função e rota mascarados', () => {
    const ev = buildEvent('aura-api', new Error('paciente maria@x.com falhou'), { route: '/aura/bookings', contato: null });
    expect(ev.tags).toEqual({ function: 'aura-api', route: '/aura/bookings' });
    expect(ev.exception.values[0].value).toBe('paciente [email] falhou');
    expect(ev).not.toHaveProperty('request');
    expect(ev).not.toHaveProperty('user');
  });
});
