// Sends emails through Resend and logs every attempt in zermatt.email_log.
// RESEND_API_KEY and RESEND_FROM come from the function secrets (never hard-coded).
// Admin recipients are read from zermatt.admins. Never throws: an email problem must not break a booking.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { optionalEnv, PHONE, siteUrl } from "./util.ts";
import type { BookingEmailData, RenderedEmail } from "./emails.ts";

export type EmailStatus = "sent" | "failed" | "skipped_no_key";

interface SendArgs {
  bookingId?: string | null;
  toRole: "guest" | "admin";
  to: string;
  template: string;
  email: RenderedEmail;
  replyTo?: string;
}

export async function sendLogged(db: SupabaseClient, a: SendArgs): Promise<EmailStatus> {
  const key = optionalEnv("RESEND_API_KEY");
  let status: EmailStatus = "skipped_no_key";
  let providerId: string | null = null;
  let error: string | null = null;

  if (key && a.to) {
    // Default sender once bookhomes.co.uk is verified at Resend; set RESEND_FROM to override.
    const from = optionalEnv("RESEND_FROM") ?? "Book Homes <bookings@bookhomes.co.uk>";
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [a.to],
          subject: a.email.subject,
          html: a.email.html,
          text: a.email.text,
          ...(a.replyTo ? { reply_to: a.replyTo } : {}),
        }),
      });
      const body = await res.text();
      if (res.ok) {
        status = "sent";
        try { providerId = (JSON.parse(body) as { id?: string }).id ?? null; } catch { /* ignore */ }
      } else {
        status = "failed";
        error = `HTTP ${res.status}: ${body.slice(0, 500)}`;
      }
    } catch (e) {
      status = "failed";
      error = (e as Error).message.slice(0, 500);
    }
  } else if (!a.to) {
    status = "failed";
    error = "No recipient";
  }

  const { error: logErr } = await db.from("email_log").insert({
    booking_id: a.bookingId ?? null,
    to_role: a.toRole,
    to_address: a.to || "-",
    template: a.template,
    subject: a.email.subject.slice(0, 300),
    status,
    provider_id: providerId,
    error,
  });
  if (logErr) console.error("email_log insert failed", logErr.message);
  return status;
}

/** Emails from zermatt.admins (never from code). */
export async function adminEmails(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from("admins").select("email");
  if (error) {
    console.error("admins lookup failed", error.message);
    return [];
  }
  return ((data ?? []) as { email: string }[]).map((r) => r.email).filter(Boolean);
}

/** Sends one alert to every admin. If there are no admins, logs a single skipped/failed row. */
export async function sendToAdmins(db: SupabaseClient, template: string, email: RenderedEmail, bookingId?: string | null, replyTo?: string) {
  const list = await adminEmails(db);
  if (!list.length) {
    await sendLogged(db, { bookingId, toRole: "admin", to: "", template, email });
    return;
  }
  for (const to of list) await sendLogged(db, { bookingId, toRole: "admin", to, template, email, replyTo });
}

export interface BookingRowForEmail {
  id: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  total_pence: number;
  discount_pence?: number | null;
  promo_code?: string | null;
  stripe_payment_intent_id?: string | null;
}

export function cleaningFeePence(): number {
  return Math.round(Number(optionalEnv("CLEANING_FEE_GBP") ?? "129") * 100);
}

/** Builds template data from a booking row. Nights subtotal = total + discount - cleaning fee. */
export function emailDataFromBooking(b: BookingRowForEmail, extra: Partial<BookingEmailData> = {}): BookingEmailData {
  const cleaning = cleaningFeePence();
  const discount = Math.max(0, b.discount_pence ?? 0);
  return {
    bookingId: b.id,
    guestName: b.guest_name,
    guestEmail: b.guest_email,
    guestPhone: b.guest_phone,
    checkIn: b.check_in,
    checkOut: b.check_out,
    nights: b.nights,
    guests: b.guests,
    accommodationPence: b.total_pence + discount - cleaning,
    discountPence: discount,
    promoCode: b.promo_code ?? null,
    cleaningPence: cleaning,
    totalPence: b.total_pence,
    siteUrl: siteUrl(),
    phone: PHONE,
    paymentIntentId: b.stripe_payment_intent_id ?? null,
    ...extra,
  };
}
