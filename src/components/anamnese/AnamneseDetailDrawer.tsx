import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { AnamneseStatusBadge } from './AnamneseStatusBadge';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { BrandButton } from '@/components/ui/brand-button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Eye, Hash, Calendar, Clock, User as UserIcon, FileText, Paperclip, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { Database } from '@/integrations/supabase/types';
import { openStoredFile } from '@/lib/storedFile';
import { toast as sonnerToast } from 'sonner';

type AnamneseRow = Database['public']['Tables']['patient_anamneses']['Row'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anamnese: AnamneseRow | null;
}

const sourceLabels: Record<string, string> = {
  digital: 'Digital',
  portal: 'Portal do paciente',
  patient_link: 'Link enviado à paciente',
  manual_upload: 'Upload manual',
  internal_manual: 'Preenchimento interno',
};

const sectionLabels: Record<string, string> = {
  identification: 'Identificação',
  health_history: 'Histórico de Saúde',
  medications: 'Medicamentos',
  allergies: 'Alergias',
  aesthetic_history: 'Histórico Estético',
  objectives: 'Objetivos',
  habits: 'Hábitos de Vida',
  template: 'Modelo da área',
  area_questions: 'Perguntas da área',
  treatment_answers: 'Perguntas do tratamento',
  risk: 'Ciência dos riscos',
  consent: 'Consentimento',
  submission: 'Envio',
};

const fieldLabels: Record<string, string> = {
  name: 'Modelo',
  category: 'Área',
  occupation: 'Profissão',
  marital_status: 'Estado civil',
  emergency_contact: 'Contato de emergência',
  emergency_phone: 'Telefone de emergência',
  has_chronic_disease: 'Doença crônica',
  chronic_diseases: 'Doenças crônicas',
  has_previous_surgery: 'Cirurgias anteriores',
  surgeries: 'Cirurgias',
  has_skin_conditions: 'Condições de pele',
  skin_conditions: 'Condições',
  is_pregnant: 'Gestante',
  is_breastfeeding: 'Amamentando',
  has_pacemaker: 'Marca-passo',
  has_metal_implants: 'Implantes metálicos',
  additional_info: 'Informações adicionais',
  takes_medication: 'Toma medicamentos',
  medications_list: 'Medicamentos',
  takes_supplements: 'Usa suplementos',
  supplements_list: 'Suplementos',
  has_allergies: 'Possui alergias',
  allergies_list: 'Alergias',
  has_product_sensitivity: 'Sensibilidade a produtos',
  sensitivities: 'Sensibilidades',
  previous_treatments: 'Tratamentos anteriores',
  has_active_treatment: 'Tratamento ativo',
  active_treatment_details: 'Detalhes do tratamento ativo',
  uses_acids_retinoids: 'Usa ácidos/retinóides',
  acids_details: 'Ácidos em uso',
  recent_sun_exposure: 'Exposição solar recente',
  skin_type: 'Tipo de pele',
  main_concern: 'Principal queixa',
  body_areas: 'Áreas do corpo',
  expectations: 'Expectativas',
  timeline: 'Prazo desejado',
  smoking: 'Fumante',
  alcohol_frequency: 'Consumo de álcool',
  exercise_frequency: 'Atividade física',
  water_intake: 'Ingestão de água',
  sleep_quality: 'Qualidade do sono',
  diet_description: 'Alimentação',
  sun_protection: 'Protetor solar',
  agrees_terms: 'Termos aceitos',
  agrees_photos: 'Fotos autorizadas',
  agrees_data_usage: 'Uso de dados autorizado',
  signature_date: 'Data de assinatura',
  signature_name: 'Assinatura',
  agrees_photos_marketing: 'Fotos em divulgação',
  terms: 'Texto',
  acknowledged: 'Li e concordo',
  filled_by: 'Preenchida por',
  via: 'Canal',
  at: 'Enviada em',
  ip: 'IP',
  user_agent: 'Aparelho',
};

const detailDependencies: Record<string, string> = {
  chronic_diseases: 'has_chronic_disease',
  surgeries: 'has_previous_surgery',
  skin_conditions: 'has_skin_conditions',
  medications_list: 'takes_medication',
  supplements_list: 'takes_supplements',
  allergies_list: 'has_allergies',
  sensitivities: 'has_product_sensitivity',
  active_treatment_details: 'has_active_treatment',
  acids_details: 'uses_acids_retinoids',
};

const highlightedBooleanFields = new Set([
  'has_allergies',
  'has_product_sensitivity',
  'has_chronic_disease',
  'takes_medication',
  'has_previous_surgery',
  'is_pregnant',
  'is_breastfeeding',
  'has_pacemaker',
  'has_metal_implants',
]);

function fmtDate(d: string | null) {
  if (!d) return '—';
  return format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function fmtDateShort(d: string | null) {
  if (!d) return '—';
  return format(new Date(d), 'dd/MM/yyyy', { locale: ptBR });
}

function formatValue(value: unknown): string {
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  if (value === null || value === undefined || value === '') return '—';
  // Resposta Sim/Não da anamnese de tratamento: { value, detail }.
  if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    const { value: v, detail } = value as { value: boolean | null; detail?: string };
    const base = v === true ? 'Sim' : v === false ? 'Não' : '—';
    return v === true && detail?.trim() ? `${base}: ${detail.trim()}` : base;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Resposta "Sim" de uma pergunta de tratamento (para destacar, como os riscos da inicial). */
const isYesAnswer = (value: unknown) =>
  typeof value === 'object' && value !== null && (value as { value?: unknown }).value === true;

type FormSection = { key: string; entries: Array<[string, unknown]> };

/** Seções do formulário com pelo menos uma resposta para mostrar. */
function visibleSections(formData: Record<string, Record<string, unknown>> | null): FormSection[] {
  if (!formData) return [];
  return Object.entries(formData).flatMap(([key, sectionData]) => {
    if (!sectionData || typeof sectionData !== 'object') return [];
    const entries = Object.entries(sectionData).filter(([field, value]) => {
      if (value === '' || value === null || value === undefined) return false;
      const dependency = detailDependencies[field];
      if (dependency && sectionData[dependency] !== true) return false;
      return true;
    });
    return entries.length > 0 ? [{ key, entries }] : [];
  });
}

export default function AnamneseDetailDrawer({ open, onOpenChange, anamnese }: Props) {
  const [expanded, setExpanded] = useState<string[]>([]);
  // Cada anamnese aberta começa com as seções fechadas.
  useEffect(() => { setExpanded([]); }, [anamnese?.id]);

  if (!anamnese) return null;
  const a = anamnese;
  const formData = a.form_data as Record<string, Record<string, unknown>> | null;
  const sections = visibleSections(formData);
  const allExpanded = sections.length > 0 && expanded.length === sections.length;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <div className="flex items-center gap-3 flex-wrap">
            <DrawerTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Anamnese {a.anamnese_number}
            </DrawerTitle>
            <AnamneseStatusBadge status={a.status} />
          </div>
          <DrawerDescription>
            {a.title || 'Detalhes completos da anamnese'}
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="flex-1 px-4 pb-6 max-h-[65vh]">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="w-3 h-3" />Número</p>
              <p className="font-medium">{a.anamnese_number}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />Criada em</p>
              <p className="font-medium">{fmtDate(a.created_at)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />Preenchida em</p>
              <p className="font-medium">{fmtDate(a.filled_at)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />Vencimento</p>
              <p className="font-medium">{fmtDateShort(a.expires_at)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Validade</p>
              <p className="font-medium">{a.validity_days} dias</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><UserIcon className="w-3 h-3" />Origem</p>
              <p className="font-medium">{sourceLabels[a.source_type] || a.source_type}</p>
            </div>
            {a.validated_at && (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Validada em</p>
                <p className="font-medium">{fmtDate(a.validated_at)}</p>
              </div>
            )}
            {a.archived_at && (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Arquivada em</p>
                <p className="font-medium">{fmtDate(a.archived_at)}</p>
              </div>
            )}
          </div>

          {a.description && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Descrição</p>
              <p className="text-sm">{a.description}</p>
            </div>
          )}

          {a.notes && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Observações</p>
              <p className="text-sm">{a.notes}</p>
            </div>
          )}

          {/* Document */}
          {a.document_url && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 text-sm mb-4">
              <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{a.document_name || 'Documento'}</span>
              <BrandButton size="sm" variant="outline" onClick={() => openStoredFile(a.document_url, 'patient-anamneses').catch((e: Error) => sonnerToast.error(e.message))}>
                <Eye className="w-3 h-3" /> Ver
              </BrandButton>
            </div>
          )}

          <Separator className="my-4" />

          {/* Form data sections */}
          {sections.length > 0 ? (
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-foreground">Dados do Formulário</h4>
                <BrandButton
                  size="sm"
                  variant="outline"
                  onClick={() => setExpanded(allExpanded ? [] : sections.map((s) => s.key))}
                >
                  {allExpanded
                    ? <><ChevronsDownUp className="w-3.5 h-3.5" /> Recolher todos</>
                    : <><ChevronsUpDown className="w-3.5 h-3.5" /> Expandir todos</>}
                </BrandButton>
              </div>
              <Accordion type="multiple" value={expanded} onValueChange={setExpanded} className="space-y-1">
                {sections.map(({ key: sectionKey, entries }) => {
                  return (
                    <AccordionItem key={sectionKey} value={sectionKey} className="border rounded-lg px-3">
                      <AccordionTrigger className="text-sm font-medium py-2">
                        {sectionLabels[sectionKey] || sectionKey}
                        <Badge variant="outline" className="ml-2 text-[10px]">{entries.length}</Badge>
                      </AccordionTrigger>
                      <AccordionContent>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm pb-2">
                          {entries.map(([field, value]) => (
                            <div
                              key={field}
                              className={
                                (highlightedBooleanFields.has(field) && value === true) || (sectionKey === 'treatment_answers' && isYesAnswer(value))
                                  ? 'rounded-lg border border-warning/30 bg-warning/10 px-3 py-2'
                                  : ''
                              }
                            >
                              <dt className="text-xs text-muted-foreground">{fieldLabels[field] || field}</dt>
                              <dd className="font-medium">{formatValue(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum formulário digital preenchido para esta anamnese.
            </p>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
