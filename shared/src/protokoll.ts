import { z } from 'zod';

export const RolleZod = z.enum([
  'seeker',
  'hider',
  'zombie',
  'mensch',
  'mrx',
  'detektiv',
  'zuschauer'
]);

export const SpielModusZod = z.enum(['klassisch', 'zombie', 'mrx']);

export const SpielPhaseZod = z.enum(['lobby', 'versteckphase', 'jagd', 'ende']);

export const VerkehrsmittelZod = z.enum([
  'bus',
  'tram',
  'ubahn',
  'sbahn',
  'zug',
  'faehre',
  'fuss'
]);

export const SpezialTicketZod = z.enum(['black', 'doppelzug']);

export const FaehigkeitIdZod = z.enum([
  'tarnkappe',
  'koeder',
  'radar',
  'stoersender',
  'schild',
  'sonderping',
  'peilung',
  'sonar',
  'blackout',
  'zonenstoss'
]);

export const ChatKanalZod = z.enum(['alle', 'team', 'zuschauer']);

export const KoordinateZod = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
});

export const OrtZod = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  genauigkeit: z.number().nonnegative(),
  zeit: z.number(),
  tempo: z.number().nullable().optional(),
  heading: z.number().nullable().optional()
});

// Client -> Server Nachrichten
export const HalloC2SZod = z.object({
  typ: z.literal('hallo'),
  token: z.string().optional(),
  name: z.string().min(1).max(30),
  icon: z.string(),
  farbe: z.string()
});

export const OrtC2SZod = z.object({
  typ: z.literal('ort'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  genauigkeit: z.number().nonnegative(),
  zeit: z.number(),
  tempo: z.number().nullable().optional(),
  heading: z.number().nullable().optional()
});

export const FangenC2SZod = z.object({
  typ: z.literal('fangen'),
  zielId: z.string()
});

export const FangAntwortC2SZod = z.object({
  typ: z.literal('fangAntwort'),
  fangId: z.string(),
  bestaetigt: z.boolean()
});

export const QrFangC2SZod = z.object({
  typ: z.literal('qrFang'),
  token: z.string()
});

export const FaehigkeitC2SZod = z.object({
  typ: z.literal('faehigkeit'),
  faehigkeitId: FaehigkeitIdZod,
  parameter: z
    .object({
      koederOrt: KoordinateZod.optional()
    })
    .optional()
});

export const TicketC2SZod = z.object({
  typ: z.literal('ticket'),
  verkehrsmittel: VerkehrsmittelZod,
  haltestelle: z.string().optional(),
  linie: z.string().optional(),
  spezial: SpezialTicketZod.optional()
});

export const ChatC2SZod = z.object({
  typ: z.literal('chat'),
  kanal: ChatKanalZod,
  text: z.string().max(500).optional(),
  schnellNachrichtId: z.string().optional()
});

export const HostAktionC2SZod = z.object({
  typ: z.literal('host'),
  aktion: z.enum([
    'rollen',
    'einstellungen',
    'start',
    'beenden',
    'revanche',
    'streitfall'
  ]),
  daten: z.unknown().optional()
});

export const PingC2SZod = z.object({
  typ: z.literal('ping'),
  clientZeit: z.number()
});

export const C2SMessageZod = z.discriminatedUnion('typ', [
  HalloC2SZod,
  OrtC2SZod,
  FangenC2SZod,
  FangAntwortC2SZod,
  QrFangC2SZod,
  FaehigkeitC2SZod,
  TicketC2SZod,
  ChatC2SZod,
  HostAktionC2SZod,
  PingC2SZod
]);

export type C2SMessage = z.infer<typeof C2SMessageZod>;

// Server -> Client Nachrichten
export const SichtbarePositionZod = z.object({
  spielerId: z.string(),
  name: z.string(),
  farbe: z.string(),
  icon: z.string(),
  rolle: RolleZod,
  lat: z.number(),
  lng: z.number(),
  genauigkeit: z.number(),
  typ: z.enum(['unsichtbar', 'ping', 'unscharf', 'live']),
  zeitpunkt: z.number(),
  istVeraltet: z.boolean().optional()
});

export const ZustandS2CZod = z.object({
  typ: z.literal('zustand'),
  zustand: z.any()
});

export const EreignisS2CZod = z.object({
  typ: z.literal('ereignis'),
  ereignis: z.object({
    id: z.string(),
    zeit: z.number(),
    typ: z.string(),
    daten: z.record(z.unknown())
  })
});

export const SichtS2CZod = z.object({
  typ: z.literal('sicht'),
  sichtbarePositionen: z.array(SichtbarePositionZod)
});

export const ZeitS2CZod = z.object({
  typ: z.literal('zeit'),
  serverZeit: z.number(),
  clientZeit: z.number().optional()
});

export const FehlerS2CZod = z.object({
  typ: z.literal('fehler'),
  code: z.string(),
  nachricht: z.string()
});

export const PongS2CZod = z.object({
  typ: z.literal('pong'),
  clientZeit: z.number(),
  serverZeit: z.number()
});

export const S2CMessageZod = z.discriminatedUnion('typ', [
  ZustandS2CZod,
  EreignisS2CZod,
  SichtS2CZod,
  ZeitS2CZod,
  FehlerS2CZod,
  PongS2CZod
]);

export type S2CMessage = z.infer<typeof S2CMessageZod>;

export function parseC2SMessage(daten: unknown): C2SMessage {
  return C2SMessageZod.parse(daten);
}

export function parseS2CMessage(daten: unknown): S2CMessage {
  return S2CMessageZod.parse(daten);
}
