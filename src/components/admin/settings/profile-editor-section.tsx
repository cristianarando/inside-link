"use client";

import React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, UserCheck } from "lucide-react";
import { STATUS_COLOR_STYLES } from "@/components/public-links/hero-header";
import { ICON_OPTIONS, LinkIcon } from "@/components/ui/icons";
import { Button, Input } from "@/components/ui/primitives";
import { STATUS_COLORS, type StatusColor } from "@/lib/themes";
import type { SocialLinkItem } from "@/lib/types/link-dto";
import { cn } from "@/lib/utils";

const STATUS_COLOR_LABELS: Record<StatusColor, string> = {
  emerald: "Emerald",
  cyan: "Cyan",
  amber: "Amber",
  rose: "Rose",
  violet: "Violet",
  zinc: "Zinc",
};

const SOCIAL_ICON_OPTIONS = ICON_OPTIONS.filter(
  (opt) =>
    opt.group === "brand" ||
    ["globe", "link", "code-2", "book-open", "file-text", "users"].includes(
      opt.id,
    ),
);

export interface ProfileEditorSectionProps {
  displayName: string;
  headline: string;
  bio: string;
  avatarUrl: string;
  statusText: string;
  statusColor: StatusColor;
  statusHref: string;
  socialLinks: SocialLinkItem[];
  fieldErrors: Record<string, string[]>;
  onChangeField: (
    field:
      | "displayName"
      | "headline"
      | "bio"
      | "avatarUrl"
      | "statusText"
      | "statusHref",
    value: string,
  ) => void;
  onStatusColorChange: (color: StatusColor) => void;
  onSocialLinksChange: (links: SocialLinkItem[]) => void;
}

export function ProfileEditorSection({
  displayName,
  headline,
  bio,
  avatarUrl,
  statusText,
  statusColor,
  statusHref,
  socialLinks,
  fieldErrors,
  onChangeField,
  onStatusColorChange,
  onSocialLinksChange,
}: ProfileEditorSectionProps) {
  const handleAddSocial = () => {
    if (socialLinks.length >= 12) return;
    const id = `social-${Date.now().toString(36)}-${socialLinks.length + 1}`;
    onSocialLinksChange([
      ...socialLinks,
      {
        id,
        platform: "github",
        label: "GitHub",
        url: "https://github.com/",
        icon: "github",
      },
    ]);
  };

  const handleUpdateSocial = (
    index: number,
    patch: Partial<SocialLinkItem>,
  ) => {
    const next = socialLinks.map((item, idx) =>
      idx === index ? { ...item, ...patch } : item,
    );
    onSocialLinksChange(next);
  };

  const handleMoveSocial = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= socialLinks.length) return;
    const next = [...socialLinks];
    const current = next[index];
    const swap = next[target];
    if (!current || !swap) return;
    next[index] = swap;
    next[target] = current;
    onSocialLinksChange(next);
  };

  const handleRemoveSocial = (index: number) => {
    onSocialLinksChange(socialLinks.filter((_, idx) => idx !== index));
  };

  return (
    <section
      id="profile-editor"
      className="obsidian-surface space-y-6 rounded-2xl border border-zinc-800/90 p-5 sm:p-6"
    >
      <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-4">
        <span className="il-accent-pill flex h-9 w-9 items-center justify-center rounded-xl border">
          <UserCheck className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-white">
            Profile &amp; Live Status
          </h2>
          <p className="text-xs text-zinc-400">
            Customize your public hero header, live availability pill, and
            verified social icon strip.
          </p>
        </div>
      </div>

      {/* Identity */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="settings-display-name"
            className="block text-xs font-medium text-zinc-300"
          >
            Display Name *
          </label>
          <Input
            id="settings-display-name"
            value={displayName}
            onChange={(e) => onChangeField("displayName", e.target.value)}
            maxLength={80}
            placeholder="Cristian Arando"
          />
          {fieldErrors.displayName?.[0] ? (
            <p className="text-xs text-red-400">{fieldErrors.displayName[0]}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="settings-headline"
            className="block text-xs font-medium text-zinc-300"
          >
            Headline *
          </label>
          <Input
            id="settings-headline"
            value={headline}
            onChange={(e) => onChangeField("headline", e.target.value)}
            maxLength={120}
            placeholder="Full-Stack & Systems Engineer"
          />
          {fieldErrors.headline?.[0] ? (
            <p className="text-xs text-red-400">{fieldErrors.headline[0]}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="settings-bio"
            className="block text-xs font-medium text-zinc-300"
          >
            Bio
          </label>
          <span className="font-mono text-[10px] text-zinc-500">
            {bio.length}/400
          </span>
        </div>
        <textarea
          id="settings-bio"
          rows={3}
          maxLength={400}
          value={bio}
          onChange={(e) => onChangeField("bio", e.target.value)}
          placeholder="Short introduction displayed on your public directory..."
          className="w-full rounded-xl border border-zinc-800 bg-[var(--il-canvas)]/90 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition focus:border-[rgba(var(--il-accent-rgb),0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--il-accent-rgb),0.55)]"
        />
        {fieldErrors.bio?.[0] ? (
          <p className="text-xs text-red-400">{fieldErrors.bio[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="settings-avatar-url"
          className="block text-xs font-medium text-zinc-300"
        >
          Avatar URL or Relative Path *
        </label>
        <div className="flex items-center gap-3">
          <img
            src={avatarUrl || "/brand/author-avatar.png"}
            alt="Avatar preview"
            width={40}
            height={40}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                "/brand/author-avatar.png";
            }}
            className="h-10 w-10 shrink-0 rounded-xl border border-zinc-700 bg-[var(--il-canvas)] object-cover"
          />
          <Input
            id="settings-avatar-url"
            value={avatarUrl}
            onChange={(e) => onChangeField("avatarUrl", e.target.value)}
            maxLength={500}
            placeholder="/brand/author-avatar.png"
          />
        </div>
        {fieldErrors.avatarUrl?.[0] ? (
          <p className="text-xs text-red-400">{fieldErrors.avatarUrl[0]}</p>
        ) : null}
      </div>

      {/* Live Availability Status */}
      <div className="space-y-4 rounded-xl border border-zinc-800/80 bg-[var(--il-canvas)]/60 p-4">
        <div>
          <h3 className="text-xs font-semibold text-zinc-200">
            Live Availability Status Pill
          </h3>
          <p className="text-[11px] text-zinc-500">
            Leave status text empty to hide the pulsing pill in your Hero
            Header.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="settings-status-text"
              className="block text-xs font-medium text-zinc-300"
            >
              Status Text
            </label>
            <Input
              id="settings-status-text"
              value={statusText}
              onChange={(e) => onChangeField("statusText", e.target.value)}
              maxLength={80}
              placeholder="Open to senior full-stack roles"
            />
            {fieldErrors.statusText?.[0] ? (
              <p className="text-xs text-red-400">
                {fieldErrors.statusText[0]}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="settings-status-href"
              className="block text-xs font-medium text-zinc-300"
            >
              Status Link (optional)
            </label>
            <Input
              id="settings-status-href"
              value={statusHref}
              onChange={(e) => onChangeField("statusHref", e.target.value)}
              maxLength={500}
              placeholder="https://cristianarando.dev"
            />
            {fieldErrors.statusHref?.[0] ? (
              <p className="text-xs text-red-400">
                {fieldErrors.statusHref[0]}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-zinc-300">
            Status Dot Color
          </span>
          <div className="flex flex-wrap gap-2">
            {STATUS_COLORS.map((color) => {
              const active = statusColor === color;
              const style = STATUS_COLOR_STYLES[color];
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => onStatusColorChange(color)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                    active
                      ? "border-[rgba(var(--il-accent-rgb),0.55)] bg-[var(--il-elevated)] text-white"
                      : "border-zinc-800 bg-[var(--il-card)] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                  )}
                >
                  <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                  {STATUS_COLOR_LABELS[color]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Social Links List */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-zinc-200">
              Verified Social Icon Strip ({socialLinks.length}/12)
            </h3>
            <p className="text-[11px] text-zinc-500">
              Add, reorder, or remove social links shown in your Hero Header.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAddSocial}
            disabled={socialLinks.length >= 12}
          >
            <Plus className="h-3.5 w-3.5" />
            Add social link
          </Button>
        </div>

        {fieldErrors.socialLinks?.[0] ? (
          <p className="text-xs text-red-400">{fieldErrors.socialLinks[0]}</p>
        ) : null}

        {socialLinks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-[var(--il-canvas)]/40 p-6 text-center text-xs text-zinc-500">
            No social links configured yet. Click &ldquo;Add social link&rdquo;
            to display social buttons under your bio.
          </div>
        ) : (
          <div className="space-y-2.5">
            {socialLinks.map((item, idx) => (
              <div
                key={item.id}
                className="flex flex-col gap-2.5 rounded-xl border border-zinc-800/90 bg-[var(--il-canvas)]/70 p-3 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-2 sm:w-40">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-[var(--il-card)] text-[var(--il-accent)]">
                    <LinkIcon
                      name={item.icon || item.platform}
                      className="h-4 w-4"
                    />
                  </span>
                  <select
                    aria-label={`Social link ${idx + 1} platform`}
                    value={item.icon || item.platform}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleUpdateSocial(idx, {
                        platform: val,
                        icon: val,
                      });
                    }}
                    className="w-full rounded-lg border border-zinc-800 bg-[var(--il-card)] px-2.5 py-2 text-xs text-zinc-200 focus:outline-none"
                  >
                    {SOCIAL_ICON_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <Input
                  value={item.label}
                  onChange={(e) =>
                    handleUpdateSocial(idx, { label: e.target.value })
                  }
                  placeholder="Label (e.g. GitHub)"
                  aria-label={`Social link ${idx + 1} label`}
                  maxLength={64}
                  className="sm:w-36"
                />

                <Input
                  value={item.url}
                  onChange={(e) =>
                    handleUpdateSocial(idx, { url: e.target.value })
                  }
                  placeholder="https://..."
                  aria-label={`Social link ${idx + 1} URL`}
                  maxLength={500}
                  className="flex-1 font-mono text-xs"
                />

                <div className="flex shrink-0 items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleMoveSocial(idx, -1)}
                    disabled={idx === 0}
                    aria-label={`Move ${item.label || "social link"} up`}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-zinc-800 bg-[var(--il-card)] text-zinc-400 transition hover:text-white disabled:pointer-events-none disabled:opacity-35"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveSocial(idx, 1)}
                    disabled={idx === socialLinks.length - 1}
                    aria-label={`Move ${item.label || "social link"} down`}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-zinc-800 bg-[var(--il-card)] text-zinc-400 transition hover:text-white disabled:pointer-events-none disabled:opacity-35"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveSocial(idx)}
                    aria-label={`Remove ${item.label || "social link"}`}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-zinc-800 bg-[var(--il-card)] text-zinc-400 transition hover:border-red-500/40 hover:bg-red-950/40 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
