# HUNTING – Spielanleitung

HUNTING ist ein GPS-Fangspiel für Smartphones. Für eine gemeinsame Runde brauchen alle Mitspielenden eine Internetverbindung, einen aktuellen Browser und aktivierten Standortzugriff. Die App muss während der Runde geöffnet bleiben; Hintergrund-Push ist derzeit nicht verfügbar.

## Eine Runde starten

1. Öffne die veröffentlichte HUNTING-Web-App über HTTPS.
2. Tippe auf **Spiel erstellen**. Erlaube den Standortzugriff, damit die Spielzone an deinem Standort beginnt. Falls der Zugriff nicht möglich ist, kannst du die Zone in der Lobby auf der Karte manuell setzen.
3. Teile den sechsstelligen Spielcode oder den QR-Link aus der Lobby mit den Mitspielenden.
4. Alle treten bei und bleiben in der Lobby, bis sie in der Spielerliste als online erscheinen. Eine Runde kann mit mindestens zwei verbundenen Spielern gestartet werden.
5. Der Host wählt den Modus und die Einstellungen und tippt auf **Jagd starten**. Die anderen wechseln automatisch in die Runde.

## Spielmodi

- **Klassisch:** Der Host ist Jäger, die übrigen sind Gejagte.
- **Zombie:** Der Host startet als Zombie; die anderen beginnen als Menschen.
- **Mr. X:** Der Host spielt Mr. X, die übrigen sind Detektive.

Die Spielerrollen werden serverseitig festgelegt. Der Host kann in der Lobby Spieldauer, Versteckzeit, Ping-Intervall, Zonenradius und Fähigkeiten einstellen.

## Standort und Sicherheit

HUNTING verwendet den Standort, um die Spielzone und Fänge zu prüfen. Die Position wird an den Spielserver übertragen; Mitspielende sehen Positionsdaten abhängig vom Spielmodus und den Spielregeln. Standortberechtigungen kannst du jederzeit in den Geräte- oder Browser-Einstellungen widerrufen. Ohne HTTPS (außer auf `localhost`) erlauben Browser meist keinen GPS-Zugriff.

Die Kartenansicht lädt Kartenausschnitte von OpenFreeMap. Der Kartendienst erhält dabei deine IP-Adresse und den angefragten Kartenausschnitt.

Spielt nur auf frei zugänglichem, sicherem Gelände. Beim Laufen nicht auf das Display schauen. Betretet keine Straßen, Gleise, Baustellen, Privatgrundstücke oder gesperrten Bereiche.

## Installation auf dem Smartphone

- **iPhone:** HUNTING in Safari öffnen, **Teilen** und **Zum Home-Bildschirm** auswählen.
- **Android:** HUNTING in Chrome öffnen und im Browsermenü **App installieren** oder **Zum Startbildschirm hinzufügen** wählen.

Die Installation ist optional. Haltet die App im Vordergrund, damit Standort- und Netzwerkaktualisierungen weiterlaufen.

## Lokale Entwicklung

Voraussetzungen: Node.js 20 oder neuer und pnpm 9 oder neuer.

```bash
pnpm install
pnpm --filter hunting-app dev
```

In einem zweiten Terminal:

```bash
pnpm --filter @hunting/worker dev
```

Die App läuft auf `http://localhost:5173`, der lokale Worker auf `http://localhost:8787`. Lokale Entwicklung ist für Tests auf demselben Rechner gedacht. Für Smartphones und Spiele über Mobilfunk müssen die PWA und der Worker öffentlich über HTTPS/WSS bereitgestellt sein.

## Bekannte Grenzen

- Hintergrund-Push und Fang per QR-Code sind deaktiviert.
- Profilname und Spieleinstellungen werden nicht mit einem Konto synchronisiert.
- Es gibt derzeit keine echten Profilstatistiken oder Match-Replays.
- Browser-GPS kann ungenau sein und lässt sich auf Geräten manipulieren; HUNTING kann das nicht vollständig verhindern.
