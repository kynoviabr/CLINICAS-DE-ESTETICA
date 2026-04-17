import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  User, HeartPulse, Pill, AlertTriangle, Sparkles, Target, Coffee, FileCheck,
  ChevronLeft, ChevronRight, Check,
} from 'lucide-react';


interface AnamnesisFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  clinicId: string;
  validityDays: number;
  patientName?: string;
}

interface FormData {
  identification: {
    occupation: string;
    marital_status: string;
    emergency_contact: string;
    emergency_phone: string;
  };
  health_history: {
    has_chronic_disease: boolean;
    chronic_diseases: string;
    has_previous_surgery: boolean;
    surgeries: string;
    has_skin_conditions: boolean;
    skin_conditions: string;
    is_pregnant: boolean;
    is_breastfeeding: boolean;
    has_pacemaker: boolean;
    has_metal_implants: boolean;
    additional_info: string;
  };
  medications: {
    takes_medication: boolean;
    medications_list: string;
    takes_supplements: boolean;
    supplements_list: string;
  };
  allergies: {
    has_allergies: boolean;
    allergies_list: string;
    has_product_sensitivity: boolean;
    sensitivities: string;
  };
  aesthetic_history: {
    previous_treatments: string;
    has_active_treatment: boolean;
    active_treatment_details: string;
    uses_acids_retinoids: boolean;
    acids_details: string;
    recent_sun_exposure: boolean;
    skin_type: string;
  };
  objectives: {
    main_concern: string;
    body_areas: string;
    expectations: string;
    timeline: string;
  };
  habits: {
    smoking: boolean;
    alcohol_frequency: string;
    exercise_frequency: string;
    water_intake: string;
    sleep_quality: string;
    diet_description: string;
    sun_protection: boolean;
  };
  consent: {
    agrees_terms: boolean;
    agrees_photos: boolean;
    agrees_data_usage: boolean;
    signature_date: string;
  };
}

const emptyForm: FormData = {
  identification: { occupation: '', marital_status: '', emergency_contact: '', emergency_phone: '' },
  health_history: {
    has_chronic_disease: false, chronic_diseases: '', has_previous_surgery: false, surgeries: '',
    has_skin_conditions: false, skin_conditions: '', is_pregnant: false, is_breastfeeding: false,
    has_pacemaker: false, has_metal_implants: false, additional_info: '',
  },
  medications: { takes_medication: false, medications_list: '', takes_supplements: false, supplements_list: '' },
  allergies: { has_allergies: false, allergies_list: '', has_product_sensitivity: false, sensitivities: '' },
  aesthetic_history: {
    previous_treatments: '', has_active_treatment: false, active_treatment_details: '',
    uses_acids_retinoids: false, acids_details: '', recent_sun_exposure: false, skin_type: '',
  },
  objectives: { main_concern: '', body_areas: '', expectations: '', timeline: '' },
  habits: {
    smoking: false, alcohol_frequency: '', exercise_frequency: '', water_intake: '',
    sleep_quality: '', diet_description: '', sun_protection: false,
  },
  consent: { agrees_terms: false, agrees_photos: false, agrees_data_usage: false, signature_date: '' },
};

const sections = [
  { key: 'identification', label: 'Identificação', icon: User },
  { key: 'health_history', label: 'Histórico de Saúde', icon: HeartPulse },
  { key: 'medications', label: 'Medicamentos', icon: Pill },
  { key: 'allergies', label: 'Alergias', icon: AlertTriangle },
  { key: 'aesthetic_history', label: 'Histórico Estético', icon: Sparkles },
  { key: 'objectives', label: 'Objetivos', icon: Target },
  { key: 'habits', label: 'Hábitos de Vida', icon: Coffee },
  { key: 'consent', label: 'Consentimento', icon: FileCheck },
] as const;

export default function AnamnesisFormModal({ open, onOpenChange, patientId, clinicId, validityDays, patientName }: AnamnesisFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(emptyForm);

  const currentSection = sections[step];

  const updateSection = (section: keyof FormData, field: string, value: any) => {
    setForm(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.consent.agrees_terms) throw new Error('É necessário aceitar os termos de consentimento');
      
      const now = new Date().toISOString();

      const { error } = await supabase.from('patient_anamneses').insert({
        clinic_id: clinicId,
        patient_id: patientId,
        form_data: form as any,
        filled_at: now,
        source_type: 'digital',
        status: 'filled',
        validity_days: validityDays,
        created_by: user?.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-anamneses', patientId] });
      qc.invalidateQueries({ queryKey: ['patient', patientId] });
      toast({ title: 'Anamnese salva com sucesso!' });
      setForm(emptyForm);
      setStep(0);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const CheckboxField = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center gap-2">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <Label className="text-sm font-normal cursor-pointer">{label}</Label>
    </div>
  );

  const renderSection = () => {
    const s = currentSection.key;
    switch (s) {
      case 'identification':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Profissão</Label>
              <Input value={form.identification.occupation} onChange={e => updateSection('identification', 'occupation', e.target.value)} placeholder="Ex: Advogada" />
            </div>
            <div className="space-y-2">
              <Label>Estado civil</Label>
              <Select value={form.identification.marital_status} onValueChange={v => updateSection('identification', 'marital_status', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Solteiro(a)</SelectItem>
                  <SelectItem value="married">Casado(a)</SelectItem>
                  <SelectItem value="divorced">Divorciado(a)</SelectItem>
                  <SelectItem value="widowed">Viúvo(a)</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Contato de emergência</Label>
                <Input value={form.identification.emergency_contact} onChange={e => updateSection('identification', 'emergency_contact', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefone de emergência</Label>
                <Input value={form.identification.emergency_phone} onChange={e => updateSection('identification', 'emergency_phone', e.target.value)} placeholder="(11) 99999-9999" />
              </div>
            </div>
          </div>
        );

      case 'health_history':
        return (
          <div className="space-y-4">
            <CheckboxField label="Possui doença crônica?" checked={form.health_history.has_chronic_disease} onChange={v => updateSection('health_history', 'has_chronic_disease', v)} />
            {form.health_history.has_chronic_disease && (
              <Textarea value={form.health_history.chronic_diseases} onChange={e => updateSection('health_history', 'chronic_diseases', e.target.value)} placeholder="Quais doenças crônicas?" rows={2} />
            )}
            <CheckboxField label="Cirurgias anteriores?" checked={form.health_history.has_previous_surgery} onChange={v => updateSection('health_history', 'has_previous_surgery', v)} />
            {form.health_history.has_previous_surgery && (
              <Textarea value={form.health_history.surgeries} onChange={e => updateSection('health_history', 'surgeries', e.target.value)} placeholder="Descreva as cirurgias" rows={2} />
            )}
            <CheckboxField label="Condições de pele?" checked={form.health_history.has_skin_conditions} onChange={v => updateSection('health_history', 'has_skin_conditions', v)} />
            {form.health_history.has_skin_conditions && (
              <Textarea value={form.health_history.skin_conditions} onChange={e => updateSection('health_history', 'skin_conditions', e.target.value)} placeholder="Descreva" rows={2} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <CheckboxField label="Gestante?" checked={form.health_history.is_pregnant} onChange={v => updateSection('health_history', 'is_pregnant', v)} />
              <CheckboxField label="Amamentando?" checked={form.health_history.is_breastfeeding} onChange={v => updateSection('health_history', 'is_breastfeeding', v)} />
              <CheckboxField label="Marca-passo?" checked={form.health_history.has_pacemaker} onChange={v => updateSection('health_history', 'has_pacemaker', v)} />
              <CheckboxField label="Implantes metálicos?" checked={form.health_history.has_metal_implants} onChange={v => updateSection('health_history', 'has_metal_implants', v)} />
            </div>
            <div className="space-y-2">
              <Label>Informações adicionais</Label>
              <Textarea value={form.health_history.additional_info} onChange={e => updateSection('health_history', 'additional_info', e.target.value)} rows={2} />
            </div>
          </div>
        );

      case 'medications':
        return (
          <div className="space-y-4">
            <CheckboxField label="Toma medicamentos?" checked={form.medications.takes_medication} onChange={v => updateSection('medications', 'takes_medication', v)} />
            {form.medications.takes_medication && (
              <Textarea value={form.medications.medications_list} onChange={e => updateSection('medications', 'medications_list', e.target.value)} placeholder="Liste os medicamentos em uso" rows={3} />
            )}
            <CheckboxField label="Usa suplementos?" checked={form.medications.takes_supplements} onChange={v => updateSection('medications', 'takes_supplements', v)} />
            {form.medications.takes_supplements && (
              <Textarea value={form.medications.supplements_list} onChange={e => updateSection('medications', 'supplements_list', e.target.value)} placeholder="Liste os suplementos" rows={2} />
            )}
          </div>
        );

      case 'allergies':
        return (
          <div className="space-y-4">
            <CheckboxField label="Possui alergias?" checked={form.allergies.has_allergies} onChange={v => updateSection('allergies', 'has_allergies', v)} />
            {form.allergies.has_allergies && (
              <Textarea value={form.allergies.allergies_list} onChange={e => updateSection('allergies', 'allergies_list', e.target.value)} placeholder="Liste as alergias (medicamentos, alimentos, etc.)" rows={3} />
            )}
            <CheckboxField label="Sensibilidade a cosméticos/produtos?" checked={form.allergies.has_product_sensitivity} onChange={v => updateSection('allergies', 'has_product_sensitivity', v)} />
            {form.allergies.has_product_sensitivity && (
              <Textarea value={form.allergies.sensitivities} onChange={e => updateSection('allergies', 'sensitivities', e.target.value)} placeholder="Quais produtos?" rows={2} />
            )}
          </div>
        );

      case 'aesthetic_history':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tratamentos estéticos anteriores</Label>
              <Textarea value={form.aesthetic_history.previous_treatments} onChange={e => updateSection('aesthetic_history', 'previous_treatments', e.target.value)} placeholder="Ex: Botox, peeling, laser..." rows={2} />
            </div>
            <CheckboxField label="Tratamento estético ativo?" checked={form.aesthetic_history.has_active_treatment} onChange={v => updateSection('aesthetic_history', 'has_active_treatment', v)} />
            {form.aesthetic_history.has_active_treatment && (
              <Textarea value={form.aesthetic_history.active_treatment_details} onChange={e => updateSection('aesthetic_history', 'active_treatment_details', e.target.value)} placeholder="Detalhes do tratamento ativo" rows={2} />
            )}
            <CheckboxField label="Usa ácidos/retinóides?" checked={form.aesthetic_history.uses_acids_retinoids} onChange={v => updateSection('aesthetic_history', 'uses_acids_retinoids', v)} />
            {form.aesthetic_history.uses_acids_retinoids && (
              <Input value={form.aesthetic_history.acids_details} onChange={e => updateSection('aesthetic_history', 'acids_details', e.target.value)} placeholder="Quais?" />
            )}
            <CheckboxField label="Exposição solar recente?" checked={form.aesthetic_history.recent_sun_exposure} onChange={v => updateSection('aesthetic_history', 'recent_sun_exposure', v)} />
            <div className="space-y-2">
              <Label>Tipo de pele</Label>
              <Select value={form.aesthetic_history.skin_type} onValueChange={v => updateSection('aesthetic_history', 'skin_type', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="oily">Oleosa</SelectItem>
                  <SelectItem value="dry">Seca</SelectItem>
                  <SelectItem value="combination">Mista</SelectItem>
                  <SelectItem value="sensitive">Sensível</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'objectives':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Principal queixa / preocupação</Label>
              <Textarea value={form.objectives.main_concern} onChange={e => updateSection('objectives', 'main_concern', e.target.value)} placeholder="O que te incomoda ou gostaria de melhorar?" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Áreas do corpo</Label>
              <Input value={form.objectives.body_areas} onChange={e => updateSection('objectives', 'body_areas', e.target.value)} placeholder="Ex: rosto, abdômen, coxas..." />
            </div>
            <div className="space-y-2">
              <Label>Expectativas com o tratamento</Label>
              <Textarea value={form.objectives.expectations} onChange={e => updateSection('objectives', 'expectations', e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Prazo desejado</Label>
              <Input value={form.objectives.timeline} onChange={e => updateSection('objectives', 'timeline', e.target.value)} placeholder="Ex: 3 meses, antes do verão..." />
            </div>
          </div>
        );

      case 'habits':
        return (
          <div className="space-y-4">
            <CheckboxField label="Fumante?" checked={form.habits.smoking} onChange={v => updateSection('habits', 'smoking', v)} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Consumo de álcool</Label>
                <Select value={form.habits.alcohol_frequency} onValueChange={v => updateSection('habits', 'alcohol_frequency', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Nunca</SelectItem>
                    <SelectItem value="rarely">Raramente</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="daily">Diário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Atividade física</Label>
                <Select value={form.habits.exercise_frequency} onValueChange={v => updateSection('habits', 'exercise_frequency', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sedentário</SelectItem>
                    <SelectItem value="1-2x">1-2x/semana</SelectItem>
                    <SelectItem value="3-4x">3-4x/semana</SelectItem>
                    <SelectItem value="5+">5+ vezes/semana</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Ingestão de água (litros/dia)</Label>
                <Input value={form.habits.water_intake} onChange={e => updateSection('habits', 'water_intake', e.target.value)} placeholder="Ex: 2L" />
              </div>
              <div className="space-y-2">
                <Label>Qualidade do sono</Label>
                <Select value={form.habits.sleep_quality} onValueChange={v => updateSection('habits', 'sleep_quality', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="good">Boa</SelectItem>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="poor">Ruim</SelectItem>
                    <SelectItem value="insomnia">Insônia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Alimentação</Label>
              <Textarea value={form.habits.diet_description} onChange={e => updateSection('habits', 'diet_description', e.target.value)} placeholder="Descreva brevemente sua alimentação" rows={2} />
            </div>
            <CheckboxField label="Usa protetor solar diariamente?" checked={form.habits.sun_protection} onChange={v => updateSection('habits', 'sun_protection', v)} />
          </div>
        );

      case 'consent':
        return (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/50 text-sm text-muted-foreground space-y-2">
              <p>Ao preencher esta anamnese, o(a) paciente declara que:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>As informações prestadas são verdadeiras e completas</li>
                <li>Está ciente que a omissão de informações pode prejudicar o tratamento</li>
                <li>Autoriza a clínica a utilizar os dados para fins terapêuticos</li>
              </ul>
            </div>
            <CheckboxField
              label="Concordo com os termos de consentimento *"
              checked={form.consent.agrees_terms}
              onChange={v => updateSection('consent', 'agrees_terms', v)}
            />
            <CheckboxField
              label="Autorizo registro fotográfico para acompanhamento"
              checked={form.consent.agrees_photos}
              onChange={v => updateSection('consent', 'agrees_photos', v)}
            />
            <CheckboxField
              label="Autorizo uso dos dados para análise e melhoria dos serviços"
              checked={form.consent.agrees_data_usage}
              onChange={v => updateSection('consent', 'agrees_data_usage', v)}
            />
            <div className="space-y-2">
              <Label>Data de assinatura</Label>
              <Input
                type="date"
                value={form.consent.signature_date || new Date().toISOString().split('T')[0]}
                onChange={e => updateSection('consent', 'signature_date', e.target.value)}
              />
            </div>
          </div>
        );
    }
  };

  const isLastStep = step === sections.length - 1;
  const Icon = currentSection.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary" />
            Anamnese Digital {patientName ? `— ${patientName}` : ''}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 py-2">
          {sections.map((s, i) => {
            const SIcon = s.icon;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(i)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg transition-colors text-xs ${
                  i === step
                    ? 'bg-primary/10 text-primary font-semibold'
                    : i < step
                    ? 'text-primary/60'
                    : 'text-muted-foreground'
                }`}
              >
                <SIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:block truncate">{s.label}</span>
                {i < step && <Check className="w-3 h-3 text-green-500" />}
              </button>
            );
          })}
        </div>

        {/* Section content */}
        <ScrollArea className="flex-1 pr-4 max-h-[50vh]">
          <div className="py-2">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full gradient-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                {step + 1}
              </span>
              {currentSection.label}
            </h3>
            {renderSection()}
          </div>
        </ScrollArea>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t">
          <BrandButton
            variant="outline"
            onClick={() => step > 0 ? setStep(step - 1) : onOpenChange(false)}
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? 'Cancelar' : 'Anterior'}
          </BrandButton>

          <span className="text-xs text-muted-foreground">{step + 1} de {sections.length}</span>

          {isLastStep ? (
            <BrandButton onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.consent.agrees_terms}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar Anamnese'}
              <Check className="w-4 h-4" />
            </BrandButton>
          ) : (
            <BrandButton onClick={() => setStep(step + 1)}>
              Próximo
              <ChevronRight className="w-4 h-4" />
            </BrandButton>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
