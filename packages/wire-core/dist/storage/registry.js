var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { open, readdir, readFile, rename, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, sep } from "node:path";
import { stableJsonCompact, stableJsonPretty } from "../core/json.js";
import { normalizeResource } from "../core/resource.js";
const require = createRequire(import.meta.url);
function compareStrings(left, right) {
    const leftCodePoints = Array.from(left, (character) => character.codePointAt(0));
    const rightCodePoints = Array.from(right, (character) => character.codePointAt(0));
    const length = Math.min(leftCodePoints.length, rightCodePoints.length);
    for (let index = 0; index < length; index += 1) {
        const difference = leftCodePoints[index] - rightCodePoints[index];
        if (difference !== 0)
            return difference;
    }
    return leftCodePoints.length - rightCodePoints.length;
}
function storageResource(resource) {
    return normalizeResource({
        ...resource,
        filesystem_links: resource.filesystem_links.map((link) => ({ ...link, path: link.path.replaceAll(sep, "/") })),
    });
}
function fileResourceName(resourceId) {
    if (resourceId !== "." && resourceId !== ".." && !resourceId.includes("/") && !resourceId.includes("\\") && !resourceId.includes("\0"))
        return `${resourceId}.json`;
    return `~${Buffer.from(resourceId).toString("base64url")}.json`;
}
function parseResource(value) {
    return JSON.parse(value);
}
function assertUnique(values) {
    if (new Set(values).size !== values.length)
        throw new Error(JSON.stringify(values));
}
function assertUniqueFileResource(resource) {
    assertUnique(resource.identifiers.map((identifier) => JSON.stringify([identifier.service, identifier.identifier])));
    assertUnique(resource.urls);
    assertUnique(resource.filesystem_links.map((link) => JSON.stringify([link.path, link.role])));
    assertUnique(resource.data.map((item) => JSON.stringify([item.namespace, item.key])));
    assertUnique(resource.relationships.map((relationship) => JSON.stringify([resource.id, relationship.target_id, relationship.type])));
}
function missingResource(resourceId) {
    return new Error(`Resource not found: ${resourceId}`);
}
function missingIdentifier(service, identifier) {
    return new Error(`Resource identifier not found: ${service}/${identifier}`);
}
function missingUrl(url) {
    return new Error(`Resource URL not found: ${url}`);
}
export class SqliteRegistry {
    path;
    constructor(path) {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            this.path = realpathSyncParent(path);
            const database = __addDisposableResource(env_1, this.connect(), false);
            database.exec(`
      PRAGMA journal_mode=DELETE;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resource_identifiers (
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        service TEXT NOT NULL,
        identifier TEXT NOT NULL,
        PRIMARY KEY (service, identifier),
        UNIQUE (resource_id, service, identifier)
      );
      CREATE TABLE IF NOT EXISTS resource_urls (
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        url TEXT NOT NULL PRIMARY KEY,
        UNIQUE (resource_id, url)
      );
      CREATE TABLE IF NOT EXISTS filesystem_links (
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        role TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (resource_id, path, role)
      );
      CREATE INDEX IF NOT EXISTS filesystem_links_path ON filesystem_links(path);
      CREATE TABLE IF NOT EXISTS resource_data (
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        PRIMARY KEY (resource_id, namespace, key)
      );
      CREATE TABLE IF NOT EXISTS resource_relationships (
        source_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL,
        type TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (source_id, target_id, type)
      );
      CREATE INDEX IF NOT EXISTS resource_relationships_target ON resource_relationships(target_id);
    `);
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    async put(resource) {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const normalized = storageResource(resource);
            const database = __addDisposableResource(env_2, this.connect(), false);
            database.exec("BEGIN");
            database.prepare("INSERT INTO resources (id, type) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET type=excluded.type").run(normalized.id, normalized.type);
            database.prepare("DELETE FROM resource_identifiers WHERE resource_id = ?").run(normalized.id);
            database.prepare("DELETE FROM resource_urls WHERE resource_id = ?").run(normalized.id);
            database.prepare("DELETE FROM filesystem_links WHERE resource_id = ?").run(normalized.id);
            database.prepare("DELETE FROM resource_data WHERE resource_id = ?").run(normalized.id);
            database.prepare("DELETE FROM resource_relationships WHERE source_id = ?").run(normalized.id);
            const insertIdentifier = database.prepare("INSERT INTO resource_identifiers (resource_id, service, identifier) VALUES (?, ?, ?)");
            for (const item of normalized.identifiers)
                insertIdentifier.run(normalized.id, item.service, item.identifier);
            const insertUrl = database.prepare("INSERT INTO resource_urls (resource_id, url) VALUES (?, ?)");
            for (const url of normalized.urls)
                insertUrl.run(normalized.id, url);
            const insertLink = database.prepare("INSERT INTO filesystem_links (resource_id, path, role, data_json) VALUES (?, ?, ?, ?)");
            for (const link of normalized.filesystem_links)
                insertLink.run(normalized.id, link.path, link.role, stableJsonCompact(link.data));
            const insertData = database.prepare("INSERT INTO resource_data (resource_id, namespace, key, value_json) VALUES (?, ?, ?, ?)");
            for (const item of normalized.data)
                insertData.run(normalized.id, item.namespace, item.key, stableJsonCompact(item.value));
            const insertRelationship = database.prepare("INSERT INTO resource_relationships (source_id, target_id, type, data_json) VALUES (?, ?, ?, ?)");
            for (const relationship of normalized.relationships)
                insertRelationship.run(normalized.id, relationship.target_id, relationship.type, stableJsonCompact(relationship.data));
            database.exec("COMMIT");
            return normalized;
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    }
    async get(resourceId) {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const database = __addDisposableResource(env_3, this.connect(), false);
            database.exec("BEGIN");
            const resource = this.getResource(database, resourceId);
            database.exec("COMMIT");
            return resource;
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    }
    async findByIdentifier(service, identifier) {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const database = __addDisposableResource(env_4, this.connect(), false);
            database.exec("BEGIN");
            const row = database.prepare("SELECT resource_id FROM resource_identifiers WHERE service = ? AND identifier = ?").get(service, identifier);
            if (row === undefined)
                throw missingIdentifier(service, identifier);
            const resource = this.getResource(database, row.resource_id);
            database.exec("COMMIT");
            return resource;
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            __disposeResources(env_4);
        }
    }
    async findByUrl(url) {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const database = __addDisposableResource(env_5, this.connect(), false);
            database.exec("BEGIN");
            const row = database.prepare("SELECT resource_id FROM resource_urls WHERE url = ?").get(url);
            if (row === undefined)
                throw missingUrl(url);
            const resource = this.getResource(database, row.resource_id);
            database.exec("COMMIT");
            return resource;
        }
        catch (e_5) {
            env_5.error = e_5;
            env_5.hasError = true;
        }
        finally {
            __disposeResources(env_5);
        }
    }
    async findByPath(path) {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            const database = __addDisposableResource(env_6, this.connect(), false);
            database.exec("BEGIN");
            const rows = database.prepare("SELECT DISTINCT resource_id FROM filesystem_links WHERE path = ? ORDER BY resource_id").all(path.replaceAll(sep, "/"));
            const resources = rows.map((row) => this.getResource(database, row.resource_id));
            database.exec("COMMIT");
            return resources;
        }
        catch (e_6) {
            env_6.error = e_6;
            env_6.hasError = true;
        }
        finally {
            __disposeResources(env_6);
        }
    }
    async listResources() {
        const env_7 = { stack: [], error: void 0, hasError: false };
        try {
            const database = __addDisposableResource(env_7, this.connect(), false);
            database.exec("BEGIN");
            const rows = database.prepare("SELECT id FROM resources ORDER BY id").all();
            const resources = rows.map((row) => this.getResource(database, row.id));
            database.exec("COMMIT");
            return resources;
        }
        catch (e_7) {
            env_7.error = e_7;
            env_7.hasError = true;
        }
        finally {
            __disposeResources(env_7);
        }
    }
    async delete(resourceId) {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const database = __addDisposableResource(env_8, this.connect(), false);
            database.prepare("DELETE FROM resources WHERE id = ?").run(resourceId);
        }
        catch (e_8) {
            env_8.error = e_8;
            env_8.hasError = true;
        }
        finally {
            __disposeResources(env_8);
        }
    }
    getResource(database, resourceId) {
        const row = database.prepare("SELECT id, type FROM resources WHERE id = ?").get(resourceId);
        if (row === undefined)
            throw missingResource(resourceId);
        const identifiers = database.prepare("SELECT service, identifier FROM resource_identifiers WHERE resource_id = ? ORDER BY service, identifier").all(resourceId);
        const urls = database.prepare("SELECT url FROM resource_urls WHERE resource_id = ? ORDER BY url").all(resourceId);
        const links = database.prepare("SELECT path, role, data_json FROM filesystem_links WHERE resource_id = ? ORDER BY path, role").all(resourceId);
        const data = database.prepare("SELECT namespace, key, value_json FROM resource_data WHERE resource_id = ? ORDER BY namespace, key").all(resourceId);
        const relationships = database.prepare("SELECT target_id, type, data_json FROM resource_relationships WHERE source_id = ? ORDER BY type, target_id").all(resourceId);
        return {
            id: row.id,
            type: row.type,
            identifiers: identifiers.map((identifier) => ({ service: identifier.service, identifier: identifier.identifier })),
            urls: urls.map((item) => item.url),
            filesystem_links: links.map((link) => ({ path: link.path, role: link.role, data: JSON.parse(link.data_json) })),
            data: data.map((item) => ({ namespace: item.namespace, key: item.key, value: JSON.parse(item.value_json) })),
            relationships: relationships.map((relationship) => ({ target_id: relationship.target_id, type: relationship.type, data: JSON.parse(relationship.data_json) })),
        };
    }
    connect() {
        const database = new (require("node:sqlite").DatabaseSync)(this.path);
        database.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
        return database;
    }
}
export class FileRegistry {
    path;
    constructor(path) {
        this.path = realpathSyncDirectory(path);
    }
    async put(resource) {
        const normalized = storageResource(resource);
        assertUniqueFileResource(normalized);
        const existingResources = (await this.listResources()).filter((existing) => existing.id !== normalized.id);
        const existingUrls = new Set(existingResources.flatMap((existing) => existing.urls));
        for (const identifier of normalized.identifiers) {
            if (existingResources.some((existing) => existing.identifiers.some((item) => item.service === identifier.service && item.identifier === identifier.identifier))) {
                throw new Error(`${identifier.service}/${identifier.identifier}`);
            }
        }
        for (const url of normalized.urls) {
            if (existingUrls.has(url))
                throw new Error(url);
        }
        const tempPath = join(this.path, randomUUID());
        {
            const env_9 = { stack: [], error: void 0, hasError: false };
            try {
                const handle = __addDisposableResource(env_9, await open(tempPath, "wx", 0o600), true);
                await handle.writeFile(`${stableJsonPretty(normalized)}\n`, "utf8");
            }
            catch (e_9) {
                env_9.error = e_9;
                env_9.hasError = true;
            }
            finally {
                const result_1 = __disposeResources(env_9);
                if (result_1)
                    await result_1;
            }
        }
        await rename(tempPath, this.resourcePath(normalized.id));
        return normalized;
    }
    async get(resourceId) {
        if (!existsSync(this.resourcePath(resourceId)))
            throw missingResource(resourceId);
        return parseResource(await readFile(this.resourcePath(resourceId), "utf8"));
    }
    async findByIdentifier(service, identifier) {
        const resource = (await this.listResources()).find((item) => item.identifiers.some((value) => value.service === service && value.identifier === identifier));
        if (resource === undefined)
            throw missingIdentifier(service, identifier);
        return this.get(resource.id);
    }
    async findByUrl(url) {
        const resource = (await this.listResources()).find((item) => item.urls.includes(url));
        if (resource === undefined)
            throw missingUrl(url);
        return this.get(resource.id);
    }
    async findByPath(path) {
        const normalizedPath = path.replaceAll(sep, "/");
        return (await this.listResources()).filter((resource) => resource.filesystem_links.some((link) => link.path === normalizedPath));
    }
    async listResources() {
        const filenames = (await readdir(this.path)).filter((filename) => extname(filename) === ".json").sort(compareStrings);
        const resources = await Promise.all(filenames.map(async (filename) => parseResource(await readFile(join(this.path, filename), "utf8"))));
        return resources.sort((left, right) => compareStrings(left.id, right.id));
    }
    async delete(resourceId) {
        await unlink(this.resourcePath(resourceId));
    }
    resourcePath(resourceId) {
        return join(this.path, fileResourceName(resourceId));
    }
}
function realpathSyncParent(path) {
    if (existsSync(path))
        return realpathSync(path);
    const parent = dirname(path);
    mkdirSync(parent, { recursive: true });
    return join(realpathSync(parent), basename(path));
}
function realpathSyncDirectory(path) {
    mkdirSync(path, { recursive: true });
    return realpathSync(path);
}
//# sourceMappingURL=registry.js.map