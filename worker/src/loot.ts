import { LootPunkt, SpielZustand, Spieler } from './types';
import { haversineDistanz, zufaelligerPunktInKreis } from './geo';

export function spawneLootPunkt(zustand: SpielZustand): LootPunkt | null {
  const zone = zustand.aktuelleZone;
  let versuche = 0;

  while (versuche < 20) {
    versuche++;
    const kandidate = zufaelligerPunktInKreis(zone.mittelpunkt, zone.radiusMeter * 0.9);

    // Mindestens 150m Abstand zu allen aktiven Spielern
    let zuNah = false;
    for (const sp of Object.values(zustand.spieler)) {
      if (sp.position && haversineDistanz(kandidate, sp.position) < 150) {
        zuNah = true;
        break;
      }
    }

    if (!zuNah) {
      const loot: LootPunkt = {
        id: `loot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        koordinate: kandidate,
        energieWert: 35,
        gespawntUm: zustand.jetzt
      };
      zustand.lootPunkte.push(loot);
      return loot;
    }
  }

  return null;
}

export function pruefeLootEinsammeln(spieler: Spieler, zustand: SpielZustand): LootPunkt[] {
  if (!spieler.position || spieler.gefangen) return [];

  const eingesammelt: LootPunkt[] = [];
  const verbleibend: LootPunkt[] = [];

  for (const loot of zustand.lootPunkte) {
    if (haversineDistanz(spieler.position, loot.koordinate) <= 20) {
      spieler.energie = Math.min(100, spieler.energie + loot.energieWert);
      eingesammelt.push(loot);
    } else {
      verbleibend.push(loot);
    }
  }

  zustand.lootPunkte = verbleibend;
  return eingesammelt;
}
