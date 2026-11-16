import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { CONSENT_KINDS, currentConsents, type ConsentRow } from '@/lib/lgpd/consents';

/** Ficha do paciente > Dados: consentimentos (LGPD), cópia dos dados e anonimização. */
export default function LgpdPanel({ patientId, patientName, isAdmin, anonymized }: { patientId: string; patientName: string; isAdmin: boolean; anonymized: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState('');
  const [showAnon, setShowAnon] = useState(false);
  const key = ['patient-consents', patientId];
  const { data: rows = [] } = useQuery({
    queryKey: key,
    queryFn: async () => (await supabase.from('patient_consents').select('kind, granted, source, note, created_at').eq('patient_id', patientId).order('created_at', { ascending: false })).data as ConsentRow[] || [],
  });
  const current = currentConsents(rows);

  const setConsent = async (kind: string, granted: boolean) => {
    const note = window.prompt(granted ? 'Como o paciente autorizou? (ex.: assinou termo em papel)' : 'Motivo da revogação (opcional):') ?? undefined;
    if (granted && note === undefined) return;
    const { error } = await supabase.rpc('set_patient_consent', { p_patient_id: patientId, p_kind: kind, p_granted: granted, p_note: note || null });
    if (error) { toast({ title: 'Não foi possível registrar', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: key });
    toast({ title: granted ? 'Consentimento registrado' : 'Consentimento revogado' });
  };

  const exportData = async () => {
    const { data, error } = await supabase.rpc('export_patient_data', { p_patient_id: patientId });
    if (error) { toast({ title: 'Não foi possível exportar', description: error.message, variant: 'destructive' }); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dados-${patientName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const anonymize = async () => {
    const { error } = await supabase.rpc('anonymize_patient', { p_patient_id: patientId, p_confirm: confirm });
    if (error) { toast({ title: 'Não foi possível anonimizar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Cadastro anonimizado', description: 'Dados pessoais apagados; prontuário clínico mantido pelo prazo legal.' });
    setShowAnon(false);
    qc.invalidateQueries();
  };

  return (
    <Card className="shadow-card">
      <CardHeader><CardTitle className="text-base">Privacidade e consentimentos (LGPD)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {anonymized && <p className="rounded-lg bg-muted p-3 text-sm">Cadastro anonimizado a pedido do paciente.</p>}
        <div className="divide-y rounded-lg border">
          {CONSENT_KINDS.map((k) => {
            const c = current[k.kind];
            return (
              <div key={k.kind} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{k.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {c ? `${c.granted ? 'Autorizado' : 'Não autorizado'} · ${c.source === 'anamnese' ? 'pela anamnese' : 'registrado pela equipe'} em ${format(new Date(c.created_at), 'dd/MM/yyyy')}${c.note ? ` · ${c.note}` : ''}` : 'Sem registro'}
                  </p>
                </div>
                <Switch checked={!!c?.granted} disabled={anonymized} onCheckedChange={(v) => setConsent(k.kind, v)} aria-label={k.label} />
              </div>
            );
          })}
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <BrandButton size="sm" variant="outline" onClick={exportData}><Download className="h-4 w-4" /> Exportar dados (pedido de cópia)</BrandButton>
            {!anonymized && <BrandButton size="sm" variant="outline" className="text-destructive" onClick={() => setShowAnon((v) => !v)}><ShieldAlert className="h-4 w-4" /> Anonimizar (pedido de exclusão)</BrandButton>}
          </div>
        )}
        {showAnon && (
          <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <p>Apaga nome, CPF, telefone, e-mail, nascimento e endereço, e desliga o acesso ao portal. O prontuário clínico (anamneses, sessões, contratos) fica guardado pelo prazo legal. Não dá para desfazer.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input placeholder="Digite ANONIMIZAR" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="bg-white sm:max-w-xs" />
              <BrandButton size="sm" className="bg-red-600 text-white hover:bg-red-700" disabled={confirm.trim().toUpperCase() !== 'ANONIMIZAR'} onClick={anonymize}>Anonimizar</BrandButton>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
