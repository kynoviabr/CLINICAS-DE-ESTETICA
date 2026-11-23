/**
 * Endereço do site usado nos links enviados a clientes e equipe.
 * Vem do segredo APP_URL; sem ele, escolhe pelo projeto do Supabase
 * (produção usa o domínio oficial, os demais usam a homologação).
 */
declare const Deno: { env: { get(name: string): string | undefined } };

export const PRODUCTION_PROJECT_REF = "tunoirtswleljvyohdxp";
export const PRODUCTION_APP_URL = "https://app.estetica.kynovia.com.br";
export const HOMOLOG_APP_URL = "https://klinova-homolog.vercel.app";

export function appUrl(): string {
  const fromEnv = (Deno.env.get("APP_URL") || "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return (Deno.env.get("SUPABASE_URL") || "").includes(PRODUCTION_PROJECT_REF) ? PRODUCTION_APP_URL : HOMOLOG_APP_URL;
}
