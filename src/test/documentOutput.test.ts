import { describe, expect, it } from 'vitest';
import { isIosBrowser, pdfFileName, printableDocument } from '@/lib/documents/output';
import { buildAnamneseHtml, formatValue } from '@/lib/anamnese/document';
import { brasiliaDateTime, buildSignatureSheet, safeSignatureImage } from '@/lib/documents/signatureSheet';
import { deviceLabel } from '@/lib/documents/device';
import { whatsappAcceptanceStatusText } from '@/lib/signing/whatsappAcceptanceStatus';
import { normalizeVerificationCode, verifyTexts } from '@/lib/documents/verify';

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

describe('assinatura na clínica', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('mostra a assinatura desenhada, quem acompanhou e o meio presencial', () => {
    const html = buildSignatureSheet({
      documentLabel: 'Contrato nº CT-1',
      records: [{ signerName: 'Ana Lima', acceptedAt: '2026-11-22T15:00:00.000Z', method: 'in_person_drawn', verifiedBy: 'in_person_document',
        signatureImage: png, staffName: 'Dra. Paula', verificationCode: 'ABCDE-12345' }],
    });
    expect(html).toContain(`src="${png}"`);
    expect(html).toContain('Dra. Paula (equipe da clínica)');
    expect(html).toContain('assinatura desenhada na tela');
    expect(html).toContain('Documento de identidade conferido pela equipe');
  });

  it('não aceita imagem que não seja PNG em base64', () => {
    expect(safeSignatureImage('javascript:alert(1)')).toBeNull();
    expect(safeSignatureImage('data:image/png;base64,abc" onerror="x')).toBeNull();
    expect(safeSignatureImage(png)).toBe(png);
    const html = buildSignatureSheet({ documentLabel: 'X', records: [{ signerName: 'A', acceptedAt: '2026-11-22T15:00:00.000Z', signatureImage: 'data:image/svg+xml,<svg>' }] });
    expect(html).not.toContain('<img');
  });

  it('aceite pelo QR Code sai como feito na clínica, no celular da cliente', () => {
    const html = buildSignatureSheet({ documentLabel: 'X', records: [{ signerName: 'A', acceptedAt: '2026-11-22T15:00:00.000Z', method: 'in_person_link' }] });
    expect(html).toContain('pelo celular da própria cliente');
  });
});

describe('de acordo pelo WhatsApp', () => {
  it('mostra a resposta exata, o número da mensagem e quem enviou, sem IP nem aparelho', () => {
    const html = buildSignatureSheet({
      documentLabel: 'Proposta P-1',
      records: [{ signerName: 'Ana Lima', acceptedAt: '2026-11-22T15:00:00.000Z', method: 'whatsapp', verifiedBy: 'whatsapp_phone',
        phone: '5511987654321', whatsappReply: 'Sim, de acordo 4821', whatsappMessageId: 'wamid.ABC', staffName: 'Dra. Paula', verificationCode: 'ABCDE-12345' }],
    });
    expect(html).toContain('Resposta &quot;DE ACORDO&quot; pelo WhatsApp');
    expect(html).toContain('Sim, de acordo 4821');
    expect(html).toContain('wamid.ABC');
    expect(html).toContain('Resposta do número de WhatsApp do cadastro');
    expect(html).toContain('não informa endereço de rede');
    expect(html).toContain('Enviado por');
    expect(html).not.toContain('Acompanhado por');
  });

  it('escapa o texto da resposta', () => {
    const html = buildSignatureSheet({ documentLabel: 'X', records: [{ signerName: 'A', acceptedAt: '2026-11-22T15:00:00.000Z', method: 'whatsapp', whatsappReply: '<b>de acordo</b>' }] });
    expect(html).not.toContain('<b>de acordo</b>');
  });

  it('frase da situação do pedido para a equipe', () => {
    const base = { code: '4821', created_at: '2026-11-22T15:00:00.000Z', accepted_at: null, reply_text: null };
    expect(whatsappAcceptanceStatusText({ ...base, status: 'pending' })).toContain('DE ACORDO 4821');
    expect(whatsappAcceptanceStatusText({ ...base, status: 'changed' })).toContain('mudou depois do envio');
    expect(whatsappAcceptanceStatusText({ ...base, status: 'cancelled' })).toBeNull();
    expect(whatsappAcceptanceStatusText(null)).toBeNull();
  });
});

describe('conferência de autenticidade', () => {
  it('a folha traz o endereço de conferência de cada aceite', () => {
    const html = buildSignatureSheet({ documentLabel: 'X', verifyOrigin: 'https://klinova.test',
      records: [{ signerName: 'A', acceptedAt: '2026-11-22T15:00:00.000Z', verificationCode: 'C22D0-E777D' }] });
    expect(html).toContain('https://klinova.test/verificar/C22D0-E777D');
  });

  it('aceita o código com minúsculas, espaços ou sem hífen', () => {
    expect(normalizeVerificationCode('c22d0 e777d')).toBe('C22D0-E777D');
    expect(normalizeVerificationCode('C22D0E777D')).toBe('C22D0-E777D');
    expect(normalizeVerificationCode('C22D0')).toBeNull();
  });

  it('avisa quando o documento mudou ou o SHA-256 do arquivo não confere', () => {
    const base = { found: true as const, verification_code: 'C22D0-E777D', document_kind: 'contract', document_label: 'Contrato nº 1',
      clinic_name: 'Clínica', accepted_at: '2026-11-22T15:00:00.000Z', method: 'whatsapp', signer_initials: 'M. S.', document_hash: 'ab' };
    expect(verifyTexts({ ...base, integrity: 'same', hash_matches: null }).ok).toBe(true);
    expect(verifyTexts({ ...base, integrity: 'same', hash_matches: null }).method).toContain('WhatsApp');
    expect(verifyTexts({ ...base, integrity: 'changed', hash_matches: null }).ok).toBe(false);
    expect(verifyTexts({ ...base, integrity: 'same', hash_matches: false }).hash).toContain('diferente');
    expect(verifyTexts({ found: false, reason: 'not_found' }).title).toBe('Código não encontrado');
  });
});

describe('anamnese em português', () => {
  it('mostra as respostas de escolha em português, nunca o código gravado', () => {
    expect(formatValue('rarely', 'alcohol_frequency')).toBe('Raramente');
    expect(formatValue('good', 'sleep_quality')).toBe('Boa');
    expect(formatValue('none', 'exercise_frequency')).toBe('Sedentário');
    expect(formatValue('combination', 'skin_type')).toBe('Mista');
    expect(formatValue('married', 'marital_status')).toBe('Casado(a)');
    expect(formatValue('2026-11-21', 'signature_date')).toBe('21/11/2026');
    expect(formatValue('Advogada', 'occupation')).toBe('Advogada');
  });

  it('o PDF da anamnese não traz os códigos em inglês', () => {
    const html = buildAnamneseHtml({
      clinic: { name: 'Clínica' }, patientName: 'Ana', number: 'ANM-1', createdAt: '2026-11-21T12:00:00.000Z', source: 'patient_link',
      formData: { habits: { alcohol_frequency: 'rarely', sleep_quality: 'good', exercise_frequency: 'none' }, identification: { marital_status: 'married' } },
    } as unknown as Parameters<typeof buildAnamneseHtml>[0]);
    expect(html).toContain('Raramente');
    expect(html).toContain('Casado(a)');
    expect(html).not.toMatch(/>(rarely|good|none|married)</);
  });
});
