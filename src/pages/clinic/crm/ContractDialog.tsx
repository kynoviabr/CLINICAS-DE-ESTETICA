import { FileText } from 'lucide-react';
import { BrandButton } from '@/components/ui/brand-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PayerSection from '@/components/patient/PayerSection';
import { ContractPaymentConfigurator } from '@/components/contracts/ContractPaymentConfigurator';
import type { CrmPageController } from './useCrmPage';

export function ContractDialog({ ctx }: { ctx: CrmPageController }) {
  const {
    leadDrawer,
    contractDialogProposal,
    paymentCondition,
    setPaymentCondition,
    selectedPaymentMethods,
    paymentDetails,
    setPaymentDetails,
    paymentConfig,
    setPaymentConfig,
    payerData,
    setPayerData,
    resetContractDialog,
    togglePaymentMethod,
    generateContractFromCrmMutation,
  } = ctx;
  return (
    <Dialog
      open={!!contractDialogProposal}
      onOpenChange={(open) => {
        if (!open) resetContractDialog();
      }}
    >
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {contractDialogProposal?.status === 'accepted' ? 'Gerar contrato' : 'Aprovar proposta e gerar contrato'}
          </DialogTitle>
          <DialogDescription>
            Configure pagamento e pagador sem sair da negociação do lead.
          </DialogDescription>
        </DialogHeader>
    
        {contractDialogProposal && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-amber-50/60 p-4">
              <p className="text-sm font-semibold text-foreground">{contractDialogProposal.proposal_number}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {contractDialogProposal.patients?.full_name || leadDrawer?.full_name || 'Paciente'} · R$ {Number(contractDialogProposal.final_amount || 0).toFixed(2)}
              </p>
              {contractDialogProposal.status !== 'accepted' && (
                <p className="mt-2 text-xs text-amber-800">
                  Ao confirmar, a proposta será marcada como aprovada e o lead irá para Fechado.
                </p>
              )}
            </div>
    
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ContractPaymentConfigurator
                paymentCondition={paymentCondition}
                setPaymentCondition={setPaymentCondition}
                selectedPaymentMethods={selectedPaymentMethods}
                togglePaymentMethod={togglePaymentMethod}
                paymentConfig={paymentConfig}
                setPaymentConfig={setPaymentConfig}
                paymentDetails={paymentDetails}
                setPaymentDetails={setPaymentDetails}
              />
              <div className="space-y-4">
                <PayerSection
                  value={payerData}
                  onChange={setPayerData}
                  patientName={contractDialogProposal.patients?.full_name || leadDrawer?.full_name || undefined}
                />
                <div className="rounded-md border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                  Valor da proposta: <span className="font-semibold text-foreground">R$ {Number(contractDialogProposal.final_amount || 0).toFixed(2)}</span> ·
                  Soma informada: <span className="font-semibold text-foreground">R$ {selectedPaymentMethods.reduce((sum, method) => sum + Number(paymentConfig[method]?.amount || 0), 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
    
            <div className="flex justify-end gap-3 border-t pt-4">
              <BrandButton type="button" variant="outline" onClick={resetContractDialog}>
                Cancelar
              </BrandButton>
              <BrandButton
                type="button"
                disabled={generateContractFromCrmMutation.isPending}
                onClick={() => generateContractFromCrmMutation.mutate()}
              >
                <FileText className="w-4 h-4" />
                {generateContractFromCrmMutation.isPending ? 'Gerando...' : 'Confirmar e gerar contrato'}
              </BrandButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
