/** Supported ISO 4217 codes in this app. Legacy data without currency is treated as USD. */
export const SUPPORTED_CURRENCIES = ["USD", "XCD"];

/** Official XCD peg: 1 USD = 2.7 XCD */
export const XCD_PER_USD = 2.7;

export function normalizeCurrency(code) {
  const c = String(code ?? "USD").trim().toUpperCase();
  return SUPPORTED_CURRENCIES.includes(c) ? c : "USD";
}

/** Convert a positive amount between currencies (via USD). */
export function convertAmount(amount, fromCode, toCode) {
  const from = normalizeCurrency(fromCode);
  const to = normalizeCurrency(toCode);
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  if (from === to) return n;

  let usd;
  if (from === "USD") usd = n;
  else if (from === "XCD") usd = n / XCD_PER_USD;
  else usd = n;

  if (to === "USD") return usd;
  if (to === "XCD") return usd * XCD_PER_USD;
  return n;
}

export function formatMoneyAmount(amount, currencyCode) {
  const c = normalizeCurrency(currencyCode);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: c,
  }).format(Math.abs(Number(amount)));
}

/**
 * Build secondary lines for display when transaction currency differs from account/category.
 * @returns {string[]} lines without leading "≈" (caller can prefix)
 */
export function conversionHints(transaction, account, categoryMeta) {
  const txCur = normalizeCurrency(transaction?.currency);
  const amt = Number(transaction?.amount);
  if (!Number.isFinite(amt)) return [];

  const hints = [];
  const accCur = account ? normalizeCurrency(account.currency) : txCur;
  const catCur = categoryMeta
    ? normalizeCurrency(categoryMeta.currency)
    : txCur;

  if (account && txCur !== accCur) {
    const v = convertAmount(amt, txCur, accCur);
    hints.push(`≈ ${formatMoneyAmount(v, accCur)} (account)`);
  }
  if (
    categoryMeta &&
    String(transaction?.category ?? "") !== "Balance adjustment" &&
    txCur !== catCur
  ) {
    const v = convertAmount(amt, txCur, catCur);
    hints.push(`≈ ${formatMoneyAmount(v, catCur)} (category)`);
  }
  return hints;
}
