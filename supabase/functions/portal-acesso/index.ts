// Entrada no portal do paciente sem senha (épico 13).
// POST { token, identity } -> confere o link (portal_link_check), garante a conta do paciente
// e devolve um código de uso único que o navegador troca por uma sessão (verifyOtp magiclink).
// Paciente sem e-mail ganha uma conta interna (e-mail técnico que nunca recebe mensagens).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureError } from "../_shared/monitoring.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const technicalEmail = (patientId: string) => `paciente-${patientId}@portal.klinova.app`;

/** Conta de login do paciente: a já ligada, a do e-mail do cadastro (se livre) ou uma conta técnica. */
async function ensureAccount(db: SupabaseClient, patientId: string, clinicId: string) {
  const { data: p } = await db.from("patients").select("id, full_name, email, user_id").eq("id", patientId).single();
  const { data: linked } = await db.from("patient_users").select("auth_user_id").eq("patient_id", patientId).eq("clinic_id", clinicId).eq("status", "active").limit(1).maybeSingle();
  let userId: string | null = linked?.auth_user_id || p.user_id || null;
  let email: string | null = null;

  if (userId) {
    const { data } = await db.auth.admin.getUserById(userId);
    email = data?.user?.email ?? null;
    if (!email) userId = null;
  }
  if (!userId) {
    const own = (p.email || "").trim().toLowerCase();
    let target = technicalEmail(patientId);
    if (own) {
      const { data: found } = await db.rpc("find_auth_user_by_email", { p_email: own });
      const existing = (found as Array<{ id: string }> | null)?.[0];
      // E-mail já usado por outra conta (ex.: alguém da equipe): não junta; usa a conta técnica.
      if (!existing) target = own;
    }
    const { data: found2 } = await db.rpc("find_auth_user_by_email", { p_email: target });
    const reuse = (found2 as Array<{ id: string }> | null)?.[0];
    if (reuse) userId = reuse.id;
    else {
      const { data, error } = await db.auth.admin.createUser({ email: target, email_confirm: true, user_metadata: { full_name: p.full_name, role: "patient" } });
      if (error || !data.user) throw error || new Error("Não foi possível criar o acesso.");
      userId = data.user.id;
    }
    email = target;
  }
  await db.from("patient_users").upsert({ patient_id: patientId, clinic_id: clinicId, auth_user_id: userId, status: "active" }, { onConflict: "clinic_id,patient_id,auth_user_id" });
  if (!p.user_id) await db.from("patients").update({ user_id: userId }).eq("id", patientId);
  return email!;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, reason: "method" }, 405);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: check, error } = await db.rpc("portal_link_check", { p_token: String(body.token || ""), p_identity: String(body.identity || "") });
    if (error) throw error;
    const r = check as { ok: boolean; reason?: string; attempts_left?: number; patient_id?: string; clinic_id?: string };
    if (!r.ok) return json(r);
    const email = await ensureAccount(db, r.patient_id!, r.clinic_id!);
    const { data: link, error: linkError } = await db.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !link?.properties?.hashed_token) throw linkError || new Error("Não foi possível gerar a sessão.");
    return json({ ok: true, token_hash: link.properties.hashed_token });
  } catch (e) {
    await captureError("portal-acesso", e, { route: "redeem" });
    return json({ ok: false, reason: "internal_error" }, 500);
  }
});
