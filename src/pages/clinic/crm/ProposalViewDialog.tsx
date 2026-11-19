import { FileText } from 'lucide-react';
import { BrandButton } from '@/components/ui/brand-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrandBadge } from '@/components/ui/brand-badge';
import { proposalStatusLabel, relativeDate } from '@/lib/crm/model';
import type { CrmPageController } from './useCrmPage';

export function ProposalViewDialog({ ctx }: { ctx: CrmPageController }) {
  const {
    leadDrawer,
    proposalViewDialog,
    setProposalViewDialog,
    leadContracts,
    treatmentMap,
    openLeadContractDialog,
  } = ctx;
  return (
    <Dialog open={!!proposalViewDialog} onOpenChange={(open) => !open && setProposalViewDialog(null)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {proposalViewDialog && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-3">
                <span>Proposta {proposalViewDialog.proposal_number}</span>
                <BrandBadge status={proposalViewDialog.status === 'accepted' ? 'approved' : proposalViewDialog.status === 'rejected' ? 'rejected' : proposalViewDialog.status === 'draft' ? 'draft' : 'sent'}>
                  {proposalStatusLabel[proposalViewDialog.status] || proposalViewDialog.status}
                </BrandBadge>
              </DialogTitle>
              <DialogDescription>
                {proposalViewDialog.patients?.full_name || leadDrawer?.full_name || 'Paciente'} · criada {relativeDate(proposalViewDialog.created_at)}
              </DialogDescription>
            </DialogHeader>
    
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60">
                    <tr>
                      <th className="px-3 py-2 text-left">Tratamento</th>
                      <th className="px-3 py-2 text-center">Qtd</th>
                      <th className="px-3 py-2 text-right">Valor unit.</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(proposalViewDialog.items || []).map((item, index) => (
                      <tr key={item.id || `${item.treatment_id}-${index}`} className="border-t">
                        <td className="px-3 py-2">{item.treatments?.name || treatmentMap[item.treatment_id] || 'Tratamento'}</td>
                        <td className="px-3 py-2 text-center">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">R$ {Number(item.unit_price || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-medium">R$ {Number(item.subtotal || item.quantity * item.unit_price || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
    
              {proposalViewDialog.notes && (
                <div className="rounded-lg border bg-secondary/30 p-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Observações: </span>{proposalViewDialog.notes}
                </div>
              )}
    
              <div className="rounded-lg bg-primary/5 p-4 text-right">
                <span className="text-sm text-muted-foreground">Valor total</span>
                <p className="text-2xl font-semibold text-foreground">R$ {Number(proposalViewDialog.final_amount || 0).toFixed(2)}</p>
              </div>
    
              <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
                <BrandButton variant="outline" onClick={() => setProposalViewDialog(null)}>
                  Fechar
                </BrandButton>
                {leadContracts.some((contract) => contract.proposal_id === proposalViewDialog.id) ? (
                  <BrandBadge status="approved">Contrato já gerado</BrandBadge>
                ) : (
                  <BrandButton onClick={() => openLeadContractDialog(proposalViewDialog)}>
                    <FileText className="w-4 h-4" />
                    {proposalViewDialog.status === 'accepted' ? 'Gerar contrato' : 'Aprovar e gerar contrato'}
                  </BrandButton>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
