export interface NetzwerkKonfiguration {
  backendHttpUrl: string;
  backendWsUrl: string;
  istLokal: boolean;
  istGitHubPages: boolean;
  quelle: 'umgebung' | 'speicher' | 'localhost' | 'produktion';
}

const SPEICHER_SCHLUESSEL_CUSTOM_BACKEND = 'hunting_custom_backend';
const STANDARD_PRODUKTION_HTTP = 'https://hunting-server.johann-koenig.workers.dev';
const STANDARD_PRODUKTION_WS = 'wss://hunting-server.johann-koenig.workers.dev/ws';
const STANDARD_LOKAL_HTTP = 'http://localhost:8787';
const STANDARD_LOKAL_WS = 'ws://localhost:8787/ws';

export function istLokalhost(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local');
}

export function istGitHubPages(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.location.hostname.endsWith('github.io');
}

export function leseBenutzerdefinierteUrl(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    return window.localStorage.getItem(SPEICHER_SCHLUESSEL_CUSTOM_BACKEND);
  } catch {
    return null;
  }
}

export function setzeBenutzerdefinierteUrl(url: string | null): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    if (url && url.trim().length > 0) {
      window.localStorage.setItem(SPEICHER_SCHLUESSEL_CUSTOM_BACKEND, url.trim());
    } else {
      window.localStorage.removeItem(SPEICHER_SCHLUESSEL_CUSTOM_BACKEND);
    }
  } catch {
    return;
  }
}

function ermittleUmgebungsWsUrl(): string | null {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
    if (metaEnv?.VITE_WS_URL) {
      return metaEnv.VITE_WS_URL;
    }
  } catch {
    return null;
  }
  return null;
}

export function ermittleBasisWsUrl(): string {
  const envUrl = ermittleUmgebungsWsUrl();
  if (envUrl && envUrl.trim().length > 0) {
    return normalisiereWsUrl(envUrl.trim());
  }

  const benutzerUrl = leseBenutzerdefinierteUrl();
  if (benutzerUrl && benutzerUrl.trim().length > 0) {
    return normalisiereWsUrl(benutzerUrl.trim());
  }

  if (istLokalhost()) {
    return STANDARD_LOKAL_WS;
  }

  return STANDARD_PRODUKTION_WS;
}

export function ermittleBasisHttpUrl(): string {
  const wsUrl = ermittleBasisWsUrl();
  return konvertiereWsZuHttp(wsUrl);
}

export function baueSpielWsUrl(spielCode: string, spielerId: string, token: string = ''): string {
  const basisWs = ermittleBasisWsUrl();
  const urlObj = new URL(basisWs);
  const bereinigterPfad = urlObj.pathname.replace(/\/ws\/?$/, '').replace(/\/$/, '');
  const zielPfad = `${bereinigterPfad}/spiele/${encodeURIComponent(spielCode.toUpperCase())}/ws`;

  urlObj.pathname = zielPfad;
  urlObj.searchParams.set('spielerId', spielerId);
  if (token) {
    urlObj.searchParams.set('token', token);
  }

  return urlObj.toString();
}

export function holeNetzwerkKonfiguration(): NetzwerkKonfiguration {
  const envUrl = ermittleUmgebungsWsUrl();
  const benutzerUrl = leseBenutzerdefinierteUrl();
  const istLokal = istLokalhost();
  const istGhPages = istGitHubPages();

  let quelle: NetzwerkKonfiguration['quelle'] = 'produktion';
  if (envUrl) {
    quelle = 'umgebung';
  } else if (benutzerUrl) {
    quelle = 'speicher';
  } else if (istLokal) {
    quelle = 'localhost';
  }

  const wsUrl = ermittleBasisWsUrl();
  const httpUrl = konvertiereWsZuHttp(wsUrl);

  return {
    backendHttpUrl: httpUrl,
    backendWsUrl: wsUrl,
    istLokal,
    istGitHubPages: istGhPages,
    quelle
  };
}

function normalisiereWsUrl(roheUrl: string): string {
  if (roheUrl.startsWith('http://')) {
    return 'ws://' + roheUrl.slice(7);
  }
  if (roheUrl.startsWith('https://')) {
    return 'wss://' + roheUrl.slice(8);
  }
  if (!roheUrl.startsWith('ws://') && !roheUrl.startsWith('wss://')) {
    return 'wss://' + roheUrl;
  }
  return roheUrl;
}

function konvertiereWsZuHttp(wsUrl: string): string {
  const urlObj = new URL(wsUrl);
  const protokoll = urlObj.protocol === 'ws:' ? 'http:' : 'https:';
  const bereinigterPfad = urlObj.pathname.replace(/\/ws\/?$/, '');
  return `${protokoll}//${urlObj.host}${bereinigterPfad}`;
}
