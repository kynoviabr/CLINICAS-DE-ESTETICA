import { describe, expect, it } from 'vitest';
import { buildLetterhead, formatClinicDocument, letterheadLines } from '@/lib/documents/letterhead';

describe('papel timbrado da clínica', () => {
  it('formata CNPJ e CPF', () => {
    expect(formatClinicDocument('12345678000195')).toBe('12.345.678/0001-95');
    expect(formatClinicDocument('52998224725')).toBe('529.982.247-25');
  });

  it('monta as linhas só com o que existe', () => {
    expect(letterheadLines({ name: 'Aura', document: '52998224725', city: 'Guarujá', state: 'SP', phone: '(13) 9999-0000' }))
      .toEqual(['CPF 529.982.247-25', 'Guarujá/SP', '(13) 9999-0000']);
  });

  it('escapa texto e só aceita logo https', () => {
    const html = buildLetterhead({ name: '<b>X</b>', logoUrl: 'javascript:alert(1)' });
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(html).not.toContain('<img');
  });
});

import { describeDueDates, describePaymentMethods } from '@/lib/documents/contractPayment';

describe('pagamento por extenso no contrato', () => {
  it('formas com valor e parcelas', () => {
    const text = describePaymentMethods(['pix', 'credit'], { pix: { amount: '600' }, credit: { amount: '1200', installments: '3' } }).replace(/\s/g, ' ');
    expect(text).toBe('Pix: R$ 600,00; Cartão de crédito: R$ 1.200,00 em 3x de R$ 400,00');
    expect(describeDueDates(['pix'], { pix: { amount: '1' } }, '06/11/2026')).toBe('à vista, em 06/11/2026');
    expect(describeDueDates(['credit'], { credit: { amount: '9', installments: '3' } }, '06/11/2026')).toMatch(/^à vista ou 1ª parcela/);
  });
});
