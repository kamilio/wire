import { createServiceRegistry, type RuntimeCapabilities } from "wire-core";
import { asanaProvider } from "provider-asana";
import { chatgptProvider } from "provider-chatgpt";
import { gmailProvider } from "provider-gmail";
import { googleDocsProvider } from "provider-google-docs";
import { notionProvider } from "provider-notion";
import { slackProvider } from "provider-slack";
import { zoomProvider } from "provider-zoom";

export const serviceCatalog = createServiceRegistry<RuntimeCapabilities>()
  .use(zoomProvider)
  .use(notionProvider)
  .use(slackProvider)
  .use(chatgptProvider)
  .use(googleDocsProvider)
  .use(gmailProvider)
  .use(asanaProvider)
  .catalog();
