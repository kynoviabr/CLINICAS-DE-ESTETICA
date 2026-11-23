import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { buildContractPaymentNotes } from '@/lib/contractFinance';
import { buildPaymentPresetSummary, sanitizePaymentSnapshot } from '@/lib/proposals/paymentPreset';
import { validateSalePayment } from '@/lib/proposals/sale';

// Este texto é o mesmo usado em tests/db/formasPagamento.test.sql (o banco gera as parcelas a partir dele).
export const NOTES = 'Condição: Parcelado\nFormas: Pix: R$ 500.00 | Cartão de crédito: valor R$ 1200.00 | 3x de R$ 400.00 | Cartão de débito: R$ 200.00 | Dinheiro: R$ 100.00 | Transferência: R$ 50.00 | Boleto: valor R$ 600.00 | 2x de R$ 300.00';

describe('formas de pagamento sem limite, débito e crédito separados', () => {
  const methods = ['pix', 'credit', 'debit', 'cash', 'transfer', 'boleto'] as const;
  const config = {
    pix: { amount: '500' }, credit: { amount: '1200', installments: '3' }, debit: { amount: '200' },
    cash: { amount: '100' }, transfer: { amount: '50' }, boleto: { amount: '600', installments: '2' },
  };

  it('texto do contrato que o banco lê', () => {
    expect(buildContractPaymentNotes([...methods], config, {}, 'Parcelado')).toBe(NOTES);
  });

  it('proposta guarda todas as formas (antes cortava em 2)', () => {
    const snap = sanitizePaymentSnapshot({ condition: 'installments', methods: [...methods], config, details: {} });
    expect(snap!.methods).toHaveLength(6);
    expect(buildPaymentPresetSummary(snap)).toContain('Cartão de crédito: R$');
    expect(buildPaymentPresetSummary(snap)).toContain('3x de R$');
  });

  it('crédito e boleto pedem parcelas; débito não', () => {
    expect(validateSalePayment(['credit'], { credit: { amount: '100' } }, 100)).toMatch(/parcelas/);
    expect(validateSalePayment(['debit'], { debit: { amount: '100' } }, 100)).toBeNull();
    expect(validateSalePayment(['pix', 'debit'], { pix: { amount: '50' }, debit: { amount: '50' } }, 100)).toBeNull();
  });
});
