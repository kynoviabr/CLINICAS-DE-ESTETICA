import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { CalendarDays, CheckCircle2, Copy, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BrandButton } from '@/components/ui/brand-button';
import { Checkbox } from '@/components/ui/checkbox';
import { DocumentOutputButtons } from '@/components/documents/DocumentOutputButtons';
import type { DocumentOutput } from '@/lib/documents/output';
import { loadPublicAcceptances, type AcceptanceSheetData } from '@/lib/documents/acceptances';
import { pixCopyPaste } from '@/lib/finance/pix';
import { appointmentWhat, appointmentWhen, buildDepositReceiptHtml, receiptDataFromPublic, type DepositPublic } from '@/lib/finance/deposit';
import { formatBRL } from '@/lib/proposals/sale';

const MESSAGES: Record<string, string> = {
  invalid: 'Link inválido. Confira se abriu o endereço completo.',
  expired: 'O prazo para pagar este sinal venceu. Fale com a clínica pelo WhatsApp antes de pagar.',
  cancelled: 'Esta cobrança foi cancelada pela clínica.',
};

/** Página aberta pela cliente (sem login): Pix do sinal e, depois de confirmado, o recibo. */
export default function PublicDepositPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<DepositPublic | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<AcceptanceSheetData | null>(null);
  const [acking, setAcking] = useState(false);

  const loadSheet = () => loadPublicAcceptances('deposit', token).then(setSheet).catch(() => setSheet(null));

  useEffect(() => {
    supabase.rpc('deposit_public', { p_token: token }).then(({ data: d, error: e }) => {
      const result = e ? ({ status: 'invalid' } as DepositPublic) : (d as unknown as DepositPublic);
      setData(result);
      setAccepted(!!result.policy_accepted_at);
      if (result.receipt) loadSheet();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const code = useMemo(() => (data?.status === 'pending' && data.pix
    ? pixCopyPaste({ key: data.pix.key, name: data.pix.name, city: data.pix.city, amount: Number(data.amount || 0), txid: data.txid })
    : ''), [data]);

  useEffect(() => {
    if (!code || !accepted) return;
    QRCode.toDataURL(code, { margin: 1, width: 260, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [code, accepted]);

  const accept = async (checked: boolean) => {
    if (!checked || accepted) return;
    setAccepting(true);
    setError('');
    const { error: e } = await supabase.rpc('deposit_accept_policy', { p_token: token });
    setAccepting(false);
    if (e) { setError(e.message); return; }
    setAccepted(true);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setError('Não foi possível copiar. Toque e segure no código para copiar.'); }
  };

  const receiptDocument = (): DocumentOutput => {
    const r = data && receiptDataFromPublic(data);
    if (!r) throw new Error('Recibo indisponível.');
    return { html: buildDepositReceiptHtml({ ...r, acceptances: sheet?.records }), title: `Recibo ${r.number}`, filename: `Recibo-${r.number}` };
  };

  const receiptAcked = !!sheet?.records.some((r) => r.documentKind === 'deposit_receipt');
  const ackReceipt = async () => {
    setAcking(true);
    setError('');
    const { error: e } = await supabase.rpc('deposit_receipt_ack', { p_token: token });
    if (e) setError(e.message);
    else await loadSheet();
    setAcking(false);
  };

  const appt = data?.appointment;
  const clinic = data?.clinic;
  const hasReceipt = !!data?.receipt;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-md px-4 py-6">
        <header className="mb-5 flex items-center gap-3">
          {clinic?.logo_url && <img src={clinic.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />}
          <div>
            <p className="font-heading text-lg font-semibold">{clinic?.name || 'Sinal do agendamento'}</p>
            <p className="text-xs text-muted-foreground">Sinal para garantir o horário</p>
          </div>
        </header>

        <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          {!data ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
          ) : MESSAGES[data.status] && !hasReceipt ? (
            <p className="py-6 text-center text-sm">{MESSAGES[data.status]}</p>
          ) : (
            <>
              {appt && (
                <div className="space-y-1">
                  <p className="font-medium">{data.first_name ? `Olá, ${data.first_name}!` : 'Olá!'}</p>
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="text-foreground first-letter:uppercase">{appointmentWhen(appt.start_time)}</span>
                      <span className="block">{appointmentWhat(appt.kind, appt.treatment)}{appt.professional ? ` com ${appt.professional}` : ''}</span>
                    </span>
                  </p>
                </div>
              )}

              {hasReceipt ? (
                <div className="space-y-3 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                  <div>
                    <p className="text-lg font-semibold">Sinal confirmado</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Recebemos {formatBRL(Number(data.amount || 0))}. {data.status === 'paid' ? 'Seu horário está garantido e o valor será abatido do seu atendimento.' : ''}
                    </p>
                  </div>
                  {receiptAcked ? (
                    <p className="flex items-center justify-center gap-1.5 text-sm text-emerald-700">
                      <ShieldCheck className="h-4 w-4" /> Você confirmou o recebimento deste recibo.
                    </p>
                  ) : sheet && (
                    <BrandButton size="md" variant="outline" className="w-full" onClick={ackReceipt} disabled={acking}>
                      {acking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Recebi e estou de acordo
                    </BrandButton>
                  )}
                  <DocumentOutputButtons size="md" className="grid grid-cols-2 gap-2" getDocument={receiptDocument} />
                  <p className="text-xs text-muted-foreground">Recibo nº {data.receipt?.number}</p>
                  {data.status === 'paid' && (
                    <p className="text-xs text-muted-foreground">Se precisar remarcar, avise a clínica com pelo menos {data.notice_hours} horas de antecedência e o sinal fica como crédito.</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-muted/50 p-4 text-center">
                    <p className="text-sm text-muted-foreground">Sinal</p>
                    <p className="font-heading text-3xl font-semibold">{formatBRL(Number(data.amount || 0))}</p>
                    {data.due_at && <p className="mt-1 text-xs text-muted-foreground">Pagar até {appointmentWhen(data.due_at).replace(/^[^,]+, /, '')}</p>}
                  </div>

                  <div className="space-y-2 rounded-xl border p-3 text-sm">
                    <p className="font-medium">Condições</p>
                    <p className="text-muted-foreground">{data.policy_text}</p>
                    <p className="text-muted-foreground">Avisando com pelo menos {data.notice_hours} horas de antecedência, você remarca e o sinal fica como crédito por {data.credit_days} dias.</p>
                    <label className="flex cursor-pointer items-start gap-3 pt-1">
                      <Checkbox checked={accepted} disabled={accepted || accepting} onCheckedChange={(v) => accept(v === true)} aria-label="Li e concordo com as condições" className="mt-0.5" />
                      <span className="font-medium">{accepting ? 'Registrando…' : 'Li e concordo com as condições'}</span>
                    </label>
                  </div>

                  {accepted ? (
                    <div className="space-y-3">
                      <p className="text-center text-sm font-medium">Pague pelo app do seu banco</p>
                      {qr && <img src={qr} alt="QR Code do Pix" className="mx-auto h-56 w-56 rounded-lg border bg-white p-2" />}
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">Ou use o Pix copia e cola:</p>
                        <p className="max-h-20 overflow-y-auto break-all rounded-lg border bg-muted/40 px-3 py-2 font-mono text-[11px]">{code}</p>
                        <BrandButton className="w-full" onClick={copy}>
                          {copied ? <><CheckCircle2 className="h-4 w-4" /> Código copiado</> : <><Copy className="h-4 w-4" /> Copiar código Pix</>}
                        </BrandButton>
                      </div>
                      {data.pix && <p className="text-center text-xs text-muted-foreground">O Pix vai para {data.pix.name}.</p>}
                      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs text-emerald-800">
                        Depois de pagar, a clínica confirma o recebimento e você recebe o recibo pelo WhatsApp.
                      </p>
                    </div>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">Marque "Li e concordo" para ver o QR Code e o código Pix.</p>
                  )}
                </>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Link pessoal. O pagamento vai direto para a conta da clínica.</p>
        </div>
      </div>
    </div>
  );
}
