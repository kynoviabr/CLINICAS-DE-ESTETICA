
import type { Database } from '@/integrations/supabase/types';

const anamneseBadgeConfig: Record<string, { label: string; cls: string; hint: string }> = {
  valid: {
    label: 'Anamnese válida',
    cls: 'bg-green-100 text-green-700 border-green-200',
    hint: 'Paciente apto para seguir na agenda e nas sessões.',
  },
  expired: {
    label: 'Anamnese vencida',
    cls: 'bg-red-100 text-red-700 border-red-200',
    hint: 'Vale atualizar a ficha antes do próximo atendimento.',
  },
  pending: {
    label: 'Anamnese pendente',
    cls: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    hint: 'Complete ou revise a ficha para fechar o fluxo clínico.',
  },
  none: {
    label: 'Sem anamnese',
    cls: 'bg-muted text-muted-foreground border-border',
    hint: 'Cadastre a primeira anamnese para dar segurança ao atendimento.',
  },
};



type AppointmentRow = Database['public']['Tables']['appointments']['Row'] & { treatments?: { name?: string | null } | null };
type FeedbackRow = Database['public']['Tables']['session_feedback']['Row'] & {
  session_records?: { performed_at?: string | null; treatments?: { name?: string | null } | null } | null;
};

import type { usePatientDetailPage } from './usePatientDetailPage';

/** Números e textos derivados do paciente (resumo do topo da ficha). */
export function buildPatientView(h: ReturnType<typeof usePatientDetailPage>) {
  const {
    id, navigate, appointments, sessions, feedbacks, proposals, contracts,
  } = h;
  const patient = h.patient as NonNullable<typeof h.patient>;
  const initials = patient.full_name.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase();
  const currentAnamneseStatus = patient.current_anamnese_status || 'none';
  const currentAnamneseConfig = anamneseBadgeConfig[currentAnamneseStatus] || anamneseBadgeConfig.none;
  const upcomingAppointments = [...appointments]
    .filter((appointment: AppointmentRow) => new Date(appointment.start_time).getTime() >= Date.now())
    .sort((a: AppointmentRow, b: AppointmentRow) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const nextAppointment = upcomingAppointments[0] || null;
  const lastSession = sessions[0] || null;
  const latestProposal = proposals[0] || null;
  const latestContract = contracts[0] || null;
  const averageFeedback = feedbacks.length
    ? feedbacks.reduce((sum: number, feedback: FeedbackRow) => sum + Number(feedback.rating || 0), 0) / feedbacks.length
    : null;
  const operationalStep = currentAnamneseStatus === 'none'
    ? 'Cadastrar anamnese'
    : currentAnamneseStatus === 'expired'
      ? 'Renovar anamnese'
      : latestContract?.process_status === 'pending_upload'
        ? 'Receber contrato assinado'
        : latestContract?.process_status === 'pending_confirmation'
          ? 'Validar contrato recebido'
          : latestProposal?.status === 'accepted' && !latestContract
            ? 'Gerar contrato'
            : (latestProposal?.status === 'sent' || latestProposal?.status === 'draft')
              ? 'Acompanhar proposta'
              : (!latestProposal && appointments.some((appointment: AppointmentRow) => appointment.status === 'completed'))
                ? 'Criar proposta'
                : nextAppointment
                  ? 'Acompanhar próximo atendimento'
                  : 'Agendar próxima visita';
  const operationalHint = currentAnamneseStatus === 'none'
    ? anamneseBadgeConfig.none.hint
    : currentAnamneseStatus === 'expired'
      ? anamneseBadgeConfig.expired.hint
      : latestContract?.process_status === 'pending_upload'
        ? 'Depois da avaliação e da proposta, este é o ponto principal para seguir com a venda.'
        : latestContract?.process_status === 'pending_confirmation'
          ? 'Confira o documento recebido para ativar o contrato com segurança.'
          : latestProposal?.status === 'accepted' && !latestContract
            ? 'A proposta foi aprovada. Agora o próximo passo é formalizar o contrato.'
            : latestProposal?.status === 'sent'
              ? 'A proposta já foi enviada. Vale acompanhar retorno e objeções do paciente.'
              : latestProposal?.status === 'draft'
                ? 'A proposta ainda está em rascunho. Complete e envie para avançar a conversão.'
                : (!latestProposal && appointments.some((appointment: AppointmentRow) => appointment.status === 'completed'))
                  ? 'A avaliação já aconteceu. O momento agora é transformar esse atendimento em proposta.'
                  : nextAppointment
                    ? 'Há atendimento previsto. Use esse momento para evoluir clínica e comercialmente.'
                    : 'Agende a próxima avaliação ou sessão para manter o paciente ativo.';
  const commercialSummary = latestContract
    ? `${latestContract.contract_number || 'Contrato'}`
    : latestProposal
      ? `${latestProposal.proposal_number || 'Proposta'}`
      : 'Sem proposta';
  const commercialDetail = latestContract
    ? `Status: ${latestContract.process_status}`
    : latestProposal
      ? `Status: ${latestProposal.status} • R$ ${Number(latestProposal.final_amount || 0).toLocaleString('pt-BR')}`
      : 'Depois da avaliação, a proposta passa a aparecer aqui.';
  const openPatientAgenda = () => {
    navigate(`/clinic/appointments?patientId=${id}&appointmentType=session&openNew=1`);
  };

  // Só é chamado depois que a ficha confere que o paciente existe.
  return {
    ...h,
    patient,
    initials, currentAnamneseStatus, currentAnamneseConfig, upcomingAppointments, nextAppointment,
    lastSession, latestProposal, latestContract, averageFeedback, operationalStep, operationalHint,
    commercialSummary, commercialDetail, openPatientAgenda,
  };
}
export type PatientView = ReturnType<typeof buildPatientView>;
