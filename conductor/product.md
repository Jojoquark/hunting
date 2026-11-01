# Product Vision: HUNTING – Das Echtzeit-GPS-Fangspiel

## 1. Executive Summary
**HUNTING** ist ein modernes, browserbasiertes Echtzeit-GPS-Fangspiel für Smartphones (PWA), optimiert für 2 bis 20 Freunde im urbanen und ländlichen Raum. Es kombiniert den Nervenkitzel klassischer Geländespiele (wie Räuber und Gendarm oder Scotland Yard) mit moderner Smartphone-Sensorik, Live-Karten, Cloudflare Durable Objects und einem düsteren „Nachtjagd“-Design mit Apple Liquid Glass UI.

## 2. Zielgruppe & Kernwerte
- **Zielgruppe:** Freundesgruppen, Vereine, Schulklassen, Outdoor-Gaming-Communities (2–20 Spieler).
- **Barrierefreiheit & Zero-Install:** Kein Download über App Stores nötig. Beitritt innerhalb von 5 Sekunden via 6-stelligem Game-Code, QR-Code-Scan oder Teilen-Link.
- **Fairness & Anti-Cheat:** 100% Server-Authoritative. Clients erhalten nur die Koordinaten, die sie regelkonform sehen dürfen. Manipulation über Browser-DevTools ist unmöglich.
- **Datensparsamkeit:** Anonymes Spielen ohne Pflichtkonto; permanente Speicherung nur für opt-in Bestenlisten und Statistiken.

---

## 3. Die 3 Spielmodi

### 3.1 Klassisch („Hunter & Prey“)
- **Rollen:** Seeker (Jäger) vs. Hider (Gejagte).
- **Ziel:** Seeker müssen alle Hider vor Ablauf der Zeit fangen. Hider gewinnen, wenn bei Zeitablauf noch mindestens ein Hider frei ist.
- **Dynamik:**
  - Seeker sehen ihre Teamkollegen live. Hider sehen Seeker nicht (außer Näherungswarnung < 100 m).
  - Hider werden in regelmäßigen Intervallen (z.B. alle 5 Min.) per **Radar-Ping** für Seeker aufgedeckt.
  - Gefangene Hider wechseln in den **Zuschauer-Modus** (Live-Sicht auf alle, separater Chat).

### 3.2 Zombie („Infection“)
- **Start:** 1 Alpha-Zombie (oder mehr), alle anderen Spieler sind Menschen.
- **Infektion:** Jeder gefangene Mensch wird augenblicklich selbst zum Zombie.
- **Sichtbarkeit & Unschärfe:** Menschen sehen alle Zombies live auf der Karte, jedoch mit einem dynamischen **50-m-Unschärferaster** und Pseudo-Jitter, um Vorhaltewinkel zu erschweren. Zombies sehen Menschen nur bei Pings.
- **Sieg:** Menschen gewinnen, wenn bei Zeitablauf mindestens ein Mensch überlebt („Letzter Mensch“-Titel). Zombies gewinnen, wenn alle infiziert sind.

### 3.3 Mr. X („Urban Scotland Yard“)
- **Rollen:** 1–2 Mr. X gegen ein Team von Detektiven.
- **Mobilität & Tickets:** Mr. X und Detektive nutzen ÖPNV (Bus, Tram, U-Bahn, S-Bahn, Zug, Fähre) oder Fußwege. Bei Fahrtantritt muss ein Ticket gewählt werden.
- **Spezialtickets:** 2× Black Ticket (Verkehrsmittel bleibt geheim), 1× Doppelzug (zwei Fahrten hintereinander).
- **Aufdeck-Regeln (vom Host wählbar & dynamisch umschaltbar):**
  1. *Nach Tickets:* Jedes N-te Ticket (z.B. jedes 3.) deckt den Einstiegsort auf.
  2. *Nach Distanz:* Aufdeckung bei Überschreiten von X km Luftlinie zum letzten Aufdeckort.
  3. *Nach Zeit:* Periodische Aufdeckung (z.B. alle 15 Min.) mit Push-Vorwarnung.
- **Tempoüberwachung:** Detektive ohne aktives Ticket, die sich > 25 km/h bewegen, lösen nach 2 Min. einen Alarm aus.

---

## 4. Einzigartige Spielmechaniken

### 4.1 Die Funkloch-Mechanik (iOS Background Handling)
- Web-PWA auf iOS sendet im Hintergrund keine Geolocation-Updates. Anstatt dies als Bug zu behandeln, ist es eine zentrale Mechanik:
- **T−60 Sek.:** Automatischer Web-Push an alle Hider: *„Ping in 60 Sek. – App öffnen!“*
- **Funkloch-Strafe:** Wer die App nicht rechtzeitig öffnet und dessen Standort > 90 Sek. alt ist, wird beim nächsten Signal für **60 Sekunden live für alle Jäger aufgedeckt**.

### 4.2 Schrumpfende Sicherheitszone (Zone Shrink)
- Ein definierter geographischer Kreis schrumpft in $N$ Stufen ($r_{\text{neu}} = r_{\text{alt}} \cdot f$).
- Der neue Mittelpunkt liegt immer garantiert innerhalb des alten Kreises.
- 60 Sek. vor der Schrumpfung erscheint eine gestrichelte Vorschauzone; die Schrumpfung animiert über 90 Sek.
- **Zone verlassen:** Sofortige Live-Sichtbarkeit für alle Gegner + Countdown von 60 Sek. Kulanzzeit bis zum automatischen Fang.

### 4.3 Fangen & QR-Fallback
- Sobald ein Seeker innerhalb des Fangradius (z.B. 25 m) ist, wird der „Fangen“-Knopf aktiv.
- Hider erhält eine Bestätigungsaufforderung (Auto-Bestätigung nach 15 Sek. ohne Einspruch).
- **QR-Code-Fallback:** Bei GPS-Ungenauigkeiten in Straßenschluchten scannt der Jäger den rotierenden, kryptografisch signierten QR-Code auf dem Handy des Hiders (`jsQR`).

### 4.4 Taktische Fähigkeiten & Loot-System
- Energiebalken (0–100), der sich zeitlich (+5/Min.) und durch **Loot-Punkte** (+35) auflädt.
- 10 schaltbare Fähigkeiten:
  - *Hider:* Tarnkappe, Köder, Radar, Störsender, Schild.
  - *Seeker:* Sonderping, Peilung, Sonar, Blackout, Zonenstoß.
- Loot-Orte spawnen zufällig in der Zone (mind. 150 m von allen Spielern entfernt).

### 4.5 Replay & Statistiken
- Jedes Spiel wird als ausgedünnte Geodaten-Spur (1 Punkt / 10 Sek.) in SQLite gespeichert.
- Interaktives Replay im Frontend mit Scrubbing, Event-Markern und Playback (1×/10×/60×).
- Dauerhafte Statistiken und Bestenlisten über Firebase RTDB.
