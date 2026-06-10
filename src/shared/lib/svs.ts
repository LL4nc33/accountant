/**
 * SVS-Vorschau-Kernel (Phase 30, v0.32.0)
 *
 * Berechnet AT-Sozialversicherungs-Beiträge (GSVG: Gewerbetreibende +
 * Neue Selbständige). Pure Function, isomorph — wird sowohl im Server-Endpoint
 * /api/svs als auch in der UI-Vorschau genutzt.
 *
 * Quellen (Stand 2026-06):
 *   - WKO Beitragstabelle 2026
 *   - SVS „Vorläufige Berechnung 1.-3. Jahr"
 *   - SVS „Endgültige Berechnung ab 4. Jahr"
 *
 * Hinweise:
 *   - Jahr 1+2 = vorläufig auf Mindest-BGL (KV-Nachbelastung kommt erst ab Jahr 3)
 *   - Hinzurechnungsfaktor 1.0833 ist Näherung; SVS rechnet iterativ mit den
 *     tatsächlich vorgeschriebenen KV+PV-Beiträgen. Für Forecast reicht's.
 *   - FSVG-Freiberufler (Ärzte, Apotheker, Patentanwälte) haben andere Sätze
 *     (PV 20%, KV via Kammer) — out of scope v1.
 *   - Kleinunternehmer-Versicherungsgrenze: Befreiung möglich bei kumulativ
 *     Gewinn ≤ €6.613,20 UND Umsatz ≤ €55.000 und Neuzugang (≤ 12 von 60
 *     Monaten GSVG-pflichtig).
 */

export const SVS_2026 = {
  kvRate: 0.068,                  // Krankenversicherung 6,80%
  pvRate: 0.185,                  // Pensionsversicherung 18,50%
  svRate: 0.0153,                 // Selbständigenvorsorge 1,53%
  uvMonthly: 12.95,               // Unfallversicherung fix EUR/Monat
  minBgMonthly: 551.10,           // Mindest-BGL = 6.613,20/Jahr
  maxBgMonthly: 8085.00,          // Höchst-BGL = 97.020/Jahr
  hinzurechnungFactor: 1.0833,    // Näherung Selbst-Hinzurechnung KV+PV
  kuGewinnGrenze: 6613.20,        // Kleinunternehmer-Versicherungsgrenze Gewinn
  kuUmsatzGrenze: 55000,          //   kumulativ mit Umsatz
} as const;

export interface SvsResult {
  /** Annual KV-Beitrag */
  kv: number;
  /** Annual PV-Beitrag */
  pv: number;
  /** Annual UV-Beitrag (fix 12 × uvMonthly) */
  uv: number;
  /** Annual SV-Beitrag */
  sv: number;
  /** Annual total (kv + pv + uv + sv) */
  total: number;
  /** Effektive monatliche Beitragsgrundlage */
  bgMonthly: number;
  /** Welcher Cap griff (Mindest, Höchst, oder gar nicht) */
  capped: 'min' | 'max' | 'none';
  /** True = Jahr 1+2 vorläufig auf Mindest-BGL (unabhängig vom Gewinn) */
  isVorlaeufig: boolean;
}

/**
 * Berechnet die SVS-Beiträge für ein Beitragsjahr.
 *
 * @param annualProfit Jahresgewinn aus selbständiger Erwerbstätigkeit
 *                     (Netto-Erlöse minus Netto-Aufwendungen). Bei
 *                     Kleinunternehmer = Brutto, sonst Netto.
 * @param yearsAsSelfEmployed Anzahl Jahre als Selbständige:r ab Beginn
 *                            inkl. aktuelles Jahr. Min 1. Jahr 1+2 gelten
 *                            als vorläufig.
 */
export function calculateSvs(
  annualProfit: number,
  yearsAsSelfEmployed: number,
): SvsResult {
  const months = 12;
  const isVorlaeufig = yearsAsSelfEmployed <= 2;

  let bgMonthly: number;
  let capped: SvsResult['capped'] = 'none';

  if (isVorlaeufig) {
    // Jahr 1+2: vorläufig auf Mindest-BGL
    bgMonthly = SVS_2026.minBgMonthly;
    capped = 'min';
  } else {
    // Jahr 3+: BGL = Gewinn × 1.0833 / 12
    const annualBg = Math.max(0, annualProfit) * SVS_2026.hinzurechnungFactor;
    bgMonthly = annualBg / months;
    if (bgMonthly < SVS_2026.minBgMonthly) {
      bgMonthly = SVS_2026.minBgMonthly;
      capped = 'min';
    } else if (bgMonthly > SVS_2026.maxBgMonthly) {
      bgMonthly = SVS_2026.maxBgMonthly;
      capped = 'max';
    }
  }

  const kv = round2(bgMonthly * SVS_2026.kvRate * months);
  const pv = round2(bgMonthly * SVS_2026.pvRate * months);
  const sv = round2(bgMonthly * SVS_2026.svRate * months);
  const uv = round2(SVS_2026.uvMonthly * months);
  const total = round2(kv + pv + uv + sv);

  return { kv, pv, uv, sv, total, bgMonthly: round2(bgMonthly), capped, isVorlaeufig };
}

/**
 * Quartals-Termine für ein Beitragsjahr. SVS schreibt 28.02 / 31.05 / 31.08 /
 * 30.11 vor (Fälligkeit). Vorauszahlung = SvsResult.total / 4.
 */
export function svsQuarters(year: number, totalAnnual: number) {
  const perQuarter = round2(totalAnnual / 4);
  // Februar-Letzter berücksichtigt Schaltjahre (2028, 2032, …):
  // new Date(year, 2, 0) = Tag 0 von März = letzter Tag Februar.
  const febLast = new Date(year, 2, 0).getDate();
  const febLastStr = String(febLast).padStart(2, '0');
  return [
    { dueDate: `${year}-02-${febLastStr}`, amount: perQuarter, label: 'Q1' },
    { dueDate: `${year}-05-31`, amount: perQuarter, label: 'Q2' },
    { dueDate: `${year}-08-31`, amount: perQuarter, label: 'Q3' },
    { dueDate: `${year}-11-30`, amount: perQuarter, label: 'Q4' },
  ];
}

/**
 * Prüft Anspruch auf Kleinunternehmer-Versicherungsgrenze (Befreiung
 * von KV+PV). Beide Bedingungen müssen erfüllt sein. Achtung:
 * zusätzlich gilt 60-Monate-Regel (max. 12 Monate GSVG-pflichtig in
 * letzten 60), die wir nicht prüfen können — User entscheidet selbst.
 */
export function svsVersicherungsgrenzeEligible(
  annualProfit: number,
  annualRevenue: number,
): { eligible: boolean; explanation: string } {
  const profitOk = annualProfit <= SVS_2026.kuGewinnGrenze;
  const revenueOk = annualRevenue <= SVS_2026.kuUmsatzGrenze;
  if (profitOk && revenueOk) {
    return {
      eligible: true,
      explanation:
        `Gewinn ≤ ${SVS_2026.kuGewinnGrenze.toLocaleString('de-AT')} € und ` +
        `Umsatz ≤ ${SVS_2026.kuUmsatzGrenze.toLocaleString('de-AT')} €. ` +
        `Befreiung von KV+PV per Antrag möglich, sofern in den letzten ` +
        `60 Monaten nicht mehr als 12 Monate GSVG-pflichtig.`,
    };
  }
  const reasons: string[] = [];
  if (!profitOk) reasons.push(`Gewinn > ${SVS_2026.kuGewinnGrenze.toLocaleString('de-AT')} €`);
  if (!revenueOk) reasons.push(`Umsatz > ${SVS_2026.kuUmsatzGrenze.toLocaleString('de-AT')} €`);
  return {
    eligible: false,
    explanation: `Keine Befreiung möglich: ${reasons.join(', ')}.`,
  };
}

/**
 * Schätzt die zu erwartende Nachbemessung für Jahr 1 (bzw. Jahr 2),
 * basierend auf dem aktuellen Gewinn. Annahme: Gewinn im Jahr X war
 * ähnlich hoch wie der aktuelle. Greift nur wenn currentYearsAsSelfEmployed ≥ 3.
 *
 * Differenz = (endgültige Beiträge auf Basis Profit) − (vorläufige
 * Beiträge auf Mindest-BGL). Wird in 4 Quartalsraten im Folgejahr
 * vorgeschrieben (oder bis zu 12 Quartale verteilbar als Gründer-Sonderregel).
 */
export function estimateNachbemessung(annualProfit: number): number {
  const endgueltig = calculateSvs(annualProfit, 3); // wie Jahr 3 berechnet
  const vorlaeufig = calculateSvs(0, 1);            // Mindestbeitrag
  return round2(endgueltig.total - vorlaeufig.total);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
