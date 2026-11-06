export async function asanaHttp(runtime, url, init) {
    for (let attempt = 0;; attempt++) {
        const response = await runtime.http.request(url, init);
        if (response.status !== 429 || (init.method ?? "GET") !== "GET" || attempt === 3)
            return response;
        const header = response.headers.get("retry-after");
        if (header === null || !/^\d+$/.test(header) || Number(header) > 120)
            return response;
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, Number(header) * 1000));
    }
}
function asanaAuthError() {
    return new Error("Asana authentication is missing or expired. Run `wire asana login` once; other commands reuse saved cookies.");
}
export async function request(runtime, method, path, parameters, data) {
    const url = new URL(`https://app.asana.com/api/1.0${path}`);
    if (parameters !== undefined)
        for (const [name, value] of Object.entries(parameters))
            url.searchParams.set(name, value);
    const cookies = await runtime.cookies.loadSaved("asana");
    if (cookies === null)
        throw asanaAuthError();
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
    if (response.status === 401)
        throw asanaAuthError();
    if (!response.ok)
        throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
    return await response.json();
}
export async function paginate(runtime, path, parameters) {
    const values = [];
    let offset;
    do {
        const page = await request(runtime, "GET", path, offset === undefined ? parameters : { ...parameters, offset });
        values.push(...page["data"]);
        const nextPage = page["next_page"];
        offset = nextPage?.["offset"];
    } while (offset !== undefined);
    return values;
}
//# sourceMappingURL=asana-http.js.map