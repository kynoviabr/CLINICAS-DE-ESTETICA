import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { Database } from '@/integrations/supabase/types';




type SessionRow = Database['public']['Tables']['session_records']['Row'] & { treatments?: { name?: string | null } | null };

import type { PatientView } from '../patientView';

/** Ficha do paciente > aba "sessions". */
export function SessionsTab({ v }: { v: PatientView }) {
  const {
    navigate, sessions,
  } = v;
  return (
    <>
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
    </>
  );
}
