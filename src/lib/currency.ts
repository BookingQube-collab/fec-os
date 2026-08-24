export const CURRENCY_CODE = "QAR" as const;
export const CURRENCY_LOCALE = "en-QA";

export function fmtNumber(n: number) {
  return new Intl.NumberFormat(CURRENCY_LOCALE, { maximumFractionDigits: 0 }).format(n);
}

function isArabicUi() {
  if (typeof document === "undefined") return false;
  return document.documentElement.lang.startsWith("ar");
}

export function fmtQar(n: number) {
  const amount = fmtNumber(n);
  return isArabicUi() ? `${amount} ر.ق` : `QAR ${amount}`;
}

export function fmtCurrency(n: number, ccy: string = CURRENCY_CODE) {
  const amount = fmtNumber(n);
  if (ccy === CURRENCY_CODE && isArabicUi()) return `${amount} ر.ق`;
  return `${ccy} ${amount}`;
}
