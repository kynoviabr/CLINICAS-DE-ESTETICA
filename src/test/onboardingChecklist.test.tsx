import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { onboardingItems, onboardingProgress } from '@/lib/setup/onboarding';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const upsert = vi.fn(async () => undefined);
vi.mock('@/lib/setup/clinicSetup', () => ({ upsertClinicSetting: (...a: unknown[]) => upsert(...(a as [])) }));

let status: unknown;
vi.mock('@/hooks/useOnboardingStatus', () => ({ useOnboardingStatus: () => ({ data: status }) }));

import { OnboardingChecklist } from '@/components/home/OnboardingChecklist';

function Where() { return <p>em {useLocation().pathname}{useLocation().search}</p>; }

function renderCard() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/clinic']}>
        <Routes>
          <Route path="/clinic" element={<OnboardingChecklist clinicId="c1" />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const facts = { hasClinicData: true, hasBrand: false, hasHours: false, treatments: 0, hasContract: true, whatsappConnected: false, patients: 0, appointments: 0 };

describe('cartão "Primeiros passos" no Meu dia', () => {
  it('mostra o progresso e leva ao próximo passo', () => {
    const items = onboardingItems(facts);
    status = { items, ...onboardingProgress(items), hidden: false };
    renderCard();
    expect(screen.getByText('2 de 5 prontos. Faça um de cada vez: cada um leva poucos minutos.')).toBeInTheDocument();
    expect(screen.getByText('Próximo passo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Escolher marca/ }));
    expect(screen.getByText('em /clinic/implantacao?passo=marca')).toBeInTheDocument();
  });

  it('some quando tudo está pronto ou quando foi ocultado', () => {
    const done = onboardingItems({ ...facts, hasBrand: true, hasHours: true, treatments: 3, patients: 1, appointments: 1 });
    status = { items: done, ...onboardingProgress(done), hidden: false };
    renderCard();
    expect(screen.queryByText('Primeiros passos da sua clínica')).not.toBeInTheDocument();

    const items = onboardingItems(facts);
    status = { items, ...onboardingProgress(items), hidden: true };
    renderCard();
    expect(screen.queryByText('Primeiros passos da sua clínica')).not.toBeInTheDocument();
  });

  it('"Ocultar" guarda a escolha da clínica', () => {
    const items = onboardingItems(facts);
    status = { items, ...onboardingProgress(items), hidden: false };
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar primeiros passos' }));
    expect(upsert).toHaveBeenCalledWith('c1', 'onboarding_hidden_at', expect.any(String));
  });
});
