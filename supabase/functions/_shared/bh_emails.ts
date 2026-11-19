// Book Homes marketplace emails (guest, host, admin). Same look as the Zermatt emails.
// Sent and logged through mailer.ts (zermatt.email_log), so the admin Emails tab shows them too.
import { esc, longDate, money, type RenderedEmail } from "./emails.ts";
import { lines } from "./bh_quote.ts";

const GREEN = "#1f4d3a";
const AMBER = "#c8873a";
const LINE = "#e7e3dc";
const MUTED = "#5d6560";

export function ref(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

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
function p(t: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${t}</p>`;
}
function rows(r: [string, string][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#e9f1ec;border-radius:12px"><tr><td style="padding:14px 16px"><table role="presentation" width="100%">` +
    r.map(([a, b]) => `<tr><td style="padding:5px 0;font-size:15px">${a}</td><td align="right" style="padding:5px 0;font-size:15px">${b}</td></tr>`).join("") +
    `</table></td></tr></table>`;
}

export interface BhBooking {
  id: string;
  listing_title: string;
  listing_slug: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  company_name: string | null;
  nights_pence: number;
  discount_pence: number;
  discount_label: string | null;
  cleaning_pence: number;
  extra_guest_pence?: number;
  pet_pence?: number;
  pets?: number;
  amount_pence: number;
  fee_pence: number;
  host_payout_pence: number;
  payout_mode: string;
  check_in_time: string;
  check_out_time: string;
  host_name: string;
  host_phone: string | null;
  host_whatsapp: string | null;
  host_email: string | null;
  review_token?: string;
}

function priceRows(b: BhBooking): [string, string][] {
  const r: [string, string][] = lines({ ...b, extra_guest_pence: b.extra_guest_pence ?? 0, pet_pence: b.pet_pence ?? 0 })
    .map((x) => [esc(x.label), (x.pence < 0 ? "-" : "") + money(Math.abs(x.pence))]);
  r.push(["<b>Total paid</b>", `<b>${money(b.amount_pence)}</b>`]);
  r.push(["Booking fee", "None"]);
  return r;
}

export function guestBooked(b: BhBooking, site: string): RenderedEmail {
  const subject = `Booking confirmed - ${b.listing_title}, ${longDate(b.check_in)} (ref ${ref(b.id)})`;
  const wa = (b.host_whatsapp || b.host_phone || "").replace(/[^\d]/g, "");
  const contact = [
    b.host_phone ? `Phone: <a href="tel:${esc(b.host_phone.replace(/[^\d+]/g, ""))}" style="color:${GREEN}">${esc(b.host_phone)}</a>` : "",
    wa ? `WhatsApp: <a href="https://wa.me/${esc(wa)}" style="color:${GREEN}">message ${esc(b.host_name)}</a>` : "",
  ].filter(Boolean).join("<br>");
  const body = p(`Hi ${esc(b.guest_name.split(" ")[0])},`) +
    p(`Your stay at <b>${esc(b.listing_title)}</b> is confirmed and paid. There are no booking fees on Book Homes.`) +
    rows([["Reference", `<b>${ref(b.id)}</b>`], ["Check-in", `${esc(longDate(b.check_in))}, from ${esc(b.check_in_time)}`],
      ["Checkout", `${esc(longDate(b.check_out))}, by ${esc(b.check_out_time)}`], ["Guests", String(b.guests) + (b.pets ? `, ${b.pets} pet${b.pets === 1 ? "" : "s"}` : "")]]) +
    rows(priceRows(b)) +
    p(`<b>Your host:</b> ${esc(b.host_name)}<br>${contact || "Your host will contact you before arrival."}`) +
    p(`Your host sends the full address and access details before arrival.${b.company_name ? " Your receipt in the name of " + esc(b.company_name) + " comes from Stripe in a separate email." : ""}`) +
    p(`<a href="${esc(site)}/${esc(b.listing_slug)}" style="color:${GREEN}">View the listing</a>`);
  const text = `Your stay at ${b.listing_title} is confirmed and paid.\nReference ${ref(b.id)}\nCheck-in ${longDate(b.check_in)} from ${b.check_in_time}\nCheckout ${longDate(b.check_out)} by ${b.check_out_time}\nGuests ${b.guests}\nTotal paid ${money(b.amount_pence)}\n\nYour host: ${b.host_name} ${b.host_phone ?? ""}\n${site}/${b.listing_slug}`;
  return { subject, html: layout("Your booking is confirmed", body, site), text };
}

export function hostBooked(b: BhBooking, site: string): RenderedEmail {
  const subject = `New booking: ${b.listing_title}, ${b.check_in} to ${b.check_out} (${money(b.amount_pence)})`;
  const payout = b.payout_mode === "connect"
    ? "Your payout is sent to your bank automatically by Stripe."
    : "Book Homes pays you by bank transfer after check-in (Stripe payouts are not connected yet).";
  const body = p(`Good news: <b>${esc(b.listing_title)}</b> has a new paid booking.`) +
    rows([["Reference", `<b>${ref(b.id)}</b>`], ["Dates", `${esc(b.check_in)} to ${esc(b.check_out)}`], ["Nights", String(b.nights)],
      ["Guests", String(b.guests)], ["Guest", esc(b.guest_name)], ["Guest phone", esc(b.guest_phone ?? "-")], ["Guest email", esc(b.guest_email)]]) +
    rows([["Guest paid", money(b.amount_pence)], ["Book Homes commission", "-" + money(b.fee_pence)], ["<b>Your payout</b>", `<b>${money(b.host_payout_pence)}</b>`]]) +
    p(payout) + p("Please send the guest the address and access details before arrival. The dates are already closed on your Book Homes calendar and in your iCal export.") +
    p(`<a href="${esc(site)}/host/" style="color:${GREEN}">Open your host dashboard</a>`);
  const text = `New booking for ${b.listing_title}: ${b.check_in} to ${b.check_out}, ${b.guests} guests. Guest ${b.guest_name} ${b.guest_phone ?? ""} ${b.guest_email}. Payout ${money(b.host_payout_pence)}. ${payout}`;
  return { subject, html: layout("New booking", body, site), text };
}

export function adminBooked(b: BhBooking, site: string): RenderedEmail {
  const subject = `Marketplace booking: ${b.listing_title} ${b.check_in} (${money(b.amount_pence)}, fee ${money(b.fee_pence)})`;
  const body = p(`New paid marketplace booking (${esc(b.payout_mode === "connect" ? "Stripe Connect payout" : "MANUAL payout due to host")}).`) +
    rows([["Listing", esc(b.listing_title)], ["Dates", `${esc(b.check_in)} to ${esc(b.check_out)}`], ["Guest", esc(b.guest_name)],
      ["Paid", money(b.amount_pence)], ["Commission", money(b.fee_pence)], ["Host payout", money(b.host_payout_pence)], ["Host", esc(b.host_name)]]) +
    p(`<a href="${esc(site)}/admin/" style="color:${GREEN}">Open admin</a>`);
  return { subject, html: layout("Marketplace booking", body, site), text: subject };
}

export function reviewRequest(b: BhBooking, site: string): RenderedEmail {
  const url = `${site}/stays/review/?t=${b.review_token}`;
  const subject = `How was your stay at ${b.listing_title}?`;
  const body = p(`Hi ${esc(b.guest_name.split(" ")[0])},`) +
    p(`Thanks for staying at <b>${esc(b.listing_title)}</b>. Could you leave a short review? Only guests who completed a stay can review, so it really helps other guests.`) +
    p(`<a href="${esc(url)}" style="display:inline-block;background:${GREEN};color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Leave a review</a>`);
  return { subject, html: layout("How was your stay?", body, site), text: `Leave a review: ${url}` };
}

export function adminNotice(subject: string, lines: string[], site: string, link = "/admin/"): RenderedEmail {
  const body = lines.map((l) => p(esc(l))).join("") + p(`<a href="${esc(site)}${esc(link)}" style="color:${GREEN}">Open</a>`);
  return { subject, html: layout(subject, body, site), text: lines.join("\n") };
}
