// POST /functions/v1/bookhomes-messages   { action, ... }   Guest <-> host messages ("Message the host").
// Guest actions (signed in, or signed out with the private thread link token `t`):
//   start        { listing_id, body, name?, email?, phone?, check_in?, check_out?, guests?, t?, website (honeypot) }
//   guest_list   {}                          signed in: own threads (by user id or confirmed email)
//   guest_thread { id } | { t }              messages, marks host replies read
//   guest_reply  { id | t, body }
// Host actions (signed in host):  host_list {}, host_thread { id }, host_reply { id, body }, unread {}
// Admin actions (2-step admin, read only, audit logged): admin_list { q?, flagged? }, admin_thread { id }
// Notifications: email via mailer.ts (Resend; skipped and logged in zermatt.email_log when RESEND_API_KEY is missing)
// and SMS via bh_sms.ts (off unless TWILIO_* secrets exist; every try logged in bookhomes.sms_log). The in-portal message is always saved first.
// Host email and phone are never sent to the guest. Phone numbers / emails in messages are hidden until a paid booking.
// Source: github.com/elidzialo/zermatt-lodge supabase/functions/bookhomes-messages (shared modules pinned by commit)
import { adminClient, siteUrl } from "../_shared/base.ts";
import {
  audit, EMAIL_RE, getUser, handle, HttpError, int, jsonRes, NAME_RE, PHONE_RE, rateLimit, readBody, requireAdmin, sql,
  str, UUID_RE, type AuthUser, clientIp,
} from "../_shared/bh.ts";
import { sendLogged } from "../_shared/mailer.ts";
import { esc } from "../_shared/emails.ts";
import { sendSms } from "../_shared/bh_sms.ts";

const MAX_BODY = 2000;
const GREEN = "#1f4d3a", AMBER = "#c8873a", LINE = "#e7e3dc", MUTED = "#5d6560";

// ---------- helpers
function dateOrNull(v: unknown): string | null {
  const s = str(v, 10);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")) ? s : null;
}
function cleanBody(v: unknown): string {
  const s = typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[\u2013\u2014]/g, "-").replace(/\n{4,}/g, "\n\n\n").trim() : "";
  if (s.length < 2) throw new HttpError(400, "Please write a message.");
  if (s.length > MAX_BODY) throw new HttpError(400, `Please keep your message under ${MAX_BODY} characters.`);
  return s;
}
const LINK_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
function spammy(s: string): boolean {
  const links = (s.match(LINK_RE) ?? []).length;
  return links > 2 || /(.)\1{25,}/.test(s) || /\b(crypto|bitcoin|forex|viagra|casino|seo services|backlinks)\b/i.test(s) && links > 0;
}
// Phone numbers and email addresses are hidden until the guest has a paid booking (keeps bookings on the platform).
const EMAIL_IN = /[A-Z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Z0-9.-]+\s*(?:\.|\(dot\)|\[dot\])\s*[A-Z]{2,}/gi;
const PHONE_IN = /(?:\+|00)?\d[\d\s().-]{8,}\d/g;
function redact(s: string): { body: string; redacted: boolean } {
  let r = false;
  const out = s.replace(EMAIL_IN, () => { r = true; return "[contact details hidden]"; })
    .replace(PHONE_IN, (m) => { if (m.replace(/\D/g, "").length < 10) return m; r = true; return "[contact details hidden]"; });
  return { body: out, redacted: r };
}
function preview(s: string): string { return s.replace(/\s+/g, " ").slice(0, 140); }
function first(name: string): string { return (name || "").trim().split(/\s+/)[0] || "a guest"; }

async function optionalUser(req: Request): Promise<AuthUser | null> {
  const t = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!t || t.split(".").length !== 3) return null;
  try {
    const c = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(t.split(".")[1].length / 4) * 4, "=")));
    if (c.role !== "authenticated") return null; // the publishable / anon key, not a user
  } catch { return null; }
  return await getUser(req, false);
}
async function emailConfirmed(userId: string): Promise<boolean> {
  const r = await sql`select email_confirmed_at is not null as ok from auth.users where id = ${userId}`;
  return !!r[0]?.ok;
}
async function hasPaidBooking(listingId: number, email: string): Promise<string | null> {
  const r = await sql`select id from bookhomes.bookings where listing_id = ${listingId} and lower(guest_email) = ${email.toLowerCase()}
                      and status = 'paid' order by check_in desc limit 1`;
  return r[0]?.id ?? null;
}

// ---------- notifications (never throw)
function layout(heading: string, body: string, site: string): string {
  return `<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#fbf8f3;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#1b1f1d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf8f3"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid ${LINE};border-radius:16px;overflow:hidden">
<tr><td style="background:${GREEN};padding:20px 28px;border-bottom:5px solid ${AMBER}"><div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;letter-spacing:-0.5px;color:#fff">Book<span style="font-weight:normal">Homes</span></div></td></tr>
<tr><td style="padding:26px 28px 8px"><h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:23px;color:${GREEN}">${esc(heading)}</h1>${body}</td></tr>
<tr><td style="padding:16px 28px 24px;font-size:12.5px;color:${MUTED};border-top:1px solid ${LINE}">Book Homes · <a href="${esc(site)}" style="color:${GREEN}">${esc(site.replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table></body></html>`;
}
function msgEmail(o: { heading: string; from: string; listing: string; body: string; dates?: string; link: string; linkLabel: string; site: string; foot: string }) {
  const quote = `<div style="margin:0 0 16px;padding:14px 16px;background:#e9f1ec;border-radius:12px;font-size:15px;line-height:1.55;white-space:pre-wrap">${esc(o.body)}</div>`;
  const html = layout(o.heading,
    `<p style="margin:0 0 10px;font-size:15px"><b>${esc(o.from)}</b> about <b>${esc(o.listing)}</b>${o.dates ? `<br><span style="color:${MUTED}">${esc(o.dates)}</span>` : ""}</p>` + quote +
    `<p style="margin:0 0 14px"><a href="${esc(o.link)}" style="display:inline-block;background:${GREEN};color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${esc(o.linkLabel)}</a></p>` +
    `<p style="margin:0 0 14px;font-size:13px;color:${MUTED}">${esc(o.foot)}</p>`, o.site);
  const text = `${o.heading}\n${o.from} about ${o.listing}${o.dates ? "\n" + o.dates : ""}\n\n${o.body}\n\n${o.linkLabel}: ${o.link}\n\n${o.foot}`;
  return { subject: `${o.heading}: ${o.listing}`.slice(0, 200), html, text };
}
// deno-lint-ignore no-explicit-any
function datesText(t: any): string {
  if (!t.check_in) return "";
  const f = (s: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(String(s).slice(0, 10) + "T00:00:00Z"));
  return `${f(t.check_in)}${t.check_out ? " to " + f(t.check_out) : ""}${t.guests ? `, ${t.guests} guest${t.guests === 1 ? "" : "s"}` : ""}`;
}

// deno-lint-ignore no-explicit-any
async function notifyHost(t: any, body: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const h = (await sql`select p.email, p.phone, p.user_id from bookhomes.hosts h join bookhomes.profiles p on p.user_id = h.user_id where h.id = ${t.host_id}`)[0];
    const site = siteUrl();
    if (h?.email) {
      out.email = await sendLogged(adminClient(), {
        toRole: "admin", to: h.email, template: "bh_host_new_message",
        email: msgEmail({ heading: "New message from a guest", from: t.guest_name, listing: t.listing_title, body, dates: datesText(t),
          link: `${site}/host/#messages=${t.id}`, linkLabel: "Reply on Book Homes", site,
          foot: "Please reply on Book Homes so the guest is protected and your conversation is kept in one place." }),
      });
    } else out.email = "no_email";
    if (h?.phone) {
      out.sms = await sendSms({ kind: "message_to_host", to: h.phone, email: h.email, listingId: t.listing_id,
        body: `You have a new message on BookHomes from ${first(t.guest_name)} about ${t.listing_title.slice(0, 60)}. Reply at bookhomes.co.uk/host` });
    } else out.sms = "no_phone";
  } catch (e) {
    console.error("notifyHost failed", (e as Error).message);
    out.error = "notify_failed";
  }
  return out;
}
// deno-lint-ignore no-explicit-any
async function notifyGuest(t: any, body: string, hostName: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const site = siteUrl();
    const link = `${site}/trips/messages?t=${t.guest_token}`;
    out.email = await sendLogged(adminClient(), {
      toRole: "guest", to: t.guest_email, template: "bh_guest_new_message",
      email: msgEmail({ heading: "Your host replied", from: hostName, listing: t.listing_title, body, dates: datesText(t), link, linkLabel: "Read and reply", site,
        foot: "This link opens your conversation. Keep it private. You can also log in with this email and open Trips, Messages." }),
    });
    if (t.guest_phone) {
      out.sms = await sendSms({ kind: "message_to_guest", to: t.guest_phone, email: t.guest_email, listingId: t.listing_id,
        body: `You have a new message on BookHomes from ${first(hostName)} about ${t.listing_title.slice(0, 60)}. Reply at bookhomes.co.uk/trips/messages` });
    } else out.sms = "no_phone";
  } catch (e) {
    console.error("notifyGuest failed", (e as Error).message);
    out.error = "notify_failed";
  }
  return out;
}

// ---------- data
// deno-lint-ignore no-explicit-any
const THREAD_COLS = (x: any) => x`t.id, t.listing_id, t.host_id, t.guest_user_id, t.guest_name, t.guest_email, t.guest_phone, t.booking_id, t.check_in, t.check_out,
  t.guests, t.guest_token, t.status, t.flagged, t.host_unread, t.guest_unread, t.last_message_at, t.last_sender, t.last_preview, t.created_at,
  l.title as listing_title, l.slug as listing_slug, coalesce(h.display_name, 'Your host') as host_name,
  (select coalesce(ph.thumb_url, ph.url) from bookhomes.listing_photos ph where ph.listing_id = l.id order by ph.sort nulls last, ph.id limit 1) as photo`;
async function threadBy(where: "id" | "token", v: string) {
  const r = where === "id"
    ? await sql`select ${THREAD_COLS(sql)} from bookhomes.threads t join bookhomes.listings l on l.id = t.listing_id left join bookhomes.hosts h on h.id = t.host_id where t.id = ${v}`
    : await sql`select ${THREAD_COLS(sql)} from bookhomes.threads t join bookhomes.listings l on l.id = t.listing_id left join bookhomes.hosts h on h.id = t.host_id where t.guest_token = ${v}`;
  return r[0] ?? null;
}
async function messagesOf(threadId: string, admin = false) {
  return admin
    ? await sql`select id, sender, body, redacted, original_body, created_at, read_at from bookhomes.messages where thread_id = ${threadId} order by created_at, id`
    : await sql`select id, sender, body, redacted, created_at, read_at from bookhomes.messages where thread_id = ${threadId} order by created_at, id`;
}
// deno-lint-ignore no-explicit-any
function guestView(t: any) {
  return { id: t.id, listing_id: t.listing_id, listing_title: t.listing_title, listing_slug: t.listing_slug, host_name: t.host_name, photo: t.photo,
    check_in: t.check_in, check_out: t.check_out, guests: t.guests, unread: t.guest_unread, last_message_at: t.last_message_at,
    last_sender: t.last_sender, last_preview: t.last_preview, status: t.status, guest_name: t.guest_name };
}
// deno-lint-ignore no-explicit-any
function hostView(t: any) {
  return { id: t.id, listing_id: t.listing_id, listing_title: t.listing_title, listing_slug: t.listing_slug, photo: t.photo, guest_name: t.guest_name,
    check_in: t.check_in, check_out: t.check_out, guests: t.guests, booked: !!t.booking_id, unread: t.host_unread, last_message_at: t.last_message_at,
    last_sender: t.last_sender, last_preview: t.last_preview, status: t.status, flagged: t.flagged };
}
// Guest's own thread: by link token, or signed-in by user id / confirmed email.
async function guestThread(req: Request, b: Record<string, unknown>) {
  const tok = str(b.t, 40);
  if (tok) {
    if (!UUID_RE.test(tok)) throw new HttpError(404, "This conversation link is not valid.");
    await rateLimit("msg_token", clientIp(req), 120, 600);
    const t = await threadBy("token", tok);
    if (!t) throw new HttpError(404, "This conversation link is not valid.");
    return { t, user: await optionalUser(req).catch(() => null) };
  }
  const user = await getUser(req, false);
  const id = str(b.id, 40);
  if (!id || !UUID_RE.test(id)) throw new HttpError(400, "Missing conversation");
  const t = await threadBy("id", id);
  if (!t) throw new HttpError(404, "Conversation not found");
  const mine = t.guest_user_id === user.id || (t.guest_email.toLowerCase() === user.email && (await emailConfirmed(user.id)));
  if (!mine) throw new HttpError(404, "Conversation not found");
  return { t, user };
}
async function myHost(user: AuthUser) {
  const r = await sql`select id, display_name from bookhomes.hosts where user_id = ${user.id} and deleted_at is null`;
  if (!r[0]) throw new HttpError(403, "Finish your host profile first.");
  return r[0];
}
// deno-lint-ignore no-explicit-any
async function addMessage(t: any, sender: "guest" | "host", userId: string | null, body: string) {
  const paid = t.booking_id || (await hasPaidBooking(t.listing_id, t.guest_email));
  const red = paid ? { body, redacted: false } : redact(body);
  const p = preview(red.body);
  return await sql.begin(async (tx: typeof sql) => {
    // same text from the same side in the last 10 minutes: treat as a double click
    const dup = await tx`select id, created_at from bookhomes.messages where thread_id = ${t.id} and sender = ${sender} and body = ${red.body}
                         and created_at > now() - interval '10 minutes' limit 1`;
    if (dup[0]) return { id: dup[0].id, duplicate: true, body: red.body, redacted: red.redacted };
    const m = await tx`insert into bookhomes.messages (thread_id, sender, sender_user_id, body, redacted, original_body)
                       values (${t.id}, ${sender}, ${userId}, ${red.body}, ${red.redacted}, ${red.redacted ? body : null}) returning id, created_at`;
    if (sender === "guest") {
      await tx`update bookhomes.threads set host_unread = host_unread + 1, last_message_at = now(), last_sender = 'guest', last_preview = ${p},
               flagged = flagged or ${red.redacted}, booking_id = coalesce(booking_id, ${paid || null}), status = case when status = 'archived' then 'open' else status end
               where id = ${t.id}`;
    } else {
      await tx`update bookhomes.threads set guest_unread = guest_unread + 1, last_message_at = now(), last_sender = 'host', last_preview = ${p},
               flagged = flagged or ${red.redacted}, booking_id = coalesce(booking_id, ${paid || null}) where id = ${t.id}`;
    }
    return { id: m[0].id, created_at: m[0].created_at, duplicate: false, body: red.body, redacted: red.redacted };
  });
}

// ---------- actions
async function start(req: Request, b: Record<string, unknown>) {
  if (str(b.website, 200)) return jsonRes({ ok: true }); // honeypot: bots fill every field
  const ip = clientIp(req);
  await rateLimit("msg_start_ip", ip, 8, 3600, "You've sent a lot of messages. Please wait a while and try again.");
  await rateLimit("msg_start_ip_day", ip, 25, 86400, "You've sent a lot of messages today. Please try again tomorrow.");
  const user = await optionalUser(req);
  const listingId = int(b.listing_id, 1, 1e12);
  if (!listingId) throw new HttpError(400, "Missing listing");
  const l = (await sql`select l.id, l.title, l.host_id, h.user_id as host_user from bookhomes.listings l join bookhomes.hosts h on h.id = l.host_id
                       where l.id = ${listingId} and l.status = 'approved' and l.deleted_at is null and h.deleted_at is null`)[0];
  if (!l) throw new HttpError(404, "This home is not taking messages right now.");
  if (user && l.host_user === user.id) throw new HttpError(400, "This is your own listing.");
  const body = cleanBody(b.body);
  if (spammy(body)) throw new HttpError(400, "Your message looks like spam. Please remove links and try again.");

  let name = str(b.name, 120), email = str(b.email, 254)?.toLowerCase() ?? null;
  const phoneRaw = str(b.phone, 30);
  if (user) {
    email = user.email;
    if (!name) name = (await sql`select name from bookhomes.profiles where user_id = ${user.id}`)[0]?.name ?? null;
  }
  if (!name || !NAME_RE.test(name)) throw new HttpError(400, "Please add your name.");
  if (!email || !EMAIL_RE.test(email)) throw new HttpError(400, "Please add a valid email so the host can reply.");
  if (phoneRaw && !PHONE_RE.test(phoneRaw)) throw new HttpError(400, "That phone number doesn't look right.");
  await rateLimit("msg_start_email", email, 10, 86400, "You've sent a lot of messages today. Please try again tomorrow.");
  const ci = dateOrNull(b.check_in), co = dateOrNull(b.check_out);
  const checkIn = ci && co && co > ci ? ci : ci && !co ? ci : null, checkOut = checkIn && co && co > checkIn ? co : null;
  const guests = int(b.guests, 1, 50);

  // Reuse a thread only when we know it is this guest's: signed in (user id / confirmed email) or the thread's own link token.
  // deno-lint-ignore no-explicit-any
  let t: any = null;
  const tok = str(b.t, 40);
  if (tok && UUID_RE.test(tok)) {
    const x = await threadBy("token", tok);
    if (x && Number(x.listing_id) === listingId && x.status !== "blocked") t = x;
  }
  if (!t && user) {
    const conf = await emailConfirmed(user.id);
    const r = await sql`select id from bookhomes.threads where listing_id = ${listingId} and status <> 'blocked'
                        and (guest_user_id = ${user.id} or (${conf} and lower(guest_email) = ${user.email})) order by last_message_at desc limit 1`;
    if (r[0]) t = await threadBy("id", r[0].id);
  }
  if (t && t.status === "blocked") throw new HttpError(403, "This host is not taking messages from you.");
  let created = false;
  if (!t) {
    const r = await sql`insert into bookhomes.threads (listing_id, host_id, guest_user_id, guest_name, guest_email, guest_phone, check_in, check_out, guests)
                        values (${listingId}, ${l.host_id}, ${user?.id ?? null}, ${name}, ${email}, ${phoneRaw}, ${checkIn}, ${checkOut}, ${guests}) returning id`;
    t = await threadBy("id", r[0].id);
    created = true;
  } else {
    await sql`update bookhomes.threads set guest_user_id = coalesce(guest_user_id, ${user?.id ?? null}), guest_phone = coalesce(${phoneRaw}, guest_phone),
              check_in = coalesce(${checkIn}, check_in), check_out = coalesce(${checkOut}, check_out), guests = coalesce(${guests}, guests) where id = ${t.id}`;
    t = await threadBy("id", t.id);
  }
  const m = await addMessage(t, "guest", user?.id ?? null, body);
  const notified = m.duplicate ? {} : await notifyHost(t, m.body);
  await audit(user, created ? "message_thread_started" : "message_sent", "thread", t.id, { listing_id: listingId, sender: "guest", redacted: m.redacted, notified });
  return jsonRes({ ok: true, thread_id: t.id, t: t.guest_token, signed_in: !!user, redacted: m.redacted,
    link: `/trips/messages?t=${t.guest_token}` });
}

async function guestList(req: Request) {
  const user = await getUser(req, false);
  const conf = await emailConfirmed(user.id);
  if (conf) await sql`update bookhomes.threads set guest_user_id = ${user.id} where guest_user_id is null and lower(guest_email) = ${user.email}`;
  const rows = await sql`select ${THREAD_COLS(sql)} from bookhomes.threads t join bookhomes.listings l on l.id = t.listing_id left join bookhomes.hosts h on h.id = t.host_id
                         where t.guest_user_id = ${user.id} order by t.last_message_at desc limit 100`;
  return jsonRes({ threads: rows.map(guestView) });
}

async function guestOpen(req: Request, b: Record<string, unknown>) {
  const { t } = await guestThread(req, b);
  if (b.peek) return jsonRes({ thread: guestView(t), messages: [] }); // inbox list: title and unread count only
  await sql`update bookhomes.messages set read_at = now() where thread_id = ${t.id} and sender = 'host' and read_at is null`;
  await sql`update bookhomes.threads set guest_unread = 0 where id = ${t.id}`;
  const msgs = await messagesOf(t.id);
  return jsonRes({ thread: { ...guestView(t), unread: 0 }, messages: msgs.map((m: { sender: string }) => ({ ...m, mine: m.sender === "guest" })) });
}

async function guestReply(req: Request, b: Record<string, unknown>) {
  const { t, user } = await guestThread(req, b);
  if (t.status === "blocked") throw new HttpError(403, "This conversation is closed.");
  await rateLimit("msg_reply_thread", t.id + ":guest", 30, 3600, "You've sent a lot of messages. Please wait a while.");
  await rateLimit("msg_reply_ip", clientIp(req), 60, 3600);
  const body = cleanBody(b.body);
  if (spammy(body)) throw new HttpError(400, "Your message looks like spam. Please remove links and try again.");
  const m = await addMessage(t, "guest", user?.id ?? null, body);
  if (!m.duplicate) await notifyHost(t, m.body);
  return jsonRes({ ok: true, message: { id: m.id, sender: "guest", mine: true, body: m.body, redacted: m.redacted, created_at: m.created_at ?? new Date().toISOString() } });
}

async function hostList(req: Request) {
  const user = await getUser(req, false);
  const h = await myHost(user);
  const rows = await sql`select ${THREAD_COLS(sql)} from bookhomes.threads t join bookhomes.listings l on l.id = t.listing_id left join bookhomes.hosts h on h.id = t.host_id
                         where t.host_id = ${h.id} and t.status <> 'blocked' order by t.last_message_at desc limit 200`;
  const unread = rows.reduce((a: number, r: { host_unread: number }) => a + (r.host_unread > 0 ? 1 : 0), 0);
  return jsonRes({ threads: rows.map(hostView), unread });
}
async function hostOwned(req: Request, b: Record<string, unknown>) {
  const user = await getUser(req, false);
  const h = await myHost(user);
  const id = str(b.id, 40);
  if (!id || !UUID_RE.test(id)) throw new HttpError(400, "Missing conversation");
  const t = await threadBy("id", id);
  if (!t || t.host_id !== h.id) throw new HttpError(404, "Conversation not found");
  return { t, user, h };
}
async function hostOpen(req: Request, b: Record<string, unknown>) {
  const { t } = await hostOwned(req, b);
  await sql`update bookhomes.messages set read_at = now() where thread_id = ${t.id} and sender = 'guest' and read_at is null`;
  await sql`update bookhomes.threads set host_unread = 0 where id = ${t.id}`;
  const msgs = await messagesOf(t.id);
  return jsonRes({ thread: { ...hostView(t), unread: 0 }, messages: msgs.map((m: { sender: string }) => ({ ...m, mine: m.sender === "host" })) });
}
async function hostReply(req: Request, b: Record<string, unknown>) {
  const { t, user, h } = await hostOwned(req, b);
  if (t.status === "blocked") throw new HttpError(403, "This conversation is closed.");
  await rateLimit("msg_reply_thread", t.id + ":host", 60, 3600, "You've sent a lot of messages. Please wait a while.");
  const body = cleanBody(b.body);
  const m = await addMessage(t, "host", user.id, body);
  if (!m.duplicate) await notifyGuest(t, m.body, h.display_name || "Your host");
  return jsonRes({ ok: true, message: { id: m.id, sender: "host", mine: true, body: m.body, redacted: m.redacted, created_at: m.created_at ?? new Date().toISOString() } });
}
async function hostUnread(req: Request) {
  const user = await getUser(req, false);
  const h = (await sql`select id from bookhomes.hosts where user_id = ${user.id} and deleted_at is null`)[0];
  if (!h) return jsonRes({ unread: 0 });
  const r = await sql`select count(*)::int as n from bookhomes.threads where host_id = ${h.id} and host_unread > 0 and status <> 'blocked'`;
  return jsonRes({ unread: r[0].n });
}

async function adminList(req: Request, b: Record<string, unknown>) {
  const admin = await requireAdmin(req);
  const q = str(b.q, 80);
  const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : null;
  const rows = await sql`select ${THREAD_COLS(sql)}, (select count(*)::int from bookhomes.messages m where m.thread_id = t.id) as n
                         from bookhomes.threads t join bookhomes.listings l on l.id = t.listing_id left join bookhomes.hosts h on h.id = t.host_id
                         where (${like}::text is null or t.guest_name ilike ${like} or t.guest_email ilike ${like} or l.title ilike ${like})
                           and (${!!b.flagged} = false or t.flagged)
                         order by t.last_message_at desc limit 200`;
  await audit(admin, "admin_list_threads", "thread", null, { q, flagged: !!b.flagged });
  // deno-lint-ignore no-explicit-any
  return jsonRes({ threads: rows.map((t: any) => ({ ...hostView(t), host_name: t.host_name, guest_email: t.guest_email, guest_phone: t.guest_phone, messages: t.n, host_unread: t.host_unread, guest_unread: t.guest_unread })) });
}
async function adminOpen(req: Request, b: Record<string, unknown>) {
  const admin = await requireAdmin(req);
  const id = str(b.id, 40);
  if (!id || !UUID_RE.test(id)) throw new HttpError(400, "Missing conversation");
  const t = await threadBy("id", id);
  if (!t) throw new HttpError(404, "Conversation not found");
  await audit(admin, "admin_view_thread", "thread", t.id, { listing_id: t.listing_id });
  const msgs = await messagesOf(t.id, true);
  return jsonRes({ thread: { ...hostView(t), created_at: t.created_at, host_name: t.host_name, guest_email: t.guest_email, guest_phone: t.guest_phone }, messages: msgs });
}

Deno.serve(handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const b = await readBody(req, 12000);
  switch (b.action) {
    case "start": return await start(req, b);
    case "guest_list": return await guestList(req);
    case "guest_thread": return await guestOpen(req, b);
    case "guest_reply": return await guestReply(req, b);
    case "host_list": return await hostList(req);
    case "host_thread": return await hostOpen(req, b);
    case "host_reply": return await hostReply(req, b);
    case "unread": return await hostUnread(req);
    case "admin_list": return await adminList(req, b);
    case "admin_thread": return await adminOpen(req, b);
    case "ping": return jsonRes({ ok: true });
    default: throw new HttpError(400, "Unknown action");
  }
}));
