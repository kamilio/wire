// Only idempotent GETs. Retrying a batch or browser save can apply it twice.
export async function googleRead(runtime, url, init) {
    for (let attempt = 0;; attempt++) {
        const response = await runtime.http.request(url, init);
        if (![429, 500, 502, 503, 504].includes(response.status))
            return response;
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
//# sourceMappingURL=google-read.js.map