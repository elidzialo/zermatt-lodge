// UK bank details for hosts paid by manual bank transfer (owner decision 22 Nov 2026).
// Format checks only: sort code 6 digits (shown 12-34-56), account number 8 digits.
// Not a UK modulus check: Vocalink's algorithm needs its weight table and substitution files (valacdos.txt, scsubtab.txt),
// which change several times a year and are not available offline here. The admin still checks the name with
// the bank (Confirmation of Payee) when sending the first transfer.
// Storage: bookhomes.save_host_bank() encrypts with pgcrypto and the Vault key; this module never logs the numbers.

export const MODULUS_NOTE = "Format checked (6-digit sort code, 8-digit account number). Not modulus checked.";

const HOLDER_RE = /^[\p{L}\p{M}0-9' .,&()\/-]{2,70}$/u;

export type BankInput = { holder: string; sort: string; account: string };

// Returns the cleaned details or a plain-English error for the host.
export function checkBank(b: Record<string, unknown>): { ok: true; v: BankInput } | { ok: false; error: string } {
  const holder = String(b.holder_name ?? "").replace(/\s+/g, " ").trim();
  const sortRaw = String(b.sort_code ?? "").trim(), accRaw = String(b.account_number ?? "").trim();
  if (!HOLDER_RE.test(holder)) return { ok: false, error: "Please enter the account holder's name as the bank has it." };
  if (!/^[0-9 -]{6,10}$/.test(sortRaw)) return { ok: false, error: "The sort code should be 6 digits, like 12-34-56." };
  const sort = sortRaw.replace(/\D/g, "");
  if (sort.length !== 6) return { ok: false, error: "The sort code should be 6 digits, like 12-34-56." };
  if (!/^[0-9 ]{8,10}$/.test(accRaw)) return { ok: false, error: "The account number should be 8 digits." };
  const account = accRaw.replace(/\D/g, "");
  if (account.length !== 8) return { ok: false, error: "The account number should be 8 digits." };
  if (/^0+$/.test(sort) || /^0+$/.test(account)) return { ok: false, error: "Please check the sort code and account number." };
  return { ok: true, v: { holder, sort, account } };
}

export function formatSort(sort: string): string {
  return `${sort.slice(0, 2)}-${sort.slice(2, 4)}-${sort.slice(4, 6)}`;
}
