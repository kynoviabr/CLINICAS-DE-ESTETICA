import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, User, Phone, Mail, Calendar, ClipboardList, Activity, Camera,
  MessageSquare, Star, ExternalLink, Loader2, AlertTriangle, FileSignature
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

import PatientAnamneseTab from '@/components/anamnese/PatientAnamneseTab';
import { FileText as FileTextIcon } from 'lucide-react';
import { ContractStatusBadge } from '@/components/contracts/ContractStatusBadge';
import type { Database } from '@/integrations/supabase/types';

const typeLabels: Record<string, string> = { before: 'Antes', during: 'Durante', after: 'Depois', progress: 'Progresso' };
const typeColors: Record<string, string> = { before: 'bg-blue-100 text-blue-700', during: 'bg-yellow-100 text-yellow-700', after: 'bg-green-100 text-green-700', progress: 'bg-purple-100 text-purple-700' };
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

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clinicId } = useUserRole();
  const queryClient = useQueryClient();
  type AppointmentRow = Database['public']['Tables']['appointments']['Row'] & { treatments?: { name?: string | null } | null };
  type SessionRow = Database['public']['Tables']['session_records']['Row'] & { treatments?: { name?: string | null } | null };
  type PhotoRow = Database['public']['Tables']['patient_photos']['Row'];
  type MetricRow = Database['public']['Tables']['patient_metrics']['Row'];
  type FeedbackRow = Database['public']['Tables']['session_feedback']['Row'] & {
    session_records?: { performed_at?: string | null; treatments?: { name?: string | null } | null } | null;
  };
  type ProposalRow = Pick<Database['public']['Tables']['proposals']['Row'], 'id' | 'proposal_number' | 'status' | 'final_amount' | 'created_at' | 'valid_until'>;
  type ContractRow = Database['public']['Tables']['contracts']['Row'] & {
    proposals?: { proposal_number?: string | null; final_amount?: number | null } | null;
  };
  const [viewPhoto, setViewPhoto] = useState<PhotoRow | null>(null);
  const [grantingAccess, setGrantingAccess] = useState(false);

  const { data: patient, isLoading } = useQuery({
    queryKey: ['patient', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('patients').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['patient-appointments', id],
    queryFn: async () => {
      const { data } = await supabase.from('appointments').select('*, treatments(name)')
        .eq('patient_id', id!).order('start_time', { ascending: false }).limit(10);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['patient-sessions', id],
    queryFn: async () => {
      const { data } = await supabase.from('session_records').select('*, treatments(name)')
        .eq('patient_id', id!).order('performed_at', { ascending: false }).limit(20);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: photos = [] } = useQuery({
    queryKey: ['patient-photos', id],
    queryFn: async () => {
      const { data } = await supabase.from('patient_photos').select('*')
        .eq('patient_id', id!).order('taken_at', { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: metrics = [] } = useQuery({
    queryKey: ['patient-metrics', id],
    queryFn: async () => {
      const { data } = await supabase.from('patient_metrics').select('*')
        .eq('patient_id', id!).order('recorded_at', { ascending: true });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: feedbacks = [] } = useQuery({
    queryKey: ['patient-feedbacks', id],
    queryFn: async () => {
      const { data } = await supabase.from('session_feedback').select('*, session_records(performed_at, treatments(name))')
        .eq('patient_id', id!).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: proposals = [] } = useQuery({
    queryKey: ['patient-proposals', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('proposals')
        .select('id, proposal_number, status, final_amount, created_at, valid_until')
        .eq('patient_id', id!)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['patient-contracts', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('contracts')
        .select('id, contract_number, process_status, status, created_at, signed_pdf_url, proposals(proposal_number, final_amount)')
        .eq('patient_id', id!)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: portalAccess } = useQuery({
    queryKey: ['patient-portal-access', id],
    queryFn: async () => {
      const { data } = await supabase.from('patient_portal_access').select('*')
        .eq('patient_id', id!).limit(1).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const handleGrantPortalAccess = async () => {
    if (!patient?.email || !clinicId || !id) {
      toast.error('Paciente precisa ter um e-mail cadastrado');
      return;
    }
    setGrantingAccess(true);
    try {
      const { data, error } = await supabase.functions.invoke('invite-patient', {
        body: { patientId: id, clinicId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || 'Acesso ao portal concedido!');
      queryClient.invalidateQueries({ queryKey: ['patient-portal-access', id] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao conceder acesso';
      toast.error(message);
    } finally {
      setGrantingAccess(false);
    }
  };

  // Group metrics by type for evolution chart
  const metricTypes = [...new Set(metrics.map((m: MetricRow) => m.metric_type))];
  const metricLabels: Record<string, string> = {
    weight: 'Peso', waist: 'Cintura', hip: 'Quadril', arm: 'Braço',
    thigh: 'Coxa', abdomen: 'Abdômen',
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-16">
        <h3 className="text-lg font-semibold">Paciente não encontrado</h3>
        <BrandButton variant="outline" onClick={() => navigate('/clinic/patients')} className="mt-4">Voltar</BrandButton>
      </div>
    );
  }

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

  return (
    <div>
      <PageHeader title={patient.full_name} description="Detalhes do paciente">
        <BrandButton variant="outline" onClick={() => navigate('/clinic/patients')}>
          <ArrowLeft className="w-4 h-4" /> Voltar
        </BrandButton>
      </PageHeader>

      {/* Header card */}
      <Card className="shadow-card mb-6 animate-fade-in">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-xl shrink-0">
              {initials}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-foreground">{patient.full_name}</h2>
                <BrandBadge status={patient.status as BadgeStatus} />
                <Badge variant="outline" className={currentAnamneseConfig.cls}>
                  <FileTextIcon className="w-3 h-3 mr-1" />
                  {currentAnamneseConfig.label}
                </Badge>
                {latestProposal && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    <FileTextIcon className="w-3 h-3 mr-1" />
                    Proposta {latestProposal.proposal_number}
                  </Badge>
                )}
                {latestContract && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    <FileSignature className="w-3 h-3 mr-1" />
                    Contrato {latestContract.contract_number}
                  </Badge>
                )}
                {portalAccess ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <ExternalLink className="w-3 h-3 mr-1" />Portal ativo
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={handleGrantPortalAccess} disabled={grantingAccess || !patient.email}>
                    {grantingAccess ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ExternalLink className="w-3 h-3 mr-1" />}
                    Conceder acesso ao portal
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {patient.email && <span className="flex items-center gap-1"><Mail className="w-4 h-4" />{patient.email}</span>}
                {patient.phone && <span className="flex items-center gap-1"><Phone className="w-4 h-4" />{patient.phone}</span>}
                {patient.date_of_birth && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{new Date(patient.date_of_birth).toLocaleDateString('pt-BR')}</span>}
              </div>
              {patient.cpf && <p className="text-sm text-muted-foreground">CPF: {patient.cpf}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 mb-6 lg:grid-cols-5">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Próximo passo</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{operationalStep}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{operationalHint}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Agenda</p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {nextAppointment
                ? format(new Date(nextAppointment.start_time), "dd 'de' MMM, HH:mm", { locale: ptBR })
                : 'Sem atendimento futuro'}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {nextAppointment
                ? `${nextAppointment.treatments?.name || 'Tratamento'} • ${nextAppointment.status || 'agendado'}`
                : 'Agende a próxima avaliação ou sessão para manter o paciente ativo.'}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Última sessão</p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {lastSession
                ? format(new Date(lastSession.performed_at), "dd 'de' MMM", { locale: ptBR })
                : 'Nenhuma sessão registrada'}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {lastSession
                ? `${lastSession.treatments?.name || 'Tratamento'} • Sessão ${lastSession.session_number || '—'}`
                : 'Quando a execução começar, o histórico de sessões aparece aqui.'}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Comercial</p>
            <p className="mt-2 text-sm font-semibold text-foreground">{commercialSummary}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{commercialDetail}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Satisfação</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {averageFeedback ? `${averageFeedback.toFixed(1)} / 5` : 'Sem feedback'}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {feedbacks.length
                ? `${feedbacks.length} feedback${feedbacks.length > 1 ? 's' : ''} registrado${feedbacks.length > 1 ? 's' : ''}.`
                : 'Os próximos retornos do paciente ajudam a medir satisfação e risco.'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dissatisfaction Alert */}
      {patient.dissatisfaction_flag && (
        <Card className="mb-6 border-destructive bg-destructive/5 animate-fade-in">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-destructive text-sm">Paciente insatisfeito — Nível: {patient.dissatisfaction_level || 'N/A'}</p>
              {patient.dissatisfaction_reason && (
                <p className="text-xs text-muted-foreground mt-0.5">{patient.dissatisfaction_reason}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="data" className="animate-fade-in">
        <TabsList className="w-full flex overflow-x-auto gap-1 mb-6">
          <TabsTrigger value="data" className="flex items-center gap-1"><User className="w-3.5 h-3.5" />Dados</TabsTrigger>
          <TabsTrigger value="anamnese" className="flex items-center gap-1"><FileTextIcon className="w-3.5 h-3.5" />Anamnese</TabsTrigger>
          <TabsTrigger value="appointments" className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Agenda</TabsTrigger>
          <TabsTrigger value="proposals" className="flex items-center gap-1"><FileTextIcon className="w-3.5 h-3.5" />Propostas</TabsTrigger>
          <TabsTrigger value="contracts" className="flex items-center gap-1"><FileSignature className="w-3.5 h-3.5" />Contratos</TabsTrigger>
          <TabsTrigger value="sessions" className="flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" />Sessões</TabsTrigger>
          <TabsTrigger value="evolution" className="flex items-center gap-1"><Activity className="w-3.5 h-3.5" />Evolução</TabsTrigger>
          <TabsTrigger value="photos" className="flex items-center gap-1"><Camera className="w-3.5 h-3.5" />Fotos</TabsTrigger>
          <TabsTrigger value="feedback" className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" />Feedback</TabsTrigger>
        </TabsList>

        {/* Data tab */}
        <TabsContent value="data">
          <Card className="shadow-card">
            <CardHeader><CardTitle>Informações Pessoais</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {[
                  ['Nome', patient.full_name],
                  ['E-mail', patient.email],
                  ['Telefone', patient.phone],
                  ['CPF', patient.cpf],
                  ['Nascimento', patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('pt-BR') : null],
                  ['Gênero', patient.gender === 'female' ? 'Feminino' : patient.gender === 'male' ? 'Masculino' : patient.gender],
                  ['Endereço', patient.address],
                  ['Cidade/UF', [patient.city, patient.state].filter(Boolean).join(' / ') || null],
                ].map(([label, value], i) => (
                  <div key={i}>
                    <dt className="text-muted-foreground text-xs uppercase tracking-wider">{label}</dt>
                    <dd className="font-medium text-foreground mt-0.5">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
              {patient.notes && (
                <div className="mt-4 pt-4 border-t">
                  <dt className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Observações</dt>
                  <dd className="text-sm text-foreground whitespace-pre-wrap">{patient.notes}</dd>
                </div>
              )}
              
            </CardContent>
          </Card>
        </TabsContent>

        {/* Anamnese tab */}
        <TabsContent value="anamnese">
          {clinicId && id && (
            <PatientAnamneseTab
              patientId={id}
              clinicId={clinicId}
              patientAnamneseStatus={patient.current_anamnese_status}
            />
          )}
        </TabsContent>

        {/* Appointments tab */}
        <TabsContent value="appointments">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Agendamentos</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Avaliações e sessões previstas para este paciente.
                  </p>
                </div>
                <BrandButton variant="outline" onClick={() => navigate('/clinic/appointments')}>
                  Ir para agenda
                </BrandButton>
              </div>
            </CardHeader>
            <CardContent>
              {appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum agendamento encontrado</p>
              ) : (
                <div className="space-y-3">
                  {appointments.map((a: AppointmentRow) => (
                    <div key={a.id} className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{a.treatments?.name || 'Tratamento'}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.start_time).toLocaleDateString('pt-BR')} às {new Date(a.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 self-start md:self-center">
                        <BrandBadge status={a.status as BadgeStatus} />
                        {['confirmed', 'in_progress'].includes(a.status) && (
                          <BrandButton
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/clinic/sessions?appointmentId=${a.id}`)}
                          >
                            Ir para sessão
                          </BrandButton>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Proposals tab */}
        <TabsContent value="proposals">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Propostas do paciente</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Veja rapidamente as propostas comerciais ligadas a este paciente.
                  </p>
                </div>
                <BrandButton variant="outline" onClick={() => navigate('/clinic/proposals')}>
                  Abrir módulo de propostas
                </BrandButton>
              </div>
            </CardHeader>
            <CardContent>
              {proposals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma proposta encontrada</p>
              ) : (
                <div className="space-y-3">
                  {proposals.map((proposal: ProposalRow) => (
                    <div key={proposal.id} className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                            onClick={() => navigate(`/clinic/proposals?proposalId=${proposal.id}&view=1`)}
                          >
                            {proposal.proposal_number || 'Proposta sem número'}
                          </button>
                          <BrandBadge status={proposal.status === 'accepted' ? 'approved' : proposal.status === 'rejected' ? 'rejected' : proposal.status === 'draft' ? 'draft' : 'sent'}>
                            {proposal.status}
                          </BrandBadge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Valor final: R$ {Number(proposal.final_amount || 0).toLocaleString('pt-BR')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Criada em {format(new Date(proposal.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                          {proposal.valid_until ? ` • válida até ${format(new Date(`${proposal.valid_until}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contracts tab */}
        <TabsContent value="contracts">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Contratos do paciente</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Acesse rapidamente os contratos vinculados a este paciente.
                  </p>
                </div>
                <BrandButton variant="outline" onClick={() => navigate('/clinic/contracts')}>
                  Abrir módulo de contratos
                </BrandButton>
              </div>
            </CardHeader>
            <CardContent>
              {contracts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum contrato encontrado</p>
              ) : (
                <div className="space-y-3">
                  {contracts.map((contract: ContractRow) => (
                    <div key={contract.id} className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                            onClick={() => navigate(`/clinic/contracts?contractId=${contract.id}&view=1`)}
                          >
                            {contract.contract_number || 'Contrato sem número'}
                          </button>
                          <ContractStatusBadge status={contract.process_status} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {contract.proposals?.proposal_number
                            ? `Proposta ${contract.proposals.proposal_number}`
                            : 'Sem proposta vinculada'}
                          {contract.proposals?.final_amount
                            ? ` • R$ ${Number(contract.proposals.final_amount).toLocaleString('pt-BR')}`
                            : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Criado em {format(new Date(contract.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 self-start md:self-center">
                        {contract.signed_pdf_url && (
                          <BrandButton
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(contract.signed_pdf_url, '_blank', 'noopener,noreferrer')}
                          >
                            Ver PDF
                          </BrandButton>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sessions tab */}
        <TabsContent value="sessions">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Sessões Realizadas</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Histórico de execução do tratamento e últimas observações clínicas.
                  </p>
                </div>
                <BrandButton variant="outline" onClick={() => navigate('/clinic/sessions')}>
                  Abrir módulo de sessões
                </BrandButton>
              </div>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma sessão registrada</p>
              ) : (
                <div className="space-y-3">
                  {sessions.map((s: SessionRow) => (
                    <div key={s.id} className="p-3 rounded-lg bg-secondary/50">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-foreground">
                          Sessão {s.session_number}/{s.total_sessions} — {s.treatments?.name || 'Tratamento'}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {new Date(s.performed_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
                      {s.observations && <p className="text-xs text-muted-foreground mt-1">{s.observations}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Evolution tab */}
        <TabsContent value="evolution">
          {metricTypes.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-12 text-center">
                <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma medição registrada</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {metricTypes.map(type => {
                const typeMetrics = metrics.filter((m: MetricRow) => m.metric_type === type);
                const chartData = typeMetrics.map((m: MetricRow) => ({
                  date: format(new Date(m.recorded_at), 'dd/MM', { locale: ptBR }),
                  value: Number(m.value),
                }));
                const unit = typeMetrics[0]?.unit || '';
                const first = Number(typeMetrics[0]?.value);
                const last = Number(typeMetrics[typeMetrics.length - 1]?.value);
                const diff = last - first;

                return (
                  <Card key={type} className="shadow-card">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{metricLabels[type] || type}</CardTitle>
                        <div className="text-right">
                          <p className="text-lg font-bold text-foreground">{last} {unit}</p>
                          {typeMetrics.length > 1 && (
                            <p className={`text-xs font-medium ${diff < 0 ? 'text-green-600' : diff > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(1)} {unit}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                          <YAxis className="text-xs fill-muted-foreground" />
                          <Tooltip />
                          <Line type="monotone" dataKey="value" className="stroke-primary" strokeWidth={2} dot={{ r: 3, className: 'fill-primary' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Photos tab */}
        <TabsContent value="photos">
          {photos.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-12 text-center">
                <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma foto registrada</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map((p: PhotoRow) => (
                <Card key={p.id} className="shadow-card overflow-hidden cursor-pointer hover:shadow-card-hover transition-all" onClick={() => setViewPhoto(p)}>
                  <div className="relative aspect-square">
                    <img src={p.photo_url} alt={p.description || ''} className="w-full h-full object-cover" />
                    <Badge className={`absolute top-2 left-2 text-xs ${typeColors[p.photo_type]}`}>{typeLabels[p.photo_type]}</Badge>
                  </div>
                  <CardContent className="p-2">
                    <p className="text-xs text-muted-foreground">{format(new Date(p.taken_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
                    {p.description && <p className="text-xs text-foreground truncate">{p.description}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Feedback tab */}
        <TabsContent value="feedback">
          {feedbacks.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-12 text-center">
                <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum feedback registrado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {feedbacks.map((fb: FeedbackRow) => (
                <Card key={fb.id} className="shadow-card">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} className={`w-4 h-4 ${s <= fb.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{format(new Date(fb.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {fb.session_records?.treatments?.name || 'Sessão'} — {fb.session_records?.performed_at ? format(new Date(fb.session_records.performed_at), 'dd/MM', { locale: ptBR }) : ''}
                    </p>
                    {fb.comment && <p className="text-sm text-foreground">{fb.comment}</p>}
                    {fb.response && (
                      <div className="mt-2 p-2 rounded-lg bg-secondary/50">
                        <p className="text-xs font-medium text-muted-foreground">Resposta:</p>
                        <p className="text-sm text-foreground">{fb.response}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Photo lightbox */}
      <Dialog open={!!viewPhoto} onOpenChange={() => setViewPhoto(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{viewPhoto?.description || 'Foto'}</DialogTitle></DialogHeader>
          {viewPhoto && (
            <>
              <img src={viewPhoto.photo_url} alt="" className="w-full rounded-xl" />
              <div className="flex items-center gap-2 mt-2">
                <Badge className={typeColors[viewPhoto.photo_type]}>{typeLabels[viewPhoto.photo_type]}</Badge>
                <span className="text-sm text-muted-foreground">{format(new Date(viewPhoto.taken_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
