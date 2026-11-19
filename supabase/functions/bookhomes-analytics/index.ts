// POST /functions/v1/bookhomes-analytics   { action: "report", range: "today" | "7d" | "30d" | "90d" } | { action: "live" }
// Admin only: a user token with 2-step verification (aal2) whose email is on zermatt.admins (same rule as bookhomes.is_admin()).
// Reads come from bookhomes.analytics_report() / analytics_live(), which are not callable by anon or authenticated users.
// Self-contained (no ../_shared imports) so it deploys as one file.
import postgres from "npm:postgres@3.4.5";
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (n: string) => Deno.env.get(n) ?? "";
// deno-lint-ignore no-explicit-any
const sql: any = postgres(env("SUPABASE_DB_URL"), { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });
const authAdmin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

const ALLOWED = ["https://bookhomes.co.uk", "https://www.bookhomes.co.uk", "https://zermatt-lodge-lime.vercel.app"];
const PREVIEW_RE = /^https:\/\/zermatt-lodge-[a-z0-9-]+-zelr1\.vercel\.app$/;
const LOCAL_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
function cors(origin: string | null): Record<string, string> {
  const ok = !!origin && (ALLOWED.includes(origin) || PREVIEW_RE.test(origin) || LOCAL_RE.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : "https://bookhomes.co.uk",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, h: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
function claimsOf(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  } catch { return {}; }
}

Deno.serve(async (req: Request) => {
  const h = cors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, h);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token || token.split(".").length !== 3) return json({ error: "Sign in first" }, 401, h);
    const { data, error } = await authAdmin().auth.getUser(token);
    const u = data?.user;
    const c = claimsOf(token);
    if (error || !u?.email || c.sub !== u.id) return json({ error: "Sign in again" }, 401, h);
    if (c.aal !== "aal2") return json({ error: "2-step verification needed. Sign in again." }, 403, h);
    const adm = await sql`select 1 from zermatt.admins where email = ${u.email.toLowerCase()} limit 1`;
    if (!adm.length) return json({ error: "Not an admin" }, 403, h);

    let b: Record<string, unknown> = {};
    try { b = JSON.parse((await req.text()) || "{}"); } catch { return json({ error: "Invalid request" }, 400, h); }
    if (b.action === "live") {
      const [r] = await sql`select bookhomes.analytics_live() as j`;
      return json(r.j, 200, h);
    }
    if (b.action === "report") {
      const range = ["today", "7d", "30d", "90d"].includes(String(b.range)) ? String(b.range) : "7d";
      const [r] = await sql`select bookhomes.analytics_report(${range}) as j`;
      return json(r.j, 200, h);
    }
    return json({ error: "Unknown action" }, 400, h);
  } catch (e) {
    console.error("analytics failed", (e as Error).message);
    return json({ error: "Something went wrong. Please try again." }, 500, h);
  }
});
