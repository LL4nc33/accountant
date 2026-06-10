import { Entity, Fields, remult } from 'remult';
import { Base } from './base';

export const countries = ['DE', 'AT', 'CH'] as const;
export type Country = (typeof countries)[number];

/**
 * Single-row singleton entity holding the company-wide sender data
 * (name, address, country, VAT-ID, IBAN, contact). One installation = one company.
 * Bootstrap creates an empty row on first start; the PDF renderer reads from it.
 */
@Entity('company-settings', {
  allowApiRead: true,
  allowApiUpdate: ['admin'],
  allowApiInsert: false,
  allowApiDelete: false,
})
export class CompanySettings extends Base {
  @Fields.string({ caption: 'Firmenname' })
  name = '';

  @Fields.string({ caption: 'Namenszusatz / Rechtsform' })
  nameAddon = '';

  @Fields.string({ caption: 'Straße' })
  addressStreet = '';

  @Fields.string({ caption: 'PLZ' })
  addressZip = '';

  @Fields.string({ caption: 'Stadt' })
  addressCity = '';

  @Fields.literal(() => countries, {
    caption: 'Land',
    allowNull: false,
    inputType: 'select-literal',
  })
  country: Country = 'AT';

  /**
   * If true: all generated invoices have USt=0 by default, PDF suppresses USt
   * columns, and adds the §6 Abs. 1 Z 27 UStG note. Toggle when crossing the
   * Kleinunternehmer threshold (€55,000 brutto/year as of 2025).
   */
  @Fields.boolean({ caption: 'Kleinunternehmer (§6 Abs. 1 Z 27 UStG)' })
  isKleinunternehmer = false;

  @Fields.string({ caption: 'GISA-Zahl' })
  gisaZahl = '';

  @Fields.string({ caption: 'GISA-Behörde' })
  gisaAuthority = '';

  @Fields.string({ caption: 'Steuernummer (Finanzamt)' })
  taxNumber = '';

  @Fields.number({ caption: 'Standard-Stundensatz (€)' })
  defaultHourlyRate = 0;

  @Fields.string({ caption: 'UID / USt-ID / MWST-Nr.' })
  vatId = '';

  @Fields.string({ caption: 'IBAN' })
  iban = '';

  @Fields.string({ caption: 'BIC' })
  bic = '';

  @Fields.string({ caption: 'Bankname' })
  bankName = '';

  @Fields.string({ caption: 'E-Mail' })
  email = '';

  @Fields.string({ caption: 'Telefon' })
  phone = '';

  @Fields.string({ caption: 'Website' })
  website = '';

  // ─── SMTP / E-Mail-Versand ────────────────────────────────────
  // Optional. Wenn smtpHost gesetzt ist, erscheint auf der Invoice-View ein
  // „Per E-Mail senden"-Button. Empfehlung: dedizierter SMTP-Account oder
  // App-Password (z.B. Gmail, fastmail). Passwort wird im Storage in Klartext
  // gehalten — Backup entsprechend behandeln (siehe SETUP.md).

  @Fields.string({ caption: 'SMTP-Host' })
  smtpHost = '';

  @Fields.number({ caption: 'SMTP-Port' })
  smtpPort = 587;

  @Fields.boolean({ caption: 'SMTP TLS / STARTTLS' })
  smtpSecure = false;

  @Fields.string({ caption: 'SMTP-Benutzer' })
  smtpUser = '';

  @Fields.string({ caption: 'SMTP-Passwort', includeInApi: false })
  smtpPassword = '';

  @Fields.string({ caption: 'Absender-E-Mail (From)' })
  smtpFromAddress = '';

  @Fields.string({ caption: 'Absender-Name' })
  smtpFromName = '';

  // ─── Modul-Toggles (Runtime-Aktivierung) ──────────────────────────
  // Kunden, Rechnungen, Dashboard sind Kern und nicht abschaltbar.
  // Bestehende Installs behalten Projekte aktiv (sinnvoller Default).
  // Future-Module starten deaktiviert und werden in /settings/module
  // angeschaltet wenn sie verfügbar werden.

  @Fields.boolean({ caption: 'Modul: Projekte + Zeiterfassung' })
  moduleProjects = true;

  @Fields.boolean({ caption: 'Modul: Produkt-Katalog' })
  moduleProducts = false;

  @Fields.boolean({ caption: 'Modul: Eingangsrechnungen / Ausgaben' })
  moduleExpenses = false;

  @Fields.boolean({ caption: 'Modul: Eigene Arbeitszeit-Aggregation' })
  moduleWorkHours = false;

  @Fields.boolean({ caption: 'Modul: Finanzamt-Jahres-Export' })
  moduleTaxExport = false;

  @Fields.boolean({ caption: 'Modul: KI-Assistent (lokal)' })
  moduleLlm = false;

  @Fields.boolean({ caption: 'Modul: Mahnwesen' })
  moduleReminder = false;

  @Fields.boolean({ caption: 'Modul: SVS-Vorschau (AT)' })
  moduleSvs = false;

  @Fields.boolean({ caption: 'Modul: ESt-Vorschau (AT)' })
  moduleEst = false;

  @Fields.boolean({ caption: 'Modul: Anlagenverzeichnis / AfA' })
  moduleAssets = false;

  @Fields.boolean({ caption: 'Modul: Reisekosten' })
  moduleTravel = false;

  @Fields.boolean({ caption: 'Modul: Kassabuch' })
  moduleCashbook = false;

  /**
   * Skonto-Default: wird in neue Rechnungen vorbelegt. 0 = kein Skonto.
   * Pro-Rechnung-Override jederzeit möglich.
   */
  @Fields.number({ caption: 'Standard Skonto-Satz (%)' })
  defaultSkontoPercent = 0;

  @Fields.number({ caption: 'Standard Skonto-Frist (Tage)' })
  defaultSkontoDays = 7;

  /**
   * Firmen-Logo als Data-URL (z.B. `data:image/png;base64,iVBOR…`).
   * Wird im PDF-Header über dem Absender-Block gerendert. Empfehlung:
   * PNG mit transparentem Hintergrund, ~120px Breite, max ~50KB raw.
   * Soft-Limit 500KB (= ~670KB Base64) gegen Bloat der Settings-JSON.
   */
  @Fields.string({ caption: 'Logo (Data-URL)' })
  logoDataUrl = '';

  /**
   * Erstes Geschäftsjahr als Selbständige:r (vierstellig, z.B. 2024).
   * Wird für die SVS-Vorschau-Logik benötigt: Jahr 1+2 zahlt die SVS
   * vorläufig auf die Mindest-Beitragsgrundlage, ab Jahr 3 kommt die
   * Nachbemessung. `0` = nicht gesetzt → Fallback auf aktuelles Jahr.
   */
  @Fields.number({ caption: 'Erstes Selbständigkeits-Jahr (für SVS-Vorschau)' })
  svsStartYear = 0;

  // ─── Mahnwesen-Defaults ──────────────────────────────────────────
  // §456 UGB B2B = Basiszinssatz + 9,2 PP. ECB-Basiszins schwankt
  // halbjährlich — User editiert den Wert wenn nötig. Default 12,2 ist
  // realistisch für Stand 2026.
  // §1000 ABGB B2C = fester gesetzlicher Zinssatz 4 % p.a.
  // §1333 ABGB Mahnspesen-Pauschale für B2B = 40 € ab Stufe 2.

  @Fields.number({ caption: 'Verzugszinssatz B2B (% p.a.)' })
  defaultInterestRateB2B = 12.2;

  @Fields.number({ caption: 'Verzugszinssatz B2C (% p.a.)' })
  defaultInterestRateB2C = 4;

  @Fields.number({ caption: 'Mahnspesen ab Stufe 2 (€)' })
  defaultReminderFee = 40;

  @Fields.number({ caption: 'Tage bis 1. Mahnung (nach Fälligkeit)' })
  daysUntilFirstReminder = 14;

  @Fields.number({ caption: 'Tage zwischen Mahnungen' })
  daysBetweenReminders = 14;

  @Fields.string({ caption: 'Mahntext Stufe 1', inputType: 'multiline' })
  reminderText1 = 'Sehr geehrte Damen und Herren,\n\nbei der Durchsicht unserer Buchhaltung haben wir festgestellt, dass die obige Rechnung noch offen ist. Wir gehen davon aus, dass Sie die Zahlung übersehen haben, und bitten Sie höflich, den ausstehenden Betrag bis zum Stichtag zu überweisen.\n\nSollten Sie zwischenzeitlich bezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.\n\nMit freundlichen Grüßen';

  @Fields.string({ caption: 'Mahntext Stufe 2', inputType: 'multiline' })
  reminderText2 = 'Sehr geehrte Damen und Herren,\n\ntrotz unserer Zahlungserinnerung haben wir bisher keinen Zahlungseingang feststellen können. Wir fordern Sie daher auf, den ausstehenden Betrag inklusive der gesetzlichen Verzugszinsen (§456 UGB / §1000 ABGB) und der pauschalen Mahnspesen (§1333 ABGB) bis zum Stichtag zu begleichen.\n\nMit freundlichen Grüßen';

  @Fields.string({ caption: 'Mahntext Stufe 3', inputType: 'multiline' })
  reminderText3 = 'Sehr geehrte Damen und Herren,\n\ntrotz mehrfacher Aufforderung wurde unsere Rechnung bis heute nicht beglichen. Wir fordern Sie ein letztes Mal auf, den unten ausgewiesenen Gesamtbetrag bis zum Stichtag zu überweisen.\n\nSollten wir bis dahin keinen Zahlungseingang feststellen, sehen wir uns gezwungen, die Forderung an ein Inkasso-Unternehmen zu übergeben bzw. den Klagsweg zu beschreiten. Damit verbundene zusätzliche Kosten gehen zu Ihren Lasten.\n\nMit freundlichen Grüßen';

  // ─── LLM / KI-Assistent ──────────────────────────────────────────
  // OpenAI-kompatibler Endpoint (llama.cpp, Ollama, LM Studio, vLLM,
  // LocalAI, Hosted-Provider). Self-Host wird empfohlen — Customer-/
  // Rechnungs-Daten gehen sonst raus.

  @Fields.string({ caption: 'LLM Base-URL (OpenAI-kompatibel)' })
  llmBaseUrl = '';

  @Fields.string({ caption: 'LLM API-Key', includeInApi: false })
  llmApiKey = '';

  @Fields.string({ caption: 'LLM Modell' })
  llmModel = '';

  // Berechtigung des Support-Agenten, App-Einstellungen zu verändern:
  //   'explain' = nur erklären + zur Seite navigieren (DU stellst ein)
  //   'confirm' = darf Änderungen als Vorschlag-Karte anbieten (DU bestätigst)
  //   'auto'    = darf Einstellungen direkt setzen (ohne Rückfrage)
  @Fields.string({ caption: 'Support-Agent Berechtigung' })
  supportAgentPermission: 'explain' | 'confirm' | 'auto' = 'explain';

  // Anrede der KI-Agenten: 'du' (per du) oder 'sie' (gesiezt).
  @Fields.string({ caption: 'Anrede KI-Assistent' })
  agentAddressForm: 'du' | 'sie' = 'du';

  // Name, mit dem die Agenten den User ansprechen (optional).
  @Fields.string({ caption: 'Name für KI-Anrede' })
  agentUserName = '';

  // Eigene Namen für die beiden Agenten (optional, leer = „Buchhalter"/„Support").
  @Fields.string({ caption: 'Name Buchhalter-Agent' })
  accountantAgentName = '';

  @Fields.string({ caption: 'Name Support-Agent' })
  supportAgentName = '';

  // Reflexions-Modus: Agent prüft seine Antwort und iteriert nach.
  // Gründlicher, aber spürbar langsamer (extra LLM-Runden) — daher opt-in.
  @Fields.boolean({ caption: 'Reflexions-Modus (gründlicher, langsamer)' })
  agentReflection = false;

  // ─── BMD/RZL-Kontorahmen (AT-EPU-Standard) ──────────────────────────
  // Default-Kontonummern entsprechen dem üblichen AT-Einheitlichen Konten-
  // rahmen für Einzelunternehmer:innen. Steuerberater haben oft eigene
  // Konten — User editiert pro Steuerberater einmalig.

  @Fields.string({ caption: 'Konto: Forderungen (Sollkonto Ausgangsrechnung)' })
  kontoForderungen = '2000';

  @Fields.string({ caption: 'Konto: Erlöse 20%' })
  kontoErloese20 = '4000';

  @Fields.string({ caption: 'Konto: Erlöse 10%' })
  kontoErloese10 = '4010';

  @Fields.string({ caption: 'Konto: Erlöse 13%' })
  kontoErloese13 = '4020';

  @Fields.string({ caption: 'Konto: Erlöse 0% / steuerfrei' })
  kontoErloese0 = '4030';

  @Fields.string({ caption: 'Konto: Erlöse Reverse-Charge EU' })
  kontoErloeseRC = '4400';

  @Fields.string({ caption: 'Konto: Erlöse Drittland' })
  kontoErloeseDrittland = '4500';

  @Fields.string({ caption: 'Konto: USt 20%' })
  kontoUst20 = '3500';

  @Fields.string({ caption: 'Konto: USt 10%' })
  kontoUst10 = '3510';

  @Fields.string({ caption: 'Konto: USt 13%' })
  kontoUst13 = '3520';

  @Fields.string({ caption: 'Konto: Vorsteuer (Eingangsrechnungen)' })
  kontoVorsteuer = '2500';

  @Fields.string({ caption: 'Konto: Verbindlichkeiten (Habenkonto Eingangsrechnung)' })
  kontoVerbindlichkeiten = '3300';

  @Fields.string({ caption: 'Konto: Sammel-Aufwand (Eingangsrechnungen)' })
  kontoAufwand = '7000';

  // ─── Paperless-ngx-Adapter ───────────────────────────────────────────
  // Optionaler Beleg-Archive-Anschluss. Wenn URL + Token gesetzt sind,
  // zeigt Expense-Edit einen „Aus Paperless suchen"-Button und linkt
  // verknüpfte Belege direkt auf das Paperless-Original.

  @Fields.string({ caption: 'Paperless-ngx URL' })
  paperlessUrl = '';

  @Fields.string({ caption: 'Paperless-ngx API-Token', includeInApi: false })
  paperlessToken = '';

  // Onboarding-Status: wenn true, blendet das Dashboard den „Setup
  // jetzt fertigstellen"-Hinweis aus, auch wenn Firma/Adresse noch
  // leer sind. Wird vom Wizard gesetzt („Später ausfüllen" oder Finish).
  @Fields.boolean()
  onboardingDismissed = false;
}

export async function bootstrapCompanySettings() {
  const repo = remult.repo(CompanySettings);
  // Singleton laden oder frisch anlegen. Danach Defaults nachziehen (Migration
  // alter Rows) und optionale Env-Var-Vorkonfiguration anwenden (docker-compose).
  const fresh = (await repo.count()) === 0;
  const s = fresh ? repo.create() : await repo.findFirst();
  if (!s) return;
  let mutated = fresh;
  const ensure = <K extends keyof CompanySettings>(key: K, def: CompanySettings[K]) => {
    if (s[key] === undefined || s[key] === null) {
      s[key] = def;
      mutated = true;
    }
  };
  ensure('moduleProjects', true);
  ensure('moduleProducts', false);
  ensure('moduleExpenses', false);
  ensure('moduleWorkHours', false);
  ensure('moduleTaxExport', false);
  ensure('moduleLlm', false);
  ensure('llmBaseUrl', '');
  ensure('llmApiKey', '');
  ensure('llmModel', '');
  ensure('supportAgentPermission', 'explain');
  ensure('agentAddressForm', 'du');
  ensure('agentUserName', '');
  ensure('accountantAgentName', '');
  ensure('supportAgentName', '');
  ensure('agentReflection', false);
  ensure('moduleReminder', false);
  ensure('moduleSvs', false);
  ensure('svsStartYear', 0);
  ensure('moduleEst', false);
  ensure('defaultSkontoPercent', 0);
  ensure('defaultSkontoDays', 7);
  ensure('logoDataUrl', '');
  ensure('moduleAssets', false);
  ensure('moduleTravel', false);
  ensure('moduleCashbook', false);
  ensure('defaultInterestRateB2B', 12.2);
  ensure('defaultInterestRateB2C', 4);
  ensure('defaultReminderFee', 40);
  ensure('daysUntilFirstReminder', 14);
  ensure('daysBetweenReminders', 14);
  ensure('kontoForderungen', '2000');
  ensure('kontoErloese20', '4000');
  ensure('kontoErloese10', '4010');
  ensure('kontoErloese13', '4020');
  ensure('kontoErloese0', '4030');
  ensure('kontoErloeseRC', '4400');
  ensure('kontoErloeseDrittland', '4500');
  ensure('kontoUst20', '3500');
  ensure('kontoUst10', '3510');
  ensure('kontoUst13', '3520');
  ensure('kontoVorsteuer', '2500');
  ensure('kontoVerbindlichkeiten', '3300');
  ensure('kontoAufwand', '7000');
  ensure('onboardingDismissed', false);
  // ── Env-Var-Vorkonfiguration (docker-compose / Hosting) ──
  // Setzt LLM- und Paperless-Verbindung aus Umgebungsvariablen, aber NUR wenn
  // das jeweilige Feld noch leer ist (vom User gesetzte Werte gewinnen immer).
  // Isomorphe Entity (Client + Server) → process über globalThis lesen, damit
  // der Angular-Build nicht über fehlende Node-Typen stolpert. Auf dem Client
  // ist process undefined (dort läuft Bootstrap ohnehin nicht).
  const env = (k: string): string | undefined => (globalThis as any)?.process?.env?.[k];
  const envSeed = (key: keyof CompanySettings, envVar: string) => {
    const v = env(envVar);
    if (v && !((s as any)[key])) { (s as any)[key] = v; mutated = true; }
  };
  envSeed('llmBaseUrl', 'LLM_BASE_URL');
  envSeed('llmModel', 'LLM_MODEL');
  envSeed('llmApiKey', 'LLM_API_KEY');
  if (env('LLM_BASE_URL') && !s.moduleLlm) { s.moduleLlm = true; mutated = true; }
  envSeed('paperlessUrl', 'PAPERLESS_URL');
  envSeed('paperlessToken', 'PAPERLESS_TOKEN');

  if (mutated) await repo.save(s);
}
