import { describe, expect, it } from 'vitest';
import { conversationTitle, displayPhone, isWindowOpen, messageText, renderTemplate, windowLeftLabel } from '@/lib/whatsapp/inbox';

describe('whatsapp inbox', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  it('24h window', () => {
    expect(isWindowOpen('2026-11-06T00:00:00Z', now)).toBe(true);
    expect(isWindowOpen('2026-11-05T11:00:00Z', now)).toBe(false);
    expect(isWindowOpen(null, now)).toBe(false);
    expect(windowLeftLabel('2026-11-06T07:00:00Z', now)).toBe('Responda em até 19h');
    expect(windowLeftLabel('2026-11-05T12:30:00Z', now)).toBe('Responda em até 30 min');
  });
  it('phone display', () => {
    expect(displayPhone('5511950210668')).toBe('(11) 95021-0668');
    expect(displayPhone('551150210668')).toBe('(11) 5021-0668');
    expect(displayPhone('12029087457')).toBe('+12029087457');
  });
  it('title priority', () => {
    expect(conversationTitle({ contact_name: 'Wpp', contact_phone: '5511950210668', leads: { full_name: 'Lead' }, patients: { full_name: 'Maria' } })).toBe('Maria');
    expect(conversationTitle({ contact_name: null, contact_phone: '5511950210668', leads: null, patients: null })).toBe('(11) 95021-0668');
  });
  it('template and attachments', () => {
    expect(renderTemplate('Olá {{1}}, sua sessão é {{2}}', ['Ana', 'amanhã'])).toBe('Olá Ana, sua sessão é amanhã');
    expect(renderTemplate('Olá {{1}}', [])).toBe('Olá {{1}}');
    expect(messageText({ body: null, attachments: [{ type: 'audio' }] })).toBe('🎤 Áudio');
  });
});
