import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, Activity, TrendingDown, Ruler } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const METRIC_TYPES = [
  { value: 'weight', label: 'Peso', unit: 'kg', icon: TrendingDown },
  { value: 'waist', label: 'Cintura', unit: 'cm', icon: Ruler },
  { value: 'hip', label: 'Quadril', unit: 'cm', icon: Ruler },
  { value: 'arm', label: 'Braço', unit: 'cm', icon: Ruler },
  { value: 'thigh', label: 'Coxa', unit: 'cm', icon: Ruler },
  { value: 'abdomen', label: 'Abdômen', unit: 'cm', icon: Ruler },
];

export default function EvolutionPage() {
  const { clinicId } = useUserRole();
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [selectedMetric, setSelectedMetric] = useState('weight');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formPatient, setFormPatient] = useState('');
  const [formMetric, setFormMetric] = useState('weight');
  const [formValue, setFormValue] = useState('');

  useEffect(() => {
    if (!clinicId) return;
    supabase.from('patients').select('id, full_name').eq('clinic_id', clinicId).eq('status', 'active')
      .then(({ data }) => { if (data) setPatients(data); });
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId || !selectedPatient) { setMetrics([]); setLoading(false); return; }
    setLoading(true);
    supabase.from('patient_metrics')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('patient_id', selectedPatient)
      .eq('metric_type', selectedMetric)
      .order('recorded_at', { ascending: true })
      .then(({ data }) => { setMetrics(data || []); setLoading(false); });
  }, [clinicId, selectedPatient, selectedMetric]);

  const chartData = metrics.map(m => ({
    date: format(new Date(m.recorded_at), 'dd/MM', { locale: ptBR }),
    value: Number(m.value),
  }));

  const metricInfo = METRIC_TYPES.find(m => m.value === selectedMetric);
  const lastValue = metrics.length > 0 ? Number(metrics[metrics.length - 1].value) : null;
  const firstValue = metrics.length > 1 ? Number(metrics[0].value) : null;
  const diff = lastValue !== null && firstValue !== null ? lastValue - firstValue : null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const unit = METRIC_TYPES.find(m => m.value === formMetric)?.unit || 'cm';
    const { error } = await supabase.from('patient_metrics').insert({
      clinic_id: clinicId!, patient_id: formPatient, metric_type: formMetric,
      value: Number(formValue), unit,
    });
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Medição registrada!' });
    setOpen(false);
    setFormValue('');
    if (formPatient === selectedPatient && formMetric === selectedMetric) {
      supabase.from('patient_metrics').select('*').eq('clinic_id', clinicId!)
        .eq('patient_id', selectedPatient).eq('metric_type', selectedMetric)
        .order('recorded_at', { ascending: true })
        .then(({ data }) => setMetrics(data || []));
    }
  };

  return (
    <div>
      <PageHeader title="Evolução" description="Acompanhe as medidas e progresso dos pacientes">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Nova Medição</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar Medição</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label>Paciente</Label>
                <Select value={formPatient} onValueChange={setFormPatient}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={formMetric} onValueChange={setFormMetric}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{METRIC_TYPES.map(m => <SelectItem key={m.value} value={m.value}>{m.label} ({m.unit})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input type="number" step="0.1" value={formValue} onChange={e => setFormValue(e.target.value)} required placeholder="Ex: 72.5" />
              </div>
              <Button type="submit" className="w-full gradient-primary text-primary-foreground">Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-2">
          <Select value={selectedPatient} onValueChange={setSelectedPatient}>
            <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
            <SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{METRIC_TYPES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {!selectedPatient ? (
        <Card className="shadow-card"><CardContent className="py-16 text-center">
          <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Selecione um paciente para ver a evolução</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="shadow-card"><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase">Medições</p>
              <p className="text-2xl font-bold text-foreground">{metrics.length}</p>
            </CardContent></Card>
            <Card className="shadow-card"><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase">Última</p>
              <p className="text-2xl font-bold text-foreground">{lastValue !== null ? `${lastValue} ${metricInfo?.unit}` : '—'}</p>
            </CardContent></Card>
            <Card className="shadow-card"><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase">Variação</p>
              <p className={`text-2xl font-bold ${diff !== null && diff < 0 ? 'text-green-600' : diff !== null && diff > 0 ? 'text-red-500' : 'text-foreground'}`}>
                {diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)} ${metricInfo?.unit}` : '—'}
              </p>
            </CardContent></Card>
          </div>

          {/* Chart */}
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">{metricInfo?.label} ao longo do tempo</CardTitle></CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                    <YAxis className="text-xs fill-muted-foreground" />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" className="stroke-primary" strokeWidth={2} dot={{ r: 4, className: 'fill-primary' }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">Nenhuma medição registrada para este tipo</p>
              )}
            </CardContent>
          </Card>

          {/* History table */}
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
            <CardContent>
              {metrics.length > 0 ? (
                <div className="divide-y divide-border">
                  {[...metrics].reverse().map(m => (
                    <div key={m.id} className="flex items-center justify-between py-3">
                      <span className="text-sm text-muted-foreground">{format(new Date(m.recorded_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                      <span className="font-semibold text-foreground">{Number(m.value)} {m.unit}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-center text-muted-foreground py-4">Sem medições</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
