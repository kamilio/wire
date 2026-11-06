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
//# sourceMappingURL=asana-http.js.map