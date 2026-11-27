import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  User, HeartPulse, Pill, AlertTriangle, Sparkles, Target, Coffee, FileCheck,
  ChevronLeft, ChevronRight, Check, ClipboardList, Loader2, type LucideIcon,
} from 'lucide-react';
import {
  buildTreatmentFormData, templateRiskTerms, unansweredQuestions, visibleTemplateQuestions,
  type AnamneseTemplate, type TreatmentAnswer,
} from '@/lib/anamnese/templates';
import { isEmptySelection, type AnamneseSelection } from '@/lib/anamnese/selection';
import { ANAMNESE_CHOICES } from '@/lib/anamnese/choices';
import { useAnamneseOptions } from '@/hooks/useAnamneseOptions';
import { AnamneseChooser } from '@/components/anamnese/AnamneseChooser';
import type { Json } from '@/integrations/supabase/types';


interface AnamnesisFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  clinicId: string;
  validityDays: number;
  patientName?: string;
  /** 'page': a própria paciente preenche pelo link (sem janela, sem login). */
  variant?: 'dialog' | 'page';
  /**
   * O que a paciente responde, já escolhido pela Dra (página do link): a inicial e/ou modelos de tratamento.
   * Sem isso (janela interna), a própria janela pergunta primeiro quais preencher.
   */
  chosen?: { general: boolean; templates: AnamneseTemplate[] };
  /** Envio pela página da paciente (no lugar de gravar direto no banco). */
  onSubmitForm?: (formData: Json) => Promise<void>;
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
    agrees_photos_marketing?: boolean;
    signature_name?: string;
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

const baseSections = [
  { key: 'identification', label: 'Identificação', icon: User },
  { key: 'health_history', label: 'Histórico de Saúde', icon: HeartPulse },
  { key: 'medications', label: 'Medicamentos', icon: Pill },
  { key: 'allergies', label: 'Alergias', icon: AlertTriangle },
  { key: 'aesthetic_history', label: 'Histórico Estético', icon: Sparkles },
  { key: 'objectives', label: 'Objetivos', icon: Target },
  { key: 'habits', label: 'Hábitos de Vida', icon: Coffee },
  { key: 'consent', label: 'Consentimento', icon: FileCheck },
] as const;

// Fora do componente de propósito: se fossem criados dentro dele, cada letra
// digitada recriaria o campo e a caixa de texto perderia o foco (o teclado fecha).
function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <Label className="text-sm font-normal cursor-pointer">{label}</Label>
    </div>
  );
}

function BooleanQuestion({
  label,
  value,
  onChange,
  detailValue,
  onDetailChange,
  detailPlaceholder,
  detailRows = 2,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  detailValue?: string;
  onDetailChange?: (value: string) => void;
  detailPlaceholder?: string;
  detailRows?: number;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium leading-relaxed">{label}</Label>
        <RadioGroup
          value={value ? 'yes' : 'no'}
          onValueChange={(next) => onChange(next === 'yes')}
          className="flex items-center gap-6"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="yes" id={`${label}-yes`} />
            <Label htmlFor={`${label}-yes`} className="font-normal cursor-pointer">Sim</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no" id={`${label}-no`} />
            <Label htmlFor={`${label}-no`} className="font-normal cursor-pointer">Não</Label>
          </div>
        </RadioGroup>
      </div>
      {value && detailValue !== undefined && detailPlaceholder && (
        <Textarea
          value={detailValue}
          onChange={(e) => onDetailChange?.(e.target.value)}
          placeholder={detailPlaceholder}
          rows={detailRows}
        />
      )}
    </div>
  );
}

/** Pergunta Sim/Não do tratamento: começa sem resposta (a paciente precisa escolher). */
function TreatmentQuestion({ id, text, type, answer, onChange }: {
  id: string;
  text: string;
  type: 'yes_no' | 'text';
  answer: TreatmentAnswer | undefined;
  onChange: (answer: TreatmentAnswer) => void;
}) {
  if (type === 'text') {
    return (
      <div className="space-y-2 rounded-xl border border-border/60 bg-card/60 p-4">
        <Label htmlFor={id} className="text-sm font-medium leading-relaxed">{text}</Label>
        <Textarea id={id} rows={2} value={typeof answer === 'string' ? answer : ''} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  const current = typeof answer === 'object' && answer !== null ? answer : { value: null, detail: '' };
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card/60 p-4">
      <Label className="text-sm font-medium leading-relaxed">{text}</Label>
      <RadioGroup
        value={current.value === true ? 'yes' : current.value === false ? 'no' : ''}
        onValueChange={(next) => onChange({ value: next === 'yes', detail: next === 'yes' ? current.detail : '' })}
        className="flex items-center gap-6"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="yes" id={`${id}-yes`} />
          <Label htmlFor={`${id}-yes`} className="font-normal cursor-pointer">Sim</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="no" id={`${id}-no`} />
          <Label htmlFor={`${id}-no`} className="font-normal cursor-pointer">Não</Label>
        </div>
      </RadioGroup>
      {current.value === true && (
        <Textarea
          aria-label={`Detalhes: ${text}`}
          value={current.detail}
          onChange={(e) => onChange({ value: true, detail: e.target.value })}
          placeholder="Conte mais detalhes"
          rows={2}
        />
      )}
    </div>
  );
}

type Section = { key: string; label: string; icon: LucideIcon; template?: AnamneseTemplate };

export default function AnamnesisFormModal({ open, onOpenChange, patientId, clinicId, validityDays, patientName, variant = 'dialog', chosen: chosenProp, onSubmitForm }: AnamnesisFormProps) {
  const isPage = variant === 'page';
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(emptyForm);

  // O que vai ser preenchido. Na janela interna, a Dra escolhe primeiro (mesma lista do envio por link).
  const [chosenLocal, setChosenLocal] = useState<{ general: boolean; templates: AnamneseTemplate[] } | null>(null);
  const chosen = chosenProp ?? chosenLocal;
  const options = useAnamneseOptions(patientId, open && !chosenProp && !chosenLocal);
  const [selection, setSelection] = useState<AnamneseSelection>({ general: true, templateIds: [] });
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!seeded && options.data) { setSelection(options.data.suggestion); setSeeded(true); }
  }, [seeded, options.data]);

  const [treatmentAnswers, setTreatmentAnswers] = useState<Record<string, Record<string, TreatmentAnswer>>>({});
  const [riskAck, setRiskAck] = useState<Record<string, boolean>>({});
  // Antes de começar: termos gerais e ciência dos riscos de cada tratamento.
  const [introAccepted, setIntroAccepted] = useState(false);

  const reset = () => {
    setForm(emptyForm);
    setTreatmentAnswers({});
    setRiskAck({});
    setIntroAccepted(false);
    setChosenLocal(null);
    setSeeded(false);
    setStep(0);
  };
  // Ao fechar a janela interna, recomeça do zero na próxima vez.
  useEffect(() => { if (!open && !isPage) reset(); }, [open, isPage]);

  const sections = useMemo<Section[]>(() => {
    const list: Section[] = [];
    if (chosen?.general) list.push(...baseSections.filter((x) => x.key !== 'consent'));
    (chosen?.templates || []).forEach((t) => list.push({ key: `tpl:${t.id}`, label: t.category_name || t.name, icon: ClipboardList, template: t }));
    list.push({ key: 'consent', label: 'Consentimento', icon: FileCheck });
    return list;
  }, [chosen]);
  const currentSection = sections[Math.min(step, sections.length - 1)];
  const templatesChosen = chosen?.templates || [];
  const allRisksAcknowledged = templatesChosen.every((t) => riskAck[t.id]);

  const setAnswer = (templateId: string, question: string, answer: TreatmentAnswer) => {
    setTreatmentAnswers((cur) => ({ ...cur, [templateId]: { ...(cur[templateId] || {}), [question]: answer } }));
  };

  /** Mensagem do que falta responder numa etapa de tratamento (ou null). */
  const missingIn = (section: Section | undefined) => {
    if (!section?.template) return null;
    const missing = unansweredQuestions(section.template, treatmentAnswers[section.template.id], !!chosen?.general);
    return missing.length ? `Responda Sim ou Não em todas as perguntas de ${section.label}.` : null;
  };

  const goNext = () => {
    const missing = missingIn(currentSection);
    if (missing) { toast({ title: 'Falta responder', description: missing, variant: 'destructive' }); return; }
    setStep(step + 1);
  };

  const updateSection = <S extends keyof FormData, F extends keyof FormData[S]>(section: S, field: F, value: FormData[S][F]) => {
    setForm(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!chosen) throw new Error('Escolha quais anamneses preencher.');
      if (!form.consent.agrees_terms) throw new Error('É necessário aceitar os termos de consentimento');
      const pending = sections.map(missingIn).find(Boolean);
      if (pending) throw new Error(pending);
      if (!allRisksAcknowledged) throw new Error('Confirme a ciência dos riscos de cada tratamento.');
      if (isPage && (form.consent.signature_name || '').trim().length < 3) throw new Error('Digite seu nome completo para assinar.');

      const now = new Date().toISOString();
      const consent = { ...form.consent, signature_date: form.consent.signature_date || new Date().toISOString().split('T')[0] };
      const general = chosen.general ? { ...form, consent } : { consent };

      if (onSubmitForm) {
        const payload: Json = JSON.parse(JSON.stringify({
          ...general,
          treatment_anamneses: templatesChosen.map((t) => ({ template_id: t.id, answers: treatmentAnswers[t.id] || {}, risk_ack: !!riskAck[t.id] })),
        }));
        await onSubmitForm(payload);
        return;
      }

      // Uma inserção por vez: o número da anamnese é gerado pelo banco em sequência.
      if (chosen.general) {
        const { error } = await supabase.from('patient_anamneses').insert({
          anamnese_number: '', // o banco gera o número (trigger)
          clinic_id: clinicId,
          patient_id: patientId,
          form_data: JSON.parse(JSON.stringify(general)) as Json,
          filled_at: now,
          source_type: 'digital',
          status: 'filled',
          validity_days: validityDays,
          created_by: user?.id,
          kind: 'general',
        });
        if (error) throw error;
      }
      for (const t of templatesChosen) {
        const { error } = await supabase.from('patient_anamneses').insert({
          anamnese_number: '',
          clinic_id: clinicId,
          patient_id: patientId,
          form_data: JSON.parse(JSON.stringify(buildTreatmentFormData(t, treatmentAnswers[t.id] || {}, consent))) as Json,
          filled_at: now,
          source_type: 'digital',
          status: 'filled',
          validity_days: validityDays,
          created_by: user?.id,
          kind: 'treatment',
          category_id: t.category_id || null,
          template_id: t.id,
          template_name: t.name,
          title: t.name,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-anamneses', patientId] });
      qc.invalidateQueries({ queryKey: ['patient', patientId] });
      qc.invalidateQueries({ queryKey: ['anamnese-options'] });
      toast({ title: 'Anamnese salva com sucesso!' });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const renderSection = () => {
    if (currentSection.template) {
      const t = currentSection.template;
      return (
        <div className="space-y-4">
          {visibleTemplateQuestions(t, !!chosen?.general).map((q, i) => (
            <TreatmentQuestion
              key={`${t.id}-${i}`}
              id={`tq-${t.id}-${i}`}
              text={q.text}
              type={q.type}
              answer={treatmentAnswers[t.id]?.[q.text]}
              onChange={(answer) => setAnswer(t.id, q.text, answer)}
            />
          ))}
        </div>
      );
    }
    const s = currentSection.key;
    switch (s) {
      case 'identification':
        return (
          <div className="space-y-5">
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
              <Label>Profissão</Label>
              <Input value={form.identification.occupation} onChange={e => updateSection('identification', 'occupation', e.target.value)} placeholder="Ex: Advogada" />
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
              <Label>Estado civil</Label>
              <Select value={form.identification.marital_status} onValueChange={v => updateSection('identification', 'marital_status', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {ANAMNESE_CHOICES.marital_status.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <p className="text-sm font-medium mb-3">Contato de emergência</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          </div>
        );

      case 'health_history':
        return (
          <div className="space-y-5">
            <BooleanQuestion
              label="Possui doença crônica?"
              value={form.health_history.has_chronic_disease}
              onChange={(value) => {
                updateSection('health_history', 'has_chronic_disease', value);
                if (!value) updateSection('health_history', 'chronic_diseases', '');
              }}
              detailValue={form.health_history.chronic_diseases}
              onDetailChange={(value) => updateSection('health_history', 'chronic_diseases', value)}
              detailPlaceholder="Quais doenças crônicas?"
            />
            <BooleanQuestion
              label="Já fez cirurgias anteriores?"
              value={form.health_history.has_previous_surgery}
              onChange={(value) => {
                updateSection('health_history', 'has_previous_surgery', value);
                if (!value) updateSection('health_history', 'surgeries', '');
              }}
              detailValue={form.health_history.surgeries}
              onDetailChange={(value) => updateSection('health_history', 'surgeries', value)}
              detailPlaceholder="Descreva as cirurgias"
            />
            <BooleanQuestion
              label="Possui condições de pele relevantes?"
              value={form.health_history.has_skin_conditions}
              onChange={(value) => {
                updateSection('health_history', 'has_skin_conditions', value);
                if (!value) updateSection('health_history', 'skin_conditions', '');
              }}
              detailValue={form.health_history.skin_conditions}
              onDetailChange={(value) => updateSection('health_history', 'skin_conditions', value)}
              detailPlaceholder="Descreva as condições de pele"
            />
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <p className="text-sm font-medium mb-3">Condições clínicas objetivas</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <BooleanQuestion label="Gestante?" value={form.health_history.is_pregnant} onChange={v => updateSection('health_history', 'is_pregnant', v)} />
              <BooleanQuestion label="Amamentando?" value={form.health_history.is_breastfeeding} onChange={v => updateSection('health_history', 'is_breastfeeding', v)} />
              <BooleanQuestion label="Usa marca-passo?" value={form.health_history.has_pacemaker} onChange={v => updateSection('health_history', 'has_pacemaker', v)} />
              <BooleanQuestion label="Possui implantes metálicos?" value={form.health_history.has_metal_implants} onChange={v => updateSection('health_history', 'has_metal_implants', v)} />
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
              <Label>Informações adicionais</Label>
              <Textarea value={form.health_history.additional_info} onChange={e => updateSection('health_history', 'additional_info', e.target.value)} rows={2} />
            </div>
          </div>
        );

      case 'medications':
        return (
          <div className="space-y-5">
            <BooleanQuestion
              label="Toma medicamentos atualmente?"
              value={form.medications.takes_medication}
              onChange={(value) => {
                updateSection('medications', 'takes_medication', value);
                if (!value) updateSection('medications', 'medications_list', '');
              }}
              detailValue={form.medications.medications_list}
              onDetailChange={(value) => updateSection('medications', 'medications_list', value)}
              detailPlaceholder="Liste os medicamentos em uso"
              detailRows={3}
            />
            <BooleanQuestion
              label="Usa suplementos?"
              value={form.medications.takes_supplements}
              onChange={(value) => {
                updateSection('medications', 'takes_supplements', value);
                if (!value) updateSection('medications', 'supplements_list', '');
              }}
              detailValue={form.medications.supplements_list}
              onDetailChange={(value) => updateSection('medications', 'supplements_list', value)}
              detailPlaceholder="Liste os suplementos"
            />
          </div>
        );

      case 'allergies':
        return (
          <div className="space-y-5">
            <BooleanQuestion
              label="Possui alergias?"
              value={form.allergies.has_allergies}
              onChange={(value) => {
                updateSection('allergies', 'has_allergies', value);
                if (!value) updateSection('allergies', 'allergies_list', '');
              }}
              detailValue={form.allergies.allergies_list}
              onDetailChange={(value) => updateSection('allergies', 'allergies_list', value)}
              detailPlaceholder="Liste as alergias (medicamentos, alimentos, etc.)"
              detailRows={3}
            />
            <BooleanQuestion
              label="Tem sensibilidade a cosméticos ou produtos?"
              value={form.allergies.has_product_sensitivity}
              onChange={(value) => {
                updateSection('allergies', 'has_product_sensitivity', value);
                if (!value) updateSection('allergies', 'sensitivities', '');
              }}
              detailValue={form.allergies.sensitivities}
              onDetailChange={(value) => updateSection('allergies', 'sensitivities', value)}
              detailPlaceholder="Quais produtos causam sensibilidade?"
            />
          </div>
        );

      case 'aesthetic_history':
        return (
          <div className="space-y-5">
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
              <Label>Tratamentos estéticos anteriores</Label>
              <Textarea value={form.aesthetic_history.previous_treatments} onChange={e => updateSection('aesthetic_history', 'previous_treatments', e.target.value)} placeholder="Ex: Botox, peeling, laser..." rows={2} />
            </div>
            <BooleanQuestion
              label="Está em tratamento estético ativo?"
              value={form.aesthetic_history.has_active_treatment}
              onChange={(value) => {
                updateSection('aesthetic_history', 'has_active_treatment', value);
                if (!value) updateSection('aesthetic_history', 'active_treatment_details', '');
              }}
              detailValue={form.aesthetic_history.active_treatment_details}
              onDetailChange={(value) => updateSection('aesthetic_history', 'active_treatment_details', value)}
              detailPlaceholder="Detalhes do tratamento ativo"
            />
            <BooleanQuestion
              label="Usa ácidos ou retinóides?"
              value={form.aesthetic_history.uses_acids_retinoids}
              onChange={(value) => {
                updateSection('aesthetic_history', 'uses_acids_retinoids', value);
                if (!value) updateSection('aesthetic_history', 'acids_details', '');
              }}
              detailValue={form.aesthetic_history.acids_details}
              onDetailChange={(value) => updateSection('aesthetic_history', 'acids_details', value)}
              detailPlaceholder="Quais ácidos ou retinóides?"
              detailRows={1}
            />
            <BooleanQuestion
              label="Teve exposição solar recente?"
              value={form.aesthetic_history.recent_sun_exposure}
              onChange={(value) => updateSection('aesthetic_history', 'recent_sun_exposure', value)}
            />
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
              <Label>Tipo de pele</Label>
              <Select value={form.aesthetic_history.skin_type} onValueChange={v => updateSection('aesthetic_history', 'skin_type', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {ANAMNESE_CHOICES.skin_type.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'objectives':
        return (
          <div className="space-y-5">
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
              <Label>Principal queixa / preocupação</Label>
              <Textarea value={form.objectives.main_concern} onChange={e => updateSection('objectives', 'main_concern', e.target.value)} placeholder="O que te incomoda ou gostaria de melhorar?" rows={3} />
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
              <Label>Áreas do corpo</Label>
              <Input value={form.objectives.body_areas} onChange={e => updateSection('objectives', 'body_areas', e.target.value)} placeholder="Ex: rosto, abdômen, coxas..." />
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
              <Label>Expectativas com o tratamento</Label>
              <Textarea value={form.objectives.expectations} onChange={e => updateSection('objectives', 'expectations', e.target.value)} rows={2} />
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
              <Label>Prazo desejado</Label>
              <Input value={form.objectives.timeline} onChange={e => updateSection('objectives', 'timeline', e.target.value)} placeholder="Ex: 3 meses, antes do verão..." />
            </div>
          </div>
        );

      case 'habits':
        return (
          <div className="space-y-5">
            <BooleanQuestion label="Fumante?" value={form.habits.smoking} onChange={v => updateSection('habits', 'smoking', v)} />
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <p className="text-sm font-medium mb-3">Rotina e estilo de vida</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                <Label>Consumo de álcool</Label>
                <Select value={form.habits.alcohol_frequency} onValueChange={v => updateSection('habits', 'alcohol_frequency', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {ANAMNESE_CHOICES.alcohol_frequency.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                </div>
                <div className="space-y-2">
                <Label>Atividade física</Label>
                <Select value={form.habits.exercise_frequency} onValueChange={v => updateSection('habits', 'exercise_frequency', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {ANAMNESE_CHOICES.exercise_frequency.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
              <p className="text-sm font-medium mb-3">Autocuidado</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                <Label>Ingestão de água (litros/dia)</Label>
                <Input value={form.habits.water_intake} onChange={e => updateSection('habits', 'water_intake', e.target.value)} placeholder="Ex: 2L" />
                </div>
                <div className="space-y-2">
                <Label>Qualidade do sono</Label>
                <Select value={form.habits.sleep_quality} onValueChange={v => updateSection('habits', 'sleep_quality', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {ANAMNESE_CHOICES.sleep_quality.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
              <Label>Alimentação</Label>
              <Textarea value={form.habits.diet_description} onChange={e => updateSection('habits', 'diet_description', e.target.value)} placeholder="Descreva brevemente sua alimentação" rows={2} />
            </div>
            <BooleanQuestion label="Usa protetor solar diariamente?" value={form.habits.sun_protection} onChange={v => updateSection('habits', 'sun_protection', v)} />
          </div>
        );

      case 'consent':
        return (
          <div className="space-y-5">
            <p className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              <Check className="mt-0.5 h-4 w-4 shrink-0" /> Termos e ciência dos riscos aceitos no início da anamnese.
            </p>
            {chosen?.general && (
              <>
                <CheckboxField
                  label="Autorizo registro fotográfico para acompanhamento"
                  checked={form.consent.agrees_photos}
                  onChange={v => updateSection('consent', 'agrees_photos', v)}
                />
                <CheckboxField
                  label="Autorizo uso das minhas fotos, sem identificação, em divulgação da clínica (redes sociais, site)"
                  checked={!!form.consent.agrees_photos_marketing}
                  onChange={v => updateSection('consent', 'agrees_photos_marketing', v)}
                />
                <CheckboxField
                  label="Autorizo uso dos dados para análise e melhoria dos serviços"
                  checked={form.consent.agrees_data_usage}
                  onChange={v => updateSection('consent', 'agrees_data_usage', v)}
                />
              </>
            )}
            {isPage && (
              <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
                <Label>Assinatura: digite seu nome completo *</Label>
                <Input
                  value={form.consent.signature_name || ''}
                  onChange={e => updateSection('consent', 'signature_name', e.target.value)}
                  placeholder="Seu nome completo"
                  autoComplete="name"
                />
              </div>
            )}
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
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

  // Janela interna: primeiro a Dra escolhe quais anamneses preencher.
  if (!chosen) {
    const templates = options.data?.templates || [];
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quais anamneses preencher?</DialogTitle>
          </DialogHeader>
          {options.isLoading || !options.data ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
          ) : (
            <AnamneseChooser
              templates={templates}
              generalState={options.data.generalState}
              categoryStates={options.data.categoryStates}
              categoryIds={options.data.categoryIds}
              value={selection}
              onChange={setSelection}
            />
          )}
          <BrandButton
            disabled={!options.data || isEmptySelection(selection)}
            onClick={() => setChosenLocal({ general: selection.general, templates: templates.filter((t) => selection.templateIds.includes(t.id)) })}
          >
            Começar
          </BrandButton>
        </DialogContent>
      </Dialog>
    );
  }

  const intro = (
    <>
    {!isPage && (
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><FileCheck className="h-5 w-5 text-primary" /> Antes de começar {patientName ? `— ${patientName}` : ''}</DialogTitle>
      </DialogHeader>
    )}
    <ScrollArea className={isPage ? '' : 'max-h-[62vh] pr-3'}>
      <div className="space-y-4 py-2">
        <div>
          <p className="text-base font-semibold text-foreground">Antes de começar</p>
          <p className="text-sm text-muted-foreground">Leia com atenção. Depois de concordar, você responde a anamnese.</p>
        </div>
        {templatesChosen.map((t) => (
          <div key={t.id} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-sm font-semibold text-foreground">Riscos e cuidados: {t.category_name || t.name}</p>
            <div className="space-y-2 text-sm leading-relaxed text-foreground/90">
              {templateRiskTerms(t).split(/\n{2,}/).map((para, n) => {
                const k = para.indexOf(':');
                return k > 0 && k < 40
                  ? <p key={n}><span className="font-semibold">{para.slice(0, k + 1)}</span>{para.slice(k + 1)}</p>
                  : <p key={n}>{para}</p>;
              })}
            </div>
            <CheckboxField label="Li, entendi e concordo *" checked={!!riskAck[t.id]} onChange={(v) => setRiskAck((cur) => ({ ...cur, [t.id]: v }))} />
          </div>
        ))}
        <div className="space-y-3 rounded-xl border bg-secondary/40 p-4">
          <p className="text-sm font-semibold text-foreground">Termos da anamnese</p>
          <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
            <li>As informações que vou prestar são verdadeiras e completas.</li>
            <li>Estou ciente de que omitir informações pode prejudicar o tratamento.</li>
            <li>Autorizo a clínica a usar os meus dados para fins do meu tratamento.</li>
          </ul>
          <CheckboxField label="Concordo com os termos *" checked={form.consent.agrees_terms} onChange={(v) => updateSection('consent', 'agrees_terms', v)} />
        </div>
      </div>
    </ScrollArea>
    <div className="flex items-center justify-between border-t pt-4">
      {!isPage ? (
        <BrandButton variant="outline" onClick={() => onOpenChange(false)}><ChevronLeft className="h-4 w-4" /> Cancelar</BrandButton>
      ) : <span />}
      <BrandButton disabled={!form.consent.agrees_terms || !allRisksAcknowledged} onClick={() => { setIntroAccepted(true); setStep(0); }}>
        Concordo e quero começar <ChevronRight className="h-4 w-4" />
      </BrandButton>
    </div>
    </>
  );

  const body = !introAccepted ? intro : (
    <>
    {!isPage && (
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" />
          Anamnese Digital {patientName ? `— ${patientName}` : ''}
        </DialogTitle>
      </DialogHeader>
    )}

    {/* Etapas: texto da etapa atual + barra de progresso + ícones (sempre cabem no quadro) */}
    <div className="space-y-2 py-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-semibold text-primary">Etapa {step + 1} de {sections.length} · {sections[step]?.label}</span>
        <span className="shrink-0 text-muted-foreground">{Math.round(((step + 1) / sections.length) * 100)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((step + 1) / sections.length) * 100}%` }} />
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}>
        {sections.map((s, i) => {
          const SIcon = s.icon;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setStep(i)}
              title={s.label}
              aria-label={`Etapa ${i + 1}: ${s.label}${i < step ? ' (feita)' : ''}`}
              aria-current={i === step ? 'step' : undefined}
              className={`relative flex min-w-0 items-center justify-center rounded-lg py-2 transition-colors ${
                i === step ? 'bg-primary/10 text-primary' : i < step ? 'text-primary/70 hover:bg-muted' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <SIcon className="h-4 w-4" />
              {i < step && <Check className="absolute right-0.5 top-0.5 h-3 w-3 text-green-500" />}
            </button>
          );
        })}
      </div>
    </div>

    {/* Section content */}
    <ScrollArea className={isPage ? 'pr-1' : 'flex-1 pr-4 max-h-[50vh]'}>
      <div className="py-2">
        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full gradient-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
            {step + 1}
          </span>
          {currentSection.label}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Responda apenas o necessário. Campos complementares aparecem conforme as respostas.
        </p>
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
        {step === 0 && !isPage ? 'Cancelar' : 'Anterior'}
      </BrandButton>

      <span className="text-xs text-muted-foreground">{step + 1} de {sections.length}</span>

      {isLastStep ? (
        <BrandButton onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.consent.agrees_terms || !allRisksAcknowledged}>
          {saveMutation.isPending ? 'Salvando...' : isPage ? 'Enviar anamnese' : 'Salvar Anamnese'}
          <Check className="w-4 h-4" />
        </BrandButton>
      ) : (
        <BrandButton onClick={goNext}>
          Próximo
          <ChevronRight className="w-4 h-4" />
        </BrandButton>
      )}
    </div>
    </>
  );

  if (isPage) return <div className="flex flex-col gap-2">{body}</div>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        {body}
      </DialogContent>
    </Dialog>
  );
}
