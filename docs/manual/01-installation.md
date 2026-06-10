# 01 Installation

## Voraussetzungen

- Docker (oder Podman) installiert
- Port 6002 frei
- ca. 200 MB freier Speicher (Image + Runtime)

## Quick-Start mit Docker

```bash
# Image bauen
docker build -t accountant .

# SESSION_SECRET einmal generieren und in .env persistieren
SESSION_SECRET=$(openssl rand -hex 32)
echo "SESSION_SECRET=$SESSION_SECRET" > .env

# Container starten — env-File wird bei jedem Restart wiederverwendet
docker run -d --name accountant \
  --env-file .env \
  -p 6002:6002 \
  -v $(pwd)/data:/app/data \
  accountant
```

Aufrufen: `http://localhost:6002` — Default-Login: `admin` / `admin`.

**Wichtig:** das Default-Passwort sofort ändern. Solange das alte Passwort aktiv ist, zeigt die App einen gelben Warn-Banner.

### Warum SESSION_SECRET persistieren?

`SESSION_SECRET` signiert die Login-Cookies. Wenn du den Wert bei jedem Restart neu generierst (`-e SESSION_SECRET=$(openssl rand -hex 32)` inline), werden **alle laufenden Login-Sessions invalidiert** — alle User müssen sich neu einloggen. Generiere den Wert daher einmal (z.B. via `.env`-File wie oben) und verwende ihn bei jedem Redeploy wieder. Lässt du `SESSION_SECRET` ganz weg, generiert der Server einen Zufallswert und schreibt eine Warnung ins Log — damit funktioniert die App, ist aber für Production ungeeignet.

## Environment-Variablen

| Variable | Default | Beschreibung |
|---|---|---|
| `PORT` | `6002` | Lauschport des Servers |
| `SESSION_SECRET` | random + Warn-Log | Cookie-Signing. Setze auf einen langlebigen Random-Wert für Production, sonst überleben Sessions keinen Restart |
| `DATA_DIR` | `./data` | Verzeichnis für DB + Sessions + Suchindex. Sollte als Volume gemountet werden |

## Daten-Verzeichnis-Layout

```
data/
├── db/                 # SQLite-Datenbank (accountant.sqlite)
├── sessions/           # Login-Sessions
└── searchindex/        # FlexSearch-Persistenz pro Entity
```

Die gesamte Geschäftsdaten liegen in einer einzigen SQLite-Datei
`data/db/accountant.sqlite`. Backup = `tar -czf backup.tar.gz data/`.
Wiederherstellung umgekehrt. (Zusätzlich gibt es das in [Kapitel 15
Auto-Backup](15-backup.md) beschriebene integrierte Snapshot-System.)

## Reset (Achtung: löscht alle Daten)

```bash
docker rm -f accountant
rm -rf data/db
```

Beim nächsten Start werden Default-Nummernkreise, der `admin`-User und ein leerer `CompanySettings`-Datensatz neu angelegt.
