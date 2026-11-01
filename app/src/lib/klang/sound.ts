/**
 * HUNTING - WebAudio Sound-Synthesizer & Haptik
 * Rein synthetische Soundeffekte ohne externe Mediendateien (Radar-Pings, Fang-Alarm,
 * Zonenwarnung, Ticket-Gong, Ability-Trigger) plus navigator.vibrate Haptik.
 */

export class KlangZentrale {
  private ctx: AudioContext | null = null;
  public stumm: boolean = false;
  public haptikAktiv: boolean = true;

  constructor() {}

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  /**
   * Haptisches Vibrationsmuster (Android & Fallback)
   */
  public vibriere(muster: number | number[]): void {
    if (!this.haptikAktiv || typeof window === 'undefined') return;
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(muster);
      } catch (e) {}
    }
  }

  /**
   * 1. Radar-Ping: Hochtechnischer doppelter Resonanz-Chirp (Radar-Puls)
   */
  public radarPing(): void {
    this.vibriere([40, 30, 40]);
    if (this.stumm) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    // Schneller Frequenz-Sweep nach oben mit weichem Ausklang
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1760, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.6);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, t);
    filter.Q.setValueAtTime(5, t);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.85);
  }

  /**
   * 2. Fang-Alarm: Dissonanter, dramatischer Staccato-Tritonus-Alarm
   */
  public fangAlarm(): void {
    this.vibriere([120, 60, 120, 60, 300]);
    if (this.stumm) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    const jetzt = ctx.currentTime;
    const impulse = [0, 0.15, 0.3, 0.45];

    impulse.forEach((offset, idx) => {
      const t = jetzt + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = idx % 2 === 0 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(idx % 2 === 0 ? 587.33 : 830.61, t); // D5 und G#5 (Tritonus)

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.13);
    });
  }

  /**
   * 3. Zonenwarnung: Düsterer, modulierter Subbass-Puls bei Verlassen der Zone
   */
  public zonenWarnung(): void {
    this.vibriere([200, 100, 200, 100, 450]);
    if (this.stumm) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t); // A2 Bass

    // LFO für bedrohliche Tonhöhen-Schwankung
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(8, t); // 8 Hz Pulsieren
    lfoGain.gain.setValueAtTime(25, t);

    lfo.connect(osc.frequency);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.9);

    osc.connect(gain);
    gain.connect(ctx.destination);

    lfo.start(t);
    osc.start(t);
    lfo.stop(t + 0.95);
    osc.stop(t + 0.95);
  }

  /**
   * 4. Ticket-Gong: Harmonischer 2-Ton Bahnhofs-Chime (E5 -> C5)
   */
  public ticketGong(): void {
    this.vibriere([50, 70, 50]);
    if (this.stumm) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    const toene = [
      { f: 659.25, start: 0, dauer: 0.5 }, // E5
      { f: 523.25, start: 0.28, dauer: 0.7 }, // C5
    ];

    const t = ctx.currentTime;
    toene.forEach((ton) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(ton.f, t + ton.start);

      gain.gain.setValueAtTime(0, t + ton.start);
      gain.gain.linearRampToValueAtTime(0.4, t + ton.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + ton.start + ton.dauer);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t + ton.start);
      osc.stop(t + ton.start + ton.dauer);
    });
  }

  /**
   * 5. Ability-Trigger: Zukunftsweisender energetischer Cyber-Powerup
   */
  public abilityTrigger(): void {
    this.vibriere([40, 20, 80]);
    if (this.stumm) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.35);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
    filter.Q.setValueAtTime(4, t);

    gain.gain.setValueAtTime(0.05, t);
    gain.gain.linearRampToValueAtTime(0.45, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.48);
  }

  /**
   * 6. Klick: Taktiles Mikro-Feedback für Knöpfe
   */
  public klick(): void {
    this.vibriere(15);
    if (this.stumm) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.03);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.04);
  }
}

export const klang = new KlangZentrale();
