import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText,
  Calendar,
  Clock,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  Download,
  MessageCircle,
  AlertCircle,
  Loader2,
  ShieldCheck
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BrandButton } from '@/components/ui/brand-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildProposalHtml, formatBRL, whatsappLink } from '@/lib/proposals/sale';
import { buildSignatureSheet } from '@/lib/documents/signatureSheet';
import { loadPublicAcceptances } from '@/lib/documents/acceptances';
import { downloadDocumentPdf, type DocumentOutput } from '@/lib/documents/output';
import { DocumentOutputButtons } from '@/components/documents/DocumentOutputButtons';
import { toast } from 'sonner';
import { proposalLinkErrorMessage } from '@/lib/proposals/publicLink';
import AcceptForm from '@/components/public/AcceptForm';
import { signingError, type IdentityCheck } from '@/lib/signing/acceptance';
import { buildPaymentPresetSummary, parseProposalNotesPayload } from '@/lib/proposals/paymentPreset';

interface PublicProposalData {
  id: string;
  proposal_number: string;
  created_at: string;
  valid_until: string | null;
  status: string;
  total_amount: number;
  final_amount: number;
  discount_amount: number | null;
  discount_percent: number | null;
  notes: string | null;
  patient: {
    full_name: string | null;
  };
  clinic: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    state: string | null;
    address: string | null;
    primary_color: string | null;
    logo_url: string | null;
  };
  items: Array<{
    id: string;
    treatment_id: string;
    treatment_name: string;
    quantity: number;
    unit_price: number;
    num_sessions: number | null;
  }>;
  acceptance: { accepted_at: string; signer_name: string } | null;
  identity_check: IdentityCheck;
  can_accept: boolean;
}

export default function PublicProposalPage() {
  const { id: token } = useParams<{ id: string }>();
  const [proposal, setProposal] = useState<PublicProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [showAccept, setShowAccept] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(proposalLinkErrorMessage('invalid'));
      setLoading(false);
      return;
    }

    const fetchProposal = async () => {
      try {
        setLoading(true);
        const { data, error: rpcError } = await supabase.rpc('get_public_proposal', {
          p_token: token,
        });

        if (rpcError) throw rpcError;
        const res = data as { ok?: boolean; reason?: string } | null;
        if (!res || res.ok === false) {
          setError(proposalLinkErrorMessage(res?.reason));
          return;
        }

        setProposal(data as unknown as PublicProposalData);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Não foi possível carregar a proposta.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchProposal();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-600">Carregando sua proposta oficial...</p>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">Proposta não localizada</h1>
          <p className="text-sm text-slate-600">{error || 'Verifique se o link foi copiado corretamente ou entre em contato com a clínica.'}</p>
        </div>
      </div>
    );
  }

  const { clinic, patient, items } = proposal;
  const parsedNotes = parseProposalNotesPayload(proposal.notes);
  const paymentSummary = buildPaymentPresetSummary(parsedNotes.paymentPreset);
  const clientFirstName = patient?.full_name?.split(' ')[0] || 'Cliente';
  const hasDiscount = Number(proposal.discount_amount || 0) > 0;
  const standardTotal = Number(proposal.total_amount || proposal.final_amount);
  const finalTotal = Number(proposal.final_amount);
  const validityDate = proposal.valid_until
    ? format(new Date(`${proposal.valid_until}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR })
    : null;

  const handleAccept = async (fullName: string, identity: string) => {
    setAccepting(true);
    setAcceptError('');
    const { data, error: rpcError } = await supabase.rpc('accept_public_proposal', { p_token: token!, p_full_name: fullName, p_identity: identity });
    setAccepting(false);
    const r = data as { ok?: boolean; reason?: string; attempts_left?: number } | null;
    if (rpcError || !r?.ok) { setAcceptError(signingError(r?.reason, r?.attempts_left)); return; }
    setProposal({ ...proposal, status: 'accepted', can_accept: false, acceptance: { accepted_at: new Date().toISOString(), signer_name: fullName.trim() } });
    setShowAccept(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const proposalDocument = async (): Promise<DocumentOutput> => {
    const { records, documentHash } = await loadPublicAcceptances('proposal', token!);
    const html = buildProposalHtml({
      clinicName: clinic.name,
      clinic: { name: clinic.name, address: clinic.address, city: clinic.city, state: clinic.state, phone: clinic.phone, email: clinic.email, logoUrl: clinic.logo_url, accentColor: clinic.primary_color },
      number: proposal.proposal_number,
      date: new Date(proposal.created_at),
      validUntil: proposal.valid_until,
      clientName: patient?.full_name || '—',
      items: items.map((i) => ({ treatment_id: i.treatment_id, name: i.treatment_name || '—', quantity: i.quantity, unit_price: Number(i.unit_price), min_price: null })),
      total: finalTotal,
      standardTotal,
      discountAmount: Number(proposal.discount_amount || 0),
      discountPercent: Number(proposal.discount_percent || 0),
      paymentSummary,
      notes: parsedNotes.plainNotes || undefined,
    }) + buildSignatureSheet({ documentLabel: `Proposta nº ${proposal.proposal_number}`, documentHash, records, pendingText: 'Aguardando aceite' });
    return { html, title: `Proposta ${proposal.proposal_number}`, filename: `Proposta-${proposal.proposal_number}` };
  };

  const handlePrint = async () => {
    setPdfBusy(true);
    try { await downloadDocumentPdf(await proposalDocument()); }
    catch { toast.error('Não foi possível gerar o PDF agora. Tente de novo.'); }
    finally { setPdfBusy(false); }
  };

  const handleOpenWhatsApp = () => {
    const clinicContact = clinic.phone;
    const text = `Olá, aqui é ${clientFirstName}! Acessei minha proposta nº ${proposal.proposal_number} e gostaria de conversar/aprovar!`;
    const url = whatsappLink(clinicContact, text);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-slate-100/70 pb-24 text-slate-800 font-sans antialiased">
      {/* Top Banner da Clínica */}
      <header className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {clinic.logo_url ? (
              <img
                src={clinic.logo_url}
                alt={clinic.name}
                className="h-9 max-w-[130px] object-contain rounded"
              />
            ) : (
              <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                {clinic.name.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                {clinic.name}
              </h1>
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" /> Proposta Comercial Oficial
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
              Nº {proposal.proposal_number}
            </span>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Card de Boas-vindas ao Paciente */}
        <Card className="border-0 shadow-sm bg-gradient-to-br from-white via-white to-emerald-50/40 rounded-2xl overflow-hidden">
          <CardContent className="p-5 sm:p-6 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" /> Tratamento Personalizado
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              Olá, {clientFirstName}!
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Preparamos com carinho este plano de atendimento sob medida para você na <strong>{clinic.name}</strong>. Veja abaixo todos os detalhes dos procedimentos e valores especiais.
            </p>

            <div className="flex flex-wrap items-center gap-y-2 gap-x-4 pt-2 text-xs text-slate-500 border-t border-slate-100">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Emissão: {format(new Date(proposal.created_at), 'dd/MM/yyyy')}
              </span>
              {validityDate && (
                <span className="flex items-center gap-1 text-emerald-700 font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  Válido até: <strong>{validityDate}</strong>
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card dos Tratamentos */}
        <Card className="border-0 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" /> Procedimentos Selecionados
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-100">
            {items.map((item, idx) => (
              <div key={item.id || idx} className="p-4 sm:p-5 flex items-start justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                <div className="space-y-1 flex-1">
                  <h3 className="font-semibold text-sm sm:text-base text-slate-900">
                    {item.treatment_name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                      Qtd: {item.quantity}
                    </span>
                    {item.num_sessions && item.num_sessions > 1 && (
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-medium">
                        {item.num_sessions} sessões incluídas
                      </span>
                    )}
                    <span>Valor unitário: {formatBRL(Number(item.unit_price))}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-sm sm:text-base font-bold text-slate-900">
                    {formatBRL(Number(item.unit_price) * item.quantity)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Resumo Financeiro & Condições */}
        <Card className="border-0 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="space-y-2 border-b border-slate-100 pb-4">
              {hasDiscount && (
                <>
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Valor Padrão:</span>
                    <span>{formatBRL(standardTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-emerald-600 font-semibold">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Desconto Especial Aplicado:
                    </span>
                    <span>- {formatBRL(Number(proposal.discount_amount))}{proposal.discount_percent ? ` (${proposal.discount_percent}%)` : ''}</span>
                  </div>
                </>
              )}

              <div className="flex justify-between items-baseline pt-2">
                <span className="text-base sm:text-lg font-bold text-slate-900">Total do Plano:</span>
                <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600">
                  {formatBRL(finalTotal)}
                </span>
              </div>
            </div>

            {/* Condições de pagamento */}
            {paymentSummary && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-1">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Condições de Pagamento
                </p>
                <p className="text-sm text-slate-800 font-medium">
                  {paymentSummary}
                </p>
              </div>
            )}

            {/* Observações */}
            {parsedNotes.plainNotes && (
              <div className="text-xs text-slate-500 space-y-1">
                <p className="font-semibold text-slate-700">Observações:</p>
                <p className="whitespace-pre-line">{parsedNotes.plainNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Informações de Contato da Clínica */}
        <div className="rounded-2xl border bg-white p-5 text-xs text-slate-500 space-y-2">
          <p className="font-bold text-slate-800 text-sm">Dúvidas ou agendamento?</p>
          <div className="flex flex-wrap gap-4 pt-1">
            {clinic.phone && (
              <a href={`tel:${clinic.phone}`} className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors">
                <Phone className="w-3.5 h-3.5 text-slate-400" /> {clinic.phone}
              </a>
            )}
            {clinic.email && (
              <a href={`mailto:${clinic.email}`} className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors">
                <Mail className="w-3.5 h-3.5 text-slate-400" /> {clinic.email}
              </a>
            )}
            {(clinic.address || clinic.city) && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {[clinic.address, clinic.city, clinic.state].filter(Boolean).join(', ')}
              </span>
            )}
          </div>
        </div>

        {proposal.acceptance ? (
          <Card className="rounded-2xl border-emerald-200 bg-emerald-50 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
              <div>
                <p className="font-semibold text-emerald-900">Proposta aceita</p>
                <p className="text-sm text-emerald-800">
                  Aceita por {proposal.acceptance.signer_name} em {format(new Date(proposal.acceptance.accepted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}. A clínica vai enviar o contrato para você assinar.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : proposal.can_accept && (
          <Card id="aceite" className="rounded-2xl border-0 bg-white shadow-sm">
            <CardContent className="space-y-3 p-5 sm:p-6">
              <p className="text-base font-bold text-slate-900">Aceitar proposta</p>
              {showAccept ? (
                <AcceptForm
                  identityCheck={proposal.identity_check}
                  agreeText={`Li e aceito a proposta nº ${proposal.proposal_number}, no valor de ${formatBRL(finalTotal)}, com os tratamentos e condições acima.`}
                  buttonLabel="Aceitar proposta"
                  busy={accepting}
                  error={acceptError}
                  color={clinic.primary_color}
                  onSubmit={handleAccept}
                />
              ) : (
                <p className="text-sm text-slate-600">Gostou? Aceite aqui mesmo, pelo celular. Depois a clínica envia o contrato para você assinar.</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="rounded-2xl border-0 bg-white shadow-sm">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Cópia da proposta</p>
              <p className="text-xs text-slate-500">Guarde o PDF ou imprima, se precisar.</p>
            </div>
            <DocumentOutputButtons className="grid grid-cols-2 gap-2 sm:flex" getDocument={proposalDocument} />
          </CardContent>
        </Card>
      </main>

      {/* Barra Fixa Inferior de Ações para Mobile e Desktop */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3 px-4 z-30 shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <BrandButton
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={pdfBusy}
            className="flex-1 sm:flex-initial h-11 text-xs sm:text-sm font-semibold border-slate-300 text-slate-700"
          >
            {pdfBusy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin text-slate-500" /> : <Download className="w-4 h-4 mr-1.5 text-slate-500" />} {pdfBusy ? 'Gerando…' : 'Baixar PDF'}
          </BrandButton>

          {proposal.can_accept && !proposal.acceptance ? (
            <button
              type="button"
              onClick={() => { setShowAccept(true); setTimeout(() => document.getElementById('aceite')?.scrollIntoView({ behavior: 'smooth' }), 50); }}
              className="flex-1 h-11 px-4 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
              style={{ backgroundColor: clinic.primary_color || '#059669' }}
            >
              <CheckCircle2 className="w-4 h-4" /> Aceitar proposta
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="flex-1 h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            >
              <MessageCircle className="w-4 h-4" /> Falar no WhatsApp
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
