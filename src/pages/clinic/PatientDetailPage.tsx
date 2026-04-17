import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
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
  MessageSquare, Star, ExternalLink, Loader2, AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

import PatientAnamneseTab from '@/components/anamnese/PatientAnamneseTab';
import { FileText as FileTextIcon } from 'lucide-react';

const typeLabels: Record<string, string> = { before: 'Antes', during: 'Durante', after: 'Depois', progress: 'Progresso' };
const typeColors: Record<string, string> = { before: 'bg-blue-100 text-blue-700', during: 'bg-yellow-100 text-yellow-700', after: 'bg-green-100 text-green-700', progress: 'bg-purple-100 text-purple-700' };

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clinicId: brandClinicId } = useBranding();
  const { clinicId } = useUserRole();
  const queryClient = useQueryClient();
  const [viewPhoto, setViewPhoto] = useState<any>(null);
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
    } catch (err: any) {
      toast.error(err.message || 'Erro ao conceder acesso');
    } finally {
      setGrantingAccess(false);
    }
  };

  // Group metrics by type for evolution chart
  const metricTypes = [...new Set(metrics.map((m: any) => m.metric_type))];
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
                {(() => {
                  const s = patient.current_anamnese_status;
                  const cfg: Record<string, { label: string; cls: string }> = {
                    valid: { label: 'Anamnese válida', cls: 'bg-green-100 text-green-700 border-green-200' },
                    expired: { label: 'Anamnese vencida', cls: 'bg-red-100 text-red-700 border-red-200' },
                    pending: { label: 'Anamnese pendente', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
                    none: { label: 'Sem anamnese', cls: 'bg-muted text-muted-foreground border-border' },
                  };
                  const c = cfg[s || 'none'] || cfg.none;
                  return <Badge variant="outline" className={c.cls}><FileTextIcon className="w-3 h-3 mr-1" />{c.label}</Badge>;
                })()}
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
            <CardHeader><CardTitle>Agendamentos</CardTitle></CardHeader>
            <CardContent>
              {appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum agendamento encontrado</p>
              ) : (
                <div className="space-y-3">
                  {appointments.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                      <div>
                        <p className="text-sm font-medium text-foreground">{a.treatments?.name || 'Tratamento'}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.start_time).toLocaleDateString('pt-BR')} às {new Date(a.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <BrandBadge status={a.status as BadgeStatus} />
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
            <CardHeader><CardTitle>Sessões Realizadas</CardTitle></CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma sessão registrada</p>
              ) : (
                <div className="space-y-3">
                  {sessions.map((s: any) => (
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
                const typeMetrics = metrics.filter((m: any) => m.metric_type === type);
                const chartData = typeMetrics.map((m: any) => ({
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
              {photos.map((p: any) => (
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
              {feedbacks.map((fb: any) => (
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
