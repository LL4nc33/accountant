/**
 * Anlagenverzeichnis-Asset (Phase 35, v0.37.0)
 *
 * Abnutzbare körperliche Anlagegüter mit linearer AfA nach §7 EStG.
 *
 * AfA-Logik:
 *   - GWG (Geringwertige Wirtschaftsgüter, §13 EStG): Anschaffungs-
 *     kosten ≤ 1.000 € (Stand 2026) werden sofort vollständig im
 *     Anschaffungsjahr abgesetzt.
 *   - Lineare AfA: gleichmäßige Verteilung über die Nutzungsdauer.
 *   - Halbjahresregel §7 Abs. 2 EStG: bei Anschaffung in der zweiten
 *     Jahreshälfte (Juli–Dezember) nur halbe Jahres-AfA im Anschaffungs-
 *     jahr; das wandert ans Ende — bei Nutzungsdauer N ergibt sich eine
 *     AfA-Laufzeit von N+1 Kalenderjahren (halb-voll…voll-halb).
 *   - Degressive AfA (§7 Abs. 1a) ist out of scope v1.
 *
 * Anlagenverzeichnis-Pflicht §125 BAO: ab Anschaffungskosten > 800 € muss
 * jedes Wirtschaftsgut einzeln erfasst werden. Die UI legt User-seitig
 * GWG-Detect auf 1.000 € fest (= 2026-er Grenze).
 */
import { Entity, Fields } from 'remult';
import { Base } from './base';

export const ASSET_GWG_LIMIT = 1000; // Stand 2026 — §13 EStG
export const ASSET_VERZEICHNIS_LIMIT = 800; // Pflichtaufnahme §125 BAO

export const assetCategories = [
  'IT-Hardware',
  'Software',
  'Mobiliar',
  'Fahrzeug',
  'Maschine',
  'Werkzeug',
  'Immobilie',
  'Sonstiges',
] as const;
export type AssetCategory = (typeof assetCategories)[number];

@Entity<Asset>('asset', {
  allowApiCrud: true,
  defaultOrderBy: { acquisitionDate: 'desc' },
})
export class Asset extends Base {
  @Fields.string({ caption: 'Bezeichnung' })
  name = '';

  @Fields.literal(() => assetCategories, {
    caption: 'Kategorie',
    inputType: 'select-literal',
    allowNull: false,
  })
  category: AssetCategory = 'IT-Hardware';

  @Fields.dateOnly({ caption: 'Anschaffungsdatum' })
  acquisitionDate: Date = new Date();

  /**
   * Anschaffungskosten netto in EUR. AfA-Bemessungsgrundlage.
   */
  @Fields.number({ caption: 'Anschaffungskosten (netto, EUR)' })
  acquisitionCost = 0;

  /**
   * Nutzungsdauer in Jahren. Bei GWG ist sie bedeutungslos
   * (Sofortabschreibung).
   * Übliche Werte: 3 Computer, 5 Telefon, 7 Möbel, 8 PKW.
   */
  @Fields.number({ caption: 'Nutzungsdauer (Jahre)' })
  usefulLifeYears = 3;

  /**
   * Sofort-Vollabschreibung als Geringwertiges Wirtschaftsgut.
   * Default automatisch true wenn acquisitionCost ≤ 1.000 €, kann
   * vom User abgeschaltet werden (z.B. wenn er bewusst auf GWG
   * verzichten will — selten).
   */
  @Fields.boolean({ caption: 'GWG (Sofortabschreibung)' })
  isGwg = false;

  /**
   * Abgangsdatum (Verkauf, Verschrottung). Optional.
   */
  @Fields.dateOnly({ caption: 'Abgangsdatum', allowNull: true })
  disposalDate?: Date;

  @Fields.number({ caption: 'Erlös aus Abgang (EUR)' })
  disposalAmount = 0;

  @Fields.string({ caption: 'Anmerkungen', inputType: 'multiline' })
  notes = '';

  /**
   * Verknüpfung zur Eingangsrechnung die das Asset belegt. Optional —
   * der User kann den Beleg manuell verlinken.
   */
  @Fields.string({ caption: 'Beleg-Rechnung (Expense-ID)' })
  sourceExpenseId = '';
}

/**
 * Berechnet die AfA pro Kalenderjahr für ein Asset.
 *
 * @returns Map[Jahr → AfA-Betrag], plus Restbuchwert-Tabelle.
 */
export interface AssetDepreciationPlan {
  isGwg: boolean;
  totalDepreciation: number;
  schedule: { year: number; afa: number; bookValue: number }[];
  fullyDepreciatedYear: number | null;
}

export function calculateAssetDepreciation(asset: Asset): AssetDepreciationPlan {
  const acq = new Date(asset.acquisitionDate);
  const acqYear = acq.getFullYear();
  const cost = Math.max(0, asset.acquisitionCost);

  // GWG-Sonderfall: Sofortabschreibung im Anschaffungsjahr.
  if (asset.isGwg || cost <= ASSET_GWG_LIMIT) {
    return {
      isGwg: true,
      totalDepreciation: cost,
      schedule: [{ year: acqYear, afa: round2(cost), bookValue: 0 }],
      fullyDepreciatedYear: acqYear,
    };
  }

  const lifeYears = Math.max(1, Math.floor(asset.usefulLifeYears));
  const fullAnnualAfa = cost / lifeYears;
  // Halbjahresregel: bei Anschaffung im 2. Halbjahr (Juli–Dez) wird im
  // Anschaffungsjahr nur halbe AfA angesetzt, die andere Hälfte am Ende.
  const secondHalf = acq.getMonth() >= 6;
  const firstYearAfa = secondHalf ? fullAnnualAfa / 2 : fullAnnualAfa;
  const yearCount = secondHalf ? lifeYears + 1 : lifeYears;

  const schedule: { year: number; afa: number; bookValue: number }[] = [];
  let remaining = cost;
  for (let i = 0; i < yearCount; i++) {
    const year = acqYear + i;
    let afa: number;
    if (i === 0) afa = firstYearAfa;
    else if (i === yearCount - 1) afa = remaining; // letztes Jahr: Restbuchwert weg
    else afa = fullAnnualAfa;

    // Schutz gegen Rundungs-Driften
    if (afa > remaining) afa = remaining;
    remaining = Math.max(0, remaining - afa);
    schedule.push({ year, afa: round2(afa), bookValue: round2(remaining) });
    if (remaining <= 0) break;
  }

  return {
    isGwg: false,
    totalDepreciation: cost,
    schedule,
    fullyDepreciatedYear: schedule[schedule.length - 1]?.year ?? null,
  };
}

/**
 * Liefert die AfA-Summe eines Assets für ein bestimmtes Jahr (0 wenn
 * nicht im AfA-Plan).
 */
export function assetAfaForYear(asset: Asset, year: number): number {
  const plan = calculateAssetDepreciation(asset);
  const entry = plan.schedule.find(s => s.year === year);
  return entry?.afa ?? 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
