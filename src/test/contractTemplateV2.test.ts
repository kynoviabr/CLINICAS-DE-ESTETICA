import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderContractTemplate, sanitizeContractTemplate } from '@/lib/contractTemplateRenderer';

const html = readFileSync('supabase/templates/contrato_padrao_v2.html', 'utf8');
const data = {
  clinic: { name: 'Aura Guarujá', cnpj: '12.345.678/0001-95', address: 'Av. Atlântica, 100', city: 'Guarujá', state: 'SP', phone: '(13) 99999-0000', email: 'contato@aura.com' },
  patient: { name: 'Maria Souza', cpf: '529.982.247-25', birth_date: '20/05/1990', address: 'Rua A, 10 - Centro, Santos/SP' },
  contract: { number: 'CT-2026-001', date: '06/11/2026', start_date: '06/11/2026', end_date: '' },
  treatments: { summary: 'Toxina botulínica full face', total_sessions: 1 },
  payment: { total_value: 'R$ 1.800,00', condition: 'Parcelado', methods: 'Pix: R$ 600,00 | Cartão de crédito: 2x de R$ 600,00', installments: 3, due_dates: '1ª em 06/11/2026, demais a cada 30 dias' },
  proposal: { number: 'PROP-202611-001' },
  anamnesis: { number: 'ANM-0001' },
};

describe('contrato padrão v2', () => {
  it('todos os campos são conhecidos e preenchidos', () => {
    const r = renderContractTemplate(html, data);
    expect(r.unknownPlaceholders).toEqual([]);
    expect(r.missingRequired).toEqual([]);
    expect(r.html).not.toMatch(/\{\{/);
    expect(r.html).toContain('Maria Souza');
    expect(r.html).not.toContain('RESPONSÁVEL FINANCEIRO');
  });

  it('com responsável financeiro mostra a cláusula e a assinatura', () => {
    const r = renderContractTemplate(html, { ...data, payer: { name: 'João Souza', cpf: '111.444.777-35', birth_date: '01/01/1960' } });
    expect(r.html.match(/RESPONSÁVEL FINANCEIRO/g)).toHaveLength(2);
  });

  it('passa na limpeza de HTML sem perder conteúdo', () => {
    expect(sanitizeContractTemplate(html).length).toBeGreaterThan(html.length * 0.95);
  });
});
