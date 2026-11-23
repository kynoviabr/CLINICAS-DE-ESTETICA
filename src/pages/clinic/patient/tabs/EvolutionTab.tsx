import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

import type { Database } from '@/integrations/supabase/types';




type MetricRow = Database['public']['Tables']['patient_metrics']['Row'];

import type { PatientView } from '../patientView';

/** Ficha do paciente > aba "evolution". */
export function EvolutionTab({ v }: { v: PatientView }) {
  const {
    metrics, metricTypes, metricLabels,
  } = v;
  return (
    <>
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
    </>
  );
}
