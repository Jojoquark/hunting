import { describe, expect, it } from 'vitest';
import {
  anonymisiereAbgelaufeneSpielDaten,
  erstelleReplayDeaktiviertAntwort,
  hasheZugangstoken,
  istGueltigePosition,
  istQrGeheimnisKonfiguriert,
  istSpielerId,
  istZugangstoken,
  liegtImFangRadius,
  REPLAY_DEAKTIVIERT_TEXT,
  rolleFuerSpieler,
  vergleicheKonstant
} from '../../src/sicherheit';
import { Spieler, SpielZustand } from '../../src/types';

describe('Release-Härtung', () => {
  it('akzeptiert nur zufällige Credentials im vorgesehenen Format und speichert Token-Hashes', async () => {
    const spielerId = 'a'.repeat(32);
    const token = 'b'.repeat(64);
    const hash = await hasheZugangstoken(token);

    expect(istSpielerId(spielerId)).toBe(true);
    expect(istSpielerId('not-an-id')).toBe(false);
    expect(istZugangstoken(token)).toBe(true);
    expect(istZugangstoken('short')).toBe(false);
    expect(hash).not.toBe(token);
    expect(vergleicheKonstant(hash, await hasheZugangstoken(token))).toBe(true);
    expect(vergleicheKonstant(hash, await hasheZugangstoken('c'.repeat(64)))).toBe(false);
  });

  it('schaltet QR-Fangen ohne ausreichend langes Geheimnis ab', () => {
    expect(istQrGeheimnisKonfiguriert(undefined)).toBe(false);
    expect(istQrGeheimnisKonfiguriert('weak')).toBe(false);
    expect(istQrGeheimnisKonfiguriert('x'.repeat(32))).toBe(true);
  });

  it('liefert für Replay bis zu Einwilligung und Replay-UI immer 501', async () => {
    const response = erstelleReplayDeaktiviertAntwort();
    expect(response.status).toBe(501);
    expect(await response.text()).toBe(REPLAY_DEAKTIVIERT_TEXT);
  });

  it('anonymisiert abgeschlossene Räume nach 24 Stunden und erhält nur den Codeshell', () => {
    const beendetUm = 1_800_000_000_000;
    const spieler: Spieler = {
      id: 'a'.repeat(32), spitzname: 'Teilnehmer', icon: 'circle', farbe: '#000000', rolle: 'hider',
      bereit: false, online: false, energie: 0, position: { lat: 52.52, lng: 13.405, genauigkeit: 5, zeit: beendetUm },
      letzterPingPosition: { lat: 52.52, lng: 13.405 }, ausserhalbZone: false, gefangen: false,
      faehigkeitenStatus: { tarnkappeAktiv: false, abklingzeiten: {} }
    };
    const zustand: SpielZustand = {
      code: 'ABC234', hostId: spieler.id, phase: 'ende', modus: 'klassisch',
      einstellungen: {
        dauerMinuten: 60, versteckZeitMinuten: 10, pingIntervallMinuten: 5,
        zonenRadiusStartMeter: 1000, zonenStufen: 4, radiusFaktor: 0.65,
        fangRadiusMeter: 25, autoBestaetigungSekunden: 15, kulanzZeitZoneSekunden: 60,
        naeheWarnungAktiv: true, naeheWarnungRadiusMeter: 100, funklochStrafeAktiv: true,
        faehigkeitenAktiv: false, faehigkeitenSchalter: {}, mrxAufdeckRegel: 'tickets',
        mrxAufdeckTicketIntervall: 3, mrxAufdeckDistanzMeter: 2000,
        mrxAufdeckZeitMinuten: 15, mrxSiehtDetektive: true
      },
      spieler: { [spieler.id]: spieler },
      aktuelleZone: { mittelpunkt: { lat: 52.52, lng: 13.405 }, radiusMeter: 1000, stufe: 0 },
      lootPunkte: [{ id: 'loot', koordinate: { lat: 52.52, lng: 13.405 }, energieWert: 1, gespawntUm: beendetUm }],
      phasenStartZeit: beendetUm, naechsterPingZeit: beendetUm + 1, jetzt: beendetUm,
      beendetUm, sieger: 'hider'
    };

    expect(anonymisiereAbgelaufeneSpielDaten(zustand, beendetUm + 24 * 60 * 60 * 1000 - 1, 24 * 60 * 60 * 1000)).toBe(false);
    expect(anonymisiereAbgelaufeneSpielDaten(zustand, beendetUm + 24 * 60 * 60 * 1000, 24 * 60 * 60 * 1000)).toBe(true);
    expect(zustand.code).toBe('ABC234');
    expect(zustand.phase).toBe('ende');
    expect(zustand.hostId).toBe('abgelaufen');
    expect(zustand.spieler).toEqual({});
    expect(JSON.stringify(zustand)).not.toContain(spieler.id);
    expect(JSON.stringify(zustand)).not.toContain('Teilnehmer');
    expect(zustand.lootPunkte).toEqual([]);
    expect(zustand.aktuelleZone.mittelpunkt).toEqual({ lat: 0, lng: 0 });
    expect(zustand.sieger).toBeUndefined();
    expect(zustand.datenBereinigt).toBe(true);
    expect(anonymisiereAbgelaufeneSpielDaten(zustand, beendetUm + 48 * 60 * 60 * 1000, 24 * 60 * 60 * 1000)).toBe(false);
  });

  it('weist fehlerhafte, nicht endliche, veraltete und zukünftige Positionen ab', () => {
    const jetzt = 1_800_000_000_000;
    const position = { lat: 52.52, lng: 13.405, genauigkeit: 5, zeit: jetzt };

    expect(istGueltigePosition(position, jetzt)).toBe(true);
    expect(istGueltigePosition({ ...position, lat: Number.NaN }, jetzt)).toBe(false);
    expect(istGueltigePosition({ ...position, lng: 181 }, jetzt)).toBe(false);
    expect(istGueltigePosition({ ...position, genauigkeit: -1 }, jetzt)).toBe(false);
    expect(istGueltigePosition({ ...position, zeit: jetzt - 30_001 }, jetzt)).toBe(false);
    expect(istGueltigePosition({ ...position, zeit: jetzt + 5_001 }, jetzt)).toBe(false);
  });

  it('lässt nicht endliche Distanzen niemals als Fang im Radius durch', () => {
    const faenger: Spieler = {
      id: 'a', spitzname: 'A', icon: 'circle', farbe: '#000000', rolle: 'seeker',
      bereit: false, online: true, energie: 0, ausserhalbZone: false, gefangen: false,
      faehigkeitenStatus: { tarnkappeAktiv: false, abklingzeiten: {} },
      position: { lat: Number.NaN, lng: 0, genauigkeit: 5, zeit: 1_800_000_000_000 }
    };
    const ziel: Spieler = {
      ...faenger, id: 'b', rolle: 'hider',
      position: { lat: 52.52, lng: 13.405, genauigkeit: 5, zeit: 1_800_000_000_000 }
    };

    expect(liegtImFangRadius(faenger, ziel, 25)).toBe(false);
    faenger.position = { lat: 52.52, lng: 13.405, genauigkeit: 5, zeit: 1_800_000_000_000 };
    expect(liegtImFangRadius(faenger, ziel, 25)).toBe(true);
  });

  it('leitet Rollen ausschließlich aus Modus und Hoststatus ab', () => {
    expect(rolleFuerSpieler('klassisch', true)).toBe('seeker');
    expect(rolleFuerSpieler('klassisch', false)).toBe('hider');
    expect(rolleFuerSpieler('zombie', true)).toBe('zombie');
    expect(rolleFuerSpieler('zombie', false)).toBe('mensch');
    expect(rolleFuerSpieler('mrx', true)).toBe('mrx');
    expect(rolleFuerSpieler('mrx', false)).toBe('detektiv');
  });
});
