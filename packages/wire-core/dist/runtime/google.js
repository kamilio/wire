export function parseGoogleCredentials(contents) {
    const document = JSON.parse(contents);
    return Object.freeze(document.installed);
}
export function parseGoogleToken(contents) {
    return Object.freeze(JSON.parse(contents));
}
export function googleTokenExpired(token, now) {
    return token.expiry === undefined || new Date(token.expiry).getTime() <= now.getTime();
}
export function mergeGoogleRefresh(token, refresh, now) {
    const updated = {
        ...token,
        token: refresh.access_token,
        expiry: new Date(now.getTime() + refresh.expires_in * 1000).toISOString(),
    };
    if (refresh.refresh_token !== undefined)
        updated.refresh_token = refresh.refresh_token;
    if (refresh.token_type !== undefined)
        updated.token_type = refresh.token_type;
    if (refresh.scope !== undefined)
        updated.scopes = refresh.scope === "" ? [] : refresh.scope.split(/\s+/);
    if (refresh.id_token !== undefined)
        updated.id_token = refresh.id_token;
    return Object.freeze(updated);
}
export function createGoogleTokensCapability(filesystem, http, clock, credentialsPath, tokenPath) {
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
        const bodyJson = await response.json();
        if (!response.ok) {
            const error = bodyJson;
            throw new Error(`Google OAuth refresh failed: HTTP ${response.status} ${error.error}${error.error_description === undefined ? "" : `: ${error.error_description}`}`);
        }
        const refreshed = mergeGoogleRefresh(token, bodyJson, clock.now());
        await filesystem.writeText(tokenPath, JSON.stringify(refreshed));
        return refreshed;
    };
    return Object.freeze({
        load: async () => {
            const token = parseGoogleToken(await filesystem.readText(tokenPath));
            if (!googleTokenExpired(token, clock.now()))
                return token;
            return refresh();
        },
        refresh,
    });
}
//# sourceMappingURL=google.js.map