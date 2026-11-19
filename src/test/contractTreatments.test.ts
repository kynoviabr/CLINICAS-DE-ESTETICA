import { describe, expect, it } from 'vitest';
import { flattenContractTreatments } from '@/lib/patients/contractTreatments';

describe('flattenContractTreatments', () => {
  it('gera uma linha por tratamento da proposta do contrato', () => {
    const rows = flattenContractTreatments([
      {
        patient_id: 'p1',
        created_at: '2026-10-01',
        proposals: {
          proposal_items: [
            { treatment_id: 't1', treatments: { name: 'Laser' } },
            { treatment_id: 't2', treatments: { name: 'Peeling' } },
          ],
        },
      },
    ]);
    expect(rows.map((r) => r.treatment_id)).toEqual(['t1', 't2']);
    expect(rows[0].contracts).toEqual({ patient_id: 'p1', created_at: '2026-10-01' });
  });

  it('mantém a data de contratos sem proposta', () => {
    const rows = flattenContractTreatments([{ patient_id: 'p2', created_at: '2026-09-01', proposals: null }]);
    expect(rows).toEqual([{ treatment_id: null, treatments: null, contracts: { patient_id: 'p2', created_at: '2026-09-01' } }]);
  });
});
