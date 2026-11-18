// Email templates for Zermatt Lodge (pure functions, no imports: they render the same in Deno and Node).
// Each returns { subject, html, text }. Styling is inline (email clients ignore <style> blocks) and
// follows the website: deep green #1f4d3a with amber #c8873a.

export interface BookingEmailData {
  bookingId: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  nights: number;
  guests: number;
  accommodationPence: number; // nights before any discount
  discountPence: number;
  promoCode: string | null;
  cleaningPence: number;
  totalPence: number; // what the guest paid
  siteUrl: string;
  phone: string;
  paymentIntentId?: string | null;
  refundNote?: string; // conflict emails only
}

export interface SignupEmailData {
  email: string;
  name: string | null;
  consent: boolean;
  sourcePage: string | null;
  code: string | null;
  createdAt: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const GREEN = "#1f4d3a";
const GREEN_TINT = "#e9f1ec";
const AMBER = "#c8873a";
const AMBER_TINT = "#f8efe3";
const INK = "#1b1f1d";
const MUTED = "#5d6560";
const LINE = "#e7e3dc";

export const NO_PARTIES = "Strictly no parties or events - bookings found to be for parties are cancelled.";
export const CANCELLATION =
  "Cancellation policy (Moderate): full refund if you cancel up to 5 days before check-in, a 50% refund if you cancel after that, and no refund after check-in.";

export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function money(pence: number): string {
  return "£" + (pence / 100).toFixed(2);
}

export function longDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(iso + "T00:00:00Z"));
}

export function bookingRef(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function firstName(name: string): string {
  return (name || "").trim().split(/\s+/)[0] || "there";
}

/** Shared outer layout */
function layout(preheader: string, heading: string, body: string, siteUrl: string): string {
  return `<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#fbf8f3;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${INK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf8f3"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden">
<tr><td style="background:${GREEN};padding:22px 28px;border-bottom:5px solid ${AMBER}">
<div style="font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#ffffff">Book Homes</div>
<div style="font-size:13px;color:#d9e6de;margin-top:2px">Zermatt Lodge · Liverpool</div></td></tr>
<tr><td style="padding:28px 28px 8px">
<h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:24px;line-height:1.25;color:${GREEN}">${esc(heading)}</h1>
${body}
</td></tr>
<tr><td style="padding:18px 28px 26px;font-size:12.5px;color:${MUTED};border-top:1px solid ${LINE}">
Book Homes · Zermatt Lodge, Liverpool · <a href="${esc(siteUrl)}" style="color:${GREEN}">${esc(siteUrl.replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table></body></html>`;
}

function row(label: string, value: string, opts: { bold?: boolean; color?: string } = {}): string {
  const w = opts.bold ? "bold" : "normal";
  return `<tr><td style="padding:7px 0;font-size:15px;color:${opts.color ?? INK};font-weight:${w}">${label}</td>` +
    `<td align="right" style="padding:7px 0;font-size:15px;color:${opts.color ?? INK};font-weight:${w};white-space:nowrap">${value}</td></tr>`;
}

function detailsTable(d: BookingEmailData): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GREEN_TINT};border-radius:12px;margin:0 0 18px"><tr><td style="padding:16px 18px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row("Booking reference", `<b style="letter-spacing:.06em">${esc(bookingRef(d.bookingId))}</b>`)}
${row("Check-in", `${esc(longDate(d.checkIn))}, from 3pm`)}
${row("Checkout", `${esc(longDate(d.checkOut))}, by 11am`)}
${row("Nights", String(d.nights))}
${row("Guests", String(d.guests))}
</table></td></tr></table>`;
}

function priceTable(d: BookingEmailData, totalLabel = "Total paid"): string {
  const nightsLabel = `${d.nights} night${d.nights === 1 ? "" : "s"}`;
  const disc = d.discountPence > 0
    ? row(`Welcome discount${d.promoCode ? " (" + esc(d.promoCode) + ")" : ""}`, "-" + money(d.discountPence), { color: GREEN })
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-top:1px solid ${LINE}">
${row(esc(nightsLabel), money(d.accommodationPence))}
${disc}
${d.cleaningPence > 0 ? row("Cleaning fee", money(d.cleaningPence)) : ""}
<tr><td colspan="2" style="border-top:2px solid ${GREEN};font-size:0;line-height:0">&nbsp;</td></tr>
${row(totalLabel, money(d.totalPence), { bold: true })}
</table>`;
}

function noPartiesBox(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>
<td style="background:${AMBER_TINT};border:2px solid ${AMBER};border-radius:12px;padding:12px 16px;font-size:14.5px;color:${INK}">
<b style="color:#8a1c12">Strictly no parties or events.</b> Bookings found to be for parties are cancelled.</td></tr></table>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${INK}">${text}</p>`;
}

function priceText(d: BookingEmailData, totalLabel = "Total paid"): string {
  return [
    `${d.nights} night${d.nights === 1 ? "" : "s"}: ${money(d.accommodationPence)}`,
    d.discountPence > 0 ? `Welcome discount${d.promoCode ? " (" + d.promoCode + ")" : ""}: -${money(d.discountPence)}` : "",
    d.cleaningPence > 0 ? `Cleaning fee: ${money(d.cleaningPence)}` : "",
    `${totalLabel}: ${money(d.totalPence)}`,
  ].filter(Boolean).join("\n");
}

function detailsText(d: BookingEmailData): string {
  return [
    `Booking reference: ${bookingRef(d.bookingId)}`,
    `Check-in: ${longDate(d.checkIn)}, from 3pm`,
    `Checkout: ${longDate(d.checkOut)}, by 11am`,
    `Nights: ${d.nights}`,
    `Guests: ${d.guests}`,
  ].join("\n");
}

/** (a) Guest booking confirmation */
export function guestConfirmation(d: BookingEmailData): RenderedEmail {
  const subject = `Booking confirmed - Zermatt Lodge, ${longDate(d.checkIn)} (ref ${bookingRef(d.bookingId)})`;
  const tel = d.phone.replace(/[^\d+]/g, "");
  const body =
    p(`Hi ${esc(firstName(d.guestName))},`) +
    p("Thank you for booking direct. Your stay at Zermatt Lodge is confirmed and your payment has been received.") +
    detailsTable(d) +
    `<h2 style="margin:0 0 6px;font-family:Georgia,serif;font-size:18px;color:${GREEN}">Price</h2>` +
    priceTable(d) +
    noPartiesBox() +
    `<h2 style="margin:0 0 6px;font-family:Georgia,serif;font-size:18px;color:${GREEN}">Before you arrive</h2>` +
    p("We will send the full address and access details before your arrival. We will also ask for guest ID and a signed rental agreement, and a damage deposit or waiver may be required.") +
    p(`<span style="color:${MUTED};font-size:14px">${esc(CANCELLATION)}</span>`) +
    p(`Questions? Call or WhatsApp <a href="tel:${esc(tel)}" style="color:${GREEN};font-weight:bold">${esc(d.phone)}</a>, or just reply to this email.`) +
    p("We look forward to hosting you.<br>Book Homes");
  const text = `Hi ${firstName(d.guestName)},\n\nThank you for booking direct. Your stay at Zermatt Lodge is confirmed and your payment has been received.\n\n` +
    `${detailsText(d)}\n\n${priceText(d)}\n\n${NO_PARTIES}\n\n` +
    `We will send the full address and access details before your arrival. We will also ask for guest ID and a signed rental agreement, and a damage deposit or waiver may be required.\n\n` +
    `${CANCELLATION}\n\nQuestions? Call ${d.phone} or reply to this email.\n\nBook Homes\n${d.siteUrl}`;
  return { subject, html: layout(`Your stay is confirmed: ${longDate(d.checkIn)} to ${longDate(d.checkOut)}`, "Your booking is confirmed", body, d.siteUrl), text };
}

/** (b) Admin alert: new paid booking */
export function adminNewBooking(d: BookingEmailData): RenderedEmail {
  const subject = `New direct booking: ${d.checkIn} to ${d.checkOut} - ${d.guestName} (${money(d.totalPence)})`;
  const stripe = d.paymentIntentId ? `https://dashboard.stripe.com/payments/${d.paymentIntentId}` : "";
  const body =
    p("A new booking has been paid on the website.") +
    detailsTable(d) + priceTable(d) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-top:1px solid ${LINE}">
${row("Guest", esc(d.guestName))}${row("Email", `<a href="mailto:${esc(d.guestEmail)}" style="color:${GREEN}">${esc(d.guestEmail)}</a>`)}
${row("Phone", esc(d.guestPhone ?? "-"))}${stripe ? row("Stripe", `<a href="${esc(stripe)}" style="color:${GREEN}">Open payment</a>`) : ""}</table>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr><td style="background:${AMBER_TINT};border-left:4px solid ${AMBER};padding:12px 14px;font-size:14.5px">
<b>Action:</b> block these dates on Airbnb, Booking.com and Vrbo now. They only see the website calendar on their next refresh.</td></tr></table>`;
  const text = `New paid booking on the website.\n\n${detailsText(d)}\n\n${priceText(d)}\n\nGuest: ${d.guestName}\nEmail: ${d.guestEmail}\nPhone: ${d.guestPhone ?? "-"}\n` +
    (stripe ? `Stripe: ${stripe}\n` : "") + `\nAction: block these dates on Airbnb, Booking.com and Vrbo now.`;
  return { subject, html: layout("New paid booking", "New direct booking", body, d.siteUrl), text };
}

/** Guest apology after an automatic full refund (dates taken at the moment of payment) */
export function guestConflictRefund(d: BookingEmailData): RenderedEmail {
  const subject = "Sorry - those dates have just gone, and you have been refunded in full";
  const tel = d.phone.replace(/[^\d+]/g, "");
  const body =
    p(`Hi ${esc(firstName(d.guestName))},`) +
    p(`Thank you for choosing Zermatt Lodge. We are very sorry: the dates you picked (${esc(longDate(d.checkIn))} to ${esc(longDate(d.checkOut))}) were booked by someone else at the same moment, so we could not confirm your stay.`) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GREEN_TINT};border-radius:12px;margin:0 0 18px"><tr><td style="padding:16px 18px;font-size:15px">
We have refunded your payment of <b>${money(d.totalPence)}</b> in full. It usually shows on your card within 5-10 working days.<br>
<span style="color:${MUTED};font-size:13.5px">Reference ${esc(bookingRef(d.bookingId))}</span></td></tr></table>` +
    p(`We would love to find you other dates. Call <a href="tel:${esc(tel)}" style="color:${GREEN};font-weight:bold">${esc(d.phone)}</a> or reply to this email.`) +
    p("With apologies,<br>Book Homes");
  const text = `Hi ${firstName(d.guestName)},\n\nWe are very sorry: the dates you picked (${longDate(d.checkIn)} to ${longDate(d.checkOut)}) were booked by someone else at the same moment, so we could not confirm your stay.\n\n` +
    `We have refunded your payment of ${money(d.totalPence)} in full. It usually shows on your card within 5-10 working days. Reference ${bookingRef(d.bookingId)}.\n\n` +
    `We would love to find you other dates. Call ${d.phone} or reply to this email.\n\nWith apologies,\nBook Homes`;
  return { subject, html: layout("Your payment has been refunded in full", "Sorry, those dates have just gone", body, d.siteUrl), text };
}

/** Admin alert: clash at payment, refund made (or refund failed) */
export function adminConflict(d: BookingEmailData): RenderedEmail {
  const subject = `Booking clash refunded: ${d.checkIn} to ${d.checkOut} - ${d.guestName}`;
  const body =
    p("A guest paid on the website, but by the time Stripe confirmed the payment the nights had been taken (channel calendar or another booking). The booking is now <b>cancelled_conflict</b>.") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr><td style="background:#fdeceb;border-left:4px solid #b42318;padding:12px 14px;font-size:14.5px">${esc(d.refundNote ?? "")}</td></tr></table>` +
    detailsTable(d) + priceTable(d) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-top:1px solid ${LINE}">
${row("Guest", esc(d.guestName))}${row("Email", esc(d.guestEmail))}${row("Phone", esc(d.guestPhone ?? "-"))}</table>`;
  const text = `Booking clash at payment - cancelled_conflict.\n${d.refundNote ?? ""}\n\n${detailsText(d)}\n\n${priceText(d)}\n\nGuest: ${d.guestName}\nEmail: ${d.guestEmail}\nPhone: ${d.guestPhone ?? "-"}`;
  return { subject, html: layout("Booking clash refunded", "Booking clash - refunded", body, d.siteUrl), text };
}

/** Admin alert: refund of 50% or more cancelled a paid booking */
export function adminCancelled(d: BookingEmailData, refundedPence: number): RenderedEmail {
  const subject = `Booking cancelled after refund: ${d.checkIn} to ${d.checkOut} - ${d.guestName}`;
  const body =
    p(`A refund of <b>${money(refundedPence)}</b> was made in Stripe, so this booking is now cancelled and the nights are free again on the website.`) +
    detailsTable(d) +
    p("If you blocked these dates by hand on Airbnb, Booking.com or Vrbo, unblock them there too.");
  const text = `A refund of ${money(refundedPence)} was made, so this booking is cancelled and the nights are free again.\n\n${detailsText(d)}\n\nIf you blocked these dates by hand on Airbnb, Booking.com or Vrbo, unblock them there too.`;
  return { subject, html: layout("Booking cancelled", "Booking cancelled", body, d.siteUrl), text };
}

/** Admin alert: new popup sign-up */
export function adminSignup(s: SignupEmailData, siteUrl: string): RenderedEmail {
  const subject = `New website sign-up: ${s.email}`;
  const body =
    p("Someone signed up through the 5% offer on the website.") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-top:1px solid ${LINE}">
${row("Email", esc(s.email))}${row("Name", esc(s.name ?? "-"))}${row("Offers by email", s.consent ? "Yes" : "No")}
${row("Code shown", esc(s.code ?? "-"))}${row("Page", esc(s.sourcePage ?? "/"))}</table>` +
    p(`<span style="color:${MUTED};font-size:13.5px">${s.consent ? "They agreed to receive offers." : "They did not tick the offers box, so do not add them to marketing emails."} All sign-ups are in the admin area under Sign-ups.</span>`);
  const text = `New sign-up through the 5% offer.\nEmail: ${s.email}\nName: ${s.name ?? "-"}\nOffers by email: ${s.consent ? "yes" : "no"}\nCode shown: ${s.code ?? "-"}\nPage: ${s.sourcePage ?? "/"}`;
  return { subject, html: layout("New website sign-up", "New sign-up", body, siteUrl), text };
}
