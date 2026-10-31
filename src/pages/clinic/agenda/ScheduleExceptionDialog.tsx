import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { AgendaPageController } from './useAgendaPage';

export function ScheduleExceptionDialog({ ctx }: { ctx: AgendaPageController }) {
  const {
    exceptionModal,
    setExceptionModal,
    exceptionReason,
    setExceptionReason,
    rescheduleDate,
    setRescheduleDate,
    rescheduleTime,
    setRescheduleTime,
    rescheduleDuration,
    setRescheduleDuration,
    rescheduleProfessional,
    setRescheduleProfessional,
    rescheduleNotes,
    setRescheduleNotes,
    isProfessional,
    professionals,
    getAppointmentStartDate,
    getAppointmentDisplayName,
    appointmentExceptionMutation,
  } = ctx;
  return (
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
  );
}
