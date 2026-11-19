-- Notificações no celular (app iOS/Android).
-- 1) Cada aparelho logado registra seu token de notificação (só o dono vê e mexe).
-- 2) Todo aviso novo em notifications (agendamento online, confirmação/cancelamento/remarcação pelo link, etc.)
--    para alguém com aparelho registrado chama a função "push", que entrega pelo Firebase (Android) e Apple (iPhone).
--    Sem pg_net ou sem os segredos no Vault, nada é chamado e o aviso continua só no sino do sistema.

CREATE TABLE IF NOT EXISTS public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_devices_user_idx ON public.push_devices (user_id);
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own push devices" ON public.push_devices;
CREATE POLICY "Own push devices" ON public.push_devices FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.push_devices FROM anon, authenticated;

-- O app registra o aparelho após o login (o mesmo aparelho pode trocar de usuário).
CREATE OR REPLACE FUNCTION public.register_push_device(p_token text, p_platform text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '42501'; END IF;
  IF p_platform NOT IN ('ios', 'android') OR length(coalesce(p_token, '')) NOT BETWEEN 20 AND 4096 THEN
    RAISE EXCEPTION 'Aparelho inválido.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.push_devices (user_id, platform, token) VALUES (auth.uid(), p_platform, p_token)
  ON CONFLICT (token) DO UPDATE SET user_id = auth.uid(), platform = excluded.platform, last_seen_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.register_push_device(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_device(text, text) TO authenticated;

-- Ao sair da conta, o app tira o aparelho (para não receber avisos de outra pessoa).
CREATE OR REPLACE FUNCTION public.unregister_push_device(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.push_devices WHERE token = p_token AND user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.unregister_push_device(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unregister_push_device(text) TO authenticated;

-- Aviso novo -> notificação no celular (só se a pessoa tem aparelho; nunca bloqueia o aviso).
CREATE OR REPLACE FUNCTION private.notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_url text; v_token text;
BEGIN
  IF NEW.user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.push_devices WHERE user_id = NEW.user_id) THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN RETURN NEW; END IF;
  BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
    SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'automations_runner_token';
    IF v_url IS NULL OR v_token IS NULL THEN RETURN NEW; END IF;
    PERFORM net.http_post(
      url := v_url || '/functions/v1/push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-runner-token', v_token),
      body := jsonb_build_object('notification_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push não enviado: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notifications_push ON public.notifications;
CREATE TRIGGER notifications_push AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION private.notification_push();
