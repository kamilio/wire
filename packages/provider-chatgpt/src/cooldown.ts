import { setTimeout as delay } from "node:timers/promises";
import type { HttpCapability } from "wire-core";

export type Cooldown = {
  endpoint: string;
  status: number;
  attempt: number;
  delay_ms: number;
  retry_at: string;
  source: "retry-after-seconds" | "retry-after-date" | "exponential-backoff";
};

export class ChatgptCooldownError extends Error {
  constructor(readonly cooldown: Cooldown) {
    super(`ChatGPT is still rate-limited after ${cooldown.attempt} attempts. No further requests were sent. Retry no earlier than ${cooldown.retry_at} (${cooldown.source}).`);
  }
}

export function responseCooldown(response: Response, now: number, attempt: number, endpoint: string): Cooldown {
  const retryAfter = response.headers.get("retry-after")?.trim();
  let milliseconds = 1000 * 2 ** (attempt - 1);
  let source: Cooldown["source"] = "exponential-backoff";
  if (retryAfter !== undefined && /^\d+$/.test(retryAfter) && Number.isSafeInteger(Number(retryAfter) * 1000)) {
    milliseconds = Number(retryAfter) * 1000;
    source = "retry-after-seconds";
  } else if (retryAfter !== undefined && /^[A-Za-z]/.test(retryAfter) && Number.isFinite(Date.parse(retryAfter))) {
    const serverDate = Date.parse(response.headers.get("date") ?? "");
    milliseconds = Math.max(0, Date.parse(retryAfter) - (Number.isFinite(serverDate) ? serverDate : now));
    source = "retry-after-date";
  }
  if (!Number.isFinite(new Date(now + milliseconds).getTime())) {
    milliseconds = 1000 * 2 ** (attempt - 1);
    source = "exponential-backoff";
  }
  return { endpoint, status: response.status, attempt, delay_ms: milliseconds, retry_at: new Date(now + milliseconds).toISOString(), source };
}

export function createChatgptRequester(
  http: HttpCapability,
  onCooldown: (value: Cooldown) => Promise<void> = async () => {},
  timing = { now: () => Date.now(), sleep: (milliseconds: number) => delay(milliseconds) },
) {
  const deadlines = new Map<string, number>();
  let stopped: ChatgptCooldownError | undefined;
  return async (url: string, headers: Record<string, string>, endpoint: string): Promise<Response> => {
    if (stopped !== undefined) throw stopped;
    const origin = new URL(url).origin;
    for (let attempt = 1; ; attempt++) {
      while (timing.now() < (deadlines.get(origin) ?? 0)) await timing.sleep(Math.min(2147483647, deadlines.get(origin)! - timing.now()));
      const response = await http.request(url, { headers, redirect: "manual", signal: AbortSignal.timeout(60000) });
      if (![429, 500, 502, 503, 504].includes(response.status)) return response;
      const cooldown = responseCooldown(response, timing.now(), attempt, endpoint);
      deadlines.set(origin, Math.max(deadlines.get(origin) ?? 0, Date.parse(cooldown.retry_at)));
      await onCooldown(cooldown);
      if (attempt === 5) {
        if (response.status !== 429) return response;
        await response.body?.cancel();
        stopped = new ChatgptCooldownError(cooldown);
        throw stopped;
      }
      await response.body?.cancel();
    }
  };
}
