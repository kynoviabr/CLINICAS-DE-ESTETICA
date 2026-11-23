import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { identityLabel, identityReady, type IdentityCheck } from '@/lib/signing/acceptance';

/** Formulário de aceite/assinatura: nome completo, um dado do cadastro e concordância. */
export default function AcceptForm({ identityCheck, agreeText, buttonLabel, busy, error, color, onSubmit }: {
  identityCheck: IdentityCheck;
  agreeText: string;
  buttonLabel: string;
  busy: boolean;
  error: string;
  color?: string | null;
  onSubmit: (fullName: string, identity: string) => void;
}) {
  const [name, setName] = useState('');
  const [identity, setIdentity] = useState('');
  const [agree, setAgree] = useState(false);
  const label = identityLabel(identityCheck);
  const ready = name.trim().split(/\s+/).length >= 2 && identityReady(identityCheck, identity) && agree && !busy;

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready) onSubmit(name, identity); }}>
      <div className="space-y-1.5">
        <Label htmlFor="acc-name">Seu nome completo</Label>
        <Input id="acc-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 text-base" placeholder="Como está no seu cadastro" />
      </div>
      {label && (
        <div className="space-y-1.5">
          <Label htmlFor="acc-id">{label}</Label>
          {identityCheck === 'birth_date'
            ? <Input id="acc-id" type="date" value={identity} onChange={(e) => setIdentity(e.target.value)} className="h-12 text-base" />
            : <Input id="acc-id" inputMode="numeric" maxLength={3} value={identity} onChange={(e) => setIdentity(e.target.value.replace(/\D/g, ''))} className="h-12 text-base" placeholder="000" />}
        </div>
      )}
      <label className="flex items-start gap-3 text-sm">
        <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" aria-label="Concordo" />
        <span>{agreeText}</span>
      </label>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button type="submit" disabled={!ready}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white shadow-sm transition disabled:opacity-50"
        style={{ backgroundColor: color || '#059669' }}>
        {busy && <Loader2 className="h-5 w-5 animate-spin" />} {buttonLabel}
      </button>
      <p className="flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> Registramos data, hora, aparelho e endereço de rede como prova do aceite.</p>
    </form>
  );
}
