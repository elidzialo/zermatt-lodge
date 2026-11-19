// POST /functions/v1/bookhomes-connect-onboard   { action: "start" | "status" }
// "Connect payouts with Stripe" button in /host/. Host must be signed in with 2-step verification (aal2).
// start:  creates a Stripe Express account (UK) for the host if they have none, then returns a one-time
//         onboarding link { url }. Stripe collects ID and bank details; Book Homes never sees them.
// status: refreshes charges/payouts status from Stripe.
// Feature flag: if Stripe Connect is not enabled on the platform account yet (or BOOKHOMES_CONNECT=off),
// returns { connect_enabled: false, message } and bookings fall back to a normal charge with the payout
// recorded as "manual_pending" (Eli pays the host by bank transfer).
import { optionalEnv, stripeClient } from "../_shared/util.ts";
import { audit, connectFlagEnabled, getUser, handle, HttpError, jsonRes, readBody, returnBase, setSetting, sql } from "../_shared/bh.ts";

const NOT_ENABLED = "Automatic payouts are not switched on yet. Until then Book Homes pays you by bank transfer after each stay. We'll let you know when you can connect.";

function connectStatus(a: { charges_enabled?: boolean; payouts_enabled?: boolean; requirements?: { disabled_reason?: string | null } | null }) {
  return a.charges_enabled && a.payouts_enabled ? "enabled" : a.requirements?.disabled_reason ? "restricted" : "pending";
}

Deno.serve(handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const user = await getUser(req, true);
  const b = await readBody(req, 1000);
  const host = (await sql`select h.id, h.stripe_account_id, p.email, p.trader_status, p.approved from bookhomes.hosts h
                            join bookhomes.profiles p on p.user_id = h.user_id where h.user_id = ${user.id}`)[0];
  if (!host) throw new HttpError(403, "Finish your host profile first.");
  if (!connectFlagEnabled() || !optionalEnv("STRIPE_SECRET_KEY")) return jsonRes({ connect_enabled: false, message: NOT_ENABLED });
  const stripe = stripeClient();

  if (b.action === "status") {
    if (!host.stripe_account_id) return jsonRes({ connect_enabled: true, status: "not_started" });
    const a = await stripe.accounts.retrieve(host.stripe_account_id);
    const st = connectStatus(a);
    await sql`update bookhomes.hosts set connect_status = ${st}, charges_enabled = ${!!a.charges_enabled}, payouts_enabled = ${!!a.payouts_enabled}, updated_at = now() where id = ${host.id}`;
    return jsonRes({ connect_enabled: true, status: st, charges_enabled: !!a.charges_enabled, payouts_enabled: !!a.payouts_enabled });
  }

  if (!host.approved) throw new HttpError(403, "You can connect payouts once Book Homes has approved your host account.");
  let account = host.stripe_account_id as string | null;
  if (!account) {
    try {
      const a = await stripe.accounts.create({
        type: "express",
        country: "GB",
        email: host.email,
        business_type: host.trader_status === "private" ? "individual" : undefined,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { bookhomes_host_id: host.id },
      }, { idempotencyKey: `bh-connect-${host.id}` });
      account = a.id;
      await sql`update bookhomes.hosts set stripe_account_id = ${account}, connect_status = 'pending', updated_at = now() where id = ${host.id}`;
      await setSetting("connect_status", "enabled", "connect-onboard");
      await audit(user, "connect_account_created", "host", host.id, { account });
    } catch (e) {
      const msg = (e as Error).message ?? "";
      console.error("accounts.create failed", msg);
      if (/connect|platform|signed up|not enabled|review the responsibilities/i.test(msg)) {
        await setSetting("connect_status", "not_enabled", "connect-onboard");
        return jsonRes({ connect_enabled: false, message: NOT_ENABLED });
      }
      throw new HttpError(502, "Stripe could not start the setup. Please try again in a minute.");
    }
  }
  const base = returnBase(req);
  const link = await stripe.accountLinks.create({
    account,
    refresh_url: `${base}/host/?connect=refresh`,
    return_url: `${base}/host/?connect=done`,
    type: "account_onboarding",
  });
  return jsonRes({ connect_enabled: true, url: link.url });
}));
