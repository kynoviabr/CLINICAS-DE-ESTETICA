import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2, MessageCircle, QrCode, Receipt, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BrandButton } from '@/components/ui/brand-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useDepositConfig } from '@/hooks/useDepositConfig';
import { DEPOSIT_STATUS, defaultDepositAmount, type DepositStatus } from '@/lib/finance/deposit';
import { formatBRL } from '@/lib/proposals/sale';
import { formatCpf } from '@/lib/patients/validation';
import { errorMessage } from '@/lib/errors';
import type { Tables } from '@/integrations/supabase/types';
import { WhatsAppSendDialog, type WhatsAppSend } from './WhatsAppSendDialog';
import { depositReceiptDocument, prepareDepositReceipt, prepareDepositRequest } from './depositSend';
import { DocumentOutputButtons } from '@/components/documents/DocumentOutputButtons';

type Deposit = Tables<'appointment_deposits'>;

export type DepositAppointment = {
  id: string;
  clinicId: string;
  status: string;
  appointmentType: string;
  clientName: string;
  phone: string | null;
};

const OPEN_STATUSES = ['scheduled', 'confirmed', 'in_progress'];
const toNumber = (v: string) => Number(String(v).replace(/\./g, '').replace(',', '.'));
const when = (iso: string | null) => (iso ? format(new Date(iso), "dd/MM 'às' HH:mm") : '');

/** Sinal do agendamento: cobrar, enviar o Pix, confirmar o recebimento e enviar o recibo. */
export function AppointmentDepositPanel({ appt, onConfirmed }: { appt: DepositAppointment; onConfirmed?: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { config, ready } = useDepositConfig(appt.clinicId);
  const [mode, setMode] = useState<'idle' | 'charge' | 'confirm'>('idle');
  const [amount, setAmount] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerCpf, setPayerCpf] = useState('');
  const [send, setSend] = useState<WhatsAppSend | null>(null);

  const { data: deposits = [] } = useQuery({
    queryKey: ['appointment-deposits', appt.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointment_deposits').select('*')
        .eq('appointment_id', appt.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data as Deposit[];
    },
  });
  const current = deposits.find((d) => d.status !== 'cancelled') ?? null;
  const status = current?.status as DepositStatus | undefined;
  const overdue = status === 'pending' && current?.due_at && new Date(current.due_at) < new Date();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['appointment-deposits', appt.id] });
    qc.invalidateQueries({ queryKey: ['deposits'] });
    qc.invalidateQueries({ queryKey: ['dre'] });
  };

  const openSend = async (title: string, prepare: () => Promise<{ message: string; pdfFile?: File | null }>) => {
    setSend({ title, phone: appt.phone, status: 'preparing', message: '' });
    try {
      const r = await prepare();
      setSend({ title, phone: appt.phone, status: 'ready', message: r.message, pdfFile: r.pdfFile ?? null });
    } catch (err) {
      setSend({ title, phone: appt.phone, status: 'error', message: '', error: errorMessage(err, 'Tente de novo.') });
    }
  };
  const first = appt.clientName.split(/\s+/)[0] || 'a cliente';
  const sendRequest = (depositId: string, token?: string) =>
    openSend(`Enviar o Pix do sinal para ${first}`, async () => ({ message: await prepareDepositRequest(depositId, appt.clientName, token) }));
  const sendReceipt = (depositId: string, token?: string) =>
    openSend(`Enviar o recibo para ${first}`, () => prepareDepositReceipt(depositId, appt.clientName, token));

  const create = useMutation({
    mutationFn: async () => {
      const value = toNumber(amount);
      if (!(value > 0)) throw new Error('Informe o valor do sinal.');
      const { data, error } = await supabase.rpc('deposit_create', { p_appointment_id: appt.id, p_amount: value });
      if (error) throw error;
      return data as { id: string; token: string };
    },
    onSuccess: (r) => { refresh(); setMode('idle'); sendRequest(r.id, r.token); },
    onError: (err) => toast({ title: 'Não foi possível cobrar o sinal', description: errorMessage(err, 'Tente de novo.'), variant: 'destructive' }),
  });

  const confirm = useMutation({
    mutationFn: async (dep: Deposit) => {
      const { data, error } = await supabase.rpc('deposit_confirm', {
        p_deposit_id: dep.id, p_payer_name: payerName, ...(payerCpf.trim() ? { p_payer_cpf: payerCpf } : {}),
      });
      if (error) throw error;
      return { dep, ...(data as { receipt_number: string; token: string }) };
    },
    onSuccess: (r) => {
      refresh();
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setMode('idle');
      onConfirmed?.();
      toast({ title: 'Sinal recebido', description: `Horário confirmado. Recibo ${r.receipt_number}.` });
      sendReceipt(r.dep.id, r.token);
    },
    onError: (err) => toast({ title: 'Não foi possível confirmar', description: errorMessage(err, 'Tente de novo.'), variant: 'destructive' }),
  });

  const resolve = useMutation({
    mutationFn: async ({ dep, outcome }: { dep: Deposit; outcome: 'cancelled' | 'retained' | 'refunded' | 'paid' }) => {
      const { error } = await supabase.rpc('deposit_resolve', { p_deposit_id: dep.id, p_outcome: outcome });
      if (error) throw error;
      return outcome;
    },
    onSuccess: (outcome) => {
      refresh();
      toast({ title: { cancelled: 'Cobrança cancelada', retained: 'Sinal retido', refunded: 'Devolução registrada', paid: 'Sinal voltou a ser crédito' }[outcome] });
    },
    onError: (err) => toast({ title: 'Não foi possível alterar', description: errorMessage(err, 'Tente de novo.'), variant: 'destructive' }),
  });

  const ask = (text: string, fn: () => void) => { if (window.confirm(text)) fn(); };
  const busy = create.isPending || confirm.isPending || resolve.isPending;
  const canCharge = OPEN_STATUSES.includes(appt.status) && (!current || status === 'cancelled');

  return (
    <div className="space-y-2.5 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold"><QrCode className="h-4 w-4 text-primary" /> Sinal</span>
        {status && (
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${overdue ? 'border-destructive/30 bg-destructive/10 text-destructive' : DEPOSIT_STATUS[status].tone}`}>
            {overdue ? 'Prazo vencido' : DEPOSIT_STATUS[status].label}
          </span>
        )}
      </div>

      {!current && (
        canCharge ? (
          !ready ? (
            <p className="text-xs text-muted-foreground">
              Para cobrar sinal, cadastre a chave Pix em{' '}
              <Link to="/clinic/settings?aba=pagamentos" className="font-medium text-primary underline-offset-2 hover:underline">Configurações › Pagamentos</Link>.
            </p>
          ) : mode === 'charge' ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="dep-amount" className="text-xs">Valor do sinal (R$)</Label>
                <Input id="dep-amount" inputMode="decimal" className="h-9 w-28" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
              </div>
              <BrandButton size="sm" onClick={() => create.mutate()} disabled={busy}>{create.isPending ? 'Gerando…' : 'Gerar cobrança'}</BrandButton>
              <BrandButton size="sm" variant="ghost" onClick={() => setMode('idle')}>Cancelar</BrandButton>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Sem sinal. Cobre um valor para garantir o horário.</p>
              <BrandButton size="sm" variant="outline" onClick={() => { setAmount(String(defaultDepositAmount(config, appt.appointmentType)).replace('.', ',')); setMode('charge'); }}>
                Cobrar sinal
              </BrandButton>
            </div>
          )
        ) : <p className="text-xs text-muted-foreground">Sem sinal neste agendamento.</p>
      )}

      {current && status === 'pending' && (
        <div className="space-y-2">
          <p className="text-sm">
            <span className="font-semibold">{formatBRL(Number(current.amount))}</span>
            <span className={`ml-1 text-xs ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
              {current.due_at ? `· pagar até ${when(current.due_at)}` : ''}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {current.policy_accepted ? 'A cliente abriu o link e aceitou as condições.' : 'A cliente ainda não abriu o link.'}
          </p>
          {mode === 'confirm' ? (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Confira no app do banco se o Pix caiu. O recibo sai no nome de quem pagou.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="dep-payer" className="text-xs">Quem pagou</Label>
                  <Input id="dep-payer" className="h-9" value={payerName} onChange={(e) => setPayerName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dep-cpf" className="text-xs">CPF de quem pagou <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  <Input id="dep-cpf" className="h-9" inputMode="numeric" value={payerCpf} onChange={(e) => setPayerCpf(formatCpf(e.target.value))} />
                </div>
              </div>
              <div className="flex gap-2">
                <BrandButton size="sm" onClick={() => confirm.mutate(current)} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4" /> {confirm.isPending ? 'Confirmando…' : 'Confirmar recebimento'}
                </BrandButton>
                <BrandButton size="sm" variant="ghost" onClick={() => setMode('idle')}>Voltar</BrandButton>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <BrandButton size="sm" onClick={() => { setPayerName(appt.clientName); setPayerCpf(''); setMode('confirm'); }} disabled={busy}>
                <CheckCircle2 className="h-4 w-4" /> Recebi o sinal
              </BrandButton>
              <BrandButton size="sm" variant="outline" onClick={() => sendRequest(current.id)} disabled={busy}>
                <MessageCircle className="h-4 w-4" /> {overdue ? 'Cobrar de novo' : 'Enviar pelo WhatsApp'}
              </BrandButton>
              <BrandButton size="sm" variant="ghost" onClick={() => ask('Cancelar a cobrança do sinal? O link deixa de funcionar.', () => resolve.mutate({ dep: current, outcome: 'cancelled' }))} disabled={busy}>
                Cancelar cobrança
              </BrandButton>
            </div>
          )}
        </div>
      )}

      {current && status && status !== 'pending' && (
        <div className="space-y-2">
          <p className="text-sm">
            <span className="font-semibold">{formatBRL(Number(current.amount))}</span>
            <span className="ml-1 text-xs text-muted-foreground">
              {current.paid_at ? `· pago em ${format(new Date(current.paid_at), 'dd/MM')}` : ''}
              {current.payer_name && current.payer_name !== appt.clientName ? ` por ${current.payer_name}` : ''}
              {current.receipt_number ? ` · recibo ${current.receipt_number}` : ''}
            </span>
          </p>
          {status === 'paid' && <p className="text-xs text-muted-foreground">Crédito da cliente: abatido no contrato ou na sessão. Se faltar, fica retido automaticamente.</p>}
          <div className="flex flex-wrap gap-2">
            {current.receipt_number && (
              <BrandButton size="sm" variant="outline" onClick={() => sendReceipt(current.id)} disabled={busy}>
                <Receipt className="h-4 w-4" /> Enviar recibo
              </BrandButton>
            )}
            {current.receipt_number && <DocumentOutputButtons className="contents" disabled={busy} getDocument={() => depositReceiptDocument(current.id)} />}
            {status === 'paid' && (
              <>
                <BrandButton size="sm" variant="ghost" onClick={() => ask('Reter o sinal? Use quando a cliente faltou ou cancelou fora do prazo.', () => resolve.mutate({ dep: current, outcome: 'retained' }))} disabled={busy}>
                  Reter
                </BrandButton>
                <BrandButton size="sm" variant="ghost" onClick={() => ask('Registrar a devolução do sinal? Faça o Pix de volta pelo app do banco.', () => resolve.mutate({ dep: current, outcome: 'refunded' }))} disabled={busy}>
                  Devolver
                </BrandButton>
              </>
            )}
            {(status === 'retained' || status === 'refunded') && (
              <BrandButton size="sm" variant="ghost" onClick={() => resolve.mutate({ dep: current, outcome: 'paid' })} disabled={busy}>
                <RotateCcw className="h-4 w-4" /> Voltar para crédito
              </BrandButton>
            )}
          </div>
        </div>
      )}

      <WhatsAppSendDialog send={send} onClose={() => setSend(null)} />
    </div>
  );
}
