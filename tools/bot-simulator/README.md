# HUNTING – Headless Bot Simulator

Ermöglicht das vollständige Testen von Jagdspielen, Fähigkeiten und Fängen ohne das Haus zu verlassen.

## Schnelle Ausführung

```bash
# Klassisches Spiel mit 1 Seeker und 5 Hidern bei 10x Geschwindigkeit
pnpm --filter @hunting/bot-simulator simulate:classic

# Zombie-Modus
pnpm --filter @hunting/bot-simulator simulate:zombie

# Mr. X-Modus mit simuliertem ÖPNV
pnpm --filter @hunting/bot-simulator simulate:mrx
```

## CLI-Optionen

```bash
pnpm --filter @hunting/bot-simulator start -- \
  --mode klassisch \
  --speed 20 \
  --hiders 6 \
  --seekers 2 \
  --server ws://127.0.0.1:8787 \
  --duration 600
```
