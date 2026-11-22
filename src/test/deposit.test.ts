import { describe, expect, it } from 'vitest';
import {
  brlInWords, buildDepositReceiptHtml, contractAmounts, depositReady, depositReceiptMessage, depositRequestMessage, parseDepositConfig, withAdvance,
} from '@/lib/finance/deposit';

describe('valor por extenso', () => {
  it.each([
    [1, 'um real'],
    [50, 'cinquenta reais'],
    [100, 'cem reais'],
    [101, 'cento e um reais'],
    [150.5, 'cento e cinquenta reais e cinquenta centavos'],
    [1000, 'mil reais'],
    [1100, 'mil e cem reais'],
    [1250, 'mil duzentos e cinquenta reais'],
    [2015, 'dois mil e quinze reais'],
    [0.01, 'um centavo'],
    [1_000_000, 'um milhão de reais'],
  ])('%s -> %s', (v, words) => expect(brlInWords(v)).toBe(words));
});

describe('configuração do sinal', () => {
  it('usa os padrões e só fica pronta com chave, nome e cidade', () => {
    const c = parseDepositConfig(null);
    expect(c.notice_hours).toBe(24);
    expect(depositReady(c)).toBe(false);
    expect(depositReady(parseDepositConfig(JSON.stringify({ pix_key: '+5513991234567', pix_name: 'Aura', pix_city: 'Santos' })))).toBe(true);
    expect(parseDepositConfig('{quebrado').amount_evaluation).toBe(50);
  });
});

describe('mensagens e recibo', () => {
  const start = '2026-11-25T17:00:00.000Z';
  it('mensagem de cobrança tem valor, link e prazo para remarcar', () => {
    const m = depositRequestMessage({ clientName: 'Ana Lima', clinicName: 'Aura', amount: 50, startTime: start, kind: 'evaluation', treatment: 'Toxina', url: 'https://x/sinal/abc', dueAt: null, noticeHours: 24 });
    expect(m).toContain('Olá, Ana!');
    expect(m).toContain('R$');
    expect(m).toContain('https://x/sinal/abc');
    expect(m).toContain('24 horas');
  });

  it('mensagem do recibo confirma o horário', () => {
    const m = depositReceiptMessage({ clientName: 'Ana', amount: 50, startTime: start, kind: 'single', treatment: 'Peeling', noticeHours: 24, url: 'https://x', pdfAttached: true });
    expect(m).toContain('confirmado');
    expect(m).toContain('Peeling');
  });

  it('recibo traz clínica, pagador, extenso e as condições, sem HTML injetado', () => {
    const html = buildDepositReceiptHtml({
      clinic: { name: 'Aura <b>', document: '12345678000190', address: 'Rua A, 1', city: 'Guarujá', state: 'SP' },
      number: 'RS-2026-0001', amount: 50, paidAt: '2026-11-22T15:00:00.000Z', payerName: 'Maria Lima', payerCpf: '52998224725',
      clientName: 'Ana Lima', kind: 'evaluation', treatment: null, startTime: start, professional: 'Dra. Paula',
      noticeHours: 24, creditDays: 90, policyAcceptedAt: '2026-11-22T14:00:00.000Z',
    });
    expect(html).toContain('RS-2026-0001');
    expect(html).toContain('12.345.678/0001-90');
    expect(html).toContain('529.982.247-25');
    expect(html).toContain('cinquenta reais');
    expect(html).toContain('arras confirmatórias');
    expect(html).toContain('válido por 90 dias');
    expect(html).toContain('Aura &lt;b&gt;');
    expect(html).not.toContain('Aura <b>');
  });
});

describe('adiantamento no contrato', () => {
  const dep = [{ id: 'd1', amount: 100, paid_at: '2026-11-22T15:00:00.000Z', payer_name: 'Maria Lima', receipt_number: 'RS-2026-0001' }];
  const base = { total_value: 'R$ 1.000,00', condition: 'À vista', methods: 'Pix à vista', installments: 1, due_dates: '22/11/2026' };

  it('valor a pagar = total - adiantamento', () => {
    expect(contractAmounts(1000, dep)).toEqual({ total: 1000, advance: 100, due: 900 });
    expect(contractAmounts(50, dep).due).toBe(0);
  });

  it('modelo antigo: adiantamento e saldo entram em "Forma(s) de pagamento"', () => {
    const p = withAdvance(base, 1000, dep, '<p>Forma(s): {{payment.methods}}</p>');
    expect(p.methods).toContain('Adiantamento (sinal pago via Pix)');
    expect(p.methods).toContain('22/11/2026');
    expect(p.methods).toContain('Maria Lima');
    expect(p.methods).toContain('RS-2026-0001');
    expect(p.methods).toContain('Valor a pagar');
    expect(p.methods).toContain('Pix à vista');
    expect(p.total_value).toBe('R$ 1.000,00');
  });

  it('modelo com os campos do sinal: não repete em "Forma(s)"', () => {
    const p = withAdvance(base, 1000, dep, '<p>{{payment.advance_details}} Saldo: {{payment.amount_due}}</p>');
    expect(p.methods).toBe('Pix à vista');
    expect(p.advance_details).toContain('RS-2026-0001');
    expect(p.amount_due.replace(/\s/g, ' ')).toContain('900,00');
  });

  it('sem sinal não muda nada', () => {
    const p = withAdvance(base, 1000, [], '');
    expect(p.methods).toBe('Pix à vista');
    expect(p.advance).toBe('');
  });
});

describe('folha de assinatura do recibo', () => {
  it('traz a confirmação da clínica e o aceite das condições pela cliente', () => {
    const html = buildDepositReceiptHtml({
      clinic: { name: 'Aura' }, number: 'RS-2026-0002', amount: 50, paidAt: '2026-11-22T15:00:00.000Z', payerName: 'Maria',
      clientName: 'Ana Lima', kind: 'single', treatment: 'Peeling', startTime: '2026-11-25T17:00:00.000Z', noticeHours: 24, creditDays: 90,
      policyAcceptedAt: '2026-11-22T14:00:00.000Z', policyAcceptedIp: '200.1.2.3', policyAcceptedUserAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1',
      confirmedBy: 'Dra. Paula',
    });
    expect(html).toContain('Folha de assinatura');
    expect(html).toContain('Recebimento confirmado por Dra. Paula');
    expect(html).toContain('200.1.2.3');
    expect(html).toContain('Li e concordo');
  });
});
