import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { weekDays } from '@/lib/agenda/model';
import type { AgendaPageController } from './useAgendaPage';

export function AvailabilityDialog({ ctx }: { ctx: AgendaPageController }) {
  const {
    availabilityDialogOpen,
    setAvailabilityDialogOpen,
    availabilityProfessional,
    setAvailabilityProfessional,
    availabilityDraft,
    setAvailabilityDraft,
    professionals,
    saveAvailabilityMutation,
  } = ctx;
  return (
    <Dialog open={availabilityDialogOpen} onOpenChange={setAvailabilityDialogOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Disponibilidade semanal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Profissional</Label>
            <Select value={availabilityProfessional} onValueChange={setAvailabilityProfessional}>
              <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
              <SelectContent>
                {professionals.map((professional) => (
                  <SelectItem key={professional.user_id} value={professional.user_id}>
                    {professional.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
    
          <div className="space-y-3">
            {weekDays.map((day) => {
              const row = availabilityDraft[day.value] || { isActive: false, start: '09:00', end: '18:00' };
              return (
                <div key={day.value} className="grid grid-cols-[160px_100px_1fr_1fr] gap-3 items-center rounded-xl border p-3">
                  <p className="text-sm font-medium text-foreground">{day.label}</p>
                  <Select
                    value={row.isActive ? 'active' : 'inactive'}
                    onValueChange={(value) => setAvailabilityDraft((current) => ({
                      ...current,
                      [day.value]: {
                        ...row,
                        isActive: value === 'active',
                      },
                    }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="time"
                    value={row.start}
                    disabled={!row.isActive}
                    onChange={(event) => setAvailabilityDraft((current) => ({
                      ...current,
                      [day.value]: { ...row, start: event.target.value },
                    }))}
                  />
                  <Input
                    type="time"
                    value={row.end}
                    disabled={!row.isActive}
                    onChange={(event) => setAvailabilityDraft((current) => ({
                      ...current,
                      [day.value]: { ...row, end: event.target.value },
                    }))}
                  />
                </div>
              );
            })}
          </div>
    
          <div className="flex gap-3 pt-2">
            <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setAvailabilityDialogOpen(false)}>
              Fechar
            </BrandButton>
            <BrandButton className="flex-1" onClick={() => saveAvailabilityMutation.mutate()} disabled={saveAvailabilityMutation.isPending}>
              {saveAvailabilityMutation.isPending ? 'Salvando...' : 'Salvar disponibilidade'}
            </BrandButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
