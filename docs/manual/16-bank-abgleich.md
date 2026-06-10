# 16 · Bank-Abgleich (CAMT.053)

accountant matched Bank-Eingänge halb-automatisch gegen offene
Rechnungen. Du lädst die CAMT.053-XML deiner Bank hoch, das System
schlägt passende Rechnungen vor — du bestätigst.

## Wann brauchst du das?

Monatlich (oder wann immer du einen neuen Kontoauszug hast). Ersetzt
das manuelle „Bezahlt-Markieren" für jede Einzelbuchung.

## Setup

Kein Modul-Toggle — Bank-Abgleich ist immer verfügbar (admin-only).
Sidebar → Rechnungen → **„Bank-Abgleich"**.

## Was ist CAMT.053?

ISO-20022-XML-Format für Kontoauszüge. SEPA-Standard, jede österreichische
und deutsche Bank kann das exportieren:

| Bank | Wo finde ich CAMT.053? |
|---|---|
| **Erste Bank / netbanking** | Konto → Umsätze → Export → CAMT.053 |
| **Bank Austria** | OnlineB@nking → Umsätze → Exportieren → CAMT |
| **Raiffeisen ELBA** | Umsätze → Export → CAMT.053 |
| **BAWAG** | eBanking → Umsätze → Export → CAMT.053 |
| **HypoVereinsbank** | Online-Banking → Auszüge → CAMT.053 |
| **Sparkasse (DE)** | Online-Banking → Umsätze → Auszug als XML |
| **N26 / bunq** | Geschäftskunden-Banking → Statements → CAMT |

Wenn du nur CSV/PDF exportieren kannst: leider out-of-scope. CSV-Formate
unterscheiden sich pro Bank zu stark um sinnvoll zu parsen.

## Workflow

### Upload

1. CAMT.053-XML aus dem Online-Banking holen.
2. Auf `/bank/abgleich` (Desktop) oder `/m/bank/abgleich` (Mobile) hochladen.
3. accountant parst die XML und persistiert jede Buchung als
   `BankTransaction`.
4. Dedupe: Buchungen mit identischer Transaction-ID werden nicht
   doppelt importiert. Du kannst dasselbe Statement gefahrlos zweimal
   hochladen.

### Match-Vorschläge

Pro offene Buchung (status=open) berechnet das System bis zu 5
Vorschläge. Score 0-100, Faktoren:

| Faktor | Punkte |
|---|---|
| Betrag exakt (±0,01 €) | +50 |
| Betrag ±1 € | +30 |
| Betrags-Differenz pro 100 € | −20 |
| Rechnungs-Nr im Verwendungszweck | +30 |
| Nur Zahlenteil der Rechnungs-Nr im Memo | +15 |
| Buchungsdatum ≤ 30 Tage nach Rechnung | +20 |
| Buchungsdatum ≤ 90 Tage | +10 |
| Kunden-Name im Memo oder bei Gegenpartei | +10 |
| Namensteil (≥ 4 Buchstaben) erkannt | +5 |

Score-Labels:

- **70+** = sehr wahrscheinlich (grün)
- **50-69** = wahrscheinlich (gelb)
- **20-49** = möglich (grau)

Unter 20 wird nicht angezeigt — der User sieht keine Pseudo-Vorschläge.

### Bestätigen

Klick auf „Bestätigen" → accountant macht **gleichzeitig**:

1. `BankTransaction.status` → `matched`
2. `BankTransaction.matchedInvoiceId` = die ausgewählte Rechnung
3. `BankTransaction.matchedAt` = jetzt
4. `Invoice.paid` → `true`
5. `Invoice.paidAt` = Buchungsdatum der Bank-Tx

Audit-Log fängt beide Operationen ein.

### Ignorieren

Wenn eine Bank-Buchung zu **keiner** Rechnung gehört (z.B. Eigen-
buchung, Spesen, private Überweisung):

→ Klick auf „Ignorieren" — die Buchung verschwindet aus der Liste
und wird im Status `ignored` archiviert.

### Entkoppeln

Falls ein Match irrtümlich war:

`POST /api/bank/:txId/unmatch` — `Invoice.paid` bleibt aber stehen
(weil ggf. trotzdem korrekt). Bei Bedarf zusätzlich `Invoice.paid=false`
manuell setzen.

## Architektur

```
┌─────────────────┐
│  Bank-Export    │   CAMT.053 XML
└────────┬────────┘
         │ Upload
         ▼
┌─────────────────┐
│  CAMT-Parser    │   src/server/camt.ts
│  (regex-based)  │   zero-dep, namespace-tolerant
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ BankTransaction │   SQLite, Dedup via txId
│   Entity        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Match-Engine   │   Score-basiert, Top-5 Vorschläge
└────────┬────────┘
         │ User-Bestätigung
         ▼
┌─────────────────┐
│  Invoice.paid   │   + paidAt = Booking-Date
└─────────────────┘
```

## API

| Endpoint | Methode | Zweck |
|---|---|---|
| `/api/bank/import-camt` | POST (XML body) | CAMT.053 importieren |
| `/api/bank/unmatched` | GET | offene credit-Buchungen + Vorschläge |
| `/api/bank/transactions` | GET | gesamte Tx-Historie |
| `/api/bank/:txId/assign/:invoiceId` | POST | Match bestätigen |
| `/api/bank/:txId/ignore` | POST | Buchung ignorieren |
| `/api/bank/:txId/unmatch` | POST | Match aufheben |

Alle Endpoints sind admin-only.

## Compliance

- **Anti-Halluzination**: Kein automatisches Bezahlt-Markieren ohne
  expliziten User-Confirm. Score allein triggert nie eine Schreibung.
- **§131 BAO**: Festschreibungs-Status der Rechnung bleibt unberührt
  vom Match — Match setzt nur paid+paidAt.
- **Dedup-Sicherheit**: txId aus dem CAMT (AcctSvcrRef o.ä.) verhindert
  Doppel-Buchungen bei mehrfachem Import.
- **Audit-Log**: Sowohl `BankTransaction` als auch `Invoice` werden bei
  jeder Match-Operation geloggt — vollständige Nachvollziehbarkeit.

## Häufige Fragen

**Was wenn die Bank das CAMT-Format leicht anders strukturiert?**
Der Parser ist namespace-tolerant und ignoriert prefix-Variationen
(`camt:`, `iso:`, etc.). Wenn deine Bank exotische Felder nutzt:
Datei einreichen, ich erweitere den Parser.

**Was passiert mit Soll-Buchungen (debit)?**
Werden importiert, aber NICHT gegen Eingangsrechnungen (Expenses)
gematched (aktuell nicht implementiert). Sie tauchen
unter `/api/bank/transactions` auf, aber nicht in der Match-UI.

**Können mehrere Rechnungen zu einer Bank-Buchung gehören (Sammelzahlung)?**
Aktuell nicht. Workaround: erste Rechnung matchen, dann die Bank-Tx
manuell teilen (über zwei DB-Edits). Multi-Match-Workflow kommt in v2.

**Wie sicher ist der Match-Score?**
Faktoren sind so kalibriert dass „exakter Betrag + Rechnungs-Nr im
Memo" mind. 80 Punkte erzielt = praktisch sicher. Ein einzelner
Faktor allein erreicht nie hohe Scores — z.B. „nur Betrag exakt"
bei 30 Tagen Differenz = 70 Punkte (warnt aber, weil Datum/Memo
fehlen).

**Was wenn die Buchung mit der Rechnung um 1 € abweicht?**
Score gibt +30 statt +50, also nicht automatisch grün. Du siehst
es trotzdem als Vorschlag und kannst manuell entscheiden (z.B.
Kundenrabatt, Spesen-Differenz). accountant rechnet bei der
Bestätigung **nicht** den Differenz-Betrag um — die Rechnung wird
voll als paid markiert.

**Werden ignorierte Buchungen für die UVA berücksichtigt?**
Nein. UVA und Banktransaktionen sind komplett unabhängig — UVA
aggregiert Rechnungen, nicht Bank-Buchungen.

**Was wenn ich CAMT.052 (intraday) statt CAMT.053 habe?**
Aktuell nur 053 (end-of-day) unterstützt. 052 hat ähnliche Struktur,
Parser könnte erweitert werden — bei Bedarf melden.

**Datenschutz: was passiert mit der hochgeladenen XML?**
Die XML wird einmalig geparst, persistiert werden nur die extrahierten
Felder als `BankTransaction`-Rows. Die Original-XML wird NICHT
gespeichert — bewahre sie selbst gemäß §132 BAO 7 Jahre auf
(z.B. im Steuer-Ordner).
