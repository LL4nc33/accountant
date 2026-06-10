# 15 · Auto-Backup-Service

accountant erstellt automatisch SQLite-Snapshots der gesamten Datenbank.
Konsistent, atomar, ohne Server-Downtime.

## Wann brauchst du das?

Immer. Backup ist die Versicherung dass dir bei einem Disk-Crash, Tipp-
fehler („DELETE FROM …") oder versehentlichem Container-Wipe nichts
verloren geht.

## Setup

Nichts zu konfigurieren — Backups laufen automatisch. Der erste Snapshot
wird ca. 30 Sekunden nach Server-Start erzeugt, danach alle 24 Stunden.

Standort der Snapshots: `$DATA_DIR/backups/`. Im Docker-Standardsetup
ist das auf dem `accountant-data`-Volume.

## Workflow

### UI

`/admin/backups` (Desktop) oder `/m/admin/backups` (Mobile):

- **Übersicht-Cards**: Anzahl Snapshots, Gesamt-Größe, Retention-Setting,
  Verzeichnis
- **„Jetzt sichern"**: ad-hoc Snapshot ohne auf den 24h-Lauf zu warten
- **Liste**: alle vorhandenen Snapshots mit Größe + Zeitstempel
- **Retention-Badge**: pro Snapshot ob er als „täglich", „wöchentlich"
  oder „monatlich" eingestuft ist
- **Download**: Einzel-Snapshot als `.sqlite`-File auf den Client laden
- **Löschen**: einzelne Snapshots manuell entfernen

### Retention

| Klasse | Behalten | Logik |
|---|---|---|
| Täglich | 7 jüngste Tage | jeweils der jüngste Snapshot pro Tag |
| Wöchentlich | 4 Wochen darüber hinaus | jüngster Snapshot pro ISO-Woche |
| Monatlich | 12 Monate darüber hinaus | jüngster Snapshot pro Monat |
| Alt | gelöscht | alles was nicht in den drei Klassen ist |

Total bei dauerhaftem Betrieb: ~23 Snapshots gleichzeitig.

### Snapshot-Format

Jede Datei ist ein vollständiges, eigenständiges SQLite-File. Du kannst
es mit jedem SQLite-Client öffnen:

- **DB Browser for SQLite** (GUI) — [sqlitebrowser.org](https://sqlitebrowser.org)
- **DBeaver** (Multi-DB-GUI) — [dbeaver.io](https://dbeaver.io)
- **sqlite3** (CLI) — `sqlite3 accountant-2026-06-08T120000.sqlite`

Dateinamen-Schema: `accountant-YYYY-MM-DDTHHmmSS.sqlite` — ISO-Zeitstempel ohne
Sekunden-Trenner.

## Wiederherstellen

Restore ist bewusst manuell (kein Web-Knopf), damit ein versehentliches
Rollback unmöglich ist.

### Lokales Setup

```bash
# 1. Server stoppen
docker stop oa

# 2. Snapshot über die Live-DB kopieren
cp /var/lib/docker/volumes/accountant-data/_data/backups/accountant-2026-06-08T120000.sqlite \
   /var/lib/docker/volumes/accountant-data/_data/db/accountant.sqlite

# 3. Server starten
docker start oa
```

### Off-Site-Backup auf einen anderen Host

Snapshots leben unter `$DATA_DIR/backups/` und können per `rsync` /
`scp` / S3-Sync regelmäßig wegkopiert werden. Beispiel mit rsync:

```bash
# Auf einem zweiten Host:
rsync -av --delete \
  user@dein-server:/path/to/accountant-data/backups/ \
  /local/oa-backups/
```

Lokal+Off-Site ist die Best-Practice — Auto-Backup im DATA_DIR allein
schützt nicht vor Komplettverlust des Servers.

## API

| Endpoint | Methode | Zweck | Auth |
|---|---|---|---|
| `/api/backup/list` | GET | JSON-Liste aller Snapshots | admin |
| `/api/backup/now` | POST | sofortigen Snapshot erzwingen | admin |
| `/api/backup/download/:name` | GET | Snapshot-File streamen | admin |
| `/api/backup/:name` | DELETE | Snapshot löschen | admin |

Der `:name`-Parameter wird hart gegen das Schema `accountant-YYYY-MM-DDTHHmmSS.sqlite`
validiert — kein Path-Traversal möglich.

## Compliance

- **§132 BAO**: 7-jährige Aufbewahrung — die Retention deckt das ab,
  wenn du mindestens monatlich einen Snapshot off-site sicherst.
- **§131 BAO Festschreibung**: SQLite-Snapshots sind read-only-Kopien
  und enthalten den Festschreibungs-Zustand 1:1.
- **DSGVO Art. 32**: Backup ist Teil der technischen-organisatorischen
  Maßnahmen zum Datenschutz.

## Häufige Fragen

**Wieso werden Snapshots nicht verschlüsselt?**
Die Backup-Datei enthält ALLES inkl. Passwort-Hashes. Sichere das
DATA_DIR mit Disk-Encryption (LUKS, FileVault, dm-crypt). Eine zusätzliche
App-seitige Verschlüsselung käme on-top, ist aber out-of-scope für v1.

**Wie viel Platz brauche ich?**
Ein typisches EPU-Setup hat ~5-20 MB pro Snapshot. Bei 23 gehaltenen
Snapshots ≈ 100-500 MB Backup-Verbrauch. Wenn du Belege/Anhänge dazu
nimmst (kommt später), skaliert das mit der Original-DB.

**Kann ich die Retention ändern?**
Aktuell sind die Werte (7/4/12) hartkodiert. Wenn du sie ändern willst:
`src/server/backup.ts` → `RETENTION` anpassen, neu bauen. UI-Toggle kommt
in einer späteren Version falls Bedarf da ist.

**Was passiert wenn der Snapshot-Lauf während eines Schreibvorgangs läuft?**
SQLite `VACUUM INTO` ist atomar — der Snapshot ist ein konsistenter
Punkt-in-der-Zeit-Stand. Parallel-Schreiber sehen den Snapshot nicht;
der Snapshot enthält keine halben Transaktionen.

**Wie schnell ist der Snapshot?**
Bei einer 50 MB-DB: ca. 200-500 ms. Server bleibt während der Operation
voll erreichbar.

**Kann ich Snapshots versehentlich überschreiben?**
Nein — jeder Snapshot hat einen eindeutigen ISO-Zeitstempel im Namen
(Sekunden-genau). Selbst zwei manuelle Trigger im selben Sekunde-Intervall
sind getrennt.

**Was ist mit dem `data/sessions/` und `data/searchindex/` Ordner?**
Sessions sind kurzlebig — bei Restore sind alle Sessions weg, User
müssen sich neu einloggen. Searchindex baut sich beim nächsten
Save-Vorgang automatisch wieder auf. Beides ist nicht im Snapshot
enthalten, weil es regenerierbar ist.
