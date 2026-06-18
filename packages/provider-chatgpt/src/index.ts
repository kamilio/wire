import { chatgptService } from "./chatgpt.js";

export { chatgptService } from "./chatgpt.js";
export const chatgptProvider = Object.freeze({
  services: [chatgptService] as const,
});
