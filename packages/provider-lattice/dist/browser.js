export async function browser(runtime, url, work) {
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
    const query = async (fields, vars = {}) => {
        const data = {
            id: "WireLatticeRead",
            query: "query WireLatticeRead " + fields,
            variables: vars,
        };
        const code = `async page=>{const r=await page.request.post(${JSON.stringify(url.origin + "/graphql")},{maxRedirects:0,data:${JSON.stringify(data)}});return r.headers()["content-type"]?.includes("json") ? await r.json() : {errors:[{message:"Lattice HTTP "+r.status()+": sign in to this workspace in Chrome."}]}}`;
        const result = JSON.parse((await runtime.process.execute("playwright-cli", [...args, "run-code", code])).stdout, (key, value) => key === "name" && typeof value === "string" ? value.replace(/\s*\(deactivated\)\s*$/i, "") : value);
        if (result.errors?.length)
            throw new Error(result.errors.map((e) => e.message).join("; "));
        return result.data;
    };
    try {
        return await work(query, args);
    }
    finally {
        await runtime.process.execute("playwright-cli", [...args, "detach"]);
    }
}
//# sourceMappingURL=browser.js.map