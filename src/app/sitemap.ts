import type { MetadataRoute } from "next";
import { getCanonicalBaseUrl } from "@/server/og/presentation";
import { linkService } from "@/server/services";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getCanonicalBaseUrl().replace(/\/+$/, "");
  const rootEntry: MetadataRoute.Sitemap[number] = {
    url: baseUrl,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 1,
  };

  try {
    const hubLinks = await linkService.listSitemapHubLinks();
    const hubEntries: MetadataRoute.Sitemap = hubLinks.map((item) => ({
      url: `${baseUrl}/${item.slug}`,
      lastModified: item.updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

    return [rootEntry, ...hubEntries];
  } catch {
    return [rootEntry];
  }
}
