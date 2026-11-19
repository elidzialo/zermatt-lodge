// GET /functions/v1/zermatt-booking-status?session_id=cs_...   (site calls it as /api/booking-status)
// Read-only, self-contained (no shared imports). Used by /booking-confirmed to show "Booking confirmed"
// once the Stripe webhook has marked the booking paid. The Checkout session id is only known to the
// guest who paid (it is in their success URL), and the reply holds no name, email or phone.
// Reply: { status: "paid" | "processing" | "conflict" | "unknown", reference?, check_in?, check_out?, nights? }
import { createClient } from "npm:@supabase/supabase-js@2";

const SESSION_RE = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;
const ORIGINS = ["https://bookhomes.co.uk", "https://www.bookhomes.co.uk"];

function reply(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Vary": "Origin",
    },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return reply({}, 200, origin);
  if (req.method !== "GET") return reply({ error: "Method not allowed" }, 405, origin);

  const sessionId = new URL(req.url).searchParams.get("session_id") ?? "";
  if (!SESSION_RE.test(sessionId)) return reply({ status: "unknown" }, 400, origin);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "zermatt" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db
    .from("bookings")
    .select("id, status, check_in, check_out, nights")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (error) {
    console.error("booking-status lookup failed", error.message);
    return reply({ status: "unknown" }, 503, origin);
  }
  if (!data) return reply({ status: "unknown" }, 404, origin);

  const b = data as { id: string; status: string; check_in: string; check_out: string; nights: number };
  // A hold that timed out can still be confirmed when the payment lands, so only a clash is final here.
  const status = b.status === "paid" ? "paid" : b.status === "cancelled_conflict" ? "conflict" : "processing";
  return reply({
    status,
    reference: b.id.replace(/-/g, "").slice(0, 8).toUpperCase(), // same format as the confirmation email
    check_in: b.check_in,
    check_out: b.check_out,
    nights: b.nights,
  }, 200, origin);
});
