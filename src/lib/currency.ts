export const CURRENCY_CODE = "QAR" as const;
export const CURRENCY_LOCALE = "en-QA";

export function fmtNumber(n: number) {
  return new Intl.NumberFormat(CURRENCY_LOCALE, { maximumFractionDigits: 0 }).format(n);
}

export function fmtQar(n: number) {
  return `QAR ${fmtNumber(n)}`;
}

export function fmtCurrency(n: number, ccy: string = CURRENCY_CODE) {
  return `${ccy} ${fmtNumber(n)}`;
}
