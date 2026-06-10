# 05 Reverse-Charge & Drittland

Bei B2B-Leistungen ins EU-Ausland (außer AT) wird die Umsatzsteuerschuld auf den Leistungsempfänger umgekehrt. Für Nicht-EU-Kunden (US, UK, CH, …) gilt sinngemäß "Drittlandsleistung".

## Auto-Vorschlag

Beim Speichern einer Rechnung schlägt accountant Reverse-Charge automatisch vor, wenn:
- Kunde hat eine andere Country als deine CompanySettings, UND
- Kunde hat eine UID, UND
- Du bist nicht Kleinunternehmer (in diesem Fall greift §6 Abs. 1 Z 27 UStG)

Du entscheidest pro Rechnung via Banner-Klick.

## Manuell

Checkbox "Reverse-Charge / Drittland (kein USt am Beleg)" in der Rechnungs-Bearbeitung. "Empfänger UID"-Feld wird Pflicht für RC.

## PDF-Verhalten

- Keine USt-Spalten in den Summen
- Vermerk im Summen-Block:
  - EU-Kunde: "Steuerschuld geht auf den Leistungsempfänger über (Reverse-Charge gemäß § 3a Abs. 6 UStG / Art. 196 MwStSyst-RL)"
  - Drittland: "Drittlandsleistung — nicht steuerbar in Österreich (§ 3a Abs. 6 UStG)"
- Empfänger-UID + dein UID stehen im Header/Footer
- Wenn die UID gegen VIES geprüft wurde: "UID des Leistungsempfängers gegen VIES geprüft am DD.MM.YYYY — Firmenname" als Audit-Stempel
