import { BrandButton } from '@/components/ui/brand-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { interactionTypes } from '@/lib/crm/model';
import type { CrmPageController } from './useCrmPage';

export function InteractionDialog({ ctx }: { ctx: CrmPageController }) {
  const {
    interactionOpen,
    setInteractionOpen,
    interactionForm,
    setInteractionForm,
    createInteractionMutation,
  } = ctx;
  return (
    <Dialog open={interactionOpen} onOpenChange={setInteractionOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar interação</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4 mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            createInteractionMutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={interactionForm.type} onValueChange={(value) => setInteractionForm((current) => ({ ...current, type: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {interactionTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Observação</Label>
            <Textarea value={interactionForm.notes} onChange={(event) => setInteractionForm((current) => ({ ...current, notes: event.target.value }))} rows={4} />
          </div>
          <div className="flex gap-3 pt-2">
            <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setInteractionOpen(false)}>Cancelar</BrandButton>
            <BrandButton type="submit" className="flex-1" disabled={createInteractionMutation.isPending}>
              {createInteractionMutation.isPending ? 'Salvando...' : 'Registrar'}
            </BrandButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
