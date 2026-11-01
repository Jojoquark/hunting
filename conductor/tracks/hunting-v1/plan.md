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
- [ ] Monorepo initialisieren (`package.json`, `pnpm-workspace.yaml`) -> verify: `pnpm -v`
- [ ] Package `shared` aufsetzen mit TypeScript & Vitest -> verify: `pnpm --filter shared test`
- [ ] Package `worker` mit Wrangler & `@cloudflare/vitest-pool-workers` -> verify: `pnpm --filter worker test`
- [ ] Package `app` mit Svelte 5, Vite & `vite-plugin-pwa` -> verify: `pnpm --filter app build`
- [ ] GitHub Actions CI-Workflows einrichten (`.github/workflows/test.yml`) -> verify: `pnpm test`

### Phase 1: Shared Core Logik
- [ ] `shared/src/typen.ts` & `protokoll.ts` (Zod Schemas) -> verify: `pnpm --filter shared test`
- [ ] `shared/src/geo.ts` (Haversine, Peilung, Bounding-Box) -> verify: `vitest run shared/test/geo.test.ts`
- [ ] `shared/src/zone.ts` (Inklusions-Zonenplan-Algorithmus) -> verify: `vitest run shared/test/zone.test.ts`
- [ ] `shared/src/presets.ts` & `faehigkeiten.ts` -> verify: `vitest run shared/test/presets.test.ts`

### Phase 2: GameRoom Durable Object
- [ ] Worker Router (`worker/src/index.ts`) mit `/spiele` & WebSocket Upgrade -> verify: `pnpm --filter worker test`
- [ ] DO SQLite Schema für State, Replay & Subscriptions -> verify: `vitest run worker/test/db.test.ts`
- [ ] GameRoom Zustandsmaschine (Lobby, Countdown, Jagd, Ende) -> verify: `vitest run worker/test/gameroom.test.ts`
- [ ] Zentrale Sichtbarkeits-Engine `sichtbarFuer()` -> verify: `vitest run worker/test/sichtbarkeit.test.ts`
- [ ] DO Alarme für Server-gesteuerte Timer & Pings -> verify: `vitest run worker/test/alarms.test.ts`

### Phase 3: App-Shell & Liquid Glass UI
- [ ] Design Tokens & Themes (`app/src/lib/ui/tokens.css`) -> verify: Kontrast-Test $\ge 4.5:1$
- [ ] Liquid Glass Komponenten (`GlasKapsel.svelte`, `Knopf.svelte`, `Sheet.svelte`) -> verify: Storybook / Component Test
- [ ] Screen-Routing & Basis-Screens (Start, Einrichtung, Lobby) -> verify: `pnpm --filter app test`
- [ ] Zonen-Editor mit interaktiver Karte -> verify: Playwright Screenshot-Test

### Phase 4: Klassisch Modus & Bot-Simulator
- [ ] MapLibre Controller mit OpenFreeMap Dark Style -> verify: Render-Test
- [ ] HUD-Elemente (Kopf-Kapsel, Zonen-Layer, Radar-Puls) -> verify: GPU Animation Audit
- [ ] Headless Bot-Simulator (`tools/bot-simulator`) für 6 Bots -> verify: `node tools/bot-simulator/run.js`
- [ ] E2E Klassisch Match durchspielen -> verify: Simulator beendet Match mit Siegereignis

### Phase 5: Push & Funkloch-Mechanik
- [ ] WebCrypto VAPID Push Signer in Worker -> verify: `vitest run worker/test/push.test.ts`
- [ ] Service Worker Push Event Handler (`app/src/sw.ts`) -> verify: SW Push Notification Mock-Test
- [ ] T−60s Vorwarnung & Funkloch-Strafzeit-Trigger im DO -> verify: Integrationstest mit Fake-Uhr

### Phase 6: Fangen & QR-Fallback
- [ ] Distanz- und Plausibilitätsprüfung auf Server -> verify: `vitest run worker/test/fangen.test.ts`
- [ ] Fang-Bestätigungs-Flow (15s Auto-Confirm) -> verify: Timeout Test im DO
- [ ] QR-Token Signer & jsQR Scanner View -> verify: QR Validierungstest

### Phase 7: Zombie-Modus
- [ ] Infektions-Transmutation bei Fang -> verify: Rollenwechsel-Test im DO
- [ ] 50m Unschärfe-Raster mit pseudo-zufälligem Jitter -> verify: Unschärfe-Invarianztest (100 Updates $\Delta > 25\text{m}$)
- [ ] Siegbedingung „Letzter Mensch“ -> verify: `vitest run worker/test/zombie.test.ts`

### Phase 8: Fähigkeiten & Loot-System
- [ ] Energie-Aufladung (+5/Min.) und Loot-Spawns ($\ge 150\text{m}$ Abstand) -> verify: Spawner-Test
- [ ] Alle 10 Fähigkeiten serverseitig implementieren -> verify: Matrix-Test für jede Fähigkeit
- [ ] UI Action Bar & Cooldown Tracker -> verify: Component Tests

### Phase 9: Mr. X Modus & ÖPNV
- [ ] Ticket-System (Normal, Black, Doppelzug) -> verify: Ticket-Logik-Test
- [ ] 3 Aufdeck-Regeln (Tickets / Distanz / Zeit) -> verify: Regel-Umschalt-Test
- [ ] Transit-Proxy mit Cache (24h/200m) & Overpass Fallback -> verify: Mock 429 Cache-Test
- [ ] Tempo-Warnung für Detektive ($>25\text{km/h}$ ohne Ticket) -> verify: Speed Alert Test

### Phase 10: Team-Chat, SFX & Haptik
- [ ] Rollen-isolierte Chat-Kanäle (Team, Alle, Zuschauer) -> verify: Isolationstest
- [ ] WebAudio Synth Sound-Engine (Ping, Fang, Alert) -> verify: Audio Context Initialisierung
- [ ] Haptik Engine (`navigator.vibrate`) -> verify: Vibration Fallback Test

### Phase 11: Replay-System
- [ ] SQLite Tracking (1 Punkt / 10s Kompression) -> verify: Speicher-Benchmark
- [ ] Frontend Replay Player mit Timeline Scrubbing -> verify: Playwright Replay Test
- [ ] 7-Tage Auto-Lösch-Alarm im DO -> verify: Alarm Expiry Test

### Phase 12: Konto, Statistiken & Bestenliste
- [ ] Firebase Auth (Anonymous + Google Linking) -> verify: Auth Flow Test
- [ ] Worker REST Sync für Spielstatistiken -> verify: Firebase RTDB Rule Test
- [ ] Profil-Screen & Bestenlisten-View -> verify: E2E Profil Test

### Phase 13: Feinschliff, Performance & Launch
- [ ] Lighthouse PWA Audit $\ge 90$ -> verify: Lighthouse CLI
- [ ] Akku-Optimierungs-Audit (< 15%/h Ziel) -> verify: Wake-Lock & Geolocation Profile
- [ ] Bereitstellung auf GitHub Pages & Cloudflare Worker -> verify: Production Smoke Test
