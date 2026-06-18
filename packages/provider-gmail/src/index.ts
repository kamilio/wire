import { gmailService } from "./gmail.js";

export { gmailService } from "./gmail.js";
export const gmailProvider = Object.freeze({
  services: [gmailService] as const,
});
