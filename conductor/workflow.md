# Conductor Workflow & Quality Guidelines

## 1. Context-Driven Development (CDD) Prinzipien
1. **Persistent Context:** Kein Code wird ohne Abgleich mit `conductor/product.md` und `conductor/tech-stack.md` geschrieben.
2. **Track-Bindung:** Jede nicht-triviale Änderung gehört zu einem Track (`conductor/tracks/<track-id>/`).
3. **Verifizierbare Checkpoints:** Jeder Arbeitsschritt deklariert ein deterministisches `verify:` Testkommando.
4. **Single Source of Truth:** `shared/` ist unveränderliche Schnittstelle für Worker und App.

---

## 2. Test-Driven Development (TDD) Zyklus
Für alle Module in `shared/`, `worker/` und `app/lib/netz/`:
```
   [1. RED]          [2. GREEN]         [3. REFACTOR]
Schreibe Test  -->  Minimaler Code  -->  Bereinigung &
(schlägt fehl)      (Test besteht)       Quality Review
```
- **Keine Spekulation:** Nur Code schreiben, der einen Test grün macht.
- **Automatisierte CI:** Vor jedem Merge/Push müssen alle Tests via `pnpm test` bestehen.

---

## 3. Andrej Karpathy Coding Guidelines
1. **Think Before Coding:**
   - Annahmen explizit dokumentieren.
   - Trade-offs offenlegen, nicht blind raten.
   - Einfachere Architekturen bevorzugen und Komplexität hinterfragen.
2. **Simplicity First:**
   - Mindestcode, der das Problem löst.
   - Keine spekulativen Abstraktionen für Einmal-Logik. Keine 200 Zeilen, wo 50 genügen.
   - Keine Fehlerbehandlung für unzerstörbare mathematische Invarianten.
3. **Surgical Changes:**
   - Nur berühren, was verändert werden muss. Keine unbeteiligten Formatierungsänderungen.
   - Umgebenden Codestil exakt spiegeln.
   - Eigene verwaiste Imports und Variablen säubern.
4. **Goal-Driven Execution:**
   - Klare Erfolgsmetriken definieren.
   - Eigenständige Verifikation anhand realer Testläufe.

---

## 4. Design & Motion Richtlinien (Emil Kowalski & Liquid Glass)
1. **Strict Two-Layer Rule:**
   - **Functional Layer (Glass):** Floating Pill Bars, schwebende Header-Kapseln, Action Sheets (`backdrop-filter: blur(20px) saturate(1.6)`, 1px Lichtkante).
   - **Content Layer (Opaque):** Listen, Menüflächen, Kartenhintergrund strictly deckend (`--grund: #0a0a0c`, `--flaeche: #141418`). Niemals Glas auf Content-Karten.
2. **Performance First:**
   - Animationen **ausschließlich** über GPU-beschleunigte Properties: `transform` und `opacity`.
   - Striktes Verbot von `transition: all`, kein Animieren von `width`, `height`, `margin`, `padding` oder `top/left`.
   - Kein Layout-Thrashing.
3. **Motion Physics:**
   - Entrances: Immer `ease-out`, niemals `ease-in`.
   - Scale Restraint: Start niemals bei `scale(0)`, sondern subtil bei `scale(0.95)` mit `opacity: 0`.
   - Taktiles Feedback: `:active` mit `transform: scale(0.97)` ohne Klick-Verzögerung.
   - High-Frequency Actions: Null Animation bei harten Spiel-Statusanzeigen; Radar-Puls mit natürlicher Ausbreitung.

---

## 5. Review-Format & Severity-Klassifizierung
Code-Reviews durch den Quality Reviewer erfolgen immer als tabellarischer Audit:
| File:Line | Severity | Issue | Recommended Fix |
| :--- | :--- | :--- | :--- |

- **Blocker:** Sicherheitslücke, Memory Leak, Regelbruch im Protokoll, Brechen von `pnpm build/test`.
- **Warning:** Überkomplexität, Layout-Thrashing-Gefahr, unvollständige Edge-Case-Abdeckung.
- **Note:** Stil-Optimierung, Micro-Copy, Refactoring-Vorschlag.
