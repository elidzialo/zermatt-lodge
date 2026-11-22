// Transactional SMS for BookHomes (owner decision 22 Nov 2026). Twilio REST API via plain fetch.
// OFF unless the secrets TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either TWILIO_FROM (a UK number or an approved
// alphanumeric sender ID such as "BookHomes") or TWILIO_MESSAGING_SERVICE_SID are set. While off, every text is
// logged in bookhomes.sms_log with status 'off' and nothing is sent. BOOKHOMES_SMS_DRY_RUN=on logs 'dry_run' instead.
// Respects bookhomes.profiles.sms_opt_out (looked up by email). UK numbers are normalised to E.164 (+447...).
// sendSms() never throws, so a text can never break a booking, an approval or a payout.
import { optionalEnv } from "./base.ts";
import { sql } from "./bh.ts";

export type SmsStatus = "off" | "dry_run" | "opted_out" | "no_number" | "not_mobile" | "sent" | "failed";

export function smsConfigured(): boolean {
  return !!(optionalEnv("TWILIO_ACCOUNT_SID") && optionalEnv("TWILIO_AUTH_TOKEN") && (optionalEnv("TWILIO_FROM") || optionalEnv("TWILIO_MESSAGING_SERVICE_SID")));
}

// UK-first E.164. Returns null when it is not a usable number. "07700 900123", "+44 (0)7700 900123", "447700900123",
// "0044 7700 900123" all become "+447700900123". Other countries are kept if they already start with + or 00.
export function toE164(raw: unknown): string | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  s = s.replace(/\(0\)/g, "").replace(/[\s().-]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^0\d{9,10}$/.test(s)) s = "+44" + s.slice(1);
  else if (/^44\d{9,10}$/.test(s)) s = "+" + s;
  if (s.startsWith("+440")) s = "+44" + s.slice(4);
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
  if (s.startsWith("+44") && s.length !== 13) return null;
  return s;
}
// UK texts only go to mobiles (+447...). Landlines are skipped. Non-UK numbers are allowed.
export function isMobile(e164: string): boolean {
  return !e164.startsWith("+44") || /^\+447\d{9}$/.test(e164);
}
export function maskNumber(e164: string | null): string | null {
  return e164 ? e164.slice(0, 3) + "*".repeat(Math.max(0, e164.length - 6)) + e164.slice(-3) : null;
}

// Plain text: no em/en dashes, single spaces, at most 3 SMS segments.
export function cleanText(t: string): string {
  return t.replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim().slice(0, 459);
}

// dedupe: one text per key (e.g. "payout:<id>"); a second call with the same key is skipped.
export type SmsArgs = { kind: string; to: unknown; body: string; email?: string | null; bookingId?: string | null; listingId?: number | null; dedupe?: string | null };

async function optedOut(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const r = await sql`select 1 from bookhomes.profiles where lower(email) = ${String(email).toLowerCase()} and sms_opt_out limit 1`;
  return r.length > 0;
}

async function logSms(a: SmsArgs, e164: string | null, status: SmsStatus, body: string, providerId: string | null = null, error: string | null = null) {
  try {
    await sql`insert into bookhomes.sms_log (kind, to_masked, email, booking_id, listing_id, status, provider_id, error, body, dedupe_key)
              values (${a.kind}, ${maskNumber(e164)}, ${a.email ?? null}, ${a.bookingId ?? null}, ${a.listingId ?? null}, ${status}, ${providerId}, ${error}, ${body}, ${a.dedupe ?? null})
              on conflict do nothing`;
  } catch (e) {
    console.error("sms_log insert failed", (e as Error).message);
  }
}

export async function sendSms(a: SmsArgs): Promise<SmsStatus> {
  const body = cleanText(a.body);
  try {
    const e164 = toE164(a.to);
    if (!e164) { await logSms(a, null, "no_number", body); return "no_number"; }
    if (!isMobile(e164)) { await logSms(a, e164, "not_mobile", body); return "not_mobile"; }
    if (await optedOut(a.email)) { await logSms(a, e164, "opted_out", body); return "opted_out"; }
    if (a.dedupe && (await sql`select 1 from bookhomes.sms_log where dedupe_key = ${a.dedupe} and status in ('sent', 'dry_run', 'off') limit 1`).length) return "sent";
    if (!smsConfigured()) { await logSms(a, e164, "off", body); return "off"; }
    if (optionalEnv("BOOKHOMES_SMS_DRY_RUN") === "on") { await logSms(a, e164, "dry_run", body); return "dry_run"; }
    const sid = optionalEnv("TWILIO_ACCOUNT_SID")!, tok = optionalEnv("TWILIO_AUTH_TOKEN")!;
    const form = new URLSearchParams({ To: e164, Body: body });
    const mss = optionalEnv("TWILIO_MESSAGING_SERVICE_SID");
    if (mss) form.set("MessagingServiceSid", mss); else form.set("From", optionalEnv("TWILIO_FROM")!);
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${sid}:${tok}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const j = await r.json().catch(() => ({})) as { sid?: string; message?: string; code?: number };
    if (!r.ok) { await logSms(a, e164, "failed", body, null, `${j.code ?? r.status} ${j.message ?? ""}`.trim().slice(0, 300)); return "failed"; }
    await logSms(a, e164, "sent", body, j.sid ?? null);
    return "sent";
  } catch (e) {
    console.error("sms failed", a.kind, (e as Error).message);
    await logSms(a, null, "failed", body, null, String((e as Error).message).slice(0, 300));
    return "failed";
  }
}

// ---------- message texts (short, plain, signed BookHomes) ----------
const short = (t: unknown, n = 40) => { const s = String(t ?? "").trim(); return s.length > n ? s.slice(0, n - 1).trim() + "..." : s; };
const fmtDay = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const pounds = (p: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((p || 0) / 100);

export const smsText = {
  guestConfirmed: (b: { listing_title: string; check_in: string; check_out: string }, ref: string) =>
    `Your stay at ${short(b.listing_title)} is confirmed: ${fmtDay(b.check_in)} to ${fmtDay(b.check_out)}, ref ${ref}. Check-in details are in your email. BookHomes`,
  hostNewBooking: (b: { listing_title: string; check_in: string; check_out: string; guest_name: string; guests: number; host_payout_pence: number }, site: string) =>
    `New booking at ${short(b.listing_title)}: ${short(b.guest_name, 30)}, ${b.guests} guest${b.guests === 1 ? "" : "s"}, ${fmtDay(b.check_in)} to ${fmtDay(b.check_out)}. Your payout ${pounds(b.host_payout_pence)}. ${site.replace(/^https?:\/\//, "")}/host BookHomes`,
  listingApproved: (title: string, url: string) =>
    `Good news: ${short(title)} is approved and live. Guests can book it now: ${url.replace(/^https?:\/\//, "")} BookHomes`,
  payoutSent: (pence: number, title: string | null) =>
    `We've sent your payout of ${pounds(pence)}${title ? " for " + short(title) : ""} by bank transfer. It usually arrives within 2 hours. BookHomes`,
  stripePayoutPaid: (pence: number, last4: string | null) =>
    `Stripe has paid ${pounds(pence)} to your bank${last4 ? " account ending " + last4 : ""}. BookHomes`,
};
