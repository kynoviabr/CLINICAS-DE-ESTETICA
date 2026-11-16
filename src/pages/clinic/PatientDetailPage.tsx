import PortalAccessButton from '@/components/patient/PortalAccessButton';
import AccessLogList from '@/components/security/AccessLogList';
import LgpdPanel from '@/components/patient/LgpdPanel';
import { logAccess } from '@/lib/accessLog';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, User, Phone, Mail, Calendar, ClipboardList, Activity, Camera,
  MessageSquare, Star, ExternalLink, Loader2, AlertTriangle, FileSignature, Upload, Edit, MessageCircle,
  NotebookPen, Pencil
} from 'lucide-react';
import { format } from 'date-fns';
import { getSignedContractUrl } from '@/lib/storageHelper';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

import PatientAnamneseTab from '@/components/anamnese/PatientAnamneseTab';
import { PatientNotesTab } from '@/components/patient/PatientNotesTab';
import { parsePatientNotes, getLatestPatientNoteText } from '@/lib/patients/notesHistory';
import { FileText as FileTextIcon, Shield } from 'lucide-react';
import { ContractStatusBadge } from '@/components/contracts/ContractStatusBadge';
import PayerSection from '@/components/patient/PayerSection';
import {
  ContractPaymentConfigurator
} from '@/components/contracts/ContractPaymentConfigurator';
import type { Database } from '@/integrations/supabase/types';
import { formatCpf, formatPhone, patientSaveErrorMessage, validatePatientFields } from '@/lib/patients/validation';
import { PatientDuplicateAlert } from '@/components/patient/PatientDuplicateAlert';
import { PatientPhotosTab } from '@/components/photos/PatientPhotosTab';
import ContactWhatsappPanel from '@/components/whatsapp/ContactWhatsappPanel';
import { usePatientDetailPage } from './patient/usePatientDetailPage';

const PATIENT_FILES_BUCKET = 'patient-files';
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
type SessionRow = Database['public']['Tables']['session_records']['Row'] & { treatments?: { name?: string | null } | null };
type MetricRow = Database['public']['Tables']['patient_metrics']['Row'];
type FeedbackRow = Database['public']['Tables']['session_feedback']['Row'] & {
  session_records?: { performed_at?: string | null; treatments?: { name?: string | null } | null } | null;
};
type ProposalRow = Pick<Database['public']['Tables']['proposals']['Row'], 'id' | 'proposal_number' | 'status' | 'final_amount' | 'created_at' | 'valid_until' | 'patient_id'>;

export default function PatientDetailPage() {
  const {
    patientTab,
    setPatientTab,
    lean,
    id,
    navigate,
    clinicId,
    role,
    queryClient,
    uploadingAvatar,
    editOpen,
    setEditOpen,
    editForm,
    setEditForm,
    editErrors,
    setEditErrors,
    checkingDuplicates,
    setCheckingDuplicates,
    duplicates,
    contractDialogProposal,
    paymentCondition,
    setPaymentCondition,
    selectedPaymentMethods,
    paymentDetails,
    setPaymentDetails,
    paymentConfig,
    setPaymentConfig,
    payerData,
    setPayerData,
    avatarDisplayUrl,
    avatarInputRef,
    patient,
    isLoading,
    appointments,
    sessions,
    metrics,
    feedbacks,
    proposals,
    contracts,
    portalAccess,
    handleAvatarUpload,
    openEditPatient,
    updatePatientMutation,
    resetContractDialog,
    openContractDialog,
    togglePaymentMethod,
    generateContractMutation,
    handleEditCepChange,
    metricTypes,
    metricLabels,
  } = usePatientDetailPage();

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
  const openPatientAgenda = () => {
    navigate(`/clinic/appointments?patientId=${id}&appointmentType=session&openNew=1`);
  };

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
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="group relative w-16 h-16 rounded-full overflow-hidden border border-border"
                disabled={uploadingAvatar}
              >
                {avatarDisplayUrl ? (
                  <img src={avatarDisplayUrl} alt={patient.full_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
                    {initials}
                  </div>
                )}
                <span className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </span>
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  void handleAvatarUpload(file);
                  event.currentTarget.value = '';
                }}
              />
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
                {portalAccess && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <ExternalLink className="w-3 h-3 mr-1" />Portal ativo
                  </Badge>
                )}
                <PortalAccessButton patient={patient} active={!!portalAccess} />
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {patient.email && (
                  <a
                    href={`mailto:${patient.email}`}
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    {patient.email}
                  </a>
                )}
                {patient.phone && (
                  <a
                    href={`https://wa.me/55${(patient.phone || '').replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    {patient.phone}
                  </a>
                )}
                {patient.date_of_birth && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{new Date(patient.date_of_birth).toLocaleDateString('pt-BR')}</span>}
              </div>
              {patient.cpf && <p className="text-sm text-muted-foreground">CPF: {patient.cpf}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className={`grid grid-cols-2 gap-2 mb-6 sm:gap-3 ${lean ? 'lg:grid-cols-4' : 'lg:grid-cols-5'}`}>
        <Card className="shadow-card">
          <CardContent className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">Próximo passo</p>
            <p className="mt-1 sm:mt-2 text-sm sm:text-base font-semibold text-foreground">{operationalStep}</p>
            <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">{operationalHint}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">Agenda</p>
            <p className="mt-1 sm:mt-2 text-sm font-semibold text-foreground">
              {nextAppointment
                ? format(new Date(nextAppointment.start_time), "dd 'de' MMM, HH:mm", { locale: ptBR })
                : 'Sem atendimento futuro'}
            </p>
            <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
              {nextAppointment
                ? `${nextAppointment.treatments?.name || 'Tratamento'} • ${nextAppointment.status || 'agendado'}`
                : 'Agende a próxima avaliação ou sessão para manter o paciente ativo.'}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">Última sessão</p>
            <p className="mt-1 sm:mt-2 text-sm font-semibold text-foreground">
              {lastSession
                ? format(new Date(lastSession.performed_at), "dd 'de' MMM", { locale: ptBR })
                : 'Nenhuma sessão registrada'}
            </p>
            <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
              {lastSession
                ? `${lastSession.treatments?.name || 'Tratamento'} • Sessão ${lastSession.session_number || '—'}`
                : 'Quando a execução começar, o histórico de sessões aparece aqui.'}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">Comercial</p>
            <p className="mt-1 sm:mt-2 text-sm font-semibold text-foreground">{commercialSummary}</p>
            <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">{commercialDetail}</p>
          </CardContent>
        </Card>
        {!lean && (
          <Card className="shadow-card">
            <CardContent className="p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">Satisfação</p>
              <p className="mt-1 sm:mt-2 text-sm sm:text-base font-semibold text-foreground">
                {averageFeedback ? `${averageFeedback.toFixed(1)} / 5` : 'Sem feedback'}
              </p>
              <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
                {feedbacks.length
                  ? `${feedbacks.length} feedback${feedbacks.length > 1 ? 's' : ''} registrado${feedbacks.length > 1 ? 's' : ''}.`
                  : 'Os próximos retornos do paciente ajudam a medir satisfação e risco.'}
              </p>
            </CardContent>
          </Card>
        )}
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
      <Tabs value={patientTab} onValueChange={(v) => { setPatientTab(v); if (v === 'anamnese') logAccess(id, 'anamnese_view'); }} className="animate-fade-in">
        <TabsList className="w-full flex overflow-x-auto gap-1 mb-6">
          <TabsTrigger value="data" className="flex items-center gap-1"><User className="w-3.5 h-3.5" />Dados</TabsTrigger>
          <TabsTrigger value="anamnese" className="flex items-center gap-1"><FileTextIcon className="w-3.5 h-3.5" />Anamnese</TabsTrigger>
          <TabsTrigger value="appointments" className="flex items-center gap-1" onClick={openPatientAgenda}><Calendar className="w-3.5 h-3.5" />Agenda</TabsTrigger>
          <TabsTrigger value="proposals" className="flex items-center gap-1"><FileTextIcon className="w-3.5 h-3.5" />Propostas</TabsTrigger>
          <TabsTrigger value="contracts" className="flex items-center gap-1"><FileSignature className="w-3.5 h-3.5" />Contratos</TabsTrigger>
          <TabsTrigger value="sessions" className="flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" />Sessões</TabsTrigger>
          <TabsTrigger value="evolution" className="flex items-center gap-1"><Activity className="w-3.5 h-3.5" />Evolução</TabsTrigger>
          <TabsTrigger value="photos" className="flex items-center gap-1"><Camera className="w-3.5 h-3.5" />Fotos</TabsTrigger>
          <TabsTrigger value="notes" className="flex items-center gap-1"><NotebookPen className="w-3.5 h-3.5" />Notas e Observações</TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />WhatsApp</TabsTrigger>
          {!lean && <TabsTrigger value="feedback" className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" />Feedback</TabsTrigger>}
          {role === 'admin' && <TabsTrigger value="access-log" className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" />Acessos</TabsTrigger>}
        </TabsList>

        {/* Data tab */}
        <TabsContent value="data">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Informações Pessoais</CardTitle>
              <BrandButton size="sm" variant="outline" onClick={openEditPatient}>
                <Edit className="w-4 h-4" />
                Editar dados
              </BrandButton>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {[
                  ['Nome', patient.full_name],
                  ['E-mail', patient.email],
                  ['Telefone', patient.phone],
                  ['CPF', patient.cpf ? formatCpf(patient.cpf) : null],
                  ['Nascimento', patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('pt-BR') : null],
                  ['Gênero', patient.gender === 'female' ? 'Feminino' : patient.gender === 'male' ? 'Masculino' : patient.gender],
                  ['CEP', patient.zip_code],
                  ['Endereço', [patient.address, patient.address_number, patient.address_complement].filter(Boolean).join(', ') || null],
                  ['Cidade/UF', [patient.city, patient.state].filter(Boolean).join(' / ') || null],
                ].map(([label, value], i) => (
                  <div key={i}>
                    <dt className="text-muted-foreground text-xs uppercase tracking-wider">{label}</dt>
                    <dd className="font-medium text-foreground mt-0.5">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
              {patient.notes && (
                <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <dt className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Última observação</dt>
                    <dd className="text-sm text-foreground whitespace-pre-wrap">{getLatestPatientNoteText(patient.notes)}</dd>
                  </div>
                  <BrandButton size="sm" variant="ghost" onClick={() => setPatientTab('notes')} className="self-start sm:self-auto text-primary">
                    <NotebookPen className="w-3.5 h-3.5 mr-1" />
                    Ver histórico ({parsePatientNotes(patient.notes).length})
                  </BrandButton>
                </div>
              )}
              
            </CardContent>
          </Card>
                  <div className="mt-4">
            <LgpdPanel patientId={id!} patientName={patient.full_name} isAdmin={role === 'admin'} anonymized={!!(patient as { anonymized_at?: string | null }).anonymized_at} />
          </div>
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
                <BrandButton variant="outline" onClick={openPatientAgenda}>
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
                <BrandButton variant="outline" onClick={() => navigate(`/clinic/proposals?busca=${encodeURIComponent(patient.cpf || patient.full_name || '')}`)}>
                  Abrir módulo de propostas
                </BrandButton>
              </div>
            </CardHeader>
            <CardContent>
              {proposals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma proposta encontrada</p>
              ) : (
                <div className="space-y-3">
                  {proposals.map((proposal: ProposalRow) => {
                    const linkedContract = contracts.find((contract) => contract.proposal_id === proposal.id);
                    const canGenerateContract = proposal.status === 'accepted' && !linkedContract;

                    return (
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
                            {linkedContract && (
                              <Badge variant="outline" className="bg-white">
                                Contrato {linkedContract.contract_number || 'gerado'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Valor final: R$ {Number(proposal.final_amount || 0).toLocaleString('pt-BR')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Criada em {format(new Date(proposal.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                            {proposal.valid_until ? ` • válida até ${format(new Date(`${proposal.valid_until}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 self-start md:self-center">
                          {proposal.status !== 'accepted' && (
                            <BrandButton
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/clinic/proposals?proposalId=${proposal.id}&edit=1`)}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" />
                              Editar
                            </BrandButton>
                          )}
                          {canGenerateContract && (
                            <BrandButton size="sm" onClick={() => openContractDialog(proposal)}>
                              <FileSignature className="h-4 w-4" />
                              Gerar contrato
                            </BrandButton>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
                  {contracts.map((contract) => (
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
                            onClick={async () => {
                              try {
                                const url = await getSignedContractUrl(contract.pdf_storage_path || contract.signed_pdf_url);
                                window.open(url, '_blank', 'noopener,noreferrer');
                              } catch (e) {
                                toast.error('Não foi possível carregar o arquivo.');
                              }
                            }}
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
          {clinicId && id && <PatientPhotosTab clinicId={clinicId} patientId={id} />}
        </TabsContent>

        {/* Notes and observations tab */}
        <TabsContent value="notes">
          {clinicId && id && (
            <PatientNotesTab
              patientId={id}
              clinicId={clinicId}
              rawNotes={patient?.notes}
              onNotesUpdated={() => {
                queryClient.invalidateQueries({ queryKey: ['patient', id] });
                queryClient.invalidateQueries({ queryKey: ['appointments'] });
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="whatsapp">
          {clinicId && id && <ContactWhatsappPanel clinicId={clinicId} patientId={id} phone={patient?.phone} name={patient?.full_name} />}
        </TabsContent>

        {/* Feedback tab */}
        <TabsContent value="access-log">
          <p className="mb-3 text-xs text-muted-foreground">Quem abriu a ficha, a anamnese, as fotos e os contratos deste paciente. Não pode ser alterado nem apagado.</p>
          <AccessLogList clinicId={clinicId} patientId={id} />
        </TabsContent>

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

      <Dialog
        open={!!contractDialogProposal}
        onOpenChange={(open) => {
          if (!open) resetContractDialog();
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerar contrato</DialogTitle>
            <DialogDescription>
              Configure pagamento e pagador sem sair do prontuário do paciente.
            </DialogDescription>
          </DialogHeader>

          {contractDialogProposal && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-amber-50/60 p-4">
                <p className="text-sm font-semibold text-foreground">
                  {contractDialogProposal.proposal_number || 'Proposta sem número'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {patient.full_name} · R$ {Number(contractDialogProposal.final_amount || 0).toFixed(2)}
                </p>
                <p className="mt-2 text-xs text-amber-800">
                  A proposta já está aprovada. Ao confirmar, o contrato será criado em rascunho e vinculado a este paciente.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ContractPaymentConfigurator
                  paymentCondition={paymentCondition}
                  setPaymentCondition={setPaymentCondition}
                  selectedPaymentMethods={selectedPaymentMethods}
                  togglePaymentMethod={togglePaymentMethod}
                  paymentConfig={paymentConfig}
                  setPaymentConfig={setPaymentConfig}
                  paymentDetails={paymentDetails}
                  setPaymentDetails={setPaymentDetails}
                />
                <div className="space-y-4">
                  <PayerSection
                    value={payerData}
                    onChange={setPayerData}
                    patientName={patient.full_name || undefined}
                  />
                  <div className="rounded-md border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                    Valor da proposta: <span className="font-semibold text-foreground">R$ {Number(contractDialogProposal.final_amount || 0).toFixed(2)}</span> ·
                    Soma informada: <span className="font-semibold text-foreground">R$ {selectedPaymentMethods.reduce((sum, method) => sum + Number(paymentConfig[method]?.amount || 0), 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t pt-4">
                <BrandButton type="button" variant="outline" onClick={resetContractDialog}>
                  Cancelar
                </BrandButton>
                <BrandButton
                  type="button"
                  disabled={generateContractMutation.isPending}
                  onClick={() => generateContractMutation.mutate()}
                >
                  {generateContractMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileTextIcon className="h-4 w-4" />
                  )}
                  {generateContractMutation.isPending ? 'Gerando...' : 'Confirmar e gerar contrato'}
                </BrandButton>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar dados do paciente</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 mt-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const errors = validatePatientFields(editForm);
              setEditErrors(errors);
              if (Object.keys(errors).length > 0) {
                toast.error(Object.values(errors).join(' '));
                return;
              }
              try {
                setCheckingDuplicates(true);
                if (!(await duplicates.canSave(editForm.cpf, editForm.phone))) return;
              } catch (err) {
                toast.error(patientSaveErrorMessage(err));
                return;
              } finally {
                setCheckingDuplicates(false);
              }
              updatePatientMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input value={editForm.full_name} onChange={(event) => setEditForm((current) => ({ ...current, full_name: event.target.value }))} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Telefone *</Label>
                <Input
                  value={editForm.phone}
                  onChange={(event) => setEditForm((current) => ({ ...current, phone: formatPhone(event.target.value) }))}
                  onBlur={() => duplicates.check(editForm.cpf, editForm.phone).catch(() => undefined)}
                  placeholder="(11) 99999-9999"
                  inputMode="tel"
                  aria-invalid={!!editErrors.phone}
                  className={editErrors.phone ? 'border-destructive' : undefined}
                />
                {editErrors.phone && <p className="text-xs text-destructive">{editErrors.phone}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CPF *</Label>
                <Input
                  value={formatCpf(editForm.cpf)}
                  onChange={(event) => setEditForm((current) => ({ ...current, cpf: formatCpf(event.target.value) }))}
                  onBlur={() => duplicates.check(editForm.cpf, editForm.phone).catch(() => undefined)}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  aria-invalid={!!editErrors.cpf}
                  className={editErrors.cpf ? 'border-destructive' : undefined}
                />
                {editErrors.cpf && <p className="text-xs text-destructive">{editErrors.cpf}</p>}
              </div>
              <div className="space-y-2">
                <Label>Data de nascimento</Label>
                <Input type="date" value={editForm.date_of_birth} onChange={(event) => setEditForm((current) => ({ ...current, date_of_birth: event.target.value }))} />
              </div>
            </div>
            <PatientDuplicateAlert cpfMatch={duplicates.cpfMatch} phoneMatches={duplicates.phoneMatches} />
            <div className="space-y-2">
              <Label>Gênero</Label>
              <Select value={editForm.gender || 'none'} onValueChange={(value) => setEditForm((current) => ({ ...current, gender: value === 'none' ? '' : value }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informado</SelectItem>
                  <SelectItem value="female">Feminino</SelectItem>
                  <SelectItem value="male">Masculino</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Endereço</h3>
                <p className="text-xs text-muted-foreground mt-1">Dados complementares usados na ficha do paciente e na formalização do contrato.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input value={editForm.zip_code} onChange={(event) => handleEditCepChange(event.target.value)} placeholder="00000-000" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Rua e bairro</Label>
                  <Input value={editForm.address} onChange={(event) => setEditForm((current) => ({ ...current, address: event.target.value }))} placeholder="Rua, bairro" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Número{editForm.address.trim() ? ' *' : ''}</Label>
                  <Input
                    value={editForm.address_number}
                    onChange={(event) => setEditForm((current) => ({ ...current, address_number: event.target.value }))}
                    placeholder="123 ou S/N"
                    aria-invalid={!!editErrors.address_number}
                    className={editErrors.address_number ? 'border-destructive' : undefined}
                  />
                  {editErrors.address_number && <p className="text-xs text-destructive">{editErrors.address_number}</p>}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Complemento</Label>
                  <Input value={editForm.address_complement} onChange={(event) => setEditForm((current) => ({ ...current, address_complement: event.target.value }))} placeholder="Apto, bloco, casa..." />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Cidade</Label>
                  <Input value={editForm.city} onChange={(event) => setEditForm((current) => ({ ...current, city: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>UF</Label>
                  <Input value={editForm.state} onChange={(event) => setEditForm((current) => ({ ...current, state: event.target.value.toUpperCase().slice(0, 2) }))} placeholder="SP" maxLength={2} />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={editForm.notes} onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
            </div>
            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setEditOpen(false)} className="flex-1">
                Cancelar
              </BrandButton>
              <BrandButton type="submit" className="flex-1" disabled={updatePatientMutation.isPending || checkingDuplicates}>
                {updatePatientMutation.isPending ? 'Salvando...' : checkingDuplicates ? 'Verificando...' : 'Salvar alterações'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
