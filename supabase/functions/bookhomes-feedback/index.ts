// POST /functions/v1/bookhomes-feedback   { action, ... }   - the "Feedback & bugs" chat (/admin/feedback/) and its triage agent.
// Auth, either:
//   - an admin's user token (2-step verified, email in zermatt.admins): Eli's chat page. Messages are written as author "eli".
//   - the service role key (Authorization: Bearer <key>), or the optional FEEDBACK_AGENT_KEY secret: the triage agent.
//     Messages are written as author "agent".
// Actions:
//   list          { status?: "open" | "all" | <status>, limit? }        items, newest first, with their thread and screenshot links
//   get           { id }                                                 one item with its thread
//   create        { kind, message, page_url?, screenshot_path? }         admin only
//   upload_url    { content_type }                                       admin only: signed upload URL for a screenshot
//   reply         { id, body }                                           adds to the thread (agent replies also set agent_reply)
//   update        { id, status?, priority?, assigned_to? }               status / priority / who builds it
// Self-contained (no ../_shared imports) so it deploys as one file; helpers below mirror _shared/bh.ts.
import postgres from "npm:postgres@3.4.5";
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (n: string) => Deno.env.get(n) ?? "";
const optionalEnv = (n: string) => Deno.env.get(n) || undefined;
// deno-lint-ignore no-explicit-any
const sql: any = postgres(env("SUPABASE_DB_URL"), { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10, transform: { undefined: null } });
const authAdmin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
interface AuthUser { id: string; email: string; aal: string; claims: Record<string, unknown> }

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
function jsonRes(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
}
function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const h = cors(req.headers.get("Origin"));
    if (req.method === "OPTIONS") return new Response("ok", { headers: h });
    try {
      const res = await fn(req);
      for (const [k, v] of Object.entries(h)) res.headers.set(k, v);
      return res;
    } catch (e) {
      if (e instanceof HttpError) return jsonRes({ error: e.message }, e.status, h);
      console.error("Unhandled", e);
      return jsonRes({ error: "Something went wrong. Please try again." }, 500, h);
    }
  };
}
async function readBody(req: Request, max: number): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > max) throw new HttpError(413, "Request too large");
  try {
    const b = JSON.parse(raw || "{}");
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("x");
    return b;
  } catch { throw new HttpError(400, "Invalid request"); }
}
function str(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim().replace(/[\u2013\u2014]/g, "-");
  return s ? s.slice(0, max) : null;
}
function decodeClaims(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  } catch { return {}; }
}
async function getUser(req: Request): Promise<AuthUser> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token.split(".").length !== 3) throw new HttpError(401, "Sign in first");
  const { data, error } = await authAdmin().auth.getUser(token);
  const u = data?.user;
  if (error || !u?.email) throw new HttpError(401, "Sign in again");
  const claims = decodeClaims(token);
  if (claims.sub !== u.id) throw new HttpError(401, "Sign in again");
  const aal = String(claims.aal ?? "");
  if (aal !== "aal2") throw new HttpError(403, "2-step verification needed. Sign in again.");
  return { id: u.id, email: u.email.toLowerCase(), aal, claims };
}
async function isAdminEmail(email: string): Promise<boolean> {
  const r = await sql`select 1 from zermatt.admins where email = ${email.toLowerCase()} limit 1`;
  return r.length > 0;
}
async function audit(actor: AuthUser | null, action: string, entityId: string | null, details?: unknown) {
  try {
    await sql`insert into bookhomes.audit_log (actor_id, actor_email, action, entity, entity_id, details)
              values (${actor?.id ?? null}, ${actor?.email ?? (actor ? null : "triage-agent")}, ${action}, 'feedback', ${entityId}, ${sql.json(details ?? null)})`;
  } catch (e) { console.error("audit failed", (e as Error).message); }
}

const KINDS = ["bug", "improvement", "question"];
const STATUSES = ["new", "triaged", "in_progress", "done", "wont_do"];
const OPEN = ["new", "triaged", "in_progress"];
const PRIORITIES = ["P1", "P2", "P3"];
const TEAMS = ["backend", "ux", "optimiser", "content"];
const BUCKET = "feedback";
const IMG_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif",
};

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function agentKeys(): string[] {
  const keys = [optionalEnv("SUPABASE_SERVICE_ROLE_KEY"), optionalEnv("FEEDBACK_AGENT_KEY")].filter(Boolean) as string[];
  const multi = optionalEnv("SUPABASE_SECRET_KEYS"); // new-style sb_secret_ keys, when the platform provides them
  if (multi) {
    try {
      const o = JSON.parse(multi);
      if (o && typeof o === "object") for (const v of Object.values(o)) if (typeof v === "string") keys.push(v);
    } catch { /* ignore */ }
  }
  return keys;
}

type Caller = { role: "admin"; user: AuthUser } | { role: "agent" };

async function caller(req: Request): Promise<Caller> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const apikey = (req.headers.get("apikey") ?? "").trim();
  const keys = agentKeys();
  if (keys.some((k) => sameSecret(token, k)) || (token === "" && keys.some((k) => sameSecret(apikey, k)))) return { role: "agent" };
  const user = await getUser(req);
  if (!(await isAdminEmail(user.email))) throw new HttpError(403, "Not an admin");
  return { role: "admin", user };
}

const COLS = "id, created_at, updated_at, author, kind, page_url, message, screenshot_path, status, priority, assigned_to, agent_reply";
const ITEM_COLS = () => sql.unsafe(COLS);

async function withThreads(items: Record<string, unknown>[], signShots: boolean) {
  if (!items.length) return items;
  const ids = items.map((i) => i.id as string);
  const msgs = await sql`select id, feedback_id, author, body, created_at from bookhomes.feedback_messages
                         where feedback_id = any(${ids}::uuid[]) order by created_at`;
  const by: Record<string, unknown[]> = {};
  for (const m of msgs) (by[m.feedback_id] ??= []).push({ id: m.id, author: m.author, body: m.body, created_at: m.created_at });
  const paths = items.map((i) => i.screenshot_path as string | null).filter(Boolean) as string[];
  const urls: Record<string, string> = {};
  if (signShots && paths.length) {
    const { data } = await authAdmin().storage.from(BUCKET).createSignedUrls(paths, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
  }
  return items.map((i) => ({ ...i, messages: by[i.id as string] ?? [], screenshot_url: urls[i.screenshot_path as string] ?? null }));
}

function teams(v: unknown): string[] | null {
  if (v === undefined) return null;
  if (v === null) return [];
  const arr = Array.isArray(v) ? v : String(v ?? "").split(/[+,\s]+/);
  const out = [...new Set(arr.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
  if (out.some((x) => !TEAMS.includes(x))) throw new HttpError(400, `assigned_to must be from: ${TEAMS.join(", ")}`);
  return out;
}

Deno.serve(handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const who = await caller(req);
  const b = await readBody(req, 12000);
  const action = String(b.action ?? "");
  const actor = who.role === "admin" ? who.user : null;
  const id = b.id === undefined ? null : String(b.id);
  if (id !== null && !UUID_RE.test(id)) throw new HttpError(400, "Bad id");

  if (action === "list") {
    const st = String(b.status ?? (who.role === "agent" ? "open" : "all"));
    const want = st === "open" ? OPEN : st === "all" ? STATUSES : STATUSES.includes(st) ? [st] : null;
    if (!want) throw new HttpError(400, "Bad status");
    const limit = Math.min(Math.max(Number(b.limit) || 200, 1), 500);
    const rows = await sql`select ${ITEM_COLS()} from bookhomes.feedback where status = any(${want}::text[])
                           order by (status in ('done','wont_do')), coalesce(priority, 'P9'), created_at desc limit ${limit}`;
    return jsonRes({ items: await withThreads(rows, true) });
  }

  if (action === "get") {
    if (!id) throw new HttpError(400, "id needed");
    const rows = await sql`select ${ITEM_COLS()} from bookhomes.feedback where id = ${id}`;
    if (!rows.length) throw new HttpError(404, "Not found");
    return jsonRes({ item: (await withThreads(rows, true))[0] });
  }

  if (action === "upload_url") {
    if (who.role !== "admin") throw new HttpError(403, "Admins only");
    const ext = IMG_TYPES[String(b.content_type ?? "").toLowerCase()];
    if (!ext) throw new HttpError(400, "Screenshots must be an image (JPG, PNG, WebP, GIF or HEIC).");
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await authAdmin().storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new HttpError(500, "Could not start the upload. Try again.");
    return jsonRes({ path, signed_url: data.signedUrl, token: data.token });
  }

  if (action === "create") {
    if (who.role !== "admin") throw new HttpError(403, "Admins only");
    const kind = String(b.kind ?? "bug");
    if (!KINDS.includes(kind)) throw new HttpError(400, "Pick Bug or Improvement");
    const message = str(b.message, 5000);
    if (!message) throw new HttpError(400, "Type a message first");
    let page = str(b.page_url, 2000);
    if (page && !/^https?:\/\//i.test(page)) page = null;
    const shot = str(b.screenshot_path, 300);
    if (shot && !/^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|heic|heif)$/.test(shot)) throw new HttpError(400, "Bad screenshot");
    const [row] = await sql`insert into bookhomes.feedback (author, kind, page_url, message, screenshot_path)
                            values (${who.user.email}, ${kind}, ${page}, ${message}, ${shot}) returning ${ITEM_COLS()}`;
    await audit(actor, "feedback_create", row.id, { kind });
    return jsonRes({ item: (await withThreads([row], true))[0] });
  }

  if (action === "reply") {
    if (!id) throw new HttpError(400, "id needed");
    const body = str(b.body, 5000);
    if (!body) throw new HttpError(400, "Type a reply first");
    const author = who.role === "agent" ? "agent" : "eli";
    const out = await sql.begin(async (tx: typeof sql) => {
      const f = await tx`select id from bookhomes.feedback where id = ${id} for update`;
      if (!f.length) throw new HttpError(404, "Not found");
      const [m] = await tx`insert into bookhomes.feedback_messages (feedback_id, author, body) values (${id}, ${author}, ${body})
                           returning id, author, body, created_at`;
      if (author === "agent") await tx`update bookhomes.feedback set agent_reply = ${body}, updated_at = now() where id = ${id}`;
      else await tx`update bookhomes.feedback set updated_at = now(),
                      status = case when status in ('done','wont_do') then 'new' else status end where id = ${id}`;
      return m;
    });
    await audit(actor, "feedback_reply", id, { author });
    return jsonRes({ message: out });
  }

  if (action === "update") {
    if (!id) throw new HttpError(400, "id needed");
    const status = b.status === undefined ? null : String(b.status);
    if (status !== null && !STATUSES.includes(status)) throw new HttpError(400, `status must be one of: ${STATUSES.join(", ")}`);
    const priority = b.priority === undefined ? undefined : b.priority === null || b.priority === "" ? null : String(b.priority).toUpperCase();
    if (priority && !PRIORITIES.includes(priority)) throw new HttpError(400, "priority must be P1, P2 or P3");
    const assigned = teams(b.assigned_to);
    const rows = await sql`update bookhomes.feedback set
        status = coalesce(${status}, status),
        priority = case when ${priority !== undefined} then ${priority ?? null} else priority end,
        assigned_to = coalesce(${assigned}::text[], assigned_to),
        updated_at = now()
      where id = ${id} returning ${ITEM_COLS()}`;
    if (!rows.length) throw new HttpError(404, "Not found");
    await audit(actor, "feedback_update", id, { status, priority, assigned_to: assigned, by: who.role });
    return jsonRes({ item: (await withThreads(rows, true))[0] });
  }

  throw new HttpError(400, "Unknown action");
}));
