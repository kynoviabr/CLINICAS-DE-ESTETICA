import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  clinicId: string;
}

const sourceOptions = [
  { value: 'digital', label: 'Digital' },
  { value: 'portal', label: 'Portal do paciente' },
  { value: 'manual_upload', label: 'Upload manual' },
  { value: 'internal_manual', label: 'Preenchimento interno' },
];

export default function NewAnamneseModal({ open, onOpenChange, patientId, clinicId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: '',
    description: '',
    source_type: 'digital',
    filled_at: '',
    validity_days: '180',
    notes: '',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const validityDays = parseInt(form.validity_days);
      if (!validityDays || validityDays < 1) throw new Error('Validade deve ser no mínimo 1 dia');
      const payload: Record<string, any> = {
        clinic_id: clinicId,
        patient_id: patientId,
        title: form.title.trim() || null,
        description: form.description.trim() || null,
        source_type: form.source_type,
        validity_days: validityDays,
        notes: form.notes.trim() || null,
        status: 'pending',
        created_by: user?.id,
      };
      if (form.filled_at) {
        payload.filled_at = new Date(form.filled_at).toISOString();
      }
      const { error } = await supabase.from('patient_anamneses').insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-anamneses', patientId] });
      qc.invalidateQueries({ queryKey: ['patient', patientId] });
      toast.success('Anamnese criada com sucesso!');
      onOpenChange(false);
      setForm({ title: '', description: '', source_type: 'digital', filled_at: '', validity_days: '180', notes: '' });
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao criar anamnese'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Anamnese</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Anamnese inicial" />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Descrição breve" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select value={form.source_type} onValueChange={v => setForm({ ...form, source_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sourceOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Validade (dias)</Label>
              <Input type="number" min="1" value={form.validity_days} onChange={e => setForm({ ...form, validity_days: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Data de preenchimento</Label>
            <Input type="datetime-local" value={form.filled_at} onChange={e => setForm({ ...form, filled_at: e.target.value })} />
            <p className="text-xs text-muted-foreground">Deixe em branco se ainda não foi preenchida</p>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <div className="flex gap-3 pt-2">
            <BrandButton type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</BrandButton>
            <BrandButton type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : 'Criar Anamnese'}
            </BrandButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
