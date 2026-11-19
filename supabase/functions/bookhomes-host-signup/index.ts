// POST /functions/v1/bookhomes-host-signup   (called by /host/ right after a new host signs in for the first time)
// Auth: the user's own access token (verified with Supabase Auth). 2-step is not needed yet at this point.
// Body: { name, phone, whatsapp?, company?, trader_status?: "trader"|"private", display_name? }
// Creates (or tops up) the host's profile + host row. New hosts start unapproved: Eli approves each host
// and each listing in /admin before anything goes live. Admins get an email.
import { adminClient, siteUrl } from "../_shared/util.ts";
import { adminEmailList, audit, getUser, handle, HttpError, jsonRes, NAME_RE, PHONE_RE, readBody, sql, str } from "../_shared/bh.ts";
import { sendLogged } from "../_shared/mailer.ts";
import { adminNotice } from "../_shared/bh_emails.ts";

Deno.serve(handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const user = await getUser(req, false);
  const b = await readBody(req, 3000);
  const name = str(b.name, 120) ?? "";
  const phone = str(b.phone, 30) ?? "";
  const whatsapp = str(b.whatsapp, 30);
  const company = str(b.company, 120);
  const display = str(b.display_name, 80);
  const trader = b.trader_status === "trader" || b.trader_status === "private" ? b.trader_status : null;
  if (!NAME_RE.test(name)) throw new HttpError(400, "Please enter your full name.");
  if (!PHONE_RE.test(phone)) throw new HttpError(400, "Please enter a phone number.");
  if (whatsapp && !PHONE_RE.test(whatsapp)) throw new HttpError(400, "Please check your WhatsApp number.");

  const existing = await sql`select user_id from bookhomes.profiles where user_id = ${user.id}`;
  await sql`insert into bookhomes.profiles (user_id, email, role, name, phone, whatsapp, company, trader_status)
            values (${user.id}, ${user.email}, 'host', ${name}, ${phone}, ${whatsapp}, ${company}, ${trader})
            on conflict (user_id) do update set name = excluded.name, phone = excluded.phone, whatsapp = excluded.whatsapp,
              company = excluded.company, trader_status = coalesce(excluded.trader_status, bookhomes.profiles.trader_status), updated_at = now()`;
  await sql`insert into bookhomes.hosts (user_id, display_name) values (${user.id}, ${display ?? company ?? name})
            on conflict (user_id) do update set display_name = coalesce(${display}, bookhomes.hosts.display_name), updated_at = now()`;
  if (!existing.length) {
    await audit(user, "host_signup", "profile", user.id, { name, company, trader });
    const db = adminClient();
    for (const to of await adminEmailList()) {
      await sendLogged(db, { toRole: "admin", to, template: "bh_admin_host_signup",
        email: adminNotice(`New host sign-up: ${name}`, [`${name} (${user.email}) signed up as a host.`, `Company: ${company ?? "-"}. Status: ${trader ?? "not chosen yet"}.`, "Approve or reject them in admin > Hosts."], siteUrl()) });
    }
  }
  const p = await sql`select user_id, email, role, name, phone, whatsapp, company, trader_status, approved from bookhomes.profiles where user_id = ${user.id}`;
  return jsonRes({ ok: true, profile: p[0], created: !existing.length });
}));
