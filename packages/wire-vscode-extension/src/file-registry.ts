import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeResource, stableJsonPretty, type Registry, type Resource } from "wire-core";

function fileResourceName(resourceId: string): string {
  if (resourceId !== "." && resourceId !== ".." && !resourceId.includes("/") && !resourceId.includes("\\") && !resourceId.includes("\0")) return `${resourceId}.json`;
  return `~${Buffer.from(resourceId).toString("base64url")}.json`;
}

function assertUnique<T>(values: readonly T[]): void {
  if (new Set(values).size !== values.length) throw new Error(JSON.stringify(values));
}

function assertUniqueResource(resource: Resource): void {
  assertUnique(resource.identifiers.map((identifier) => JSON.stringify([identifier.service, identifier.identifier])));
  assertUnique(resource.urls);
  assertUnique(resource.filesystem_links.map((link) => JSON.stringify([link.path, link.role])));
  assertUnique(resource.data.map((item) => JSON.stringify([item.namespace, item.key])));
  assertUnique(resource.relationships.map((relationship) => JSON.stringify([resource.id, relationship.target_id, relationship.type])));
}

export class FileRegistry implements Registry {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  async put(resource: Resource): Promise<Resource> {
    const normalized = normalizeResource({
      ...resource,
      filesystem_links: resource.filesystem_links.map((link) => ({ ...link, path: link.path.replaceAll("\\", "/") }))
    });
    assertUniqueResource(normalized);
    const existing = (await this.listResources()).filter((item) => item.id !== normalized.id);
    for (const identifier of normalized.identifiers) {
      if (existing.some((item) => item.identifiers.some((candidate) => candidate.service === identifier.service && candidate.identifier === identifier.identifier))) throw new Error(`Duplicate identifier: ${identifier.service}/${identifier.identifier}`);
    }
    for (const url of normalized.urls) {
      if (existing.some((item) => item.urls.includes(url))) throw new Error(`Duplicate URL: ${url}`);
    }
    await mkdir(this.path, { recursive: true });
    await writeFile(this.resourcePath(normalized.id), `${stableJsonPretty(normalized)}\n`, "utf8");
    return normalized;
  }

  async get(resourceId: string): Promise<Resource> {
    return normalizeResource(JSON.parse(await readFile(this.resourcePath(resourceId), "utf8")) as Resource);
  }

  async findByIdentifier(service: string, identifier: string): Promise<Resource> {
    const resource = (await this.listResources()).find((item) => item.identifiers.some((candidate) => candidate.service === service && candidate.identifier === identifier));
    if (resource === undefined) throw new Error(`Resource identifier not found: ${service}/${identifier}`);
    return resource;
  }

  async findByUrl(url: string): Promise<Resource> {
    const resource = (await this.listResources()).find((item) => item.urls.includes(url));
    if (resource === undefined) throw new Error(`Resource URL not found: ${url}`);
    return resource;
  }

  async findByPath(path: string): Promise<readonly Resource[]> {
    return (await this.listResources()).filter((resource) => resource.filesystem_links.some((link) => link.path === path.replaceAll("\\", "/")));
  }

  async listResources(): Promise<readonly Resource[]> {
    await mkdir(this.path, { recursive: true });
    const filenames = (await readdir(this.path)).filter((filename) => filename.endsWith(".json")).sort();
    const resources = await Promise.all(filenames.map(async (filename) => normalizeResource(JSON.parse(await readFile(join(this.path, filename), "utf8")) as Resource)));
    return resources.sort((left, right) => left.id.localeCompare(right.id));
  }

  async delete(resourceId: string): Promise<void> {
    await rm(this.resourcePath(resourceId), { force: true });
  }

  private resourcePath(resourceId: string): string {
    return join(this.path, fileResourceName(resourceId));
  }
}
