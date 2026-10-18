export const DISPLAY_CURRENCIES = ['USD', 'EUR'] as const;
export type DisplayCurrency = typeof DISPLAY_CURRENCIES[number];
export const CURRENCY_NAMES: Record<DisplayCurrency, string> = { USD: 'US Dollar', EUR: 'Euro' };

/** Prototype conversion only, matching the catalog's sample-price contract. Not live FX. */
export const SAMPLE_USD_TO_EUR = 0.92;
const rates: Record<DisplayCurrency, number> = { USD: 1, EUR: SAMPLE_USD_TO_EUR };
const formatters = {
  USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
  EUR: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }),
};

export function normalizeDisplayCurrency(value: unknown): DisplayCurrency {
  return value === 'EUR' ? 'EUR' : 'USD';
}

/** Always convert from original USD values, never from previously converted display values. */
export function convertUsd(amount: number, currency: DisplayCurrency): number {
  if (!Number.isFinite(amount)) throw new RangeError('A monetary amount must be finite.');
  return Math.round(amount * 100 * rates[currency]) / 100 || 0;
}

export function formatUsd(amount: number, currency: DisplayCurrency): string {
  return formatters[currency].format(convertUsd(amount, currency));
}
