import { scrapeZoom, zoomHubService } from "./zoom-hub.js";

export { zoomHubService } from "./zoom-hub.js";
export const zoomProvider = Object.freeze({
  scrape: scrapeZoom,
  services: [zoomHubService] as const,
});
