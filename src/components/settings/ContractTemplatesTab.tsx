import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FileText, Save, CheckCircle, Copy, AlertTriangle, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { renderContractTemplate, sanitizeContractTemplate } from '@/lib/contractTemplateRenderer';

type ContractTemplate = {
  id: string;
  name: string;
  version: number;
  status: string;
  title: string;
  content_html: string;
  created_at: string;
  activated_at: string | null;
  legal_reviewed_at: string | null;
  legal_review_notes: string | null;
};

const DUMMY_DATA = {
  clinic: {
    name: 'Clínica Exemplo',
    cnpj: '12.345.678/0001-90',
    address: 'Rua das Flores, 123',
    city: 'São Paulo',
    state: 'SP',
    phone: '(11) 99999-9999',
    email: 'contato@clinicaexemplo.com'
  },
  patient: {
    name: 'Maria da Silva',
    cpf: '111.222.333-44',
    birth_date: '01/01/1980',
    address: 'Av. Paulista, 1000'
  },
  contract: {
    number: '2026/001',
    date: '24/08/2026',
    start_date: '24/08/2026',
    end_date: '24/08/2027'
  },
  treatments: {
    summary: 'Botox Facial Completo',
    total_sessions: 3
  },
  payment: {
    total_value: 'R$ 1.500,00',
    condition: 'Parcelado',
    methods: 'Cartão de Crédito',
    installments: 3,
    due_dates: '24/09, 24/10, 24/11'
  },
  proposal: {
    number: 'PROP-001'
  },
  anamnesis: {
    number: 'ANAM-001'
  }
};

export default function ContractTemplatesTab() {
  const { clinicId, role } = useUserRole();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Partial<ContractTemplate> | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  
  const loadTemplates = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('contract_templates')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('version', { ascending: false });
      
    if (error) {
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  }, [clinicId, toast]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleCreateDraft = async (baseTemplate?: ContractTemplate) => {
    if (!clinicId) return;
    if (!baseTemplate) {
      toast({ title: 'Nenhum modelo base disponível', description: 'O template inicial precisa ser provisionado para a clínica.', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.rpc('duplicate_contract_template', {
      p_clinic_id: clinicId,
      p_source_template_id: baseTemplate.id,
    });
    if (error) {
      toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Rascunho criado' });
      loadTemplates();
    }
  };

  const handleSaveDraft = async () => {
    if (!editingTemplate || editingTemplate.status !== 'draft' || !editingTemplate.id) return;
    
    const sanitizedHtml = sanitizeContractTemplate(editingTemplate.content_html || '');
    const validation = renderContractTemplate(sanitizedHtml, DUMMY_DATA);
    if (!sanitizedHtml.trim() || validation.unknownPlaceholders.length > 0) {
      toast({ title: 'Modelo inválido', description: `Placeholders desconhecidos: ${validation.unknownPlaceholders.join(', ')}`, variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('contract_templates').update({
      title: editingTemplate.title,
      name: editingTemplate.name,
      content_html: sanitizedHtml
    }).eq('id', editingTemplate.id);
    
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Salvo com sucesso' });
      loadTemplates();
      setEditingTemplate(null);
    }
  };

  const handleActivate = async (templateId: string) => {
    if (!clinicId) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const validation = renderContractTemplate(template.content_html, DUMMY_DATA);
    if (validation.unknownPlaceholders.length || validation.missingRequired.length) {
      toast({ title: 'Modelo inválido', description: 'Corrija os placeholders antes de ativar.', variant: 'destructive' });
      return;
    }
    if (!confirm('Deseja ativar esta versão? A versão anterior será arquivada e contratos novos usarão este texto.')) return;
    
    try {
      const { error } = await supabase.rpc('activate_contract_template', { 
        p_template_id: templateId, 
        p_clinic_id: clinicId 
      });
      if (error) throw error;
      
      toast({ title: 'Template ativado!' });
      loadTemplates();
    } catch (err: unknown) {
      toast({ title: 'Erro ao ativar', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handlePreview = (html: string) => {
    const res = renderContractTemplate(html, DUMMY_DATA);
    setPreviewHtml(res.html);
  };

  if (role !== 'admin') {
    return <div className="p-4 text-center">Apenas administradores podem gerenciar modelos de contrato.</div>;
  }

  const activeTemplate = templates.find(t => t.status === 'active');
  const draftTemplates = templates.filter(t => t.status === 'draft');
  const archivedTemplates = templates.filter(t => t.status === 'archived');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Contrato Padrão</h2>
          <p className="text-sm text-muted-foreground">Gerencie o texto base para emissão de contratos.</p>
        </div>
        <Button onClick={() => handleCreateDraft(activeTemplate)}><FileText className="w-4 h-4 mr-2" />Nova Versão</Button>
      </div>
      
      {loading ? <p>Carregando...</p> : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <h3 className="font-semibold text-lg">Histórico de Versões</h3>
            
            {activeTemplate && (
              <Card className="border-primary/50 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base">{activeTemplate.name} (v{activeTemplate.version})</CardTitle>
                    <Badge className="bg-green-100 text-green-700">Ativo</Badge>
                  </div>
                  <CardDescription>
                    Ativado em: {activeTemplate.activated_at ? format(new Date(activeTemplate.activated_at), 'dd/MM/yyyy HH:mm', {locale: ptBR}) : '-'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!activeTemplate.legal_reviewed_at && (
                    <div className="flex items-start gap-2 text-yellow-700 bg-yellow-50 p-2 rounded-md text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>Este modelo não possui registro de revisão jurídica. Recomendamos homologação antes do uso oficial.</p>
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => handleCreateDraft(activeTemplate)}>
                    <Copy className="w-4 h-4 mr-2" />Duplicar para Rascunho
                  </Button>
                </CardContent>
              </Card>
            )}

            {draftTemplates.map(t => (
              <Card key={t.id} className="shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base">{t.name} (v{t.version})</CardTitle>
                    <Badge variant="secondary">Rascunho</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <Button variant="default" size="sm" className="flex-1" onClick={() => setEditingTemplate(t)}>Editar</Button>
                    <Button variant="outline" size="sm" onClick={() => handleActivate(t.id)}>Ativar</Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {archivedTemplates.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground mt-4">Versões Arquivadas</h4>
                {archivedTemplates.map(t => (
                  <div key={t.id} className="flex justify-between items-center p-2 rounded border text-sm text-muted-foreground bg-muted/20">
                    <span>v{t.version} - {t.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => handleCreateDraft(t)} title="Restaurar como rascunho">
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            {editingTemplate ? (
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Editando Versão {editingTemplate.version}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nome Interno</Label>
                      <Input value={editingTemplate.name} onChange={e => setEditingTemplate({...editingTemplate, name: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Título do Documento</Label>
                      <Input value={editingTemplate.title} onChange={e => setEditingTemplate({...editingTemplate, title: e.target.value})} />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="flex justify-between items-end">
                      Conteúdo HTML
                      <span className="text-xs text-muted-foreground font-normal">Use placeholders como {'{{patient.name}}'}</span>
                    </Label>
                    <Textarea 
                      className="font-mono text-sm min-h-[400px]" 
                      value={editingTemplate.content_html} 
                      onChange={e => setEditingTemplate({...editingTemplate, content_html: e.target.value})}
                    />
                  </div>
                  
                  <div className="flex gap-2 justify-end pt-4 border-t">
                    <Button variant="ghost" onClick={() => setEditingTemplate(null)}>Cancelar</Button>
                    <Button variant="outline" onClick={() => handlePreview(editingTemplate.content_html || '')}>
                      <Eye className="w-4 h-4 mr-2" />Preview
                    </Button>
                    <Button onClick={handleSaveDraft}><Save className="w-4 h-4 mr-2" />Salvar Rascunho</Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-muted/30 border-dashed h-full min-h-[400px] flex items-center justify-center text-muted-foreground">
                <p>Selecione um rascunho para editar ou crie uma nova versão.</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      {previewHtml !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold">Preview (Dados Fictícios)</h3>
              <Button variant="ghost" size="icon" onClick={() => setPreviewHtml(null)}>X</Button>
            </div>
            <div className="p-8 overflow-y-auto bg-gray-100 flex-1">
              <div className="bg-white mx-auto shadow-md max-w-3xl min-h-[800px] p-10 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }}></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
