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
import { DocumentOutputButtons } from '@/components/documents/DocumentOutputButtons';
import { loadClinicLetterhead } from '@/hooks/useClinicLetterhead';
import { supabase } from '@/integrations/supabase/client';
import { loadAcceptancesSafe } from '@/lib/documents/acceptances';
import { buildAnamneseHtml, fieldLabels, formatValue, highlightedBooleanFields, isYesAnswer, sectionLabels, sourceLabels, visibleSections } from '@/lib/anamnese/document';

type AnamneseRow = Database['public']['Tables']['patient_anamneses']['Row'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anamnese: AnamneseRow | null;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function fmtDateShort(d: string | null) {
  if (!d) return '—';
  return format(new Date(d), 'dd/MM/yyyy', { locale: ptBR });
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

  const anamneseDocument = async () => {
    const [letterhead, patientRes, acceptances] = await Promise.all([
      loadClinicLetterhead(a.clinic_id),
      supabase.from('patients').select('full_name').eq('id', a.patient_id).maybeSingle(),
      loadAcceptancesSafe('anamnese', a.id),
    ]);
    return {
      html: buildAnamneseHtml({
        clinic: letterhead,
        patientName: patientRes.data?.full_name || '—',
        number: a.anamnese_number,
        title: a.title,
        createdAt: a.created_at,
        filledAt: a.filled_at,
        validatedAt: a.validated_at,
        expiresAt: a.expires_at,
        source: a.source_type,
        formData,
        acceptances,
      }),
      title: `Anamnese ${a.anamnese_number}`,
      filename: `Anamnese-${a.anamnese_number}`,
    };
  };

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
          {sections.length > 0 && <DocumentOutputButtons className="flex flex-wrap gap-2 pt-2" getDocument={anamneseDocument} />}
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
