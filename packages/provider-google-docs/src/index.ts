import { googleDocsService } from "./google-docs.js";

export { googleDocsService } from "./google-docs.js";
export const googleDocsProvider = Object.freeze({
  services: [googleDocsService] as const,
});
