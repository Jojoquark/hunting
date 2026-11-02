import * as jose from 'jose';

export interface AuthErgebnis {
  gueltig: boolean;
  uid: string;
  istAnonym: boolean;
}

export async function verifiziereFirebaseToken(idToken?: string): Promise<AuthErgebnis> {
  if (!idToken) {
    // Anonymer Spieler
    return {
      gueltig: true,
      uid: `anon_${Math.random().toString(36).substring(2, 10)}`,
      istAnonym: true
    };
  }

  try {
    // Google JWKS Verifizierung
    const JWKS = jose.createRemoteJWKSet(
      new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
    );

    const { payload } = await jose.jwtVerify(idToken, JWKS);

    return {
      gueltig: true,
      uid: payload.sub as string,
      istAnonym: (payload.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider === 'anonymous'
    };
  } catch {
    // Ungültige Identitätstoken dürfen nicht als anonyme Anmeldung gelten.
    return {
      gueltig: false,
      uid: '',
      istAnonym: false
    };
  }
}
