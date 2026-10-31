import { Plus } from 'lucide-react';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CrmPageController } from './useCrmPage';

export function ProposalDialog({ ctx }: { ctx: CrmPageController }) {
  const {
    leadDrawer,
    proposalDialogOpen,
    proposalLead,
    proposalValidUntil,
    setProposalValidUntil,
    proposalNotes,
    setProposalNotes,
    proposalItems,
    setProposalItems,
    treatments,
    resetProposalDialog,
    proposalTotal,
    addProposalItem,
    createProposalFromCrmMutation,
  } = ctx;
  return (
    <Dialog
      open={proposalDialogOpen}
      onOpenChange={(open) => {
        if (!open) resetProposalDialog();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova proposta</DialogTitle>
          <DialogDescription>
            Monte a proposta sem sair do CRM. Ao salvar, ela abre aqui mesmo para negociação.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            createProposalFromCrmMutation.mutate();
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Lead / paciente</Label>
              <Input value={proposalLead?.full_name || leadDrawer?.full_name || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>Validade</Label>
              <Input type="date" value={proposalValidUntil} onChange={(event) => setProposalValidUntil(event.target.value)} />
            </div>
          </div>
    
          <section className="rounded-lg border bg-card p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Tratamentos</h3>
                <p className="mt-1 text-xs text-muted-foreground">Inclua os itens negociados na sala.</p>
              </div>
              <BrandButton type="button" size="sm" variant="outline" onClick={addProposalItem}>
                <Plus className="w-4 h-4" />
                Adicionar
              </BrandButton>
            </div>
    
            <div className="space-y-3">
              {proposalItems.length === 0 && (
                <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                  Nenhum tratamento incluído.
                </div>
              )}
              {proposalItems.map((item, index) => {
                const treatment = treatments.find((current) => current.id === item.treatment_id);
                const belowMinimum = treatment?.min_price && item.unit_price < Number(treatment.min_price);
                return (
                  <div key={`${item.treatment_id}-${index}`} className="rounded-lg border p-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_90px_130px_40px] md:items-end">
                      <div className="space-y-2">
                        <Label>Tratamento</Label>
                        <Select
                          value={item.treatment_id}
                          onValueChange={(value) => {
                            const nextTreatment = treatments.find((current) => current.id === value);
                            setProposalItems((current) => current.map((row, rowIndex) => rowIndex === index
                              ? {
                                  ...row,
                                  treatment_id: value,
                                  unit_price: Number(nextTreatment?.default_price || nextTreatment?.price || row.unit_price || 0),
                                }
                              : row
                            ));
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                          <SelectContent>
                            {treatments.map((current) => (
                              <SelectItem key={current.id} value={current.id}>{current.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Qtd</Label>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(event) => setProposalItems((current) => current.map((row, rowIndex) => rowIndex === index
                            ? { ...row, quantity: parseInt(event.target.value, 10) || 1 }
                            : row
                          ))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Valor unit.</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unit_price}
                          onChange={(event) => setProposalItems((current) => current.map((row, rowIndex) => rowIndex === index
                            ? { ...row, unit_price: parseFloat(event.target.value) || 0 }
                            : row
                          ))}
                        />
                      </div>
                      <button
                        type="button"
                        className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                        onClick={() => setProposalItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                        aria-label="Remover tratamento"
                      >
                        x
                      </button>
                    </div>
                    {belowMinimum && (
                      <p className="mt-2 text-xs text-destructive">Abaixo do mínimo: R$ {Number(treatment?.min_price || 0).toFixed(2)}</p>
                    )}
                  </div>
                );
              })}
            </div>
    
            <div className="mt-4 rounded-md bg-secondary/40 px-3 py-2 text-right text-sm">
              Total: <span className="font-semibold text-foreground">R$ {proposalTotal.toFixed(2)}</span>
            </div>
          </section>
    
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={proposalNotes} onChange={(event) => setProposalNotes(event.target.value)} rows={3} />
          </div>
    
          <div className="flex justify-end gap-3 border-t pt-4">
            <BrandButton type="button" variant="outline" onClick={resetProposalDialog}>
              Cancelar
            </BrandButton>
            <BrandButton type="submit" disabled={createProposalFromCrmMutation.isPending || proposalItems.length === 0}>
              {createProposalFromCrmMutation.isPending ? 'Salvando...' : 'Salvar e visualizar'}
            </BrandButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
