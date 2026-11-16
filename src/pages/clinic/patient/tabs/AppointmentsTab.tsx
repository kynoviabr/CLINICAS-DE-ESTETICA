import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { Database } from '@/integrations/supabase/types';




type AppointmentRow = Database['public']['Tables']['appointments']['Row'] & { treatments?: { name?: string | null } | null };

import type { PatientView } from '../patientView';

/** Ficha do paciente > aba "appointments". */
export function AppointmentsTab({ v }: { v: PatientView }) {
  const {
    navigate, appointments, openPatientAgenda,
  } = v;
  return (
    <>
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
    </>
  );
}
