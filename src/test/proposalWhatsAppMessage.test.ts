import { describe, expect, it } from 'vitest';
import { proposalWhatsAppMessage } from '@/lib/proposals/whatsappMessage';

const base = {
  clientName: 'Demetrio Paschoa',
  clinicName: 'Aura Guarujá',
  number: 'PROP-202611-219',
  items: [
    { name: 'Limpeza de pele profunda', quantity: 2, unitPrice: 180 },
    { name: 'Peeling antiacne', quantity: 1, unitPrice: 14.98 },
  ],
  standardTotal: 374.98,
  finalTotal: 374.98,
  approveUrl: 'https://klinova-homolog.vercel.app/proposta/abc',
  pdfAttached: true,
};

describe('mensagem da proposta no WhatsApp', () => {
  it('é curta, com itens, total, um único link para aprovar e aviso do PDF anexado', () => {
    const msg = proposalWhatsAppMessage({ ...base, paymentSummary: 'Pix à vista', validUntil: '13/11/2026' });
    expect(msg).toMatch(/^Olá, Demetrio!/);
    expect(msg).toContain('• Limpeza de pele profunda (2x): R$ 360,00');
    expect(msg).toContain('• Peeling antiacne: R$');
    expect(msg).toContain('*Total: R$ 374,98*');
    expect(msg).toContain('Válida até 13/11/2026');
    expect(msg).toContain('*aprovar a proposta*');
    expect(msg.match(/https?:\/\//g)).toHaveLength(1);
    expect(msg).toContain('O PDF da proposta está anexado');
  });

  it('mostra o desconto como "de … por …"', () => {
    const msg = proposalWhatsAppMessage({ ...base, standardTotal: 400, finalTotal: 360, discountAmount: 40, discountPercent: 10 });
    expect(msg).toContain('De R$ 400,00 por *R$ 360,00* (10% de desconto)');
  });
});
