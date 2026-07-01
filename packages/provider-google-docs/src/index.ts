import { googleDocsService } from "./google-docs.js";
import { googleFormsService } from "./google-forms.js";

export { googleDocsService } from "./google-docs.js";
export { googleFormsService } from "./google-forms.js";
export const googleDocsProvider = Object.freeze({
  services: [googleFormsService, googleDocsService] as const,
});
