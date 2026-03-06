# ShuntCall

P2P Videokonferenz-App als statische Website, deploybar auf GitHub Pages ohne Backend.

## Features

- **100% P2P**: Direkte WebRTC-Verbindungen zwischen Teilnehmern
- **Dezentrales Signaling**: Gun.js für Peer-Discovery (kein eigener Server)
- **Relay-Tree**: Bandwidth-basierter Baum für skalierbare Video-Streams
- **Password-Auth**: SHA-256 basierte Raum-Authentifizierung
- **Stateless**: Kein Backend erforderlich, alles läuft im Browser

## Tech Stack

- WebRTC mit Insertable Streams
- Gun.js für Signaling
- Tailwind CSS v4
- Web Crypto API (SHA-256)
- GitHub Pages Hosting

## Installation

```bash
# Repository klonen
git clone https://github.com/<username>/shuntcall.git
cd shuntcall

# Dependencies (keine - rein statisch)
# Öffne index.html im Browser
```

## Entwicklung

```bash
# Feature-Branch erstellen
git checkout -b feature/<feature-name>

# Änderungen committen
git add .
git commit -m "feat: description"

# Auf develop mergen
git checkout develop
git merge --no-ff feature/<feature-name>
```

## Deployment

Automatisch via GitHub Actions bei Push auf `main`:

1. Push auf `main` triggert Workflow
2. GitHub Pages deployt alle Dateien
3. URL: `https://<username>.github.io/shuntcall/`

## Usage

### Raum erstellen

1. Öffne die App
2. Gib Raum-ID und Passwort ein
3. Klicke "Raum erstellen"
4. Teile den Link mit Teilnehmern

### Raum beitreten

1. Öffne den geteilten Link
2. Gib Passwort ein
3. Verbinde dich mit dem Raum

## Lizenz

GPLv3 - Siehe LICENSE
