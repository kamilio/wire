import type { JsonObject, RuntimeCapabilities } from "wire-core";

export async function asanaHttp(runtime: RuntimeCapabilities, url: URL, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await runtime.http.request(url, init);
    if (response.status !== 429 || (init.method ?? "GET") !== "GET" || attempt === 3) return response;
    const header = response.headers.get("retry-after");
    if (header === null || !/^\d+$/.test(header) || Number(header) > 120) return response;
    await response.body?.cancel();
    await new Promise<void>((resolve) => setTimeout(resolve, Number(header) * 1000));
  }
}

function asanaAuthError(): Error {
  return new Error("Asana authentication is missing or expired. Run `wire asana login` once; other commands reuse saved cookies.");
}

export async function request(runtime: RuntimeCapabilities, method: string, path: string, parameters?: Readonly<Record<string, string>>, data?: JsonObject): Promise<JsonObject> {
  const url = new URL(`https://app.asana.com/api/1.0${path}`);
  if (parameters !== undefined) for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  const cookies = await runtime.cookies.loadSaved("asana");
  if (cookies === null) throw asanaAuthError();
  const response = await asanaHttp(runtime, url, {
    method,
    headers: {
      Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    ...(data === undefined ? {} : { body: JSON.stringify({ data }) }),
  });
  if (response.status === 401) throw asanaAuthError();
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
  return await response.json() as JsonObject;
}

export async function paginate(runtime: RuntimeCapabilities, path: string, parameters: Readonly<Record<string, string>>): Promise<readonly JsonObject[]> {
  const values: JsonObject[] = [];
  let offset: string | undefined;
  do {
    const page = await request(runtime, "GET", path, offset === undefined ? parameters : { ...parameters, offset });
    values.push(...page["data"] as readonly JsonObject[]);
    const nextPage = page["next_page"] as JsonObject | null;
    offset = nextPage?.["offset"] as string | undefined;
  } while (offset !== undefined);
  return values;
}
