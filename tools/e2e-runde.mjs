// Spielt eine komplette Klassisch-Runde gegen den lokalen Worker. Start: `pnpm --filter @hunting/worker dev`, dann `node tools/e2e-runde.mjs`.
const BASIS = 'http://127.0.0.1:8787';
const WSB = 'ws://127.0.0.1:8787';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const ergebnisse = [];
const pruefe = (name, ok, info = '') => { ergebnisse.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };

async function post(pfad) {
  const r = await fetch(BASIS + pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) throw new Error(`${pfad} -> ${r.status} ${await r.text()}`);
  return r.json();
}

function verbinde(code, sitzung, name) {
  const ws = new WebSocket(`${WSB}/spiele/${code}/ws?spielerId=${sitzung.spielerId}&token=${sitzung.token}`);
  const c = { ws, letzterZustand: null, ereignisse: [], pong: null, sonst: [] };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.typ === 'zustand') c.letzterZustand = m.daten;
    else if (m.typ === 'ereignis') c.ereignisse.push(m.daten);
    else if (m.typ === 'pong') c.pong = m;
    else c.sonst.push(m);
  };
  c.senden = (typ, payload = {}) => ws.send(JSON.stringify({ typ, payload, zeit: Date.now() }));
  c.offen = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  c.name = name;
  return c;
}

// Testkonto für den Gast (zufälliger Name je Lauf, nur lokal)
const kontoName = `e2e_${Math.random().toString(36).slice(2, 8)}`;
const kontoRes = await fetch(`${BASIS}/konto/registrieren`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: kontoName, passwort: `pw-${Math.random().toString(36).slice(2)}` })
});
const konto = await kontoRes.json();

const host = await post('/spiele');
const code = host.code;
const gast = await post(`/spiele/${code}/beitreten`);
console.log('Spielcode', code);

const h = verbinde(code, host, 'host');
const g = verbinde(code, gast, 'gast');
await Promise.all([h.offen, g.offen]);
h.senden('hallo', { spitzname: 'Jäger' });
g.senden('hallo', { spitzname: 'Versteck', konto: { name: konto.name, token: konto.token } });
await warte(300);

// Teams: Host setzt den Gast zu den Jägern -> Gejagte leer -> Start muss abgelehnt werden
h.senden('host_team', { zielId: gast.spielerId, seite: 'faenger' });
await warte(300);
pruefe('Host kann Team wechseln', g.letzterZustand?.spieler?.[gast.spielerId]?.rolle === 'seeker');
h.senden('host_start');
await warte(300);
pruefe('Start ohne Gejagte abgelehnt', h.letzterZustand?.phase === 'lobby' && h.sonst.some((m) => m.typ === 'fehler' && /Teams/.test(m.nachricht)));
g.senden('host_team', { zielId: gast.spielerId, seite: 'gejagt' });
await warte(300);
pruefe('Nur Host darf Teams setzen', g.letzterZustand?.spieler?.[gast.spielerId]?.rolle === 'seeker');
h.senden('host_team', { zielId: gast.spielerId, seite: 'gejagt' });
await warte(300);
pruefe('Team zurückgesetzt', g.letzterZustand?.spieler?.[gast.spielerId]?.rolle === 'hider');
h.sonst.length = 0;

h.ws.send(JSON.stringify({ typ: 'ping', zeit: 12345 }));
await warte(200);
pruefe('ping beantwortet', h.pong?.zeit === 12345 && typeof h.pong?.daten?.serverZeit === 'number');

h.senden('host_setup', {
  modus: 'klassisch',
  einstellungen: { versteckZeitMinuten: 10, pingIntervallMinuten: 1, dauerMinuten: 5, faehigkeitenAktiv: true },
  zoneMittelpunkt: { lat: 52.52, lng: 13.405 },
  zonenRadiusStartMeter: 500, zonenStufen: 3, radiusFaktor: 0.6
});
await warte(200);
// Falsche Geräteuhr (+10 min) darf Positionen nicht verwerfen.
h.senden('ort', { lat: 52.5220, lng: 13.4050, genauigkeit: 5, zeit: Date.now() + 600000 });
g.senden('ort', { lat: 52.5230, lng: 13.4050, genauigkeit: 5, zeit: Date.now() });
await warte(300);
pruefe('Position trotz falscher Geräteuhr angenommen', !h.sonst.some((m) => m.typ === 'fehler'), JSON.stringify(h.sonst));

h.senden('host_start');
await warte(1500);
pruefe('Versteckphase läuft', h.letzterZustand?.phase === 'verstecken', h.letzterZustand?.phase);
pruefe('Abstimmung 0/1', g.letzterZustand?.versteckAbstimmung?.fertig === 0 && g.letzterZustand?.versteckAbstimmung?.gesamt === 1,
  JSON.stringify(g.letzterZustand?.versteckAbstimmung));
h.senden('versteckt', { fertig: true });
await warte(300);
pruefe('Jäger darf nicht abstimmen', h.letzterZustand?.phase === 'verstecken');
// Alle Verstecker fertig -> Jagd startet sofort statt nach 10 Min.
g.senden('versteckt', { fertig: true });
await warte(500);
const hz = h.letzterZustand;
pruefe('Nächste Zone bleibt geheim', hz && !('naechsteZone' in (hz.aktuelleZone ?? {})) && !('zonenPlan' in hz));
pruefe('Phase jagd erreicht', hz?.phase === 'jagd', hz?.phase);
const sichtAufGast = hz?.spieler?.[gast.spielerId]?.sicht?.art;
pruefe('Host/Jäger sieht Versteckten NICHT live', sichtAufGast !== 'live', sichtAufGast);
pruefe('Zonenstatus gesendet', typeof hz?.zonenStatus === 'string', hz?.zonenStatus);
pruefe('Energie gesendet', typeof hz?.energie === 'number', hz?.energie);
pruefe('Phasen-Ereignis gesendet', g.ereignisse.some((e) => e.typ === 'phase'));

// Fähigkeit mit korrektem Feldnamen
g.senden('faehigkeit', { faehigkeitId: 'radar' });
await warte(300);
const fa = g.sonst.find((m) => m.typ === 'faehigkeit_antwort');
pruefe('Fähigkeit vom Server erkannt', fa && fa.nachricht !== 'Unbekannte Fähigkeit', fa?.nachricht);

// Nähe-Warnung: Jäger 60 m an den Versteckten heran (gehend, sonst greift der Teleport-Schutz)
await warte(2000);
h.senden('ort', { lat: 52.52245, lng: 13.4050, genauigkeit: 5, zeit: Date.now() });
g.senden('ort', { lat: 52.5230, lng: 13.4050, genauigkeit: 5, zeit: Date.now() });
await warte(400);
pruefe('Nähe-Warnung für Versteckten', g.letzterZustand?.naheGegner === true, g.letzterZustand?.naheGegner);

// Fangen: Jäger auf 10 m heran
await warte(2000);
h.senden('ort', { lat: 52.52291, lng: 13.4050, genauigkeit: 5, zeit: Date.now() });
await warte(400);
pruefe('Fangziel erkannt', h.letzterZustand?.fangZielId === gast.spielerId, h.letzterZustand?.fangZielId);
h.senden('fangen', { zielId: gast.spielerId });
await warte(400);
const ende = h.letzterZustand;
pruefe('Versteckter gefangen', ende?.spieler?.[gast.spielerId]?.gefangen === true);
pruefe('Spielende mit Sieger Jäger', ende?.phase === 'ende' && ende?.sieger === 'seeker', `${ende?.phase}/${ende?.sieger}`);

// Auswertung im Endzustand
const auswertungJaeger = ende?.auswertung?.find((a) => a.id === host.spielerId);
const auswertungGast = ende?.auswertung?.find((a) => a.id === gast.spielerId);
pruefe('Auswertung: Jäger gewinnt mit 1 Fang', auswertungJaeger?.gewonnen === true && auswertungJaeger?.faenge === 1, JSON.stringify(auswertungJaeger));
pruefe('Auswertung: Strecke des Jägers gezählt', auswertungJaeger?.distanzMeter > 50, auswertungJaeger?.distanzMeter);
pruefe('Auswertung: Versteckter verliert, Zeit gemessen', auswertungGast?.gewonnen === false && typeof auswertungGast?.ueberlebtSekunden === 'number');

// Replay: nur mit gültigem Zugang, enthält Wege und den Fang
const ohneZugang = await fetch(`${BASIS}/spiele/${code}/replay`);
pruefe('Replay ohne Zugang abgelehnt', ohneZugang.status === 401, ohneZugang.status);
const replayRes = await fetch(`${BASIS}/spiele/${code}/replay`, {
  headers: { 'X-Spieler-ID': gast.spielerId, Authorization: `Bearer ${gast.token}` }
});
const replay = replayRes.ok ? await replayRes.json() : null;
pruefe('Replay liefert Wege beider Spieler', replay && replay.wege[host.spielerId]?.length >= 1 && replay.wege[gast.spielerId]?.length >= 1, replayRes.status);
pruefe('Replay enthält Fang und Phasen', replay?.ereignisse.some((e) => e.typ === 'fang') && replay?.ereignisse.some((e) => e.typ === 'phase' && e.daten.phase === 'ende'));

// Konto-Statistik des Gastes
await warte(300);
const statistikRes = await fetch(`${BASIS}/konto/statistik`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: konto.name, token: konto.token })
});
const statistik = statistikRes.ok ? await statistikRes.json() : null;
pruefe('Konto-Statistik zählt die Runde', statistik?.spiele === 1 && statistik?.siege === 0 && statistik?.letzte?.[0]?.spielCode === code, JSON.stringify(statistik)?.slice(0, 120));

// Reconnect nach Fang: Rolle muss Zuschauer bleiben
g.ws.close();
await warte(300);
const g2 = verbinde(code, gast, 'gast2');
await g2.offen;
g2.senden('hallo', { spitzname: 'Versteck' });
await warte(400);
pruefe('Rolle bleibt nach Reconnect erhalten', g2.letzterZustand?.spieler?.[gast.spielerId]?.rolle === 'zuschauer', g2.letzterZustand?.spieler?.[gast.spielerId]?.rolle);

h.ws.close(); g2.ws.close();

// Testmodus: allein starten, Bots füllen auf, Host springt per "Tipp" zum Bot und fängt ihn
const solo = await post('/spiele');
const s = verbinde(solo.code, solo, 'solo');
await s.offen;
s.senden('hallo', { spitzname: 'Solo' });
s.senden('host_setup', {
  modus: 'klassisch',
  einstellungen: { versteckZeitMinuten: 0, pingIntervallMinuten: 1, dauerMinuten: 10, testModus: true },
  zoneMittelpunkt: { lat: 52.52, lng: 13.405 }, zonenRadiusStartMeter: 500
});
s.senden('ort', { lat: 52.52, lng: 13.405, genauigkeit: 5, zeit: Date.now() });
await warte(300);
s.senden('host_start');
await warte(12000);
const sz = s.letzterZustand;
const bots = Object.values(sz?.spieler ?? {}).filter((sp) => sp.istBot);
pruefe('Testmodus: Solo-Start mit 3 Bots', sz?.phase === 'jagd' && bots.length === 3, `${sz?.phase} ${bots.length}`);
// Positionen der Bots sieht der Jäger nicht -> Fangtest über einen Bot, den der Server kennt: Host springt alle Bots ab
let gefangen = 0;
// Bots starten im Umkreis von 300 m: Raster mit 40 m Abstand absuchen (Fangradius 25 m + Genauigkeit)
const raster = [];
for (let runde = 0; runde < 3; runde++) for (let dy = -400; dy <= 400; dy += 40) for (let dx = -400; dx <= 400; dx += 40) raster.push([dy, dx]);
for (const [dy, dx] of raster) {
  if (gefangen) break;
  const lat = 52.52 + dy / 111320;
  const lng = 13.405 + dx / (111320 * Math.cos((52.52 * Math.PI) / 180));
  s.senden('ort', { lat, lng, genauigkeit: 5, zeit: Date.now() });
  await warte(95); // unter dem Server-Limit von 120 Nachrichten pro 10 s bleiben
  const ziel = s.letzterZustand?.fangZielId;
  if (ziel) {
    s.senden('fangen', { zielId: ziel });
    await warte(300);
    if (s.letzterZustand?.spieler?.[ziel]?.gefangen) gefangen++;
  }
}
pruefe('Testmodus: Sprünge erlaubt, Bot fangbar', gefangen === 1);
s.ws.close();
const fehler = ergebnisse.filter((e) => !e.ok).length;
console.log(`\n${ergebnisse.length - fehler}/${ergebnisse.length} bestanden`);
process.exit(fehler ? 1 : 0);
