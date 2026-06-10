/**
 * AT-Einkommensteuer-Kernel (Phase 31, v0.33.0)
 *
 * Berechnet die ESt für ein Jahr aus dem Gewinn. Pure Function,
 * isomorph — wird im Server-Endpoint /api/est und in der UI-Vorschau
 * genutzt.
 *
 * Tarif-Quelle: Inflationsanpassungsverordnung 2026
 * (BGBl. II Nr. 191/2025, kundgemacht 2025-08-30).
 * Brackets sind final, nicht vorläufig.
 *
 * Verkettung mit SVS (§4 Abs. 4 EStG): SVS-Beiträge sind voll
 * Betriebsausgabe und senken die ESt-Bemessungsgrundlage.
 *
 * Hinweise:
 *   - Spitzensteuersatz 55% gilt befristet 2016–2029 (mehrfach
 *     verlängert; für 2026 anwenden).
 *   - Verlustvortrag (§18 Abs. 6 EStG) ist out of scope der Forecast —
 *     bei negativem Gewinn returnt die Function ESt=0.
 *   - Pauschalierungen (§17 EStG Basispauschale, KU-Pauschalierung)
 *     muss der User ggf. selbst per Gewinn-Override modellieren.
 */

export const EST_BRACKETS_2026 = [
  { from: 0,         to: 13539,    rate: 0.00 },
  { from: 13539,     to: 21992,    rate: 0.20 },
  { from: 21992,     to: 36458,    rate: 0.30 },
  { from: 36458,     to: 70365,    rate: 0.40 },
  { from: 70365,     to: 104859,   rate: 0.48 },
  { from: 104859,    to: 1000000,  rate: 0.50 },
  { from: 1000000,   to: Infinity, rate: 0.55 },
] as const;

export interface EstBracketSlice {
  from: number;
  to: number;
  rate: number;
  /** Steuerbarer Betrag in diesem Bracket */
  amountInBracket: number;
  /** Steuer auf diesen Bracket-Anteil */
  taxOnBracket: number;
}

export interface EstGewinnfreibetrag {
  /** Grundfreibetrag (15% bis 33k, max 4.950, automatisch) */
  grund: number;
  /** Investitionsbedingter GFB (gestaffelt 13/7/4,5%, nur wenn investiert) */
  investitionsbedingt: number;
  total: number;
}

export interface EstResult {
  /** Jahresgewinn vor SVS-Abzug */
  profit: number;
  /** SVS-Abzug als Betriebsausgabe */
  svsAnnual: number;
  /** Gewinn nach SVS-Abzug = ESt-Bemessungsgrundlage vor GFB */
  bemessungsgrundlage: number;
  /** Anwendung Gewinnfreibetrag */
  gewinnfreibetrag: EstGewinnfreibetrag;
  /** Bemessungsgrundlage nach GFB = zu versteuerndes Einkommen */
  taxableIncome: number;
  /** Berechnete Einkommensteuer */
  est: number;
  /** Effektiver Durchschnittssteuersatz auf taxableIncome */
  effectiveRate: number;
  /** Grenzsteuersatz (höchster aktiv getroffener Bracket) */
  marginalRate: number;
  /** Bracket-Aufschlüsselung — nur Brackets mit Anteil */
  bracketBreakdown: EstBracketSlice[];
}

/**
 * Gewinnfreibetrag §10 EStG (gestaffelt).
 *
 * @param bemessungsgrundlage Bemessungsgrundlage nach SVS-Abzug.
 * @param applyInvestitionsbedingt Wenn `false` (konservativer Default
 *        für Forecast), wird nur der Grundfreibetrag (15% bis 33k)
 *        angesetzt. Der investitionsbedingte Teil verlangt nach §10
 *        EStG eine entsprechende Investition in begünstigte
 *        Wirtschaftsgüter oder Wertpapiere (§14 Abs. 7 Z 4 EStG).
 */
export function calculateGewinnfreibetrag(
  bemessungsgrundlage: number,
  applyInvestitionsbedingt = false,
): EstGewinnfreibetrag {
  if (bemessungsgrundlage <= 0) {
    return { grund: 0, investitionsbedingt: 0, total: 0 };
  }
  // Grundfreibetrag: 15% auf die ersten 33.000 (max 4.950)
  const grund = Math.min(bemessungsgrundlage, 33000) * 0.15;
  let investitionsbedingt = 0;
  if (applyInvestitionsbedingt) {
    if (bemessungsgrundlage > 33000) {
      investitionsbedingt += Math.min(bemessungsgrundlage - 33000, 145000) * 0.13;
    }
    if (bemessungsgrundlage > 178000) {
      investitionsbedingt += Math.min(bemessungsgrundlage - 178000, 175000) * 0.07;
    }
    if (bemessungsgrundlage > 353000) {
      investitionsbedingt += Math.min(bemessungsgrundlage - 353000, 230000) * 0.045;
    }
  }
  return {
    grund: round2(grund),
    investitionsbedingt: round2(investitionsbedingt),
    total: round2(grund + investitionsbedingt),
  };
}

/**
 * Berechnet die AT-Einkommensteuer aus Jahresgewinn.
 *
 * @param profit Jahresgewinn aus selbständiger Erwerbstätigkeit (vor SVS).
 * @param opts.svsAnnual SVS-Beiträge des Jahres (als Betriebsausgabe abziehbar).
 * @param opts.applyInvestitionsbedingtGfb Investitionsbedingten Teil des
 *        Gewinnfreibetrags ansetzen (default false, konservativ).
 */
export function calculateEst(
  profit: number,
  opts: {
    svsAnnual?: number;
    applyInvestitionsbedingtGfb?: boolean;
  } = {},
): EstResult {
  const svsAnnual = opts.svsAnnual ?? 0;
  const bemessungsgrundlage = profit - svsAnnual;
  const gfb = calculateGewinnfreibetrag(
    bemessungsgrundlage,
    opts.applyInvestitionsbedingtGfb ?? false,
  );
  const taxableIncome = Math.max(0, bemessungsgrundlage - gfb.total);

  const bracketBreakdown: EstBracketSlice[] = [];
  let est = 0;
  let marginalRate = 0;
  for (const b of EST_BRACKETS_2026) {
    const amountInBracket = Math.max(0, Math.min(taxableIncome, b.to) - b.from);
    if (amountInBracket <= 0) continue;
    const taxOnBracket = amountInBracket * b.rate;
    est += taxOnBracket;
    if (b.rate > marginalRate) marginalRate = b.rate;
    bracketBreakdown.push({
      from: b.from,
      to: b.to,
      rate: b.rate,
      amountInBracket: round2(amountInBracket),
      taxOnBracket: round2(taxOnBracket),
    });
  }

  est = round2(est);
  return {
    profit: round2(profit),
    svsAnnual: round2(svsAnnual),
    bemessungsgrundlage: round2(bemessungsgrundlage),
    gewinnfreibetrag: gfb,
    taxableIncome: round2(taxableIncome),
    est,
    effectiveRate: taxableIncome > 0 ? round4(est / taxableIncome) : 0,
    marginalRate,
    bracketBreakdown,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
