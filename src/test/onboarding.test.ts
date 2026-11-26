import { describe, expect, it } from 'vitest';
import { onboardingItems, onboardingProgress, type OnboardingFacts } from '@/lib/setup/onboarding';

const empty: OnboardingFacts = {
  hasClinicData: false, hasBrand: false, hasHours: false, treatments: 0,
  hasContract: false, whatsappConnected: false,
};

describe('primeiros passos da clínica', () => {
  it('clínica nova: nada feito, o próximo passo é preencher os dados', () => {
    const p = onboardingProgress(onboardingItems(empty));
    expect(p.done).toBe(0);
    expect(p.total).toBe(5); // só a configuração conta; WhatsApp é opcional
    expect(p.next?.id).toBe('clinica');
    expect(p.complete).toBe(false);
  });

  it('segue a ordem: depois dos dados vem a marca, depois os horários', () => {
    expect(onboardingProgress(onboardingItems({ ...empty, hasClinicData: true })).next?.id).toBe('marca');
    expect(onboardingProgress(onboardingItems({ ...empty, hasClinicData: true, hasBrand: true })).next?.id).toBe('horarios');
  });

  it('completo sem o WhatsApp (opcional), que fica como sugestão', () => {
    const all = { ...empty, hasClinicData: true, hasBrand: true, hasHours: true, treatments: 5, hasContract: true };
    const p = onboardingProgress(onboardingItems(all));
    expect(p.complete).toBe(true);
    expect(p.percent).toBe(100);
    expect(p.next?.id).toBe('whatsapp');
  });

  it('clínica configurada que ainda está prospectando (sem cliente nem agenda) está completa', () => {
    const configured = { ...empty, hasClinicData: true, hasBrand: true, hasHours: true, treatments: 5, hasContract: true };
    const p = onboardingProgress(onboardingItems(configured));
    expect(p.complete).toBe(true);
    expect(p.done).toBe(5);
  });

  it('cada passo tem explicação e um destino', () => {
    for (const item of onboardingItems(empty)) {
      expect(item.why.length).toBeGreaterThan(20);
      expect(item.href.startsWith('/clinic')).toBe(true);
    }
  });
});
