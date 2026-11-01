# Track Specification: HUNTING v1

## 1. Übersicht & Zielsetzung
Dieser Track spezifiziert die vollständige Implementierung des browserbasierten GPS-Fangspiels **HUNTING** inklusive aller 3 Spielmodi (Klassisch, Zombie, Mr. X), der 10 Fähigkeiten, der Zonen- und Fang-Mathematik sowie der Client-Server-Schnittstellen via WebSockets und Cloudflare Durable Objects.

---

## 2. Mathematische Modelle & Algorithmen

### 2.1 Geodätische Berechnungen (Haversine & Peilung)
- **Distanz $d$ (Haversine):**
  $$d = 2 R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
  mit Erdradius $R = 6.371.000\,\text{m}$.
- **Peilung $\theta$ (Inital Bearing):**
  $$\theta = \operatorname{atan2}\left(\sin(\Delta \lambda)\cos(\phi_2), \; \cos(\phi_1)\sin(\phi_2) - \sin(\phi_1)\cos(\phi_2)\cos(\Delta \lambda)\right)$$
  Normierung auf $0^\circ \le \theta < 360^\circ$.

### 2.2 Zonenplan-Generierung (`zone.ts`)
Beim Spielstart berechnet der Server deterministisch alle Zonenstufen:
1. Gegeben: Startmittelpunkt $M_0 = (\text{lat}_0, \text{lng}_0)$, Startradius $r_0$, Anzahl Stufen $N$, Schrumpffaktor $f \in [0.4, 0.9]$.
2. Für jede Stufe $i \in \{1, \dots, N\}$:
   $$r_i = r_{i-1} \cdot f$$
   Der maximale Versatz des neuen Mittelpunkts beträgt:
   $$\Delta_{\max} = r_{i-1} - r_i$$
   Wähle zufälligen Abstand $\rho \sim \mathcal{U}(0, \Delta_{\max})$ und zufälligen Azimut $\alpha \sim \mathcal{U}(0, 2\pi)$ mittels `crypto.getRandomValues`.
   Berechne $M_i$ durch Vorwärtsprojektion von $M_{i-1}$ mit $(\rho, \alpha)$.
3. **Invariante:** Kreis $C_i$ liegt zu $100\%$ innerhalb von Kreis $C_{i-1}$. (Property-Test über 10.000 Zyklen).

### 2.3 Zombie-Unschärferaster
- Lat/Lng werden auf ein 50-m-Gitter quantisiert:
  $$\Delta \phi_{50} = \frac{50}{R} \cdot \frac{180^\circ}{\pi}, \quad \Delta \lambda_{50} = \frac{50}{R \cos(\phi)} \cdot \frac{180^\circ}{\pi}$$
- Zur Verhinderung von Delta-Abtastangriffen wird ein zeitbasierter pseudo-zufälliger Offset (stündlich/minütlich rotiert) addiert.

### 2.4 Anti-Cheat Plausibilitätsprüfung
- Geschwindigkeit $v$ zwischen zwei aufeinanderfolgenden Standorten $P_{k-1}$ und $P_k$:
  $$v = \frac{d(P_{k-1}, P_k)}{\Delta t}$$
- Ist $v > 50\,\text{m/s}$ ($180\,\text{km/h}$), wird der Datenpunkt verworfen und der Spieler als verdächtig markiert. Ab 3 Vorfällen erhält der Host eine Warnmeldung.
- **Mr. X Detektiv-Tempoüberwachung:** Ist ein Detektiv ohne aktives Ticket länger als 120 Sek. mit $v > 25\,\text{km/h}$ ($6.94\,\text{m/s}$) unterwegs, wird ein Alarm im Ereignis-Log ausgelöst.

---

## 3. Zustandsmaschinen

### 3.1 Spielphasen
```
[Lobby] ──(Host startet)──> [Versteckphase] ──(Countdown abgelaufen)──> [Jagd]
  ▲                                                                      │
  │                               (alle gefangen / Zeit um / Host stopp) │
  │                                                                      ▼
  └──(Revanche)────────────────── [Replay] ◄───────────────────────── [Ende]
```

### 3.2 Fang-Ablauf & Validierung
1. Seeker sendet `fangen(zielId)`.
2. Server prüft:
   - $d(\text{Seeker}, \text{Ziel}) \le r_{\text{fang}} + \min(\text{Genauigkeit}_{\text{Seeker}}, 20\,\text{m})$.
   - Beide Positionen sind $\le 15\,\text{Sek.}$ alt.
   - Kein aktives Schild oder Störsender beim Ziel bzw. Seeker.
3. Falls gültig: Push-Anfrage an Gejagten (`fangAnfrage`).
4. Gejagter bestätigt oder widerspricht. Erfolgt innerhalb von 15 Sek. keine Antwort $\rightarrow$ Auto-Bestätigung.
5. **QR-Scan-Fallback:** Scannt der Seeker den dynamischen HMAC-Token des Gejagten, wird der Fang serverseitig **sofort und unanfechtbar** bestätigt.

---

## 4. Sichtbarkeitsmatrix (`sichtbarFuer(betrachter, ziel, zustand)`)

| Betrachter | Ziel | Modus / Bedingung | Ergebnis |
| :--- | :--- | :--- | :--- |
| Seeker | Seeker | Alle Modi | `live` |
| Hider | Hider | Klassisch | `live` |
| Seeker | Hider | Ping aktiv (frisch) | `ping` |
| Seeker | Hider | Ping aktiv (Funkloch-Strafe) | `live` (für 60s) |
| Seeker | Hider | Hider außerhalb der Zone | `live` |
| Hider | Seeker | Immer (außer Radar-Fähigkeit) | `unsichtbar` |
| Mensch | Zombie | Zombie-Modus | `unscharf(50m)` |
| Zombie | Mensch | Zombie-Modus (kein Ping) | `unsichtbar` |
| Detektiv | Mr. X | Kein Aufdeck-Trigger | `unsichtbar` |
| Detektiv | Mr. X | Aufdeck-Trigger (Ticket/Distanz/Zeit) | `ping` |
| Zuschauer | Alle | Spiel beendet oder gefangen | `live` |

---

## 5. Katalog der 10 Fähigkeiten

| ID | Name | Seite | Energie | Cooldown | Dauer | Beschreibung |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `tarnkappe` | Tarnkappe | Hider | 60 | 600s | 1 Event | Nächster regulärer Ping deckt Spieler nicht auf |
| `koeder` | Köder | Hider | 50 | 600s | 1 Event | Nächster Ping zeigt Punkt $\le 300\,\text{m}$ (in Zone) |
| `radar` | Radar | Hider | 40 | 300s | 15s | Alle Jäger werden 15s live sichtbar |
| `stoersender`| Störsender | Hider | 50 | 480s | 60s | Jäger im Umkreis von $150\,\text{m}$ können nicht fangen |
| `schild` | Schild | Hider | 70 | 1×/Spiel | 30s | Vollständige Fangimmunität für 30s |
| `sonderping` | Sonderping | Seeker | 60 | 480s | Sofort | Sofortiger Ping eines zufälligen Gejagten |
| `peilung` | Peilung | Seeker | 40 | 300s | 20s | Richtungspfeil zum nächsten Gejagten (ohne Distanz) |
| `sonar` | Sonar | Seeker | 30 | 180s | Sofort | Anzahl Gejagter im Umkreis von $250\,\text{m}$ |
| `blackout` | Blackout | Seeker | 70 | 720s | 120s | Alle Gejagten können keine Fähigkeiten nutzen |
| `zonenstoss`| Zonenstoß | Seeker | 60 | 1×/Stufe | Sofort | Nächste Zonenschrumpfung startet 2 Min. früher |

---

## 6. Protokoll-Spezifikation (Zod Schemas)

### 6.1 Client $\rightarrow$ Server
```typescript
z.discriminatedUnion("typ", [
  z.object({ typ: z.literal("hallo"), token: z.string().optional(), name: z.string().min(2).max(20), avatar: z.string() }),
  z.object({ typ: z.literal("ort"), lat: z.number(), lng: z.number(), genauigkeit: z.number(), zeit: z.number(), tempo: z.number().nullable() }),
  z.object({ typ: z.literal("fangen"), zielId: z.string() }),
  z.object({ typ: z.literal("fangAntwort"), fangId: z.string(), bestaetigt: z.boolean() }),
  z.object({ typ: z.literal("qrFang"), qrToken: z.string() }),
  z.object({ typ: z.literal("faehigkeit"), id: z.string(), params: z.record(z.any()).optional() }),
  z.object({ typ: z.literal("ticket"), typ: z.enum(["bus", "tram", "ubahn", "sbahn", "zug", "faehre"]), linie: z.string().optional(), station: z.string().optional(), spezial: z.enum(["black", "doppel"]).optional() }),
  z.object({ typ: z.literal("chat"), kanal: z.enum(["alle", "team", "zuschauer"]), text: z.string().max(200) }),
  z.object({ typ: z.literal("hostAktion"), aktion: z.enum(["start", "pause", "beenden", "rolleWechseln", "einstellungenUpdate"]), payload: z.any() })
]);
```

### 6.2 Server $\rightarrow$ Client
```typescript
z.discriminatedUnion("typ", [
  z.object({ typ: z.literal("zustand"), spielZustand: z.any() }),
  z.object({ typ: z.literal("sicht"), positionen: z.array(z.object({ spielerId: z.string(), lat: z.number(), lng: z.number(), modus: z.enum(["live", "unscharf", "ping"]), alter: z.number() })) }),
  z.object({ typ: z.literal("ereignis"), ereignisTyp: z.string(), details: z.record(z.any()), zeitstempel: z.number() }),
  z.object({ typ: z.literal("zeit"), serverZeit: z.number() }),
  z.object({ typ: z.literal("fehler"), nachricht: z.string() })
]);
```
