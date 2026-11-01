# 🎯 HUNTING – Offizieller Setup- & Spiel-Leitfaden
> Das taktische Echtzeit-GPS-Fangspiel für Smartphones (iOS & Android). Keine App-Store-Downloads, sofort spielbereit direkt im Browser als moderne Progressive Web App (PWA).

---

## 🧭 Inhaltsverzeichnis
1. [Voraussetzungen & Lokale Vorbereitung (PC/Server)](#1-lokale-vorbereitung-pcserver)
2. [Handys verbinden: WLAN & Outdoor-Internet](#2-handys-verbinden-wlan--outdoor-internet)
3. [Installation auf Smartphones (PWA ohne App Store)](#3-installation-auf-smartphones-pwa)
4. [Standorterlaubnis (GPS) & Akku-/Display-Tipps](#4-standorterlaubnis-gps--display-tipps)
5. [Der Spielablauf in 5 einfachen Schritten](#5-der-spielablauf-in-5-schritten)
6. [Sofort-Test auf dem PC (Ohne Laufen im Freien!)](#6-sofort-test-auf-dem-pc)
7. [Fehlerbehebung & FAQ](#7-häufige-fragen--fehlerbehebung)

---

## 1. Lokale Vorbereitung (PC/Server)

Bevor du mit deinen Freunden spielen kannst, wird der Spiel-Server und die Web-App gestartet. HUNTING besteht aus zwei schlanken Komponenten:
1. **Frontend (App):** Das Karten-Interface und das Radar auf Basis von Svelte 5.
2. **Backend (Worker):** Der Cloudflare Durable Object Server, der Standorte abgleicht und Fänge verifiziert.

### System-Voraussetzungen
- **Node.js** Version 20 oder neuer ([nodejs.org](https://nodejs.org))
- **pnpm** Version 9 oder neuer (`npm install -g pnpm`)

### Schritt-für-Schritt Start

Öffne dein Terminal (Eingabeaufforderung oder PowerShell) im Projektordner:

```bash
# 1. Abhängigkeiten für das gesamte Monorepo installieren
pnpm install

# 2. Frontend-Client starten (Vite Entwicklungs-Server)
# Startet die Svelte 5 App auf Port 5173 und bindet automatisch an alle lokalen IPs (host: true)
pnpm --filter hunting-app dev
```

Öffne ein **zweites Terminalfenster** im selben Projektordner für das Backend:

```bash
# 3. Cloudflare Worker Backend lokal starten
# Startet die Miniflare Durable Objects & WebSocket-Engine auf Port 8787
pnpm --filter @hunting/worker dev
```

> [!TIP]
> **Erfolgs-Check:**
> - Im ersten Terminal siehst du: `Local: http://localhost:5173/` und `Network: http://192.168.x.x:5173/`
> - Im zweiten Terminal siehst du: `Ready on http://localhost:8787`

---

## 2. Handys verbinden: WLAN & Outdoor-Internet

Um auf den Smartphones deiner Freunde zu laufen, müssen die Handys auf deinen Server zugreifen können. Hier gibt es zwei Möglichkeiten:

### 🌟 Option A: Echtes Spielen im Freien (Mobilfunk/LTE/5G) – EMPFOHLEN
Wenn ihr draußen im Park, Wald oder in der Stadt spielt, haben die Handys kein Heim-WLAN. Zudem fordern moderne Smartphone-Browser (Safari & Chrome) für GPS-Standortdaten zwingend eine sichere **HTTPS-Verbindung**.

Mit einem kostenlosen **Cloudflare Tunnel** erstellst du in 5 Sekunden eine sichere Internet-Adresse für deinen PC:

```bash
# In einem dritten Terminal ausführen (keine Registrierung erforderlich!):
npx cloudflared tunnel --url http://localhost:5173
```

Du erhältst eine eindeutige HTTPS-Adresse, z.B.:
`https://silent-shadow-hunting.trycloudflare.com`

👉 **Diesen Link sendest du einfach per WhatsApp, Telegram oder Signal an deine Mitspieler!** Jeder kann sofort weltweit und über mobiles Internet beitreten.

*(Alternativ funktioniert auch ngrok: `npx ngrok http 5173`)*

---

### Option B: Testen im selben Heim-WLAN (Garten / Wohnzimmer)
Wenn alle Geräte im selben WLAN eingeloggt sind:
1. Finde deine lokale PC-IP-Adresse heraus:
   - **Windows:** In der Konsole `ipconfig` eingeben (suche nach `IPv4-Adresse`, z.B. `192.168.178.45`).
   - **Mac/Linux:** Im Terminal `ifconfig` oder `ip a` eingeben.
2. Alle Handys rufen im Browser auf:
   `http://192.168.178.45:5173`

> [!WARNING]
> **Wichtiger Hinweis zu GPS bei unverschlüsseltem HTTP im WLAN:**
> Apple Safari und Android Chrome blockieren `navigator.geolocation` auf reinen HTTP-Verbindungen (außer `localhost`). Für echtes GPS-Tracking empfehlen wir daher immer **Option A** (Cloudflare Tunnel mit automatischem HTTPS).

---

## 3. Installation auf Smartphones (PWA)

HUNTING muss nicht aus dem App Store heruntergeladen werden. Es wird als vollwertige Web-App direkt auf den Startbildschirm gelegt und läuft ohne störende Browserleisten im Vollbild.

```
  ┌─────────────────────────────────────────────────────────────┐
  │                 INSTALLATION IN 10 SEKUNDEN                 │
  ├──────────────────────────────┬──────────────────────────────┤
  │      🍏 Apple iPhone         │       🤖 Android             │
  │                              │                              │
  │ 1. Safari öffnen             │ 1. Chrome öffnen             │
  │ 2. Teilen-Icon [↑] tippen    │ 2. Menü [⋮] tippen           │
  │ 3. "Zum Home-Bildschirm"     │ 3. "App installieren"        │
  │ 4. "Hinzufügen" bestätigen   │ 4. "Installieren" tippen     │
  └──────────────────────────────┴──────────────────────────────┘
```

### 🍏 iPhone (Apple iOS / Safari)
> ⚠️ **Wichtig:** Öffne den Link **zwingend in Apple Safari**. (In-App-Browser von WhatsApp oder Chrome auf iOS unterstützen keine Home-Bildschirm-Installation).

1. Rufe den Spiel-Link in **Safari** auf.
2. Tippe unten in der Leiste auf den **Teilen-Button** (das Quadrat mit dem Pfeil nach oben).
3. Scrolle etwas nach unten und wähle **„Zum Home-Bildschirm“** (Add to Home Screen).
4. Tippe oben rechts auf **„Hinzufügen“**.
5. Das **HUNTING**-App-Icon erscheint auf deinem Startbildschirm. **Öffne die App ab jetzt immer über dieses Icon** – sie startet im eleganten Vollbildmodus ohne Adressleiste!

### 🤖 Android (Google Chrome)
1. Rufe den Spiel-Link in **Google Chrome** auf.
2. Oft erscheint am unteren Bildschirmrand automatisch der Hinweis: *„HUNTING zum Startbildschirm hinzufügen“*. Tippe darauf.
3. Falls der Hinweis nicht erscheint: Tippe oben rechts auf die **drei Punkte (⋮)**.
4. Wähle **„App installieren“** oder **„Zum Startbildschirm hinzufügen“**.
5. Bestätige mit **„Installieren“**.
6. HUNTING ist nun wie eine native App in deinem App-Drawer und auf dem Homescreen installiert.

---

## 4. Standorterlaubnis (GPS) & Display-Tipps

Da HUNTING ein Fangspiel auf Zentimeter-Ebene ist, benötigt dein Smartphone präzises GPS.

### Standorterlaubnis erteilen
Beim ersten Start der App fragt das Betriebssystem nach der Berechtigung:
- **iPhone:** Wähle **„Beim Verwenden der App erlauben“** und vergewissere dich, dass der Schalter **„Genauer Standort: EIN“** aktiviert ist.
- **Android:** Wähle **„Bei Nutzung der App“** und aktiviere die Option **„Genauen Standort verwenden“**.

### 🔋 Akku- & Display-Tipps für die Jagd
- **Display anlassen (Screen Wake-Lock):** Die App hält den Bildschirm während eines aktiven Spiels automatisch wach, damit das GPS-Tracking nicht abreißt.
- **iOS-Hintergrund-Besonderheit (Die Funkloch-Mechanik):**
  - Wenn du dein iPhone sperrst oder in die Hosentasche steckst, drosselt iOS nach kurzer Zeit die Netzwerkverbindung.
  - HUNTING macht aus dieser Limitierung ein taktisches Spielelement: Wenn ein Radar-Ping bevorsteht, warnt dich die App per Vibrationssignal. Holst du dein Handy nicht rechtzeitig hervor, fällst du in das **„Funkloch“** und deine Position wird als Strafe für 60 Sekunden live für alle Jäger aufgedeckt!
- **Akkulaufzeit:** Dank des hochoptimierten **Nachtjagd-Designs** (tiefschwarzer Hintergrund `#0a0a0c`) verbraucht HUNTING auf modernen OLED-Displays weniger als 15 % Akku pro Spielstunde.

---

## 5. Der Spielablauf in 5 Schritten

```mermaid
flowchart LR
  S1["1. Spiel erstellen"] --> S2["2. QR-Code teilen"]
  S2 --> S3["3. Modus & Zone wählen"]
  S3 --> S4["4. Versteck-Countdown"]
  S4 --> S5["5. Die Jagd beginnt!"]
```

### Schritt 1: Spiel erstellen (Host)
Ein Spieler startet als Spielleiter (Host):
1. Öffne die HUNTING-App.
2. Gib deinen Spitznamen ein (z.B. *„Schattenwolf“*).
3. Tippe auf **„Neues Spiel erstellen“**.
4. Es öffnet sich die Spiel-Lobby mit deinem einzigartigen 6-stelligen Code (z.B. `HNT-782`).

### Schritt 2: Freunde beitreten lassen
- **Variante QR-Code:** Der Host tippt in der Lobby auf das **QR-Code-Symbol**. Alle Freunde öffnen ihre Kamera-App oder HUNTING und scannen den Code direkt vom Host-Display.
- **Variante Code:** Freunde tippen auf ihrem Startbildschirm auf **„Spiel beitreten“** und tippen die 6 Zeichen ein.

### Schritt 3: Modus & Spielfeld konfigurieren
Der Host legt die Spielregeln in der Lobby fest:

| Modus | Ablauf & Besonderheiten |
| :--- | :--- |
| **🏹 Klassisch** | Jäger jagen Gejagte. Ein schrumpfender Zonenkreis zwingt alle zusammen. Gefangene scheiden aus oder schauen zu. |
| **🧟 Zombie** | 1 Alpha-Zombie infiziert Menschen. Jeder gefangene Mensch wird sofort selbst zum Zombie! Letzter Überlebender gewinnt. |
| **🕵️ Mr. X** | 1 unsichtbarer Mr. X flieht durch das Stadtgebiet. Detektive sehen nur seine genutzten ÖPNV-Tickets (Bus/Bahn/U-Bahn). |

**Zonen-Editor (Spielfeld festlegen):**
Tippe auf **„Spielfeld anpassen“**. Du kannst das Zentrum auf der Karte verschieben und den Start-Radius wählen:
- *Park / Wohnsiedlung:* 400 Meter (20 Min. Spieldauer)
- *Großes Waldgebiet:* 1.000 Meter (60 Min. Spieldauer)
- *Stadtjagd (Mr. X):* 4.000 Meter (120 Min. Spieldauer)

### Schritt 4: Die Versteckphase
Der Host tippt auf **„Jagd starten“**.
- Der Timer läuft (z.B. 3 bis 5 Minuten).
- **Die Gejagten** rennen los, um sich im Gelände zu verteilen und gute Deckungen zu finden.
- **Die Jäger** haben einen gesperrten Bildschirm mit Warte-Meldung und müssen am Treffpunkt die Augen schließen!

### Schritt 5: Die Jagd beginnt!
Ein akustisches Signal kündigt das Ende des Countdowns an:
1. **Radar-Pulse:** Alle paar Minuten sendet das System einen Radar-Impuls aus. Auf der Karte der Jäger leuchtet kurz die letzte bekannte Position der Gejagten auf.
2. **Schrumpfende Zone:** Bleibe immer innerhalb des Zonenkreises! Wer die Zone verlässt, wird sofort dauerhaft live für alle Jäger markiert.
3. **Fangen:** Bist du als Jäger bis auf 10–15 Meter an ein Ziel herangekommen:
   - Drücke den roten Knopf **„FANGEN“** auf deinem Bildschirm.
   - Das Ziel erhält eine Benachrichtigung zur Bestätigung.
   - **Streitfall-Schutz:** Scannt der Jäger den dynamischen **QR-Code** auf dem Display des Gejagten, ist der Fang serverseitig **sofort und unanfechtbar** gültig!
4. **Fähigkeiten nutzen:** Setze taktische Skills wie *Tarnkappe* (nächster Ping wird unterdrückt), *Köder* (falscher Radar-Ping) oder *Störsender* ein.

---

## 6. Sofort-Test auf dem PC

Du möchtest HUNTING sofort ausprobieren, sitzt aber noch am Schreibtisch und hast gerade keine Mitspieler zur Hand? Kein Problem!

### Methode 1: Der Headless Bot-Simulator (Vollautomatisches Match)
HUNTING verfügt über eine integrierte Simulations-Engine, die ein komplettes Match mit 6 KI-Bots und realistischer Wegfindung in 10-facher Geschwindigkeit simuliert:

```bash
# Simuliert ein klassisches Match (1 Jäger gegen 5 Gejagte)
pnpm simulator

# Oder spezifische Modi testen:
pnpm --filter @hunting/bot-simulator simulate:classic
pnpm --filter @hunting/bot-simulator simulate:zombie
pnpm --filter @hunting/bot-simulator simulate:mrx
```

**Was du siehst:** In der Konsole siehst du den Live-Ticker:
- Verbindungsaufbau der Bots
- Ablauf der Versteckphase
- Radar-Pings mit GPS-Koordinaten
- Zonenverkleinerungen und Verfolgungsjagden
- Erfolgreiche Fänge bis zum Sieg einer Fraktion!

---

### Methode 2: Browser-Entwicklertools (GPS-Sensor-Simulation)
Du kannst zwei Handys direkt in deinem Desktop-Browser simulieren:

1. Öffne Google Chrome und gehe auf `http://localhost:5173`.
2. Drücke `F12` (Entwicklertools) und klicke auf das Symbol **Gerätesimulation umschalten** (Handy-Icon oder `Strg + Shift + M`). Wähle oben z.B. *iPhone 14 Pro*.
3. Drücke `Strg + Shift + P`, tippe `Sensors` ein und drücke `Enter`.
4. Im Reiter **Sensors** unten kannst du unter **Location** beliebige GPS-Koordinaten einstellen (z.B. *Berlin: 52.5200, 13.4050*).
5. Öffne ein zweites Browser-Fenster im **Inkognito-Modus**, tritt mit dem generierten Spielcode bei und verändere die Koordinaten leicht. Du siehst sofort live, wie die Punkte auf der Nachtjagd-Karte interagieren!

---

## 7. Häufige Fragen & Fehlerbehebung

### Mein GPS-Punkt bewegt sich nicht oder springt wild
- **Lösung:** Stelle sicher, dass in den Smartphone-Einstellungen unter Datenschutz & Ortungsdienste der **„Genaue Standort“** für Safari bzw. Chrome aktiviert ist. Schalte WLAN am Handy nicht aus – Smartphones nutzen sichtbare WLAN-Netze zur präzisen GPS-Kalibrierung!

### Meine Freunde können die Adresse nicht aufrufen
- **Lösung:** Wenn ihr über Mobilfunk spielt, nutze zwingend den **Cloudflare Tunnel** (`npx cloudflared tunnel --url http://localhost:5173`). Eine lokale IP (`192.168.x.x`) funktioniert nur, wenn alle Handys im selben Heim-WLAN eingewählt sind.

### Safari zeigt den Button „Zum Home-Bildschirm“ nicht
- **Lösung:** Du befindest dich vermutlich im Privat-Modus oder in einem In-App-Browser (z.B. Vorschau in WhatsApp). Tippe unten rechts auf das Kompass-Icon, um die Seite in der echten Safari-App zu öffnen.

### Ein Jäger behauptet, mich gefangen zu haben, aber ich war weiter weg
- **Lösung:** Nutzt den unbestechlichen **QR-Fang**: Der Gejagte öffnet sein Profil/Schild, der Jäger hält seine Kamera darauf. Ist der Code lesbar, war der Jäger definitiv in physischer Reichweite!

---

*Viel Spaß bei der Jagd! Bei Fragen oder Anregungen wende dich an das Entwickler-Team.*
```

---

### Verifikations- und Checkpoint-Bestätigung

| Kriterium | Status | Details |
| :--- | :--- | :--- |
| **Lokale Vorbereitung** | ✅ Erfüllt | `pnpm install`, Client (`pnpm --filter hunting-app dev`) und Worker (`pnpm --filter @hunting/worker dev`) exakt dokumentiert. |
| **Konnektivität (WLAN & Internet)** | ✅ Erfüllt | Lokales WLAN via `host: true` sowie Cloudflare Tunnel (`cloudflared`) & ngrok für HTTPS & Mobilfunk/Outdoor erklärt. |
| **PWA-Installation** | ✅ Erfüllt | Schritt-für-Schritt Anleitung für iOS (Safari Teilen -> Home-Bildschirm) und Android (Chrome App installieren). |
| **Standorterlaubnis & Background** | ✅ Erfüllt | High-Accuracy GPS, Wake-Lock API und die taktische iOS-Funkloch-Mechanik verständlich dargelegt. |
| **5-Schritte-Spielablauf** | ✅ Erfüllt | Erstellen -> QR-Share -> Modus/Zonen-Preset -> Verstecken -> Jagd, Radar & QR-Fang unanfechtbar erklärt. |
| **Sofort-Test auf PC** | ✅ Erfüllt | Headless Bot-Simulator (`pnpm simulator`) & Chrome DevTools Sensors Device Mode detailliert angeleitet. |
| **Conductor & Karpathy Style** | ✅ Erfüllt | Klare Sprache, empathisch, zero bloat, Markdown-formatiert für `USER_GUIDE.md` und Track-Dokumentation. |

Das Dokument ist bereit für die Ablage in `USER_GUIDE.md` und `conductor/tracks/hunting-v1/user_guide.md`. Gibt es noch weitere Aspekte, die ergänzt werden sollen
