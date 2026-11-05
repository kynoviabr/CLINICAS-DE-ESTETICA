import { describe, expect, it } from 'vitest';
import {
  buildProposalHtml, defaultValidUntil, itemsBelowMinimum, mailtoLink, proposalShareText, saleTotal, validateSalePayment, whatsappLink,
  type SaleItem,
} from '@/lib/proposals/sale';

const items: SaleItem[] = [
  { treatment_id: 't1', name: 'Limpeza de pele', quantity: 2, unit_price: 180, min_price: 150 },
  { treatment_id: 't2', name: 'Peeling <glow>', quantity: 1, unit_price: 160, min_price: 170, num_sessions: 4 },
];

describe('Nova venda', () => {
  it('soma o total', () => {
    expect(saleTotal(items)).toBe(520);
  });

  it('acusa item abaixo do preço mínimo', () => {
    expect(itemsBelowMinimum(items).map((i) => i.treatment_id)).toEqual(['t2']);
  });

  it('validade padrão de 7 dias', () => {
    // quinta + 5 dias úteis = quinta seguinte; sexta + 5 = sexta seguinte (pula o fim de semana)
    expect(defaultValidUntil(new Date(2026, 10, 5))).toBe('2026-11-12');
    expect(defaultValidUntil(new Date(2026, 10, 6))).toBe('2026-11-13');
    expect(defaultValidUntil(new Date(2026, 10, 7))).toBe('2026-11-13');
  });

  it('confere a forma de pagamento', () => {
    expect(validateSalePayment([], {}, 520)).toMatch(/forma de pagamento/);
    expect(validateSalePayment(['card'], { card: { amount: '520', installments: '' } }, 520)).toMatch(/parcelas/);
    expect(validateSalePayment(['pix'], { pix: { amount: '300' } }, 520)).toMatch(/cobrir o total/);
    expect(validateSalePayment(['pix', 'card'], { pix: { amount: '220' }, card: { amount: '300', installments: '3' } }, 520)).toBeNull();
  });

  it('proposta escapa o texto digitado', () => {
    const html = buildProposalHtml({ clinicName: 'Clínica <b>', number: 'PROP-1', date: new Date(2026, 10, 5), clientName: 'Ana', items, total: 520 });
    expect(html).toContain('Peeling &lt;glow&gt;');
    expect(html).toContain('Clínica &lt;b&gt;');
    expect(html).not.toContain('<glow>');
  });

  it('mensagem e links de envio', () => {
    const text = proposalShareText({ clientName: 'Ana Souza', clinicName: 'Vive', number: 'PROP-1', total: 520, validUntil: '2026-11-12', items });
    expect(text).toContain('Oi Ana!');
    expect(text).toContain('vale até 12/11');
    expect(whatsappLink('(13) 99702-1099', 'oi')).toBe('https://wa.me/5513997021099?text=oi');
    expect(whatsappLink('', 'oi')).toBe('https://wa.me/?text=oi');
    expect(mailtoLink('ana@x.com', 'Proposta', 'Olá')).toBe('mailto:ana%40x.com?subject=Proposta&body=Ol%C3%A1');
  });
});
