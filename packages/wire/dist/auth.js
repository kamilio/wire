import { parsePastedCookieMetadata, parsePastedCookies } from "wire-core";
function cookieHeader(cookies) {
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
async function responseJson(response) {
    const value = await response.json();
    return response.ok ? value : null;
}
async function verifyNotion(runtime, cookies) {
    const response = await runtime.http.request("https://www.notion.so/api/v3/getSpaces", { method: "POST", headers: { cookie: cookieHeader(cookies), "content-type": "application/json", "notion-client-version": "23.13.0.4595", "user-agent": "Mozilla/5.0" }, body: "{}" });
    const payload = await responseJson(response);
    if (payload === null)
        return null;
    const spaces = payload;
    const userId = cookies.find((cookie) => cookie.name === "notion_user_id")?.value;
    const user = Object.values(spaces)[0];
    if (userId === undefined || user === undefined)
        return null;
    const view = Object.values(user.space_view)[0];
    if (view === undefined)
        return null;
    const spaceId = view.spaceId;
    return Object.freeze({ service: "notion", identity: Object.freeze({ user_id: userId, space_id: spaceId }) });
}
async function verifySlack(runtime, cookies, metadata) {
    const cookie = cookieHeader(cookies);
    const origin = metadata["origin"];
    const token = metadata["token"];
    if (origin === undefined || token === undefined)
        return null;
    const response = await runtime.http.request(`${origin}/api/auth.test`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, body: new URLSearchParams({ token }) });
    const identity = await responseJson(response);
    if (identity === null)
        return null;
    if (identity["ok"] !== true)
        return null;
    return Object.freeze({ service: "slack", identity: Object.freeze({ user_id: identity["user_id"], user: identity["user"], team_id: identity["team_id"], team: identity["team"], url: identity["url"] }) });
}
async function verifyZoom(runtime, cookies) {
    const cookie = cookieHeader(cookies);
    const csrfResponse = await runtime.http.request("https://zoom.us/csrf_js", { method: "POST", headers: { cookie, "user-agent": "Mozilla/5.0", "fetch-csrf-token": "1", referer: "https://hub.zoom.us/" }, body: "" });
    if (!csrfResponse.ok)
        return null;
    const csrfText = await csrfResponse.text();
    const csrfIndex = csrfText.indexOf(":");
    if (csrfIndex === -1)
        return null;
    const csrf = csrfText.slice(csrfIndex + 1).trim();
    if (csrf === "")
        return null;
    const jwtResponse = await runtime.http.request("https://hub.zoom.us/nws/common/2.0/nak?pms=Hub%2CUser%3ABase%2CAICW&src=aicw", { headers: { cookie, "user-agent": "Mozilla/5.0", "zoom-csrftoken": csrf, "x-requested-with": "XMLHttpRequest", referer: "https://hub.zoom.us/" } });
    const jwt = (await jwtResponse.text()).trim();
    const accountId = cookies.find((value) => value.name === "zm_aid")?.value;
    if (jwt.split(".").length !== 3 || accountId === undefined)
        return null;
    return Object.freeze({ service: "zoom", identity: Object.freeze({ account_id: accountId }) });
}
function zoomCookieKey(cookie) {
    return `${cookie.domain}\t${cookie.path}\t${cookie.name}`;
}
function zoomCookieJar(cookies) {
    return new Map(cookies.map((cookie) => [zoomCookieKey(cookie), cookie]));
}
function zoomDomainMatches(cookie, hostname) {
    const domain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
    return hostname === domain || (cookie.includeSubdomains && hostname.endsWith(`.${domain}`));
}
function zoomPathMatches(cookiePath, requestPath) {
    return requestPath === cookiePath || requestPath.startsWith(cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`);
}
function zoomRequestCookieHeader(jar, url, now) {
    const nowSeconds = Math.floor(now.getTime() / 1000);
    return [...jar.values()].filter((cookie) => {
        if (cookie.expires !== 0 && cookie.expires <= nowSeconds)
            return false;
        if (cookie.secure && url.protocol !== "https:")
            return false;
        if (!zoomDomainMatches(cookie, url.hostname))
            return false;
        return zoomPathMatches(cookie.path, url.pathname);
    }).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
function zoomDefaultCookiePath(pathname) {
    const index = pathname.lastIndexOf("/");
    return index <= 0 ? "/" : pathname.slice(0, index);
}
function zoomSplitSetCookieHeader(value) {
    return Object.freeze(value.split(/,(?=\s*[^;,]+=)/).map((item) => item.trim()));
}
function zoomSetCookieHeaders(response) {
    const headers = response.headers;
    const values = headers.getSetCookie?.();
    if (values !== undefined)
        return Object.freeze(values);
    const value = response.headers.get("set-cookie");
    if (value === null)
        return Object.freeze([]);
    return zoomSplitSetCookieHeader(value);
}
function zoomCookieAttributes(parts) {
    return new Map(parts.map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part.toLowerCase(), ""] : [part.slice(0, index).toLowerCase(), part.slice(index + 1)];
    }));
}
function zoomSetCookieExpires(attributes, now) {
    if (attributes.has("max-age"))
        return Math.floor(now.getTime() / 1000) + Number(attributes.get("max-age"));
    if (attributes.has("expires"))
        return Math.floor(Date.parse(attributes.get("expires")) / 1000);
    return 0;
}
function zoomApplySetCookie(jar, url, header, now) {
    const parts = header.split(";").map((part) => part.trim());
    const pair = parts[0];
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    const attributes = zoomCookieAttributes(parts.slice(1));
    const domain = attributes.has("domain") ? attributes.get("domain") : url.hostname;
    const path = attributes.has("path") ? attributes.get("path") : zoomDefaultCookiePath(url.pathname);
    const expires = zoomSetCookieExpires(attributes, now);
    const cookie = Object.freeze({
        domain,
        includeSubdomains: attributes.has("domain") || domain.startsWith("."),
        path,
        secure: attributes.has("secure"),
        expires,
        name,
        value,
        httpOnly: attributes.has("httponly"),
    });
    const key = zoomCookieKey(cookie);
    if (expires !== 0 && expires <= Math.floor(now.getTime() / 1000))
        return jar.delete(key);
    const existing = jar.get(key);
    jar.set(key, cookie);
    return existing === undefined || existing.value !== cookie.value || existing.expires !== cookie.expires || existing.secure !== cookie.secure || existing.httpOnly !== cookie.httpOnly || existing.includeSubdomains !== cookie.includeSubdomains;
}
function zoomApplyResponseCookies(jar, url, response, now) {
    let changed = false;
    for (const header of zoomSetCookieHeaders(response))
        changed = zoomApplySetCookie(jar, url, header, now) || changed;
    return changed;
}
function zoomPruneExpiredCookies(jar, now) {
    let changed = false;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    for (const [key, cookie] of jar.entries()) {
        if (cookie.expires !== 0 && cookie.expires <= nowSeconds) {
            jar.delete(key);
            changed = true;
        }
    }
    return changed;
}
async function zoomAuthRequest(runtime, jar, url, init) {
    const parsed = new URL(url);
    const response = await runtime.http.request(url, { ...init, headers: { ...init.headers, cookie: zoomRequestCookieHeader(jar, parsed, runtime.clock.now()) } });
    return Object.freeze({ response, changed: zoomApplyResponseCookies(jar, parsed, response, runtime.clock.now()) });
}
async function verifyZoomCookieState(runtime, cookies, metadata) {
    const jar = zoomCookieJar(cookies);
    let changed = zoomPruneExpiredCookies(jar, runtime.clock.now());
    const csrf = await zoomAuthRequest(runtime, jar, "https://zoom.us/csrf_js", { method: "POST", headers: { "user-agent": "Mozilla/5.0", "fetch-csrf-token": "1", referer: "https://hub.zoom.us/" }, body: "" });
    changed = csrf.changed || changed;
    if (!csrf.response.ok)
        return Object.freeze({ result: null, cookies: Object.freeze([...jar.values()]), metadata, changed });
    const csrfText = await csrf.response.text();
    const csrfIndex = csrfText.indexOf(":");
    if (csrfIndex === -1)
        return Object.freeze({ result: null, cookies: Object.freeze([...jar.values()]), metadata, changed });
    const token = csrfText.slice(csrfIndex + 1).trim();
    if (token === "")
        return Object.freeze({ result: null, cookies: Object.freeze([...jar.values()]), metadata, changed });
    const jwt = await zoomAuthRequest(runtime, jar, "https://hub.zoom.us/nws/common/2.0/nak?pms=Hub%2CUser%3ABase%2CAICW&src=aicw", { headers: { "user-agent": "Mozilla/5.0", "zoom-csrftoken": token, "x-requested-with": "XMLHttpRequest", referer: "https://hub.zoom.us/" } });
    changed = jwt.changed || changed;
    const jwtText = (await jwt.response.text()).trim();
    const accountId = [...jar.values()].find((value) => value.name === "zm_aid")?.value;
    const result = jwt.response.ok && jwtText.split(".").length === 3 && accountId !== undefined ? Object.freeze({ service: "zoom", identity: Object.freeze({ account_id: accountId }) }) : null;
    return Object.freeze({ result, cookies: Object.freeze([...jar.values()]), metadata, changed });
}
async function verifyChatgpt(runtime, cookies) {
    const deviceId = cookies.find((cookie) => cookie.name === "oai-did")?.value;
    if (deviceId === undefined)
        return null;
    const response = await runtime.http.request("https://chatgpt.com/api/auth/session", { headers: {
            cookie: cookieHeader(cookies),
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
            "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "oai-device-id": deviceId,
            "oai-language": "en-US",
            referer: "https://chatgpt.com/",
        } });
    const text = await response.text();
    if (!text.startsWith("{"))
        return null;
    const session = JSON.parse(text);
    if (!response.ok)
        return null;
    if ("error" in session)
        return null;
    const account = session["account"];
    return Object.freeze({ service: "chatgpt", identity: Object.freeze({ account_id: account["id"] }) });
}
async function verifyAsana(runtime, cookies) {
    const response = await runtime.http.request("https://app.asana.com/api/1.0/users/me?opt_fields=gid,name,email", { headers: { cookie: cookieHeader(cookies), accept: "application/json", "user-agent": "Mozilla/5.0" } });
    const payload = await responseJson(response);
    if (payload === null)
        return null;
    const data = payload.data;
    return Object.freeze({ service: "asana", identity: data });
}
async function verifyGmailCookies(runtime, cookies) {
    const response = await runtime.http.request("https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard", { headers: { cookie: cookieHeader(cookies), accept: "application/json, text/plain, */*", "user-agent": "Mozilla/5.0" } });
    if (!response.ok)
        return null;
    const text = await response.text();
    const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0];
    if (email === undefined)
        return null;
    return Object.freeze({ service: "gmail", identity: Object.freeze({ email }) });
}
async function verifyGoogleDocsCookies(runtime, cookies) {
    const response = await runtime.http.request("https://docs.google.com/document/u/0/?tgif=d", { headers: { cookie: cookieHeader(cookies), accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0" } });
    if (!response.ok || !response.url.startsWith("https://docs.google.com/"))
        return null;
    const text = await response.text();
    const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0];
    return Object.freeze({ service: "google-docs", identity: Object.freeze(email === undefined ? { service: "google-docs" } : { email }) });
}
export function composeAuth(runtime, environment, extractCookies) {
    const cookieDomains = Object.freeze({ asana: ".asana.com", chatgpt: ".chatgpt.com", gmail: ".google.com", "google-docs": ".google.com", notion: ".notion.so", slack: ".slack.com", zoom: ".zoom.us" });
    const verifyCookies = (service, cookies, metadata) => service === "asana" ? verifyAsana(runtime, cookies) : service === "chatgpt" ? verifyChatgpt(runtime, cookies) : service === "gmail" ? verifyGmailCookies(runtime, cookies) : service === "google-docs" ? verifyGoogleDocsCookies(runtime, cookies) : service === "notion" ? verifyNotion(runtime, cookies) : service === "slack" ? verifySlack(runtime, cookies, metadata) : verifyZoom(runtime, cookies);
    const verifyCookieState = async (service, cookies, metadata) => {
        if (service === "zoom")
            return verifyZoomCookieState(runtime, cookies, metadata);
        return Object.freeze({ result: await verifyCookies(service, cookies, metadata), cookies, metadata, changed: false });
    };
    const cookieAuthError = (service) => new Error(`${service} cookie authentication is missing or expired. Run \`wire ${service} login\` once; other commands reuse saved cookies.`);
    const requiredReady = (required) => (values) => required.every((name) => values.some((cookie) => cookie.name === name));
    const googleReady = (values) => values.some((cookie) => (cookie.domain === ".google.com" || cookie.domain.endsWith(".google.com")) && ["SID", "__Secure-1PSID", "LSID", "__Host-1PLSID", "__Host-3PLSID"].includes(cookie.name));
    const status = async (service) => {
        const cookies = await runtime.cookies.loadSaved(service);
        if (cookies === null)
            throw cookieAuthError(service);
        const state = await verifyCookieState(service, cookies, service === "slack" ? await runtime.cookies.metadata(service) : Object.freeze({}));
        if (state.changed)
            await saveCookies(service, state.cookies, state.metadata);
        if (state.result !== null)
            return state.result;
        throw cookieAuthError(service);
    };
    const saveCookies = async (service, cookies, metadata) => {
        await runtime.cookies.save(service, cookies, metadata);
    };
    const pasteCookies = async (service, contents) => {
        const cookies = parsePastedCookies(contents, cookieDomains[service]);
        const metadata = parsePastedCookieMetadata(contents);
        const state = await verifyCookieState(service, cookies, metadata);
        if (state.result === null)
            throw new Error(`${service} cookie authentication failed. Run \`wire ${service} login\` once; other commands reuse saved cookies.`);
        await saveCookies(service, state.cookies, state.metadata);
        return state.result;
    };
    const extract = async (service, startUrl, domains, ready, metadataExpression) => {
        const extraction = { service, startUrl, domains, ready, verify: async (values, metadata) => (await verifyCookieState(service, values, metadata)).result !== null, ...(metadataExpression === undefined ? {} : { metadataExpression }) };
        const result = await extractCookies(environment, extraction);
        if (result.manual === true) {
            await saveCookies(service, result.cookies, result.metadata);
            return Object.freeze({ service, identity: Object.freeze({ saved: true }) });
        }
        if (service === "chatgpt") {
            await saveCookies(service, result.cookies, result.metadata);
            const accountId = result.metadata["account_id"];
            if (accountId === undefined)
                throw new Error("chatgpt cookie authentication failed. Run `wire chatgpt login` once; other commands reuse saved cookies.");
            return Object.freeze({ service, identity: Object.freeze({ account_id: accountId }) });
        }
        const verified = await verifyCookieState(service, result.cookies, result.metadata);
        if (verified.result === null)
            throw new Error(`${service} cookie authentication failed. Run \`wire ${service} login\` once; other commands reuse saved cookies.`);
        await saveCookies(service, verified.cookies, verified.metadata);
        return verified.result;
    };
    const auth = Object.freeze({
        status,
        pasteCookies,
        logout: async (service) => {
            await runtime.cookies.delete(service);
            return Object.freeze({ service, deleted: true });
        },
        extractAsana: () => extract("asana", "https://app.asana.com/", ["asana.com"], (values) => values.some((cookie) => cookie.domain === ".asana.com" || cookie.domain.endsWith(".asana.com"))),
        extractChatgpt: () => extract("chatgpt", "https://chatgpt.com/", ["chatgpt.com", "openai.com"], requiredReady(["oai-did", "__Secure-next-auth.session-token"])),
        extractGmail: () => extract("gmail", "https://mail.google.com/mail/u/0/", ["google.com"], googleReady),
        extractGoogleDocs: () => extract("google-docs", "https://docs.google.com/", ["google.com"], googleReady),
        extractNotion: () => extract("notion", "https://www.notion.so/login", ["notion.so", "notion.com"], requiredReady(["token_v2", "notion_user_id", "notion_users"])),
        extractSlack: () => extract("slack", "https://app.slack.com/client", ["slack.com"], requiredReady(["d"]), `(() => { const value = localStorage.getItem("localConfig_v2"); if (value === null) return {}; const team = Object.values(JSON.parse(value).teams)[0]; if (team === undefined) return {}; return { origin: new URL(team.url).origin, token: team.token }; })()`),
        extractZoom: () => extract("zoom", "https://hub.zoom.us/", ["zoom.us"], requiredReady(["zm_aid", "_zm_ssid"])),
    });
    return auth;
}
//# sourceMappingURL=auth.js.map