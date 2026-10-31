type ContractRow = {
  patient_id: string | null;
  created_at: string | null;
  proposals?: {
    proposal_items?: Array<{ treatment_id: string | null; treatments?: { name?: string | null } | null }> | null;
  } | null;
};

export type ContractTreatmentRow = {
  treatment_id: string | null;
  treatments: { name?: string | null } | null;
  contracts: { patient_id: string | null; created_at: string | null };
};

/** Uma linha por tratamento de cada contrato; contratos sem proposta geram uma linha sem tratamento. */
export function flattenContractTreatments(contracts: ContractRow[]): ContractTreatmentRow[] {
  return contracts.flatMap((contract) => {
    const base = { patient_id: contract.patient_id, created_at: contract.created_at };
    const items = contract.proposals?.proposal_items ?? [];
    if (items.length === 0) return [{ treatment_id: null, treatments: null, contracts: base }];
    return items.map((item) => ({
      treatment_id: item.treatment_id,
      treatments: item.treatments ?? null,
      contracts: base,
    }));
  });
}
