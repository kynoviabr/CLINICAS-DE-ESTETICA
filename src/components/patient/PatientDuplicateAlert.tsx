import { AlertTriangle, Ban } from 'lucide-react';
import type { PatientDuplicate } from '@/lib/patients/duplicates';

export function PatientDuplicateAlert({ cpfMatch, phoneMatches }: { cpfMatch: PatientDuplicate | null; phoneMatches: PatientDuplicate[] }) {
  if (!cpfMatch && phoneMatches.length === 0) return null;
  return (
    <div className="space-y-2" role="alert">
      {cpfMatch && (
        <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <Ban className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Este CPF já pertence a <strong>{cpfMatch.full_name}</strong>. Não é possível cadastrar dois clientes com o mesmo CPF.
            Abra o cadastro existente em Clientes.
          </p>
        </div>
      )}
      {phoneMatches.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
          <p>
            Este telefone já está no cadastro de <strong>{phoneMatches.map((m) => m.full_name).join(', ')}</strong>.
            Confirme se é outra pessoa (ex.: familiar). Para salvar mesmo assim, clique em salvar de novo.
          </p>
        </div>
      )}
    </div>
  );
}
