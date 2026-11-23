import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useToast } from '@/hooks/use-toast';
import { useAgendaProfessionals } from '@/hooks/useAgendaProfessionals';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSearchParams } from 'react-router-dom';
import type { Database } from '@/integrations/supabase/types';

type SessionForm = {
  appointment_id: string;
  patient_id: string;
  treatment_id: string;
  notes: string;
  products_used: string;
  observations: string;
};

type SessionSummaryRow = {
  key: string;
  patientId: string;
  patientName: string;
  treatmentId: string | null;
  treatmentName: string;
  contracted: number;
  performed: number;
  balance: number;
  lastPerformedAt: string | null;
};
type SessionRecordRow = Database['public']['Tables']['session_records']['Row'] & {
  patients?: { full_name?: string | null; dissatisfaction_flag?: boolean | null; dissatisfaction_level?: string | null } | null;
  treatments?: { name?: string | null } | null;
  appointments?: { start_time?: string | null } | null;
};
type PatientRow = Pick<Database['public']['Tables']['patients']['Row'], 'id' | 'full_name' | 'current_anamnese_status' | 'current_anamnese_expires_at'>;
type TreatmentRow = Pick<Database['public']['Tables']['treatments']['Row'], 'id' | 'name' | 'num_sessions' | 'duration_minutes'>;
type AvailabilityRow = Database['public']['Tables']['professional_availability']['Row'];
type BlockRow = Database['public']['Tables']['appointment_blocks']['Row'];
type AppointmentRow = Pick<Database['public']['Tables']['appointments']['Row'], 'id' | 'patient_id' | 'treatment_id' | 'professional_id' | 'start_time' | 'status'> & {
  patients?: { full_name?: string | null } | null;
  treatments?: { name?: string | null } | null;
};
type ContractRow = Pick<Database['public']['Tables']['contracts']['Row'], 'id' | 'patient_id' | 'proposal_id' | 'status'>;
type ProposalItemRow = Pick<Database['public']['Tables']['proposal_items']['Row'], 'proposal_id' | 'quantity' | 'treatment_id'> & {
  treatments?: { name?: string | null; num_sessions?: number | null } | null;
};
type RenewalTaskRow = {
  id: string;
  patient_id: string;
  treatment_id: string;
  status: 'pending' | 'contacted' | 'revaluation_scheduled' | 'snoozed' | 'converted' | 'discarded';
};

const emptyForm: SessionForm = {
  appointment_id: 'manual',
  patient_id: '',
  treatment_id: '',
  notes: '',
  products_used: '',
  observations: '',
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

/** Estado, dados e ações da tela (a tela em SessionsPage.tsx só desenha). */
export function useSessionsPage() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [form, setForm] = useState<SessionForm>(emptyForm);
  const [plannerTarget, setPlannerTarget] = useState<SessionSummaryRow | null>(null);
  const [plannerStartDate, setPlannerStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [plannerTime, setPlannerTime] = useState('09:00');
  const [plannerIntervalDays, setPlannerIntervalDays] = useState('7');
  const [plannerCount, setPlannerCount] = useState('1');
  const [plannerProfessional, setPlannerProfessional] = useState('unassigned');
  const [plannerNotes, setPlannerNotes] = useState('');
  const [renewalOnly, setRenewalOnly] = useState(false);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_records')
        .select('*, patients(full_name, dissatisfaction_flag, dissatisfaction_level), treatments(name), appointments(start_time)')
        .eq('clinic_id', clinicId!)
        .order('performed_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients-sessions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('id, full_name, current_anamnese_status, current_anamnese_expires_at')
        .eq('clinic_id', clinicId!)
        .eq('status', 'active')
        .order('full_name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments-sessions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('treatments')
        .select('id, name, num_sessions, duration_minutes')
        .eq('clinic_id', clinicId!)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { professionals, allProfessionals } = useAgendaProfessionals(clinicId);

  const { data: availability = [] } = useQuery({
    queryKey: ['professional-availability-sessions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('professional_availability')
        .select('*')
        .eq('clinic_id', clinicId!)
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: appointmentBlocks = [] } = useQuery({
    queryKey: ['appointment-blocks-sessions', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointment_blocks')
        .select('*')
        .eq('clinic_id', clinicId!)
        .gte('end_at', new Date().toISOString())
        .order('start_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['session-appointments', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, patient_id, treatment_id, professional_id, start_time, status, patients(full_name), treatments(name)')
        .eq('clinic_id', clinicId!)
        .in('status', ['confirmed', 'in_progress', 'completed'])
        .order('start_time', { ascending: false })
        .limit(150);

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['session-contracts', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, patient_id, proposal_id, status')
        .eq('clinic_id', clinicId!)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: proposalItems = [] } = useQuery({
    queryKey: ['session-proposal-items', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposal_items')
        .select('proposal_id, quantity, treatment_id, treatments(name, num_sessions)');

      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: renewalTasks = [] } = useQuery({
    queryKey: ['sessions-renewal-tasks', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_renewal_tasks_active' as never)
        .select('id, patient_id, treatment_id, status')
        .eq('clinic_id', clinicId!);
      if (error) throw error;
      return ((data || [])) as RenewalTaskRow[];
    },
    enabled: !!clinicId,
  });

  const sessionByAppointmentId = useMemo(() => {
    const map = new Map<string, SessionRecordRow>();
    sessions.forEach((session: SessionRecordRow) => {
      if (session.appointment_id) map.set(session.appointment_id, session);
    });
    return map;
  }, [sessions]);

  const availableAppointments = useMemo(
    () => appointments.filter((appointment: AppointmentRow) => !sessionByAppointmentId.has(appointment.id)),
    [appointments, sessionByAppointmentId]
  );

  const summaryRows = useMemo<SessionSummaryRow[]>(() => {
    const patientNameMap = new Map<string, string>();
    patients.forEach((patient: PatientRow) => {
      patientNameMap.set(patient.id, patient.full_name);
    });

    const treatmentMap = new Map<string, { name: string; num_sessions: number }>();
    treatments.forEach((treatment: TreatmentRow) => {
      treatmentMap.set(treatment.id, {
        name: treatment.name,
        num_sessions: Number(treatment.num_sessions || 1),
      });
    });

    const proposalItemsByProposal = new Map<string, ProposalItemRow[]>();
    proposalItems.forEach((item: ProposalItemRow) => {
      const current = proposalItemsByProposal.get(item.proposal_id) || [];
      current.push(item);
      proposalItemsByProposal.set(item.proposal_id, current);
    });

    const summaryMap = new Map<string, SessionSummaryRow>();

    const ensureRow = (patientId: string, treatmentId: string | null, treatmentName?: string) => {
      const key = `${patientId}:${treatmentId || 'none'}`;
      const existing = summaryMap.get(key);
      if (existing) return existing;

      const row: SessionSummaryRow = {
        key,
        patientId,
        patientName: patientNameMap.get(patientId) || 'Paciente',
        treatmentId,
        treatmentName:
          treatmentName ||
          (treatmentId ? treatmentMap.get(treatmentId)?.name || 'Tratamento' : 'Sem tratamento'),
        contracted: 0,
        performed: 0,
        balance: 0,
        lastPerformedAt: null,
      };
      summaryMap.set(key, row);
      return row;
    };

    contracts.forEach((contract: ContractRow) => {
      if (!contract.proposal_id) return;
      const items = proposalItemsByProposal.get(contract.proposal_id) || [];
      items.forEach((item: ProposalItemRow) => {
        const treatmentId = item.treatment_id || null;
        const treatmentInfo = treatmentId ? treatmentMap.get(treatmentId) : null;
        const sessionsPerItem = Number(item.quantity || 1) * Number(treatmentInfo?.num_sessions || 1);
        const row = ensureRow(contract.patient_id, treatmentId, treatmentInfo?.name);
        row.contracted += sessionsPerItem;
      });
    });

    sessions.forEach((session: SessionRecordRow) => {
      const treatmentId = session.treatment_id || null;
      const treatmentName = session.treatments?.name || (treatmentId ? treatmentMap.get(treatmentId)?.name : undefined);
      const row = ensureRow(session.patient_id, treatmentId, treatmentName);
      row.performed += 1;
      if (!row.lastPerformedAt || new Date(session.performed_at) > new Date(row.lastPerformedAt)) {
        row.lastPerformedAt = session.performed_at;
      }
    });

    return Array.from(summaryMap.values())
      .map((row) => ({ ...row, balance: Math.max(row.contracted - row.performed, 0) }))
      .sort((a, b) => {
        if (b.balance !== a.balance) return b.balance - a.balance;
        if (b.contracted !== a.contracted) return b.contracted - a.contracted;
        return a.patientName.localeCompare(b.patientName);
      });
  }, [contracts, patients, proposalItems, sessions, treatments]);

  const renewalTaskKeys = useMemo(() => {
    const keys = new Set<string>();
    renewalTasks.forEach((task) => {
      const treatmentKey = task.treatment_id || 'none';
      keys.add(`${task.patient_id}:${treatmentKey}`);
      keys.add(`${task.patient_id}:none`);
    });
    return keys;
  }, [renewalTasks]);

  const filteredSummaryRows = useMemo(() => {
    return summaryRows.filter((row) => {
      const normalizedSearch = search.trim().toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        row.patientName.toLowerCase().includes(normalizedSearch) ||
        row.treatmentName.toLowerCase().includes(normalizedSearch);

      if (!matchesSearch) return false;

      if (balanceFilter === 'with_balance') return row.balance > 0;
      if (balanceFilter === 'completed') return row.contracted > 0 && row.balance === 0;
      if (balanceFilter === 'no_contract') return row.contracted === 0;
      if (balanceFilter === 'renewal_window') return renewalTaskKeys.has(row.key);
      return true;
    });
  }, [balanceFilter, search, summaryRows, renewalTaskKeys]);

  const contractedTreatmentsByPatient = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    summaryRows.forEach((row) => {
      if (!row.patientId || !row.treatmentId || row.contracted <= 0) return;
      const current = map.get(row.patientId) || [];
      if (!current.some((item) => item.id === row.treatmentId)) {
        current.push({ id: row.treatmentId, name: row.treatmentName });
      }
      map.set(row.patientId, current);
    });
    map.forEach((items, patientId) => {
      map.set(
        patientId,
        items.sort((a, b) => a.name.localeCompare(b.name))
      );
    });
    return map;
  }, [summaryRows]);

  useEffect(() => {
    setRenewalOnly(balanceFilter === 'renewal_window');
  }, [balanceFilter]);

  const selectedAppointment =
    form.appointment_id !== 'manual'
      ? availableAppointments.find((appointment: AppointmentRow) => appointment.id === form.appointment_id)
      : null;

  useEffect(() => {
    const appointmentId = searchParams.get('appointmentId');
    if (!appointmentId || availableAppointments.length === 0) return;

    const appointment = availableAppointments.find((item: AppointmentRow) => item.id === appointmentId);
    if (!appointment) return;

    setForm((current) => ({
      ...current,
      appointment_id: appointment.id,
      patient_id: '',
      treatment_id: '',
    }));
    setDialogOpen(true);
  }, [availableAppointments, searchParams]);

  const selectedPatientId = selectedAppointment?.patient_id || form.patient_id;
  const selectedTreatmentId = selectedAppointment?.treatment_id || form.treatment_id || null;
  const selectedPatient = patients.find((patient: PatientRow) => patient.id === selectedPatientId);
  const manualTreatmentOptions = useMemo(
    () => (form.patient_id ? contractedTreatmentsByPatient.get(form.patient_id) || [] : []),
    [contractedTreatmentsByPatient, form.patient_id]
  );

  useEffect(() => {
    if (form.appointment_id !== 'manual') return;
    if (!form.patient_id) return;
    if (!form.treatment_id) return;
    const allowed = (contractedTreatmentsByPatient.get(form.patient_id) || []).some((item) => item.id === form.treatment_id);
    if (!allowed) {
      setForm((current) => ({ ...current, treatment_id: '' }));
    }
  }, [contractedTreatmentsByPatient, form.appointment_id, form.patient_id, form.treatment_id]);

  const currentFlowSummary = useMemo(() => {
    if (!selectedPatientId) return null;
    const key = `${selectedPatientId}:${selectedTreatmentId || 'none'}`;
    return summaryRows.find((row) => row.key === key) || null;
  }, [selectedPatientId, selectedTreatmentId, summaryRows]);

  const getProfessionalLabel = (professionalId?: string | null) => {
    if (!professionalId) return 'Não atribuído';
    return allProfessionals.find((professional) => professional.id === professionalId)?.label || 'Profissional';
  };

  const hasAvailabilityWindow = (professionalId: string, startTime: Date, endTime: Date) => {
    const dayOfWeek = startTime.getDay();
    const slots = availability.filter((slot: AvailabilityRow) => slot.professional_id === professionalId && slot.day_of_week === dayOfWeek && slot.is_active);
    if (slots.length === 0) return false;

    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
    return slots.some((slot: AvailabilityRow) => {
      const [startHour, startMinute] = String(slot.start_time).slice(0, 5).split(':').map(Number);
      const [endHour, endMinute] = String(slot.end_time).slice(0, 5).split(':').map(Number);
      const slotStartMinutes = startHour * 60 + startMinute;
      const slotEndMinutes = endHour * 60 + endMinute;
      return startMinutes >= slotStartMinutes && endMinutes <= slotEndMinutes;
    });
  };

  const hasBlockConflict = (professionalId: string, startTime: Date, endTime: Date) => {
    return appointmentBlocks.some((block: BlockRow) => {
      const applies = !block.professional_id || block.professional_id === professionalId;
      if (!applies) return false;
      return startTime < new Date(block.end_at) && endTime > new Date(block.start_at);
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const appointment = selectedAppointment;
      const patientId = appointment?.patient_id || form.patient_id;
      const treatmentId = appointment?.treatment_id || form.treatment_id || null;

      if (!patientId) throw new Error('Selecione um paciente');
      if (!treatmentId) throw new Error('Selecione um tratamento');

      const summaryKey = `${patientId}:${treatmentId || 'none'}`;
      const summary = summaryRows.find((row) => row.key === summaryKey);
      if (!summary || summary.contracted <= 0) {
        throw new Error('Este tratamento não está contratado para o paciente selecionado.');
      }
      const nextSessionNumber = summary ? summary.performed + 1 : 1;
      const totalSessions = summary?.contracted || Math.max(summary?.performed || 0, nextSessionNumber);

      const insertPayload = {
        clinic_id: clinicId!,
        appointment_id: appointment?.id || null,
        patient_id: patientId,
        treatment_id: treatmentId,
        professional_id: appointment?.professional_id || null,
        session_number: nextSessionNumber,
        total_sessions: totalSessions,
        notes: form.notes || null,
        products_used: form.products_used || null,
        observations: form.observations || null,
        performed_at: appointment?.start_time || new Date().toISOString(),
      };

      const { error } = await supabase.from('session_records').insert(insertPayload);
      if (error) throw error;

      if (appointment && appointment.status !== 'completed') {
        const { error: appointmentError } = await supabase
          .from('appointments')
          .update({ status: 'completed' })
          .eq('id', appointment.id);

        if (appointmentError) throw appointmentError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['session-appointments'] });
      qc.invalidateQueries({ queryKey: ['patient-sessions'] });
      setDialogOpen(false);
      setForm(emptyForm);
      toast({ title: 'Sessão registrada com sucesso!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err instanceof Error ? err.message : 'Erro ao registrar sessão', variant: 'destructive' });
    },
  });

  const plannerMutation = useMutation({
    mutationFn: async () => {
      if (!plannerTarget || !clinicId) throw new Error('Selecione um tratamento para planejar.');
      if (!plannerProfessional || plannerProfessional === 'unassigned') throw new Error('Selecione um profissional.');
      if (!plannerStartDate || !plannerTime) throw new Error('Defina a data e o horário iniciais.');

      const count = Math.max(1, Math.min(parseInt(plannerCount) || 1, plannerTarget.balance || 1));
      const intervalDays = Math.max(1, parseInt(plannerIntervalDays) || 7);
      const treatment = treatments.find((item: TreatmentRow) => item.id === plannerTarget.treatmentId);
      const durationMinutes = Number(treatment?.duration_minutes || 60);
      const batchId = crypto.randomUUID();
      const pendingRows: Array<Database['public']['Tables']['appointments']['Insert']> = [];

      for (let index = 0; index < count; index += 1) {
        const startTime = new Date(`${plannerStartDate}T${plannerTime}:00`);
        startTime.setDate(startTime.getDate() + index * intervalDays);
        const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

        if (!hasAvailabilityWindow(plannerProfessional, startTime, endTime)) {
          const dayLabel = weekDays.find((day) => day.value === startTime.getDay())?.label || 'dia';
          throw new Error(`O profissional está fora da disponibilidade em ${dayLabel}, ${format(startTime, 'dd/MM HH:mm', { locale: ptBR })}.`);
        }

        if (hasBlockConflict(plannerProfessional, startTime, endTime)) {
          throw new Error(`Existe um bloqueio em ${format(startTime, 'dd/MM HH:mm', { locale: ptBR })}.`);
        }

        const { data: conflicts, error: conflictError } = await supabase.from('appointments')
          .select('id')
          .eq('clinic_id', clinicId)
          .eq('professional_id', plannerProfessional)
          .lt('start_time', endTime.toISOString())
          .gt('end_time', startTime.toISOString())
          .not('status', 'in', '(cancelled,rescheduled)');
        if (conflictError) throw conflictError;
        if ((conflicts || []).length > 0) {
          throw new Error(`Já existe outro atendimento em ${format(startTime, 'dd/MM HH:mm', { locale: ptBR })}.`);
        }

        pendingRows.push({
          clinic_id: clinicId,
          patient_id: plannerTarget.patientId,
          treatment_id: plannerTarget.treatmentId,
          professional_id: plannerProfessional,
          appointment_type: 'session',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          scheduled_at: startTime.toISOString(),
          duration_minutes: durationMinutes,
          status: 'scheduled',
          notes: plannerNotes.trim() || null,
          is_batch: true,
          batch_id: batchId,
        });
      }

      const { error } = await supabase.from('appointments').insert(pendingRows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['session-appointments'] });
      setPlannerOpen(false);
      setPlannerTarget(null);
      toast({ title: 'Sessões planejadas com sucesso!' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao planejar sessões', description: err instanceof Error ? err.message : 'Erro ao planejar sessões', variant: 'destructive' });
    },
  });

  const openDialog = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const registerFromSummary = (row: SessionSummaryRow) => {
    setForm({
      ...emptyForm,
      patient_id: row.patientId,
      treatment_id: row.treatmentId || '',
    });
    setDialogOpen(true);
  };

  const openPlanner = (row: SessionSummaryRow) => {
    setPlannerTarget(row);
    setPlannerStartDate(format(new Date(), 'yyyy-MM-dd'));
    setPlannerTime('09:00');
    setPlannerIntervalDays('7');
    setPlannerCount(String(Math.max(1, row.balance)));
    setPlannerProfessional('unassigned');
    setPlannerNotes('');
    setPlannerOpen(true);
  };

  return {
    clinicId,
    toast,
    qc,
    searchParams,
    dialogOpen,
    setDialogOpen,
    plannerOpen,
    setPlannerOpen,
    search,
    setSearch,
    balanceFilter,
    setBalanceFilter,
    form,
    setForm,
    plannerTarget,
    setPlannerTarget,
    plannerStartDate,
    setPlannerStartDate,
    plannerTime,
    setPlannerTime,
    plannerIntervalDays,
    setPlannerIntervalDays,
    plannerCount,
    setPlannerCount,
    plannerProfessional,
    setPlannerProfessional,
    plannerNotes,
    setPlannerNotes,
    renewalOnly,
    setRenewalOnly,
    sessions,
    isLoading,
    patients,
    treatments,
    professionals,
    allProfessionals,
    availability,
    appointmentBlocks,
    appointments,
    contracts,
    proposalItems,
    renewalTasks,
    sessionByAppointmentId,
    availableAppointments,
    summaryRows,
    renewalTaskKeys,
    filteredSummaryRows,
    contractedTreatmentsByPatient,
    selectedAppointment,
    selectedPatientId,
    selectedTreatmentId,
    selectedPatient,
    manualTreatmentOptions,
    currentFlowSummary,
    getProfessionalLabel,
    hasAvailabilityWindow,
    hasBlockConflict,
    createMutation,
    plannerMutation,
    openDialog,
    registerFromSummary,
    openPlanner,
  };
}
