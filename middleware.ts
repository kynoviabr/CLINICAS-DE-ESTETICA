// Prévia dos links do paciente (WhatsApp, Instagram, Facebook, Telegram…) com o nome e o logo da CLÍNICA.
// Só responde aos robôs que montam o cartão de prévia; pessoas seguem para o site normalmente.
// Roda na Vercel (Routing Middleware) antes do site.

export const config = {
  matcher: [
    '/proposta/:path*', '/p/:path*', '/anamnese/:path*', '/cadastro/:path*', '/sinal/:path*', '/agendamento/:path*',
    '/contrato/:path*', '/contrato-copia/:path*', '/aditivo/:path*', '/portal/entrar/:path*', '/agendar/:path*', '/indicar/:path*',
  ],
};

const BOTS = /whatsapp|facebookexternalhit|facebot|meta-externalagent|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|skypeuripreview|pinterest|vkshare|embedly|applebot/i;

const KIND_BY_PREFIX: Record<string, string> = {
  proposta: 'proposta', p: 'proposta', anamnese: 'anamnese', cadastro: 'cadastro', sinal: 'sinal', agendamento: 'agendamento',
  contrato: 'contrato', 'contrato-copia': 'contrato-copia', aditivo: 'aditivo', portal: 'portal', agendar: 'agendar', indicar: 'indicar',
};

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const next = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

export default async function middleware(request: Request) {
  if (!BOTS.test(request.headers.get('user-agent') || '')) return next();

  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const kind = KIND_BY_PREFIX[parts[0]];
  const token = parts[0] === 'portal' ? parts[2] : parts[1];
  let preview: { title: string; clinic_name: string; logo_url: string | null } | null = null;

  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (kind && token && base && key) {
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/rest/v1/rpc/link_preview`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_kind: kind, p_token: decodeURIComponent(token) }),
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) preview = await res.json();
    } catch { /* sem prévia da clínica: usa o texto neutro */ }
  }

  const clinic = preview?.clinic_name || 'Sua clínica';
  const title = preview ? `${preview.title} · ${clinic}` : 'Documento da sua clínica';
  const description = `Link seguro enviado por ${clinic}.`;
  const image = preview?.logo_url || '';
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(clinic)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url.href)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${image ? `<meta name="twitter:image" content="${esc(image)}">` : ''}
</head><body><p>${esc(title)}</p></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
