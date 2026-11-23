/** Aparelho em português a partir do user-agent. Ex.: "iPhone · iOS 18.1 · Safari". */
export function deviceLabel(userAgent?: string | null): string {
  const ua = (userAgent || '').trim();
  if (!ua) return 'Não informado';

  const ver = (re: RegExp) => (ua.match(re)?.[1] || '').replace(/_/g, '.');
  let device = '';
  let os = '';
  if (/iPhone/.test(ua)) { device = 'iPhone'; os = `iOS ${ver(/OS (\d+[_.]\d+)/)}`.trim(); }
  else if (/iPad/.test(ua)) { device = 'iPad'; os = `iPadOS ${ver(/OS (\d+[_.]\d+)/)}`.trim(); }
  else if (/Android/.test(ua)) {
    const model = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/)?.[1]?.trim();
    device = model && !/^(K|wv)$/.test(model) ? model : 'Celular Android';
    os = `Android ${ver(/Android (\d+(?:\.\d+)?)/)}`.trim();
  }
  else if (/Windows NT/.test(ua)) { device = 'Computador'; os = 'Windows'; }
  else if (/Macintosh|Mac OS X/.test(ua)) { device = 'Mac'; os = `macOS ${ver(/Mac OS X (\d+[_.]\d+)/)}`.trim(); }
  else if (/CrOS/.test(ua)) { device = 'Chromebook'; os = 'ChromeOS'; }
  else if (/Linux/.test(ua)) { device = 'Computador'; os = 'Linux'; }

  let browser = '';
  if (/WhatsApp/i.test(ua)) browser = 'navegador do WhatsApp';
  else if (/Instagram/i.test(ua)) browser = 'navegador do Instagram';
  else if (/FBAN|FBAV/.test(ua)) browser = 'navegador do Facebook';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Firefox|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  else if (/iPhone|iPad/.test(ua)) browser = 'app no iPhone';

  const label = [device, os, browser].filter(Boolean).join(' · ');
  return label || ua.slice(0, 80);
}
