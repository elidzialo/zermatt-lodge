// Stripe payout account details for the host's Payouts box (owner decision 22 Nov 2026).
// Only a display copy is kept in bookhomes.hosts: bank name, last 4 digits, currency and a schedule summary. Never full numbers.
// v1 endpoints (they work for the v2 accounts with the merchant configuration):
//   GET  /v1/accounts/:id              external_accounts (default bank), settings.payouts.schedule, requirements
//   POST /v1/accounts/:id/login_links  one-time link into the host's Stripe Express Dashboard
// Plain fetch, no SDK, so bookhomes-connect-onboard stays light and the webhook can reuse payoutInfoFromV1().
import { env } from "./base.ts";
import { sql } from "./bh.ts";

export type PayoutInfo = { bank_name: string | null; last4: string | null; currency: string | null; schedule: string | null; waiting_on: "host" | "stripe" | null };

type Ext = { object?: string; bank_name?: string | null; brand?: string | null; last4?: string | null; currency?: string | null; default_for_currency?: boolean | null };
type Sched = { interval?: string; delay_days?: number | string; weekly_anchor?: string; monthly_anchor?: number } | null | undefined;
type V1Account = {
  charges_enabled?: boolean; payouts_enabled?: boolean;
  external_accounts?: { data?: Ext[] } | null;
  settings?: { payouts?: { schedule?: Sched } | null } | null;
  requirements?: { currently_due?: string[]; past_due?: string[]; pending_verification?: string[] } | null;
  default_currency?: string | null;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "Daily, 7 day delay" / "Weekly on Monday, 2 day delay" / "Monthly on the 1st" / "Manual"
export function scheduleText(s: Sched): string | null {
  if (!s || !s.interval) return null;
  const d = Number(s.delay_days);
  const delay = Number.isFinite(d) && d > 0 ? `, ${d} day delay` : "";
  if (s.interval === "daily") return `Daily${delay}`;
  if (s.interval === "weekly") return `Weekly${s.weekly_anchor ? " on " + cap(s.weekly_anchor) : ""}${delay}`;
  if (s.interval === "monthly") {
    const n = Number(s.monthly_anchor), sfx = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
    return `Monthly${n ? ` on the ${n}${sfx}` : ""}${delay}`;
  }
  if (s.interval === "manual") return "Manual (you choose when)";
  return cap(String(s.interval));
}

export function payoutInfoFromV1(a: V1Account): PayoutInfo {
  const list = (a.external_accounts?.data ?? []).filter((x) => x && (x.object === "bank_account" || x.object === "card"));
  const ext = list.find((x) => x.default_for_currency) ?? list[0] ?? null;
  const last4 = ext?.last4 && /^[0-9]{2,4}$/.test(ext.last4) ? ext.last4 : null;
  const bank = ext ? (ext.object === "card" ? (ext.brand ? `${ext.brand} card` : "Debit card") : ext.bank_name || null) : null;
  const r = a.requirements ?? {};
  const due = (r.currently_due ?? []).length + (r.past_due ?? []).length, checking = (r.pending_verification ?? []).length;
  const enabled = !!a.charges_enabled && !!a.payouts_enabled;
  return {
    bank_name: bank ? String(bank).slice(0, 60) : null,
    last4,
    currency: (ext?.currency ?? a.default_currency ?? null)?.toString().toUpperCase() ?? null,
    schedule: scheduleText(a.settings?.payouts?.schedule),
    waiting_on: enabled ? null : due ? "host" : checking ? "stripe" : "stripe",
  };
}

async function v1(method: "GET" | "POST", path: string): Promise<Record<string, unknown>> {
  const r = await fetch(`https://api.stripe.com${path}`, { method, headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = (j as { error?: { message?: string; code?: string } }).error ?? {};
    const err = new Error(e.message ?? `Stripe error ${r.status}`) as Error & { code?: string; status?: number };
    err.code = e.code; err.status = r.status;
    throw err;
  }
  return j as Record<string, unknown>;
}

export async function fetchPayoutInfo(account: string): Promise<PayoutInfo> {
  return payoutInfoFromV1(await v1("GET", `/v1/accounts/${encodeURIComponent(account)}`) as V1Account);
}

// Stores the display copy. waiting_on only matters while the account is pending.
export async function savePayoutInfo(account: string, p: PayoutInfo, status?: string): Promise<void> {
  await sql`update bookhomes.hosts set payout_bank_name = ${p.bank_name}, payout_bank_last4 = ${p.last4}, payout_currency = ${p.currency},
              payout_schedule = ${p.schedule}, payout_details_at = now(),
              connect_waiting_on = case when coalesce(${status ?? null}, connect_status) = 'pending' then ${p.waiting_on} else null end
            where stripe_account_id = ${account}`;
}

// One-time Express Dashboard link (expires in minutes). Only for the host's own account.
export async function expressLoginLink(account: string): Promise<string> {
  const l = await v1("POST", `/v1/accounts/${encodeURIComponent(account)}/login_links`);
  return String(l.url);
}
