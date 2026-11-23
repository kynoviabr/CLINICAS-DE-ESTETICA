import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { getSignedContractUrl } from '@/lib/storageHelper';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

import { ContractStatusBadge } from '@/components/contracts/ContractStatusBadge';





import type { PatientView } from '../patientView';

/** Ficha do paciente > aba "contracts". */
export function ContractsTab({ v }: { v: PatientView }) {
  const {
    navigate, contracts,
  } = v;
  return (
    <>
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Contratos do paciente</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Acesse rapidamente os contratos vinculados a este paciente.
              </p>
            </div>
            <BrandButton variant="outline" onClick={() => navigate('/clinic/contracts')}>
              Abrir módulo de contratos
            </BrandButton>
          </div>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum contrato encontrado</p>
          ) : (
            <div className="space-y-3">
              {contracts.map((contract) => (
                <div key={contract.id} className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                        onClick={() => navigate(`/clinic/contracts?contractId=${contract.id}&view=1`)}
                      >
                        {contract.contract_number || 'Contrato sem número'}
                      </button>
                      <ContractStatusBadge status={contract.process_status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {contract.proposals?.proposal_number
                        ? `Proposta ${contract.proposals.proposal_number}`
                        : 'Sem proposta vinculada'}
                      {contract.proposals?.final_amount
                        ? ` • R$ ${Number(contract.proposals.final_amount).toLocaleString('pt-BR')}`
                        : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Criado em {format(new Date(contract.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start md:self-center">
                    {contract.signed_pdf_url && (
                      <BrandButton
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            const url = await getSignedContractUrl(contract.pdf_storage_path || contract.signed_pdf_url);
                            window.open(url, '_blank', 'noopener,noreferrer');
                          } catch (e) {
                            toast.error('Não foi possível carregar o arquivo.');
                          }
                        }}
                      >
                        Ver PDF
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
