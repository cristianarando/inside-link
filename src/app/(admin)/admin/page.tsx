import React from "react";
import { InfiniteLinkGrid } from "@/components/admin/infinite-link-grid";
import { getCanonicalHost } from "@/lib/env";
import { linkService } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const initialPage = await linkService.listLinksPaginated({ limit: 12 });
  const canonicalHost = getCanonicalHost();

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Links &amp; Micro-Landings Manager
        </h1>
        <p className="text-xs text-zinc-400">
          Manage direct redirects, project HUB pages, and public directory
          visibility on{" "}
          <span className="font-mono text-zinc-300">{canonicalHost}</span>.
        </p>
      </div>

      <InfiniteLinkGrid initialPage={initialPage} />
    </section>
  );
}
