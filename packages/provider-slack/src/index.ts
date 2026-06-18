import { slackService } from "./slack.js";

export { slackService } from "./slack.js";
export const slackProvider = Object.freeze({
  services: [slackService] as const,
});
