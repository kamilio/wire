import type { RuntimeCapabilities } from "wire-core";

// Node fetch advertises a transport failure through its cause, not its message.
const transient = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT"]);

const permanent = new Set(["ENOTFOUND", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"]);

// Only idempotent GETs. Retrying a batch or browser save can apply it twice.
export async function googleRead(runtime: RuntimeCapabilities, url: string | URL, init: { headers?: HeadersInit; redirect?: RequestRedirect }): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await runtime.http.request(url, init);
    } catch (error) {
      const cause = error instanceof TypeError && error.name === "TypeError" ? error.cause : undefined;
      const code = cause instanceof Error && "code" in cause ? cause.code : undefined;
      if (typeof code !== "string" || !transient.has(code)) {
        // A URL, cookie or signed redirect can appear in transport errors.
        if ((error instanceof Error && error.name === "AbortError") || code === "ABORT_ERR") throw new Error("Google Docs read cancelled.");
        if (typeof code === "string" && permanent.has(code)) throw new Error(`Google Docs read failed before a response (${code}).`);
        throw new Error("Google Docs read failed before a response.");
      }
      if (attempt >= 3) throw new Error(`Google Docs read failed before a response (${code}).`);
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    if (![429, 500, 502, 503, 504].includes(response.status)) return response;
    const header = response.headers.get("retry-after")?.trim();
    const seconds = header && /^\d+$/.test(header) ? Number(header) : undefined;
    const date = header && /^[A-Za-z]/.test(header) ? Date.parse(header) : NaN;
    const delay = seconds !== undefined ? seconds * 1000 : Number.isFinite(date) ? Math.max(0, date - runtime.clock.now().getTime()) : 1000 * 2 ** attempt;
    if (attempt >= 3 || delay > 30_000) {
      if (response.status === 429) {
        await response.body?.cancel();
        throw new Error(`Google Docs read rate limited (HTTP 429); retry after ${Math.ceil(delay / 1000)} seconds.`);
      }
      return response;
    }
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
