import type { RuntimeCapabilities } from "wire-core";

export type Query = <R>(fields: string, vars?: Record<string, string | null>) => Promise<R>;

export async function browser<T>(
  runtime: RuntimeCapabilities,
  url: URL,
  work: (query: Query, args: string[]) => Promise<T>,
): Promise<T> {
  const session = "-s=lattice-" + crypto.randomUUID();
  const args = [session, "--raw"];
  await runtime.process.execute("hey-browser", [
    "run",
    "--",
    "playwright-cli",
    ...args,
    "attach",
    "--extension=chrome",
  ]);
  const query = async <T>(fields: string, vars: Record<string, string | null> = {}): Promise<T> => {
    const data = {
      id: "WireLatticeRead",
      query: "query WireLatticeRead " + fields,
      variables: vars,
    };
    const code = `async page=>{const r=await page.request.post(${JSON.stringify(url.origin + "/graphql")},{maxRedirects:0,data:${JSON.stringify(data)}});return r.headers()["content-type"]?.includes("json") ? await r.json() : {errors:[{message:"Lattice HTTP "+r.status()+": sign in to this workspace in Chrome."}]}}`;
    const result = JSON.parse(
      (await runtime.process.execute("playwright-cli", [...args, "run-code", code])).stdout,
      (key, value) =>
        key === "name" && typeof value === "string" ? value.replace(/\s*\(deactivated\)\s*$/i, "") : value,
    );
    if (result.errors?.length)
      throw new Error(result.errors.map((e: { message: string }) => e.message).join("; "));
    return result.data as T;
  };
  try {
    return await work(query, args);
  } finally {
    await runtime.process.execute("playwright-cli", [...args, "detach"]);
  }
}
