const FORMATS: Record<string, RegExp> = {
  AT: /^ATU\d{8}$/,
  BE: /^BE0?\d{9}$/,
  BG: /^BG\d{9,10}$/,
  CY: /^CY\d{8}[A-Z]$/,
  CZ: /^CZ\d{8,10}$/,
  DE: /^DE\d{9}$/,
  DK: /^DK\d{8}$/,
  EE: /^EE\d{9}$/,
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^FI\d{8}$/,
  FR: /^FR[A-HJ-NP-Z0-9]{2}\d{9}$/,
  GR: /^EL\d{9}$/,
  HR: /^HR\d{11}$/,
  HU: /^HU\d{8}$/,
  IE: /^IE\d{7}[A-Z]{1,2}$/,
  IT: /^IT\d{11}$/,
  LT: /^LT(\d{9}|\d{12})$/,
  LU: /^LU\d{8}$/,
  LV: /^LV\d{11}$/,
  MT: /^MT\d{8}$/,
  NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/,
  PT: /^PT\d{9}$/,
  RO: /^RO\d{2,10}$/,
  SE: /^SE\d{12}$/,
  SI: /^SI\d{8}$/,
  SK: /^SK\d{10}$/,
  CH: /^CHE\d{9}(MWST|TVA|IVA)?$/,
  GB: /^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
};

export function normalizeVatId(s: string): string {
  return s.toUpperCase().replace(/[\s.-]/g, '');
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  normalized?: string;
}

export function validateVatId(vatId: string, country: string): ValidationResult {
  if (!vatId || !vatId.trim()) return { ok: true };
  const normalized = normalizeVatId(vatId);
  const pattern = FORMATS[country];
  if (!pattern) {
    return { ok: true, reason: `Kein Format-Check für Land ${country}`, normalized };
  }
  if (!pattern.test(normalized)) {
    return { ok: false, reason: `UID matched nicht erwartetes Format ${pattern.source}`, normalized };
  }
  return { ok: true, normalized };
}
