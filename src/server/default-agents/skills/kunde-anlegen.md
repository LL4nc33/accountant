---
name: kunde-anlegen
description: Neuen Kunden anlegen (Person oder Firma)
triggers: ["neuer kunde", "kunde anlegen", "neue person", "neue firma", "leg an", "lege an"]
tools: [create_person, create_company]
icon: user-add
---

# Skill: Kunde anlegen

## ⚠ STRENGE REGEL — ANTI-HALLUZINATION

Du DARFST NIEMALS schreiben „Entwurf erstellt", „angelegt", „erzeugt",
„gespeichert" — solange du in DIESEM Turn nicht VORHER das Tool
`create_person` oder `create_company` aufgerufen hast.

ZWEI ZUSTÄNDE — je Turn:

A) **Du fragst nach Pflichtfeldern** (Vorname? Nachname? Firma oder Person?
   Adresse?) → KEIN Tool-Call, KEINE „Entwurf"-Aussage.

B) **Du hast genug Daten** → Tool-Call `create_person`/`create_company`
   absetzen → DANN „Vorschlag erzeugt: …, bitte oben auf Bestätigen klicken".

Niemals B-Antwort ohne Tool-Call. Wer das macht, lügt den User an.

## Workflow

1. Entscheide: **Person** (Privatperson, Einzelname) oder **Firma** (GmbH, OG, e.U., KG, AG, gGmbH, …)?
   - „Maria Musterfrau" → Person
   - „Musterfirma GmbH" → Firma
   - „Müller IT" → Wahrscheinlich Firma — bei Unsicherheit nachfragen.
2. Pflichtfelder:
   - Person: firstname, lastname
   - Firma: name
3. Optionale Inline-Adresse: street, zip, city, country (Default AT)
4. Wenn Adresse fehlt → frag „Adresse?" 
5. Niemals E-Mail/Telefon/UID erfinden — nur eintragen wenn explizit genannt.

## Antwortformat

EIN Satz, IMMER mit dem Wort „Vorschlag":

> „Vorschlag erzeugt: <Person|Firma> <Name> — bitte oben auf **„Bestätigen"** klicken um zu speichern."

## ⚠ Wichtig — Anti-Halluzination

Das Tool create_person/create_company legt den Kunden **NICHT** in der Datenbank an.
Es generiert nur einen Vorschlag. Erst wenn der User in der UI auf „Bestätigen" klickt,
wird der Eintrag wirklich gespeichert.

NIEMALS schreiben „erstellt", „angelegt", „gespeichert", „fertig". Diese Wörter sind
für die Bestätigungs-Bestätigung reserviert (nach erfolgreichem Confirm via execute-Endpoint).

Stattdessen: „Vorschlag erzeugt … bitte bestätigen".

## Beispiele

### Beispiel 1 — Person mit Adresse
**User:** "neuer kunde: maria musterfrau, musterstraße 2, 1000 wien"
**Aktion:** `create_person({firstname: "Maria", lastname: "Musterfrau", salutation: "Frau", street: "Musterstraße 2", zip: "1000", city: "Wien", country: "AT"})`
**Antwort:** "Vorschlag erzeugt: Person Maria Musterfrau — bitte oben auf **„Bestätigen"** klicken um zu speichern."

### Beispiel 2 — Firma
**User:** "leg die OidaNice GmbH an"
**Aktion:** `create_company({name: "OidaNice", nameAddon: "GmbH"})`
**Antwort:** "Vorschlag erzeugt: Firma OidaNice GmbH — bitte oben auf **„Bestätigen"** klicken. Adresse später ergänzen?"

### Beispiel 3 — unklar
**User:** "leg müller an"
**Aktion:** keine Tool-Calls.
**Antwort:** "Privatperson oder Firma? Wenn Person: Vorname + Nachname. Wenn Firma: Firmenname + Rechtsform."
