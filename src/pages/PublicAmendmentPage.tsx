import { useEffect, useState } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, FileSignature, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import AcceptForm from '@/components/public/AcceptForm';
import { signingError, type IdentityCheck } from '@/lib/signing/acceptance';
import { brDate, brl, describeInstallment, describeMethod, type CancellationCalc, type ItemsChanges, type PaymentChanges } from '@/lib/contracts/paymentAmendment';

type PublicAmendment = {
  ok: true;
  kind: string;
  contract_number: string;
  patient_name: string;
  clinic: { name: string; phone: string | null; logo_url: string | null; primary_color: string | null };
  reason: string;
  changes: PaymentChanges & ItemsChanges & CancellationCalc;
  identity_check: IdentityCheck;
  accepted: { accepted_at: string; name: string } | null;
  can_accept: boolean;
};

/** Paciente (sem login) confere e aceita a revisão (aditivo) do contrato. */
export default function PublicAmendmentPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicAmendment | null>(null);
  useDocumentTitle(data?.clinic?.name ? `Revisão do contrato · ${data.clinic.name}` : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  useEffect(() => {
    supabase.rpc('get_public_amendment', { p_token: token }).then(({ data: r, error: e }) => {
      const res = r as (PublicAmendment | { ok: false; reason: string }) | null;
      if (e || !res || res.ok === false) setError(signingError((res as { reason?: string } | null)?.reason));
      else setData(res as PublicAmendment);
    });
  }, [token]);

  const accept = async (fullName: string, identity: string) => {
    setBusy(true);
    setAcceptError('');
    const { data: r, error: e } = await supabase.rpc('accept_public_amendment', { p_token: token, p_full_name: fullName, p_identity: identity });
    setBusy(false);
    const res = r as { ok?: boolean; reason?: string; attempts_left?: number } | null;
    if (e || !res?.ok) {
      setAcceptError(e ? 'Não foi possível concluir agora. Fale com a clínica.' : signingError(res?.reason, res?.attempts_left));
      return;
    }
    setData((d) => d && ({ ...d, can_accept: false, accepted: { accepted_at: new Date().toISOString(), name: fullName.trim() } }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (error) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><p className="max-w-sm rounded-2xl border bg-white p-6 text-center text-sm">{error}</p></div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;

  const color = data.clinic.primary_color || '#059669';
  const ch = data.changes;
  return (
    <div className="min-h-screen bg-slate-100/70 pb-10">
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          {data.clinic.logo_url && <img src={data.clinic.logo_url} alt="" className="h-9 max-w-[120px] rounded object-contain" />}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{data.clinic.name}</p>
            <p className="text-[11px] text-slate-500">Revisão do contrato nº {data.contract_number}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        {data.accepted && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            <div className="text-sm text-emerald-900">
              <p className="font-semibold">{data.kind === 'cancellation' ? 'Cancelamento aceito' : 'Revisão aceita'}</p>
              <p>Por {data.accepted.name} em {format(new Date(data.accepted.accepted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}. {data.kind === 'cancellation' ? 'O contrato foi encerrado.' : 'A alteração já vale.'}</p>
            </div>
          </div>
        )}

        <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileSignature className="h-5 w-5" style={{ color }} /> {data.kind === 'cancellation' ? 'Termo de cancelamento do contrato' : data.kind === 'items' ? 'Alteração dos tratamentos' : 'Alteração da forma de pagamento'}</h1>
          <p className="text-sm text-slate-600">Olá, {data.patient_name.split(' ')[0]}. A clínica preparou esta alteração no seu contrato. {data.kind === 'cancellation' ? 'Conforme solicitado, este é o termo de cancelamento do seu contrato, com a conta do que foi pago, do que foi usado e do valor final.' : data.kind === 'items' ? 'Confira os tratamentos que entram e saem e como fica o valor.' : 'Os tratamentos e o valor total continuam os mesmos; muda só a forma de pagar o que ainda está em aberto.'}</p>
          <p className="text-sm text-slate-600"><span className="font-medium text-slate-800">Motivo:</span> {data.reason}</p>
          {data.kind === 'items' && (
            <div className="space-y-2 text-sm">
              {ch.remove?.length > 0 && (
                <div className="rounded-xl border bg-slate-50 p-3">
                  <p className="font-semibold text-slate-700">Sai do contrato</p>
                  <ul className="mt-1 space-y-0.5 text-slate-600">{ch.remove.map((r, n) => <li key={n}>{r.name}: {r.sessions} sessão(ões) não usada(s) · abate {brl(r.value)}</li>)}</ul>
                </div>
              )}
              {ch.add?.length > 0 && (
                <div className="rounded-xl border-2 p-3" style={{ borderColor: color }}>
                  <p className="font-semibold text-slate-900">Entra no contrato</p>
                  <ul className="mt-1 space-y-0.5 font-medium text-slate-800">{ch.add.map((a, n) => <li key={n}>{a.name}: {a.packages}x ({a.sessions} sessão(ões)) · {brl(a.value)}</li>)}</ul>
                </div>
              )}
              <div className="rounded-xl border bg-white p-3">
                <p className="font-semibold text-slate-900">Valor do contrato: {brl(ch.value_before)} → {brl(ch.value_after)}</p>
                {ch.delta > 0 && ch.payment && <p className="text-slate-600">A diferença de {brl(ch.delta)} fica assim: {ch.payment.methods.map(describeMethod).join(' + ')}. Primeiro vencimento: {brDate(ch.payment.first_due)}.</p>}
                {ch.delta < 0 && <p className="text-slate-600">A diferença de {brl(-ch.delta)} é abatida das parcelas que ainda não foram pagas{-ch.delta > ch.open_balance ? `; ${brl(-ch.delta - ch.open_balance)} ficam como crédito a devolver para você` : ''}.</p>}
                {ch.delta === 0 && <p className="text-slate-600">O valor não muda.</p>}
              </div>
            </div>
          )}
          {data.kind === 'cancellation' && (
            <div className="space-y-2 text-sm">
              {ch.items?.length > 0 && (
                <div className="rounded-xl border bg-slate-50 p-3">
                  <p className="font-semibold text-slate-700">Tratamentos usados</p>
                  <ul className="mt-1 space-y-0.5 text-slate-600">{ch.items.map((it, n) => <li key={n}>{it.name}: {it.used} de {it.contracted} sessões · {brl(it.used_value)}</li>)}</ul>
                </div>
              )}
              <div className="rounded-xl border-2 p-3" style={{ borderColor: color }}>
                <p>Valor pago: <b>{brl(ch.paid)}</b></p>
                <p>Sessões já feitas: − {brl(ch.used_value)}</p>
                <p>Multa de cancelamento ({ch.fee_percent}% sobre o valor não usado de {brl(ch.unused_value)}): − {brl(ch.fee)}</p>
                {ch.refund > 0 && <p className="mt-1 text-base font-bold text-emerald-700">Valor a devolver para você: {brl(ch.refund)}</p>}
                {ch.due > 0 && <p className="mt-1 text-base font-bold text-rose-700">Valor que ainda fica em aberto: {brl(ch.due)}</p>}
                {ch.refund === 0 && ch.due === 0 && <p className="mt-1 font-semibold">Não há valores a devolver nem a pagar.</p>}
              </div>
              <p className="text-xs text-slate-500">Com o aceite, o contrato é encerrado e as parcelas ainda não pagas são canceladas.{ch.due > 0 ? ' O valor em aberto vence em 7 dias.' : ''}{ch.refund > 0 ? ' A clínica vai combinar com você a forma da devolução.' : ''}</p>
            </div>
          )}
          {data.kind === 'payment' && ch?.after && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-slate-700">Como estava (em aberto: {brl(ch.open_balance)})</p>
                <ul className="mt-1 space-y-0.5 text-slate-500">{ch.before.map((i, n) => <li key={n} className="line-through">{describeInstallment(i)}</li>)}</ul>
              </div>
              <div className="rounded-xl border-2 p-3 text-sm" style={{ borderColor: color }}>
                <p className="font-semibold text-slate-900">Como fica</p>
                <ul className="mt-1 space-y-0.5 font-medium text-slate-800">{ch.after.methods.map((m, n) => <li key={n}>{describeMethod(m)}</li>)}</ul>
                <p className="mt-1 text-xs text-slate-500">Primeiro vencimento: {brDate(ch.after.first_due)}. As demais parcelas vencem uma por mês.</p>
              </div>
            </div>
          )}
        </section>

        {data.can_accept && (
          <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-base font-bold text-slate-900">Aceitar a alteração</p>
            <AcceptForm
              identityCheck={data.identity_check}
              agreeText={data.kind === 'cancellation' ? `Li e aceito o cancelamento do contrato nº ${data.contract_number}, com os valores acima.` : `Li e aceito a alteração ${data.kind === 'items' ? 'dos tratamentos' : 'da forma de pagamento'} do contrato nº ${data.contract_number}, conforme acima.`}
              buttonLabel={data.kind === 'cancellation' ? 'Aceitar cancelamento' : 'Aceitar alteração'}
              busy={busy}
              error={acceptError}
              color={color}
              onSubmit={accept}
            />
          </section>
        )}
      </main>
    </div>
  );
}
