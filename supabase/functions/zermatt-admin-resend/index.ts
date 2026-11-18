// POST /functions/v1/zermatt-admin-resend   (called from /admin with the signed-in user's access token)
// Body: { booking_id: "<uuid>" }
// Checks the caller's token with Supabase Auth, that the session passed 2-step verification (aal2),
// then that their email is in zermatt.admins,
// then re-sends the guest confirmation for a PAID booking and logs it in zermatt.email_log.
// verify_jwt is off at the gateway because this function verifies the user itself (auth.getUser).
import { adminClient, corsHeaders, json, log } from "../_shared/util.ts";
import { guestConfirmation } from "../_shared/emails.ts";
import { adminEmails, emailDataFromBooking, sendLogged } from "../_shared/mailer.ts";

/** Reads the claims of a token that Supabase Auth has already verified (auth.getUser above). */
function claims(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Sign in first" }, 401, cors);

  const db = adminClient();
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  const email = userData?.user?.email?.toLowerCase();
  if (userErr || !email) return json({ error: "Sign in again" }, 401, cors);
  if (claims(token).aal !== "aal2") return json({ error: "2-step verification needed. Sign in again." }, 403, cors);

  const admins = await adminEmails(db);
  if (!admins.includes(email)) return json({ error: "Not an admin" }, 403, cors);

  let body: { booking_id?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 500) throw new Error("too large");
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request" }, 400, cors);
  }
  const id = typeof body?.booking_id === "string" ? body.booking_id : "";
  if (!UUID_RE.test(id)) return json({ error: "Invalid booking id" }, 400, cors);

  const { data: b, error } = await db.from("bookings").select("*").eq("id", id).maybeSingle();
  if (error || !b) return json({ error: "Booking not found" }, 404, cors);
  if (b.status !== "paid") return json({ error: "Only paid bookings can be re-sent" }, 409, cors);

  const status = await sendLogged(db, {
    bookingId: b.id,
    toRole: "guest",
    to: b.guest_email,
    template: "guest_confirmation_resend",
    email: guestConfirmation(emailDataFromBooking(b)),
    replyTo: admins[0],
  });
  await log(db, "email", status === "sent" ? "info" : "warn", `Confirmation re-sent by admin (${status})`, { booking_id: b.id, by: email });
  return json({ ok: status === "sent", status }, 200, cors);
});
