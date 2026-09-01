import type { JsonObject, JsonValue, RuntimeCapabilities } from "wire-core";
import { createChatgptRequester, type Cooldown } from "./cooldown.js";

export function authError(): Error {
  return new Error("ChatGPT authentication is missing or expired. Run `wire chatgpt login` once; other commands reuse saved cookies.");
}

export function object(value: JsonValue | undefined): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected ChatGPT object response");
  return value as JsonObject;
}

export function text(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export class ChatgptRequestError extends Error {
  constructor(readonly status: number, readonly endpoint: string) {
    super(`ChatGPT request failed (${status}): ${endpoint}${status === 401 || status === 403 ? ". Run `wire chatgpt login`." : ""}`);
  }
}

export async function connectChatgpt(runtime: RuntimeCapabilities, referer: string, onCooldown?: (value: Cooldown) => Promise<void>) {
  const cookies = await runtime.cookies.loadSaved("chatgpt");
  if (cookies === null) throw authError();
  const device = cookies.find((cookie) => cookie.name === "oai-did")?.value;
  const headers: Record<string, string> = {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    ...(device === undefined ? {} : { "oai-device-id": device }),
    "oai-language": "en-US",
    referer,
    cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
  };
  const response = await runtime.http.request("https://chatgpt.com/api/auth/session", { headers, signal: AbortSignal.timeout(60000), redirect: "error" });
  const contents = await response.text();
  if (!response.ok || !contents.trimStart().startsWith("{")) throw authError();
  const session = object(JSON.parse(contents) as JsonValue);
  if (session["error"] !== undefined || text(session["accessToken"]) === undefined || session["account"] == null) throw authError();
  const account = object(session["account"]);
  const accountId = text(account["id"]);
  if (accountId === undefined) throw authError();
  headers["authorization"] = `Bearer ${session["accessToken"] as string}`;

  const request = createChatgptRequester(runtime.http, onCooldown);

  const forAccount = (id: string) => {
    const authenticated = { ...headers, "chatgpt-account-id": id };
    const json = async (endpoint: string): Promise<JsonValue> => {
      if (!endpoint.startsWith("/backend-api/")) throw new Error("Invalid ChatGPT API endpoint");
      const result = await request(`https://chatgpt.com${endpoint}`, authenticated, endpoint);
      if (!result.ok) throw new ChatgptRequestError(result.status, endpoint);
      return await result.json() as JsonValue;
    };
    const bytes = async (value: string): Promise<Uint8Array> => {
      let url = new URL(value, "https://chatgpt.com");
      for (let redirects = 0; redirects <= 5; redirects++) {
        const trusted = url.hostname === "chatgpt.com" || url.hostname.endsWith(".oaiusercontent.com") || url.hostname.endsWith(".blob.core.windows.net");
        if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || (url.port !== "" && url.port !== "443") || !trusted) throw new Error("Untrusted ChatGPT file download URL");
        const result = await request(url.href, url.origin === "https://chatgpt.com" ? authenticated : {}, url.origin + url.pathname);
        if ([301, 302, 303, 307, 308].includes(result.status)) {
          const location = result.headers.get("location");
          await result.body?.cancel();
          if (location === null) throw new Error("ChatGPT file redirect is missing its destination");
          url = new URL(location, url);
          continue;
        }
        if (!result.ok) throw new ChatgptRequestError(result.status, url.origin + url.pathname);
        return new Uint8Array(await result.arrayBuffer());
      }
      throw new Error("Too many ChatGPT file redirects");
    };
    return { id, json, bytes };
  };
  return { accountId, forAccount };
}

export type ChatgptClient = ReturnType<Awaited<ReturnType<typeof connectChatgpt>>["forAccount"]>;
