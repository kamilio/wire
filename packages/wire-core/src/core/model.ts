export type ResourceType = "document" | "email-thread" | "message-thread" | "project" | "spreadsheet" | "task" | "transcript";

export type JsonPrimitive = boolean | null | number | string;
export type JsonObject = Readonly<{ [key: string]: JsonValue }>;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export type Identifier = Readonly<{
  service: string;
  identifier: string;
}>;

export type FilesystemLink = Readonly<{
  path: string;
  role: string;
  data: JsonObject;
}>;

export type ResourceData = Readonly<{
  namespace: string;
  key: string;
  value: JsonValue;
}>;

export type Relationship = Readonly<{
  target_id: string;
  type: string;
  data: JsonObject;
}>;

export type Resource = Readonly<{
  id: string;
  type: ResourceType;
  identifiers: readonly Identifier[];
  urls: readonly string[];
  filesystem_links: readonly FilesystemLink[];
  data: readonly ResourceData[];
  relationships: readonly Relationship[];
}>;

export type Source = Readonly<{
  service: string;
  identifier: string;
  type: ResourceType;
  [key: string]: JsonValue;
}>;

export type FetchedDocument = Readonly<{
  title: string;
  markdown: string;
  data: JsonValue;
}>;

export type UploadedDocument = FetchedDocument & Readonly<{
  url: string;
}>;

export type Service<FetchInput = never> = Readonly<{
  name: string;
  matches(url: URL): boolean;
  parse(url: URL): Source;
  fetch(input: FetchInput, url: string, source: Source): Promise<FetchedDocument>;
  synchronize?(input: FetchInput, url: string, source: Source, base: JsonValue, markdown: string, markdownPath: string): Promise<FetchedDocument>;
  upload?(input: FetchInput, markdown: string, markdownPath: string): Promise<UploadedDocument>;
}>;

export type ServiceCatalog<FetchInput = never> = readonly Service<FetchInput>[];

export type Registry = Readonly<{
  put(resource: Resource): Promise<Resource>;
  get(resourceId: string): Promise<Resource>;
  findByIdentifier(service: string, identifier: string): Promise<Resource>;
  findByUrl(url: string): Promise<Resource>;
  findByPath(path: string): Promise<readonly Resource[]>;
  listResources(): Promise<readonly Resource[]>;
  delete(resourceId: string): Promise<void>;
}>;
