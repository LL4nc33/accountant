# 28 SVS-Vorschau

> Modul aktivieren: **Einstellungen → Module → SVS-Vorschau (AT, GSVG)**.
> Geschäftsstart-Jahr setzen: **Einstellungen → Firma → Steuer & UID → SVS — erstes Geschäftsjahr**.

## Wofür

AT-EPU werden im 3. Jahr von der SVS-Nachbemessung überrascht: in Jahr 1+2 zahlen sie vorläufig auf die Mindest-Beitragsgrundlage. Im Jahr 3 kommt rückwirkend die Endabrechnung — bei guten Geschäftsjahren schnell 5–10k € Nachzahlung, die als Rückstellung niemand gebildet hat.

Diese Vorschau zeigt jederzeit, was Du der SVS *tatsächlich* schuldest — basierend auf dem laufenden Gewinn.

## Berechnungsbasis

AT-2026-Sätze (Quelle WKO/SVS):

| Sparte | Satz / Betrag |
|---|---|
| Krankenversicherung (KV) | 6,80 % der Beitragsgrundlage |
| Pensionsversicherung (PV) | 18,50 % |
| Unfallversicherung (UV) | 12,95 € / Monat (fix) |
| Selbständigenvorsorge (SV) | 1,53 % |
| Mindest-BGL | 551,10 € / Monat (= 6.613,20 / Jahr) |
| Höchst-BGL | 8.085 € / Monat (= 97.020 / Jahr) |

**Jahr 1+2 (vorläufig):** Beiträge auf Mindest-BGL, unabhängig vom Gewinn. Jahresbeitrag ~1.930 € (≈161 €/Monat).

**Jahr 3+ (endgültig):** BGL = Gewinn × 1,0833 / 12, gecappt auf [Mindest, Höchst]. Forecast zeigt zusätzlich die erwartete Rückstellung für die Nachbemessung des ersten Jahres.

## UI

- **/svs** Detail-Seite mit Year-Picker, KV/PV/UV/SV-Aufschlüsselung, Quartal-Termine (28.02 / 31.05 / 31.08 / 30.11).
- **Dashboard-KPI-Card** „SVS-Vorschau · YYYY" mit Jahresbetrag, klickbar zur Detail-Seite.
- Bei Jahr 3+: Rückstellungs-Hinweis als Alert.
- Bei Kleinunternehmer-Versicherungsgrenze (Gewinn ≤ 6.613,20 € und Umsatz ≤ 55.000 €): Hinweis + Link auf SVS-Antragsformular.

## Hinweise

- Verbindlich bleibt die SVS-Vorschreibung. Vorschau ist Schätzung.
- Hinzurechnungsfaktor 1,0833 ist Näherung; SVS rechnet iterativ mit den tatsächlich vorgeschriebenen KV+PV-Beiträgen.
- FSVG-Freiberufler (Ärzte, Apotheker, Patentanwälte) haben abweichende Sätze — diese Vorschau gilt nur für GSVG (Gewerbetreibende + Neue Selbständige).
- Aktualisierungsfaktor 1,181 für vorläufige BGL ab Jahr 4 ist nicht abgebildet.
