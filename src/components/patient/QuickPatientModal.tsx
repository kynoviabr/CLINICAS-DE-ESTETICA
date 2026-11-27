import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBranding } from '@/contexts/BrandingContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import { UserPlus } from 'lucide-react';
import { formatCpf, formatPhone, onlyDigits, patientSaveErrorMessage, validatePatientFields, type PatientFieldErrors } from '@/lib/patients/validation';
import { PatientDuplicateAlert } from '@/components/patient/PatientDuplicateAlert';
import { usePatientDuplicateCheck } from '@/hooks/usePatientDuplicateCheck';

interface QuickPatientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (patient: { id: string; full_name: string }) => void;
}

export default function QuickPatientModal({ open, onOpenChange, onCreated }: QuickPatientModalProps) {
  const { clinicId } = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthError, setBirthError] = useState('');
  const [errors, setErrors] = useState<PatientFieldErrors>({});
  const [checking, setChecking] = useState(false);
  const duplicates = usePatientDuplicateCheck(clinicId);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!clinicId) throw new Error('Clínica não encontrada');
      if (!fullName.trim()) throw new Error('Nome é obrigatório');

      const { data, error } = await supabase
        .from('patients')
        .insert({
          clinic_id: clinicId,
          full_name: fullName.trim(),
          phone: phone.trim(),
          cpf: onlyDigits(cpf) || null,
          email: email.trim() || null,
          date_of_birth: birthDate,
          is_self_payer: true,
        })
        .select('id, full_name')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['patients-select'] });
      toast({ title: 'Paciente criado com sucesso!' });
      onCreated(data);
      resetForm();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: patientSaveErrorMessage(err), variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFullName('');
    setPhone('');
    setCpf('');
    setEmail('');
    setBirthDate('');
    setBirthError('');
    setErrors({});
    duplicates.reset();
  };

  const handleSubmit = async () => {
    const found = validatePatientFields({ cpf, phone, address: '', address_number: '' });
    setErrors(found);
    // Data de nascimento: confirma a identidade do paciente nos links (anamnese, contrato, revisões).
    const today = new Date().toISOString().slice(0, 10);
    const dobError = !birthDate ? 'Informe a data de nascimento.' : birthDate >= today || birthDate < '1900-01-01' ? 'Data de nascimento inválida.' : '';
    setBirthError(dobError);
    if (Object.keys(found).length > 0 || dobError) return;
    try {
      setChecking(true);
      if (!(await duplicates.canSave(cpf, phone))) return;
    } catch (err) {
      toast({ title: 'Erro', description: patientSaveErrorMessage(err), variant: 'destructive' });
      return;
    } finally {
      setChecking(false);
    }
    createMutation.mutate();
  };
  const checkOnBlur = () => { duplicates.check(cpf, phone).catch(() => undefined); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Cadastro Rápido de Paciente
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-4 mt-2"
        >
          <div className="space-y-2">
            <Label>Nome completo *</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome do paciente"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Telefone *</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              onBlur={checkOnBlur}
              placeholder="(11) 99999-9999"
              inputMode="tel"
              aria-invalid={!!errors.phone}
              className={errors.phone ? 'border-destructive' : undefined}
              required
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>CPF *</Label>
              <Input
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                onBlur={checkOnBlur}
                placeholder="000.000.000-00"
                inputMode="numeric"
                aria-invalid={!!errors.cpf}
                className={errors.cpf ? 'border-destructive' : undefined}
                required
              />
              {errors.cpf && <p className="text-xs text-destructive">{errors.cpf}</p>}
            </div>
            <div className="space-y-2">
              <Label>Data de nascimento *</Label>
              <Input
                type="date"
                value={birthDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => { setBirthDate(e.target.value); setBirthError(''); }}
                aria-invalid={!!birthError}
                className={birthError ? 'border-destructive' : undefined}
                required
              />
              {birthError && <p className="text-xs text-destructive">{birthError}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>
          <PatientDuplicateAlert cpfMatch={duplicates.cpfMatch} phoneMatches={duplicates.phoneMatches} />
          <div className="flex gap-3 pt-2">
            <BrandButton
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancelar
            </BrandButton>
            <BrandButton
              type="submit"
              className="flex-1"
              disabled={createMutation.isPending || checking}
            >
              {createMutation.isPending ? 'Salvando...' : checking ? 'Verificando...' : 'Cadastrar e Selecionar'}
            </BrandButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
