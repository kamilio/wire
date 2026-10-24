import { slackService } from "./slack.js";

export { slackService, markdownToSlackBlocks, slackBlocksToMarkdown, sendSlackMessage, type SlackSentMessage } from "./slack.js";
export const slackProvider = Object.freeze({
  services: [slackService] as const,
});
