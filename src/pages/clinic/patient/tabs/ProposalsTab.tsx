import { BrandButton } from '@/components/ui/brand-button';
import { BrandBadge } from '@/components/ui/brand-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileSignature, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import type { Database } from '@/integrations/supabase/types';




type ProposalRow = Pick<Database['public']['Tables']['proposals']['Row'], 'id' | 'proposal_number' | 'status' | 'final_amount' | 'created_at' | 'valid_until' | 'patient_id'>;

import type { PatientView } from '../patientView';

/** Ficha do paciente > aba "proposals". */
export function ProposalsTab({ v }: { v: PatientView }) {
  const {
    navigate, patient, proposals, contracts, openContractDialog,
  } = v;
  return (
    <>
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Propostas do paciente</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Veja rapidamente as propostas comerciais ligadas a este paciente.
              </p>
            </div>
            <BrandButton variant="outline" onClick={() => navigate(`/clinic/proposals?busca=${encodeURIComponent(patient.cpf || patient.full_name || '')}`)}>
              Abrir módulo de propostas
            </BrandButton>
          </div>
        </CardHeader>
        <CardContent>
          {proposals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma proposta encontrada</p>
          ) : (
            <div className="space-y-3">
              {proposals.map((proposal: ProposalRow) => {
                const linkedContract = contracts.find((contract) => contract.proposal_id === proposal.id);
                const canGenerateContract = proposal.status === 'accepted' && !linkedContract;

                return (
                  <div key={proposal.id} className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                          onClick={() => navigate(`/clinic/proposals?proposalId=${proposal.id}&view=1`)}
                        >
                          {proposal.proposal_number || 'Proposta sem número'}
                        </button>
                        <BrandBadge status={proposal.status === 'accepted' ? 'approved' : proposal.status === 'rejected' ? 'rejected' : proposal.status === 'draft' ? 'draft' : 'sent'}>
                          {proposal.status}
                        </BrandBadge>
                        {linkedContract && (
                          <Badge variant="outline" className="bg-white">
                            Contrato {linkedContract.contract_number || 'gerado'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Valor final: R$ {Number(proposal.final_amount || 0).toLocaleString('pt-BR')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Criada em {format(new Date(proposal.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                        {proposal.valid_until ? ` • válida até ${format(new Date(`${proposal.valid_until}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-start md:self-center">
                      {proposal.status !== 'accepted' && (
                        <BrandButton
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/clinic/proposals?proposalId=${proposal.id}&edit=1`)}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Editar
                        </BrandButton>
                      )}
                      {canGenerateContract && (
                        <BrandButton size="sm" onClick={() => openContractDialog(proposal)}>
                          <FileSignature className="h-4 w-4" />
                          Gerar contrato
                        </BrandButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
