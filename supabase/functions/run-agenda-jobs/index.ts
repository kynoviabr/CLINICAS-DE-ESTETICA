import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JobMode = "morning" | "hourly" | "manual";

function utcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function toRunKey(mode: JobMode) {
  const now = new Date();
  if (mode === "morning") return `${utcDateKey()}-09h`;
  if (mode === "hourly") return `${utcDateKey()}-${String(now.getUTCHours()).padStart(2, "0")}h`;
  return `${utcDateKey()}-manual-${now.toISOString().slice(11, 16).replace(":", "")}`;
}

async function invokeFunction(
  supabaseUrl: string,
  serviceRole: string,
  name: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${name} failed (${response.status}): ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const runnerToken = Deno.env.get("AGENDA_JOBS_RUNNER_TOKEN") || "";
    if (!supabaseUrl || !serviceRole) throw new Error("SUPABASE env vars not configured");

    const body = await req.json().catch(() => ({}));
    const providedToken = String(
      req.headers.get("x-runner-token")
      || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
      || body?.token
      || "",
    ).trim();
    if (runnerToken && providedToken !== runnerToken) {
      return new Response(JSON.stringify({ ok: false, reason: "unauthorized_runner" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mode = (body?.mode || "manual") as JobMode;
    const clinicId: string | undefined = body?.clinicId;
    const runKey = String(body?.runKey || toRunKey(mode));
    const admin = createClient(supabaseUrl, serviceRole);

    const { data: existing } = await admin.from("agenda_job_executions")
      .select("id, status")
      .eq("job_name", "run-agenda-jobs")
      .eq("run_key", runKey)
      .is("clinic_id", clinicId || null)
      .maybeSingle();
    if (existing?.id) {
      return new Response(JSON.stringify({
        ok: true,
        skipped: true,
        reason: "already_executed",
        runKey,
        status: existing.status,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: execution, error: executionError } = await admin.from("agenda_job_executions").insert({
      clinic_id: clinicId || null,
      job_name: "run-agenda-jobs",
      run_key: runKey,
      status: "started",
      details: { mode, startedAt: new Date().toISOString() },
    }).select("id").single();
    if (executionError) throw executionError;

    const result: Record<string, unknown> = { runKey, mode };
    const payload = clinicId ? { clinicId } : {};

    if (mode === "morning") {
      result["dailySummary"] = await invokeFunction(supabaseUrl, serviceRole, "send-daily-agenda-summary", payload);
      result["queueReminders"] = await invokeFunction(supabaseUrl, serviceRole, "send-appointment-reminder", {
        ...payload,
        lookAheadHours: 24,
        limit: 200,
      });
      result["dispatchReminders"] = await invokeFunction(supabaseUrl, serviceRole, "dispatch-appointment-reminders", {
        ...payload,
        limit: 200,
      });
      result["checkWaitlist"] = await invokeFunction(supabaseUrl, serviceRole, "check-waitlist", payload);
    } else if (mode === "hourly") {
      result["dispatchReminders"] = await invokeFunction(supabaseUrl, serviceRole, "dispatch-appointment-reminders", {
        ...payload,
        limit: 100,
      });
      result["checkWaitlist"] = await invokeFunction(supabaseUrl, serviceRole, "check-waitlist", payload);
    } else {
      result["queueReminders"] = await invokeFunction(supabaseUrl, serviceRole, "send-appointment-reminder", {
        ...payload,
        lookAheadHours: 24,
        limit: 100,
      });
      result["dispatchReminders"] = await invokeFunction(supabaseUrl, serviceRole, "dispatch-appointment-reminders", {
        ...payload,
        limit: 100,
      });
    }

    await admin.from("agenda_job_executions")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        details: result,
      })
      .eq("id", execution.id);

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
