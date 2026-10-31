import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const appUrl = Deno.env.get("APP_URL") || "https://klinova.vercel.app";

    // Verify caller
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, role, clinicId, cargoName } = await req.json();

    // Validate input
    if (!email || !role || !clinicId) {
      return new Response(JSON.stringify({ error: "Email, papel e clínica são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validRoles = ["receptionist", "professional", "sales"];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Papel inválido. Use: recepcionista ou profissional" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "Email inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is admin of this clinic
    const { data: isAdmin } = await adminClient.rpc("has_clinic_role", {
      _user_id: user.id, _clinic_id: clinicId, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem convidar membros" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    // Busca a conta pelo e-mail direto no banco (listUsers só lê a primeira página).
    const { data: found, error: findError } = await adminClient.rpc("find_auth_user_by_email", { p_email: normalizedEmail });
    if (findError) return json({ error: findError.message }, 500);
    const existingUser = (found as Array<{ id: string; email_confirmed: boolean }> | null)?.[0] ?? null;

    if (existingUser) {
      const { data: activeRole } = await adminClient
        .from("user_roles")
        .select("clinic_id")
        .eq("user_id", existingUser.id)
        .eq("is_active", true)
        .maybeSingle();

      if (activeRole?.clinic_id === clinicId) {
        return json({ error: "Este usuário já faz parte da equipe" }, 400);
      }
      if (activeRole) {
        // Uma clínica por pessoa: nunca puxar alguém de outra clínica sem o consentimento dela.
        return json({ error: "Este e-mail já está vinculado a outra clínica. Peça para a pessoa usar outro e-mail." }, 409);
      }
    }

    // Registra (ou renova) o convite. O papel só é dado quando o e-mail for confirmado.
    const invitation = {
      clinic_id: clinicId,
      email: normalizedEmail,
      role,
      cargo_name: cargoName ?? null,
      invited_by: user.id,
      status: "pending",
      accepted_at: null,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const { error: invError } = await adminClient.from("team_invitations").upsert(invitation, { onConflict: "clinic_id,email" });
    if (invError) return json({ error: invError.message }, 500);

    if (existingUser?.email_confirmed) {
      // Conta já existe e o e-mail é dela: entra na equipe agora.
      const { error: roleError } = await adminClient.from("user_roles").insert({
        user_id: existingUser.id, clinic_id: clinicId, role, is_active: true,
      });
      if (roleError) return json({ error: roleError.message }, 500);
      await adminClient.from("team_invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("clinic_id", clinicId).eq("email", normalizedEmail);
      return json({ message: "Membro adicionado à equipe! Ele já pode entrar com o e-mail de sempre.", status: "added" });
    }

    // Conta nova (ou ainda não confirmada): o Supabase manda o e-mail de convite.
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: `${appUrl}/reset-password`,
      data: { invited_to_clinic: clinicId },
    });
    if (inviteError) {
      return json({ error: `Convite salvo, mas o e-mail não foi enviado: ${inviteError.message}` }, 502);
    }

    return json({
      message: "Convite enviado! A pessoa recebe um e-mail para definir a senha ou entrar com Google.",
      status: "invited",
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
