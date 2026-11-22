// POST /functions/v1/bookhomes-connect-onboard   { action: "start" | "status" }  Stripe payout setup for hosts.
// Accounts v2 with Managed Risk (owner decision 22 Nov 2026): Express Dashboard, Stripe liable for negative balances,
// Stripe takes its card fee from the host; BookHomes takes its commission as the application fee on direct charges.
// 2-step login is optional for hosts (owner decision 22 Nov 2026); Stripe's own onboarding verifies identity and bank details.
// Feature flag: OFF unless the secret BOOKHOMES_CONNECT=on.
// Until a host is connected, their bookings are normal platform charges and payouts are "manual_pending" (bank transfer).
// Source: github.com/elidzialo/zermatt-lodge supabase/functions/bookhomes-connect-onboard (shared modules pinned by commit)
import { optionalEnv } from "../_shared/base.ts";
import { audit, connectFlagEnabled, getUser, handle, HttpError, jsonRes, readBody, returnBase, setSetting, sql } from "../_shared/bh.ts";
import { accountState, createConnectedAccount, onboardingLink } from "../_shared/bh_connect.ts";

const NOT_ENABLED = "Automatic payouts are not switched on yet. Until then Book Homes pays you by bank transfer after each stay. We'll let you know when you can connect.";
const KEY_PERMS = "Payout setup is not ready on our side yet. We've been told and are fixing it. Until then Book Homes pays you by bank transfer after each stay.";

// Stripe errors we can explain to the host. Returns null for anything else.
async function friendly(e: unknown): Promise<Response | null> {
  const msg = (e as Error).message ?? "";
  const code = (e as { code?: string }).code ?? "";
  if (/permission|does not have the required permissions|rk_live|restricted key/i.test(msg)) {
    await setSetting("connect_status", "key_missing_permissions", "connect-onboard");
    return jsonRes({ connect_enabled: false, message: KEY_PERMS });
  }
  if (/signed up for connect|not enabled for connect|review the responsibilities|platform profile|accounts v2 is not enabled|losses_collector|liability/i.test(msg) ||
      /^(platform_registration_required|connect_profile_not_submitted|connect_identity_not_verified|accounts_v2_access_blocked|non_connect_platform_accounts_v2_access_blocked|account_create_activation_required|account_creation_)/.test(code)) {
    await setSetting("connect_status", "not_enabled", "connect-onboard");
    return jsonRes({ connect_enabled: false, message: NOT_ENABLED });
  }
  return null;
}

Deno.serve(handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const user = await getUser(req, false);
  const b = await readBody(req, 1000);
  const host = (await sql`select h.id, h.stripe_account_id, h.display_name, p.email, p.trader_status, p.approved from bookhomes.hosts h
                            join bookhomes.profiles p on p.user_id = h.user_id where h.user_id = ${user.id}`)[0];
  if (!host) throw new HttpError(403, "Finish your host profile first.");
  if (!connectFlagEnabled() || !optionalEnv("STRIPE_SECRET_KEY")) return jsonRes({ connect_enabled: false, message: NOT_ENABLED });

  if (b.action === "status") {
    if (!host.stripe_account_id) return jsonRes({ connect_enabled: true, status: "not_started" });
    try {
      const st = await accountState(host.stripe_account_id);
      await sql`update bookhomes.hosts set connect_status = ${st.status}, charges_enabled = ${st.charges_enabled}, payouts_enabled = ${st.payouts_enabled}, updated_at = now() where id = ${host.id}`;
      return jsonRes({ connect_enabled: true, ...st });
    } catch (e) {
      console.error("account status failed", (e as Error).message);
      const f = await friendly(e);
      if (f) return f;
      throw new HttpError(502, "We couldn't check your payout setup with Stripe. Please try again in a minute.");
    }
  }

  if (!host.approved) throw new HttpError(403, "You can connect payouts once Book Homes has approved your host account.");
  let account = host.stripe_account_id as string | null;
  if (!account) {
    try {
      account = await createConnectedAccount({ id: host.id, email: host.email, trader_status: host.trader_status, display_name: host.display_name });
      await sql`update bookhomes.hosts set stripe_account_id = ${account}, connect_status = 'pending', charges_enabled = false, payouts_enabled = false, updated_at = now() where id = ${host.id}`;
      await setSetting("connect_status", "enabled", "connect-onboard");
      await audit(user, "connect_account_created", "host", host.id, { account, api: "v2", losses_collector: "stripe", fees_collector: "stripe" });
    } catch (e) {
      console.error("v2 accounts create failed", (e as { code?: string }).code ?? "", (e as Error).message);
      const f = await friendly(e);
      if (f) return f;
      throw new HttpError(502, "Stripe could not start the setup. Please try again in a minute.");
    }
  }
  try {
    const url = await onboardingLink(account, returnBase(req));
    return jsonRes({ connect_enabled: true, url });
  } catch (e) {
    console.error("v2 account link failed", (e as { code?: string }).code ?? "", (e as Error).message);
    const f = await friendly(e);
    if (f) return f;
    throw new HttpError(502, "Stripe could not open the setup page. Please try again in a minute.");
  }
}));
