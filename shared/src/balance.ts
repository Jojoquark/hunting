/**
 * Prüft, ob Ping-Intervall, Vorsprung, Spieldauer und Zonenstufen zur Zonengröße passen.
 *
 * Faustregel: Ein Versteckter geht rund 84 m pro Minute (5 km/h).
 * - Zwischen zwei Pings darf er höchstens etwa einen Zonenradius zurücklegen, sonst ist der Ping wertlos.
 * - Legt er weniger als 15 % des Radius zurück, ist der Ping fast eine Live-Ortung.
 * - Der Vorsprung muss reichen, um mindestens 30 % des Radius vom Start wegzukommen.
 * - Zwischen zwei Zonenstufen soll mindestens ein Ping liegen.
 * - Teams: im Klassik-Modus etwa ein Jäger auf drei Versteckte und einer je angefangene 1,5 km Radius;
 *   im Zombie-Modus ein Start-Zombie auf fünf Menschen; bei Mr. X mindestens zwei Detektive je Mr. X.
 */

export const GEHTEMPO_METER_PRO_MINUTE = 84;

export interface BalanceEingabe {
  zonenRadiusMeter: number;
  pingIntervallMinuten: number;
  versteckZeitMinuten: number;
  dauerMinuten: number;
  zonenStufen: number;
  modus?: 'klassisch' | 'zombie' | 'mrx';
  /** Spieler auf der fangenden Seite (Jäger, Zombies, Detektive) */
  faenger?: number;
  /** Spieler auf der gejagten Seite (Versteckte, Menschen, Mr. X) */
  gejagt?: number;
}

export type BalanceProblemArt =
  | 'ping_zu_selten'
  | 'ping_zu_haeufig'
  | 'vorsprung_zu_kurz'
  | 'vorsprung_zu_lang'
  | 'stufen_zu_dicht'
  | 'team_leer'
  | 'zu_wenige_faenger'
  | 'zu_viele_faenger';

export interface BalanceProblem {
  art: BalanceProblemArt;
  text: string;
}

export interface BalanceErgebnis {
  probleme: BalanceProblem[];
  empfehlung: Pick<BalanceEingabe, 'pingIntervallMinuten' | 'versteckZeitMinuten' | 'dauerMinuten'>;
  pingBereich: [number, number];
  versteckBereich: [number, number];
  /** Empfohlene Anzahl Fänger für die aktuelle Spielerzahl, sofern Teams angegeben sind */
  empfohleneFaenger?: number;
}

export function empfohleneFaengerAnzahl(modus: BalanceEingabe['modus'], gesamt: number, zonenRadiusMeter: number): number {
  if (gesamt < 2) return 1;
  let anzahl: number;
  if (modus === 'mrx') anzahl = gesamt - Math.max(1, Math.floor(gesamt / 7));
  else if (modus === 'zombie') anzahl = Math.max(1, Math.round(gesamt / 6));
  else anzahl = Math.max(1, Math.ceil(gesamt / 4), Math.ceil(zonenRadiusMeter / 1500));
  return begrenze(anzahl, 1, gesamt - 1);
}

const begrenze = (wert: number, min: number, max: number) => Math.min(max, Math.max(min, wert));

export function pruefeBalance(e: BalanceEingabe): BalanceErgebnis {
  const radiusInGehminuten = e.zonenRadiusMeter / GEHTEMPO_METER_PRO_MINUTE;

  const pingBereich: [number, number] = [
    begrenze(Math.ceil(radiusInGehminuten * 0.15), 1, 30),
    begrenze(Math.floor(radiusInGehminuten), 1, 30)
  ];
  const versteckBereich: [number, number] = [
    begrenze(Math.ceil(radiusInGehminuten * 0.3), 1, 30),
    begrenze(Math.floor(radiusInGehminuten * 2), 1, 30)
  ];

  let empfohlenerPing = begrenze(Math.round(radiusInGehminuten * 0.5), pingBereich[0], pingBereich[1]);
  const empfohlenerVorsprung = begrenze(Math.round(radiusInGehminuten * 0.8), versteckBereich[0], versteckBereich[1]);
  // Mindestens ein Ping pro Zonenstufe, gerundet auf 5 Minuten.
  const mindestDauer = Math.max(10, empfohlenerPing * (e.zonenStufen + 1));
  const empfohleneDauer = begrenze(Math.max(e.dauerMinuten, Math.ceil(mindestDauer / 5) * 5), 10, 240);
  // Ist die Dauer gedeckelt, muss stattdessen der Ping häufiger kommen.
  if (e.zonenStufen > 0) {
    empfohlenerPing = Math.max(pingBereich[0], Math.min(empfohlenerPing, Math.floor(empfohleneDauer / (e.zonenStufen + 1))));
  }

  const probleme: BalanceProblem[] = [];
  const meterZwischenPings = Math.round(e.pingIntervallMinuten * GEHTEMPO_METER_PRO_MINUTE);

  if (e.pingIntervallMinuten > pingBereich[1]) {
    probleme.push({
      art: 'ping_zu_selten',
      text: `Zwischen zwei Pings schafft man zu Fuß rund ${meterZwischenPings} m – mehr als der Zonenradius. Die Jäger tappen im Dunkeln.`
    });
  } else if (e.pingIntervallMinuten < pingBereich[0]) {
    probleme.push({
      art: 'ping_zu_haeufig',
      text: `Pings alle ${e.pingIntervallMinuten} Min. sind für diese Zone fast eine Live-Ortung. Verstecken lohnt sich kaum.`
    });
  }

  if (e.versteckZeitMinuten < versteckBereich[0]) {
    probleme.push({
      art: 'vorsprung_zu_kurz',
      text: `Mit ${e.versteckZeitMinuten} Min. Vorsprung kommt man kaum vom Start weg.`
    });
  } else if (e.versteckZeitMinuten > versteckBereich[1]) {
    probleme.push({
      art: 'vorsprung_zu_lang',
      text: `${e.versteckZeitMinuten} Min. Vorsprung reichen, um die Zone mehrfach zu durchqueren. Die Jäger warten unnötig lange.`
    });
  }

  if (e.zonenStufen > 0 && e.dauerMinuten / (e.zonenStufen + 1) < e.pingIntervallMinuten) {
    probleme.push({
      art: 'stufen_zu_dicht',
      text: `Die Zone schrumpft öfter, als gepingt wird. Weniger Stufen oder eine längere Spieldauer wählen.`
    });
  }

  let empfohleneFaenger: number | undefined;
  if (e.faenger !== undefined && e.gejagt !== undefined) {
    const gesamt = e.faenger + e.gejagt;
    empfohleneFaenger = empfohleneFaengerAnzahl(e.modus, gesamt, e.zonenRadiusMeter);
    const fName = e.modus === 'zombie' ? 'Zombies' : e.modus === 'mrx' ? 'Detektive' : 'Jäger';
    const gName = e.modus === 'zombie' ? 'Menschen' : e.modus === 'mrx' ? 'Mr. X' : 'Versteckte';
    if (gesamt >= 2 && (e.faenger === 0 || e.gejagt === 0)) {
      probleme.push({ art: 'team_leer', text: `Beide Teams brauchen mindestens einen Spieler.` });
    } else if (gesamt >= 3) {
      const zuWenige = e.modus === 'mrx' ? e.faenger < 2 * e.gejagt : e.faenger < empfohleneFaenger;
      const zuViele = e.modus === 'mrx' ? e.gejagt > 2 : e.faenger > Math.max(empfohleneFaenger + 1, Math.ceil(gesamt / 2));
      if (zuWenige) {
        probleme.push({
          art: 'zu_wenige_faenger',
          text: `${e.faenger} ${fName} gegen ${e.gejagt} ${gName} ist zu unausgeglichen. Empfohlen: ${empfohleneFaenger} ${fName}.`
        });
      } else if (zuViele) {
        probleme.push({
          art: 'zu_viele_faenger',
          text: `${e.faenger} ${fName} gegen ${e.gejagt} ${gName}: Die Runde ist schnell vorbei. Empfohlen: ${empfohleneFaenger} ${fName}.`
        });
      }
    }
  }

  return {
    probleme,
    empfohleneFaenger,
    empfehlung: {
      pingIntervallMinuten: empfohlenerPing,
      versteckZeitMinuten: empfohlenerVorsprung,
      dauerMinuten: empfohleneDauer
    },
    pingBereich,
    versteckBereich
  };
}
