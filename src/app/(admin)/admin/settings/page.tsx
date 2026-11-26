import React from "react";
import type { Metadata } from "next";
import { SettingsStudio } from "@/components/admin/settings/settings-studio";
import type { SiteSettingsDTO } from "@/lib/types/link-dto";
import { buildDefaultSiteSettings, settingsService } from "@/server/services";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customize & Settings",
};

async function getSafeSiteSettings(): Promise<SiteSettingsDTO> {
  try {
    return await settingsService.getSiteSettings();
  } catch {
    return buildDefaultSiteSettings();
  }
}

export default async function AdminSettingsPage() {
  const initialSettings = await getSafeSiteSettings();

  return (
    <section className="space-y-6">
      <SettingsStudio initialSettings={initialSettings} />
    </section>
  );
}
