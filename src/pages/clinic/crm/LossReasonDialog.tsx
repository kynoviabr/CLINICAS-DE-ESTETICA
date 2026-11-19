import { BrandButton } from '@/components/ui/brand-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { lostReasons } from '@/lib/crm/model';
import type { CrmPageController } from './useCrmPage';

export function LossReasonDialog({ ctx }: { ctx: CrmPageController }) {
  const {
    lossModal,
    setLossModal,
    lossForm,
    setLossForm,
    moveLeadMutation,
  } = ctx;
  return (
    <Dialog open={!!lossModal} onOpenChange={() => setLossModal(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Motivo da perda</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Motivo *</Label>
            <Select value={lossForm.reason} onValueChange={(value) => setLossForm((current) => ({ ...current, reason: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {lostReasons.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Detalhes</Label>
            <Textarea value={lossForm.notes} onChange={(event) => setLossForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
          </div>
          <div className="flex gap-3 pt-2">
            <BrandButton type="button" variant="outline" className="flex-1" onClick={() => setLossModal(null)}>Cancelar</BrandButton>
            <BrandButton
              className="flex-1"
              onClick={() => {
                if (!lossModal) return;
                moveLeadMutation.mutate({
                  lead: lossModal.lead,
                  targetStage: lossModal.targetStage,
                  lostReason: lossForm.reason,
                  lostReasonNotes: lossForm.notes,
                });
                setLossModal(null);
                setLossForm({ reason: lostReasons[0], notes: '' });
              }}
            >
              Confirmar perda
            </BrandButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
