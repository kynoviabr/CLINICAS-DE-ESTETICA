import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock('@/contexts/BrandingContext', () => ({ useBranding: () => ({ clinicName: 'Aura' }) }));

import { LeadSignupStatus } from '@/components/crm/LeadSignupLink';

const lead = {
  id: 'lead-1', full_name: 'Demetrio Paschoa', cpf: '09905734864', patient_id: null,
  signup_completed_at: '2026-11-22T00:23:00Z', signup_flags: ['cpf_duplicate'], signup_phone: null,
};

function renderStatus(onLinked = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <input id="lead-drawer-cpf" aria-label="CPF do lead" />
        <LeadSignupStatus lead={lead} onLinked={onLinked} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onLinked;
}

describe('CPF do lead já usado por uma paciente', () => {
  it('mostra quem é e liga o lead à paciente quando é a mesma pessoa', async () => {
    rpc.mockImplementation(async (fn: string) => fn === 'lead_cpf_matches'
      ? { data: [{ type: 'patient', id: 'pat-1', full_name: 'Demetrio Paschoa', created_at: '2026-11-05T10:00:00Z' }], error: null }
      : { data: { ok: true, patient_id: 'pat-1', patient_name: 'Demetrio Paschoa' }, error: null });
    const onLinked = renderStatus();

    expect(await screen.findByText('Este CPF já está em outro cadastro. É a mesma pessoa?')).toBeInTheDocument();
    expect(screen.getByText(/desde 05\/11\/2026/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /É a mesma pessoa: ligar à paciente/ }));
    await waitFor(() => expect(onLinked).toHaveBeenCalledWith('pat-1'));
    expect(rpc).toHaveBeenCalledWith('lead_link_to_patient', { p_lead_id: 'lead-1', p_patient_id: 'pat-1' });
  });

  it('"Não é a mesma pessoa" leva ao campo de CPF para corrigir', async () => {
    rpc.mockResolvedValue({ data: [{ type: 'patient', id: 'pat-1', full_name: 'Outra', created_at: '2026-11-05T10:00:00Z' }], error: null });
    renderStatus();
    fireEvent.click(await screen.findByRole('button', { name: 'Não é a mesma pessoa' }));
    expect(screen.getByText(/Corrija o CPF em Dados Gerais/)).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText('CPF do lead'));
  });

  it('sem cadastro repetido de verdade (CPF já corrigido), não mostra a decisão', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderStatus();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByText(/É a mesma pessoa\?/)).not.toBeInTheDocument();
    expect(screen.getByText(/Cadastro feito pelo lead/)).toBeInTheDocument();
  });
});
