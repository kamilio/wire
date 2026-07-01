function frozenCookie(cookie) {
    return Object.freeze(cookie);
}
function cookieDomain(value, domain) {
    return "domain" in value ? value["domain"].toString() : domain;
}
function cookiePath(value) {
    return "path" in value ? value["path"].toString() : "/";
}
function cookieExpires(value) {
    if ("expires" in value)
        return Number(value["expires"]);
    if ("expirationDate" in value)
        return Number(value["expirationDate"]);
    return 0;
}
function cookieHttpOnly(value) {
    return "httpOnly" in value ? value["httpOnly"] === true : false;
}
function cookieSecure(value) {
    return "secure" in value ? value["secure"] === true : true;
}
function cookieIncludeSubdomains(value, domain) {
    if ("includeSubdomains" in value)
        return value["includeSubdomains"] === true;
    if ("hostOnly" in value)
        return value["hostOnly"] !== true;
    return domain.startsWith(".");
}
export function parseNetscapeCookies(contents) {
    return Object.freeze(contents.split(/\r?\n/).filter((line) => line.trim() !== "" && (!line.startsWith("#") || line.startsWith("#HttpOnly_"))).map((line) => {
        const httpOnly = line.startsWith("#HttpOnly_");
        const fields = (httpOnly ? line.slice("#HttpOnly_".length) : line).split("\t");
        return frozenCookie({
            domain: fields[0],
            includeSubdomains: fields[1] === "TRUE",
            path: fields[2],
            secure: fields[3] === "TRUE",
            expires: Number(fields[4]),
            name: fields[5],
            value: fields.slice(6).join("\t"),
            httpOnly,
        });
    }));
}
export function detectCookieFormat(contents) {
    const trimmed = contents.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("["))
        return "json";
    const netscapeLine = contents.split(/\r?\n/).find((line) => {
        if (line.trim() === "")
            return false;
        if (line.startsWith("#") && !line.startsWith("#HttpOnly_"))
            return false;
        const value = line.startsWith("#HttpOnly_") ? line.slice("#HttpOnly_".length) : line;
        return value.split("\t").length >= 7;
    });
    return netscapeLine === undefined ? "header" : "netscape";
}
function headerCookieText(contents) {
    const curlHeader = contents.match(/(?:-H|--header)\s+(['"])Cookie:\s*([\s\S]*?)\1/);
    if (curlHeader !== null)
        return curlHeader[2];
    const headerLine = contents.split(/\r?\n/).find((line) => line.toLowerCase().startsWith("cookie:"));
    return headerLine === undefined ? contents.trim() : headerLine.slice(headerLine.indexOf(":") + 1).trim();
}
export function parseCookieHeader(contents, domain) {
    return Object.freeze(headerCookieText(contents).split(";").map((pair) => pair.trim()).filter((pair) => pair !== "").map((pair) => {
        const index = pair.indexOf("=");
        if (index < 1)
            throw new Error(pair);
        return frozenCookie({
            domain,
            includeSubdomains: domain.startsWith("."),
            path: "/",
            secure: true,
            expires: 0,
            name: pair.slice(0, index),
            value: pair.slice(index + 1),
            httpOnly: false,
        });
    }));
}
function jsonCookie(value, domain) {
    const cookie = value;
    const resolvedDomain = cookieDomain(cookie, domain);
    return frozenCookie({
        domain: resolvedDomain,
        includeSubdomains: cookieIncludeSubdomains(cookie, resolvedDomain),
        path: cookiePath(cookie),
        secure: cookieSecure(cookie),
        expires: cookieExpires(cookie),
        name: cookie["name"].toString(),
        value: cookie["value"].toString(),
        httpOnly: cookieHttpOnly(cookie),
    });
}
export function parseJsonCookies(contents, domain) {
    const value = JSON.parse(contents);
    if (Array.isArray(value))
        return Object.freeze(value.map((cookie) => jsonCookie(cookie, domain)));
    const object = value;
    if (Array.isArray(object["cookies"]))
        return Object.freeze(object["cookies"].map((cookie) => jsonCookie(cookie, domain)));
    if ("name" in object && "value" in object)
        return Object.freeze([jsonCookie(object, domain)]);
    return Object.freeze(Object.entries(object).map(([name, cookieValue]) => frozenCookie({
        domain,
        includeSubdomains: domain.startsWith("."),
        path: "/",
        secure: true,
        expires: 0,
        name,
        value: cookieValue.toString(),
        httpOnly: false,
    })));
}
export function parsePastedCookies(contents, domain) {
    const format = detectCookieFormat(contents);
    if (format === "netscape")
        return parseNetscapeCookies(contents);
    if (format === "json")
        return parseJsonCookies(contents, domain);
    return parseCookieHeader(contents, domain);
}
export function parseCookieMetadata(contents) {
    return Object.freeze(Object.fromEntries(contents.split(/\r?\n/).filter((line) => line.startsWith("# wire\t")).map((line) => {
        const fields = line.split("\t");
        return [fields[1], fields.slice(2).join("\t")];
    })));
}
export function parsePastedCookieMetadata(contents) {
    const format = detectCookieFormat(contents);
    if (format === "netscape")
        return parseCookieMetadata(contents);
    if (format === "header")
        return Object.freeze({});
    const value = JSON.parse(contents);
    if (!("metadata" in value))
        return Object.freeze({});
    return Object.freeze(Object.fromEntries(Object.entries(value["metadata"]).map(([name, metadataValue]) => [name, metadataValue.toString()])));
}
export function cookiesDirectory(home) {
    return `${home}/.wire/auth`;
}
export function cookiesFile(home, service) {
    return `${cookiesDirectory(home)}/${service}_cookies.txt`;
}
export function repositoryCookiesFile(repositoryRoot, service) {
    return `${repositoryRoot}/${service}_cookies.txt`;
}
async function existingCookiesFile(filesystem, paths) {
    for (const path of paths)
        if (await filesystem.exists(path))
            return path;
    return null;
}
export function serializeNetscapeCookies(cookies, metadata) {
    return `${["# Netscape HTTP Cookie File", ...Object.entries(metadata).map(([name, value]) => `# wire\t${name}\t${value}`), ...cookies.map((cookie) => `${cookie.httpOnly ? "#HttpOnly_" : ""}${cookie.domain}\t${cookie.includeSubdomains ? "TRUE" : "FALSE"}\t${cookie.path}\t${cookie.secure ? "TRUE" : "FALSE"}\t${cookie.expires}\t${cookie.name}\t${cookie.value}`)].join("\n")}\n`;
}
export function createCookiesCapability(filesystem, home, repositoryRoot, overrideFile) {
    const paths = (service) => {
        const overridePath = overrideFile?.(service);
        const repositoryRootPath = repositoryRoot?.();
        return [
            ...(overridePath === undefined ? [] : [overridePath]),
            ...(repositoryRootPath === undefined ? [] : [repositoryCookiesFile(repositoryRootPath, service)]),
            cookiesFile(home(), service),
        ];
    };
    return Object.freeze({
        loadSaved: async (service) => {
            const path = await existingCookiesFile(filesystem, paths(service));
            return path === null ? null : parseNetscapeCookies(await filesystem.readText(path));
        },
        load: async (service) => {
            const path = await existingCookiesFile(filesystem, paths(service));
            if (path !== null)
                return parseNetscapeCookies(await filesystem.readText(path));
            throw new Error(`${service} cookie authentication is missing. Run \`wire ${service} login\` once; other commands reuse saved cookies.`);
        },
        metadata: async (service) => {
            const path = await existingCookiesFile(filesystem, paths(service));
            if (path === null)
                throw new Error(`${service} cookie authentication is missing. Run \`wire ${service} login\` once; other commands reuse saved cookies.`);
            return parseCookieMetadata(await filesystem.readText(path));
        },
        save: async (service, cookies, metadata) => {
            const candidatePaths = paths(service);
            const contents = serializeNetscapeCookies(cookies, metadata);
            const existingPaths = [];
            for (const path of candidatePaths)
                if (await filesystem.exists(path))
                    existingPaths.push(path);
            for (const path of existingPaths.length === 0 ? [candidatePaths[0]] : existingPaths)
                await filesystem.writeText(path, contents);
        },
        delete: async (service) => {
            for (const path of paths(service))
                if (await filesystem.exists(path))
                    await filesystem.delete(path);
        },
    });
}
//# sourceMappingURL=cookies.js.map