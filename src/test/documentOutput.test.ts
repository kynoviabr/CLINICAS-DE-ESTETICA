import { describe, expect, it } from 'vitest';
import { isIosBrowser, pdfFileName, printableDocument } from '@/lib/documents/output';
import { buildAnamneseHtml } from '@/lib/anamnese/document';
import { brasiliaDateTime, buildSignatureSheet } from '@/lib/documents/signatureSheet';
import { deviceLabel } from '@/lib/documents/device';

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

  it('aparelho em português', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'))
      .toBe('iPhone · iOS 18.1 · Safari');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'))
      .toBe('SM-S918B · Android 14 · Chrome');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 13; K) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 WhatsApp/2.24'))
      .toBe('Celular Android · Android 13 · navegador do WhatsApp');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0'))
      .toBe('Computador · Windows · Edge');
    expect(deviceLabel(null)).toBe('Não informado');
  });

  it('hora de Brasília com segundos', () => {
    expect(brasiliaDateTime('2026-11-22T17:54:13.000Z')).toBe('22/11/2026 às 14:54:13');
  });

  it('folha de assinatura: dados do aceite, código e texto legal; nada injetado', () => {
    const html = buildSignatureSheet({
      documentLabel: 'Contrato nº CT-1',
      documentHash: 'abc123',
      records: [{ signerName: 'Ana <b>', acceptedAt: '2026-11-22T17:54:13.000Z', method: 'link', verifiedBy: 'birth_date', ip: '200.1.2.3',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1', verificationCode: 'C50E6-3A628' }],
    });
    expect(html).toContain('Folha de assinatura');
    expect(html).toContain('page-break-before:always');
    expect(html).toContain('Ana &lt;b&gt;');
    expect(html).toContain('Data de nascimento conferida');
    expect(html).toContain('Link pessoal enviado pela clínica');
    expect(html).toContain('22/11/2026 às 14:54:13 (horário de Brasília)');
    expect(html).toContain('200.1.2.3');
    expect(html).toContain('iPhone · iOS 18.1');
    expect(html).toContain('C50E6-3A628');
    expect(html).toContain('abc123');
    expect(html).toContain('Lei 14.063/2020');
  });

  it('sem aceite mostra a pendência e não o texto legal', () => {
    const html = buildSignatureSheet({ documentLabel: 'Proposta nº 1', records: [], pendingText: 'Aguardando aceite da cliente' });
    expect(html).toContain('Aguardando aceite da cliente');
    expect(html).not.toContain('Lei 14.063');
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
    expect(html).toContain('Folha de assinatura');
    expect(html).toContain('200.1.2.3');
    expect(html).toContain('Assinado eletronicamente');
  });

  it('com o registro único mostra identidade conferida, código de verificação e integridade', () => {
    const html = buildAnamneseHtml({
      ...base,
      formData: { consent: { agrees_terms: true, signature_name: 'Ana Lima' } },
      acceptances: {
        documentHash: 'abc123',
        records: [{ signerName: 'Ana Lima', acceptedAt: '2026-11-20T12:00:00.000Z', method: 'link', verifiedBy: 'birth_date', phone: '11999990000', verificationCode: 'C0DE1-23456' }],
      },
    });
    expect(html).toContain('C0DE1-23456');
    expect(html).toContain('Data de nascimento conferida');
    expect(html).toContain('11999990000');
    expect(html).toContain('abc123');
    expect(html).toContain('verdadeiras');
  });

  it('sem respostas avisa no documento', () => {
    expect(buildAnamneseHtml({ ...base, formData: null })).toContain('Nenhuma resposta digital');
  });
});
