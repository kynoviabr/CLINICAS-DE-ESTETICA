import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { PageHeader } from '@/components/ui/page-header';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Plus, ClipboardList, AlertTriangle } from 'lucide-react';
import { AnamneseAlertBanner } from '@/components/anamnese/AnamneseAlertBanner';

export default function SessionsPage() {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ patient_id: '', treatment_id: '', session_number: '1', total_sessions: '1', notes: '', products_used: '', observations: '' });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions', clinicId],
    queryFn: async () => {
      const { data } = await supabase
        .from('session_records')
        .select('*, patients(full_name, dissatisfaction_flag, dissatisfaction_level), treatments(name)')
        .eq('clinic_id', clinicId!)
        .order('performed_at', { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients-sel', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('patients').select('id, full_name, current_anamnese_status, current_anamnese_expires_at').eq('clinic_id', clinicId!).eq('status', 'active').order('full_name');
      return data || [];
    },
    enabled: !!clinicId,
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ['treatments-sel', clinicId],
    queryFn: async () => {
      const { data } = await supabase.from('treatments').select('id, name').eq('clinic_id', clinicId!).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!clinicId,
  });



  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('session_records').insert({
        clinic_id: clinicId!,
        patient_id: form.patient_id,
        treatment_id: form.treatment_id || null,
        session_number: parseInt(form.session_number) || 1,
        total_sessions: parseInt(form.total_sessions) || 1,
        notes: form.notes || null,
        products_used: form.products_used || null,
        observations: form.observations || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      setDialogOpen(false);
      toast({ title: 'Sessão registrada!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  return (
    <div>
      <PageHeader title="Sessões" description="Registro de sessões e procedimentos">
        <BrandButton onClick={() => { setForm({ patient_id: '', treatment_id: '', session_number: '1', total_sessions: '1', notes: '', products_used: '', observations: '' }); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Registrar Sessão
        </BrandButton>
      </PageHeader>

      {isLoading && <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>}

      {!isLoading && sessions.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nenhuma sessão registrada</h3>
          <p className="text-sm text-muted-foreground mb-4">Registre a primeira sessão de um paciente</p>
        </div>
      )}

      {!isLoading && sessions.length > 0 && (
        <div className="space-y-3">
          {sessions.map((s: any) => (
            <Card key={s.id} className="shadow-card animate-fade-in">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{(s.patients as any)?.full_name}</p>
                      {(s.patients as any)?.dissatisfaction_flag && (
                        <span className="flex items-center gap-1 text-xs text-destructive font-medium"><AlertTriangle className="w-3.5 h-3.5" />Insatisfeito</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(s.treatments as any)?.name || 'Tratamento'} · Sessão {s.session_number}/{s.total_sessions}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(s.performed_at).toLocaleDateString('pt-BR')}</span>
                </div>
                {s.notes && <p className="text-sm text-muted-foreground mt-2 border-t pt-2">{s.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Registrar Sessão</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Paciente *</Label>
              <Select value={form.patient_id} onValueChange={v => setForm({ ...form, patient_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                <SelectContent>
                  {patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.patient_id && (() => {
              const p = patients.find((pt: any) => pt.id === form.patient_id);
              return p ? <AnamneseAlertBanner status={p.current_anamnese_status} expiresAt={p.current_anamnese_expires_at} patientId={p.id} patientName={p.full_name} /> : null;
            })()}
            <div className="space-y-2">
              <Label>Tratamento</Label>
              <Select value={form.treatment_id} onValueChange={v => setForm({ ...form, treatment_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {treatments.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nº da sessão</Label>
                <Input type="number" value={form.session_number} onChange={e => setForm({ ...form, session_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Total de sessões</Label>
                <Input type="number" value={form.total_sessions} onChange={e => setForm({ ...form, total_sessions: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas do procedimento</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Produtos utilizados</Label>
              <Input value={form.products_used} onChange={e => setForm({ ...form, products_used: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Observações / Recomendações</Label>
              <Textarea value={form.observations} onChange={e => setForm({ ...form, observations: e.target.value })} rows={2} />
            </div>
            <div className="flex gap-3 pt-2">
              <BrandButton type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</BrandButton>
              <BrandButton type="submit" className="flex-1" disabled={createMutation.isPending || !form.patient_id}>
                {createMutation.isPending ? 'Salvando...' : 'Registrar'}
              </BrandButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
