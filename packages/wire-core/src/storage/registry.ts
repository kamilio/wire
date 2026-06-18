import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { open, readdir, readFile, rename, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { stableJsonCompact, stableJsonPretty } from "../core/json.js";
import type { JsonObject, JsonValue, Registry, Resource, ResourceType } from "../core/model.js";
import { normalizeResource } from "../core/resource.js";

type ResourceRow = Readonly<{ id: string; type: ResourceType }>;
type IdentifierRow = Readonly<{ service: string; identifier: string }>;
type UrlRow = Readonly<{ url: string }>;
type LinkRow = Readonly<{ path: string; role: string; data_json: string }>;
type DataRow = Readonly<{ namespace: string; key: string; value_json: string }>;
type RelationshipRow = Readonly<{ target_id: string; type: string; data_json: string }>;
type ResourceIdRow = Readonly<{ resource_id: string }>;
type IdRow = Readonly<{ id: string }>;
type SqliteModule = Readonly<{ DatabaseSync: new (path: string) => DatabaseSync }>;

const require = createRequire(import.meta.url);

function compareStrings(left: string, right: string): number {
  const leftCodePoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightCodePoints = Array.from(right, (character) => character.codePointAt(0)!);
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftCodePoints[index]! - rightCodePoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftCodePoints.length - rightCodePoints.length;
}

function storageResource(resource: Resource): Resource {
  return normalizeResource({
    ...resource,
    filesystem_links: resource.filesystem_links.map((link) => ({ ...link, path: link.path.replaceAll(sep, "/") })),
  });
}

function fileResourceName(resourceId: string): string {
  if (resourceId !== "." && resourceId !== ".." && !resourceId.includes("/") && !resourceId.includes("\\") && !resourceId.includes("\0")) return `${resourceId}.json`;
  return `~${Buffer.from(resourceId).toString("base64url")}.json`;
}

function parseResource(value: string): Resource {
  return JSON.parse(value) as Resource;
}

function assertUnique<T>(values: readonly T[]): void {
  if (new Set(values).size !== values.length) throw new Error(JSON.stringify(values));
}

function assertUniqueFileResource(resource: Resource): void {
  assertUnique(resource.identifiers.map((identifier) => JSON.stringify([identifier.service, identifier.identifier])));
  assertUnique(resource.urls);
  assertUnique(resource.filesystem_links.map((link) => JSON.stringify([link.path, link.role])));
  assertUnique(resource.data.map((item) => JSON.stringify([item.namespace, item.key])));
  assertUnique(resource.relationships.map((relationship) => JSON.stringify([resource.id, relationship.target_id, relationship.type])));
}

function missingResource(resourceId: string): Error {
  return new Error(`Resource not found: ${resourceId}`);
}

function missingIdentifier(service: string, identifier: string): Error {
  return new Error(`Resource identifier not found: ${service}/${identifier}`);
}

function missingUrl(url: string): Error {
  return new Error(`Resource URL not found: ${url}`);
}

export class SqliteRegistry implements Registry {
  readonly path: string;

  constructor(path: string) {
    this.path = realpathSyncParent(path);
    using database = this.connect();
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

  async put(resource: Resource): Promise<Resource> {
    const normalized = storageResource(resource);
    using database = this.connect();
    database.exec("BEGIN");
    database.prepare("INSERT INTO resources (id, type) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET type=excluded.type").run(normalized.id, normalized.type);
    database.prepare("DELETE FROM resource_identifiers WHERE resource_id = ?").run(normalized.id);
    database.prepare("DELETE FROM resource_urls WHERE resource_id = ?").run(normalized.id);
    database.prepare("DELETE FROM filesystem_links WHERE resource_id = ?").run(normalized.id);
    database.prepare("DELETE FROM resource_data WHERE resource_id = ?").run(normalized.id);
    database.prepare("DELETE FROM resource_relationships WHERE source_id = ?").run(normalized.id);
    const insertIdentifier = database.prepare("INSERT INTO resource_identifiers (resource_id, service, identifier) VALUES (?, ?, ?)");
    for (const item of normalized.identifiers) insertIdentifier.run(normalized.id, item.service, item.identifier);
    const insertUrl = database.prepare("INSERT INTO resource_urls (resource_id, url) VALUES (?, ?)");
    for (const url of normalized.urls) insertUrl.run(normalized.id, url);
    const insertLink = database.prepare("INSERT INTO filesystem_links (resource_id, path, role, data_json) VALUES (?, ?, ?, ?)");
    for (const link of normalized.filesystem_links) insertLink.run(normalized.id, link.path, link.role, stableJsonCompact(link.data));
    const insertData = database.prepare("INSERT INTO resource_data (resource_id, namespace, key, value_json) VALUES (?, ?, ?, ?)");
    for (const item of normalized.data) insertData.run(normalized.id, item.namespace, item.key, stableJsonCompact(item.value));
    const insertRelationship = database.prepare("INSERT INTO resource_relationships (source_id, target_id, type, data_json) VALUES (?, ?, ?, ?)");
    for (const relationship of normalized.relationships) insertRelationship.run(normalized.id, relationship.target_id, relationship.type, stableJsonCompact(relationship.data));
    database.exec("COMMIT");
    return normalized;
  }

  async get(resourceId: string): Promise<Resource> {
    using database = this.connect();
    database.exec("BEGIN");
    const resource = this.getResource(database, resourceId);
    database.exec("COMMIT");
    return resource;
  }

  async findByIdentifier(service: string, identifier: string): Promise<Resource> {
    using database = this.connect();
    database.exec("BEGIN");
    const row = database.prepare("SELECT resource_id FROM resource_identifiers WHERE service = ? AND identifier = ?").get(service, identifier) as ResourceIdRow | undefined;
    if (row === undefined) throw missingIdentifier(service, identifier);
    const resource = this.getResource(database, row.resource_id);
    database.exec("COMMIT");
    return resource;
  }

  async findByUrl(url: string): Promise<Resource> {
    using database = this.connect();
    database.exec("BEGIN");
    const row = database.prepare("SELECT resource_id FROM resource_urls WHERE url = ?").get(url) as ResourceIdRow | undefined;
    if (row === undefined) throw missingUrl(url);
    const resource = this.getResource(database, row.resource_id);
    database.exec("COMMIT");
    return resource;
  }

  async findByPath(path: string): Promise<readonly Resource[]> {
    using database = this.connect();
    database.exec("BEGIN");
    const rows = database.prepare("SELECT DISTINCT resource_id FROM filesystem_links WHERE path = ? ORDER BY resource_id").all(path.replaceAll(sep, "/")) as ResourceIdRow[];
    const resources = rows.map((row) => this.getResource(database, row.resource_id));
    database.exec("COMMIT");
    return resources;
  }

  async listResources(): Promise<readonly Resource[]> {
    using database = this.connect();
    database.exec("BEGIN");
    const rows = database.prepare("SELECT id FROM resources ORDER BY id").all() as IdRow[];
    const resources = rows.map((row) => this.getResource(database, row.id));
    database.exec("COMMIT");
    return resources;
  }

  async delete(resourceId: string): Promise<void> {
    using database = this.connect();
    database.prepare("DELETE FROM resources WHERE id = ?").run(resourceId);
  }

  private getResource(database: DatabaseSync, resourceId: string): Resource {
    const row = database.prepare("SELECT id, type FROM resources WHERE id = ?").get(resourceId) as ResourceRow | undefined;
    if (row === undefined) throw missingResource(resourceId);
    const identifiers = database.prepare("SELECT service, identifier FROM resource_identifiers WHERE resource_id = ? ORDER BY service, identifier").all(resourceId) as IdentifierRow[];
    const urls = database.prepare("SELECT url FROM resource_urls WHERE resource_id = ? ORDER BY url").all(resourceId) as UrlRow[];
    const links = database.prepare("SELECT path, role, data_json FROM filesystem_links WHERE resource_id = ? ORDER BY path, role").all(resourceId) as LinkRow[];
    const data = database.prepare("SELECT namespace, key, value_json FROM resource_data WHERE resource_id = ? ORDER BY namespace, key").all(resourceId) as DataRow[];
    const relationships = database.prepare("SELECT target_id, type, data_json FROM resource_relationships WHERE source_id = ? ORDER BY type, target_id").all(resourceId) as RelationshipRow[];
    return {
      id: row.id,
      type: row.type,
      identifiers: identifiers.map((identifier) => ({ service: identifier.service, identifier: identifier.identifier })),
      urls: urls.map((item) => item.url),
      filesystem_links: links.map((link) => ({ path: link.path, role: link.role, data: JSON.parse(link.data_json) as JsonObject })),
      data: data.map((item) => ({ namespace: item.namespace, key: item.key, value: JSON.parse(item.value_json) as JsonValue })),
      relationships: relationships.map((relationship) => ({ target_id: relationship.target_id, type: relationship.type, data: JSON.parse(relationship.data_json) as JsonObject })),
    };
  }

  private connect(): DatabaseSync {
    const database = new (require("node:sqlite") as SqliteModule).DatabaseSync(this.path);
    database.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
    return database;
  }
}

export class FileRegistry implements Registry {
  readonly path: string;

  constructor(path: string) {
    this.path = realpathSyncDirectory(path);
  }

  async put(resource: Resource): Promise<Resource> {
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
      if (existingUrls.has(url)) throw new Error(url);
    }
    const tempPath = join(this.path, randomUUID());
    {
      await using handle = await open(tempPath, "wx", 0o600);
      await handle.writeFile(`${stableJsonPretty(normalized)}\n`, "utf8");
    }
    await rename(tempPath, this.resourcePath(normalized.id));
    return normalized;
  }

  async get(resourceId: string): Promise<Resource> {
    if (!existsSync(this.resourcePath(resourceId))) throw missingResource(resourceId);
    return parseResource(await readFile(this.resourcePath(resourceId), "utf8"));
  }

  async findByIdentifier(service: string, identifier: string): Promise<Resource> {
    const resource = (await this.listResources()).find((item) => item.identifiers.some((value) => value.service === service && value.identifier === identifier));
    if (resource === undefined) throw missingIdentifier(service, identifier);
    return this.get(resource.id);
  }

  async findByUrl(url: string): Promise<Resource> {
    const resource = (await this.listResources()).find((item) => item.urls.includes(url));
    if (resource === undefined) throw missingUrl(url);
    return this.get(resource.id);
  }

  async findByPath(path: string): Promise<readonly Resource[]> {
    const normalizedPath = path.replaceAll(sep, "/");
    return (await this.listResources()).filter((resource) => resource.filesystem_links.some((link) => link.path === normalizedPath));
  }

  async listResources(): Promise<readonly Resource[]> {
    const filenames = (await readdir(this.path)).filter((filename) => extname(filename) === ".json").sort(compareStrings);
    const resources = await Promise.all(filenames.map(async (filename) => parseResource(await readFile(join(this.path, filename), "utf8"))));
    return resources.sort((left, right) => compareStrings(left.id, right.id));
  }

  async delete(resourceId: string): Promise<void> {
    await unlink(this.resourcePath(resourceId));
  }

  private resourcePath(resourceId: string): string {
    return join(this.path, fileResourceName(resourceId));
  }
}

function realpathSyncParent(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  return join(realpathSync(parent), basename(path));
}

function realpathSyncDirectory(path: string): string {
  mkdirSync(path, { recursive: true });
  return realpathSync(path);
}
