# HUNTING – unabhängige Neuplanung und Abgleich

Stand 02.11.2026. Grundlage ist nur der ursprüngliche Prompt („Hide and Seek mit echtem GPS, Modi Klassisch/Zombie/Mr. X, Fähigkeiten, PWA, schönes Design“). Danach folgt der Abgleich mit dem ursprünglichen Plan und mit dem, was tatsächlich gebaut wurde.

---

## 1. Neuplanung aus dem Prompt

### Leitidee

Ein Spiel, das man **heute Abend mit Freunden draußen spielen kann**, ist wichtiger als zehn halbfertige Funktionen. Deshalb zuerst eine durchgehend spielbare Klassisch-Runde, im Feld getestet, dann erst Modi und Extras.

### Kern-Spielablauf (v1)

1. **Lobby:** Host erstellt Spiel, teilt Code/QR/Link. Host verteilt Teams per Tipp oder „Automatisch“; die App schlägt das Verhältnis vor.
2. **Einstellungen:** Host wählt Zone (Mittelpunkt + Radius). Ping-Intervall, Vorsprung und Spieldauer werden **aus dem Zonenradius vorgeschlagen**; weicht der Host ab, warnt die App mit Begründung.
3. **Rundenstart:** Jeder sieht eine **Rollenkarte** (Ziel + 3–4 Regeln). Jäger warten, ihre Karte zeigt keine Gegner.
4. **Versteckphase:** Verstecker tippen „Ich bin versteckt“. Sind alle fertig oder ist der Vorsprung um, beginnt die Jagd.
5. **Jagd:** Pings in festem Takt, Zone schrumpft in Stufen. **Ziel und Zeitpunkt der nächsten Stufe bleiben geheim**; man sieht nur die aktuelle Zone, wie sie schrumpft. Wer draußen ist, ist live sichtbar und scheidet nach der Kulanzzeit aus.
6. **Fangen:** Server prüft Abstand + frische Positionen, schaltet „Fangen“ frei. Kein Bestätigungsdialog in v1 (verlangsamt draußen nur).
7. **Ende:** Sieger, Kurz-Statistik, Revanche mit gleicher Gruppe.

### Architektur

| Bereich | Entscheidung | Warum |
| :--- | :--- | :--- |
| Client | Svelte 5 PWA, MapLibre + OpenFreeMap | Kostenlos, ohne App Store, gut auf Handys |
| Server | Cloudflare Worker + 1 Durable Object je Spiel | Echtzeit per WebSocket, Alarme als einzige Uhr, kostenlos |
| Protokoll | **Ein** gemeinsames Typ-/Zod-Modul, von App **und** Worker validiert | Verhindert Feldnamen-Drift |
| Konten | Optional, Benutzername + Passwort in eigenem DO | Kein Setup (Firebase/Google) nötig |
| Testen | Server-seitiger **Testmodus** mit Bots + „Tippen statt laufen“ | Jede Funktion am Schreibtisch prüfbar |
| E2E | Skript, das eine echte Runde gegen `wrangler dev` spielt | Testet den echten Server, nicht ein Nachbau-Modell |

### Reihenfolge

| # | Schritt | Fertig, wenn … |
| :--- | :--- | :--- |
| 0 | Gerüst **inkl. Deploy** von Worker und Pages | `curl` auf den Live-Worker antwortet; PWA lädt vom Handy |
| 1 | Klassisch komplett (Lobby → Ende) + Testmodus | E2E-Skript spielt eine Runde; Solo-Test mit Bots im Browser |
| 2 | Feldtest mit 3–4 Leuten | Fehlerliste abgearbeitet (GPS-Sprünge, Funklöcher, Akku) |
| 3 | Balance-Vorschläge, Rollenkarte, Versteck-Abstimmung | Host bekommt keine unausgewogene Runde ohne Warnung |
| 4 | Zombie | Feldtest |
| 5 | Fähigkeiten + Loot | Feldtest, Energie-Ökonomie nachjustiert |
| 6 | Mr. X (Tickets, Aufdeckung) | Feldtest in der Stadt |
| 7 | Konten, Statistiken, Push vor Pings, Replay | – |

---

## 2. Abgleich

### Was ich anders gemacht hätte als der ursprüngliche Plan

| Thema | Ursprünglicher Plan | Neuplanung | Grund |
| :--- | :--- | :--- | :--- |
| Umfang v1 | 15 Phasen, alle Modi + Replay + Statistik + Push | Klassisch zuerst, Feldtest, dann ausbauen | Viel war gebaut, aber nicht verdrahtet (siehe unten) |
| Deploy | Ab Phase 0 geplant | Phase 0 endet erst mit Live-Smoke-Test | Worker war nie online; CI meldete trotzdem Erfolg |
| Tests | Vitest-„E2E“ mit In-Memory-Nachbau | E2E gegen echten Worker | Der Nachbau hat die echten Server-Fehler nicht gesehen |
| Protokoll | Zod-Schemas in `shared/` | Schemas an **beiden** Enden erzwingen | Feldnamen liefen auseinander (`faehigkeitId`, `verstecken`/`versteckphase`) |
| Zonen-Vorschau | Nächste Zone 60 s vorher gestrichelt, Editor zeigt alle Stufen | Nur aktuelle Zone, Ziel geheim | Sonst ist die Entwicklung der Zone vorab bekannt |
| Ping-Takt | Feste Presets | Aus Zonenradius abgeleitet + Warnung | Pings müssen zur Laufstrecke passen |
| Teams | Drag & Drop geplant | Tippen zum Wechseln + automatische Verteilung mit Empfehlung | Umgesetzt war nur „Host = einziger Jäger“ |
| Rundenstart | Nicht vorgesehen | Rollenkarte mit Erklärung | Neue Spieler wissen sonst nicht, was zu tun ist |
| Versteckphase | Nur Countdown | Abstimmung „Ich bin versteckt“ | Spart Wartezeit für die Jäger |
| Fangen | Bestätigung durch Gejagten + QR | Direkter Fang nach Serverprüfung | Draußen schneller; Streitfälle selten |
| Konten | Firebase Anonym + Google | Benutzername + Passwort, optional | Kein externes Setup; Nachteil: kein Passwort-Reset |
| iPhone im Hintergrund | Web-Push vor jedem Ping | v1: Display an + Wake Lock + Funkloch-Regel; Push später | Push war nicht umgesetzt, darf v1 nicht blockieren |
| Bot-Simulator | Separates Tool | Bots im Server-Testmodus | Funktioniert direkt in der App, ohne extra Setup |

### Fehler, die die Umsetzung des ursprünglichen Plans hatte (inzwischen behoben)

- Host sah als Jäger alle Verstecker live.
- Zone schrumpfte nie; Karte aktualisierte Zone und Gegner-Marker nicht (Svelte-Effekte ohne Abhängigkeit).
- Gefangen-Bildschirm, Zonenwarnung und Fähigkeiten lösten nie aus (falsche Felder).
- Reconnect gab nach etwa 10 s auf; Rolle ging beim Wiederverbinden verloren.
- Worker nie deployt.

### Noch offen

- **Worker-Deploy** mit Cloudflare-Login (siehe README, Release-Checkliste).
- **Feldtest** mit echten Handys, besonders iPhone mit gesperrtem Display.
- Push vor Pings, Replay, Statistiken pro Konto, ÖPNV-Haltestellen für Mr. X.
