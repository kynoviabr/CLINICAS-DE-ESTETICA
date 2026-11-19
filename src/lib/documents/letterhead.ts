/** Dados da clínica para o cabeçalho de orçamentos e contratos. */
export type ClinicLetterhead = {
  name: string;
  document?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  accentColor?: string | null;
};

export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** CNPJ (14 dígitos) ou CPF (11) formatado; outro texto volta como veio. */
export function formatClinicDocument(value?: string | null): string {
  const d = (value || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return (value || '').trim();
}

export const accentOf = (color?: string | null) => (/^#[0-9a-f]{6}$/i.test(color || '') ? color! : '#1a7a6d');

/** Linhas de contato da clínica (sem vazios). */
export function letterheadLines(c: ClinicLetterhead): string[] {
  const doc = formatClinicDocument(c.document);
  const docLabel = doc.replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ';
  const place = [c.city, c.state].filter(Boolean).join('/');
  const address = [c.address, place, c.zipCode ? `CEP ${c.zipCode}` : ''].filter(Boolean).join(' · ');
  return [
    doc ? `${docLabel} ${doc}` : '',
    address,
    [c.phone, c.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
}

/** Cabeçalho timbrado (logo à esquerda, dados à direita). Todo texto é escapado. */
export function buildLetterhead(c: ClinicLetterhead): string {
  const accent = accentOf(c.accentColor);
  const logo = c.logoUrl && /^https:\/\//.test(c.logoUrl)
    ? `<img src="${escapeHtml(c.logoUrl)}" alt="" style="height:56px;max-width:170px;object-fit:contain" crossorigin="anonymous">`
    : '';
  const lines = letterheadLines(c).map((l) => `<div>${escapeHtml(l)}</div>`).join('');
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:3px solid ${accent};padding-bottom:12px;margin-bottom:18px;font-family:Arial,sans-serif">
    <div style="display:flex;align-items:center;gap:12px">
      ${logo}
      <div style="font-size:20px;font-weight:bold;color:#111827">${escapeHtml(c.name)}</div>
    </div>
    <div style="text-align:right;color:#4b5563;font-size:11px;line-height:1.5">${lines}</div>
  </div>`;
}

/** Rodapé discreto dos documentos. */
export const documentFooter = (text: string) =>
  `<div style="margin-top:28px;padding-top:8px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px;font-family:Arial,sans-serif">${escapeHtml(text)}</div>`;
