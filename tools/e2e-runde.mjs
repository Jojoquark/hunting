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

const host = await post('/spiele');
const code = host.code;
const gast = await post(`/spiele/${code}/beitreten`);
console.log('Spielcode', code);

const h = verbinde(code, host, 'host');
const g = verbinde(code, gast, 'gast');
await Promise.all([h.offen, g.offen]);
h.senden('hallo', { spitzname: 'Jäger' });
g.senden('hallo', { spitzname: 'Versteck' });
await warte(300);

h.ws.send(JSON.stringify({ typ: 'ping', zeit: 12345 }));
await warte(200);
pruefe('ping beantwortet', h.pong?.zeit === 12345 && typeof h.pong?.daten?.serverZeit === 'number');

h.senden('host_setup', {
  modus: 'klassisch',
  einstellungen: { versteckZeitMinuten: 0, pingIntervallMinuten: 1, dauerMinuten: 5, faehigkeitenAktiv: true },
  zoneMittelpunkt: { lat: 52.52, lng: 13.405 },
  zonenRadiusStartMeter: 500, zonenStufen: 3, radiusFaktor: 0.6
});
await warte(200);
// Falsche Geräteuhr (+10 min) darf Positionen nicht verwerfen.
h.senden('ort', { lat: 52.5200, lng: 13.4050, genauigkeit: 5, zeit: Date.now() + 600000 });
g.senden('ort', { lat: 52.5230, lng: 13.4050, genauigkeit: 5, zeit: Date.now() });
await warte(300);
pruefe('Position trotz falscher Geräteuhr angenommen', !h.sonst.some((m) => m.typ === 'fehler'), JSON.stringify(h.sonst));

h.senden('host_start');
await warte(12000); // Alarm: verstecken (0 min) -> jagd
const hz = h.letzterZustand;
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

// Nähe-Warnung: Jäger 60 m an den Versteckten heran
h.senden('ort', { lat: 52.52245, lng: 13.4050, genauigkeit: 5, zeit: Date.now() });
g.senden('ort', { lat: 52.5230, lng: 13.4050, genauigkeit: 5, zeit: Date.now() });
await warte(400);
pruefe('Nähe-Warnung für Versteckten', g.letzterZustand?.naheGegner === true, g.letzterZustand?.naheGegner);

// Fangen: Jäger auf 10 m heran
await warte(1200);
h.senden('ort', { lat: 52.52291, lng: 13.4050, genauigkeit: 5, zeit: Date.now() });
await warte(400);
pruefe('Fangziel erkannt', h.letzterZustand?.fangZielId === gast.spielerId, h.letzterZustand?.fangZielId);
h.senden('fangen', { zielId: gast.spielerId });
await warte(400);
const ende = h.letzterZustand;
pruefe('Versteckter gefangen', ende?.spieler?.[gast.spielerId]?.gefangen === true);
pruefe('Spielende mit Sieger Jäger', ende?.phase === 'ende' && ende?.sieger === 'seeker', `${ende?.phase}/${ende?.sieger}`);

// Reconnect nach Fang: Rolle muss Zuschauer bleiben
g.ws.close();
await warte(300);
const g2 = verbinde(code, gast, 'gast2');
await g2.offen;
g2.senden('hallo', { spitzname: 'Versteck' });
await warte(400);
pruefe('Rolle bleibt nach Reconnect erhalten', g2.letzterZustand?.spieler?.[gast.spielerId]?.rolle === 'zuschauer', g2.letzterZustand?.spieler?.[gast.spielerId]?.rolle);

h.ws.close(); g2.ws.close();
const fehler = ergebnisse.filter((e) => !e.ok).length;
console.log(`\n${ergebnisse.length - fehler}/${ergebnisse.length} bestanden`);
process.exit(fehler ? 1 : 0);
