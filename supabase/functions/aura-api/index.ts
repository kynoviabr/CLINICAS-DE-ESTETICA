// API padrão do produto para a Aura IA (docs/API.md da Aura, "API padrão do produto").
// A Aura pergunta, o Clinova responde com os dados da própria clínica:
//   GET /aura/catalog        -> tratamentos ativos e combos, com a regra de como falar do preço
//   GET /aura/business-info  -> dados da clínica, horário, pagamento, regras, profissionais e perguntas frequentes
// Publicada sem login do Supabase: a proteção é a assinatura da Aura (HMAC com AURA_WEBHOOK_SECRET),
// com horário (no máximo 5 minutos de diferença). A clínica vem no cabeçalho X-Aura-Workspace (= clinic_id).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type PriceDisplay = "exact" | "from" | "hidden";
/** Informações para a IA, preenchidas pela clínica em Configurações (clinic_settings, chave aura_info). */
type AuraInfo = {
  hours?: string; payment?: string; policies?: string; parking?: string; notes?: string;
  faq?: { question: string; answer: string }[];
  priceDisplay?: PriceDisplay;
  priceOverrides?: Record<string, PriceDisplay>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function auraInfo(db: SupabaseClient, clinicId: string): Promise<AuraInfo> {
  const { data } = await db.from("clinic_settings").select("value").eq("clinic_id", clinicId).eq("key", "aura_info").maybeSingle();
  try { return data?.value ? JSON.parse(data.value) : {}; } catch { return {}; }
}

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function catalog(db: SupabaseClient, clinicId: string) {
  const [info, { data: treatments }, { data: combos }] = await Promise.all([
    auraInfo(db, clinicId),
    db.from("treatments").select("id, name, category, description, duration_minutes, num_sessions, price, default_price")
      .eq("clinic_id", clinicId).eq("is_active", true).order("name"),
    db.from("treatment_combos").select("id, name, promotional_price, items:treatment_combo_items(treatment:treatments(name))")
      .eq("clinic_id", clinicId).eq("active", true).order("name"),
  ]);
  const display = info.priceDisplay || "exact";
  return {
    services: (treatments || []).map((t) => {
      const price = Number(t.price || t.default_price || 0) || null;
      return {
        id: t.id, name: t.name, category: t.category, description: clean(t.description),
        durationMinutes: t.duration_minutes, sessions: t.num_sessions,
        priceDisplay: info.priceOverrides?.[t.id] || display,
        price,
      };
    }),
    packages: (combos || []).map((c) => ({
      name: c.name,
      price: display === "hidden" ? null : c.promotional_price,
      items: ((c.items || []) as { treatment?: { name?: string } | null }[]).map((i) => i.treatment?.name).filter(Boolean),
    })),
  };
}

async function businessInfo(db: SupabaseClient, clinicId: string) {
  const [info, { data: clinic }, { data: pros }] = await Promise.all([
    auraInfo(db, clinicId),
    db.from("clinics").select("name, address, city, state, phone, support_whatsapp").eq("id", clinicId).maybeSingle(),
    db.from("professionals").select("full_name, specialty").eq("clinic_id", clinicId).eq("status", "active").order("full_name"),
  ]);
  if (!clinic) return null;
  const address = [clinic.address, [clinic.city, clinic.state].filter(Boolean).join("/")].filter(Boolean).join(" - ");
  return {
    name: clinic.name,
    address: address || null,
    phone: clinic.phone || clinic.support_whatsapp || null,
    hours: clean(info.hours), payment: clean(info.payment), policies: clean(info.policies),
    parking: clean(info.parking), notes: clean(info.notes),
    faq: (info.faq || []).filter((f) => clean(f.question) && clean(f.answer)),
    professionals: (pros || []).map((p) => ({ name: p.full_name, specialty: p.specialty })),
  };
}

Deno.serve(async (req) => {
  const secret = (Deno.env.get("AURA_WEBHOOK_SECRET") || "").trim();
  if (!secret) return json({ error: "secret_not_configured" }, 500);

  const url = new URL(req.url);
  const raw = req.method === "GET" ? "" : await req.text();
  const ts = req.headers.get("x-aura-timestamp") || "";
  const clinicId = req.headers.get("x-aura-workspace") || "";
  const signature = (req.headers.get("x-aura-signature") || "").trim().toLowerCase();
  // Dentro do Supabase o caminho chega sem "/functions/v1"; a Aura assina o caminho completo da URL pública.
  const paths = [url.pathname, url.pathname.startsWith("/functions/v1/") ? url.pathname : `/functions/v1${url.pathname}`];
  let valid = false;
  for (const p of new Set(paths)) {
    if (signature && safeEqual(signature, await hmacHex(secret, `${ts}.${req.method}.${p}${url.search}.${raw}`))) valid = true;
  }
  if (!valid || Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    console.warn("aura-api: assinatura inválida", { path: url.pathname, hasSignature: !!signature });
    return json({ error: "invalid_signature" }, 401);
  }
  if (!/^[0-9a-f-]{36}$/i.test(clinicId)) return json({ error: "invalid_workspace" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const route = url.pathname.replace(/^.*\/aura-api/, "");
  try {
    if (req.method === "GET" && route === "/aura/catalog") return json(await catalog(db, clinicId));
    if (req.method === "GET" && route === "/aura/business-info") {
      const info = await businessInfo(db, clinicId);
      return info ? json(info) : json({ error: "clinic_not_found" }, 404);
    }
    return json({ error: "not_supported" }, 501);
  } catch (e) {
    console.error("aura-api", route, e);
    return json({ error: "internal_error" }, 500);
  }
});
