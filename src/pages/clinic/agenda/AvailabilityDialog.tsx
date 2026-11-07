import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProfessionalHoursForm } from '@/components/professionals/ProfessionalHoursDialog';
import type { AgendaPageController } from './useAgendaPage';

/** Agenda > Disponibilidade: mesma tela de horários do cadastro do profissional (com pausa para almoço). */
export function AvailabilityDialog({ ctx }: { ctx: AgendaPageController }) {
  const { availabilityDialogOpen, setAvailabilityDialogOpen, availabilityProfessional, setAvailabilityProfessional, professionals } = ctx;
  const selected = professionals.find((p) => p.id === availabilityProfessional);
  return (
    <Dialog open={availabilityDialogOpen} onOpenChange={setAvailabilityDialogOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Horários de atendimento</DialogTitle>
          <DialogDescription>A agenda e a IA só oferecem horários dentro destes e do horário da clínica.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Profissional</Label>
            <Select value={availabilityProfessional} onValueChange={setAvailabilityProfessional}>
              <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
              <SelectContent>
                {professionals.map((professional) => (
                  <SelectItem key={professional.id} value={professional.id}>{professional.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected && (
            <ProfessionalHoursForm key={selected.id} professional={{ id: selected.id, name: selected.label }}
              onDone={() => setAvailabilityDialogOpen(false)} cancelLabel="Fechar" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
