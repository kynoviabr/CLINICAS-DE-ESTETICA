// Zera a verificação em duas etapas de alguém da equipe (perdeu o celular).
// Só um administrador ativo da mesma clínica. Quem foi zerado cadastra o autenticador de novo no próximo acesso.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureError } from "../_shared/monitoring.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({})) as { clinicId?: string; userId?: string };
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Faça login de novo." }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const clinicId = String(body.clinicId || ""), target = String(body.userId || "");
    const { data: isAdmin } = await admin.rpc("has_clinic_role", { _user_id: user.id, _clinic_id: clinicId, _role: "admin" });
    if (!isAdmin) return json({ error: "Só administradores da clínica." }, 403);
    const { data: member } = await admin.from("user_roles").select("id").eq("clinic_id", clinicId).eq("user_id", target).limit(1).maybeSingle();
    if (!member) return json({ error: "Pessoa não é da equipe desta clínica." }, 404);
    const { data: factors, error } = await admin.auth.admin.mfa.listFactors({ userId: target });
    if (error) throw error;
    for (const f of factors?.factors || []) await admin.auth.admin.mfa.deleteFactor({ userId: target, id: f.id });
    return json({ ok: true, removed: factors?.factors?.length || 0 });
  } catch (e) {
    await captureError("mfa-reset", e);
    return json({ error: "Não foi possível zerar." }, 500);
  }
});
