import { describe, expect, it } from 'vitest';
import { anamneseLinkMessage, anamneseLinkUrl } from '@/lib/anamnese/link';

describe('anamnese por link', () => {
  it('monta o endereço e a mensagem do WhatsApp', () => {
    const url = anamneseLinkUrl('https://klinova-homolog.vercel.app/', 'abc123');
    expect(url).toBe('https://klinova-homolog.vercel.app/anamnese/abc123');
    const msg = anamneseLinkMessage('Maria Souza', 'Aura Guarujá', url);
    expect(msg).toMatch(/^Olá, Maria! Aqui é da Aura Guarujá\./);
    expect(msg).toContain(url);
    expect(msg).toContain('data de nascimento');
  });
});
