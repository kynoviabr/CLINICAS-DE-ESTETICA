import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
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
import { Plus, ChevronLeft, ChevronRight, Check, X, AlertTriangle, ClipboardList, UserPlus, CalendarCheck2, Clock3, CheckCircle2 } from 'lucide-react';
import QuickPatientModal from '@/components/patient/QuickPatientModal';
import { AnamneseAlertBanner } from '@/components/anamnese/AnamneseAlertBanner';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek,
  isSameMonth, isSameDay, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  startOfDay, endOfDay
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

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
  in_progress: { label: 'Em andamento', badge: 'in_progress', style: 'border-l-4 border-l-info' },
};

type ViewMode = 'month' | 'week' | 'day';

export default function AppointmentsPage() {
  const { clinicId } = useBranding();
  const { user } = useAuth();
  const { role } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewAppt, setViewAppt] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [selectedTreatment, setSelectedTreatment] = useState('');
  const [selectedProfessional, setSelectedProfessional] = useState('');
  const [filterProfessional, setFilterProfessional] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [duration, setDuration] = useState('60');
  const [notes, setNotes] = useState('');
  const [quickPatientOpen, setQuickPatientOpen] = useState(false);

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
      const { data } = await supabase
        .from('appointments')
        .select('*, patients(full_name, dissatisfaction_flag, dissatisfaction_level, dissatisfaction_reason), treatments(name)')
        .eq('clinic_id', clinicId!)
        .gte('start_time', rangeStart.toISOString())
        .lte('start_time', rangeEnd.toISOString())
        .order('start_time');
      return data || [];
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

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments-select', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatments').select('id, name, duration_minutes').eq('clinic_id', clinicId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: professionals = [] } = useQuery({
    queryKey: ['professionals', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('user_id, role').eq('clinic_id', clinicId!).eq('is_active', true)
        .in('role', ['admin', 'professional']);
      return (data || []).map((r, i) => ({
        ...r,
        color: professionalColors[i % professionalColors.length],
        displayName: `Profissional ${i + 1}`,
      }));
    },
    enabled: !!clinicId,
  });

  const getSelectedPatientData = (patientId: string) => patients.find((p: any) => p.id === patientId);

  const getProfColor = (profId: string | null) => {
    if (!profId) return professionalColors[0];
    const prof = professionals.find(p => p.user_id === profId);
    return prof?.color || professionalColors[0];
  };

  const filteredAppointments = useMemo(() => {
    let filtered = appointments;
    if (isProfessional && user) {
      filtered = filtered.filter((a: any) => a.professional_id === user.id);
    } else if (filterProfessional !== 'all') {
      filtered = filtered.filter((a: any) => a.professional_id === filterProfessional);
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter((a: any) => a.status === filterStatus);
    }
    return filtered;
  }, [appointments, filterProfessional, filterStatus, isProfessional, user]);

  const operationalSummary = useMemo(() => {
    const todayAppointments = filteredAppointments.filter((appointment: any) =>
      isSameDay(new Date(appointment.start_time), new Date())
    );
    const readyForSession = todayAppointments.filter((appointment: any) =>
      appointment.status === 'confirmed' || appointment.status === 'in_progress'
    );

    return {
      totalInView: filteredAppointments.length,
      today: todayAppointments.length,
      readyForSession: readyForSession.length,
      noShow: filteredAppointments.filter((appointment: any) => appointment.status === 'no_show').length,
    };
  }, [filteredAppointments]);

  const todayQueue = useMemo(() => {
    return filteredAppointments
      .filter((appointment: any) => isSameDay(new Date(appointment.start_time), new Date()))
      .sort((a: any, b: any) => +new Date(a.start_time) - +new Date(b.start_time))
      .slice(0, 5);
  }, [filteredAppointments]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const startTime = new Date(`${selectedDate}T${selectedTime}:00`);
      const endTime = new Date(startTime.getTime() + parseInt(duration) * 60000);
      const profId = isProfessional ? user?.id : (selectedProfessional || null);
      const { error } = await supabase.from('appointments').insert({
        clinic_id: clinicId!,
        patient_id: selectedPatient,
        treatment_id: selectedTreatment || null,
        professional_id: profId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setDialogOpen(false);
      resetForm();
      toast({ title: 'Agendamento criado!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('appointments').update({ status: status as any }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setViewAppt(null);
      toast({ title: 'Status atualizado!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const resetForm = () => {
    setSelectedPatient('');
    setSelectedTreatment('');
    setSelectedProfessional('');
    setDuration('60');
    setNotes('');
  };

  const navigate_ = (dir: number) => {
    if (viewMode === 'month') setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(dir > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1));
  };

  const getApptsForDay = (day: Date) => filteredAppointments.filter((a: any) => isSameDay(new Date(a.start_time), day));
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const headerLabel = viewMode === 'month'
    ? format(currentDate, 'MMMM yyyy', { locale: ptBR })
    : viewMode === 'week'
    ? `${format(rangeStart, 'dd/MM', { locale: ptBR })} - ${format(rangeEnd, 'dd/MM/yyyy', { locale: ptBR })}`
    : format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR });

  return (
    <div>
      <PageHeader title="Agenda" description="Gerencie os agendamentos da clínica">
        <BrandButton onClick={() => { setSelectedDate(format(new Date(), 'yyyy-MM-dd')); resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Novo Agendamento
        </BrandButton>
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
          {!isProfessional && (
            <Select value={filterProfessional} onValueChange={setFilterProfessional}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todos profissionais" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os profissionais</SelectItem>
                {professionals.map(p => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ background: p.color }} />
                      {p.displayName}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[190px]"><SelectValue placeholder="Todos status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="scheduled">Agendado</SelectItem>
              <SelectItem value="confirmed">Confirmado</SelectItem>
              <SelectItem value="in_progress">Em andamento</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
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
          </div>
          <div className="space-y-2">
            {todayQueue.map((appointment: any) => (
              <div key={appointment.id} className="rounded-lg border bg-background px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">{(appointment.patients as any)?.full_name}</p>
                    <BrandBadge status={statusConfig[appointment.status]?.badge || 'default'}>
                      {statusConfig[appointment.status]?.label || appointment.status}
                    </BrandBadge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(appointment.start_time), "HH:mm", { locale: ptBR })} · {(appointment.treatments as any)?.name || 'Sem tratamento'}
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <BrandButton size="sm" variant="outline" onClick={() => setViewAppt(appointment)}>
                    Ver
                  </BrandButton>
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
        </div>
      )}

      {/* Professional legend */}
      {!isProfessional && professionals.length > 0 && viewMode !== 'day' && (
        <div className="flex flex-wrap gap-3 mb-4">
          {professionals.map(p => (
            <span key={p.user_id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded-full" style={{ background: p.color }} />
              {p.displayName}
            </span>
          ))}
        </div>
      )}

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
                  <div className="space-y-0.5 mt-1">
                    {dayAppts.slice(0, 3).map((a: any) => (
                      <div
                        key={a.id}
                        className={`text-[10px] px-1 py-0.5 rounded text-white truncate cursor-pointer ${statusConfig[a.status]?.style || ''}`}
                        style={{ backgroundColor: getProfColor(a.professional_id) }}
                        onClick={e => { e.stopPropagation(); setViewAppt(a); }}
                      >
                        {format(new Date(a.start_time), 'HH:mm')} {(a.patients as any)?.full_name?.split(' ')[0]}
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
              const isToday = isSameDay(day, new Date());
              return (
                <div key={i} className="border-r min-h-[300px]">
                  <div className={`px-2 py-2 text-center border-b ${isToday ? 'bg-primary/10' : 'bg-secondary/50'}`}>
                    <div className="text-xs text-muted-foreground">{dayNames[i]}</div>
                    <div className={`text-sm font-semibold ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</div>
                  </div>
                  <div className="p-1 space-y-1">
                    {dayAppts.map((a: any) => (
                      <div
                        key={a.id}
                        className={`text-xs p-1.5 rounded text-white cursor-pointer ${statusConfig[a.status]?.style || ''}`}
                        style={{ backgroundColor: getProfColor(a.professional_id) }}
                        onClick={() => setViewAppt(a)}
                      >
                        <div className="font-semibold">{format(new Date(a.start_time), 'HH:mm')}</div>
                        <div className="truncate">{(a.patients as any)?.full_name}</div>
                        <div className="truncate opacity-80">{(a.treatments as any)?.name}</div>
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
          {getApptsForDay(currentDate).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum agendamento neste dia</p>
          ) : (
            <div className="space-y-3">
              {getApptsForDay(currentDate).map((a: any) => {
                const sc = statusConfig[a.status];
                return (
                  <div
                    key={a.id}
                    className={`p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${sc?.style || ''}`}
                    onClick={() => setViewAppt(a)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{(a.patients as any)?.full_name}</p>
                        <p className="text-sm text-muted-foreground">{(a.treatments as any)?.name || 'Sem tratamento'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">{format(new Date(a.start_time), 'HH:mm')} - {format(new Date(a.end_time), 'HH:mm')}</p>
                        <BrandBadge status={sc?.badge || 'default'}>{sc?.label || a.status}</BrandBadge>
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
              <Label>Paciente *</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                    <SelectTrigger><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                    <SelectContent>{patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
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
            <div className="space-y-2">
              <Label>Tratamento</Label>
              <Select value={selectedTreatment} onValueChange={v => {
                setSelectedTreatment(v);
                const t = treatments.find((tr: any) => tr.id === v);
                if (t) setDuration(String(t.duration_minutes));
              }}>
                <SelectTrigger><SelectValue placeholder="Selecionar tratamento" /></SelectTrigger>
                <SelectContent>{treatments.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {!isProfessional && (
              <div className="space-y-2">
                <Label>Profissional</Label>
                <Select value={selectedProfessional} onValueChange={setSelectedProfessional}>
                  <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
                  <SelectContent>
                    {professionals.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.displayName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

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
              <BrandButton type="submit" className="flex-1" disabled={createMutation.isPending || !selectedPatient}>
                {createMutation.isPending ? 'Criando...' : 'Agendar'}
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
                  return <AnamneseAlertBanner status={p?.current_anamnese_status} expiresAt={p?.current_anamnese_expires_at} patientId={viewAppt.patient_id} patientName={(viewAppt.patients as any)?.full_name} showActions={false} />;
                })()}
                {(viewAppt.patients as any)?.dissatisfaction_flag && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive bg-destructive/5">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-destructive">Paciente insatisfeito — {(viewAppt.patients as any)?.dissatisfaction_level || 'N/A'}</p>
                      {(viewAppt.patients as any)?.dissatisfaction_reason && <p className="text-xs text-muted-foreground">{(viewAppt.patients as any).dissatisfaction_reason}</p>}
                    </div>
                  </div>
                )}
                <div className="text-sm space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Paciente:</span><span className="font-medium">{(viewAppt.patients as any)?.full_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tratamento:</span><span className="font-medium">{(viewAppt.treatments as any)?.name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Horário:</span><span className="font-medium">{format(new Date(viewAppt.start_time), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - {format(new Date(viewAppt.end_time), 'HH:mm')}</span></div>
                  <div className="flex justify-between items-center"><span className="text-muted-foreground">Status:</span><BrandBadge status={statusConfig[viewAppt.status]?.badge || 'default'}>{statusConfig[viewAppt.status]?.label || viewAppt.status}</BrandBadge></div>
                  {viewAppt.notes && <div><span className="text-muted-foreground">Notas:</span><p className="mt-1">{viewAppt.notes}</p></div>}
                </div>

                <div className="flex flex-wrap gap-2 pt-4 border-t">
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
                  {(viewAppt.status === 'scheduled' || viewAppt.status === 'confirmed') && (
                    <>
                      <BrandButton size="sm" variant="outline" className="text-destructive" onClick={() => updateStatusMutation.mutate({ id: viewAppt.id, status: 'cancelled' })}>
                        <X className="w-4 h-4" /> Cancelar
                      </BrandButton>
                      <BrandButton size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: viewAppt.id, status: 'no_show' })}>
                        <AlertTriangle className="w-4 h-4" /> Não compareceu
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
              </div>
            </>
          )}
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
