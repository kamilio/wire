import { slackService } from "./slack.js";
export { slackService, markdownToSlackBlocks, slackBlocksToMarkdown, sendSlackMessage, editSlackMessage, lookupSlackUsers } from "./slack.js";
export const slackProvider = Object.freeze({
    services: [slackService],
});
//# sourceMappingURL=index.js.map