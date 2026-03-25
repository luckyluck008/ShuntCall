# ShuntCall

P2P Videokonferenz-App als statische Website, deploybar auf GitHub Pages ohne Backend.

## Features

- **100% P2P**: Direkte WebRTC-Verbindungen zwischen Teilnehmern
- **Dezentrales Signaling**: Nostr-Protokoll für Peer-Discovery (kein eigener Server)
- **E2E Verschlüsselung**: AES-256-GCM verschlüsselter Chat via DataChannel
- **Relay-Tree**: Bandwidth-basierter Baum für skalierbare Video-Streams
- **Password-Auth**: SHA-256 basierte Raum-Authentifizierung
- **Ephemere Schlüssel**: Keine persistenten Identitäten, neue Keypairs pro Session
- **Datei-Transfer**: Verschlüsselter P2P-Dateitransfer via DataChannel
- **Stateless**: Kein Backend erforderlich, alles läuft im Browser

## Tech Stack

- WebRTC für P2P-Audio/Video
- Nostr-Protokoll (dezentrales Signaling via öffentliche Relays)
- Tailwind CSS v4
- Web Crypto API (SHA-256, AES-256-GCM, PBKDF2)
- GitHub Pages Hosting

## Installation

```bash
# Repository klonen
git clone https://github.com/<username>/shuntcall.git
cd shuntcall

# Dependencies für Tests (optional)
npm install

# App öffnen
# index.html im Browser (HTTPS oder localhost)
```

## Entwicklung

```bash
# Tests ausführen
npm test

# Lokaler Dev-Server
npx http-server -p 8765 -c-1
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
3. Klicke "Create & Host"
4. Teile den Link **und** das Passwort über separate Kanäle

### Raum beitreten

1. Öffne den geteilten Link
2. Gib das Passwort ein
3. Verbinde dich mit dem Raum

## Sicherheit

- **E2E Verschlüsselung**: Chat-Nachrichten sind mit AES-256-GCM verschlüsselt
- **Ephemere Identität**: Keine persistenten Accounts, neue Nostr-Keypairs pro Session
- **Passwort-Separation**: Passwort wird nie in der URL übertragen
- **Signatur-Verifikation**: Alle Nostr-Events werden kryptografisch verifiziert
- **Passwort nie gespeichert**: Kein sessionStorage/LocalStorage für Passwörter

## Nostr Relays

Standardmäßig genutzte öffentliche Relays:
- `wss://nos.lol`
- `wss://njump.me`
- `wss://relay.primal.net`
- `wss://relay.snort.social`
- `wss://nostr.wine`

## Lizenz

GPLv3 - Siehe LICENSE
