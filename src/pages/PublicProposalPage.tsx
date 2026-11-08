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
import { formatBRL, whatsappLink } from '@/lib/proposals/sale';
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
    phone: string | null;
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
}

export default function PublicProposalPage() {
  const { id } = useParams<{ id: string }>();
  const [proposal, setProposal] = useState<PublicProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('Identificador da proposta não informado.');
      setLoading(false);
      return;
    }

    const fetchProposal = async () => {
      try {
        setLoading(true);
        const { data, error: rpcError } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)('get_public_proposal', {
          p_proposal_id: id,
        });

        if (rpcError) throw rpcError;
        if (!data) {
          setError('Proposta não encontrada ou expirada.');
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
  }, [id]);

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

  const handlePrint = () => {
    window.print();
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
      </main>

      {/* Barra Fixa Inferior de Ações para Mobile e Desktop */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3 px-4 z-30 shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <BrandButton
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="flex-1 sm:flex-initial h-11 text-xs sm:text-sm font-semibold border-slate-300 text-slate-700"
          >
            <Download className="w-4 h-4 mr-1.5 text-slate-500" /> Baixar PDF
          </BrandButton>

          <button
            type="button"
            onClick={handleOpenWhatsApp}
            className="flex-1 h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
          >
            <MessageCircle className="w-4 h-4" /> Aprovar no WhatsApp
          </button>
        </div>
      </footer>
    </div>
  );
}
