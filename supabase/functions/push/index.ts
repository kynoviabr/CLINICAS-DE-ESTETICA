// Entrega um aviso (tabela notifications) como notificação nos celulares da pessoa.
// Chamado pelo banco a cada aviso novo (gatilho notifications_push), com x-runner-token do Vault.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPush } from "../_shared/push.ts";
import { captureError } from "../_shared/monitoring.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const given = req.headers.get("x-runner-token") || "";
    const expected = (Deno.env.get("AUTOMATIONS_RUNNER_TOKEN") || "").trim();
    const ok = expected ? given === expected : !!(await db.rpc("automations_token_ok", { p_token: given })).data;
    if (!ok) return json({ ok: false, reason: "unauthorized" }, 401);

    const { notification_id } = await req.json().catch(() => ({})) as { notification_id?: string };
    if (!notification_id) return json({ ok: false, reason: "missing_notification" }, 400);
    const { data: n } = await db.from("notifications").select("id, user_id, title, message").eq("id", notification_id).maybeSingle();
    if (!n?.user_id) return json({ ok: true, sent: 0 });

    const { data: devices } = await db.from("push_devices").select("id, platform, token").eq("user_id", n.user_id);
    const msg = { title: n.title, body: n.message || "", url: "/clinic/appointments" };
    const out = { sent: 0, invalid: 0, not_configured: 0, error: 0 };
    for (const d of devices || []) {
      const r = await sendPush(d.platform as "ios" | "android", d.token, msg).catch(async (e) => { await captureError("push", e); return "error" as const; });
      if (r === "sent") out.sent += 1;
      else if (r === "invalid_token") { out.invalid += 1; await db.from("push_devices").delete().eq("id", d.id); }
      else if (r === "not_configured") out.not_configured += 1;
      else out.error += 1;
    }
    return json({ ok: true, ...out });
  } catch (e) {
    await captureError("push", e);
    return json({ ok: false, error: "Erro inesperado." }, 500);
  }
});
