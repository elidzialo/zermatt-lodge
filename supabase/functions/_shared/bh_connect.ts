// Stripe Connect for BookHomes hosts: Accounts v2 with Managed Risk (owner decision 22 Nov 2026).
// - Stripe is liable for negative balances (losses_collector = stripe) and Stripe takes its card fee from the host
//   (fees_collector = stripe). BookHomes only takes its commission as the application fee on DIRECT charges.
// - Express Dashboard, Stripe-hosted onboarding (v2 account links), merchant configuration with card_payments.
// Plain fetch (no SDK) so the v2 endpoints and the Stripe-Version they need are explicit.
// Docs: https://docs.stripe.com/connect/risk-management/connected-accounts-with-managed-risk
//       https://docs.stripe.com/api/v2/core/accounts/create  https://docs.stripe.com/api/v2/core/account-links/create
import { env } from "./base.ts";

// v2 needs an explicit version. Express + Stripe-owned pricing + Stripe loss liability needs 2026-11-18.endive or later.
export const STRIPE_V2_VERSION = "2026-11-18.endive";

export class StripeApiError extends Error {
  status: number; code: string | null; type: string | null;
  constructor(status: number, message: string, code: string | null, type: string | null) {
    super(message); this.status = status; this.code = code; this.type = type;
  }
}

async function call(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`,
    "Stripe-Version": STRIPE_V2_VERSION,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const r = await fetch(`https://api.stripe.com${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j: Record<string, unknown> = {};
  try { j = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
  if (!r.ok) {
    const e = (j.error ?? {}) as { message?: string; code?: string; type?: string };
    throw new StripeApiError(r.status, e.message ?? `Stripe error ${r.status}`, e.code ?? null, e.type ?? null);
  }
  return j;
}

export type ConnectHost = { id: string; email: string; trader_status?: string | null; display_name?: string | null };

// Creates the host's connected account. Idempotent per host, so a double tap never makes two accounts.
export async function createConnectedAccount(h: ConnectHost): Promise<string> {
  const body: Record<string, unknown> = {
    contact_email: h.email,
    dashboard: "express",
    identity: { country: "gb", ...(h.trader_status === "private" ? { entity_type: "individual" } : {}) },
    defaults: { currency: "gbp", responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
    configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    metadata: { bookhomes_host_id: h.id },
    include: ["configuration.merchant", "defaults"],
  };
  if (h.display_name) body.display_name = String(h.display_name).slice(0, 100);
  const a = await call("POST", "/v2/core/accounts", body, `bh-connect-v2-${h.id}`);
  return String(a.id);
}

// Single-use Stripe-hosted onboarding link (also used to finish or update details later).
export async function onboardingLink(account: string, base: string): Promise<string> {
  const l = await call("POST", "/v2/core/account_links", {
    account,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant"],
        refresh_url: `${base}/host/?connect=refresh`,
        return_url: `${base}/host/?connect=done`,
      },
    },
  });
  return String(l.url);
}

export type ConnectState = { status: "enabled" | "pending" | "restricted"; charges_enabled: boolean; payouts_enabled: boolean };

type Cap = { status?: string; status_details?: { code?: string; resolution?: string }[] } | undefined;
const BAD = new Set(["rejected", "unsupported"]);
function capBlocked(c: Cap): boolean {
  if (!c) return false;
  if (c.status && BAD.has(c.status)) return true;
  return c.status === "restricted" && (c.status_details ?? []).some((d) => d.resolution === "contact_stripe" || /^rejected|restricted_other/.test(d.code ?? ""));
}

// v2 account -> our hosts.connect_status. "restricted" only when Stripe has blocked the account (needs Stripe support);
// an account that simply has not finished onboarding is "pending" so the host sees "Finish setup".
export function stateFromV2(a: Record<string, unknown>): ConnectState {
  const caps = ((a.configuration as Record<string, unknown> | undefined)?.merchant as { capabilities?: Record<string, unknown> } | undefined)?.capabilities ?? {};
  const card = caps.card_payments as Cap;
  const payouts = (caps.stripe_balance as { payouts?: Cap } | undefined)?.payouts;
  const charges_enabled = card?.status === "active", payouts_enabled = payouts?.status === "active";
  const status = charges_enabled && payouts_enabled ? "enabled" : capBlocked(card) || capBlocked(payouts) ? "restricted" : "pending";
  return { status, charges_enabled, payouts_enabled };
}

// v1 Account (account.updated snapshot events still fire for v2 accounts with the merchant configuration).
export function stateFromV1(a: { charges_enabled?: boolean; payouts_enabled?: boolean; requirements?: { disabled_reason?: string | null } | null }): ConnectState {
  const charges_enabled = !!a.charges_enabled, payouts_enabled = !!a.payouts_enabled;
  const dr = a.requirements?.disabled_reason ?? "";
  const status = charges_enabled && payouts_enabled ? "enabled" : /^rejected|listed|platform_paused|under_review|other/.test(dr) ? "restricted" : "pending";
  return { status, charges_enabled, payouts_enabled };
}

// Current state: v2 retrieve first; if the key cannot read v2 accounts, fall back to v1 GET /v1/accounts/:id.
export async function accountState(account: string): Promise<ConnectState> {
  try {
    const a = await call("GET", `/v2/core/accounts/${encodeURIComponent(account)}?include=configuration.merchant&include=requirements`);
    return stateFromV2(a);
  } catch (e) {
    console.error("v2 account retrieve failed, trying v1", (e as Error).message);
    const a = await call("GET", `/v1/accounts/${encodeURIComponent(account)}`);
    return stateFromV1(a as Parameters<typeof stateFromV1>[0]);
  }
}
