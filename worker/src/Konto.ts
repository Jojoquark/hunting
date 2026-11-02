import { hasheZugangstoken, vergleicheKonstant } from './sicherheit';

/**
 * Einfaches Konto mit Benutzername und Passwort (ohne E-Mail).
 * Ein Durable Object pro Benutzername; Passwort als PBKDF2-SHA-256 mit Salt,
 * Sitzungstokens nur als SHA-256-Hash gespeichert.
 */

export const PBKDF2_RUNDEN = 100_000;
const SITZUNG_GUELTIG_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_FEHLVERSUCHE = 5;
const SPERRFENSTER_MS = 15 * 60 * 1000;

export function normalisiereName(name: string): string {
  return name.trim().toLowerCase();
}

export function pruefeName(name: unknown): string | null {
  if (typeof name !== 'string') return 'Benutzername fehlt';
  const sauber = name.trim();
  if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(sauber)) {
    return 'Benutzername: 3–20 Zeichen, nur Buchstaben, Zahlen, _ und -';
  }
  return null;
}

export function pruefePasswort(passwort: unknown): string | null {
  if (typeof passwort !== 'string') return 'Passwort fehlt';
  if (passwort.length < 8) return 'Passwort: mindestens 8 Zeichen';
  if (passwort.length > 128) return 'Passwort: höchstens 128 Zeichen';
  return null;
}

const zuHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const vonHex = (hex: string) => new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));

export async function hashePasswort(passwort: string, saltHex: string, runden = PBKDF2_RUNDEN): Promise<string> {
  const schluessel = await crypto.subtle.importKey('raw', new TextEncoder().encode(passwort), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: vonHex(saltHex), iterations: runden },
    schluessel,
    256
  );
  return zuHex(new Uint8Array(bits));
}

export function erzeugeZufallHex(bytes: number): string {
  return zuHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export class Konto {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS konto (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        anzeigename TEXT NOT NULL,
        salt TEXT NOT NULL,
        passwort_hash TEXT NOT NULL,
        runden INTEGER NOT NULL,
        erstellt_um INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sitzungen (
        token_hash TEXT PRIMARY KEY,
        ablauf INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fehlversuche (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        start INTEGER NOT NULL,
        anzahl INTEGER NOT NULL
      );
    `);
  }

  private konto(): { anzeigename: string; salt: string; passwort_hash: string; runden: number } | null {
    const row = this.state.storage.sql.exec(`SELECT anzeigename, salt, passwort_hash, runden FROM konto WHERE id = 1`).toArray()[0];
    return row ? (row as unknown as { anzeigename: string; salt: string; passwort_hash: string; runden: number }) : null;
  }

  private async neueSitzung(): Promise<string> {
    const token = erzeugeZufallHex(32);
    const jetzt = Date.now();
    this.state.storage.sql.exec(`DELETE FROM sitzungen WHERE ablauf < ?`, jetzt);
    this.state.storage.sql.exec(
      `INSERT INTO sitzungen (token_hash, ablauf) VALUES (?, ?)`,
      await hasheZugangstoken(token),
      jetzt + SITZUNG_GUELTIG_MS
    );
    return token;
  }

  private gesperrtBis(): number {
    const row = this.state.storage.sql.exec(`SELECT start, anzahl FROM fehlversuche WHERE id = 1`).toArray()[0];
    if (!row || Date.now() - Number(row.start) > SPERRFENSTER_MS) return 0;
    return Number(row.anzahl) >= MAX_FEHLVERSUCHE ? Number(row.start) + SPERRFENSTER_MS : 0;
  }

  private merkeFehlversuch(): void {
    const jetzt = Date.now();
    const row = this.state.storage.sql.exec(`SELECT start FROM fehlversuche WHERE id = 1`).toArray()[0];
    if (!row || jetzt - Number(row.start) > SPERRFENSTER_MS) {
      this.state.storage.sql.exec(`INSERT OR REPLACE INTO fehlversuche (id, start, anzahl) VALUES (1, ?, 1)`, jetzt);
    } else {
      this.state.storage.sql.exec(`UPDATE fehlversuche SET anzahl = anzahl + 1 WHERE id = 1`);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = request.method === 'POST'
      ? await request.json().catch(() => ({})) as { name?: string; passwort?: string; token?: string }
      : {};

    if (url.pathname === '/registrieren') {
      if (this.konto()) return new Response('Benutzername ist schon vergeben', { status: 409 });
      const salt = erzeugeZufallHex(16);
      const hash = await hashePasswort(body.passwort ?? '', salt);
      this.state.storage.sql.exec(
        `INSERT INTO konto (id, anzeigename, salt, passwort_hash, runden, erstellt_um) VALUES (1, ?, ?, ?, ?, ?)`,
        (body.name ?? '').trim(), salt, hash, PBKDF2_RUNDEN, Date.now()
      );
      return Response.json({ name: (body.name ?? '').trim(), token: await this.neueSitzung() }, { status: 201 });
    }

    if (url.pathname === '/anmelden') {
      const konto = this.konto();
      const gesperrt = this.gesperrtBis();
      if (gesperrt) {
        return new Response('Zu viele Fehlversuche. Bitte später erneut versuchen.', {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((gesperrt - Date.now()) / 1000)) }
        });
      }
      // Auch bei unbekanntem Namen hashen, damit die Antwortzeit nichts verrät.
      const hash = await hashePasswort(body.passwort ?? '', konto?.salt ?? '00'.repeat(16), konto?.runden ?? PBKDF2_RUNDEN);
      if (!konto || !vergleicheKonstant(hash, konto.passwort_hash)) {
        if (konto) this.merkeFehlversuch();
        return new Response('Benutzername oder Passwort falsch', { status: 401 });
      }
      this.state.storage.sql.exec(`DELETE FROM fehlversuche`);
      return Response.json({ name: konto.anzeigename, token: await this.neueSitzung() });
    }

    if (url.pathname === '/pruefen' || url.pathname === '/abmelden') {
      const konto = this.konto();
      const token = typeof body.token === 'string' && /^[a-f0-9]{64}$/.test(body.token) ? body.token : '';
      if (!konto || !token) return new Response('Nicht angemeldet', { status: 401 });
      const tokenHash = await hasheZugangstoken(token);
      const row = this.state.storage.sql.exec(`SELECT ablauf FROM sitzungen WHERE token_hash = ?`, tokenHash).toArray()[0];
      if (!row || Number(row.ablauf) < Date.now()) return new Response('Sitzung abgelaufen', { status: 401 });
      if (url.pathname === '/abmelden') {
        this.state.storage.sql.exec(`DELETE FROM sitzungen WHERE token_hash = ?`, tokenHash);
        return new Response(null, { status: 204 });
      }
      return Response.json({ name: konto.anzeigename });
    }

    return new Response('Nicht gefunden', { status: 404 });
  }
}
