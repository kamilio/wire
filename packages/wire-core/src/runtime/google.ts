import type { ClockCapability, FilesystemCapability, GoogleTokenDocument, GoogleTokensCapability, HttpCapability } from "../ports.js";

interface GoogleClientCredentials {
  readonly client_id: string;
  readonly client_secret: string;
  readonly token_uri: string;
}

interface GoogleCredentialsDocument {
  readonly installed: GoogleClientCredentials;
}

interface GoogleRefreshResponse {
  readonly access_token: string;
  readonly expires_in: number;
  readonly refresh_token?: string;
  readonly scope?: string;
  readonly token_type?: string;
  readonly id_token?: string;
}

type GoogleRefreshError = Readonly<{ error: string; error_description?: string }>;

export function parseGoogleCredentials(contents: string): GoogleClientCredentials {
  const document = JSON.parse(contents) as GoogleCredentialsDocument;
  return Object.freeze(document.installed);
}

export function parseGoogleToken(contents: string): GoogleTokenDocument {
  return Object.freeze(JSON.parse(contents) as GoogleTokenDocument);
}

export function googleTokenExpired(token: GoogleTokenDocument, now: Date): boolean {
  return token.expiry === undefined || new Date(token.expiry).getTime() <= now.getTime();
}

export function mergeGoogleRefresh(token: GoogleTokenDocument, refresh: GoogleRefreshResponse, now: Date): GoogleTokenDocument {
  const updated: Record<string, unknown> = {
    ...token,
    token: refresh.access_token,
    expiry: new Date(now.getTime() + refresh.expires_in * 1000).toISOString(),
  };
  if (refresh.refresh_token !== undefined) updated.refresh_token = refresh.refresh_token;
  if (refresh.token_type !== undefined) updated.token_type = refresh.token_type;
  if (refresh.scope !== undefined) updated.scopes = refresh.scope === "" ? [] : refresh.scope.split(/\s+/);
  if (refresh.id_token !== undefined) updated.id_token = refresh.id_token;
  return Object.freeze(updated) as GoogleTokenDocument;
}

export function createGoogleTokensCapability(
  filesystem: FilesystemCapability,
  http: HttpCapability,
  clock: ClockCapability,
  credentialsPath: string,
  tokenPath: string,
): GoogleTokensCapability {
  const refresh = async () => {
    const token = parseGoogleToken(await filesystem.readText(tokenPath));
    const credentials = parseGoogleCredentials(await filesystem.readText(credentialsPath));
    const body = new URLSearchParams({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    });
    const response = await http.request(credentials.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const bodyJson = await response.json() as GoogleRefreshResponse | GoogleRefreshError;
    if (!response.ok) {
      const error = bodyJson as GoogleRefreshError;
      throw new Error(`Google OAuth refresh failed: HTTP ${response.status} ${error.error}${error.error_description === undefined ? "" : `: ${error.error_description}`}`);
    }
    const refreshed = mergeGoogleRefresh(token, bodyJson as GoogleRefreshResponse, clock.now());
    await filesystem.writeText(tokenPath, JSON.stringify(refreshed));
    return refreshed;
  };
  return Object.freeze({
    load: async () => {
      const token = parseGoogleToken(await filesystem.readText(tokenPath));
      if (!googleTokenExpired(token, clock.now())) return token;
      return refresh();
    },
    refresh,
  });
}
