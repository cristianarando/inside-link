"use client";

import React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Code2,
  CopyPlus,
  FolderGit2,
  Link2,
  Music,
  Plus,
  Trash2,
} from "lucide-react";
import { BrandYouTubeSvg, ICON_OPTIONS } from "@/components/ui/icons";
import {
  Badge,
  Button,
  Input,
  type BadgeVariant,
} from "@/components/ui/primitives";
import {
  parseGitHubRepoUrl,
  parseSpotifyEmbed,
  parseYouTubeEmbed,
} from "@/lib/embed-parsers";
import {
  CALLOUT_TONES,
  HUB_BLOCK_KINDS,
  type CalloutTone,
  type HubBlockKind,
  type HubLinkItem,
} from "@/lib/validations/link.schema";

export interface HubLinksEditorProps {
  items: HubLinkItem[];
  onChange: (next: HubLinkItem[]) => void;
}

const KIND_META: Record<
  HubBlockKind,
  {
    label: string;
    shortLabel: string;
    badgeVariant: BadgeVariant;
    defaultIcon: string;
  }
> = {
  button: {
    label: "Action Button",
    shortLabel: "Button",
    badgeVariant: "emerald",
    defaultIcon: "external-link",
  },
  "github-repo": {
    label: "GitHub Repo Card",
    shortLabel: "GitHub",
    badgeVariant: "default",
    defaultIcon: "github",
  },
  youtube: {
    label: "YouTube Facade",
    shortLabel: "YouTube",
    badgeVariant: "danger",
    defaultIcon: "youtube",
  },
  spotify: {
    label: "Spotify Embed",
    shortLabel: "Spotify",
    badgeVariant: "success",
    defaultIcon: "music",
  },
  code: {
    label: "Code Snippet",
    shortLabel: "Code",
    badgeVariant: "sky",
    defaultIcon: "terminal",
  },
  callout: {
    label: "Callout Banner",
    shortLabel: "Callout",
    badgeVariant: "amber",
    defaultIcon: "sparkles",
  },
};

function makeBlockId(prefix = "hub"): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${Date.now().toString(36).slice(-6)}-${rand}`.slice(0, 32);
}

function createEmptyBlock(kind: HubBlockKind): HubLinkItem {
  const meta = KIND_META[kind];
  if (kind === "code") {
    return {
      id: makeBlockId("code"),
      kind,
      label: "Quickstart Command",
      sublabel: null,
      icon: meta.defaultIcon,
      variant: "secondary",
      codeLanguage: "bash",
      codeText: "npx create-next-app@latest",
    };
  }
  if (kind === "callout") {
    return {
      id: makeBlockId("note"),
      kind,
      label: "Heads up",
      sublabel: "Important release note or announcement.",
      icon: meta.defaultIcon,
      variant: "secondary",
      calloutTone: "info",
    };
  }
  return {
    id: makeBlockId("hub"),
    kind,
    label: "",
    sublabel: null,
    url: "",
    icon: meta.defaultIcon,
    variant: kind === "button" ? "secondary" : "primary",
  };
}

function renderKindIcon(kind: HubBlockKind) {
  switch (kind) {
    case "github-repo":
      return <FolderGit2 className="h-3 w-3" />;
    case "youtube":
      return <BrandYouTubeSvg className="h-3 w-3" />;
    case "spotify":
      return <Music className="h-3 w-3" />;
    case "code":
      return <Code2 className="h-3 w-3" />;
    case "callout":
      return <AlertTriangle className="h-3 w-3" />;
    case "button":
    default:
      return <Link2 className="h-3 w-3" />;
  }
}

export function HubLinksEditor({ items, onChange }: HubLinksEditorProps) {
  const handleAdd = (kind: HubBlockKind = "button") => {
    if (items.length >= 12) return;
    onChange([...items, createEmptyBlock(kind)]);
  };

  const handleUpdate = (index: number, patch: Partial<HubLinkItem>) => {
    onChange(
      items.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    );
  };

  const handleKindChange = (index: number, nextKind: HubBlockKind) => {
    const existing = items[index];
    if (!existing) return;
    const meta = KIND_META[nextKind];
    const base: HubLinkItem = {
      ...existing,
      kind: nextKind,
      icon: meta.defaultIcon,
    };

    if (nextKind === "code") {
      base.url = undefined;
      base.codeLanguage = existing.codeLanguage || "typescript";
      base.codeText = existing.codeText || "";
      base.calloutTone = null;
    } else if (nextKind === "callout") {
      base.url = undefined;
      base.calloutTone = existing.calloutTone || "info";
      base.sublabel = existing.sublabel || "";
      base.codeText = null;
      base.codeLanguage = null;
    } else {
      base.url = existing.url ?? "";
      base.codeText = null;
      base.codeLanguage = null;
      base.calloutTone = null;
    }

    handleUpdate(index, base);
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const current = next[index]!;
    next[index] = next[target]!;
    next[target] = current;
    onChange(next);
  };

  const handleDuplicate = (index: number) => {
    if (items.length >= 12) return;
    const source = items[index];
    if (!source) return;
    const clone: HubLinkItem = {
      ...source,
      id: makeBlockId("hub"),
      label: `${source.label} (Copy)`.slice(0, 80),
    };
    const next = [...items];
    next.splice(index + 1, 0, clone);
    onChange(next);
  };

  const handleRemove = (index: number) => {
    if (items.length <= 1) return;
    onChange(items.filter((_, idx) => idx !== index));
  };

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800/90 bg-[#111114]/70 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-300">
          Rich HUB Blocks ({items.length}/12 · minimum 1)
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {HUB_BLOCK_KINDS.map((kind) => (
            <Button
              key={kind}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleAdd(kind)}
              disabled={items.length >= 12}
              className="px-2 py-1 text-[11px]"
            >
              <Plus className="h-3 w-3 text-emerald-400" />
              {KIND_META[kind].shortLabel}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => {
          const kind: HubBlockKind = item.kind ?? "button";
          const meta = KIND_META[kind];

          const githubInfo =
            kind === "github-repo" && item.url
              ? parseGitHubRepoUrl(item.url)
              : null;
          const youtubeInfo =
            kind === "youtube" && item.url ? parseYouTubeEmbed(item.url) : null;
          const spotifyInfo =
            kind === "spotify" && item.url ? parseSpotifyEmbed(item.url) : null;

          return (
            <div
              key={item.id}
              className="space-y-2.5 rounded-xl border border-zinc-800 bg-[#09090b]/85 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/70 pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant={meta.badgeVariant}>
                    {renderKindIcon(kind)}
                    {meta.label}
                  </Badge>
                  <select
                    value={kind}
                    onChange={(e) =>
                      handleKindChange(idx, e.target.value as HubBlockKind)
                    }
                    aria-label={`Block ${idx + 1} kind`}
                    className="h-7 rounded-lg border border-zinc-800 bg-[#111114] px-2 text-[11px] text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
                  >
                    {HUB_BLOCK_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_META[k].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0}
                    title="Move up"
                    aria-label={`Move block ${idx + 1} up`}
                    className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === items.length - 1}
                    title="Move down"
                    aria-label={`Move block ${idx + 1} down`}
                    className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicate(idx)}
                    disabled={items.length >= 12}
                    title="Duplicate block"
                    aria-label={`Duplicate block ${idx + 1}`}
                    className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  >
                    <CopyPlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    disabled={items.length <= 1}
                    title="Remove block"
                    aria-label={`Remove block ${idx + 1}`}
                    className="cursor-pointer rounded-lg p-1.5 text-zinc-500 transition hover:bg-red-950/50 hover:text-red-300 disabled:pointer-events-none disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <div
                  className={
                    kind === "code" || kind === "callout"
                      ? "sm:col-span-6"
                      : "sm:col-span-5"
                  }
                >
                  <Input
                    required
                    maxLength={80}
                    placeholder={
                      kind === "code"
                        ? "Snippet title (e.g. Install CLI)"
                        : kind === "callout"
                          ? "Callout heading"
                          : "Label (e.g. Live Demo)"
                    }
                    aria-label={`Block ${idx + 1} label`}
                    value={item.label}
                    onChange={(e) =>
                      handleUpdate(idx, { label: e.target.value })
                    }
                    className="text-xs"
                  />
                </div>

                {kind === "button" ||
                kind === "github-repo" ||
                kind === "youtube" ||
                kind === "spotify" ? (
                  <div className="sm:col-span-7">
                    <Input
                      required
                      type="url"
                      placeholder={
                        kind === "github-repo"
                          ? "https://github.com/owner/repo"
                          : kind === "youtube"
                            ? "https://www.youtube.com/watch?v=..."
                            : kind === "spotify"
                              ? "https://open.spotify.com/track/..."
                              : "https://..."
                      }
                      aria-label={`Block ${idx + 1} URL`}
                      value={item.url ?? ""}
                      onChange={(e) =>
                        handleUpdate(idx, { url: e.target.value })
                      }
                      className="font-mono text-xs"
                    />
                  </div>
                ) : kind === "code" ? (
                  <div className="sm:col-span-6">
                    <Input
                      maxLength={24}
                      placeholder="Language (e.g. typescript, bash, sql)"
                      aria-label={`Block ${idx + 1} code language`}
                      value={item.codeLanguage ?? ""}
                      onChange={(e) =>
                        handleUpdate(idx, { codeLanguage: e.target.value })
                      }
                      className="font-mono text-xs"
                    />
                  </div>
                ) : (
                  <div className="sm:col-span-6">
                    <select
                      value={item.calloutTone ?? "info"}
                      onChange={(e) =>
                        handleUpdate(idx, {
                          calloutTone: e.target.value as CalloutTone,
                        })
                      }
                      aria-label={`Block ${idx + 1} callout variant`}
                      className="h-9 w-full rounded-xl border border-zinc-800 bg-[#111114] px-3 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
                    >
                      {CALLOUT_TONES.map((tone) => (
                        <option key={tone} value={tone}>
                          Variant:{" "}
                          {tone.charAt(0).toUpperCase() + tone.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {kind === "code" ? (
                <textarea
                  required
                  maxLength={1000}
                  rows={3}
                  placeholder="Paste code snippet..."
                  aria-label={`Block ${idx + 1} code text`}
                  value={item.codeText ?? ""}
                  onChange={(e) =>
                    handleUpdate(idx, { codeText: e.target.value })
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-[#111114]/90 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/60 focus:outline-none"
                />
              ) : (
                <Input
                  required={kind === "callout"}
                  maxLength={120}
                  placeholder={
                    kind === "callout"
                      ? "Callout description text (required, max 120 chars)"
                      : "Optional sublabel (e.g. Read the architecture notes)"
                  }
                  aria-label={`Block ${idx + 1} sublabel`}
                  value={item.sublabel ?? ""}
                  onChange={(e) =>
                    handleUpdate(idx, {
                      sublabel: e.target.value ? e.target.value : null,
                    })
                  }
                  className="text-xs"
                />
              )}

              {kind === "github-repo" && item.url && (
                <p
                  className={`font-mono text-[11px] ${
                    githubInfo ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {githubInfo
                    ? `Detected repository: ${githubInfo.fullName}`
                    : "Enter a valid https://github.com/owner/repo URL."}
                </p>
              )}
              {kind === "youtube" && item.url && (
                <p
                  className={`font-mono text-[11px] ${
                    youtubeInfo ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {youtubeInfo
                    ? `YouTube video ID: ${youtubeInfo.videoId}`
                    : "Enter a valid YouTube watch, short, live, or youtu.be URL."}
                </p>
              )}
              {kind === "spotify" && item.url && (
                <p
                  className={`font-mono text-[11px] ${
                    spotifyInfo ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {spotifyInfo
                    ? `Spotify ${spotifyInfo.entityType}: ${spotifyInfo.entityId}`
                    : "Enter a valid open.spotify.com track, album, playlist, episode, show, or artist URL."}
                </p>
              )}

              {kind === "button" && (
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <select
                    value={item.icon}
                    onChange={(e) =>
                      handleUpdate(idx, { icon: e.target.value })
                    }
                    aria-label={`Block ${idx + 1} icon`}
                    className="h-8 rounded-lg border border-zinc-800 bg-[#111114] px-2.5 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
                  >
                    {ICON_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={item.variant}
                    onChange={(e) =>
                      handleUpdate(idx, {
                        variant: e.target.value as HubLinkItem["variant"],
                      })
                    }
                    aria-label={`Block ${idx + 1} style`}
                    className="h-8 rounded-lg border border-zinc-800 bg-[#111114] px-2.5 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
                  >
                    <option value="primary">Primary (Accent)</option>
                    <option value="secondary">Secondary</option>
                    <option value="outline">Outline</option>
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
