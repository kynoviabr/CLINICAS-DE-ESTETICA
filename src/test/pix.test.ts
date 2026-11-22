import { describe, expect, it } from 'vitest';
import { crc16, normalizePixKey, pixCopyPaste, pixText } from '@/lib/finance/pix';

describe('Pix copia e cola', () => {
  it('CRC16 igual ao exemplo do manual do Banco Central', () => {
    const body = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
    expect(crc16(body)).toBe('1D3D');
  });

  it('monta chave, valor, nome, cidade e identificador', () => {
    const code = pixCopyPaste({ key: '+5513991234567', name: 'Clínica Aura Estética Avançada', city: 'Guarujá', amount: 50, txid: 'SINAL-ABC123' });
    expect(code.startsWith('000201')).toBe(true);
    expect(code).toContain('0014br.gov.bcb.pix0114+5513991234567');
    expect(code).toContain('540550.00');
    expect(code).toContain('5925CLINICA AURA ESTETICA AV'); // 25 caracteres, sem acento
    expect(code).toContain('6007GUARUJA');
    expect(code).toContain('0511SINALABC123');
    expect(code.slice(-8, -4)).toBe('6304');
    expect(crc16(code.slice(0, -4))).toBe(code.slice(-4));
  });

  it('normaliza a chave conforme o tipo', () => {
    expect(normalizePixKey('phone', '(13) 99123-4567')).toBe('+5513991234567');
    expect(normalizePixKey('phone', '123')).toBeNull();
    expect(normalizePixKey('cpf_cnpj', '529.982.247-25')).toBe('52998224725');
    expect(normalizePixKey('cpf_cnpj', '111.111.111-11')).toBeNull();
    expect(normalizePixKey('cpf_cnpj', '12.345.678/0001-90')).toBe('12345678000190');
    expect(normalizePixKey('email', ' Fin@Clinica.com ')).toBe('fin@clinica.com');
    expect(normalizePixKey('random', '123e4567-e12b-12d1-a456-426655440000')).toBe('123e4567-e12b-12d1-a456-426655440000');
    expect(normalizePixKey('random', 'xyz')).toBeNull();
  });

  it('texto sem acentos e no tamanho certo', () => {
    expect(pixText('São Paulo', 15)).toBe('SAO PAULO');
    expect(pixText('Florianópolis do Sul', 15)).toBe('FLORIANOPOLIS D');
  });
});
