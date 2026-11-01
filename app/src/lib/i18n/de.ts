/**
 * HUNTING - Deutsche Sprachdefinitionen (i18n)
 * Alle In-Game Texte, Labels, Warnungen und Fehlermeldungen.
 */

export const de = {
  allgemein: {
    appTitel: 'HUNTING',
    untertitel: 'GPS-Nachtjagd für Freunde',
    laden: 'Laden...',
    abbrechen: 'Abbrechen',
    bestaetigen: 'Bestätigen',
    speichern: 'Speichern',
    schliessen: 'Schließen',
    zurueck: 'Zurück',
    kopieren: 'Kopieren',
    kopiert: 'In die Zwischenablage kopiert!',
    teilen: 'Teilen',
    weiter: 'Weiter',
    fehler: 'Ein Fehler ist aufgetreten',
    ok: 'Verstanden',
  },

  netz: {
    verbinde: 'Verbinde mit Spielserver...',
    verbunden: 'Live verbunden',
    getrennt: 'Verbindung unterbrochen – Reconnect läuft...',
    warteschlange: '%s Aktion(en) in der Offline-Warteschlange',
    latenz: '%s ms',
  },

  ortung: {
    gpsSuchen: 'GPS-Signal wird gesucht...',
    gpsGenauigkeit: '±%s m Genauigkeit',
    gpsSchwach: 'Schwaches GPS-Signal! Gehe nach draußen.',
    gpsVerweigert: 'Standortzugriff verweigert. Bitte in den Browsereinstellungen aktivieren.',
    wakeLockAktiv: 'Bildschirm bleibt an',
    wakeLockInaktiv: 'Bildschirm schaltet normal ab',
    wakeLockAkkuhinweis: 'Tipp: Bildschirm anlassen verbraucht mehr Akku.',
  },

  hud: {
    phase: {
      lobby: 'Lobby',
      verstecken: 'Versteckphase',
      jagd: 'Jagd läuft',
      pause: 'Spiel pausiert',
      ende: 'Spiel beendet',
    },
    timer: {
      restzeit: 'Restzeit',
      versteckzeit: 'Versteck-Vorsprung',
      naechsterPing: 'Nächster Ping',
      zoneSchrumpft: 'Zone schrumpft in',
    },
    aktionen: {
      fangen: 'FANGEN!',
      fangbar: 'Gegner in Fangreichweite!',
      nichtFangbar: 'Kein Ziel in Reichweite',
      faehigkeiten: 'Fähigkeiten',
      chat: 'Team-Chat',
      ticket: 'Ticket einlösen',
      qrZeigen: 'Mein Fang-QR',
      qrScannen: 'QR-Code scannen',
    },
    warnungen: {
      zoneVerlassenTitel: 'ZONE VERLASSEN!',
      zoneVerlassenText: 'Du bist live für alle Gegner sichtbar! Kehre sofort in die Zone zurück!',
      zoneKulanz: 'Verbleibende Kulanzzeit: %s Sek.',
      seekerNahTitel: 'WARNUNG!',
      seekerNahText: 'Ein Jäger ist in deiner Nähe (< 100 m)!',
      funklochTitel: 'FUNKLOCH-STRAFE AKTIV',
      funklochText: 'Dein Signal war veraltet. Du bist noch %s Sek. live sichtbar!',
    },
  },

  mrx: {
    fahrtentafel: 'Fahrtentafel Mr. X',
    ticketWaehlen: 'Ticket wählen',
    linieOptional: 'Linie (optional, z.B. 42)',
    haltestelleSuchen: 'Nächste Haltestellen suchen...',
    keineHaltestelle: 'Keine Haltestelle in der Nähe gefunden',
    verkehrsmittel: {
      bus: 'Bus',
      tram: 'Tram / Straßenbahn',
      ubahn: 'U-Bahn',
      sbahn: 'S-Bahn',
      zug: 'Regionalzug / Bahn',
      faehre: 'Fähre',
      black: 'Black Ticket (Geheim)',
      doppel: 'Doppelzug (2 Fahrten)',
    },
    spezialUebrig: '%s verfügbar',
    ticketGeloest: 'Mr. X fährt mit: %s',
    detektivTicketWarnung: 'Tempo > 25 km/h ohne Ticket erfasst!',
  },

  faehigkeiten: {
    titel: 'Fähigkeiten',
    energie: 'Energie',
    energieLaden: '+%s / Min.',
    abklingzeit: 'Noch %s Sek.',
    nichtGenugEnergie: 'Nicht genug Energie (%s benötigt)',
    einmaligGenutzt: 'Bereits in diesem Spiel genutzt',
    katalog: {
      tarnkappe: {
        name: 'Tarnkappe',
        beschreibung: 'Der nächste reguläre Ping zeigt dich nicht.',
      },
      koeder: {
        name: 'Köder',
        beschreibung: 'Der nächste Ping zeigt einen gefälschten Ort in der Zone (bis 300 m entfernt).',
      },
      radar: {
        name: 'Radar',
        beschreibung: '15 Sekunden lang alle Jäger live auf deiner Karte sichtbar.',
      },
      stoersender: {
        name: 'Störsender',
        beschreibung: 'Jäger im Umkreis von 150 m können 60 Sekunden lang niemanden fangen.',
      },
      schild: {
        name: 'Schutzschild',
        beschreibung: '30 Sekunden lang absolut unantastbar. Nur 1x pro Spiel!',
      },
      sonderping: {
        name: 'Sonder-Ping',
        beschreibung: 'Löst sofort einen ungeplanten Ping eines zufälligen Hiders aus.',
      },
      peilung: {
        name: 'Peilung',
        beschreibung: 'Ein Richtungspfeil zeigt 20 Sekunden zum nächsten Gejagten (ohne Distanz).',
      },
      sonar: {
        name: 'Sonar',
        beschreibung: 'Verrät die genaue Anzahl aller Gejagten im Umkreis von 250 m.',
      },
      blackout: {
        name: 'Blackout',
        beschreibung: 'Blockiert alle Fähigkeiten der Gejagten für volle 2 Minuten.',
      },
      zonenstoss: {
        name: 'Zonenstoß',
        beschreibung: 'Lässt die nächste Zonenverkleinerung 2 Minuten früher starten.',
      },
    },
  },

  chat: {
    titel: 'Funk & Chat',
    kanaele: {
      alle: 'Alle Spieler',
      team: 'Eigenes Team',
      zuschauer: 'Zuschauer-Loge',
    },
    nachrichtSenden: 'Nachricht senden...',
    schnellnachrichtenTitel: 'Schnellfunk',
    schnellnachrichten: [
      'Habe Verdacht in meiner Nähe!',
      'Rücke zur Zonenmitte vor.',
      'Achtung, Jäger nähert sich!',
      'Brauche Verstärkung beim Fangen!',
      'Guter Versuch, aber ich bin weg ;)',
      'Sammelt das Loot auf der Karte ein!',
    ],
  },

  gefangen: {
    titel: 'DU WURDEST GEFANGEN!',
    untertitel: 'Ein Jäger war schneller als du.',
    gefangenVon: 'Gefangen von %s',
    zeitpunkt: 'Zeitpunkt: T+%s',
    wechselZuschauer: 'Du wechselst jetzt in den Zuschauermodus und kannst das restliche Spiel live mitverfolgen.',
    wechselZombie: 'Du wurdest infiziert! Du bist jetzt ein ZOMBIE und machst Jagd auf die restlichen Menschen!',
    tasteZuschauer: 'Zuschauer-Ansicht öffnen',
    tasteZombie: 'Als Zombie auf die Jagd gehen',
  },

  ende: {
    titel: 'SPIEL VORBEI',
    sieger: {
      seeker: 'Die Jäger haben triumphiert!',
      hider: 'Die Gejagten haben überlebt!',
      zombies: 'Die Zombies haben die Stadt überrannt!',
      menschen: 'Die Menschen haben überlebt!',
      mrx: 'Mr. X ist der Fahndung entkommen!',
      detektive: 'Die Detektive haben Mr. X geschnappt!',
    },
    letzterMensch: 'Letzter Mensch: %s',
    statistiken: {
      gelaufeneDistanz: 'Gelaufene Distanz',
      ueberlebteZeit: 'Überlebte Zeit',
      faenge: 'Eigene Fänge',
      faehigkeitenGenutzt: 'Fähigkeiten gezündet',
      ticketsGeloest: 'ÖPNV-Fahrten',
    },
    aktionen: {
      replay: 'Spiel-Replay ansehen',
      revanche: 'Revanche in gleicher Gruppe',
      lobby: 'Zurück zur Hauptlobby',
    },
  },

  replay: {
    titel: 'Missions-Replay',
    abspielen: 'Abspielen',
    pause: 'Pause',
    tempo: 'Geschwindigkeit: %sx',
    fortschritt: 'Spielzeit: %s / %s',
    ereignisse: {
      ping: 'Radar-Ping aufgedeckt',
      fang: '%s fing %s',
      ticket: 'Mr. X stieg in %s',
      zone: 'Zone schrumpfte auf Stufe %s',
      faehigkeit: '%s aktivierte %s',
    },
  },

  profil: {
    titel: 'Mein Agenten-Profil',
    spitzname: 'Agenten-Name',
    konto: 'Konto & Cloud-Sync',
    anonym: 'Anonymer Gast-Account',
    googleVerbinden: 'Mit Google verknüpfen',
    googleVerbunden: 'Mit Google verknüpft (%s)',
    statistikenTitel: 'Gesamt-Karriere',
    spieleGesamt: 'Gespielte Runden',
    siegeSeeker: 'Siege als Jäger',
    siegeHider: 'Siege als Gejagter',
    gesamtKm: 'Gesamt gelaufene km',
    gesamtFaenge: 'Erfolgreiche Fänge',
    bestenlisteTitel: 'Bestenliste (Woche)',
    einstellungen: {
      ton: 'Soundeffekte (WebAudio)',
      vibration: 'Haptisches Feedback',
      wakeLock: 'Bildschirm immer wachhalten',
    },
  },
};
