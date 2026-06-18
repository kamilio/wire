import { cookiesFile, parsePastedCookieMetadata, parsePastedCookies, repositoryCookiesFile, serializeNetscapeCookies, type ChromeCookieExtraction, type ChromeCookieResult, type Cookie, type NodeEnvironment, type RuntimeCapabilities } from "wire-core";

export type AuthService = "asana" | "chatgpt" | "gmail" | "google-docs" | "notion" | "slack" | "zoom";
export type CookieAuthService = AuthService;

export interface AuthResult {
  readonly service: AuthService;
  readonly identity: Readonly<Record<string, unknown>>;
}

function cookieHeader(cookies: readonly Cookie[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function responseJson(response: Response): Promise<Record<string, unknown> | null> {
  const value = await response.json() as Record<string, unknown>;
  return response.ok ? value : null;
}

async function verifyNotion(runtime: RuntimeCapabilities, cookies: readonly Cookie[]): Promise<AuthResult | null> {
  const response = await runtime.http.request("https://www.notion.so/api/v3/getSpaces", { method: "POST", headers: { cookie: cookieHeader(cookies), "content-type": "application/json", "notion-client-version": "23.13.0.4595", "user-agent": "Mozilla/5.0" }, body: "{}" });
  const payload = await responseJson(response);
  if (payload === null) return null;
  const spaces = payload as Record<string, { readonly space_view: Readonly<Record<string, { readonly spaceId: string }>> }>;
  const userId = cookies.find((cookie) => cookie.name === "notion_user_id")?.value;
  const user = Object.values(spaces)[0];
  if (userId === undefined || user === undefined) return null;
  const view = Object.values(user.space_view)[0];
  if (view === undefined) return null;
  const spaceId = view.spaceId;
  return Object.freeze({ service: "notion", identity: Object.freeze({ user_id: userId, space_id: spaceId }) });
}

async function verifySlack(runtime: RuntimeCapabilities, cookies: readonly Cookie[], metadata: Readonly<Record<string, string>>): Promise<AuthResult | null> {
  const cookie = cookieHeader(cookies);
  const origin = metadata["origin"];
  const token = metadata["token"];
  if (origin === undefined || token === undefined) return null;
  const response = await runtime.http.request(`${origin}/api/auth.test`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, body: new URLSearchParams({ token }) });
  const identity = await responseJson(response);
  if (identity === null) return null;
  if (identity["ok"] !== true) return null;
  return Object.freeze({ service: "slack", identity: Object.freeze({ user_id: identity["user_id"], user: identity["user"], team_id: identity["team_id"], team: identity["team"], url: identity["url"] }) });
}

async function verifyZoom(runtime: RuntimeCapabilities, cookies: readonly Cookie[]): Promise<AuthResult | null> {
  const cookie = cookieHeader(cookies);
  const csrfResponse = await runtime.http.request("https://zoom.us/csrf_js", { method: "POST", headers: { cookie, "user-agent": "Mozilla/5.0", "fetch-csrf-token": "1", referer: "https://hub.zoom.us/" }, body: "" });
  if (!csrfResponse.ok) return null;
  const csrfText = await csrfResponse.text();
  const csrfIndex = csrfText.indexOf(":");
  if (csrfIndex === -1) return null;
  const csrf = csrfText.slice(csrfIndex + 1).trim();
  if (csrf === "") return null;
  const jwtResponse = await runtime.http.request("https://hub.zoom.us/nws/common/2.0/nak?pms=Hub%2CUser%3ABase%2CAICW&src=aicw", { headers: { cookie, "user-agent": "Mozilla/5.0", "zoom-csrftoken": csrf, "x-requested-with": "XMLHttpRequest", referer: "https://hub.zoom.us/" } });
  const jwt = (await jwtResponse.text()).trim();
  const accountId = cookies.find((value) => value.name === "zm_aid")?.value;
  if (jwt.split(".").length !== 3 || accountId === undefined) return null;
  return Object.freeze({ service: "zoom", identity: Object.freeze({ account_id: accountId }) });
}

async function verifyChatgpt(runtime: RuntimeCapabilities, cookies: readonly Cookie[]): Promise<AuthResult | null> {
  const deviceId = cookies.find((cookie) => cookie.name === "oai-did")?.value;
  if (deviceId === undefined) return null;
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
  if (!text.startsWith("{")) return null;
  const session = JSON.parse(text) as Record<string, unknown>;
  if (!response.ok) return null;
  if ("error" in session) return null;
  const account = session["account"] as Record<string, unknown>;
  return Object.freeze({ service: "chatgpt", identity: Object.freeze({ account_id: account["id"] }) });
}

async function verifyAsana(runtime: RuntimeCapabilities, cookies: readonly Cookie[]): Promise<AuthResult | null> {
  const response = await runtime.http.request("https://app.asana.com/api/1.0/users/me?opt_fields=gid,name,email", { headers: { cookie: cookieHeader(cookies), accept: "application/json", "user-agent": "Mozilla/5.0" } });
  const payload = await responseJson(response);
  if (payload === null) return null;
  const data = (payload as { readonly data: Readonly<Record<string, unknown>> }).data;
  return Object.freeze({ service: "asana", identity: data });
}

async function verifyGmailCookies(runtime: RuntimeCapabilities, cookies: readonly Cookie[]): Promise<AuthResult | null> {
  const response = await runtime.http.request("https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard", { headers: { cookie: cookieHeader(cookies), accept: "application/json, text/plain, */*", "user-agent": "Mozilla/5.0" } });
  if (!response.ok) return null;
  const text = await response.text();
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0];
  if (email === undefined) return null;
  return Object.freeze({ service: "gmail", identity: Object.freeze({ email }) });
}

async function verifyGoogleDocsCookies(runtime: RuntimeCapabilities, cookies: readonly Cookie[]): Promise<AuthResult | null> {
  const response = await runtime.http.request("https://docs.google.com/document/u/0/?tgif=d", { headers: { cookie: cookieHeader(cookies), accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0" } });
  if (!response.ok || !response.url.startsWith("https://docs.google.com/")) return null;
  const text = await response.text();
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0];
  return Object.freeze({ service: "google-docs", identity: Object.freeze(email === undefined ? { service: "google-docs" } : { email }) });
}

export interface Auth {
  readonly status: (service: AuthService) => Promise<AuthResult>;
  readonly pasteCookies: (service: AuthService, contents: string) => Promise<AuthResult>;
  readonly logout: (service: AuthService) => Promise<{ readonly service: AuthService; readonly deleted: true }>;
  readonly extractAsana: () => Promise<AuthResult>;
  readonly extractChatgpt: () => Promise<AuthResult>;
  readonly extractGmail: () => Promise<AuthResult>;
  readonly extractGoogleDocs: () => Promise<AuthResult>;
  readonly extractNotion: () => Promise<AuthResult>;
  readonly extractSlack: () => Promise<AuthResult>;
  readonly extractZoom: () => Promise<AuthResult>;
}

export type CookieExtractor = (environment: NodeEnvironment, extraction: ChromeCookieExtraction) => Promise<ChromeCookieResult>;

function environmentValue(environment: NodeEnvironment, name: string): string {
  const value = environment[name];
  if (value === undefined) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function composeAuth(runtime: RuntimeCapabilities, environment: NodeEnvironment, extractCookies: CookieExtractor): Auth {
  const cookieDomains: Readonly<Record<AuthService, string>> = Object.freeze({ asana: ".asana.com", chatgpt: ".chatgpt.com", gmail: ".google.com", "google-docs": ".google.com", notion: ".notion.so", slack: ".slack.com", zoom: ".zoom.us" });
  const verifyCookies = (service: AuthService, cookies: readonly Cookie[], metadata: Readonly<Record<string, string>>) => service === "asana" ? verifyAsana(runtime, cookies) : service === "chatgpt" ? verifyChatgpt(runtime, cookies) : service === "gmail" ? verifyGmailCookies(runtime, cookies) : service === "google-docs" ? verifyGoogleDocsCookies(runtime, cookies) : service === "notion" ? verifyNotion(runtime, cookies) : service === "slack" ? verifySlack(runtime, cookies, metadata) : verifyZoom(runtime, cookies);
  const cookieAuthError = (service: CookieAuthService) => new Error(`${service} cookie authentication is missing or expired. Run \`wire ${service} login\` once; other commands reuse saved cookies.`);
  const requiredReady = (required: readonly string[]) => (values: readonly Cookie[]) => required.every((name) => values.some((cookie) => cookie.name === name));
  const googleReady = (values: readonly Cookie[]) => values.some((cookie) => (cookie.domain === ".google.com" || cookie.domain.endsWith(".google.com")) && ["SID", "__Secure-1PSID", "LSID", "__Host-1PLSID", "__Host-3PLSID"].includes(cookie.name));
  const status = async (service: AuthService) => {
    const cookies = await runtime.cookies.loadSaved(service);
    if (cookies === null) throw cookieAuthError(service);
    const result = await verifyCookies(service, cookies, service === "slack" ? await runtime.cookies.metadata(service) : Object.freeze({}));
    if (result !== null) return result;
    throw cookieAuthError(service);
  };
  const saveCookies = async (service: AuthService, cookies: readonly Cookie[], metadata: Readonly<Record<string, string>>) => {
    const home = environmentValue(environment, "HOME");
    const repositoryRoot = environment["WIRE_REPOSITORY_ROOT"];
    await runtime.filesystem.writeText(repositoryRoot === undefined ? cookiesFile(home, service) : repositoryCookiesFile(repositoryRoot, service), serializeNetscapeCookies(cookies, metadata));
  };
  const pasteCookies = async (service: AuthService, contents: string) => {
    const cookies = parsePastedCookies(contents, cookieDomains[service]);
    const metadata = parsePastedCookieMetadata(contents);
    const result = await verifyCookies(service, cookies, metadata);
    if (result === null) throw new Error(`${service} cookie authentication failed. Run \`wire ${service} login\` once; other commands reuse saved cookies.`);
    await saveCookies(service, cookies, metadata);
    return result;
  };
  const extract = async (service: AuthService, startUrl: string, domains: readonly string[], ready: (values: readonly Cookie[]) => boolean, metadataExpression?: string) => {
    const extraction = { service, startUrl, domains, ready, verify: async (values: readonly Cookie[], metadata: Readonly<Record<string, string>>) => await verifyCookies(service, values, metadata) !== null, ...(metadataExpression === undefined ? {} : { metadataExpression }) };
    const result = await extractCookies(environment, extraction);
    await saveCookies(service, result.cookies, result.metadata);
    if (result.manual === true) return Object.freeze({ service, identity: Object.freeze({ saved: true }) });
    if (service === "chatgpt") {
      const accountId = result.metadata["account_id"];
      if (accountId === undefined) throw new Error("chatgpt cookie authentication failed. Run `wire chatgpt login` once; other commands reuse saved cookies.");
      return Object.freeze({ service, identity: Object.freeze({ account_id: accountId }) });
    }
    const verified = await verifyCookies(service, result.cookies, result.metadata);
    if (verified === null) throw new Error(`${service} cookie authentication failed. Run \`wire ${service} login\` once; other commands reuse saved cookies.`);
    return verified;
  };
  const auth: Auth = Object.freeze({
    status,
    pasteCookies,
    logout: async (service: AuthService) => {
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
