export const euCountries = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK',
] as const;

export const nonEuCountriesCommon = ['CH', 'GB', 'US', 'LI', 'NO', 'TR'] as const;

export const allCountries = [...euCountries, ...nonEuCountriesCommon] as const;
export type CountryCode = (typeof allCountries)[number];

const EU_SET: ReadonlySet<string> = new Set(euCountries);

export function isEU(c: string): boolean {
  return EU_SET.has(c);
}

const PREFIX_MAP: Partial<Record<string, string>> = {
  AT: 'ATU', BE: 'BE', BG: 'BG', CY: 'CY', CZ: 'CZ', DE: 'DE', DK: 'DK',
  EE: 'EE', ES: 'ES', FI: 'FI', FR: 'FR', GR: 'EL', HR: 'HR', HU: 'HU',
  IE: 'IE', IT: 'IT', LT: 'LT', LU: 'LU', LV: 'LV', MT: 'MT', NL: 'NL',
  PL: 'PL', PT: 'PT', RO: 'RO', SE: 'SE', SI: 'SI', SK: 'SK',
  CH: 'CHE', GB: 'GB',
};

export function vatIdPrefix(c: string): string {
  return PREFIX_MAP[c] ?? '';
}

const NAMES_DE: Record<string, string> = {
  AT: 'Österreich', BE: 'Belgien', BG: 'Bulgarien', CY: 'Zypern', CZ: 'Tschechien',
  DE: 'Deutschland', DK: 'Dänemark', EE: 'Estland', ES: 'Spanien', FI: 'Finnland',
  FR: 'Frankreich', GR: 'Griechenland', HR: 'Kroatien', HU: 'Ungarn', IE: 'Irland',
  IT: 'Italien', LT: 'Litauen', LU: 'Luxemburg', LV: 'Lettland', MT: 'Malta',
  NL: 'Niederlande', PL: 'Polen', PT: 'Portugal', RO: 'Rumänien', SE: 'Schweden',
  SI: 'Slowenien', SK: 'Slowakei',
  CH: 'Schweiz', GB: 'Vereinigtes Königreich', US: 'USA', LI: 'Liechtenstein',
  NO: 'Norwegen', TR: 'Türkei',
};

export function countryName(c: string): string {
  return NAMES_DE[c] ?? c;
}
