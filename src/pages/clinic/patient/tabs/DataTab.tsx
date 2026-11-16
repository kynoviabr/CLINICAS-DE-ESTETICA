import LgpdPanel from '@/components/patient/LgpdPanel';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Edit, NotebookPen } from 'lucide-react';

import { parsePatientNotes, getLatestPatientNoteText } from '@/lib/patients/notesHistory';
import { formatCpf } from '@/lib/patients/validation';





import type { PatientView } from '../patientView';

/** Ficha do paciente > aba "data". */
export function DataTab({ v }: { v: PatientView }) {
  const {
    setPatientTab, id, role, patient, openEditPatient,
  } = v;
  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Informações Pessoais</CardTitle>
          <BrandButton size="sm" variant="outline" onClick={openEditPatient}>
            <Edit className="w-4 h-4" />
            Editar dados
          </BrandButton>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {[
              ['Nome', patient.full_name],
              ['E-mail', patient.email],
              ['Telefone', patient.phone],
              ['CPF', patient.cpf ? formatCpf(patient.cpf) : null],
              ['Nascimento', patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('pt-BR') : null],
              ['Gênero', patient.gender === 'female' ? 'Feminino' : patient.gender === 'male' ? 'Masculino' : patient.gender],
              ['CEP', patient.zip_code],
              ['Endereço', [patient.address, patient.address_number, patient.address_complement].filter(Boolean).join(', ') || null],
              ['Cidade/UF', [patient.city, patient.state].filter(Boolean).join(' / ') || null],
            ].map(([label, value], i) => (
              <div key={i}>
                <dt className="text-muted-foreground text-xs uppercase tracking-wider">{label}</dt>
                <dd className="font-medium text-foreground mt-0.5">{value || '—'}</dd>
              </div>
            ))}
          </dl>
          {patient.notes && (
            <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Última observação</dt>
                <dd className="text-sm text-foreground whitespace-pre-wrap">{getLatestPatientNoteText(patient.notes)}</dd>
              </div>
              <BrandButton size="sm" variant="ghost" onClick={() => setPatientTab('notes')} className="self-start sm:self-auto text-primary">
                <NotebookPen className="w-3.5 h-3.5 mr-1" />
                Ver histórico ({parsePatientNotes(patient.notes).length})
              </BrandButton>
            </div>
          )}

        </CardContent>
      </Card>
              <div className="mt-4">
        <LgpdPanel patientId={id!} patientName={patient.full_name} isAdmin={role === 'admin'} anonymized={!!(patient as { anonymized_at?: string | null }).anonymized_at} />
      </div>
    </>
  );
}
