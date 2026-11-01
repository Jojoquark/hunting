import { HeadlessBot } from './bot.js';
import { Koordinate, Modus } from './types.js';

export interface SimulationsKonfiguration {
  serverUrl: string;
  modus: Modus;
  anzahlHider: number;
  anzahlSeeker: number;
  zentrum: Koordinate;
  zonenRadiusMeter: number;
  zeitRaffer: number;
  maxDauerSekunden: number;
}

export interface SimulationsErgebnis {
  modus: Modus;
  spieldauerSekunden: number;
  gefangeneAnzahl: number;
  ueberlebendeAnzahl: number;
  faengeChronologisch: Array<{ zeitSekunde: number; opferId: string; opferName: string }>;
  sieger: 'seeker' | 'hider' | 'zombie' | 'mrx';
}

export class SimulationsEngine {
  private config: SimulationsKonfiguration;
  private bots: HeadlessBot[] = [];
  private spielCode = '';

  constructor(config: SimulationsKonfiguration) {
    this.config = config;
  }

  public async initialisiereSpiel(): Promise<string> {
    const httpUrl = this.config.serverUrl.replace(/^ws/, 'http');
    try {
      const res = await fetch(`${httpUrl}/spiele`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modus: this.config.modus })
      });
      if (res.ok) {
        const body = (await res.json()) as { code: string };
        this.spielCode = body.code;
        return this.spielCode;
      }
    } catch {}
    this.spielCode = 'TEST99';
    return this.spielCode;
  }

  public async richteBotsEin(): Promise<void> {
    const wsUrl = `${this.config.serverUrl}/spiele/${this.spielCode}/ws`;

    if (this.config.modus === 'mrx') {
      const mrxBot = new HeadlessBot(wsUrl, {
        id: 'bot_mrx',
        spitzname: 'Mr. X (Bot)',
        rolle: 'mrx',
        startPosition: { ...this.config.zentrum }
      });
      this.bots.push(mrxBot);

      for (let i = 1; i <= this.config.anzahlSeeker; i++) {
        const startPos = {
          lat: this.config.zentrum.lat + 0.002 * i,
          lng: this.config.zentrum.lng + 0.002 * i
        };
        const detektivBot = new HeadlessBot(wsUrl, {
          id: `bot_detektiv_${i}`,
          spitzname: `Detektiv ${i}`,
          rolle: 'detektiv',
          startPosition: startPos
        });
        this.bots.push(detektivBot);
      }
    } else {
      const hostSeeker = new HeadlessBot(wsUrl, {
        id: 'bot_seeker_1',
        spitzname: 'Seeker Chef',
        rolle: this.config.modus === 'zombie' ? 'zombie' : 'seeker',
        startPosition: { ...this.config.zentrum }
      });
      this.bots.push(hostSeeker);

      for (let i = 1; i <= this.config.anzahlHider; i++) {
        const offsetLat = (Math.random() - 0.5) * 0.004;
        const offsetLng = (Math.random() - 0.5) * 0.004;
        const hiderBot = new HeadlessBot(wsUrl, {
          id: `bot_hider_${i}`,
          spitzname: `Hider ${i}`,
          rolle: 'hider',
          startPosition: {
            lat: this.config.zentrum.lat + offsetLat,
            lng: this.config.zentrum.lng + offsetLng
          }
        });
        this.bots.push(hiderBot);
      }
    }

    for (const bot of this.bots) {
      await bot.verbinden();
    }
  }

  public async starteSimulation(): Promise<SimulationsErgebnis> {
    const hostBot = this.bots[0];
    hostBot.sende({
      typ: 'host',
      aktion: 'start'
    });

    for (const bot of this.bots) {
      bot.starteBewegung(1000, this.config.zeitRaffer);
    }

    const faenge: Array<{ zeitSekunde: number; opferId: string; opferName: string }> = [];
    const startZeit = Date.now();
    let simSekunden = 0;

    return new Promise((resolve) => {
      const checkIntervall = setInterval(() => {
        simSekunden += 1 * this.config.zeitRaffer;

        const gejagte = this.bots.filter(
          (b) => b.rolle === 'hider' || b.rolle === 'mrx'
        );
        const alleGefangen = gejagte.every((b) => b.gefangen);

        for (const g of gejagte) {
          if (g.gefangen && !faenge.some((f) => f.opferId === g.id)) {
            faenge.push({
              zeitSekunde: simSekunden,
              opferId: g.id,
              opferName: g.spitzname
            });
          }
        }

        if (alleGefangen || simSekunden >= this.config.maxDauerSekunden) {
          clearInterval(checkIntervall);
          for (const bot of this.bots) {
            bot.trennen();
          }

          let sieger: 'seeker' | 'hider' | 'zombie' | 'mrx';
          if (this.config.modus === 'zombie') {
            sieger = alleGefangen ? 'zombie' : 'hider';
          } else if (this.config.modus === 'mrx') {
            sieger = alleGefangen ? 'seeker' : 'mrx';
          } else {
            sieger = alleGefangen ? 'seeker' : 'hider';
          }

          resolve({
            modus: this.config.modus,
            spieldauerSekunden: simSekunden,
            gefangeneAnzahl: faenge.length,
            ueberlebendeAnzahl: gejagte.length - faenge.length,
            faengeChronologisch: faenge,
            sieger
          });
        }
      }, 1000 / this.config.zeitRaffer);
    });
  }
}
