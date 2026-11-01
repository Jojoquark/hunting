import { SimulationsEngine, SimulationsKonfiguration } from './engine.js';
import { Modus } from './types.js';

function parseArgs(): SimulationsKonfiguration {
  const args = process.argv.slice(2);
  let modus: Modus = 'klassisch';
  let speed = 10;
  let hiders = 5;
  let seekers = 1;
  let server = 'ws://localhost:8787';
  let duration = 300;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      modus = args[++i] as Modus;
    } else if (args[i] === '--speed' && args[i + 1]) {
      speed = parseFloat(args[++i]);
    } else if (args[i] === '--hiders' && args[i + 1]) {
      hiders = parseInt(args[++i], 10);
    } else if (args[i] === '--seekers' && args[i + 1]) {
      seekers = parseInt(args[++i], 10);
    } else if (args[i] === '--server' && args[i + 1]) {
      server = args[++i];
    } else if (args[i] === '--duration' && args[i + 1]) {
      duration = parseInt(args[++i], 10);
    }
  }

  return {
    serverUrl: server,
    modus,
    anzahlHider: hiders,
    anzahlSeeker: seekers,
    zentrum: { lat: 52.520008, lng: 13.404954 },
    zonenRadiusMeter: 1000,
    zeitRaffer: speed,
    maxDauerSekunden: duration
  };
}

async function main() {
  const config = parseArgs();
  console.log('========================================');
  console.log(' HUNTING – Headless Bot-Simulator');
  console.log(` Modus: ${config.modus.toUpperCase()} | Speed: ${config.zeitRaffer}x`);
  console.log(` Server: ${config.serverUrl}`);
  console.log(` Hiders: ${config.anzahlHider} | Seekers: ${config.anzahlSeeker}`);
  console.log('========================================\n');

  const engine = new SimulationsEngine(config);
  console.log('[1/3] Initialisiere Spielraum...');
  const code = await engine.initialisiereSpiel();
  console.log(`✓ Spielcode erstellt: ${code}`);

  console.log('[2/3] Verbinde Bots und erstelle GPS-Routen...');
  await engine.richteBotsEin();
  console.log('✓ Alle Bots aktiv im WebSocket');

  console.log('[3/3] Starte Jagdsimulation...');
  const ergebnis = await engine.starteSimulation();

  console.log('\n================ SIMULATIONSERGEBNIS ================');
  console.log(`Sieger:             ${ergebnis.sieger.toUpperCase()}`);
  console.log(`Simulierte Zeit:    ${Math.round(ergebnis.spieldauerSekunden)} Sekunden`);
  console.log(`Gefangen:           ${ergebnis.gefangeneAnzahl}`);
  console.log(`Ueberlebende:       ${ergebnis.ueberlebendeAnzahl}`);
  console.log('----------------------------------------------------');
  for (const f of ergebnis.faengeChronologisch) {
    console.log(` + T+${f.zeitSekunde}s: ${f.opferName} wurde gefangen!`);
  }
  console.log('====================================================\n');
}

main().catch(console.error);
