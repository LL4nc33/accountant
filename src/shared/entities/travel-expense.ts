/**
 * Reisekostenabrechnung (Phase 37, v0.39.0)
 *
 * §26 EStG: Reise- und Reisekostenersätze sind beim Selbständigen
 * Betriebsausgaben, mindern den Gewinn.
 *
 * AT-Standardsätze 2026 (siehe Tabelle in der UI):
 *   - Diäten Inland Tagessatz: EUR 26,40 (ab 3h Reise; bei längerer
 *     Reise je angefangene 24h ein voller Tagessatz)
 *   - Nächtigung Inland Pauschale: EUR 17,00
 *   - Kilometergeld PKW: EUR 0,50/km (Mitfahrer: +0,05)
 *   - Auslandsdiäten: länderspezifisch (BMF-Tabelle); hier nicht
 *     hartcodiert — User trägt manuell ein.
 *
 * Die Beträge werden vom User manuell befüllt; die UI zeigt die
 * Standardsätze als Hinweis und bietet einen „aus KM/Tagen ausrechnen"-
 * Helper.
 */
import { Entity, Fields } from 'remult';
import { Base } from './base';

// Standardsätze AT 2026
export const TRAVEL_RATES_AT_2026 = {
  diaetenInlandPerDay: 26.40,
  nachtigungInlandPauschale: 17.00,
  kmGeldPerKm: 0.50,
  kmGeldMitfahrerExtra: 0.05,
} as const;

export const travelPurposes = [
  'Kundentermin',
  'Vorort-Service',
  'Konferenz / Messe',
  'Schulung / Fortbildung',
  'Beschaffung / Lieferant',
  'Sonstiges',
] as const;
export type TravelPurpose = (typeof travelPurposes)[number];

@Entity<TravelExpense>('travel-expense', {
  allowApiCrud: true,
  defaultOrderBy: { startDate: 'desc' },
})
export class TravelExpense extends Base {
  @Fields.dateOnly({ caption: 'Reisebeginn' })
  startDate: Date = new Date();

  @Fields.dateOnly({ caption: 'Reiseende', allowNull: true })
  endDate: Date | null = null;

  @Fields.string({ caption: 'Reiseziel' })
  destination = '';

  @Fields.literal(() => travelPurposes, {
    caption: 'Zweck',
    inputType: 'select-literal',
    allowNull: false,
  })
  purpose: TravelPurpose = 'Kundentermin';

  /**
   * Reisedauer in Stunden. Für die Diäten-Berechnung wichtig:
   * Inland greift erst ab 3h, voller Tagessatz pro angefangene 24h.
   * Bei Auslandsreisen länderspezifisch (User trägt manuell ein).
   */
  @Fields.number({ caption: 'Reisedauer (Stunden)' })
  durationHours = 0;

  /** Anzahl Nächtigungen */
  @Fields.number({ caption: 'Nächtigungen' })
  nights = 0;

  // ── Kosten-Positionen ────────────────────────────────────────────

  @Fields.number({ caption: 'Tagessatz / Diäten (EUR)' })
  mealsAmount = 0;

  @Fields.number({ caption: 'Nächtigung (EUR)' })
  accommodationAmount = 0;

  @Fields.number({ caption: 'Gefahrene Kilometer' })
  kmDriven = 0;

  @Fields.number({ caption: 'KM-Geld (EUR)' })
  kmAmount = 0;

  @Fields.number({ caption: 'Öffentlicher Verkehr / Taxi (EUR)' })
  publicTransportAmount = 0;

  @Fields.number({ caption: 'Sonstige Kosten (EUR)' })
  otherCostsAmount = 0;

  @Fields.string({ caption: 'Bemerkungen', inputType: 'multiline' })
  notes = '';

  /** Optionale Verknüpfung zu einem Projekt/Kunden (für Weiterverrechnung) */
  @Fields.string({ caption: 'Projekt-ID' })
  projectId = '';

  @Fields.string({ caption: 'Kunden-ID' })
  customerId = '';

  /** Optional verknüpfter Eingangsrechnungs-Beleg (Tankrechnung, Hotelbeleg) */
  @Fields.string({ caption: 'Beleg-Expense-ID' })
  sourceExpenseId = '';

  get totalAmount(): number {
    return round2(
      this.mealsAmount +
      this.accommodationAmount +
      this.kmAmount +
      this.publicTransportAmount +
      this.otherCostsAmount
    );
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Berechnet AT-Standardsätze für eine Reise (Helper für UI).
 */
export function calculateAtTravelDefaults(input: {
  durationHours: number;
  nights: number;
  kmDriven: number;
}): {
  diaetenAuto: number;
  nachtPauschaleAuto: number;
  kmGeldAuto: number;
} {
  const { diaetenInlandPerDay, nachtigungInlandPauschale, kmGeldPerKm } = TRAVEL_RATES_AT_2026;
  // Diäten Inland: ab 3h Reise greift Tagessatz, je angefangene 24h
  // ein voller Tagessatz. Daher Math.ceil(durationHours / 24).
  let diaeten = 0;
  if (input.durationHours >= 3) {
    const fullDays = Math.ceil(input.durationHours / 24);
    diaeten = fullDays * diaetenInlandPerDay;
  }
  return {
    diaetenAuto: round2(diaeten),
    nachtPauschaleAuto: round2(Math.max(0, input.nights) * nachtigungInlandPauschale),
    kmGeldAuto: round2(Math.max(0, input.kmDriven) * kmGeldPerKm),
  };
}
