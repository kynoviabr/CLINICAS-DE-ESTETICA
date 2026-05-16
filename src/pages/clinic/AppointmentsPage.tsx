import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Plus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Check, X, AlertTriangle, ClipboardList, UserPlus, CalendarCheck2, Clock3, CheckCircle2, CalendarCog, Lock, Trash2 } from 'lucide-react';
import QuickPatientModal from '@/components/patient/QuickPatientModal';
import { AnamneseAlertBanner } from '@/components/anamnese/AnamneseAlertBanner';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek,
  isSameMonth, isSameDay, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  startOfDay, endOfDay
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Database } from '@/integrations/supabase/types';

const professionalColors = [
  'hsl(var(--primary))', 'hsl(210 80% 50%)', 'hsl(280 60% 50%)',
  'hsl(30 80% 50%)', 'hsl(160 60% 40%)', 'hsl(350 70% 50%)',
  'hsl(190 70% 40%)', 'hsl(60 70% 40%)',
];

const statusConfig: Record<string, { label: string; badge: BadgeStatus; style: string }> = {
  scheduled: { label: 'Agendado', badge: 'scheduled', style: 'border-l-4 border-l-info' },
  confirmed: { label: 'Confirmado', badge: 'confirmed', style: 'border-l-4 border-l-success' },
  completed: { label: 'Concluído', badge: 'completed', style: 'opacity-60 border-l-4 border-l-success' },
  cancelled: { label: 'Cancelado', badge: 'cancelled', style: 'opacity-50 line-through border-l-4 border-l-destructive' },
  no_show: { label: 'Não compareceu', badge: 'no_show', style: 'border-l-4 border-l-warning' },
  rescheduled: { label: 'Remarcado', badge: 'scheduled', style: 'border-l-4 border-l-sky-500 opacity-80' },
  in_progress: { label: 'Em andamento', badge: 'in_progress', style: 'border-l-4 border-l-info' },
};

type ViewMode = 'month' | 'week' | 'day';
type AppointmentRow = Database['public']['Tables']['appointments']['Row'] & {
  appointment_type?: 'session' | 'evaluation' | null;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  lead_id?: string | null;
  is_batch?: boolean | null;
  patients?: {
    full_name?: string | null;
    dissatisfaction_flag?: boolean | null;
    dissatisfaction_level?: string | null;
    dissatisfaction_reason?: string | null;
  } | null;
  leads?: { full_name?: string | null; phone?: string | null } | null;
  treatments?: { name?: string | null } | null;
};
const weekDays = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

export default function AppointmentsPage() {
  const { clinicId } = useBranding();
  const { user } = useAuth();
  const { role } = useUserRole();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewAppt, setViewAppt] = useState<AppointmentRow | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [appointmentType, setAppointmentType] = useState<'session' | 'evaluation'>('session');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [selectedLead, setSelectedLead] = useState('');
  const [selectedTreatment, setSelectedTreatment] = useState('');
  const [selectedProfessional, setSelectedProfessional] = useState('');
  const [filterProfessional, setFilterProfessional] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [queueExpanded, setQueueExpanded] = useState(true);
  const [duration, setDuration] = useState('60');
  const [notes, setNotes] = useState('');
  const [quickPatientOpen, setQuickPatientOpen] = useState(false);
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [blocksDialogOpen, setBlocksDialogOpen] = useState(false);
  const [availabilityProfessional, setAvailabilityProfessional] = useState('unassigned');
  const [availabilityDraft, setAvailabilityDraft] = useState<Record<number, { isActive: boolean; start: string; end: string }>>({});
  const [blockProfessional, setBlockProfessional] = useState('all');
  const [blockStartDate, setBlockStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [blockStartTime, setBlockStartTime] = useState('09:00');
  const [blockEndDate, setBlockEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [blockEndTime, setBlockEndTime] = useState('10:00');
  const [blockReason, setBlockReason] = useState('');
  const [blockNotes, setBlockNotes] = useState('');
  const [exceptionModal, setExceptionModal] = useState<{ mode: 'cancel' | 'no_show' | 'reschedule'; appointment: Record<string, unknown> & { id: string; clinic_id: string; status: string; appointment_type?: string | null; lead_id?: string | null } } | null>(null);
  const [exceptionReason, setExceptionReason] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('09:00');
  const [rescheduleDuration, setRescheduleDuration] = useState('60');
  const [rescheduleProfessional, setRescheduleProfessional] = useState('unassigned');
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [proposalLoadingId, setProposalLoadingId] = useState<string | null>(null);

  const prefillLeadId = searchParams.get('leadId');
  const prefillProfessionalId = searchParams.get('professionalId');
  const shouldOpenNewFromQuery = searchParams.get('openNew') === '1';

  const isProfessional = role === 'professional';

  // Get date range based on view
  const { rangeStart, rangeEnd, calendarDays } = useMemo(() => {
    if (viewMode === 'month') {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      const cs = startOfWeek(ms, { locale: ptBR });
      const ce = endOfWeek(me, { locale: ptBR });
      return { rangeStart: cs, rangeEnd: ce, calendarDays: eachDayOfInterval({ start: cs, end: ce }) };
    } else if (viewMode === 'week') {
      const ws = startOfWeek(currentDate, { locale: ptBR });
      const we = endOfWeek(currentDate, { locale: ptBR });
      return { rangeStart: ws, rangeEnd: we, calendarDays: eachDayOfInterval({ start: ws, end: we }) };
    } else {
      return { rangeStart: startOfDay(currentDate), rangeEnd: endOfDay(currentDate), calendarDays: [currentDate] };
    }
  }, [currentDate, viewMode]);

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments', clinicId, rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, patients(full_name, dissatisfaction_flag, dissatisfaction_level, dissatisfaction_reason), leads!appointments_lead_id_fkey(full_name, phone), treatments(name)')
        .eq('clinic_id', clinicId!)
        .gte('scheduled_at', rangeStart.toISOString())
        .lte('scheduled_at', rangeEnd.toISOString())
        .order('scheduled_at');
      if (error) throw error;
      return (data || []) as AppointmentRow[];
    },
    enabled: !!clinicId,
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients-select', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('patients').select('id, full_name, current_anamnese_status, current_anamnese_expires_at').eq('clinic_id', clinicId!).eq('status', 'active').order('full_name');
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads-select', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('leads')
        .select('id, full_name, phone, cpf, kanban_stage, assigned_to, appointment_id')
        .eq('clinic_id', clinicId!)
        .is('deleted_at', null)
        .order('full_name');
      if (error) throw error;
      return (data || []).filter((lead) => !['closed_won', 'closed_lost'].includes(lead.kanban_stage));
    },
    enabled: !!clinicId,
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments-select', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatments').select('id, name, duration_minutes').eq('clinic_id', clinicId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { staff: professionals = [] } = useStaffDirectory(clinicId);

  const { data: availability = [] } = useQuery({
    queryKey: ['professional-availability', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('professional_availability')
        .select('*')
        .eq('clinic_id', clinicId!)
        .eq('is_active', true)
        .order('professional_id')
        .order('day_of_week');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: appointmentBlocks = [] } = useQuery({
    queryKey: ['appointment-blocks', clinicId, rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const from = startOfDay(addDays(rangeStart, -14)).toISOString();
      const to = endOfDay(addDays(rangeEnd, 30)).toISOString();
      const { data, error } = await supabase.from('appointment_blocks')
        .select('*')
        .eq('clinic_id', clinicId!)
        .gte('start_at', from)
        .lte('end_at', to)
        .order('start_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const getSelectedPatientData = (patientId: string) => patients.find((p) => p.id === patientId);
  const getSelectedLeadData = useCallback((leadId: string) => leads.find((lead) => lead.id === leadId), [leads]);
  const getAppointmentStartDate = (appointment) => new Date(appointment.start_time || appointment.scheduled_at);
  const getAppointmentEndDate = (appointment) => {
    if (appointment.end_time) return new Date(appointment.end_time);
    const start = getAppointmentStartDate(appointment);
    return new Date(start.getTime() + (appointment.duration_minutes || 60) * 60000);
  };
  const getAppointmentDisplayName = (appointment) => {
    return (appointment.patients as { full_name?: string | null } | null)?.full_name || (appointment.leads as { full_name?: string | null } | null)?.full_name || 'Lead sem paciente';
  };
  const getBlocksForDay = useCallback((day: Date) => {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = endOfDay(day).getTime();
    return appointmentBlocks.filter((block) => {
      const blockStart = new Date(block.start_at).getTime();
      const blockEnd = new Date(block.end_at).getTime();
      return blockStart <= dayEnd && blockEnd >= dayStart;
    });
  }, [appointmentBlocks]);
  const getProfessionalLabel = (professionalId?: string | null) => {
    if (!professionalId) return 'Não atribuído';
    return professionals.find((professional) => professional.user_id === professionalId)?.label || 'Profissional';
  };
  const hasAvailabilityWindow = (professionalId: string | null, startTime: Date, endTime: Date) => {
    if (!professionalId) return true;
    const dayOfWeek = startTime.getDay();
    const slots = availability.filter((slot) => slot.professional_id === professionalId && slot.day_of_week === dayOfWeek && slot.is_active);
    if (slots.length === 0) return false;

    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
    return slots.some((slot) => {
      const [startHour, startMinute] = String(slot.start_time).slice(0, 5).split(':').map(Number);
      const [endHour, endMinute] = String(slot.end_time).slice(0, 5).split(':').map(Number);
      const slotStartMinutes = startHour * 60 + startMinute;
      const slotEndMinutes = endHour * 60 + endMinute;
      return startMinutes >= slotStartMinutes && endMinutes <= slotEndMinutes;
    });
  };
  const assertNoSchedulingConflicts = async ({
    professionalId,
    startTime,
    endTime,
    ignoreAppointmentId,
  }: {
    professionalId: string | null;
    startTime: Date;
    endTime: Date;
    ignoreAppointmentId?: string;
  }) => {
    if (!clinicId) return;

    let appointmentsQuery = supabase.from('appointments')
      .select('id, start_time, end_time, status, professional_id')
      .eq('clinic_id', clinicId)
      .lt('start_time', endTime.toISOString())
      .gt('end_time', startTime.toISOString())
      .not('status', 'in', '(cancelled,rescheduled)');

    if (professionalId) {
      appointmentsQuery = appointmentsQuery.eq('professional_id', professionalId);
    }

    const { data: conflictingAppointments, error: appointmentError } = await appointmentsQuery;
    if (appointmentError) throw appointmentError;

    const realConflict = (conflictingAppointments || []).some((appointment) => appointment.id !== ignoreAppointmentId);
    if (realConflict) {
      throw new Error('Já existe outro agendamento para esse horário.');
    }

    let blocksQuery = supabase.from('appointment_blocks')
      .select('id, professional_id, start_at, end_at')
      .eq('clinic_id', clinicId)
      .lt('start_at', endTime.toISOString())
      .gt('end_at', startTime.toISOString());

    if (professionalId) {
      blocksQuery = blocksQuery.or(`professional_id.is.null,professional_id.eq.${professionalId}`);
    }

    const { data: conflictingBlocks, error: blockError } = await blocksQuery;
    if (blockError) throw blockError;
    if ((conflictingBlocks || []).length > 0) {
      throw new Error('Existe um bloqueio para esse horário.');
    }
  };

  const openExceptionModal = (mode: 'cancel' | 'no_show' | 'reschedule', appointment: Record<string, unknown> & { id: string; clinic_id: string; status: string; appointment_type?: string | null; lead_id?: string | null }) => {
    setExceptionReason('');
    setRescheduleDate(format(getAppointmentStartDate(appointment), 'yyyy-MM-dd'));
    setRescheduleTime(format(getAppointmentStartDate(appointment), 'HH:mm'));
    setRescheduleDuration(String(appointment.duration_minutes || Math.max(15, Math.round((getAppointmentEndDate(appointment).getTime() - getAppointmentStartDate(appointment).getTime()) / 60000))));
    setRescheduleProfessional(appointment.professional_id || 'unassigned');
    setRescheduleNotes(appointment.notes || '');
    setExceptionModal({ mode, appointment });
  };

  useEffect(() => {
    if (!shouldOpenNewFromQuery || !prefillLeadId || !leads.some((lead) => lead.id === prefillLeadId)) return;

    resetForm();
    setAppointmentType('evaluation');
    setSelectedLead(prefillLeadId);
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    setSelectedProfessional(prefillProfessionalId || '');
    setDialogOpen(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('openNew');
    nextParams.delete('professionalId');
    setSearchParams(nextParams, { replace: true });
  }, [shouldOpenNewFromQuery, prefillLeadId, prefillProfessionalId, leads, searchParams, setSearchParams]);

  useEffect(() => {
    if (appointmentType !== 'evaluation') return;
    if (!selectedLead) {
      if (!dialogOpen) {
        setSelectedProfessional('');
      }
      return;
    }

    const lead = getSelectedLeadData(selectedLead);
    if (!lead?.assigned_to) {
      if (!selectedProfessional && isProfessional && user?.id) {
        setSelectedProfessional(user.id);
      }
      return;
    }

    const hasProfessionalAssigned = professionals.some((professional) => professional.user_id === lead.assigned_to);
    setSelectedProfessional(hasProfessionalAssigned ? lead.assigned_to : (isProfessional && user?.id ? user.id : ''));
  }, [appointmentType, selectedLead, professionals, isProfessional, user, dialogOpen, selectedProfessional, getSelectedLeadData]);

  useEffect(() => {
    if (professionals.length > 0 && availabilityProfessional === 'unassigned') {
      setAvailabilityProfessional(professionals[0].user_id);
    }
  }, [professionals, availabilityProfessional]);

  useEffect(() => {
    if (!availabilityProfessional || availabilityProfessional === 'unassigned') return;
    const nextDraft = weekDays.reduce((acc, day) => {
      const slot = availability.find((item) => item.professional_id === availabilityProfessional && item.day_of_week === day.value && item.is_active);
      acc[day.value] = {
        isActive: !!slot,
        start: slot ? String(slot.start_time).slice(0, 5) : '09:00',
        end: slot ? String(slot.end_time).slice(0, 5) : '18:00',
      };
      return acc;
    }, {} as Record<number, { isActive: boolean; start: string; end: string }>);
    setAvailabilityDraft(nextDraft);
  }, [availabilityProfessional, availability]);

  const getProfColor = (profId: string | null) => {
    if (!profId) return professionalColors[0];
    const index = professionals.findIndex(p => p.user_id === profId);
    return professionalColors[(index >= 0 ? index : 0) % professionalColors.length];
  };

  const filteredAppointments = useMemo(() => {
    let filtered = appointments;
    if (filterProfessional !== 'all') {
      filtered = filtered.filter((a) => a.professional_id === filterProfessional);
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter((a) => a.status === filterStatus);
    }
    return filtered;
  }, [appointments, filterProfessional, filterStatus]);

  const operationalSummary = useMemo(() => {
    const todayAppointments = filteredAppointments.filter((appointment) =>
      isSameDay(getAppointmentStartDate(appointment), new Date())
    );
    const readyForSession = todayAppointments.filter((appointment) =>
      appointment.status === 'confirmed' || appointment.status === 'in_progress'
    );

    return {
      totalInView: filteredAppointments.length,
      today: todayAppointments.length,
      readyForSession: readyForSession.length,
      noShow: filteredAppointments.filter((appointment) => appointment.status === 'no_show').length,
    };
  }, [filteredAppointments]);

  const todayQueue = useMemo(() => {
    return filteredAppointments
      .filter((appointment) => isSameDay(getAppointmentStartDate(appointment), new Date()))
      .sort((a, b) => +getAppointmentStartDate(a) - +getAppointmentStartDate(b))
      .slice(0, 5);
  }, [filteredAppointments]);

  const agendaSignals = useMemo(() => {
    const evaluations = filteredAppointments.filter((appointment) => appointment.appointment_type === 'evaluation').length;
    const batches = filteredAppointments.filter((appointment) => appointment.is_batch).length;
    const blockedDays = calendarDays.filter((day) => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = endOfDay(day).getTime();
      return appointmentBlocks.some((block) => {
        const blockStart = new Date(block.start_at).getTime();
        const blockEnd = new Date(block.end_at).getTime();
        return blockStart <= dayEnd && blockEnd >= dayStart;
      });
    }).length;

    return {
      evaluations,
      batches,
      blockedDays,
      blocks: appointmentBlocks.length,
    };
  }, [filteredAppointments, appointmentBlocks, calendarDays]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const startTime = new Date(`${selectedDate}T${selectedTime}:00`);
      const endTime = new Date(startTime.getTime() + parseInt(duration) * 60000);
      const profId = selectedProfessional || (isProfessional ? user?.id || null : null);
      if (!profId) {
        throw new Error('Selecione um profissional para este agendamento.');
      }
      if (profId && !hasAvailabilityWindow(profId, startTime, endTime)) {
        throw new Error('Esse horário está fora da disponibilidade semanal do profissional.');
      }
      await assertNoSchedulingConflicts({ professionalId: profId, startTime, endTime });
      const lead = appointmentType === 'evaluation' ? getSelectedLeadData(selectedLead) : null;
      const payload: Record<string, unknown> = {
        clinic_id: clinicId!,
        patient_id: appointmentType === 'session' ? selectedPatient : null,
        lead_id: appointmentType === 'evaluation' ? selectedLead : null,
        treatment_id: selectedTreatment || null,
        professional_id: profId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        scheduled_at: startTime.toISOString(),
        duration_minutes: parseInt(duration) || 60,
        appointment_type: appointmentType,
        credit_check_required: appointmentType === 'evaluation' ? !!lead?.cpf : false,
        credit_check_status: appointmentType === 'evaluation' && lead?.cpf ? 'pending' : 'not_required',
        notes: notes || null,
      };
      const { data: insertedAppointment, error } = await supabase.from('appointments')
        .insert(payload)
        .select('id, start_time, professional_id')
        .single();
      if (error) throw error;

      if (appointmentType === 'evaluation' && selectedLead) {
        const { error: leadError } = await supabase.from('leads')
          .update({ kanban_stage: 'scheduled', appointment_id: insertedAppointment.id })
          .eq('clinic_id', clinicId!)
          .eq('id', selectedLead);
        if (leadError) throw leadError;
      }

      return {
        appointment: insertedAppointment,
        startTime,
        professionalId: profId,
      };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      if (result?.startTime) {
        setCurrentDate(result.startTime);
      }
      if (result?.professionalId) {
        setFilterProfessional(result.professionalId);
      }
      setViewMode('day');
      setDialogOpen(false);
      resetForm();
      toast({ title: 'Agendamento criado!' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const appointment = appointments.find((item) => item.id === id);
      const patch: Record<string, unknown> = { status };

      if (status === 'confirmed') patch.confirmed_at = new Date().toISOString();
      if (status === 'in_progress') patch.checked_in_at = new Date().toISOString();
      if (status === 'completed') patch.completed_at = new Date().toISOString();

      const { error } = await supabase.from('appointments').update(patch).eq('id', id);
      if (error) throw error;

      if (appointment?.lead_id && status === 'completed') {
        const { error: leadError } = await supabase.from('leads')
          .update({ kanban_stage: 'proposal_sent' })
          .eq('clinic_id', clinicId!)
          .eq('id', appointment.lead_id);
        if (leadError) throw leadError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setViewAppt(null);
      toast({ title: 'Status atualizado!' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const appointmentExceptionMutation = useMutation({
    mutationFn: async () => {
      if (!exceptionModal || !clinicId) return;

      const appointment = exceptionModal.appointment;

      if (exceptionModal.mode === 'cancel' || exceptionModal.mode === 'no_show') {
        if (!exceptionReason.trim()) {
          throw new Error('Informe o motivo para continuar.');
        }

        const patch: Record<string, unknown> = {
          status: exceptionModal.mode === 'cancel' ? 'cancelled' : 'no_show',
        };

        if (exceptionModal.mode === 'cancel') patch.cancelled_reason = exceptionReason.trim();
        if (exceptionModal.mode === 'no_show') patch.no_show_reason = exceptionReason.trim();

        const { error } = await supabase.from('appointments')
          .update(patch)
          .eq('clinic_id', clinicId)
          .eq('id', appointment.id);
        if (error) throw error;

        if (appointment.lead_id && appointment.appointment_type === 'evaluation') {
          const { error: leadError } = await supabase.from('leads')
            .update({ kanban_stage: 'contacted' })
            .eq('clinic_id', clinicId)
            .eq('id', appointment.lead_id);
          if (leadError) throw leadError;
        }

        return;
      }

      if (!rescheduleDate || !rescheduleTime) {
        throw new Error('Escolha a nova data e horário.');
      }

      const startTime = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      const durationMinutes = parseInt(rescheduleDuration) || 60;
      const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
      const nextProfessionalId = rescheduleProfessional === 'unassigned' ? null : rescheduleProfessional;
      if (nextProfessionalId && !hasAvailabilityWindow(nextProfessionalId, startTime, endTime)) {
        throw new Error('Esse novo horário está fora da disponibilidade semanal do profissional.');
      }
      await assertNoSchedulingConflicts({
        professionalId: nextProfessionalId,
        startTime,
        endTime,
        ignoreAppointmentId: appointment.id,
      });
      const mergedNotes = [appointment.notes, rescheduleNotes].filter(Boolean).join('\n\n');

      const { data: newAppointment, error: createError } = await supabase.from('appointments')
        .insert({
          clinic_id: clinicId,
          patient_id: appointment.patient_id,
          lead_id: appointment.lead_id,
          treatment_id: appointment.treatment_id,
          professional_id: nextProfessionalId,
          appointment_type: appointment.appointment_type,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          scheduled_at: startTime.toISOString(),
          duration_minutes: durationMinutes,
          notes: mergedNotes || null,
          status: 'scheduled',
          credit_check_required: appointment.credit_check_required || false,
          credit_check_status: appointment.credit_check_status || 'not_required',
          rescheduled_from: appointment.id,
          created_by: user?.id || null,
        })
        .select('id')
        .single();
      if (createError) throw createError;

      const { error: updateError } = await supabase.from('appointments')
        .update({
          status: 'rescheduled',
          rescheduled_to: newAppointment.id,
          cancelled_reason: exceptionReason.trim() || 'Remarcado',
        })
        .eq('clinic_id', clinicId)
        .eq('id', appointment.id);
      if (updateError) throw updateError;

      if (appointment.lead_id && appointment.appointment_type === 'evaluation') {
        const { error: leadError } = await supabase.from('leads')
          .update({ kanban_stage: 'scheduled', appointment_id: newAppointment.id })
          .eq('clinic_id', clinicId)
          .eq('id', appointment.lead_id);
        if (leadError) throw leadError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setViewAppt(null);
      setExceptionModal(null);
      toast({ title: 'Agenda atualizada' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const saveAvailabilityMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !availabilityProfessional || availabilityProfessional === 'unassigned') {
        throw new Error('Selecione um profissional.');
      }

      const { error: deleteError } = await supabase.from('professional_availability')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('professional_id', availabilityProfessional);
      if (deleteError) throw deleteError;

      const rows = weekDays
        .map((day) => ({ day, config: availabilityDraft[day.value] }))
        .filter(({ config }) => config?.isActive)
        .map(({ day, config }) => ({
          clinic_id: clinicId,
          professional_id: availabilityProfessional,
          day_of_week: day.value,
          start_time: config.start,
          end_time: config.end,
          is_active: true,
        }));

      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('professional_availability').insert(rows);
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['professional-availability'] });
      setAvailabilityDialogOpen(false);
      toast({ title: 'Disponibilidade atualizada' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const createBlockMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId || !blockReason.trim()) {
        throw new Error('Informe pelo menos o motivo do bloqueio.');
      }

      const startAt = new Date(`${blockStartDate}T${blockStartTime}:00`);
      const endAt = new Date(`${blockEndDate}T${blockEndTime}:00`);
      if (endAt <= startAt) {
        throw new Error('O fim do bloqueio precisa ser depois do início.');
      }

      const { error } = await supabase.from('appointment_blocks').insert({
        clinic_id: clinicId,
        professional_id: blockProfessional === 'all' ? null : blockProfessional,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        reason: blockReason.trim(),
        notes: blockNotes.trim() || null,
        created_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-blocks'] });
      setBlockReason('');
      setBlockNotes('');
      toast({ title: 'Bloqueio criado' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const deleteBlockMutation = useMutation({
    mutationFn: async (blockId: string) => {
      const { error } = await supabase.from('appointment_blocks').delete().eq('id', blockId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-blocks'] });
      toast({ title: 'Bloqueio removido' });
    },
    onError: (err: Error) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const resetForm = () => {
    setAppointmentType('session');
    setSelectedPatient('');
    setSelectedLead('');
    setSelectedTreatment('');
    setSelectedProfessional('');
    setDuration('60');
    setNotes('');
  };

  const ensurePatientForLead = async (leadId: string) => {
    const { data: lead, error: leadError } = await supabase.from('leads')
      .select('*')
      .eq('clinic_id', clinicId!)
      .eq('id', leadId)
      .single();
    if (leadError) throw leadError;

    if (lead.patient_id) return lead.patient_id as string;

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .insert({
        clinic_id: clinicId!,
        full_name: lead.full_name,
        phone: lead.phone,
        cpf: lead.cpf,
        email: lead.email,
        date_of_birth: lead.birth_date,
        notes: lead.notes,
        status: 'active',
      })
      .select('id')
      .single();
    if (patientError) throw patientError;

    const { error: updateLeadError } = await supabase.from('leads')
      .update({
        patient_id: patient.id,
        converted_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId!)
      .eq('id', leadId);
    if (updateLeadError) throw updateLeadError;

    qc.invalidateQueries({ queryKey: ['crm-leads'] });
    qc.invalidateQueries({ queryKey: ['patients'] });
    qc.invalidateQueries({ queryKey: ['patients-select'] });

    return patient.id as string;
  };

  const openProposalFromEvaluation = async (appointment: AppointmentRow, finalizeFirst = false) => {
    if (!clinicId || !appointment?.lead_id) return;

    setProposalLoadingId(appointment.id);
    try {
      if (finalizeFirst) {
        const { error: appointmentError } = await supabase.from('appointments')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('clinic_id', clinicId)
          .eq('id', appointment.id);
        if (appointmentError) throw appointmentError;

        const { error: leadError } = await supabase.from('leads')
          .update({ kanban_stage: 'proposal_sent' })
          .eq('clinic_id', clinicId)
          .eq('id', appointment.lead_id);
        if (leadError) throw leadError;
      }

      const patientId = await ensurePatientForLead(appointment.lead_id);
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
      setViewAppt(null);
      navigate(`/clinic/proposals?patientId=${patientId}&leadId=${appointment.lead_id}&openNew=1`);
    } catch (err) {
      toast({ title: 'Erro', description: err.message || 'Não foi possível abrir a proposta.', variant: 'destructive' });
    } finally {
      setProposalLoadingId(null);
    }
  };

  const navigate_ = (dir: number) => {
    if (viewMode === 'month') setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(dir > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1));
  };

  const getApptsForDay = (day: Date) => filteredAppointments.filter((a) => isSameDay(getAppointmentStartDate(a), day));
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const headerLabel = viewMode === 'month'
    ? format(currentDate, 'MMMM yyyy', { locale: ptBR })
    : viewMode === 'week'
    ? `${format(rangeStart, 'dd/MM', { locale: ptBR })} - ${format(rangeEnd, 'dd/MM/yyyy', { locale: ptBR })}`
    : format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR });

  return (
    <div>
      <PageHeader title="Agenda" description="Gerencie os agendamentos da clínica">
        <div className="flex flex-wrap gap-2">
          <>
            <BrandButton variant="outline" onClick={() => setAvailabilityDialogOpen(true)}>
              <CalendarCog className="w-4 h-4" /> Disponibilidade
            </BrandButton>
            <BrandButton variant="outline" onClick={() => setBlocksDialogOpen(true)}>
              <Lock className="w-4 h-4" /> Bloqueios
            </BrandButton>
          </>
          <BrandButton onClick={() => {
            resetForm();
            setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
            if (isProfessional && user?.id) {
              setSelectedProfessional(user.id);
            }
            setDialogOpen(true);
          }}>
            <Plus className="w-4 h-4" /> Novo Agendamento
          </BrandButton>
        </div>
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-4 mb-6">
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CalendarCheck2 className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.totalInView}</p>
            <p className="text-xs text-muted-foreground">Agendamentos no período</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <Clock3 className="w-5 h-5 text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.today}</p>
            <p className="text-xs text-muted-foreground">Atendimentos de hoje</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <CheckCircle2 className="w-5 h-5 text-success mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.readyForSession}</p>
            <p className="text-xs text-muted-foreground">Prontos para sessão</p>
          </CardContent>
        </Card>
        <Card className="shadow-card animate-fade-in">
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-foreground">{operationalSummary.noShow}</p>
            <p className="text-xs text-muted-foreground">Não compareceu</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate_(-1)} className="p-2 rounded-lg hover:bg-secondary"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-lg font-semibold text-foreground capitalize min-w-[200px] text-center">{headerLabel}</h2>
          <button onClick={() => navigate_(1)} className="p-2 rounded-lg hover:bg-secondary"><ChevronRight className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-3">
          <Select value={filterProfessional} onValueChange={setFilterProfessional}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todos profissionais" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os responsáveis</SelectItem>
              {professionals.map(p => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full inline-block" style={{ background: p.color }} />
                    {p.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[190px]"><SelectValue placeholder="Todos status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="scheduled">Agendado</SelectItem>
              <SelectItem value="confirmed">Confirmado</SelectItem>
              <SelectItem value="in_progress">Em andamento</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
              <SelectItem value="rescheduled">Remarcado</SelectItem>
              <SelectItem value="no_show">Não compareceu</SelectItem>
            </SelectContent>
          </Select>
          <Tabs value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="month">Mês</TabsTrigger>
              <TabsTrigger value="week">Semana</TabsTrigger>
              <TabsTrigger value="day">Dia</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {todayQueue.length > 0 && (
        <div className="bg-card rounded-xl shadow-card p-4 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Fila operacional de hoje</h3>
              <p className="text-xs text-muted-foreground">Os próximos atendimentos do dia para acompanhamento rápido.</p>
            </div>
            <BrandButton
              size="sm"
              variant="outline"
              onClick={() => setQueueExpanded((current) => !current)}
            >
              {queueExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Ocultar
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Expandir
                </>
              )}
            </BrandButton>
          </div>
          {!queueExpanded ? (
            <div className="rounded-lg border border-dashed bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              {todayQueue.length} atendimento(s) oculto(s) nesta fila.
            </div>
          ) : (
            <div className="space-y-2">
              {todayQueue.map((appointment) => (
                <div key={appointment.id} className="rounded-lg border bg-background px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{getAppointmentDisplayName(appointment)}</p>
                      <BrandBadge status={statusConfig[appointment.status]?.badge || 'default'}>
                        {statusConfig[appointment.status]?.label || appointment.status}
                      </BrandBadge>
                      {appointment.appointment_type === 'evaluation' && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                          Avaliação
                        </span>
                      )}
                      {appointment.is_batch && (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                          Lote
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(getAppointmentStartDate(appointment), "HH:mm", { locale: ptBR })} · {(appointment.treatments as { name?: string | null } | null)?.name || 'Sem tratamento'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getProfessionalLabel(appointment.professional_id)}
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <BrandButton size="sm" variant="outline" onClick={() => setViewAppt(appointment)}>
                      Ver
                    </BrandButton>
                    {appointment.status === 'scheduled' && (
                      <BrandButton
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: 'confirmed' })}
                        disabled={updateStatusMutation.isPending}
                      >
                        Confirmar
                      </BrandButton>
                    )}
                    {appointment.status === 'confirmed' && (
                      <BrandButton
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: 'in_progress' })}
                        disabled={updateStatusMutation.isPending}
                      >
                        Iniciar
                      </BrandButton>
                    )}
                    {appointment.status === 'in_progress' && (
                      <BrandButton
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: 'completed' })}
                        disabled={updateStatusMutation.isPending}
                      >
                        Concluir
                      </BrandButton>
                    )}
                    {appointment.appointment_type === 'evaluation' && appointment.status === 'completed' && (
                      <BrandButton size="sm" variant="outline" onClick={() => openProposalFromEvaluation(appointment, false)}>
                        Proposta
                      </BrandButton>
                    )}
                    {(appointment.status === 'confirmed' || appointment.status === 'in_progress' || appointment.status === 'scheduled') && (
                      <BrandButton size="sm" onClick={() => navigate(`/clinic/sessions?appointmentId=${appointment.id}`)}>
                        <ClipboardList className="w-4 h-4" />
                        Sessão
                      </BrandButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Professional legend */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {professionals.length > 0 && viewMode !== 'day' && (
          <div className="flex flex-wrap gap-3">
            {professionals.map(p => (
              <span key={p.user_id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-3 h-3 rounded-full" style={{ background: p.color }} />
                {p.label}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {agendaSignals.evaluations} avaliações
          </span>
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {agendaSignals.batches} sessões em lote
          </span>
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {agendaSignals.blocks} bloqueios
          </span>
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            {agendaSignals.blockedDays} dias com restrição
          </span>
        </div>
      </div>

      {/* Calendar */}
      {viewMode === 'month' && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
          <div className="grid grid-cols-7">
            {dayNames.map(d => (
              <div key={d} className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center border-b bg-secondary/50">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const dayAppts = getApptsForDay(day);
              const dayBlocks = getBlocksForDay(day);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentDate);
              return (
                <div
                  key={i}
                  className={`min-h-[80px] md:min-h-[100px] border-b border-r p-1 cursor-pointer hover:bg-secondary/30 transition-colors ${!isCurrentMonth ? 'opacity-40' : ''}`}
                  onClick={() => { setSelectedDate(format(day, 'yyyy-MM-dd')); resetForm(); setDialogOpen(true); }}
                >
                  <span className={`text-xs font-medium inline-flex w-6 h-6 items-center justify-center rounded-full ${isToday ? 'gradient-primary text-primary-foreground' : 'text-foreground'}`}>
                    {format(day, 'd')}
                  </span>
                  {dayBlocks.length > 0 && (
                    <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 text-[10px] font-medium text-amber-700">
                      {dayBlocks.length} bloqueio{dayBlocks.length > 1 ? 's' : ''}
                    </div>
                  )}
                  <div className="space-y-0.5 mt-1">
                    {dayAppts.slice(0, 3).map((a) => (
                      <div
                        key={a.id}
                        className={`rounded px-1.5 py-1 text-[10px] text-white cursor-pointer ${statusConfig[a.status]?.style || ''}`}
                        style={{ backgroundColor: getProfColor(a.professional_id) }}
                        onClick={e => { e.stopPropagation(); setViewAppt(a); }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-medium">{format(getAppointmentStartDate(a), 'HH:mm')} {getAppointmentDisplayName(a).split(' ')[0]}</span>
                          <div className="flex gap-1 shrink-0">
                            {a.appointment_type === 'evaluation' && <span className="rounded bg-white/20 px-1 text-[9px]">A</span>}
                            {a.is_batch && <span className="rounded bg-white/20 px-1 text-[9px]">L</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                    {dayAppts.length > 3 && <span className="text-[10px] text-muted-foreground">+{dayAppts.length - 3} mais</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'week' && (
        <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const dayAppts = getApptsForDay(day);
              const dayBlocks = getBlocksForDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <div key={i} className="border-r min-h-[300px]">
                  <div className={`px-2 py-2 text-center border-b ${isToday ? 'bg-primary/10' : 'bg-secondary/50'}`}>
                    <div className="text-xs text-muted-foreground">{dayNames[i]}</div>
                    <div className={`text-sm font-semibold ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</div>
                  </div>
                  <div className="p-1 space-y-1">
                    {dayBlocks.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
                        {dayBlocks.length} bloqueio{dayBlocks.length > 1 ? 's' : ''} neste dia
                      </div>
                    )}
                    {dayAppts.map((a) => (
                      <div
                        key={a.id}
                        className={`rounded p-2 text-xs text-white cursor-pointer ${statusConfig[a.status]?.style || ''}`}
                        style={{ backgroundColor: getProfColor(a.professional_id) }}
                        onClick={() => setViewAppt(a)}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="font-semibold">{format(getAppointmentStartDate(a), 'HH:mm')}</div>
                          <div className="flex gap-1">
                            {a.appointment_type === 'evaluation' && <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">Avaliação</span>}
                            {a.is_batch && <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">Lote</span>}
                          </div>
                        </div>
                        <div className="truncate">{getAppointmentDisplayName(a)}</div>
                        <div className="truncate opacity-80">{(a.treatments as { name?: string | null } | null)?.name}</div>
                        <div className="truncate opacity-80">{getProfessionalLabel(a.professional_id)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'day' && (
        <div className="bg-card rounded-xl shadow-card p-4 animate-fade-in">
          {getBlocksForDay(currentDate).length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-800">Dia com bloqueios operacionais</p>
              <div className="mt-2 space-y-1 text-xs text-amber-700">
                {getBlocksForDay(currentDate).map((block) => (
                  <p key={block.id}>
                    {format(new Date(block.start_at), 'HH:mm')} - {format(new Date(block.end_at), 'HH:mm')} · {block.reason}
                  </p>
                ))}
              </div>
            </div>
          )}
          {getApptsForDay(currentDate).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum agendamento neste dia</p>
          ) : (
            <div className="space-y-3">
              {getApptsForDay(currentDate).map((a) => {
                const sc = statusConfig[a.status];
                return (
                  <div
                    key={a.id}
                    className={`p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${sc?.style || ''}`}
                    onClick={() => setViewAppt(a)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{getAppointmentDisplayName(a)}</p>
                          {a.appointment_type === 'evaluation' && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                              Avaliação
                            </span>
                          )}
                          {a.is_batch && (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                              Sessão em lote
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{(a.treatments as { name?: string | null } | null)?.name || 'Sem tratamento'}</p>
                        <p className="text-xs text-muted-foreground">{getProfessionalLabel(a.professional_id)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">{format(getAppointmentStartDate(a), 'HH:mm')} - {format(getAppointmentEndDate(a), 'HH:mm')}</p>
                        <div className="mt-1 flex items-center justify-end gap-2">
                          <BrandBadge status={sc?.badge || 'default'}>{sc?.label || a.status}</BrandBadge>
                          <BrandButton
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              setViewAppt(a);
                            }}
                          >
                            Ver
                          </BrandButton>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Agendamento</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Tipo de agendamento</Label>
              <Select value={appointmentType} onValueChange={value => setAppointmentType(value as 'session' | 'evaluation')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="session">Sessão de paciente</SelectItem>
                  <SelectItem value="evaluation">Avaliação de lead</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {appointmentType === 'session' ? (
              <>
                <div className="space-y-2">
                  <Label>Paciente *</Label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                        <SelectTrigger><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                        <SelectContent>{patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <BrandButton
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setQuickPatientOpen(true)}
                      title="Cadastrar novo paciente"
                    >
                      <UserPlus className="w-4 h-4" />
                    </BrandButton>
                  </div>
                </div>
                {selectedPatient && (() => {
                  const p = getSelectedPatientData(selectedPatient);
                  return p ? <AnamneseAlertBanner status={p.current_anamnese_status} expiresAt={p.current_anamnese_expires_at} patientId={p.id} patientName={p.full_name} /> : null;
                })()}
              </>
            ) : (
              <div className="space-y-2">
                <Label>Lead *</Label>
                <Select value={selectedLead} onValueChange={setSelectedLead}>
                  <SelectTrigger><SelectValue placeholder="Selecionar lead para avaliação" /></SelectTrigger>
                  <SelectContent>
                    {leads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedLead && getSelectedLeadData(selectedLead)?.phone && (
                  <p className="text-xs text-muted-foreground">
                    Contato: {getSelectedLeadData(selectedLead)?.phone}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>{appointmentType === 'evaluation' ? 'Tratamento de interesse' : 'Tratamento'}</Label>
              <Select value={selectedTreatment} onValueChange={v => {
                setSelectedTreatment(v);
                const t = treatments.find((tr) => tr.id === v);
                if (t) setDuration(String(t.duration_minutes));
              }}>
                <SelectTrigger><SelectValue placeholder="Selecionar tratamento" /></SelectTrigger>
                <SelectContent>{treatments.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Profissional da avaliação</Label>
              <Select value={selectedProfessional} onValueChange={setSelectedProfessional}>
                <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
                <SelectContent>
                  {professionals.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {appointmentType === 'evaluation' && !selectedProfessional && (
                <p className="text-xs text-amber-700">Escolha quem fará a avaliação para ela aparecer na agenda correta.</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Data *</Label>
                <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Horário *</Label>
                <Input type="time" value={selectedTime} onChange={e => setSelectedTime(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Duração (min)</Label>
                <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</BrandButton>
              <BrandButton
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending || (appointmentType === 'session' ? !selectedPatient : !selectedLead) || !selectedProfessional}
              >
                {createMutation.isPending ? 'Criando...' : appointmentType === 'evaluation' ? 'Agendar avaliação' : 'Agendar'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View appointment */}
      <Dialog open={!!viewAppt} onOpenChange={() => setViewAppt(null)}>
        <DialogContent className="max-w-md">
          {viewAppt && (
            <>
              <DialogHeader>
                <DialogTitle>Agendamento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                {(() => {
                  const p = getSelectedPatientData(viewAppt.patient_id);
                  return p ? <AnamneseAlertBanner status={p?.current_anamnese_status} expiresAt={p?.current_anamnese_expires_at} patientId={viewAppt.patient_id} patientName={(viewAppt.patients as { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null; dissatisfaction_reason?: string | null } | null)?.full_name} showActions={false} /> : null;
                })()}
                {(viewAppt.patients as { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null; dissatisfaction_reason?: string | null } | null)?.dissatisfaction_flag && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive bg-destructive/5">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-destructive">Paciente insatisfeito — {(viewAppt.patients as { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null; dissatisfaction_reason?: string | null } | null)?.dissatisfaction_level || 'N/A'}</p>
                      {(viewAppt.patients as { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null; dissatisfaction_reason?: string | null } | null)?.dissatisfaction_reason && <p className="text-xs text-muted-foreground">{(viewAppt.patients as { dissatisfaction_reason?: string | null } | null)?.dissatisfaction_reason}</p>}
                    </div>
                  </div>
                )}
                <div className="text-sm space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Paciente:</span><span className="font-medium">{getAppointmentDisplayName(viewAppt)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><span className="font-medium">{viewAppt.appointment_type === 'evaluation' ? 'Avaliação' : 'Sessão'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Profissional:</span><span className="font-medium">{getProfessionalLabel(viewAppt.professional_id)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tratamento:</span><span className="font-medium">{(viewAppt.treatments as { name?: string | null } | null)?.name || '—'}</span></div>
                  {(viewAppt.leads as { phone?: string | null } | null)?.phone && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Contato do lead:</span><span className="font-medium">{(viewAppt.leads as { phone?: string | null } | null)?.phone}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">Horário:</span><span className="font-medium">{format(getAppointmentStartDate(viewAppt), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - {format(getAppointmentEndDate(viewAppt), 'HH:mm')}</span></div>
                  <div className="flex justify-between items-center"><span className="text-muted-foreground">Status:</span><BrandBadge status={statusConfig[viewAppt.status]?.badge || 'default'}>{statusConfig[viewAppt.status]?.label || viewAppt.status}</BrandBadge></div>
                  {viewAppt.notes && <div><span className="text-muted-foreground">Notas:</span><p className="mt-1">{viewAppt.notes}</p></div>}
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Ações do agendamento
                  </div>
                  {(() => {
                    const canAdjustAppointment = !['completed', 'cancelled', 'no_show'].includes(viewAppt.status);
                    return (
                  <div className="flex flex-wrap gap-2">
                  {viewAppt.status === 'scheduled' && (
                    <BrandButton size="sm" onClick={() => updateStatusMutation.mutate({ id: viewAppt.id, status: 'confirmed' })}>
                      <Check className="w-4 h-4" /> Confirmar
                    </BrandButton>
                  )}
                  {viewAppt.status === 'confirmed' && (
                    <BrandButton size="sm" onClick={() => updateStatusMutation.mutate({ id: viewAppt.id, status: 'in_progress' })}>
                      <Check className="w-4 h-4" /> Iniciar atendimento
                    </BrandButton>
                  )}
                  {viewAppt.status === 'in_progress' && (
                    <BrandButton size="sm" onClick={() => updateStatusMutation.mutate({ id: viewAppt.id, status: 'completed' })}>
                      <Check className="w-4 h-4" /> Concluir atendimento
                    </BrandButton>
                  )}
                  {viewAppt.appointment_type === 'evaluation' && viewAppt.status === 'in_progress' && (
                    <BrandButton size="sm" onClick={() => openProposalFromEvaluation(viewAppt, true)} disabled={proposalLoadingId === viewAppt.id}>
                      <CalendarCheck2 className="w-4 h-4" /> {proposalLoadingId === viewAppt.id ? 'Abrindo...' : 'Finalizar e abrir proposta'}
                    </BrandButton>
                  )}
                  {viewAppt.appointment_type === 'evaluation' && viewAppt.status === 'completed' && (
                    <BrandButton size="sm" variant="outline" onClick={() => openProposalFromEvaluation(viewAppt, false)} disabled={proposalLoadingId === viewAppt.id}>
                      <CalendarCheck2 className="w-4 h-4" /> {proposalLoadingId === viewAppt.id ? 'Abrindo...' : 'Abrir proposta'}
                    </BrandButton>
                  )}
                  {canAdjustAppointment && (
                    <>
                      <BrandButton size="sm" variant="outline" onClick={() => openExceptionModal('reschedule', viewAppt)}>
                        Remarcar agendamento
                      </BrandButton>
                      <BrandButton size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => openExceptionModal('cancel', viewAppt)}>
                        <X className="w-4 h-4" /> Cancelar agendamento
                      </BrandButton>
                      <BrandButton size="sm" variant="outline" onClick={() => openExceptionModal('no_show', viewAppt)}>
                        <AlertTriangle className="w-4 h-4" /> Registrar não comparecimento
                      </BrandButton>
                    </>
                  )}
                  {(viewAppt.status === 'confirmed' || viewAppt.status === 'scheduled' || viewAppt.status === 'in_progress') && (
                    <BrandButton size="sm" variant="outline" onClick={() => {
                      setViewAppt(null);
                      navigate(`/clinic/sessions?appointmentId=${viewAppt.id}`);
                    }}>
                      <ClipboardList className="w-4 h-4" /> Ir para Sessão
                    </BrandButton>
                  )}
                  </div>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!exceptionModal} onOpenChange={() => setExceptionModal(null)}>
        <DialogContent className="max-w-lg">
          {exceptionModal && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {exceptionModal.mode === 'cancel' ? 'Cancelar agendamento' :
                    exceptionModal.mode === 'no_show' ? 'Registrar não comparecimento' :
                    'Remarcar agendamento'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="rounded-xl border bg-secondary/30 p-4 text-sm">
                  <p className="font-medium text-foreground">{getAppointmentDisplayName(exceptionModal.appointment)}</p>
                  <p className="text-muted-foreground mt-1">
                    {format(getAppointmentStartDate(exceptionModal.appointment), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>
                    {exceptionModal.mode === 'reschedule' ? 'Motivo da remarcação' : 'Motivo'}
                  </Label>
                  <Textarea
                    value={exceptionReason}
                    onChange={(event) => setExceptionReason(event.target.value)}
                    rows={3}
                    placeholder={exceptionModal.mode === 'cancel' ? 'Explique por que o agendamento foi cancelado...' : 'Adicione um contexto para o time...'}
                  />
                </div>

                {exceptionModal.mode === 'reschedule' && (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>Nova data</Label>
                        <Input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Novo horário</Label>
                        <Input type="time" value={rescheduleTime} onChange={(event) => setRescheduleTime(event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Duração</Label>
                        <Input type="number" value={rescheduleDuration} onChange={(event) => setRescheduleDuration(event.target.value)} />
                      </div>
                    </div>

                    {!isProfessional && (
                      <div className="space-y-2">
                        <Label>Profissional</Label>
                        <Select value={rescheduleProfessional} onValueChange={setRescheduleProfessional}>
                          <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Sem profissional</SelectItem>
                            {professionals.map((professional) => (
                              <SelectItem key={professional.user_id} value={professional.user_id}>
                                {professional.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Notas do novo agendamento</Label>
                      <Textarea
                        value={rescheduleNotes}
                        onChange={(event) => setRescheduleNotes(event.target.value)}
                        rows={3}
                        placeholder="Adicione ajustes para o próximo horário, se necessário."
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-2">
                  <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setExceptionModal(null)}>
                    Voltar
                  </BrandButton>
                  <BrandButton className="flex-1" onClick={() => appointmentExceptionMutation.mutate()} disabled={appointmentExceptionMutation.isPending}>
                    {appointmentExceptionMutation.isPending ? 'Salvando...' :
                      exceptionModal.mode === 'cancel' ? 'Confirmar cancelamento' :
                      exceptionModal.mode === 'no_show' ? 'Registrar no-show' :
                      'Confirmar remarcação'}
                  </BrandButton>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={availabilityDialogOpen} onOpenChange={setAvailabilityDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Disponibilidade semanal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={availabilityProfessional} onValueChange={setAvailabilityProfessional}>
                <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
                <SelectContent>
                  {professionals.map((professional) => (
                    <SelectItem key={professional.user_id} value={professional.user_id}>
                      {professional.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              {weekDays.map((day) => {
                const row = availabilityDraft[day.value] || { isActive: false, start: '09:00', end: '18:00' };
                return (
                  <div key={day.value} className="grid grid-cols-[160px_100px_1fr_1fr] gap-3 items-center rounded-xl border p-3">
                    <p className="text-sm font-medium text-foreground">{day.label}</p>
                    <Select
                      value={row.isActive ? 'active' : 'inactive'}
                      onValueChange={(value) => setAvailabilityDraft((current) => ({
                        ...current,
                        [day.value]: {
                          ...row,
                          isActive: value === 'active',
                        },
                      }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="inactive">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="time"
                      value={row.start}
                      disabled={!row.isActive}
                      onChange={(event) => setAvailabilityDraft((current) => ({
                        ...current,
                        [day.value]: { ...row, start: event.target.value },
                      }))}
                    />
                    <Input
                      type="time"
                      value={row.end}
                      disabled={!row.isActive}
                      onChange={(event) => setAvailabilityDraft((current) => ({
                        ...current,
                        [day.value]: { ...row, end: event.target.value },
                      }))}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setAvailabilityDialogOpen(false)}>
                Fechar
              </BrandButton>
              <BrandButton className="flex-1" onClick={() => saveAvailabilityMutation.mutate()} disabled={saveAvailabilityMutation.isPending}>
                {saveAvailabilityMutation.isPending ? 'Salvando...' : 'Salvar disponibilidade'}
              </BrandButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={blocksDialogOpen} onOpenChange={setBlocksDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bloqueios de agenda</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            <div className="rounded-2xl border p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Novo bloqueio</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Profissional</Label>
                  <Select value={blockProfessional} onValueChange={setBlockProfessional}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Bloqueio geral</SelectItem>
                      {professionals.map((professional) => (
                        <SelectItem key={professional.user_id} value={professional.user_id}>
                          {professional.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Motivo</Label>
                  <Input value={blockReason} onChange={(event) => setBlockReason(event.target.value)} placeholder="Ex.: reunião interna, manutenção..." />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-2">
                  <Label>Início</Label>
                  <Input type="date" value={blockStartDate} onChange={(event) => setBlockStartDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hora</Label>
                  <Input type="time" value={blockStartTime} onChange={(event) => setBlockStartTime(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Fim</Label>
                  <Input type="date" value={blockEndDate} onChange={(event) => setBlockEndDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hora</Label>
                  <Input type="time" value={blockEndTime} onChange={(event) => setBlockEndTime(event.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea value={blockNotes} onChange={(event) => setBlockNotes(event.target.value)} rows={3} />
              </div>
              <div className="flex justify-end">
                <BrandButton onClick={() => createBlockMutation.mutate()} disabled={createBlockMutation.isPending}>
                  {createBlockMutation.isPending ? 'Salvando...' : 'Criar bloqueio'}
                </BrandButton>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Bloqueios cadastrados</h3>
              {appointmentBlocks.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhum bloqueio encontrado para o período.
                </div>
              ) : (
                appointmentBlocks.map((block) => (
                  <div key={block.id} className="rounded-xl border p-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{block.reason || 'Bloqueio'}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {format(new Date(block.start_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} - {format(new Date(block.end_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {block.professional_id ? getProfessionalLabel(block.professional_id) : 'Bloqueio geral'}
                      </p>
                      {block.notes && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{block.notes}</p>}
                    </div>
                    <BrandButton size="sm" variant="outline" onClick={() => deleteBlockMutation.mutate(block.id)}>
                      <Trash2 className="w-4 h-4" />
                    </BrandButton>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <QuickPatientModal
        open={quickPatientOpen}
        onOpenChange={setQuickPatientOpen}
        onCreated={(patient) => setSelectedPatient(patient.id)}
      />
    </div>
  );
}
