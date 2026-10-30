import { renderContractTemplate } from '../../src/lib/contractTemplateRenderer';
import { describe, it, expect } from 'vitest';

describe('contractTemplateRenderer', () => {
  const data = {
    patient: { name: 'João Silva', cpf: '111' },
    clinic: { name: 'Clinica X', cnpj: '222' }
  };

  it('substitutes correctly', () => {
    const html = 'Paciente: {{patient.name}} (CPF: {{patient.cpf}})';
    const result = renderContractTemplate(html, data);
    expect(result.html).toBe('Paciente: João Silva (CPF: 111)');
    expect(result.missingRequired).toHaveLength(0);
  });

  it('escapes html to prevent XSS in data', () => {
    const maliciousData = { patient: { name: '<script>alert(1)</script>' } };
    const html = '{{patient.name}}';
    const result = renderContractTemplate(html, maliciousData);
    expect(result.html).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('detects missing required fields', () => {
    const html = 'Paciente: {{patient.name}} (CPF: {{patient.cpf}})';
    const noCpfData = { patient: { name: 'João Silva' } };
    const result = renderContractTemplate(html, noCpfData);
    expect(result.missingRequired).toContain('patient.cpf');
  });

  it('detects unknown placeholders', () => {
    const html = '{{unknown.field}}';
    const result = renderContractTemplate(html, data);
    expect(result.unknownPlaceholders).toContain('unknown.field');
  });

  it('handles optional blocks', () => {
    const html = '{{#if payer}}Pagador: {{payer.name}}{{/if}} Fim';
    
    // Without payer
    const res1 = renderContractTemplate(html, data);
    expect(res1.html).toBe(' Fim');

    // With payer
    const dataWithPayer = { ...data, payer: { name: 'Maria' } };
    const res2 = renderContractTemplate(html, dataWithPayer);
    expect(res2.html).toBe('Pagador: Maria Fim');
  });

  it('sanitizes malicious HTML in template', () => {
    const maliciousTemplate = '<div onmouseover="alert(1)">Text</div><iframe src="evil.com"></iframe>';
    const result = renderContractTemplate(maliciousTemplate, data);
    expect(result.html).not.toContain('onmouseover');
    expect(result.html).not.toContain('<iframe');
    expect(result.html).toContain('Text');
  });
  
  it('is deterministic', () => {
    const html = '{{patient.name}} - {{clinic.name}}';
    const res1 = renderContractTemplate(html, data);
    const res2 = renderContractTemplate(html, data);
    expect(res1.html).toEqual(res2.html);
  });

  it('preserves zero, false and unicode values', () => {
    const result = renderContractTemplate(
      '{{treatments.total_sessions}} | {{payment.installments}} | {{patient.name}}',
      { treatments: { total_sessions: 0 }, payment: { installments: 0 }, patient: { name: 'João — 東京' } }
    );
    expect(result.html).toBe('0 | 0 | João — 東京');
  });

  it('removes dangerous links and attributes', () => {
    const result = renderContractTemplate(
      '<a href="javascript:alert(1)" target="_blank">abrir</a><p style="background:url(evil)" onclick="alert(1)">ok</p>',
      {}
    );
    expect(result.html).not.toContain('javascript:');
    expect(result.html).not.toContain('onclick');
    expect(result.html).not.toContain('style=');
    expect(result.html).toContain('abrir');
  });
});
