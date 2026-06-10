/**
 * Währungs-Codes nach ISO 4217. accountant unterstützt aktuell EUR
 * (default) und CHF. Erweiterung möglich, aber jede neue Währung braucht:
 *   - Format-Helper (Tausender/Dezimal-Trenner)
 *   - UVA/BMD-Aggregation-Anpassung (separate Reports pro Währung)
 *   - PDF-Format-Anpassung
 *   - XRechnung-DocumentCurrencyCode
 */

export const supportedCurrencies = ['EUR', 'CHF'] as const;
export type CurrencyCode = (typeof supportedCurrencies)[number];

export const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: '€',
  CHF: 'CHF',
};

/**
 * Format-Helper. Beide Währungen nutzen Komma als Dezimaltrenner für AT/DE/CH-
 * Wahrnehmung. EUR liefert das €-Symbol, CHF schreibt „CHF" davor (Schweizer
 * Konvention) — kein €-Symbol-Hack.
 */
export function formatAmount(value: number, currency: CurrencyCode = 'EUR'): string {
  const formatted = (Math.round(value * 100) / 100).toLocaleString('de-AT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currency === 'CHF') return `CHF ${formatted}`;
  return `${formatted} €`;
}

/** Default-Währung pro Sitz-Land aus CompanySettings.country. */
export function defaultCurrencyFor(country: string): CurrencyCode {
  if (country === 'CH') return 'CHF';
  return 'EUR';
}
