import { describe, it, expect } from 'vitest';
import { sichtbarFuer } from '../src/sichtbarkeit';
import { Spieler, SpielZustand } from '../src/types';

describe('Sichtbarkeitsfilter Matrix-Tests', () => {
  const erstelleSpieler = (id: string, rolle: any, lat = 52.52, lng = 13.4): Spieler => ({
    id,
    spitzname: id,
    icon: 'circle',
    farbe: '#ffffff',
    rolle,
    bereit: true,
    online: true,
    energie: 100,
    position: { lat, lng, genauigkeit: 5, zeit: Date.now() },
    ausserhalbZone: false,
    gefangen: false,
    faehigkeitenStatus: { tarnkappeAktiv: false, abklingzeiten: {} }
  });

  const erstelleZustand = (modus: any = 'klassisch'): SpielZustand => ({
    code: 'TEST',
    hostId: 'h1',
    phase: 'jagd',
    modus,
    einstellungen: {
      dauerMinuten: 60,
      versteckZeitMinuten: 5,
      pingIntervallMinuten: 5,
      zonenRadiusStartMeter: 1000,
      zonenStufen: 3,
      radiusFaktor: 0.65,
      fangRadiusMeter: 25,
      autoBestaetigungSekunden: 15,
      kulanzZeitZoneSekunden: 60,
      naeheWarnungAktiv: true,
      naeheWarnungRadiusMeter: 100,
      funklochStrafeAktiv: true,
      faehigkeitenAktiv: true,
      faehigkeitenSchalter: {},
      mrxAufdeckRegel: 'tickets',
      mrxAufdeckTicketIntervall: 3,
      mrxAufdeckDistanzMeter: 2000,
      mrxAufdeckZeitMinuten: 15,
      mrxSiehtDetektive: true
    },
    spieler: {},
    aktuelleZone: { mittelpunkt: { lat: 52.52, lng: 13.4 }, radiusMeter: 1000, stufe: 0 },
    lootPunkte: [],
    phasenStartZeit: Date.now(),
    naechsterPingZeit: Date.now() + 300000,
    jetzt: Date.now()
  });

  it('Hider ist für Seeker vor Ping unsichtbar', () => {
    const seeker = erstelleSpieler('s1', 'seeker');
    const hider = erstelleSpieler('h1', 'hider');
    const zustand = erstelleZustand('klassisch');

    const res = sichtbarFuer(seeker, hider, zustand);
    expect(res.art).toBe('unsichtbar');
  });

  it('Hider außerhalb der Zone ist sofort live sichtbar', () => {
    const seeker = erstelleSpieler('s1', 'seeker');
    const hider = erstelleSpieler('h1', 'hider');
    hider.ausserhalbZone = true;
    const zustand = erstelleZustand('klassisch');

    const res = sichtbarFuer(seeker, hider, zustand);
    expect(res.art).toBe('live');
  });

  it('Zombies sind für Menschen immer 50m unscharf sichtbar', () => {
    const mensch = erstelleSpieler('m1', 'mensch');
    const zombie = erstelleSpieler('z1', 'zombie');
    const zustand = erstelleZustand('zombie');

    const res = sichtbarFuer(mensch, zombie, zustand);
    expect(res.art).toBe('unscharf');
  });

  it('Tarnkappe unterdrückt den Ping eines Hiders', () => {
    const seeker = erstelleSpieler('s1', 'seeker');
    const hider = erstelleSpieler('h1', 'hider');
    hider.letzterPingPosition = { lat: 52.52, lng: 13.4 };
    hider.letzterPingZeit = Date.now();
    hider.faehigkeitenStatus.tarnkappeAktiv = true;
    const zustand = erstelleZustand('klassisch');

    const res = sichtbarFuer(seeker, hider, zustand);
    expect(res.art).toBe('unsichtbar');
  });
});
