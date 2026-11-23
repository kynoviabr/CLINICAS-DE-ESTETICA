import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

const TOKEN_KEY = 'klinova.pushToken';
const store = (v: string | null) => { try { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch { /* sem armazenamento */ } };
const stored = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };

/**
 * Notificações ligadas neste build? Precisa do Firebase configurado (Android: google-services.json)
 * e, no iPhone, da conta Apple com a capacidade Push. Sem isso o app funciona normalmente, só sem push.
 */
export const pushEnabled = () => Capacitor.isNativePlatform() && import.meta.env.VITE_PUSH_ENABLED === '1';

let started = false;

/** Pede permissão, registra o aparelho na conta logada e trata o toque na notificação. */
export async function initPush(onOpen: (url: string) => void) {
  if (!pushEnabled()) return;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  if (started) {
    // Novo login no mesmo aparelho: registra de novo para a conta atual.
    if ((await PushNotifications.checkPermissions()).receive === 'granted') await PushNotifications.register();
    return;
  }
  started = true;

  await PushNotifications.addListener('registration', async ({ value }) => {
    store(value);
    const { error } = await supabase.rpc('register_push_device', { p_token: value, p_platform: Capacitor.getPlatform() });
    if (error) console.warn('push: registro falhou', error.message);
  });
  await PushNotifications.addListener('registrationError', (e) => console.warn('push: erro no registro', e.error));
  await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const url = (notification.data as { url?: string } | undefined)?.url;
    if (url && url.startsWith('/')) onOpen(url);
  });

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
  if (perm.receive === 'granted') await PushNotifications.register();
}

/** Ao sair da conta: tira o aparelho, para não receber avisos de quem entrar depois. */
export async function unregisterPush() {
  const token = stored();
  if (!pushEnabled() || !token) return;
  await supabase.rpc('unregister_push_device', { p_token: token });
  store(null);
}
