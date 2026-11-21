import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import AnamnesisFormModal from '@/components/patient/AnamnesisFormModal';
import type { AnamneseTemplate } from '@/lib/anamnese/templates';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/contexts/BrandingContext', () => ({ useBranding: () => ({ clinicId: null }) }));

const peeling: AnamneseTemplate = {
  id: 'tpl-peeling',
  name: 'Anamnese Peelings',
  category_id: 'cat-peeling',
  category_name: 'Peelings',
  active: true,
  basic_questions: [],
  specific_questions: [],
  questions: [
    { text: 'Usa ácidos ou retinoides?', type: 'yes_no' },
    { text: 'Qual seu objetivo principal?', type: 'text' },
  ],
  risk_terms: 'Fui informada dos riscos do peeling.',
  notes: '',
};

function renderForm(onSubmitForm: (data: unknown) => Promise<void>) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AnamnesisFormModal
        variant="page"
        open
        onOpenChange={() => undefined}
        patientId=""
        clinicId=""
        validityDays={180}
        chosen={{ general: false, templates: [peeling] }}
        onSubmitForm={onSubmitForm}
      />
    </QueryClientProvider>,
  );
}

describe('anamnese de tratamento (link da paciente)', () => {
  it('só avança com Sim/Não respondido e envia respostas + ciência de riscos', async () => {
    const onSubmitForm = vi.fn(async () => undefined);
    renderForm(onSubmitForm);

    // Sem a inicial: começa direto nas perguntas do tratamento.
    expect(screen.getByText('Usa ácidos ou retinoides?')).toBeInTheDocument();
    expect(screen.queryByText('Profissão')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Próximo/ }));
    expect(screen.getByText('Usa ácidos ou retinoides?')).toBeInTheDocument(); // não avançou

    fireEvent.click(screen.getByLabelText('Sim'));
    fireEvent.change(screen.getByLabelText('Detalhes: Usa ácidos ou retinoides?'), { target: { value: 'retinol à noite' } });
    fireEvent.change(screen.getByLabelText('Qual seu objetivo principal?'), { target: { value: 'manchas' } });
    fireEvent.click(screen.getByRole('button', { name: /Próximo/ }));

    // Consentimento: ciência de riscos do tratamento + assinatura.
    expect(screen.getByText('Fui informada dos riscos do peeling.')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: /Enviar anamnese/ });
    expect(send).toBeDisabled();

    const boxes = screen.getAllByRole('checkbox');
    boxes.forEach((box) => fireEvent.click(box)); // termos + "Li e concordo"
    fireEvent.change(screen.getByPlaceholderText('Seu nome completo'), { target: { value: 'Joana Silva' } });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);

    await waitFor(() => expect(onSubmitForm).toHaveBeenCalledTimes(1));
    const payload = (onSubmitForm.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('health_history');
    expect(payload.consent).toMatchObject({ agrees_terms: true, signature_name: 'Joana Silva' });
    expect(payload.treatment_anamneses).toEqual([
      {
        template_id: 'tpl-peeling',
        risk_ack: true,
        answers: {
          'Usa ácidos ou retinoides?': { value: true, detail: 'retinol à noite' },
          'Qual seu objetivo principal?': 'manchas',
        },
      },
    ]);
  });
});
