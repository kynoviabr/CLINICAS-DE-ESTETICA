import { describe, expect, it } from 'vitest';
import { isIosBrowser, pdfFileName, printableDocument } from '@/lib/documents/output';
import { buildAnamneseHtml } from '@/lib/anamnese/document';
import { signatureNoteHtml } from '@/lib/documents/signatureNote';

describe('saída de documentos', () => {
  it('nome de arquivo seguro', () => {
    expect(pdfFileName('Contrato CT/2026 Ação')).toBe('Contrato-CT-2026-Acao.pdf');
    expect(pdfFileName('Recibo-RS-2026-0001.pdf')).toBe('Recibo-RS-2026-0001.pdf');
    expect(pdfFileName('***')).toBe('documento.pdf');
  });

  it('reconhece iPhone e iPad (inclusive iPad que se diz Mac)', () => {
    expect(isIosBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 })).toBe(true);
    expect(isIosBrowser({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIosBrowser({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
  });

  it('página de impressão em A4 com número de página e título escapado', () => {
    const doc = printableDocument('<p>Oi</p>', 'Contrato <x>');
    expect(doc).toContain('size:A4');
    expect(doc).toContain('counter(page)');
    expect(doc).toContain('Contrato &lt;x&gt;');
    expect(doc).toContain('<p>Oi</p>');
  });

  it('quadro de assinatura escapa o nome e mostra o código', () => {
    const html = signatureNoteHtml({ signerName: 'Ana <b>', signedAt: '2026-11-22T15:00:00.000Z', documentHash: 'abc123' });
    expect(html).toContain('Ana &lt;b&gt;');
    expect(html).toContain('abc123');
    expect(signatureNoteHtml(null)).toBe('');
  });
});

describe('anamnese em PDF', () => {
  const base = {
    clinic: { name: 'Aura' }, patientName: 'Ana Lima', number: 'AN-0001', createdAt: '2026-11-20T12:00:00.000Z',
    filledAt: '2026-11-20T12:00:00.000Z', expiresAt: '2027-05-20T12:00:00.000Z', source: 'patient_link',
  };

  it('traz cliente, respostas, destaque de risco, assinatura e registro do envio', () => {
    const html = buildAnamneseHtml({
      ...base,
      formData: {
        health_history: { is_pregnant: true, additional_info: 'Nada <script>' },
        consent: { agrees_terms: true, signature_name: 'Ana Lima' },
        submission: { filled_by: 'patient', via: 'link', at: '2026-11-20T12:00:00.000Z', ip: '200.1.2.3', user_agent: 'iPhone Safari' },
      },
    });
    expect(html).toContain('Ana Lima');
    expect(html).toContain('Gestante');
    expect(html).toContain('#fffbeb');
    expect(html).toContain('Nada &lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Registro do envio');
    expect(html).toContain('200.1.2.3');
    expect(html).toContain('aceita eletronicamente');
  });

  it('sem respostas avisa no documento', () => {
    expect(buildAnamneseHtml({ ...base, formData: null })).toContain('Nenhuma resposta digital');
  });
});
