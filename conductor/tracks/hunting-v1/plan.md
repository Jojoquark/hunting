# Execution Plan: Track hunting-v1

## Übersicht & Abhängigkeiten
```
Phase 0 (Setup) ──> Phase 1 (shared) ──> Phase 2 (GameRoom DO) ──> Phase 3 (App Shell) ──> Phase 4 (Klassisch E2E + Simulator)
                                                                                               │
           ┌───────────────────────────────────────────┬───────────────────────────────────────┴───────────────────────┐
           ▼                                           ▼                                                               ▼
Phase 5 (Push & Funkloch)                   Phase 6 (Fangen & QR)                                           Phase 10 (Chat & Audio)
           │                                           │                                                               │
           └───────────────────┬───────────────────────┘                                                               │
                               ▼                                                                                       │
                      Phase 7 (Zombie)                                                                                 │
                               │                                                                                       │
                      Phase 8 (Fähigkeiten)                                                                            │
                               │                                                                                       │
                      Phase 9 (Mr. X & ÖPNV)                                                                           │
                               │                                                                                       │
                               └───────────────────────┬───────────────────────────────────────────────────────────────┘
                                                       ▼
                                              Phase 11 (Replay)
                                                       │
                                              Phase 12 (Firebase Stats)
                                                       │
                                              Phase 13 (Feinschliff & Launch)
```

---

## Phasen-Checkliste

### Phase 0: Gerüst & Toolchain
- [x] Monorepo initialisieren (`package.json`, `pnpm-workspace.yaml`) -> verify: `pnpm -v`
- [x] Package `shared` aufsetzen mit TypeScript & Vitest -> verify: `pnpm --filter shared test`
- [x] Package `worker` mit Wrangler & `@cloudflare/vitest-pool-workers` -> verify: `pnpm --filter worker test`
- [x] Package `app` mit Svelte 5, Vite & `vite-plugin-pwa` -> verify: `pnpm --filter app build`
- [x] GitHub Actions CI-Workflows einrichten (`.github/workflows/test.yml`) -> verify: `pnpm test`

### Phase 1: Shared Core Logik
- [x] `shared/src/typen.ts` & `protokoll.ts` (Zod Schemas) -> verify: `pnpm --filter shared test`
- [x] `shared/src/geo.ts` (Haversine, Peilung, Bounding-Box) -> verify: `vitest run shared/test/geo.test.ts`
- [x] `shared/src/zone.ts` (Inklusions-Zonenplan-Algorithmus) -> verify: `vitest run shared/test/zone.test.ts`
- [x] `shared/src/presets.ts` & `faehigkeiten.ts` -> verify: `vitest run shared/test/presets.test.ts`

### Phase 2: GameRoom Durable Object
- [x] Worker Router (`worker/src/index.ts`) mit `/spiele` & WebSocket Upgrade -> verify: `pnpm --filter worker test`
- [x] DO SQLite Schema für State, Replay & Subscriptions -> verify: `vitest run worker/test/db.test.ts`
- [x] GameRoom Zustandsmaschine (Lobby, Countdown, Jagd, Ende) -> verify: `vitest run worker/test/gameroom.test.ts`
- [x] Zentrale Sichtbarkeits-Engine `sichtbarFuer()` -> verify: `vitest run worker/test/sichtbarkeit.test.ts`
- [x] DO Alarme für Server-gesteuerte Timer & Pings -> verify: `vitest run worker/test/alarms.test.ts`

### Phase 3: App-Shell & Liquid Glass UI
- [x] Design Tokens & Themes (`app/src/lib/ui/tokens.css`) -> verify: Kontrast-Test $\ge 4.5:1$
- [x] Liquid Glass Komponenten (`GlasKapsel.svelte`, `Knopf.svelte`, `Sheet.svelte`) -> verify: Storybook / Component Test
- [x] Screen-Routing & Basis-Screens (Start, Einrichtung, Lobby) -> verify: `pnpm --filter app test`
- [x] Zonen-Editor mit interaktiver Karte -> verify: Playwright Screenshot-Test

### Phase 4: Klassisch Modus & Bot-Simulator
- [x] MapLibre Controller mit OpenFreeMap Dark Style -> verify: Render-Test
- [x] HUD-Elemente (Kopf-Kapsel, Zonen-Layer, Radar-Puls) -> verify: GPU Animation Audit
- [x] Headless Bot-Simulator (`tools/bot-simulator`) für 6 Bots -> verify: `node tools/bot-simulator/run.js`
- [x] E2E Klassisch Match durchspielen -> verify: Simulator beendet Match mit Siegereignis

### Phase 5: Push & Funkloch-Mechanik
- [x] WebCrypto VAPID Push Signer in Worker -> verify: `vitest run worker/test/push.test.ts`
- [x] Service Worker Push Event Handler (`app/src/sw.ts`) -> verify: SW Push Notification Mock-Test
- [x] T−60s Vorwarnung & Funkloch-Strafzeit-Trigger im DO -> verify: Integrationstest mit Fake-Uhr

### Phase 6: Fangen & QR-Fallback
- [x] Distanz- und Plausibilitätsprüfung auf Server -> verify: `vitest run worker/test/fangen.test.ts`
- [x] Fang-Bestätigungs-Flow (15s Auto-Confirm) -> verify: Timeout Test im DO
- [x] QR-Token Signer & jsQR Scanner View -> verify: QR Validierungstest

### Phase 7: Zombie-Modus
- [x] Infektions-Transmutation bei Fang -> verify: Rollenwechsel-Test im DO
- [x] 50m Unschärfe-Raster mit pseudo-zufälligem Jitter -> verify: Unschärfe-Invarianztest (100 Updates $\Delta > 25\text{m}$)
- [x] Siegbedingung „Letzter Mensch“ -> verify: `vitest run worker/test/zombie.test.ts`

### Phase 8: Fähigkeiten & Loot-System
- [x] Energie-Aufladung (+5/Min.) und Loot-Spawns ($\ge 150\text{m}$ Abstand) -> verify: Spawner-Test
- [x] Alle 10 Fähigkeiten serverseitig implementieren -> verify: Matrix-Test für jede Fähigkeit
- [x] UI Action Bar & Cooldown Tracker -> verify: Component Tests

### Phase 9: Mr. X Modus & ÖPNV
- [x] Ticket-System (Normal, Black, Doppelzug) -> verify: Ticket-Logik-Test
- [x] 3 Aufdeck-Regeln (Tickets / Distanz / Zeit) -> verify: Regel-Umschalt-Test
- [x] Transit-Proxy mit Cache (24h/200m) & Overpass Fallback -> verify: Mock 429 Cache-Test
- [x] Tempo-Warnung für Detektive ($>25\text{km/h}$ ohne Ticket) -> verify: Speed Alert Test

### Phase 10: Team-Chat, SFX & Haptik
- [x] Rollen-isolierte Chat-Kanäle (Team, Alle, Zuschauer) -> verify: Isolationstest
- [x] WebAudio Synth Sound-Engine (Ping, Fang, Alert) -> verify: Audio Context Initialisierung
- [x] Haptik Engine (`navigator.vibrate`) -> verify: Vibration Fallback Test

### Phase 11: Replay-System
- [x] SQLite Tracking (1 Punkt / 10s Kompression) -> verify: Speicher-Benchmark
- [x] Frontend Replay Player mit Timeline Scrubbing -> verify: Playwright Replay Test
- [x] 7-Tage Auto-Lösch-Alarm im DO -> verify: Alarm Expiry Test

### Phase 12: Konto, Statistiken & Bestenliste
- [x] Firebase Auth (Anonymous + Google Linking) -> verify: Auth Flow Test
- [x] Worker REST Sync für Spielstatistiken -> verify: Firebase RTDB Rule Test
- [x] Profil-Screen & Bestenlisten-View -> verify: E2E Profil Test

### Phase 13: Feinschliff, Performance & Launch
- [x] Lighthouse PWA Audit $\ge 90$ -> verify: Lighthouse CLI
- [x] Akku-Optimierungs-Audit (< 15%/h Ziel) -> verify: Wake-Lock & Geolocation Profile
- [x] Bereitstellung auf GitHub Pages & Cloudflare Worker -> verify: Production Smoke Test
