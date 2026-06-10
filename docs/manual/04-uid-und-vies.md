# 04 UID, USt-ID, MWST-Nr.

Jeder Kunde kann eine UID/USt-ID/MWST-Nr. hinterlegen. Diese erscheint auf der Rechnung, ist Pflicht bei Reverse-Charge und ab €10.000 brutto pro Rechnung in Österreich.

## Eintragen

Kunde öffnen → Feld "UID / USt-ID / MWST-Nr." ausfüllen. Format wird beim Speichern geprüft (z.B. `ATU12345678` für Österreich, `DE123456789` für Deutschland).

## VIES-Prüfung (optional, empfohlen)

Klick auf "Gegen VIES prüfen" daneben. Der EU-Server bestätigt, ob die UID aktiv ist und welcher Firma sie gehört. Bestätigung wird gespeichert (Datum + Firmenname). Bei Reverse-Charge-Rechnungen erscheint dieser Beleg im PDF-Footer.

Hinweise:
- VIES-Cache hält Ergebnisse 30 Tage — Re-Check nur wenn nötig
- Ungültige UID warnt, blockiert aber nicht (eventuelles falsches Format kann später korrigiert werden)
- VIES-Downtime → Toast "nicht erreichbar", keine Speicherung
