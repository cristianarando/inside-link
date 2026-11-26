"use client";

import React, { useState } from "react";
import type { HubLinkItem } from "@/lib/validations/link.schema";
import { HubBlockRenderer } from "./hub-landing-view";
import type { PinUnlockRenderInput } from "./pin-unlock-html";

function isSafeHttpUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function trackHubSubLinkClick(slug: string, subLinkId: string): void {
  if (!subLinkId || !slug) return;
  const endpoint = `/api/v1/slug/${encodeURIComponent(slug)}/hub-click`;
  const payload = JSON.stringify({ subLinkId });
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    navigator.sendBeacon(
      endpoint,
      new Blob([payload], { type: "application/json" }),
    );
    return;
  }
  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}

export function PinUnlockForm({
  slug,
  title,
  description,
}: PinUnlockRenderInput) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [unlockedHubLinks, setUnlockedHubLinks] = useState<
    HubLinkItem[] | null
  >(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const query = typeof window !== "undefined" ? window.location.search : "";
      const response = await fetch(
        `/api/v1/slug/${encodeURIComponent(slug)}/unlock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin, query }),
        },
      );
      const json = (await response.json()) as {
        data?: {
          type: "DIRECT" | "HUB";
          isCloaked?: boolean;
          destinationUrl?: string | null;
          hubLinks?: HubLinkItem[] | null;
        };
        error?: { message: string };
      };
      if (!response.ok || !json.data) {
        setError(json.error?.message ?? "Incorrect PIN");
        return;
      }
      if (json.data.type === "DIRECT") {
        if (json.data.isCloaked) {
          window.location.reload();
          return;
        }
        if (isSafeHttpUrl(json.data.destinationUrl)) {
          window.location.assign(json.data.destinationUrl);
          return;
        }
      }
      if (json.data.type === "HUB" && Array.isArray(json.data.hubLinks)) {
        setUnlockedHubLinks(json.data.hubLinks);
      }
    } catch {
      setError("Could not verify PIN.");
    } finally {
      setSubmitting(false);
    }
  };

  if (unlockedHubLinks) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
        {description ? (
          <p className="text-sm text-zinc-400">{description}</p>
        ) : null}
        <div className="flex flex-col gap-2.5 pt-1">
          {unlockedHubLinks.map((item) => (
            <HubBlockRenderer
              key={item.id}
              item={item}
              onSubLinkClick={(subLinkId) =>
                trackHubSubLinkClick(slug, subLinkId)
              }
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
      {description ? (
        <p className="text-sm text-zinc-400">{description}</p>
      ) : null}
      <input
        type="password"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="Enter PIN"
        required
        minLength={4}
        maxLength={64}
        className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-center text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
      />
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="h-10 w-full rounded-xl bg-emerald-500 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
      >
        {submitting ? "Verifying..." : "Unlock link"}
      </button>
    </form>
  );
}
