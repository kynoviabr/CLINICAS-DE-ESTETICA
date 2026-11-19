import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { PageHeader } from '@/components/ui/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PatientPhotosTab } from '@/components/photos/PatientPhotosTab';

/** Fotos: escolhe a paciente e usa o mesmo painel da ficha (enviar, rotular, comparar). */
export default function PhotosPage() {
  const { clinicId } = useUserRole();
  const [patients, setPatients] = useState<Array<{ id: string; full_name: string }>>([]);
  const [selectedPatient, setSelectedPatient] = useState('');

  useEffect(() => {
    if (!clinicId) return;
    supabase.from('patients').select('id, full_name').eq('clinic_id', clinicId).eq('status', 'active').order('full_name')
      .then(({ data }) => { if (data) setPatients(data); });
  }, [clinicId]);

  return (
    <div>
      <PageHeader title="Fotos" description="Registro fotográfico e comparador antes/depois" />
      <div className="mb-6 max-w-md">
        <Select value={selectedPatient} onValueChange={(v) => v && setSelectedPatient(v)}>
          <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
          <SelectContent>{patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {clinicId && selectedPatient
        ? <PatientPhotosTab key={selectedPatient} clinicId={clinicId} patientId={selectedPatient} />
        : <p className="text-sm text-muted-foreground">Escolha a paciente para ver e enviar fotos.</p>}
    </div>
  );
}
